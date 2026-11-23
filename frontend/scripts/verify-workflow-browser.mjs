import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(
  process.env.WORKFLOW_EVIDENCE_DIR ?? '/tmp/mybot-workflow-delivery',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href
)

await mkdir(out, { recursive: true })
const report = {
  generatedAt: new Date().toISOString(),
  fixture: 'Disposable browser_server.py + FakeProvider',
  base,
  externalRequests: [],
  pageErrors: [],
  checks: [],
  writes: [],
  geometry: [],
}
const suffix = String(Date.now()).slice(-10)
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
  headless: true,
})
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
page.on('pageerror', (error) => report.pageErrors.push(error.message))
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
})
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
      if (!response.ok)
        throw new Error(`${response.status}: ${JSON.stringify(body)}`)
      return body
    },
    { path, options },
  )
}
const post = (path, body) =>
  api(path, { method: 'POST', body: JSON.stringify(body) })
const record = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function waitRun(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await api(`/runs/${id}`)
    if (value.run.status === 'succeeded') return value
    if (['failed', 'canceled'].includes(value.run.status))
      throw new Error(JSON.stringify(value.run))
    await page.waitForTimeout(100)
  }
  throw new Error('fixture_run_not_complete')
}

try {
  await page.goto(base)
  await page
    .getByRole('heading', { name: /登录工作空间|Sign in to workspace/ })
    .waitFor()
  await page.getByLabel(/访问令牌|Access token/).fill('workflow-browser-root')
  await page.getByRole('button', { name: /登录|Sign in/ }).click()
  await page.locator('a[href="#workflows"]').waitFor()
  const empty = await api('/bootstrap')
  assert.deepEqual(
    [
      empty.models.length,
      empty.projects.length,
      empty.tasks.length,
      empty.runs.length,
    ],
    [0, 0, 0, 0],
  )

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
  record('api-save-impact-publish')

  await page.reload()
  await page.locator('a[href="#workflows"]').waitFor()
  await page.locator('a[href="#workflows"]').click()
  await page.getByRole('heading', { name: /工作流|Workflows/ }).waitFor()
  await page
    .getByText(/Browser workflow baseline/)
    .first()
    .waitFor()
  await page.screenshot({
    path: resolve(out, 'workflow-desktop-zh.png'),
    fullPage: true,
  })
  record('desktop-page-and-published-history')

  const name = page.getByLabel(/工作流名称|Workflow name/)
  await name.fill('Browser workflow edited')
  await name.press('Tab')
  const saveButton = page.getByRole('button', { name: /保存草稿|Save draft/ })
  const saveResponse = page
    .waitForResponse(
      (response) =>
        response.url().endsWith('/api/workflows/local-research/draft'),
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
  await page
    .getByRole('button', { name: /检查发布影响|Check publication impact/ })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByRole('checkbox').check()
  await dialog
    .getByRole('button', { name: /确认发布|Confirm publication/ })
    .click()
  const uiVersion = versionReceipt.result.version + 1
  await page
    .getByText(new RegExp(`已发布 v${uiVersion}|Published v${uiVersion}`))
    .first()
    .waitFor()
  record('ui-save-impact-consent-publish')

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
  await waitRun(run.id)
  record('explicit-run-keeps-v1-snapshot-after-v2')

  for (let index = 0; index < 20; index++) {
    const current = await api('/workflows/local-research')
    const receipt = await post('/workflows/local-research/draft', {
      request_id: `history-save-${suffix}-${index}`,
      expected_revision: current.revision,
      definition: {
        ...current.definition,
        name: `History workflow ${index + 3}`,
      },
    })
    const candidate = await api(
      `/workflows/local-research/impact?revision=${receipt.result.revision}&definition_hash=${receipt.result.definition_hash}`,
    )
    await post('/workflows/local-research/publish', {
      request_id: `history-publish-${suffix}-${index}`,
      expected_revision: receipt.result.revision,
      definition_hash: receipt.result.definition_hash,
      impact_hash: candidate.impact_hash,
      consent: true,
    })
  }
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page
    .getByRole('button', { name: /安排执行|Arrange execution/, exact: true })
    .click()
  const wizard = page.getByRole('dialog', {
    name: /确认资料与运行资源|Review context & resources/,
  })
  await wizard.getByRole('button', { name: /下一步|Next/, exact: true }).click()
  await wizard
    .getByRole('button', {
      name: /下一页工作流版本|Next workflow versions/,
      exact: true,
    })
    .click()
  await wizard
    .getByRole('combobox', { name: /工作流版本|Workflow version/, exact: true })
    .click()
  await page
    .getByRole('option', { name: /^v1 · Browser workflow baseline$/ })
    .click()
  await wizard.getByRole('button', { name: /下一步|Next/, exact: true }).click()
  await wizard.getByRole('checkbox').check()
  await wizard
    .getByRole('button', {
      name: /确认并开始运行|Confirm & start run/,
      exact: true,
    })
    .click()
  await page.locator('form.wb-form').waitFor({ state: 'hidden' })
  await page
    .getByTestId('run-workflow-binding')
    .getByText('Workflow v1', { exact: true })
    .waitFor()
  const currentRuns = (await api('/bootstrap')).runs
  assert.equal(currentRuns.length, 2)
  const bound = await waitRun(currentRuns.find((item) => item.id !== run.id).id)
  assert.equal(bound.run.context.workflow.version, 1)
  assert.deepEqual(bound.run.context.workflow.definition, definition)
  await page.screenshot({
    path: resolve(out, 'workflow-old-version-run.png'),
    fullPage: true,
  })
  record(
    'Run wizard pages older versions and freezes selected v1 after22 published versions',
  )

  await page.getByRole('radio', { name: /任务会话|Conversation/, exact: true }).click()
  await page.getByRole('textbox', { name: /补充要求|Supplemental requirements/, exact: true }).fill('Use the selected historical workflow for this supplemental requirement.')
  await page.getByRole('button', { name: /保存消息|Save message/, exact: true }).click()
  await page.locator('.wb-task-message-content').filter({ hasText: 'Use the selected historical workflow' }).waitFor()
  await page.getByRole('button', { name: /安排下一轮|Arrange next run/, exact: true }).click()
  const turnWizard = page.getByRole('dialog', { name: /确认资料与运行资源|Review context & resources/ })
  await turnWizard.getByRole('button', { name: /下一步|Next/, exact: true }).click()
  await turnWizard.getByRole('button', { name: /下一页工作流版本|Next workflow versions/, exact: true }).click()
  await turnWizard.getByRole('combobox', { name: /工作流版本|Workflow version/, exact: true }).click()
  await page.getByRole('option', { name: /^v1 · Browser workflow baseline$/ }).click()
  await turnWizard.getByRole('button', { name: /下一步|Next/, exact: true }).click()
  await turnWizard.getByRole('checkbox').check()
  await turnWizard.getByRole('button', { name: /确认并开始运行|Confirm & start run/, exact: true }).click()
  await page.locator('form.wb-form').waitFor({ state: 'hidden' })
  const nextTurns = await api(`/tasks/${task.id}/turns`)
  const appliedTurn = nextTurns.items[0]
  assert.equal(appliedTurn.state, 'applied')
  assert.equal(appliedTurn.candidate.snapshot.workflow.version, 1)
  const turnRun = await waitRun(appliedTurn.run_id)
  assert.equal(turnRun.run.context.workflow.version, 1)
  assert.deepEqual(turnRun.run.context.workflow.definition, definition)
  assert.equal((await api('/bootstrap')).runs.length, 3)
  record('Task conversation resource wizard also freezes selected published v1 through prepare and execute')

  await page
    .getByRole('link', { name: /工作流|Workflows/, exact: true })
    .first()
    .click()
  await page.getByLabel(/工作流名称|Workflow name/).waitFor()
  await page
    .getByRole('button', { name: /下一页版本|Next versions/, exact: true })
    .click()
  await page
    .getByRole('button', { name: /查看版本 v1|View version v1/, exact: true })
    .click()
  await page.getByLabel(/工作流名称|Workflow name/).waitFor()
  assert.equal(
    await page.getByLabel(/工作流名称|Workflow name/).inputValue(),
    definition.name,
  )
  await page
    .getByRole('button', { name: /返回草稿|Back to draft/, exact: true })
    .click()
  record(
    'Workflow history pages and previews immutable v1 without changing the saved draft',
  )

  await page.getByLabel(/工作流名称|Workflow name/).fill('Conflict candidate')
  await page
    .getByRole('button', { name: /新建任务|New task/, exact: true })
    .click()
  await page
    .getByRole('alert')
    .filter({
      hasText:
        /未保存内容或待核对请求|unsaved content or an unresolved request/,
    })
    .waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(
    await page.getByLabel(/工作流名称|Workflow name/).inputValue(),
    'Conflict candidate',
  )
  record('Global New task cannot replace a dirty Workflow navigation guard')
  const styleWriteCount = report.writes.length
  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: /偏好设置|Preferences/, exact: true })
    .click()
  await page
    .getByRole('dialog', { name: /偏好设置|Preferences/, exact: true })
    .getByRole('radio', { name: 'Zira', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await page.locator('.wb-theme[data-style="zira"]').waitFor()
  assert.equal(
    await page.getByLabel(/工作流名称|Workflow name/).inputValue(),
    'Conflict candidate',
  )
  assert.equal(report.writes.length, styleWriteCount)
  record(
    'Live Astryx theme change preserves unsaved Workflow definition without a write',
  )
  const concurrent = await api('/workflows/local-research')
  await post('/workflows/local-research/draft', {
    request_id: `browser-concurrent-${suffix}`,
    expected_revision: concurrent.revision,
    definition: { ...concurrent.definition, name: 'Concurrent server edit' },
  })
  await page.getByRole('button', { name: /保存草稿|Save draft/ }).click()
  await page
    .getByRole('alert')
    .filter({
      hasText: /版本或依赖已改变|revision or its dependencies changed/,
    })
    .waitFor()
  assert.equal(
    await page.getByLabel(/工作流名称|Workflow name/).inputValue(),
    'Conflict candidate',
  )
  record('cas-conflict-preserves-local-candidate')

  await page.reload()
  await page.getByRole('heading', { name: /工作流|Workflows/ }).waitFor()
  await page
    .getByLabel(/工作流名称|Workflow name/)
    .fill('Unknown response candidate')
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
  await page
    .getByRole('button', { name: /核对原请求|Check original request/ })
    .click()
  await page
    .getByText(/草稿修订|Draft revision/)
    .first()
    .waitFor()
  record('unknown-write-reconciles-by-get')

  await page
    .getByRole('button', {
      name: /检查发布影响|Check publication impact/,
      exact: true,
    })
    .click()
  const publication = page.getByRole('dialog')
  await publication.getByRole('checkbox').check()
  const versionCountBeforeLostPublish = (await api('/workflows/local-research/versions')).total
  await page.route('**/api/workflows/local-research/publish', async (route) => {
    await route.fetch()
    await route.abort()
  })
  await publication
    .getByRole('button', { name: /确认发布|Confirm publication/, exact: true })
    .click()
  await page
    .getByRole('alert')
    .filter({ hasText: /写入结果尚未确认|write outcome is unconfirmed/ })
    .waitFor()
  const retainedRequest = new URLSearchParams(page.url().split('?')[1]).get(
    'workflowRequest',
  )
  assert.ok(retainedRequest)
  await page
    .getByRole('button', { name: /新建任务|New task/, exact: true })
    .click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.ok(page.url().includes(retainedRequest))
  record('Global New task cannot bypass an unresolved Workflow publication')
  const publishWrites = report.writes.length
  await page.reload()
  await page
    .getByRole('button', {
      name: /核对原请求|Check original request/,
      exact: true,
    })
    .click()
  await page
    .getByText(/版本 \d+ 已发布|Version \d+ published/)
    .first()
    .waitFor()
  assert.ok(!page.url().includes('workflowRequest='))
  assert.equal(report.writes.length, publishWrites)
  assert.equal((await api('/workflows/local-research/versions')).total, versionCountBeforeLostPublish + 1)
  await page.unroute('**/api/workflows/local-research/publish')
  record(
    'Lost publication survives reload and reconciles the original ledger by GET without publishing again',
  )

  await page
    .getByLabel(/工作流名称|Workflow name/)
    .fill('Dirty guard candidate')
  await page
    .getByRole('link', { name: /模型与资源|Models & resources/ })
    .first()
    .click()
  const guard = page.getByRole('dialog')
  await guard.waitFor()
  await guard
    .getByRole('button', { name: /继续编辑|Keep editing/ })
    .first()
    .click()
  assert.match(page.url(), /#workflows/)
  await page
    .getByRole('link', { name: /模型与资源|Models & resources/ })
    .first()
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /放弃修改|Discard changes/ })
    .click()
  await page
    .getByRole('heading', { name: /模型与资源|Models & resources/ })
    .waitFor()
  record('dirty-navigation-guard')
  await page
    .getByRole('link', { name: /工作流|Workflows/ })
    .first()
    .click()
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
  await page.screenshot({
    path: resolve(out, 'workflow-mobile-en-gothic.png'),
    fullPage: true,
  })
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageErrors: [],
  }))
  assert.ok(layout.scrollWidth <= layout.viewport)
  record('mobile-en-gothic-no-horizontal-overflow')

  for (const [style, mode, width, locale] of [
    ['neutral', 'light', 1440, 'zh'],
    ['neutral', 'dark', 390, 'en'],
    ['zira', 'light', 1440, 'en'],
    ['zira', 'dark', 390, 'zh'],
    ['y2k', 'light', 1440, 'zh'],
    ['y2k', 'dark', 390, 'en'],
  ]) {
    const writesBefore = report.writes.length
    await page.evaluate(
      ({ style, mode, locale }) => {
        localStorage.setItem('mybot.style', style)
        localStorage.setItem('mybot.mode', mode)
        localStorage.setItem('mybot.locale', locale)
      },
      { style, mode, locale },
    )
    await page.setViewportSize({ width, height: 900 })
    await page.reload()
    await page
      .locator(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`)
      .waitFor()
    const input = page.getByRole('textbox', {
      name: locale === 'zh' ? '工作流名称' : 'Workflow name',
      exact: true,
    })
    await input.waitFor()
    assert.equal(await input.inputValue(), 'Unknown response candidate')
    const geometry = await page.locator('.wb-theme').evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        color: style.color,
        background: style.backgroundColor,
        font: style.fontFamily,
        radius: getComputedStyle(document.querySelector('input')).borderRadius,
      }
    })
    assert.ok(geometry.overflow <= 1)
    const historyGeometry = await page.locator('.wb-workflow-history-list li').evaluateAll(rows => rows.map(row => ({
      height: row.getBoundingClientRect().height,
      nameWidth: row.querySelector(':scope > span')?.getBoundingClientRect().width ?? 0,
    })))
    assert.ok(historyGeometry.every(row => row.height < 180 && row.nameWidth >= 100), JSON.stringify(historyGeometry))
    assert.equal(report.writes.length, writesBefore)
    report.geometry.push({ style, mode, width, locale, ...geometry, historyGeometry })
    await page.screenshot({
      path: resolve(out, `workflow-${style}-${mode}-${width}.png`),
      fullPage: true,
    })
    record(
      `${style}/${mode}/${width}/${locale}: Workflow configuration renders without overflow or writes`,
    )
  }
  assert.ok(
    new Set(
      report.geometry.map(
        (item) =>
          `${item.color}/${item.background}/${item.font}/${item.radius}`,
      ),
    ).size >= 3,
  )
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.pageErrors, [])
} catch (reason) {
  report.failure = reason.stack
  await page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw reason
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}

if (report.pageErrors.length || report.externalRequests.length) {
  throw new Error(JSON.stringify(report))
}
console.log(JSON.stringify(report, null, 2))
