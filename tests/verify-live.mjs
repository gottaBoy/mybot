import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const tmp = await mkdtemp(path.join(os.tmpdir(), "mybot-live-test-"));
const port = Number(process.env.TEST_PORT || 4182);
const base = `http://127.0.0.1:${port}`;
const testToken = "browser-fixture-only-not-a-production-token";
const server = spawn(".venv/bin/python", ["tests/browser_server.py", tmp, String(port), testToken], {
  cwd: process.cwd(), env: { ...process.env, PYTHONPATH: "." }, stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (data) => { serverOutput += data; });
server.stderr.on("data", (data) => { serverOutput += data; });
const report = { generatedAt: new Date().toISOString(), fixture: "FakeProvider, no external model requests",
  viewports: [], interactions: [], errors: [], externalRequests: [] };
const out = "tests/evidence";
await mkdir(out, { recursive: true });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(serverOutput);
    try { if ((await fetch(`${base}/healthz`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, serverOutput);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"], headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => report.errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") report.errors.push(message.text()); });
  await page.route(/^https?:\/\//, async (route) => {
    if (new URL(route.request().url()).origin !== base) { report.externalRequests.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "登录工作空间", exact: true }).waitFor();
  await page.locator('[name="token"]').fill(testToken);
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "工作台", exact: true }).waitFor();
  assert.equal(await page.locator(".nav-project").count(), 0);
  await page.locator('.page-heading [data-action="new-project"]').click();
  await page.locator('[name="name"]').fill("移动研发项目");
  await page.locator('[name="goal"]').fill("检查只读上下文与研发方案");
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "移动研发项目", exact: true }).waitFor();
  report.interactions.push("create-project-persists");

  await page.goto(`${base}/#models`);
  await page.getByRole("button", { name: "添加模型" }).click();
  await page.locator('[name="name"]').fill("浏览器测试模型");
  await page.locator('[name="endpoint"]').fill("http://127.0.0.1:9999/v1");
  await page.locator('[name="model"]').fill("test-fixture-only");
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "浏览器测试模型" }).waitFor();
  assert.match(await page.locator(".model-row").innerText(), /未测试/);
  await page.getByRole("button", { name: "设为默认" }).click();
  await page.waitForFunction(() => document.querySelector(".model-row")?.textContent.includes("默认"));
  report.interactions.push("default-model-setting-is-persistent");
  report.interactions.push("model-config-is-not-a-provider-test");

  await page.locator('.primary-nav a[href="#home"]').click();
  await page.locator(".nav-new").click();
  await page.locator('[name="title"]').fill("验证手机与桌面调研闭环");
  await page.locator('[name="goal"]').fill("分析提供资料里的约束和风险，提出可核查的方案");
  await page.locator('[name="files"]').fill("README.md");
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "检查发送内容与运行上限" }).waitFor();
  await page.locator(".send-preview summary").click();
  assert.match(await page.locator(".send-preview pre").innerText(), /Browser test repository/);
  assert.match(await page.locator("#send-targets").innerText(), /127.0.0.1:9999/);
  await page.locator('[name="consent"]').check();
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "验证手机与桌面调研闭环" }).waitFor();
  await page.waitForFunction(() => document.querySelector(".fact-axes")?.textContent.includes("执行完成"), { timeout: 15000 });
  assert.match(await page.locator(".fact-axes").innerText(), /未执行测试/);
  assert.equal(await page.locator(".agent-work-graph").count(), 1);
  assert.equal(await page.locator(".agent-work-stage").count(), 3);
  assert.match(await page.locator(".agent-work-graph").innerText(), /制定计划/);
  await page.locator('[data-tab="agents"]').click();
  assert.equal(await page.locator(".live-agent-row").count(), 4);
  await page.locator('[data-tab="calls"]').click();
  assert.equal(await page.locator(".calls-table tbody tr").count(), 4);
  await page.locator('.calls-table [data-action="call"]').first().click();
  assert.match(await page.locator("#form-dialog").innerText(), /Token/);
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.locator('[data-tab="audit"]').click();
  assert.match(await page.locator(".audit-list").innerText(), /artifact.created/);
  await page.locator('[data-tab="work"]').click();
  assert.ok(await page.locator(".artifact-content").innerText());
  const runUrl = page.url();
  await page.locator('a[href="#agent-work"]').click();
  await page.getByRole("heading", { name: "AI Agent Work", exact: true }).waitFor();
  assert.equal(await page.locator(".agent-work-run").count(), 1);
  await page.locator(".agent-work-run").first().click();
  await page.getByRole("heading", { name: "Agent Work", level: 1, exact: true }).waitFor();
  assert.equal(await page.locator(".agent-work-detail-grid").count(), 1);
  report.interactions.push("agent-work-visualization");
  await page.goto(runUrl);
  await page.getByRole("heading", { name: "验证手机与桌面调研闭环", exact: true }).waitFor();
  await page.locator(".original-request summary").click();
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/api/bootstrap")),
    page.waitForResponse((response) => /\/api\/runs\/[a-f0-9]+$/.test(response.url())),
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))),
  ]);
  assert.equal(await page.locator(".original-request").evaluate((node) => node.open), true);
  report.interactions.push("start-run-agent-calls-artifact-audit");

  for (const [name, width, height] of [
    ["desktop", 1440, 1000], ["compact", 1024, 900], ["tablet", 768, 1024],
    ["android-size", 390, 844], ["iphone-small-size", 320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
      broken: [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src),
    }));
    assert.ok(layout.documentWidth <= layout.width + 1, `${name}: ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.broken, []);
    if (width <= 699) {
      await page.locator('[data-pane="evidence"]').click();
      assert.equal(await page.locator(".evidence-inspector").isVisible(), true);
      assert.equal(await page.locator(".work-pane").isVisible(), false);
      assert.equal(await page.locator(".task-studio").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), true);
    }
    await page.waitForFunction(() => !document.querySelector("#toast").classList.contains("show"));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector("#toast")).opacity) === 0);
    if (["desktop", "android-size"].includes(name)) await page.screenshot({ path: `${out}/live-${name}.png`, fullPage: true });
    report.viewports.push({ name, ...layout, passed: true });
  }
  await page.getByRole("button", { name: "接受方案" }).click();
  await page.waitForFunction(() => document.querySelector(".fact-axes")?.textContent.includes("已接受方案"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".fact-axes")?.textContent.includes("已接受方案"));
  assert.ok(page.url() === runUrl);
  report.interactions.push("artifact-review-persists-after-reload");
  await page.getByRole("button", { name: "打开导航" }).click();
  assert.equal(await page.locator("#nav-dialog").evaluate((d) => d.open), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#nav-dialog").evaluate((d) => d.open), false);
  await page.goto(`${base}/#models`);
  await page.getByRole("button", { name: "添加模型" }).click();
  const mobileForm = await page.locator("#form-dialog").evaluate((dialog) => ({
    width: dialog.getBoundingClientRect().width, viewport: innerWidth,
    overflow: dialog.scrollWidth > dialog.clientWidth + 1,
    inputSize: getComputedStyle(dialog.querySelector("input")).fontSize,
  }));
  assert.ok(mobileForm.width <= mobileForm.viewport);
  assert.equal(mobileForm.overflow, false);
  assert.ok(parseFloat(mobileForm.inputSize) >= 16);
  await page.keyboard.press("Escape");
  report.interactions.push("mobile-navigation-and-form-input-size");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("heading", { name: "登录工作空间", exact: true }).waitFor();
  assert.equal((await page.request.get(`${base}/api/bootstrap`)).status(), 401);
  await page.locator('[name="token"]').fill(testToken);
  await page.locator('#form-dialog [type="submit"]').click();
  await page.getByRole("heading", { name: "模型与控制", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: /浏览器测试模型/ }).count(), 1);
  report.interactions.push("token-login-logout-and-relogin");

  const bootstrap = await (await page.request.get(`${base}/api/bootstrap`)).json();
  const headers = { "X-Workbench-Request": "1" };
  const taskResponse = await page.request.post(`${base}/api/tasks`, {
    headers, data: { project_id: bootstrap.projects[0].id, title: "超时诊断测试夹具",
      goal: "timeout-diagnostics-fixture", files: [] },
  });
  assert.equal(taskResponse.status(), 201);
  const failedTask = await taskResponse.json();
  const preview = await (await page.request.post(`${base}/api/tasks/${failedTask.id}/preview`,
    { headers, data: {} })).json();
  const modelId = bootstrap.models[0].id;
  const failedRunResponse = await page.request.post(`${base}/api/tasks/${failedTask.id}/runs`, {
    headers, data: { coordinator_model: modelId, researcher_model: modelId, reviewer_model: modelId,
      consent: true, request_id: "browser-timeout-fixture", context_hash: preview.context_hash },
  });
  assert.equal(failedRunResponse.status(), 201);
  const failedRun = await failedRunResponse.json();
  await page.goto(`${base}/#run/${failedRun.id}`);
  await page.waitForFunction(() => document.querySelector(".notice-red")?.textContent.includes("Codex CLI"));
  await page.locator('[data-tab="calls"]').click();
  await page.locator('.calls-table [data-action="call"]').first().click();
  await page.locator(".call-diagnostics").waitFor();
  assert.match(await page.locator(".call-diagnostics").innerText(), /process_reaped/);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator("#form-dialog").evaluate((dialog) => ({
      fits: dialog.getBoundingClientRect().width <= innerWidth,
      overflow: dialog.scrollWidth > dialog.clientWidth + 1,
    }));
    assert.ok(layout.fits && !layout.overflow, JSON.stringify(layout));
  }
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  report.interactions.push("timeout-diagnostics-persist-and-fit-mobile-desktop");

  const retryModelResponse = await page.request.post(`${base}/api/models`, {
    headers, data: { name: "重试模型（测试夹具）", endpoint: "http://127.0.0.1:9999/v1", model: "retry-fixture" },
  });
  const retryModel = await retryModelResponse.json();
  const retryTaskResponse = await page.request.post(`${base}/api/tasks`, {
    headers, data: { project_id: bootstrap.projects[0].id, title: "资源重试验收（测试夹具）",
      goal: "resource-retry-fixture", files: ["README.md"] },
  });
  const retryTask = await retryTaskResponse.json();
  const retryContext = await (await page.request.post(`${base}/api/tasks/${retryTask.id}/preview`,
    { headers, data: {} })).json();
  const retrySourceResponse = await page.request.post(`${base}/api/tasks/${retryTask.id}/runs`, {
    headers, data: { coordinator_model: modelId, researcher_model: modelId, reviewer_model: modelId,
      consent: true, request_id: "browser-resource-source", context_hash: retryContext.context_hash },
  });
  assert.equal(retrySourceResponse.status(), 201);
  const retrySource = await retrySourceResponse.json();
  await page.goto(`${base}/#run/${retrySource.id}`);
  await page.getByRole("heading", { name: "资源重试验收（测试夹具）", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector(".fact-axes")?.textContent.includes("执行失败"));
  await page.getByRole("button", { name: "重试与资源", exact: true }).click();
  await page.locator('[data-form="retry"]').waitFor();
  assert.equal(await page.locator(".retry-steps li").count(), 4);
  assert.equal(await page.locator(".retry-steps .status").filter({ hasText: "复用" }).count(), 3);
  assert.equal(await page.locator('[name="max_calls"]').inputValue(), "1");
  assert.equal(await page.locator('[name="coordinator_model"]').isDisabled(), true);
  assert.equal(await page.locator('[name="researcher_model"]').isDisabled(), true);
  await page.locator('[name="acknowledge_replay"]').check();
  await page.locator('[name="consent"]').check();
  await page.locator('[name="reviewer_model"]').selectOption(retryModel.id);
  assert.equal(await page.locator('[name="consent"]').isChecked(), false);
  assert.equal(await page.locator('[name="acknowledge_replay"]').isChecked(), false);
  await page.locator('[name="call_timeout_seconds"]').fill("180");
  await page.locator('[name="max_output_tokens"]').fill("2048");
  assert.match(await page.locator("#retry-targets").innerText(), /重试模型/);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.locator("#form-dialog").evaluate((dialog) => ({
      width: dialog.getBoundingClientRect().width, viewport: innerWidth,
      overflow: dialog.scrollWidth > dialog.clientWidth + 1,
    }));
    assert.ok(geometry.width <= geometry.viewport && !geometry.overflow, JSON.stringify(geometry));
    if (width === 1440 || width === 390) {
      await page.locator("#form-dialog").evaluate((dialog) => { dialog.scrollTop = 0; });
      await page.screenshot({ path: `${out}/retry-resources-${width}.png`, fullPage: true });
    }
  }
  const unchanged = await (await page.request.get(`${base}/api/runs/${retrySource.id}`)).json();
  assert.equal(unchanged.calls.length, 4);
  assert.equal(unchanged.run.status, "failed");
  assert.equal(unchanged.retry_runs.length, 0);
  report.interactions.push("resource-retry-preview-consent-reset-and-responsive-layout");
  await page.locator('[name="acknowledge_replay"]').check();
  await page.locator('[name="consent"]').check();
  await page.getByRole("button", { name: "确认重试", exact: true }).click();
  await page.waitForURL((url) => url.hash.startsWith("#run/") && !url.hash.endsWith(retrySource.id));
  await page.waitForFunction(() => document.querySelector(".fact-axes")?.textContent.includes("执行完成"));
  const newRunId = page.url().split("#run/")[1];
  const recovered = await (await page.request.get(`${base}/api/runs/${newRunId}`)).json();
  assert.equal(recovered.calls.length, 1);
  assert.equal(recovered.run.source_run_id, retrySource.id);
  assert.equal(recovered.run.config.call_timeout_seconds, 180);
  assert.equal(recovered.calls[0].model_id, retryModel.id);
  assert.equal(recovered.agents.filter((agent) => agent.source_agent_id).length, 3);
  assert.match(await page.locator(".retry-lineage").innerText(), /本次新增 1 次调用/);
  await page.reload();
  await page.locator(".retry-lineage").waitFor();
  const sourceAfter = await (await page.request.get(`${base}/api/runs/${retrySource.id}`)).json();
  assert.deepEqual(sourceAfter.run, unchanged.run);
  assert.deepEqual(sourceAfter.calls, unchanged.calls);
  await page.locator(".retry-lineage a").first().click();
  await page.getByRole("button", { name: "重试与资源", exact: true }).waitFor();
  assert.equal(await page.locator(`.retry-lineage a[href="#run/${newRunId}"]`).count(), 1);
  report.interactions.push("resource-retry-submits-once-reuses-results-and-persists-lineage");

  await page.goto(`${base}/#models`);
  await page.getByRole("button", { name: "添加后端", exact: true }).click();
  await page.locator('[data-form="backend"] [name="name"]').fill("本机 OMB（测试夹具）");
  await page.locator('[data-form="backend"] [name="endpoint"]').fill("http://127.0.0.1:8000");
  await page.getByRole("button", { name: "保存连接", exact: true }).click();
  await page.locator(".backend-row").waitFor();
  assert.match(await page.locator(".backend-row").innerText(), /未检查/);
  let connections = await (await page.request.get(`${base}/api/backends`)).json();
  const backendId = connections.connections[0].id;
  assert.equal(connections.connections[0].tested_at, null);
  assert.equal(connections.connections[0].test_status, null);
  await page.reload();
  await page.locator(".backend-row").waitFor();
  assert.match(await page.locator(".backend-row").innerText(), /未检查/);
  report.interactions.push("backend-config-persists-without-connection-check");

  await page.getByRole("button", { name: "检查服务", exact: true }).click();
  await page.locator('[data-form="backend-check"]').waitFor();
  assert.equal(await page.locator('[name="consent"]').isChecked(), false);
  assert.match(await page.locator('#form-dialog').innerText(), /不携带凭证/);
  await page.locator('[name="consent"]').check();
  await page.getByRole("button", { name: "确认检查", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".backend-row")?.textContent.includes("服务可达"));
  assert.match(await page.locator(".backend-row").innerText(), /认证未验证/);
  const backendHealth = await (await page.request.get(`${base}/api/backends/${backendId}/health`)).json();
  assert.equal(backendHealth.authentication, "unverified");
  assert.equal(backendHealth.read_access_verified, false);
  report.interactions.push("explicit-backend-health-check-is-not-authentication");

  await page.waitForFunction(() => !document.querySelector("#toast").classList.contains("show"));
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector("#toast")).opacity) === 0);
  for (const [name, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844], ["small", 320, 740]]) {
    await page.setViewportSize({ width, height });
    const geometry = await page.locator(".backend-row").evaluate((row) => ({
      documentWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      rowWidth: row.scrollWidth,
      clientWidth: row.clientWidth,
      broken: [...document.images].filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
    }));
    assert.ok(geometry.documentWidth <= geometry.viewport + 1, JSON.stringify(geometry));
    assert.ok(geometry.rowWidth <= geometry.clientWidth + 1, JSON.stringify(geometry));
    assert.deepEqual(geometry.broken, []);
    if (width !== 320) {
      await page.locator(".backend-section").screenshot({ path: `${out}/backend-${name}.png` });
    }
  }
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".backend-row")?.textContent.includes("已撤销"));
  assert.equal(await page.locator('.backend-row [data-action="check-backend"]').count(), 0);
  await page.reload();
  await page.locator(".backend-row").waitFor();
  assert.match(await page.locator(".backend-row").innerText(), /已撤销/);
  connections = await (await page.request.get(`${base}/api/backends`)).json();
  assert.equal(connections.connections[0].status, "revoked");
  report.interactions.push("backend-revocation-persists-and-layout-fits");
  assert.deepEqual(report.externalRequests, []);
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(error.stack || String(error));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
}
report.complete = report.interactions.length === 14 && report.viewports.length === 5 && report.errors.length === 0;
await writeFile(`${out}/browser.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.complete) process.exitCode = 1;
