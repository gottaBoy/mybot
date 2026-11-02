import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(
  playwrightModule ? pathToFileURL(path.resolve(playwrightModule)).href : "playwright"
);
const executablePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const browser = await chromium.launch({
  ...(existsSync(executablePath) ? { executablePath } : {}),
  headless: true,
  args: ["--no-sandbox"],
});

const screens = [
  "workbench", "project", "task", "dispatch", "delegation", "calls",
  "call-detail", "artifacts", "tests", "approval", "recovery", "audit",
  "setup", "new-task", "empty", "queued", "offline", "budget",
];
const viewports = [
  { name: "wide", width: 1920, height: 1080 },
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1024, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
  { name: "small", width: 320, height: 740 },
];
const screenshotCases = new Set([
  "desktop/workbench", "desktop/project", "desktop/task",
  "desktop/dispatch", "desktop/delegation", "desktop/calls",
  "desktop/artifacts", "desktop/tests", "desktop/approval", "desktop/recovery",
  "mobile/task", "mobile/dispatch", "mobile/call-detail",
  "mobile/approval", "mobile/recovery", "mobile/workbench",
]);
const out = path.join(root, "evidence");
await mkdir(path.join(out, "screenshots"), { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  kind: "static-design-review",
  testedFile: "design/review-v1/index.html",
  browserVersion: browser.version(),
  viewports,
  cases: [],
  interactions: [],
  errors: [],
  externalRequests: [],
  screenshots: [],
};

const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(message.text());
});
await page.route(/^https?:\/\//, async (route) => {
  report.externalRequests.push(route.request().url());
  await route.abort();
});

try {
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const screen of screens) {
      await page.goto(`${pathToFileURL(path.join(root, "index.html")).href}#${screen}`);
      await page.waitForFunction((id) => document.body.dataset.screen === id, screen);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
      });
      const layout = await page.evaluate(() => {
        const brokenImages = Array.from(document.images)
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.getAttribute("src"));
        const clippedControls = Array.from(document.querySelectorAll("button, .button, .status"))
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && element.scrollWidth > element.clientWidth + 2;
          })
          .map((element) => element.textContent.trim());
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          brokenImages,
          clippedControls,
          headings: document.querySelectorAll("main h1").length,
          mainTextLength: document.querySelector("main").textContent.trim().length,
          staticMarker: document.querySelector(".review-label strong").textContent,
        };
      });
      const failures = [];
      if (Math.max(layout.documentWidth, layout.bodyWidth) > layout.viewport + 1)
        failures.push("page-horizontal-overflow");
      if (layout.brokenImages.length) failures.push("broken-images");
      if (layout.clippedControls.length) failures.push("clipped-controls");
      if (layout.headings !== 1 || layout.mainTextLength < 50) failures.push("blank-or-invalid-main");
      if (!layout.staticMarker.includes("静态")) failures.push("missing-static-marker");
      report.cases.push({ viewport: viewport.name, screen, passed: failures.length === 0, failures, ...layout });
      if (screenshotCases.has(`${viewport.name}/${screen}`)) {
        const name = `${viewport.name}-${screen}.png`;
        await page.screenshot({ path: path.join(out, "screenshots", name), fullPage: true });
        report.screenshots.push(`screenshots/${name}`);
      }
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${pathToFileURL(path.join(root, "index.html")).href}#task`);
  await page.selectOption("#screen-picker", "dispatch");
  await assertScreen("dispatch");
  await page.locator('main .segmented a[href="#delegation"]').click();
  await assertScreen("delegation");
  await page.locator('.task-tabs a[href="#calls"]').click();
  await assertScreen("calls");
  await page.locator('td a[href="#call-detail"]').click();
  await assertScreen("call-detail");
  assert.equal(await page.locator(".call-inspector .inspector-title").innerText(), "mc-023");
  report.interactions.push({ name: "task-to-dispatch-to-call-detail", passed: true });

  await page.selectOption("#screen-picker", "artifacts");
  assert.equal(await page.getByRole("button", { name: "应用变更" }).isDisabled(), true);
  await page.locator('.local-tabs a[href="#tests"]').click();
  await assertScreen("tests");
  assert.equal(await page.locator(".test-row-failed").count(), 1);
  report.interactions.push({ name: "failed-validation-blocks-apply", passed: true });

  await page.selectOption("#screen-picker", "approval");
  assert.equal(await page.getByRole("button", { name: "批准本次", exact: true }).first().isDisabled(), true);
  await page.locator(".approval-diff summary").click();
  assert.equal(await page.locator(".approval-diff").getAttribute("open"), "");
  assert.match(await page.locator("#review-footer").innerText(), /Run 03/);
  report.interactions.push({ name: "approval-is-static-distinct-snapshot", passed: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption("#screen-picker", "dispatch");
  assert.equal(await page.locator(".graph-surface").isVisible(), false);
  assert.equal(await page.locator(".mobile-dependency-list").isVisible(), true);
  await page.getByRole("button", { name: "打开导航" }).click();
  assert.equal(await page.locator("#navigation-dialog").evaluate((dialog) => dialog.open), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#navigation-dialog").evaluate((dialog) => dialog.open), false);
  assert.equal(await page.getByRole("button", { name: "打开导航" }).evaluate((button) => document.activeElement === button), true);
  report.interactions.push({ name: "mobile-list-and-keyboard-dialog", passed: true });

  await page.selectOption("#screen-picker", "recovery");
  assert.match(await page.locator(".blocked-action").innerText(), /先确认/);
  assert.equal(await page.locator("main button:not(:disabled)").count(), 0);
  assert.equal(report.externalRequests.length, 0);
  report.interactions.push({ name: "unknown-outcome-has-no-live-actions-or-network", passed: true });
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  await browser.close();
}

report.summary = {
  total: report.cases.length,
  passed: report.cases.filter((test) => test.passed).length,
  failed: report.cases.filter((test) => !test.passed).length,
  interactionChecks: report.interactions.length,
  errors: report.errors.length,
  externalRequests: report.externalRequests.length,
  complete: report.cases.length === screens.length * viewports.length && report.interactions.length === 5,
};
await writeFile(path.join(out, "verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed || report.summary.errors || !report.summary.complete) process.exitCode = 1;

async function assertScreen(id) {
  await page.waitForFunction((expected) => document.body.dataset.screen === expected, id);
}
