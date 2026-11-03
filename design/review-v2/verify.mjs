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
  "task", "super-agent", "control", "control-review", "plan", "plan-review", "calls", "call-detail", "workbench", "project", "dispatch", "delegation",
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
  "desktop/super-agent", "desktop/control",
  "desktop/plan", "desktop/plan-review",
  "mobile/task", "mobile/calls", "mobile/call-detail", "mobile/dispatch",
  "mobile/approval", "mobile/recovery", "mobile/super-agent", "mobile/control", "mobile/plan", "mobile/plan-review",
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
        const overlappingFields = Array.from(document.querySelectorAll("#control-form input[type=number], #plan-form textarea, #plan-form input")).filter((input) => {
          input.scrollIntoView({ block: "center" });
          const r = input.getBoundingClientRect();
          return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== input;
        }).map((input) => input.id);
        window.scrollTo(0, 0);
        return {
          viewport: window.innerWidth,
          documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          brokenImages,
          clippedControls,
          headings: document.querySelectorAll("main h1").length,
          mainTextLength: document.querySelector("main").textContent.trim().length,
          markerVisible: visible(marker) && marker.textContent.includes("静态"),
          primaryTextSize: primary ? getComputedStyle(primary).fontSize : null,
          overlappingFields,
        };
      });
      const failures = [];
      if (layout.documentWidth > layout.viewport + 1) failures.push("page-horizontal-overflow");
      if (layout.brokenImages.length) failures.push("broken-images");
      if (layout.clippedControls.length) failures.push("clipped-controls");
      if (layout.overlappingFields.length) failures.push("obscured-form-fields");
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
  await check("super-agent-is-project-scoped-not-a-live-run", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open("super-agent");
    assert.match(await page.locator(".coordination-scope").innerText(), /Run 02 已结束/);
    assert.equal(await page.locator(".delegation-roster-row").count(), 4);
    assert.match(await page.locator(".next-decision").innerText(), /未执行/);
    await page.locator('.next-decision a[href="#control"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "control");
    assert.equal(await page.getByRole("button", { name: "预览调整" }).isDisabled(), true);
  });
  await check("local-model-budget-draft-preview-and-reset", async () => {
    await open("control");
    await page.selectOption("#model-developer", "reasoning-b");
    await page.locator("#draft-calls").fill("16");
    assert.match(await page.locator("#draft-status").innerText(), /2 项调整 · 未应用/);
    await page.getByRole("button", { name: "预览调整" }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "control-review");
    assert.equal(await page.locator(".draft-diff-row").count(), 2);
    assert.match(await page.locator(".draft-diff").innerText(), /开发 Agent 模型/);
    assert.match(await page.locator(".draft-diff").innerText(), /16 次/);
    assert.equal(await page.getByRole("button", { name: "应用配置" }).isDisabled(), true);
    for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      const shot = `screenshots/${name}-control-review.png`;
      await page.screenshot({ path: path.join(out, shot), fullPage: true });
      report.screenshots.push(shot);
    }
    await page.locator('.draft-context a[href="#control"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "control");
    assert.equal(await page.locator("#draft-calls").inputValue(), "16");
    assert.equal(await page.locator("#model-developer").inputValue(), "reasoning-b");
    await page.getByRole("button", { name: "撤销调整" }).click();
    assert.equal(await page.locator("#draft-calls").inputValue(), "12");
    assert.equal(await page.locator("#model-developer").inputValue(), "coding-a");
    assert.equal(await page.getByRole("button", { name: "预览调整" }).isDisabled(), true);
    await page.reload();
    assert.equal(await page.locator("#draft-calls").inputValue(), "12");
  });
  await check("invalid-budget-is-visible-and-blocks-preview", async () => {
    await open("control");
    for (const [selector, value] of [["#draft-parallel", "3"], ["#draft-calls", ""], ["#draft-minutes", "1.5"]]) {
      await page.locator(selector).fill(value);
      assert.equal(await page.locator(selector).getAttribute("aria-invalid"), "true");
      const field = await page.locator(selector).getAttribute("data-draft-field");
      assert.match(await page.locator(`#${field}-error`).innerText(), /整数/);
      assert.equal(await page.locator(`#${field}-error`).isVisible(), true);
      assert.equal(await page.getByRole("button", { name: "预览调整" }).isDisabled(), true);
      assert.ok((await page.locator("#draft-error").innerText()).length > 0);
    }
    await page.getByRole("button", { name: "撤销调整" }).click();
    assert.equal(await page.locator("#draft-error").innerText(), "");
  });
  await check("call-filter-and-inspector-state-survive-navigation", async () => {
    await open("calls");
    await page.locator('[data-call-filter="failed"]').click();
    await page.locator('td a[href="#call-detail"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "call-detail");
    await page.getByRole("link", { name: "关闭调用详情" }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "calls");
    assert.equal(await page.locator(".calls-table tbody tr").count(), 1);
    assert.equal(await page.locator('[data-call-filter="failed"]').getAttribute("aria-pressed"), "true");
  });
  await check("task-panel-and-expanded-plan-survive-navigation", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open("task");
    await page.locator(".compact-plan summary").click();
    await page.locator('[data-studio-view="evidence"]').click();
    await page.locator('[data-evidence-tab="tests"]').click();
    await page.selectOption("#screen-picker", "super-agent");
    await page.waitForFunction(() => document.body.dataset.screen === "super-agent");
    await page.locator('.page-heading a[href="#task"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "task");
    assert.equal(await page.locator("#evidence-tests").isVisible(), true);
    assert.equal(await page.locator(".task-studio").getAttribute("data-view"), "evidence");
    await page.locator('[data-studio-view="work"]').click();
    assert.equal(await page.locator(".compact-plan").getAttribute("open"), "");
    assert.equal(report.externalRequests.length, 0);
  });
  await check("revision-flow-preserves-failed-run-and-existing-evidence", async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open("task");
    await page.locator('.task-heading a[href="#plan"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "plan");
    assert.match(await page.locator(".revision-version-strip").innerText(), /计划 v2/);
    assert.match(await page.locator(".revision-version-strip").innerText(), /计划 v3/);
    assert.match(await page.locator(".revision-source").innerText(), /Run 02/);
    assert.equal(await page.locator(".editable-step").count(), 2);
    assert.match(await page.locator(".fixed-review-step").innerText(), /人工门禁/);
    await page.locator("#plan-goal").fill("复用每个请求的幂等键，并保持最大三次重试。");
    await page.locator("#plan-step-0-title").fill("将幂等键创建移到循环外");
    await page.locator("#plan-reason").fill("以 Run 02 失败测试为依据，修复后必须重新验证。");
    await page.getByRole("button", { name: "检查修订影响", exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "plan-review");
    assert.match(await page.locator(".revision-comparison").innerText(), /复用每个请求的幂等键/);
    assert.match(await page.locator(".review-step-list").innerText(), /将幂等键创建移到循环外/);
    assert.match(await page.locator(".revision-impact-list").innerText(), /旧写入授权不能继续使用/);
    assert.equal(await page.getByRole("button", { name: "提交修订" }).isDisabled(), true);
    await page.locator('.revision-aside a[href="#task"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === "task");
    assert.match(await page.locator(".fact-axes").innerText(), /2 通过 \/ 1 失败/);
    assert.match(await page.locator(".compact-plan").innerText(), /v2/);
    assert.match(await page.locator(".evidence-version").innerText(), /d4e5f6/);
  });
  await check("revision-draft-validation-reset-and-navigation", async () => {
    await open("plan");
    for (const selector of ["#plan-goal", "#plan-criteria", "#plan-reason", "#plan-step-0-title", "#plan-step-1-output"]) {
      await page.locator(selector).fill("");
      assert.equal(await page.locator(selector).getAttribute("aria-invalid"), "true");
      assert.equal(await page.getByRole("button", { name: "检查修订影响" }).isDisabled(), true);
    }
    await page.getByRole("button", { name: "恢复建议" }).click();
    assert.equal(await page.getByRole("button", { name: "检查修订影响" }).isDisabled(), false);
    assert.equal(await page.locator("#plan-form-error").innerText(), "");
    await page.locator("#plan-step-0-title").fill("检查固定的重试标识");
    await page.locator(".editable-step-role a[href=\"#control\"]").first().click();
    await page.waitForFunction(() => document.body.dataset.screen === "control");
    await page.selectOption("#screen-picker", "plan");
    await page.waitForFunction(() => document.body.dataset.screen === "plan");
    assert.equal(await page.locator("#plan-step-0-title").inputValue(), "检查固定的重试标识");
    await page.reload();
    assert.equal(await page.locator("#plan-step-0-title").inputValue(), "修复幂等键复用");
  });
  await check("revision-user-text-is-not-interpreted-as-html", async () => {
    await open("plan");
    const text = '修复验证 <img src="x" onerror="window.__injected=1"> 不执行输入标记。';
    await page.locator("#plan-goal").fill(text);
    await page.getByRole("button", { name: "检查修订影响" }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "plan-review");
    assert.ok((await page.locator(".revision-comparison").innerText()).includes(text));
    assert.equal(await page.locator('.revision-comparison img[src="x"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    await page.getByRole("link", { name: "返回编辑" }).first().click();
    await page.waitForFunction(() => document.body.dataset.screen === "plan");
    assert.equal(await page.locator("#plan-goal").inputValue(), text);
  });
  await check("model-inspection-is-unverified-and-focus-returns", async () => {
    await open("control");
    await page.locator('[data-model-info="developer"]').click();
    assert.equal(await page.locator("#model-dialog").evaluate((dialog) => dialog.open), true);
    assert.match(await page.locator("#model-dialog").innerText(), /未连接/);
    assert.match(await page.locator("#model-dialog").innerText(), /能力未验证/);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
    assert.equal(await page.getByRole("button", { name: "测试连接", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#model-dialog").evaluate((dialog) => dialog.open), false);
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
    assert.equal(await page.locator('[data-model-info="developer"]').evaluate((el) => document.activeElement === el), true);
  });
  await check("model-switch-shows-data-boundary-not-automatic-approval", async () => {
    await open("control");
    await page.selectOption("#model-developer", "reasoning-b");
    assert.match(await page.locator("#model-note-developer").innerText(), /外部服务/);
    await page.locator('[data-model-info="developer"]').click();
    assert.match(await page.locator("#model-dialog-title").innerText(), /推理模型 B/);
    assert.match(await page.locator(".model-profile-facts").innerText(), /外部推理服务/);
    for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      const shot = `screenshots/${name}-model-inspection.png`;
      await page.screenshot({ path: path.join(out, shot), fullPage: false });
      report.screenshots.push(shot);
      assert.ok(await page.locator("#model-dialog").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1));
    }
    await page.locator("[data-close-model]").first().click();
    await page.getByRole("button", { name: "预览调整" }).click();
    await page.waitForFunction(() => document.body.dataset.screen === "control-review");
    assert.match(await page.locator(".changed-model-checks").innerText(), /需确认资料可外发/);
    assert.match(await page.locator(".changed-model-checks").innerText(), /未连接/);
    assert.equal(await page.getByRole("button", { name: "应用配置" }).isDisabled(), true);
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
  complete: report.cases.length === screens.length * viewports.length && report.interactions.length === 19,
};
await writeFile(path.join(out, "verification.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed || report.summary.errors || !report.summary.complete) process.exitCode = 1;
