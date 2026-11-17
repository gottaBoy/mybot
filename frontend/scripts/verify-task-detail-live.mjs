import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_DETAIL_LIVE_EVIDENCE_DIR ?? '/tmp/mybot-task-detail-live',
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
await mkdir(out, { recursive: true })
const report = {
  fixture: true,
  source: 'Actual disposable HTTP/API/SQLite and production frontend',
  checks: [],
  errors: [],
  writes: [],
  screenshots: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('mybot.locale', 'en')
  localStorage.setItem('mybot.style', 'neutral')
  localStorage.setItem('mybot.mode', 'light')
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.protocol.startsWith('http') && url.origin !== origin
    ? route.abort()
    : route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => report.errors.push(error.message))
page.on('request', (request) => {
  const path = new URL(request.url()).pathname
  if (path.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path, method: request.method() })
})
async function api(path, body) {
  const value = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(
        `/api${path}`,
        body === undefined
          ? {}
          : {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Workbench-Request': '1',
              },
              body: JSON.stringify(body),
            },
      )
      return { status: response.status, body: await response.json() }
    },
    { path, body },
  )
  assert.equal(value.status, 200, JSON.stringify(value.body))
  return value.body
}
function record(name) {
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
const inspector = page.locator('.wf-task-inspector')
async function expectHistory(ids) {
  await page.waitForFunction(
    (wanted) =>
      JSON.stringify(
        [...document.querySelectorAll('.wf-history-row')].map((node) =>
          node.getAttribute('href').replace('#run/', ''),
        ),
      ) === JSON.stringify(wanted),
    ids,
  )
  assert.deepEqual(
    await inspector
      .locator('.wf-history-row')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href').replace('#run/', '')),
      ),
    ids,
  )
}
try {
  await page.goto(base)
  await api('/auth', { token: 'astryx-browser-fixture' })
  const bootstrap = await api('/bootstrap')
  assert.match(
    bootstrap.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.equal(bootstrap.capabilities.task_detail, true)
  assert.equal(bootstrap.capabilities.task_query, true)
  assert.equal(bootstrap.tasks.length, 2, 'Use the task-detail seed fixture')
  assert.equal(bootstrap.runs.length, 45)
  assert.equal(bootstrap.models.length, 0)
  const task = bootstrap.tasks.find(
    (value) =>
      bootstrap.runs.filter((run) => run.task_id === value.id).length === 45,
  )
  assert.ok(task)
  const runs = bootstrap.runs
    .filter((run) => run.task_id === task.id)
    .sort((a, b) =>
      a.created_at > b.created_at ? -1 : a.created_at < b.created_at ? 1 : 0,
    )
  const first = await api(`/tasks/${task.id}/detail?page=1&page_size=20`)
  assert.equal(first.history.total, 45)
  assert.deepEqual(
    first.history.items.map((run) => run.id),
    runs.slice(0, 20).map((run) => run.id),
  )
  record(
    'Actual detail response agrees with the seeded 45-Run history and latest task state',
  )
  await page.goto(
    `${base}#workbench?view=list&q=${encodeURIComponent(task.id)}`,
  )
  await page.reload()
  const trigger = page.locator('.wf-desktop-table .wf-title-button')
  await trigger.waitFor()
  assert.equal(await inspector.count(), 0)
  await trigger.click()
  await expectHistory(runs.slice(0, 20).map((run) => run.id))
  assert.equal(await inspector.locator('h2').innerText(), task.title)
  assert.ok(
    (await inspector.locator('.wf-inspector-goal').innerText()).includes(
      task.goal,
    ),
  )
  record(
    'Selected task opens real bounded detail through the same server-query list',
  )
  await inspector
    .getByRole('button', { name: 'Next history page', exact: true })
    .click()
  await expectHistory(runs.slice(20, 40).map((run) => run.id))
  assert.match(
    await inspector
      .getByRole('navigation', { name: 'Run history pagination' })
      .innerText(),
    /21-40 \/ 45/,
  )
  const listParams = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  assert.equal(listParams.get('page') ?? '1', '1')
  record(
    'History page 2 displays exact server IDs without changing the task-list page',
  )
  await page.screenshot({
    path: resolve(out, 'actual-history-page2.png'),
    fullPage: true,
  })
  report.screenshots.push('actual-history-page2.png')
  await inspector
    .getByRole('button', { name: 'Next history page', exact: true })
    .click()
  await expectHistory(runs.slice(40).map((run) => run.id))
  assert.equal(
    await inspector
      .getByRole('button', { name: 'Next history page', exact: true })
      .isDisabled(),
    true,
  )
  record('Last history page has five exact rows and a disabled Next action')
  await page.setViewportSize({ width: 390, height: 844 })
  await expectHistory(runs.slice(0, 20).map((run) => run.id))
  await inspector
    .getByRole('button', { name: 'Next history page', exact: true })
    .click()
  await expectHistory(runs.slice(20, 40).map((run) => run.id))
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  )
  record(
    '390px modal retains the selected task, restarts history at page 1, and can page real history',
  )
  await page.screenshot({
    path: resolve(out, 'actual-history-mobile.png'),
    fullPage: true,
  })
  report.screenshots.push('actual-history-mobile.png')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  assert.equal(await inspector.count(), 0)
  const after = await api('/bootstrap')
  assert.deepEqual(after.tasks, bootstrap.tasks)
  assert.deepEqual(after.runs, bootstrap.runs)
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  assert.deepEqual(report.errors, [])
  record(
    'Inspection leaves tasks/Runs unchanged and issues no model, control or configuration write',
  )
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
