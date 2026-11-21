import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const out = resolve(
  process.env.TASK_CONVERSATION_LIVE_EVIDENCE_DIR ?? '/tmp/mybot-turn-live',
)
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
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
})
const report = {
  fixture: true,
  checks: [],
  errors: [],
  writes: [],
  screenshots: [],
}
let losePrepare = false,
  loseExecute = false
await context.route('**/api/**', async (route) => {
  const r = route.request(),
    url = new URL(r.url())
  if (r.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: r.method() })
  if (
    (losePrepare && url.pathname.endsWith('/prepare')) ||
    (loseExecute && url.pathname.endsWith('/execute'))
  ) {
    if (url.pathname.endsWith('/prepare')) losePrepare = false
    else loseExecute = false
    await route.fetch()
    await route.abort('failed')
    return
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (e) => report.errors.push(e.message))
const record = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(
        `/api${path}`,
        body === undefined
          ? undefined
          : {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Workbench-Request': '1',
              },
              body: JSON.stringify(body),
            },
      )
      const result = await r.json()
      if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(result)}`)
      return result
    },
    { path, body },
  )
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  report.screenshots.push(`${name}.png`)
}
let task
const conversation = async () => {
  await page.goto(`${base}#task/${task.id}?taskTab=conversation`)
  await page.reload()
  await page
    .getByRole('textbox', { name: 'Supplemental requirements', exact: true })
    .waitFor()
}
async function save(content) {
  await page
    .getByRole('textbox', { name: 'Supplemental requirements', exact: true })
    .fill(content)
  await page.getByRole('button', { name: 'Save message', exact: true }).click()
  await page
    .locator('.wb-task-message-content')
    .filter({ hasText: content })
    .waitFor()
  await page.waitForFunction(() => !location.hash.includes('taskSend='))
}
const message = (content) =>
  page.locator('.wb-task-message').filter({ hasText: content })
async function confirmWizard() {
  const dialog = page.getByRole('dialog', {
    name: 'Review context & resources',
    exact: true,
  })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Next', exact: true }).click()
  await dialog.getByRole('button', { name: 'Next', exact: true }).click()
  await dialog.getByRole('checkbox').check()
  await dialog
    .getByRole('button', { name: 'Confirm & start run', exact: true })
    .click()
  return dialog
}
async function waitRun(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await api(`/runs/${id}`)
    if (value.run?.status === 'succeeded' && value.calls?.length === 4)
      return value
    await page.waitForTimeout(100)
  }
  throw new Error('fixture_run_did_not_finish')
}
try {
  await page.goto(base)
  await api('/auth', { token: 'astryx-browser-fixture' })
  await page.reload()
  const before = await api('/bootstrap')
  assert.deepEqual(
    [
      before.projects.length,
      before.tasks.length,
      before.runs.length,
      before.models.length,
    ],
    [0, 0, 0, 0],
  )
  assert.equal(before.capabilities.task_conversation, true)
  const project = await api('/projects', {
    name: 'Task conversation fixture',
    goal: 'A durable user goal with immutable follow-up Runs.',
    notes: 'Fixture only. No real model or external account.',
    directory: '.',
  })
  const model = await api('/models', {
    name: 'FakeProvider turn fixture',
    endpoint: 'http://127.0.0.1:9999/v1',
    model: 'fixture-only',
  })
  task = await api('/tasks', {
    project_id: project.id,
    title: 'Persistent task requirements',
    goal: 'Analyze the explicitly supplied repository and preserve the Task goal.',
    acceptance: 'Produce a verifiable proposal without executing tools.',
    files: ['README.md'],
  })
  await page.reload()
  await conversation()
  const firstContent =
    'Round one: focus on the boundary of device handoff and preserve unknown costs.'
  const secondContent =
    'Round two: focus on connector identity; do not inherit the first supplemental message.'
  const preWrites = report.writes.length
  await save(firstContent)
  let timeline = await api(`/tasks/${task.id}/turns`)
  const first = timeline.items[0]
  assert.equal(first.state, 'saved')
  assert.equal((await api('/bootstrap')).runs.length, 0)
  assert.ok(
    !report.writes.slice(preWrites).some((x) => x.path.endsWith('/preview')),
  )
  await page.reload()
  await page
    .locator('.wb-task-message-content')
    .filter({ hasText: firstContent })
    .waitFor()
  await shot('live-saved-message')
  record(
    'Real SQLite message survives reload; saving does not read context or create a Run',
  )

  await message(firstContent)
    .getByRole('button', { name: 'Arrange next run', exact: true })
    .click()
  const dialog = await confirmWizard()
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForURL(/taskTab=work/)
  timeline = await api(`/tasks/${task.id}/turns`)
  const linked = timeline.items[0]
  assert.equal(linked.state, 'applied')
  const run = await waitRun(linked.run_id)
  assert.ok(run.run.context.goal.includes(firstContent))
  assert.equal(run.task.goal, task.goal)
  assert.equal(run.run.request_id, first.request_id)
  assert.equal(run.calls.length, 4)
  const immutable = structuredClone(run.run.context)
  await shot('live-first-agent-run')
  record(
    'Explicit wizard creates exactly one linked FakeProvider Run with selected supplemental goal and original Task unchanged',
  )

  await conversation()
  await save(secondContent)
  losePrepare = true
  await message(secondContent)
    .getByRole('button', { name: 'Arrange next run', exact: true })
    .click()
  const lostPrepareDialog = await confirmWizard()
  await lostPrepareDialog
    .getByRole('button', { name: 'Check turn receipt', exact: true })
    .click()
  await lostPrepareDialog
    .getByText(
      'This turn context and resources are locked. Fresh execution consent is still required.',
      { exact: true },
    )
    .waitFor()
  timeline = await api(`/tasks/${task.id}/turns`)
  assert.equal(timeline.prepared.content, secondContent)
  assert.equal((await api('/bootstrap')).runs.length, 1)
  await page.reload()
  await conversation()
  const prepared = await api(`/tasks/${task.id}/turns`)
  assert.equal(prepared.prepared.id, timeline.prepared.id)
  await shot('live-prepared-after-reload')
  record(
    'Lost preparation response is reconciled by GET; reload restores exact locked candidate without another Run',
  )

  await message(secondContent)
    .getByRole('button', { name: 'Continue prepared run', exact: true })
    .click()
  loseExecute = true
  const lostExecuteDialog = await confirmWizard()
  await lostExecuteDialog
    .getByRole('button', { name: 'Check turn receipt', exact: true })
    .click()
  await lostExecuteDialog.waitFor({ state: 'hidden' })
  await page.waitForURL(/taskTab=work/)
  const afterTurns = await api(`/tasks/${task.id}/turns`)
  const second = afterTurns.items.find((x) => x.id === prepared.prepared.id)
  assert.equal(second.state, 'applied')
  assert.equal(afterTurns.prepared, null)
  const nextRun = await waitRun(second.run_id)
  assert.ok(nextRun.run.context.goal.includes(secondContent))
  assert.ok(!nextRun.run.context.goal.includes(firstContent))
  assert.deepEqual((await api(`/runs/${linked.run_id}`)).run.context, immutable)
  assert.equal(nextRun.task.goal, task.goal)
  assert.equal((await api('/bootstrap')).runs.length, 2)
  const reexecuted = await api(`/tasks/${task.id}/turns/${second.id}/execute`, {
    candidate_hash: second.candidate.candidate_hash,
    consent: true,
  })
  assert.equal(reexecuted.run_id, second.run_id)
  assert.equal((await api('/bootstrap')).runs.length, 2)
  record(
    'Lost execute response resolves to exact applied receipt; repeated same-candidate execution cannot create a third Run; old snapshot unchanged',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'zh'))
  await page.reload()
  await page.goto(`${base}#task/${task.id}?taskTab=conversation`)
  await page.getByRole('textbox', { name: '补充要求', exact: true }).waitFor()
  await page
    .locator('.wb-task-message-content')
    .filter({ hasText: secondContent })
    .waitFor()
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  )
  await shot('live-mobile-conversation')
  assert.deepEqual(report.errors, [])
  record(
    'Chinese390px task conversation displays both real message-to-Run links without document overflow',
  )
} catch (error) {
  report.failure = error.stack
  await page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
