import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : "playwright");
const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({
  ...(existsSync(executablePath) ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox"],
});
const screens = [
  "task", "calls", "call-detail", "workbench", "project", "dispatch", "delegation",
  "artifacts", "tests", "approval", "recovery", "audit", "setup",
  "new-task", "empty", "queued", "offline", "budget",
];
const viewports = [
  { name: "wide", width: 1920, height: 1080 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1024, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "small", width: 320, height: 740 },
];
const shots = new Set([
  "desktop/task", "desktop/calls", "desktop/call-detail", "desktop/workbench",
  "desktop/dispatch", "desktop/artifacts", "desktop/tests", "desktop/approval",
  "mobile/task", "mobile/calls", "mobile/call-detail", "mobile/dispatch",
  "mobile/approval", "mobile/recovery",
]);
const out = path.join(root, "evidence");
await mkdir(path.join(out, "screenshots"), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  kind: "static-visual-review-v2",
  testedFile: "design/review-v2/index.html",
  browserVersion: browser.version(),
  viewports,
  cases: [],
  interactions: [],
  screenshots: [],
  errors: [],
  externalRequests: [],
};
const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") report.errors.push(message.text()); });
await page.route(/^https?:\/\//, async (route) => {
  report.externalRequests.push(route.request().url());
  await route.abort();
});
const file = pathToFileURL(path.join(root, "index.html")).href;
async function open(screen) {
  await page.goto(`${file}#${screen}`);
  await page.waitForFunction((id) => document.body.dataset.screen === id, screen);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (img) => img.decode().catch(() => {})));
  });
}
async function check(name, fn) {
  try { await fn(); report.interactions.push({ name, passed: true }); }
  catch (error) { report.interactions.push({ name, passed: false }); report.errors.push(`${name}: ${error.stack || error}`); }
}
try {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const screen of screens) {
      await open(screen);
      const layout = await page.evaluate(() => {
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const brokenImages = Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.getAttribute("src"));
        const clippedControls = Array.from(document.querySelectorAll("button, .button, .status"))
          .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 2).map((el) => el.textContent.trim());
        const marker = document.querySelector(".review-label");
        const primary = document.querySelector(".workstream p") || document.querySelector("main p");
        return {
          viewport: window.innerWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          brokenImages,
          clippedControls,
          headings: document.querySelectorAll("main h1").length,
          mainTextLength: document.querySelector("main").textContent.trim().length,
          markerVisible: visible(marker) && marker.textContent.includes("静态"),
          primaryTextSize: primary ? getComputedStyle(primary).fontSize : null,
        };
      });
      const failures = [];
      if (layout.documentWidth > layout.viewport + 1) failures.push("page-horizontal-overflow");
      if (layout.brokenImages.length) failures.push("broken-images");
      if (layout.clippedControls.length) failures.push("clipped-controls");
      if (layout.headings !== 1 || layout.mainTextLength < 50) failures.push("invalid-main");
      if (!layout.markerVisible) failures.push("missing-visible-static-marker");
      if (screen === "task" && parseFloat(layout.primaryTextSize) < 13) failures.push("task-text-too-small");
      report.cases.push({ viewport: viewport.name, screen, passed: !failures.length, failures, ...layout });
      if (shots.has(`${viewport.name}/${screen}`)) {
        const name = `${viewport.name}-${screen}.png`;
        await page.screenshot({ path: path.join(out, "screenshots", name), fullPage: true });
        report.screenshots.push(`screenshots/${name}`);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await check("default-opens-task-studio", async () => {
    await page.goto(file);
    await page.waitForFunction(() => document.body.dataset.screen === "task");
    assert.equal(await page.locator(".evidence-inspector").isVisible(), true);
    assert.equal(await page.locator(".work-pane").isVisible(), true);
  });
  await check("evidence-tabs-and-plan-details", async () => {
    await open("task");
    await page.locator('[data-evidence-tab="tests"]').click();
    assert.equal(await page.locator("#evidence-tests").isVisible(), true);
    assert.equal(await page.locator("#evidence-code").isVisible(), false);
    assert.equal(await page.locator(".studio-tests .test-row-failed").count(), 1);
    await page.locator('[data-evidence-tab="code"]').click();
    assert.equal(await page.locator(".studio-code").isVisible(), true);
    await page.locator('[data-evidence-tab="code"]').focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#evidence-tests").isVisible(), true);
    assert.equal(await page.locator('[data-evidence-tab="tests"]').getAttribute("tabindex"), "0");
    await page.keyboard.press("Home");
    assert.equal(await page.locator("#evidence-code").isVisible(), true);
    await page.locator(".compact-plan summary").click();
    assert.equal(await page.locator(".compact-plan-rows a").count(), 5);
    assert.equal(await page.locator(".compact-plan-rows").isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "应用变更" }).isDisabled(), true);
  });
  await check("call-filters-and-failed-detail", async () => {
    await open("calls");
    for (const [filter, rows] of [["failed", 1], ["model", 4], ["tool", 1], ["all", 5]]) {
      await page.locator(`[data-call-filter="${filter}"]`).click();
      assert.equal(await page.locator(".calls-table tbody tr").count(), rows);
      assert.equal(await page.locator(`[data-call-filter="${filter}"]`).getAttribute("aria-pressed"), "true");
    }
    await page.locator('td a[href="#call-detail"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "call-detail");
    assert.equal(await page.locator(".inspector-title .mono").innerText(), "mc-023");
  });
  await check("separate-graphs", async () => {
    await open("dispatch");
    await page.locator('.segmented a[href="#delegation"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "delegation");
    assert.equal(await page.locator(".delegation-diagram").isVisible(), true);
    assert.equal(await page.locator(".dependency-diagram").count(), 0);
  });
  await check("failed-tests-block-apply", async () => {
    await open("tests");
    assert.equal(await page.locator(".test-row-failed").count(), 1);
    assert.equal(await page.getByRole("button", { name: "应用变更" }).isDisabled(), true);
  });
  await check("approval-is-independent-static-snapshot", async () => {
    await open("approval");
    await page.locator(".approval-diff summary").click();
    assert.equal(await page.locator(".approval-diff").getAttribute("open"), "");
    assert.match(await page.locator("#review-footer").innerText(), /Run 03/);
    assert.equal(await page.getByRole("button", { name: "批准本次", exact: true }).first().isDisabled(), true);
  });
  await check("mobile-work-evidence-switch", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open("task");
    assert.equal(await page.locator(".work-pane").isVisible(), true);
    assert.equal(await page.locator(".evidence-inspector").isVisible(), false);
    await page.locator('[data-studio-view="evidence"]').click();
    assert.equal(await page.locator(".work-pane").isVisible(), false);
    assert.equal(await page.locator(".evidence-inspector").isVisible(), true);
    const screenshot = "screenshots/mobile-task-evidence.png";
    await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
    report.screenshots.push(screenshot);
    await page.locator('[data-studio-view="work"]').click();
    assert.equal(await page.locator(".work-pane").isVisible(), true);
  });
  await check("mobile-list-and-navigation-focus", async () => {
    await open("dispatch");
    assert.equal(await page.locator(".graph-surface").isVisible(), false);
    assert.equal(await page.locator(".mobile-dependency-list").isVisible(), true);
    await page.getByRole("button", { name: "打开导航" }).click();
    assert.equal(await page.locator("#navigation-dialog").evaluate((dialog) => dialog.open), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#navigation-dialog").evaluate((dialog) => dialog.open), false);
    assert.equal(await page.getByRole("button", { name: "打开导航" }).evaluate((el) => document.activeElement === el), true);
  });
  await check("unknown-outcome-cannot-retry", async () => {
    await open("recovery");
    assert.match(await page.locator(".blocked-action").innerText(), /先确认/);
    assert.equal(await page.locator("main button:not(:disabled)").count(), 0);
    assert.equal(report.externalRequests.length, 0);
  });
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
}
report.summary = {
  total: report.cases.length,
  passed: report.cases.filter((item) => item.passed).length,
  failed: report.cases.filter((item) => !item.passed).length,
  interactionChecks: report.interactions.length,
  failedInteractions: report.interactions.filter((item) => !item.passed).length,
  errors: report.errors.length,
  externalRequests: report.externalRequests.length,
  complete: report.cases.length === screens.length * viewports.length && report.interactions.length === 9,
};
await writeFile(path.join(out, "verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed || report.summary.errors || !report.summary.complete) process.exitCode = 1;
