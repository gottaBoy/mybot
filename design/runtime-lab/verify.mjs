import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.env.PLAYWRIGHT_MODULE) throw new Error("Set PLAYWRIGHT_MODULE to an external Playwright/Playwright Core index.mjs");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const directory = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(directory, "evidence");
await mkdir(output, { recursive: true });
const report = { date: new Date().toISOString(), scope: "Local file fixture preview; no upstream/model execution",
  interactions: [], viewports: [], errors: [], externalRequests: [] };
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    headless: true, args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.on("pageerror", error => report.errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
  await page.route(/^https?:\/\//, async route => {
    report.externalRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto(pathToFileURL(path.join(directory, "index.html")).href);
  await page.getByRole("heading", { name: "执行器对比", exact: true }).waitFor();
  assert.equal(await page.locator(".lane").count(), 3);
  assert.match(await page.locator(".mock-badge").innerText(), /MOCK/);
  const goal = await page.locator("#task").inputValue();
  const snapshot = () => page.evaluate(() => window.__runtimeLab.getSnapshot());
  async function play(scenario, expected) {
    await page.locator("#scenario").selectOption(scenario);
    await page.locator("#run-button").click();
    await page.waitForFunction(() => {
      const data = window.__runtimeLab.getSnapshot();
      return Object.keys(data.runs).length > 0 && !data.playing;
    });
    const data = await snapshot();
    assert.equal(data.fixtureOnly, true);
    assert.equal(data.upstreamDriversExecuted, false);
    assert.equal(data.productionConfigurationChanged, false);
    assert.equal(data.modelRequests, 0);
    assert.equal(data.toolExecutions, 0);
    assert.equal(data.usage, null);
    assert.ok(Object.values(data.runs).every(run => run.status === expected));
    return data;
  }
  await page.locator("[data-speed='2']").click();
  for (const [scenario, expected] of [
    ["success", "succeeded"], ["cancel", "canceled"], ["disconnect", "interrupted"],
    ["failure", "failed"], ["denied", "rejected"],
  ]) {
    await play(scenario, expected);
    report.interactions.push(`${scenario}-fixture-no-provider-or-tools`);
  }
  await page.locator("#scenario").selectOption("success");
  await page.locator("[data-speed='1']").click();
  await page.locator("#run-button").click();
  await page.waitForFunction(() => Object.values(window.__runtimeLab.getSnapshot().runs).some(row => row.status === "running"));
  await page.locator("#cancel-button").click();
  const canceled = await snapshot();
  assert.ok(Object.values(canceled.runs).every(run => run.status === "canceled"));
  await page.waitForTimeout(850);
  assert.deepEqual((await snapshot()).runs, canceled.runs);
  report.interactions.push("manual-cancel-and-no-late-replay");

  for (const id of ["codex", "pi", "dsh"]) await page.locator(`[data-select="${id}"]`).uncheck();
  assert.equal(await page.locator("#run-button").isDisabled(), true);
  await page.locator('[data-select="pi"]').check();
  await page.locator("#task").fill("");
  await page.locator("#run-button").click();
  assert.equal(await page.locator("#task").getAttribute("aria-invalid"), "true");
  await page.locator("#task").fill('<img src="https://fixture.invalid/never" onerror="alert(1)">');
  await page.locator("[data-speed='2']").click();
  await play("success", "succeeded");
  assert.deepEqual((await snapshot()).selectedAdapters, ["pi"]);
  await page.locator('[data-inspect="pi"]').click();
  await page.locator("#tab-result").click();
  assert.match(await page.locator("#inspector-content").innerText(), /<img src=/);
  assert.equal(await page.locator("#inspector-content img").count(), 0);
  report.interactions.push("empty-input-single-selection-and-html-escaping");

  await page.locator("#tab-events").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#tab-native").getAttribute("aria-selected"), "true");
  assert.match(await page.locator("#inspector-content").innerText(), /agent_settled/);
  await page.keyboard.press("End");
  assert.equal(await page.locator("#tab-result").getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home");
  assert.equal(await page.locator("#tab-events").getAttribute("aria-selected"), "true");
  report.interactions.push("keyboard-tabs-and-native-fixture-inspection");

  const downloaded = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), "mybot-runtime-mock.json");
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.fixtureOnly, true);
  assert.equal(exported.upstreamDriversExecuted, false);
  assert.equal(exported.modelRequests, 0);
  report.interactions.push("downloaded-json-preserves-mock-provenance");

  await page.locator("#scope-button").click();
  assert.equal(await page.locator("#scope-dialog").evaluate(node => node.open), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#scope-dialog").evaluate(node => node.open), false);
  report.interactions.push("scope-dialog-and-escape");

  await page.locator("#task").fill(goal);
  for (const id of ["codex", "pi", "dsh"]) await page.locator(`[data-select="${id}"]`).check();
  await play("success", "succeeded");
  await page.locator('[data-inspect="pi"]').click();
  await page.locator("#tab-events").click();
  await page.waitForFunction(() => !document.querySelector("#toast").classList.contains("show"));
  await page.waitForTimeout(180);
  for (const [name, width, height] of [
    ["wide", 1920, 1080], ["desktop", 1440, 1000], ["compact", 1024, 900],
    ["tablet", 768, 1024], ["mobile", 390, 844], ["small-mobile", 320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    if (width < 600) await page.locator('button[data-pane="comparison"]').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(image => !image.complete || !image.naturalWidth).map(image => image.src),
      clippedButtons: [...document.querySelectorAll("button")].filter(button => {
        const box = button.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && button.scrollWidth > button.clientWidth + 2;
      }).map(button => button.textContent.trim()),
    }));
    assert.ok(layout.scrollWidth <= width + 1, `${name}: horizontal overflow`);
    assert.deepEqual(layout.brokenImages, [], `${name}: image`);
    assert.deepEqual(layout.clippedButtons, [], `${name}: clipped buttons`);
    const screenshot = `${name}-comparison.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    report.viewports.push({ name, ...layout, screenshot, passed: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-inspect="pi"]').click();
  assert.equal(await page.locator(".inspector").isVisible(), true);
  assert.equal(await page.locator(".lanes").isVisible(), false);
  await page.locator("#tab-result").click();
  assert.match(await page.locator("#inspector-content").innerText(), /预设演示文本/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "mobile-inspector.png"), fullPage: true });
  report.interactions.push("mobile-pane-and-result");

  for (const view of ["capabilities", "research", "compare"]) {
    await page.locator(`.mobile-nav [data-view="${view}"]`).click();
    await page.locator(`#${view}-view`).waitFor({ state: "visible" });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.sidebar [data-view="research"]').click();
  await page.locator("#research-view").waitFor({ state: "visible" });
  assert.match(await page.locator("#research-list").innerText(), /HuLa/);
  await page.screenshot({ path: path.join(output, "desktop-research.png"), fullPage: true });
  await page.locator('.sidebar [data-view="capabilities"]').click();
  await page.locator("#capabilities-view").waitFor({ state: "visible" });
  assert.match(await page.locator(".capability-table").innerText(), /未接入/);
  await page.screenshot({ path: path.join(output, "desktop-capabilities.png"), fullPage: true });
  await page.locator('.sidebar [data-view="compare"]').click();
  await page.locator("#compare-view").waitFor({ state: "visible" });
  await page.locator("#reset-button").click();
  assert.deepEqual((await snapshot()).runs, {});
  assert.equal(await page.locator("#cancel-button").isDisabled(), true);
  report.interactions.push("navigation-capability-evidence-and-reset");
  await page.reload();
  assert.deepEqual((await snapshot()).runs, {});
  report.interactions.push("reload-clears-in-memory-fixtures");
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  if (browser) await browser.close();
}
report.complete = report.errors.length === 0 && report.viewports.length === 6 && report.interactions.length === 13;
await writeFile(path.join(output, "verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (!report.complete) process.exitCode = 1;
