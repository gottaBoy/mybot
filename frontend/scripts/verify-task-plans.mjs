import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/',
  origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.PLAN_EVIDENCE_DIR ?? '/tmp/mybot-task-plans')
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  if (!localStorage.getItem('mybot.locale'))
    localStorage.setItem('mybot.locale', 'en')
  if (!localStorage.getItem('mybot.style'))
    localStorage.setItem('mybot.style', 'neutral')
  if (!localStorage.getItem('mybot.mode'))
    localStorage.setItem('mybot.mode', 'light')
})
const report = {
  checks: [],
  errors: [],
  external: [],
  writes: [],
  screenshots: [],
  geometry: [],
}
const check = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
context.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  if (url.protocol.startsWith('http') && url.origin !== origin) {
    report.external.push(url.origin)
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => report.errors.push(error.message))
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, data: await response.json() }
    },
    { path, body },
  )
}
async function poll(read, label) {
  for (let index = 0; index < 150; index++) {
    if (await read()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${label}`)
}
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
async function openTask(id, tab = 'goal', runId) {
  const query = new URLSearchParams()
  if (tab !== 'goal') query.set('taskTab', tab)
  if (runId) query.set('taskRun', runId)
  await page.goto(`${base}#task/${id}${query.size ? `?${query}` : ''}`)
  await page.reload()
  await page
    .getByRole('button', { name: 'Arrange execution', exact: true })
    .waitFor()
}
async function arrange(id) {
  await page
    .getByRole('button', { name: 'Arrange execution', exact: true })
    .click()
  const form = page.locator('.wb-form')
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('checkbox').check()
  await form
    .getByRole('button', { name: 'Confirm & start run', exact: true })
    .click()
  let detail
  await poll(async () => {
    const read = (await api(`/tasks/${id}/detail`)).data
    const run = read.item.latest_run
    if (!run) return false
    detail = (await api(`/runs/${run.id}`)).data
    return ['succeeded', 'failed'].includes(detail.run.status)
  }, 'actual fixture research')
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  return detail
}
const disabled = async (locator) =>
  (await locator.getAttribute('aria-disabled')) === 'true' ||
  (await locator.isDisabled())
try {
  await page.goto(base)
  assert.equal(
    (await api('/auth', { token: 'astryx-browser-fixture' })).status,
    200,
  )
  const initial = (await api('/bootstrap')).data
  assert.equal(initial.tasks.length, 0)
  assert.equal(initial.capabilities.task_plans, true)
  const project = (
    await api('/projects', {
      name: 'Goal decomposition acceptance',
      directory: '.',
      goal: 'Deliver reviewed source research and validation advice',
      notes: 'Dedicated task-plan fixture; injected model only',
    })
  ).data
  const model = (
    await api('/models', {
      name: 'Task-plan research fixture',
      model: 'fake-test',
      endpoint: 'http://127.0.0.1:9999/v1',
      key_env: '',
    })
  ).data
  const parent = (
    await api('/tasks', {
      project_id: project.id,
      title: '将研发目标拆成可执行、可审查的工作',
      goal: 'Analyze explicit source constraints, obtain human review, then develop a bounded validation proposal.',
      acceptance:
        'Real child Tasks have explicit goals, acceptance, dependencies and persistent execution evidence.',
      files: ['README.md'],
    })
  ).data
  await openTask(parent.id)
  await page
    .getByRole('button', { name: 'Break down task', exact: true })
    .click()
  const editor = () => page.getByTestId('task-plan-editor')
  const dialog = () =>
    page.getByRole('dialog', { name: 'Break down task', exact: true })
  await dialog().getByRole('button', { name: 'Close', exact: true }).click()
  await dialog().waitFor({ state: 'hidden' })
  assert.equal((await api('/bootstrap')).data.tasks.length, 1)
  check(
    'A pristine Task breakdown opens and closes without file preview, task creation or model execution',
  )
  await page
    .getByRole('button', { name: 'Break down task', exact: true })
    .click()
  const sourceTitle = '梳理源码边界与未知项'
  const childTitle = '根据已验收结论设计验证步骤'
  const first = () =>
    editor().getByRole('region', { name: 'Subtask 1', exact: true })
  const second = () =>
    editor().getByRole('region', { name: 'Subtask 2', exact: true })
  for (const [section, title, goal, acceptance] of [
    [
      first,
      sourceTitle,
      'Analyze the selected README and record source boundaries with explicit unknowns.',
      'A final report states the source evidence, unresolved assumptions and review scope.',
    ],
    [
      second,
      childTitle,
      'Develop concrete validation advice after the source report has been reviewed.',
      'The validation report has actionable steps and clearly separates executed tests from recommendations.',
    ],
  ]) {
    await section()
      .getByRole('textbox', { name: 'Task title', exact: true })
      .fill(title)
    await section()
      .getByRole('textbox', { name: 'Task goal', exact: true })
      .fill(goal)
    await section()
      .getByRole('textbox', { name: 'Acceptance', exact: true })
      .fill(acceptance)
    await section()
      .getByRole('checkbox', { name: 'README.md', exact: true })
      .check()
  }
  await second()
    .getByRole('checkbox', { name: sourceTitle, exact: true })
    .check()
  await first().getByRole('checkbox', { name: childTitle, exact: true }).check()
  const previewPath = `/api/tasks/${parent.id}/plan/preview`,
    savePath = `/api/tasks/${parent.id}/plan`
  await editor()
    .getByRole('button', { name: 'Review task breakdown', exact: true })
    .click()
  await editor()
    .getByText(
      'Provide goals and acceptance for 2 to 8 tasks. Dependencies must be acyclic.',
      { exact: true },
    )
    .waitFor()
  assert.equal(
    report.writes.filter((write) => write.path === previewPath).length,
    0,
  )
  await first()
    .getByRole('checkbox', { name: childTitle, exact: true })
    .uncheck()
  check(
    'Real goals and acceptance remain editable; cyclic prerequisites fail locally before any preview or mutation',
  )
  await page.route(`**${previewPath}`, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await editor()
    .getByRole('button', { name: 'Review task breakdown', exact: true })
    .click()
  await editor()
    .getByText(
      'The breakdown could not be verified. Check the parent context, file scope or existing plan.',
      { exact: true },
    )
    .waitFor()
  assert.equal(
    await first()
      .getByRole('textbox', { name: 'Task title', exact: true })
      .inputValue(),
    sourceTitle,
  )
  await page.unroute(`**${previewPath}`)
  await editor()
    .getByRole('button', { name: 'Review task breakdown', exact: true })
    .click()
  await editor()
    .getByRole('region', { name: 'Verified breakdown', exact: true })
    .waitFor()
  assert.equal((await api('/bootstrap')).data.tasks.length, 1)
  await capture('verified-breakdown-desktop.png')
  let resolveLost, rejectLost
  const lost = new Promise((resolve, reject) => {
    resolveLost = resolve
    rejectLost = reject
  })
  await page.route(`**${savePath}`, async (route) => {
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      const receipt = await response.json()
      await route.abort('failed')
      resolveLost(receipt)
    } catch (error) {
      rejectLost(error)
    }
  })
  await editor()
    .getByRole('checkbox', {
      name: 'Confirm creating these tasks and fixed dependencies without starting a model.',
      exact: true,
    })
    .check()
  await editor()
    .getByRole('button', { name: 'Confirm subtask creation', exact: true })
    .click()
  const receipt = await lost
  await editor()
    .getByText(
      'Creation outcome is unknown. Keep and check the original request; do not repeat creation.',
      { exact: true },
    )
    .waitFor()
  await page.unroute(`**${savePath}`)
  assert.ok(page.url().includes(`taskPlanRequest=${receipt.request_id}`))
  assert.equal((await api('/bootstrap')).data.runs.length, 0)
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('taskPlanRequest='))
  await page.locator('.wb-task-plan-items > li').first().waitFor()
  assert.equal((await api('/bootstrap')).data.tasks.length, 3)
  assert.equal(
    report.writes.filter((write) => write.path === savePath).length,
    1,
  )
  const source = receipt.result.plan.items[0].task,
    child = receipt.result.plan.items[1].task
  check(
    'Lost creation restores the original exact GET receipt after reload, with exactly two real child Tasks and no Run',
  )
  await openTask(child.id)
  await page
    .getByText('Waiting for prerequisite review', { exact: true })
    .waitFor()
  assert.ok(
    await disabled(
      page.getByRole('button', { name: 'Arrange execution', exact: true }),
    ),
  )
  assert.ok(
    await disabled(
      page.getByRole('button', { name: 'Implement & validate', exact: true }),
    ),
  )
  const contextHash = (await api(`/tasks/${child.id}/preview`, {})).data
    .context_hash
  const blocked = await api(`/tasks/${child.id}/runs`, {
    coordinator_model: model.id,
    researcher_model: model.id,
    reviewer_model: model.id,
    context_hash: contextHash,
    consent: true,
    request_id: 'blocked-dependent-request',
  })
  assert.equal(blocked.status, 409)
  assert.equal((await api('/bootstrap')).data.runs.length, 0)
  await capture('prerequisite-blocked-desktop.png')
  check(
    'Dependent research and coding controls stay blocked, and direct Run POST also rejects without a model call',
  )
  await openTask(source.id)
  const sourceRun = await arrange(source.id)
  assert.equal(sourceRun.calls.length, 4)
  const sourceReport = sourceRun.artifacts.find(
    (item) => item.kind === 'report',
  )
  await openTask(child.id)
  await page.getByText('Awaiting report review', { exact: true }).waitFor()
  assert.ok(
    await disabled(
      page.getByRole('button', { name: 'Arrange execution', exact: true }),
    ),
  )
  await capture('successful-but-unreviewed.png')
  check(
    'A successful prerequisite Run does not unblock its dependent until the actual final report is accepted',
  )
  await openTask(source.id, 'review', sourceRun.run.id)
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await poll(
    async () =>
      (await api(`/runs/${sourceRun.run.id}`)).data.artifacts.find(
        (item) => item.id === sourceReport.id,
      ).decision === 'accepted',
    'human artifact decision',
  )
  await openTask(child.id)
  await page.getByText('Prerequisites satisfied', { exact: true }).waitFor()
  assert.equal(
    await disabled(
      page.getByRole('button', { name: 'Arrange execution', exact: true }),
    ),
    false,
  )
  const result = await arrange(child.id)
  assert.equal(result.calls.length, 4)
  const gate = result.run.context.task_dependencies
  assert.equal(gate.prerequisites[0].latest_run.id, sourceRun.run.id)
  assert.equal(gate.prerequisites[0].reports[0].id, sourceReport.id)
  assert.equal(gate.prerequisites[0].reports[0].decision, 'accepted')
  assert.ok(!result.run.context.text.includes(sourceReport.content))
  assert.equal((await api('/bootstrap')).data.runs.length, 2)
  check(
    'Human report acceptance unlocks the real dependent Run, recording admission identity without appending prerequisite output to model context',
  )
  await openTask(source.id, 'review', sourceRun.run.id)
  await page
    .getByRole('button', { name: 'Request changes', exact: true })
    .click()
  await poll(
    async () =>
      (await api(`/runs/${sourceRun.run.id}`)).data.artifacts.find(
        (item) => item.id === sourceReport.id,
      ).decision === 'changes_requested',
    'withdraw accepted report',
  )
  await openTask(child.id, 'work', result.run.id)
  await page
    .getByText('Waiting for prerequisite review', { exact: true })
    .waitFor()
  assert.ok(
    await disabled(
      page.getByRole('button', { name: 'Arrange execution', exact: true }),
    ),
  )
  await page.getByText('Confirmed context boundary', { exact: true }).click()
  await page
    .getByTestId('dependency-admission')
    .locator(':scope > summary')
    .click()
  await capture('current-block-and-original-admission.png')
  assert.equal(
    (await api(`/runs/${result.run.id}`)).data.run.status,
    'succeeded',
  )
  check(
    'Withdrawing prior review blocks future execution while preserving completed Run status and its original admission evidence',
  )
  await openTask(parent.id)
  for (const style of ['neutral', 'zira', 'y2k'])
    for (const mode of ['light', 'dark']) {
      const locale = mode === 'dark' ? 'zh' : 'en',
        width = mode === 'dark' ? 390 : 1440
      await page.evaluate(
        ({ style, mode, locale }) => {
          localStorage.setItem('mybot.style', style)
          localStorage.setItem('mybot.mode', mode)
          localStorage.setItem('mybot.locale', locale)
        },
        { style, mode, locale },
      )
      await page.setViewportSize({ width, height: 1000 })
      await page.reload()
      await page.locator('.wb-task-plan-items > li').first().waitFor()
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        items: [...document.querySelectorAll('.wb-task-plan-items > li')].map(
          (item) => item.getBoundingClientRect().toJSON(),
        ),
      }))
      assert.ok(geometry.scroll <= geometry.width + 1)
      report.geometry.push({ style, mode, locale, ...geometry })
      await capture(`plan-${style}-${mode}.png`)
    }
  check(
    'Published tasks, goals, acceptance and prerequisite review states render in three styles, both modes, English desktop and Chinese mobile',
  )
  report.actual = {
    parent_task_id: parent.id,
    source_task_id: source.id,
    dependent_task_id: child.id,
    source_run_id: sourceRun.run.id,
    dependent_run_id: result.run.id,
    source_calls: sourceRun.calls.length,
    dependent_calls: result.calls.length,
    operation_id: receipt.request_id,
    plan_hash: receipt.preview_hash,
  }
  await writeFile(
    resolve(out, 'plan-creation-receipt.json'),
    JSON.stringify(receipt, null, 2),
  )
  await writeFile(
    resolve(out, 'dependency-admission.json'),
    JSON.stringify(gate, null, 2),
  )
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (error) {
  report.failure = String(error)
  await capture('failure.png').catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
