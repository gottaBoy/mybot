import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'The seeded disposable project-reference API fixture is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.RUN_QUERY_ACTUAL_EVIDENCE_DIR ?? '/tmp/mybot-run-query-actual',
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
  source: 'Actual disposable HTTP/API/SQLite through a production frontend',
  fixtureSource: 'tests/seed_project_references_fixture.py',
  checks: [],
  errors: [],
  writes: [],
  blockedWrites: [],
  externalRequests: [],
  runQueryReads: [],
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
  const request = route.request()
  const url = new URL(request.url())
  if (url.protocol.startsWith('http') && url.origin !== origin) {
    report.externalRequests.push({ origin: url.origin, path: url.pathname })
    return route.abort()
  }
  if (
    url.pathname.startsWith('/api/') &&
    request.method() !== 'GET' &&
    !(url.pathname === '/api/auth' && request.method() === 'POST')
  ) {
    report.blockedWrites.push({
      path: url.pathname,
      method: request.method(),
    })
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => report.errors.push(error.message))
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
  if (url.pathname === '/api/runs/query')
    report.runQueryReads.push(Object.fromEntries(url.searchParams))
})
const emptyQuery = {
  text: '',
  projects: [],
  states: [],
  jql: '',
  mode: 'basic',
}
const projectId = 'reference-project-000'
const taskId = 'reference-task-000-0'
const latestRunId = 'reference-run-000-0-044'
const oldRunId = 'reference-run-000-0-000'

function record(message) {
  report.checks.push(message)
  console.log(`PASS ${message}`)
}
async function read(path) {
  const result = await page.evaluate(async (path) => {
    const response = await fetch(`/api${path}`)
    return { status: response.status, body: await response.json() }
  }, path)
  assert.equal(result.status, 200, JSON.stringify(result.body))
  return result.body
}
async function login() {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workbench-Request': '1',
      },
      body: JSON.stringify({ token: 'astryx-browser-fixture' }),
    })
    return { status: response.status, body: await response.json() }
  })
  assert.equal(result.status, 200, JSON.stringify(result.body))
}
function parameters(query, options = {}) {
  const params = new URLSearchParams({
    query: JSON.stringify(query),
    sorts: JSON.stringify(options.sorts ?? []),
    page: String(options.page ?? 1),
    page_size: String(options.pageSize ?? 20),
  })
  if (options.scope) params.set('scope_project_id', options.scope)
  return params
}
function expected(query = emptyQuery, options = {}) {
  return read(`/runs/query?${parameters(query, options)}`)
}
function locationFor(query = emptyQuery, options = {}) {
  const params = new URLSearchParams({
    view: 'table',
    mode: query.mode,
    q: query.text,
    states: JSON.stringify(query.states),
    projects: JSON.stringify(query.projects),
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  })
  if (query.jql) params.set('jql', query.jql)
  if (options.sorts?.length) {
    const rule = options.sorts[0]
    params.set('runOrder', `${rule.sortKey}:${rule.direction}`)
  }
  return `${base}#${options.scope ? `project/${options.scope}` : 'workbench'}?${params}`
}
function currentParameters() {
  return page.evaluate(() => Object.fromEntries(
    new URLSearchParams(location.hash.split('?')[1]),
  ))
}
async function assertRows(response) {
  const wanted = response.items.map((item) => item.run.id)
  await page.waitForFunction(
    ({ wanted, total }) => {
      const section = document.querySelector(
        '[data-testid="run-history-table"]',
      )
      if (!section || section.closest('.wf-results')?.getAttribute('aria-busy') === 'true')
        return false
      const actual = Array.from(section.querySelectorAll('a.wb-table-task'))
        .map((element) => element.getAttribute('href')?.slice('#run/'.length))
      return (
        JSON.stringify(actual) === JSON.stringify(wanted) &&
        document.querySelector('.wf-result-count')?.textContent.trim() ===
          `${total} runs`
      )
    },
    { wanted, total: response.total },
  )
  const section = page.getByTestId('run-history-table')
  const table = section.getByRole('table', {
    name: 'Filtered runs',
    exact: true,
  })
  const links = table.locator('a.wb-table-task')
  assert.deepEqual(
    await links.evaluateAll((elements) => elements.map(
      (element) => element.getAttribute('href')?.slice('#run/'.length),
    )),
    wanted,
  )
  assert.equal(await table.getAttribute('aria-rowcount'), String(response.total))
  assert.deepEqual(
    await links.evaluateAll((elements) => elements.map(
      (element) => element.closest('tr')?.getAttribute('aria-rowindex'),
    )),
    wanted.map((_, index) => String(
      (response.page - 1) * response.page_size + index + 1,
    )),
  )
  assert.equal(
    await page.getByTestId('run-history-range').innerText(),
    `${(response.page - 1) * response.page_size + 1}-${Math.min(response.page * response.page_size, response.total)} / ${response.total}`,
  )
  assert.equal(await section.locator('footer').count(), 1)
}
async function screenshot(name) {
  await page.screenshot({ path: resolve(out, name), fullPage: true })
  report.screenshots.push(name)
}
async function capacity(value) {
  await page.getByRole('combobox', { name: /^Runs per page/ }).click()
  await page.getByRole('option', {
    name: `${value} / page`,
    exact: true,
  }).click()
}

try {
  await page.goto(base)
  await login()
  const before = await read('/bootstrap')
  assert.match(
    before.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.equal(before.projects.length, 45)
  assert.equal(before.tasks.length, 45)
  assert.equal(before.runs.length, 88)
  assert.equal(before.models.length, 0)
  assert.equal(before.capabilities.run_query, true)
  const all = await expected(emptyQuery, { pageSize: 100 })
  assert.equal(all.schema_version, 1)
  assert.equal(all.unit, 'runs')
  assert.equal(all.sort_semantics, 'unicode-natural-v1')
  assert.equal(all.total, 88)
  assert.equal(all.items.length, 88)
  assert.deepEqual(
    all.items.map((item) => item.run.id).sort(),
    before.runs.map((run) => run.id).sort(),
  )
  assert.deepEqual(Object.keys(all.items[0]).sort(), [
    'project', 'run', 'state_category', 'task',
  ])
  assert.deepEqual(Object.keys(all.items[0].run).sort(), [
    'created_at', 'id', 'status', 'task_id',
  ])
  assert.deepEqual(Object.keys(all.items[0].task).sort(), [
    'id', 'project_id', 'title',
  ])
  assert.deepEqual(Object.keys(all.items[0].project).sort(), ['id', 'name'])
  record(
    'Actual SQLite endpoint returns all88 historical Run IDs in a minimal read-only projection',
  )

  const project = await expected(emptyQuery, { scope: projectId })
  assert.equal(project.total, 45)
  assert.equal(project.items.length, 20)
  assert.deepEqual(project.query.projects, [projectId])
  assert.ok(project.items.every((item) => item.project.id === projectId))
  const attentionQuery = { ...emptyQuery, states: ['attention'] }
  const attention = await expected(attentionQuery, { scope: projectId })
  assert.equal(attention.total, 15)
  assert.ok(attention.items.every(
    (item) => item.run.status === 'failed' && item.state_category === 'attention',
  ))
  const latest = await read(`/tasks/query?${parameters(
    { ...emptyQuery, states: ['completed'] },
    { scope: projectId },
  )}`)
  assert.equal(latest.total, 1)
  assert.equal(latest.items[0].task.id, taskId)
  assert.equal(latest.items[0].latest_run.id, latestRunId)
  assert.equal(latest.items[0].latest_run.status, 'succeeded')
  assert.equal(latest.items[0].attempts, 45)
  const currentAttention = await read(`/tasks/query?${parameters(
    attentionQuery,
    { scope: projectId },
  )}`)
  assert.equal(currentAttention.total, 0)
  record(
    'Project000 keeps45 historical Runs and15 failed attention records while the task latest Run is succeeded',
  )

  const first = await expected()
  await page.goto(locationFor())
  await page.reload()
  await page.getByRole('heading', { name: 'Run history', exact: true }).waitFor()
  await assertRows(first)
  assert.equal(first.total, 88)
  assert.equal(first.items.length, 20)
  await screenshot('actual-all-runs-page1.png')
  await page.getByRole('button', { name: 'Next run page', exact: true }).click()
  const second = await expected(emptyQuery, { page: 2 })
  await assertRows(second)
  assert.equal((await currentParameters()).page, '2')
  await page.reload()
  await assertRows(second)
  await screenshot('actual-all-runs-page2.png')
  record(
    'Actual UI displays exact20-row server pages, all88 total and global ARIA row positions; page2 survives reload',
  )

  await capacity(50)
  await assertRows(await expected(emptyQuery, { pageSize: 50 }))
  assert.equal((await currentParameters()).pageSize, '50')
  assert.equal((await currentParameters()).page, '1')
  await page.getByRole('button', { name: 'Next run page', exact: true }).click()
  const fiftyLast = await expected(emptyQuery, { page: 2, pageSize: 50 })
  assert.equal(fiftyLast.items.length, 38)
  await assertRows(fiftyLast)
  await screenshot('actual-fifty-last-page.png')
  await capacity(100)
  await assertRows(all)
  assert.equal((await currentParameters()).pageSize, '100')
  assert.equal((await currentParameters()).page, '1')
  record(
    'Runs per page changes committed URL capacity to50 and100, resets page and preserves the real38-row last page',
  )

  const sorts = [{ sortKey: 'id', direction: 'ascending' }]
  const sorted = await expected(emptyQuery, { sorts, page: 2 })
  await page.goto(locationFor(emptyQuery, { sorts, page: 2 }))
  await assertRows(sorted)
  assert.equal((await currentParameters()).runOrder, 'id:ascending')
  assert.equal(sorted.items[0].run.id, 'reference-run-000-0-020')
  record(
    'Run-specific URL sorting preserves the authenticated global server order on page2',
  )

  await page.goto(locationFor(emptyQuery, { scope: projectId }))
  await assertRows(project)
  await page.goto(locationFor(attentionQuery, { scope: projectId }))
  await assertRows(attention)
  await screenshot('actual-historical-attention.png')
  record(
    'Fixed-project UI renders45 historical Runs and15 own-status attention rows rather than the recovered task state',
  )

  await page.goto(locationFor(emptyQuery, { scope: projectId }))
  await assertRows(project)
  const search = page.locator('.wf-querybar').getByRole('searchbox', {
    name: 'Search',
    exact: true,
  })
  await search.fill(oldRunId)
  assert.equal((await currentParameters()).q ?? '', '')
  await assertRows(project)
  await search.press('Enter')
  const old = await expected(
    { ...emptyQuery, text: oldRunId },
    { scope: projectId },
  )
  assert.equal(old.total, 1)
  assert.equal(old.items[0].run.id, oldRunId)
  assert.equal(old.items[0].run.status, 'failed')
  await assertRows(old)
  assert.equal((await currentParameters()).q, oldRunId)
  await page.reload()
  await assertRows(old)
  await screenshot('actual-old-run-search.png')
  record(
    'Search drafts leave rows and URL unchanged; Enter and reload find the exact old failed Run ID',
  )

  await page.setViewportSize({ width: 390, height: 844 })
  const projectSecond = await expected(emptyQuery, {
    scope: projectId,
    page: 2,
  })
  await page.goto(locationFor(emptyQuery, { scope: projectId, page: 2 }))
  await assertRows(projectSecond)
  assert.ok(await page.evaluate(
    () => document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  ))
  await screenshot('actual-mobile-project-page2.png')
  record(
    '390px mobile uses the same exact bounded Run page and accessible global positions without document overflow',
  )

  const after = await read('/bootstrap')
  assert.deepEqual(after.projects, before.projects)
  assert.deepEqual(after.tasks, before.tasks)
  assert.deepEqual(after.runs, before.runs)
  assert.deepEqual(after.models, before.models)
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  assert.deepEqual(report.blockedWrites, [])
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.errors, [])
  record(
    'Original projects/tasks/Runs/models remain unchanged; only public fixture login POST occurred, with no execution requests',
  )
} catch (error) {
  report.failure = {
    message: error.message,
    stack: error.stack,
    tree: await page.locator('body').ariaSnapshot().catch(() => ''),
  }
  await page.screenshot({
    path: resolve(out, 'failure.png'),
    fullPage: true,
  }).catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
