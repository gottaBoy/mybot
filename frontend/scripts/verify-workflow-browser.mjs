import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5178/'
const out = resolve(
  process.env.WORKFLOW_EVIDENCE_DIR ??
    '../evidence/workflow-versions-2026-11-22',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href,
)

await mkdir(out, { recursive: true })
const report = {
  generatedAt: new Date().toISOString(),
  fixture: 'Disposable browser_server.py + FakeProvider',
  base,
  externalRequests: [],
  pageErrors: [],
  checks: [],
}
const suffix = String(Date.now()).slice(-10)
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('pageerror', (error) => report.pageErrors.push(error.message))
await page.route(/^https?:\/\//, async (route) => {
  const url = new URL(route.request().url())
  if (url.origin !== new URL(base).origin) {
    report.externalRequests.push(url.href)
    await route.abort()
  } else {
    await route.continue()
  }
})

async function api(path, options = {}) {
  return page.evaluate(
    async ({ path, options }) => {
      const response = await fetch(`/api${path}`, {
        ...options,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
          ...(options.headers ?? {}),
        },
      })
      const body = await response.json()
      if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`)
      return body
    },
    { path, options },
  )
}
const post = (path, body) =>
  api(path, { method: 'POST', body: JSON.stringify(body) })

try {
  await page.goto(base)
  await page.getByRole('heading', { name: /登录工作空间|Sign in to workspace/ }).waitFor()
  await page.getByLabel(/访问令牌|Access token/).fill('workflow-browser-root')
  await page.getByRole('button', { name: /登录|Sign in/ }).click()
  await page.locator('a[href="#workflows"]').waitFor()

  const model = await post('/models', {
    name: 'Workflow browser model',
    endpoint: 'http://127.0.0.1:9999/v1',
    model: 'workflow-browser-fixture',
  })
  const project = await post('/projects', {
    name: 'Workflow browser project',
    goal: '固定工作流版本浏览器验收',
    directory: '.',
    notes: 'Disposable browser fixture.',
  })
  const task = await post('/tasks', {
    project_id: project.id,
    title: 'Workflow browser task',
    goal: '验证固定工作流版本绑定与旧快照保留',
    acceptance: '保存、发布并绑定一个不可变 Workflow 版本。',
    files: [],
  })
  const bundle = await api('/workflows/local-research')
  const definition = {
    ...bundle.definition,
    name: 'Browser workflow baseline',
    stages: bundle.definition.stages.map((stage) => ({
      ...stage,
      model_id: model.id,
    })),
  }
  const savedReceipt = await post('/workflows/local-research/draft', {
    request_id: `browser-workflow-save-${suffix}`,
    expected_revision: bundle.revision,
    definition,
  })
  const saved = savedReceipt.result
  const impact = await api(
    `/workflows/local-research/impact?revision=${saved.revision}&definition_hash=${saved.definition_hash}`,
  )
  const versionReceipt = await post('/workflows/local-research/publish', {
    request_id: `browser-workflow-publish-${suffix}`,
    expected_revision: saved.revision,
    definition_hash: saved.definition_hash,
    impact_hash: impact.impact_hash,
    consent: true,
  })
  assert.ok(versionReceipt.result.version >= 1)
  report.checks.push('api-save-impact-publish')

  await page.reload()
  await page.locator('a[href="#workflows"]').waitFor()
  await page.locator('a[href="#workflows"]').click()
  await page.getByRole('heading', { name: /工作流|Workflows/ }).waitFor()
  await page.getByText(/Browser workflow baseline/).first().waitFor()
  await page.screenshot({ path: resolve(out, 'workflow-desktop-zh.png'), fullPage: true })
  report.checks.push('desktop-page-and-published-history')

  const name = page.getByLabel(/工作流名称|Workflow name/)
  await name.fill('Browser workflow edited')
  await name.press('Tab')
  const saveButton = page.getByRole('button', { name: /保存草稿|Save draft/ })
  const saveResponse = page
    .waitForResponse(
      (response) => response.url().endsWith('/api/workflows/local-research/draft'),
      { timeout: 5000 },
    )
    .catch(() => undefined)
  await saveButton.click()
  const savedHttp = await saveResponse
  await page.waitForTimeout(1000)
  assert.ok(savedHttp, 'workflow save did not issue a request')
  const uiRevision = saved.revision + 1
  await page
    .getByText(new RegExp(`修订 ${uiRevision}|Revision ${uiRevision}`))
    .first()
    .waitFor()
  await page.getByRole('button', { name: /检查发布影响|Check publication impact/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: /确认发布|Confirm publication/ }).click()
  const uiVersion = versionReceipt.result.version + 1
  await page.getByText(new RegExp(`已发布 v${uiVersion}|Published v${uiVersion}`)).first().waitFor()
  report.checks.push('ui-save-impact-consent-publish')

  const versions = await api('/workflows/local-research/versions')
  assert.deepEqual(
    versions.items.slice(0, 2).map((item) => item.version),
    [uiVersion, versionReceipt.result.version],
  )
  const preview = await post(`/tasks/${task.id}/preview`, {})
  const run = await post(`/tasks/${task.id}/runs`, {
    coordinator_model: model.id,
    researcher_model: model.id,
    reviewer_model: model.id,
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
    consent: true,
    request_id: `browser-workflow-run-${suffix}`,
    context_hash: preview.context_hash,
    workflow_version: versionReceipt.result.version,
  })
  assert.equal(run.context.workflow.version, versionReceipt.result.version)
  const newerBundle = await api('/workflows/local-research')
  assert.equal(
    (await api(`/runs/${run.id}`)).run.context.workflow.version,
    versionReceipt.result.version,
  )
  assert.equal(newerBundle.published.version, versionReceipt.result.version + 1)
  report.checks.push('explicit-run-keeps-v1-snapshot-after-v2')

  await page.getByLabel(/工作流名称|Workflow name/).fill('Conflict candidate')
  const concurrent = await api('/workflows/local-research')
  await post('/workflows/local-research/draft', {
    request_id: `browser-concurrent-${suffix}`,
    expected_revision: concurrent.revision,
    definition: { ...concurrent.definition, name: 'Concurrent server edit' },
  })
  await page.getByRole('button', { name: /保存草稿|Save draft/ }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: /版本或依赖已改变|revision or its dependencies changed/ })
    .waitFor()
  assert.equal(
    await page.getByLabel(/工作流名称|Workflow name/).inputValue(),
    'Conflict candidate',
  )
  report.checks.push('cas-conflict-preserves-local-candidate')

  await page.reload()
  await page.getByRole('heading', { name: /工作流|Workflows/ }).waitFor()
  await page.getByLabel(/工作流名称|Workflow name/).fill('Unknown response candidate')
  await page.route('**/api/workflows/local-research/draft', async (route) => {
    await route.fetch()
    await route.abort()
  })
  await page.getByRole('button', { name: /保存草稿|Save draft/ }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: /写入结果尚未确认|write outcome is unconfirmed/ })
    .waitFor()
  await page.unroute('**/api/workflows/local-research/draft')
  await page.getByRole('button', { name: /核对原请求|Check original request/ }).click()
  await page.getByText(/草稿修订|Draft revision/).first().waitFor()
  report.checks.push('unknown-write-reconciles-by-get')

  await page.getByLabel(/工作流名称|Workflow name/).fill('Dirty guard candidate')
  await page.getByRole('link', { name: /模型与资源|Models & resources/ }).first().click()
  const guard = page.getByRole('dialog')
  await guard.waitFor()
  await guard.getByRole('button', { name: /继续编辑|Keep editing/ }).first().click()
  assert.match(page.url(), /#workflows/)
  await page.getByRole('link', { name: /模型与资源|Models & resources/ }).first().click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /放弃修改|Discard changes/ })
    .click()
  await page.getByRole('heading', { name: /模型与资源|Models & resources/ }).waitFor()
  report.checks.push('dirty-navigation-guard')
  await page.getByRole('link', { name: /工作流|Workflows/ }).first().click()
  await page.getByRole('heading', { name: /工作流|Workflows/ }).waitFor()

  await page.evaluate(() => {
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.style', 'gothic')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('heading', { name: 'Workflows' }).waitFor()
  const mobileName = page.getByLabel('Workflow name')
  await mobileName.waitFor()
  assert.equal(await mobileName.inputValue(), 'Unknown response candidate')
  await page.screenshot({ path: resolve(out, 'workflow-mobile-en-gothic.png'), fullPage: true })
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageErrors: [],
  }))
  assert.ok(layout.scrollWidth <= layout.viewport)
  report.checks.push('mobile-en-gothic-no-horizontal-overflow')
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

if (report.pageErrors.length || report.externalRequests.length) {
  throw new Error(JSON.stringify(report))
}
console.log(JSON.stringify(report, null, 2))
