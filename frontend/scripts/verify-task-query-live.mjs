import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'A disposable API fixture is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_QUERY_LIVE_EVIDENCE_DIR ?? '/tmp/mybot-task-query-live',
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
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
const report = {
  fixture: true,
  source: 'Actual isolated HTTP/API/SQLite through a production frontend',
  checks: [],
  errors: [],
  writes: [],
  screenshots: [],
}
await mkdir(out, { recursive: true })
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
async function api(path, body, expected = 200) {
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
  assert.equal(value.status, expected, JSON.stringify(value.body))
  return value.body
}
function record(name) {
  report.checks.push(name)
  console.log(`PASS ${name}`)
}
function locationFor(query, sorts, pageNumber, project) {
  const params = new URLSearchParams({
    q: query.text,
    view: 'list',
    page: String(pageNumber),
    states: JSON.stringify(query.states),
    sorts: JSON.stringify(sorts),
  })
  if (query.projects.length)
    params.set('projects', JSON.stringify(query.projects))
  return `${base}#${project ? `project/${project}` : 'workbench'}?${params}`
}
async function expected(query, sorts = [], pageNumber = 1, scope) {
  const params = new URLSearchParams({
    query: JSON.stringify(query),
    sorts: JSON.stringify(sorts),
    page: String(pageNumber),
    page_size: '20',
  })
  if (scope) params.set('scope_project_id', scope)
  return api(`/tasks/query?${params}`)
}
async function assertRows(response, mobile = false) {
  const rows = page.locator(
    mobile
      ? '.wf-mobile-list .wf-title-button'
      : '.wf-desktop-table .wf-title-button',
  )
  const wanted = response.items.map((item) => item.task.id)
  for (let index = 0; index < 100; index++) {
    if (
      JSON.stringify(
        await rows.evaluateAll((elements) =>
          elements.map((element) => element.dataset.taskTrigger),
        ),
      ) === JSON.stringify(wanted)
    )
      break
    await page.waitForTimeout(50)
  }
  assert.deepEqual(
    await rows.evaluateAll((elements) =>
      elements.map((element) => element.dataset.taskTrigger),
    ),
    wanted,
  )
  assert.equal(
    await page.locator('.wf-result-count').innerText(),
    `${response.total} tasks`,
  )
}
try {
  await page.goto(base)
  await api('/auth', { token: 'astryx-browser-fixture' })
  const before = await api('/bootstrap')
  assert.match(
    before.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.equal(before.projects.length, 0, 'Use a fresh fixture for this test')
  assert.equal(before.capabilities.task_query, true)
  const alpha = await api(
    '/projects',
    { name: 'Query fixture Alpha', directory: '.' },
    201,
  )
  const beta = await api(
    '/projects',
    { name: 'Query fixture Beta', directory: '.' },
    201,
  )
  for (let index = 1; index <= 53; index++) {
    await api(
      '/tasks',
      {
        project_id: index % 2 ? alpha.id : beta.id,
        title: `Release ${index}`,
        goal: 'Verify bounded task queries without starting a model.',
        files: [],
      },
      201,
    )
  }
  await page.reload()
  await page.getByRole('table', { name: 'Tasks', exact: true }).waitFor()
  const query = { text: '', projects: [], states: [], jql: '', mode: 'basic' }
  const first = await expected(query)
  await assertRows(first)
  record('Actual first-page rows and total match the authenticated SQL query')
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  const second = await expected(query, [], 2)
  await assertRows(second)
  assert.equal(
    new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('page'),
    '2',
  )
  await page.reload()
  await assertRows(second)
  record(
    'Page 2 displays exact server IDs, is not resliced, and survives reload',
  )
  const sorts = [
    { sortKey: 'title', direction: 'descending' },
    { sortKey: 'id', direction: 'ascending' },
  ]
  await page.goto(locationFor(query, sorts, 2))
  const sorted = await expected(query, sorts, 2)
  await assertRows(sorted)
  assert.match(
    await page
      .locator('.wf-desktop-table .wf-title-button')
      .first()
      .innerText(),
    /Release 33/,
  )
  record(
    'Natural multi-sort has the same global page boundary in SQL and Astryx',
  )
  const filtered = {
    ...query,
    text: 'Release 4',
    projects: [alpha.id],
    states: ['pending'],
  }
  await page.goto(locationFor(filtered, [], 1, alpha.id))
  const fixed = await expected(filtered, [], 1, alpha.id)
  await assertRows(fixed)
  assert.ok(fixed.items.every((item) => item.task.project_id === alpha.id))
  record(
    'Project routing, pending state and literal query bind to the actual fixed SQL scope',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await assertRows(fixed, true)
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  )
  await page.screenshot({
    path: resolve(out, 'actual-mobile.png'),
    fullPage: true,
  })
  report.screenshots.push('actual-mobile.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(locationFor(query, sorts, 2))
  await assertRows(sorted)
  await page.screenshot({
    path: resolve(out, 'actual-desktop.png'),
    fullPage: true,
  })
  report.screenshots.push('actual-desktop.png')
  record(
    'Desktop and 390px mobile display the same real query projection without overflow',
  )
  const after = await api('/bootstrap')
  assert.equal(after.runs.length, before.runs.length)
  assert.ok(
    report.writes.every((write) =>
      ['/api/auth', '/api/projects', '/api/tasks'].includes(write.path),
    ),
  )
  assert.deepEqual(report.errors, [])
  record(
    'Only synthetic setup creates configuration; no model, Run, test or control request occurs',
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
