import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'Explicit MYBOT_BROWSER_FIXTURE=1 is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname),
  'Only a local frontend may serve this fixture',
)
const out = resolve(
  process.env.WORKBENCH_EVIDENCE_DIR ??
    '/tmp/mybot-project-workspace-verification',
)
const playwright = resolve(
  process.env.PLAYWRIGHT_MODULE ??
    '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)
const executable = process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome'
assert.ok(existsSync(playwright), 'Use an existing Playwright installation')
assert.ok(existsSync(executable), 'Use an existing Chrome executable')

const projects = [
  ['scope-alpha', 'Alpha Project'],
  ['scope-beta', 'Beta Project'],
  ['scope-empty', 'Empty Project'],
].map(([id, name]) => ({
  id,
  name,
  goal: `Synthetic read-only ${name} context`,
  directory: id,
  notes: `Explicit fixture notes for ${id}`,
}))
const tasks = [
  ...Array.from({ length: 65 }, (_, index) => ({
    id: `alpha-task-${String(index + 1).padStart(2, '0')}`,
    project_id: 'scope-alpha',
    title: `Alpha task ${String(index + 1).padStart(2, '0')}`,
    goal: 'Only synthetic project scope-alpha; no provider execution.',
    acceptance: 'Keep this task within Alpha Project.',
    files: [],
    created_at: new Date(Date.UTC(2026, 10, 15, 0, index)).toISOString(),
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    id: `beta-task-${String(index + 1).padStart(2, '0')}`,
    project_id: 'scope-beta',
    title: `Beta task ${String(index + 1).padStart(2, '0')}`,
    goal: 'Only synthetic project scope-beta; never leak into Alpha.',
    acceptance: 'Keep this task within Beta Project.',
    files: [],
    created_at: '2026-11-15T01:00:00Z',
  })),
]
const runs = tasks.flatMap((task, index) => {
  if (task.project_id === 'scope-beta')
    return [
      {
        id: `beta-run-${String(index - 64).padStart(2, '0')}`,
        task_id: task.id,
        status: ['running', 'failed', 'paused', 'succeeded'][(index - 65) % 4],
        created_at: '2026-11-15T03:00:00Z',
      },
    ]
  const number = index + 1
  if (number % 5 === 4) return []
  const status = {
    0: 'succeeded',
    1: 'running',
    2: number === 2 ? 'succeeded' : 'failed',
    3: 'paused',
  }[number % 5]
  const current = {
    id: `alpha-run-${String(number).padStart(2, '0')}`,
    task_id: task.id,
    status,
    created_at: '2026-11-15T02:00:00Z',
    ...(number === 2 ? { source_run_id: 'alpha-recovered-old' } : {}),
  }
  return number === 2
    ? [
        {
          id: 'alpha-recovered-old',
          task_id: task.id,
          status: 'failed',
          created_at: '2026-11-14T02:00:00Z',
        },
        current,
      ]
    : [current]
})
const projection = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  workspace: '/synthetic/read-only-project-workspace',
  default_model_id: '',
  local_harnesses: [],
  capabilities: { backend_sync: false },
}
const alphaTasks = tasks.filter((task) => task.project_id === 'scope-alpha')
const betaTasks = tasks.filter((task) => task.project_id === 'scope-beta')
const alphaTaskIds = new Set(alphaTasks.map((task) => task.id))
const alphaRuns = runs.filter((run) => alphaTaskIds.has(run.task_id))
const latest = new Map()
for (const run of runs) {
  if (
    !latest.has(run.task_id) ||
    latest.get(run.task_id).created_at < run.created_at
  )
    latest.set(run.task_id, run)
}
const active = new Set([
  'queued',
  'running',
  'pause_requested',
  'cancel_requested',
])
const attention = new Set(['failed', 'interrupted', 'paused'])
function counts(records, isTask) {
  const statuses = records.map((record) =>
    isTask ? latest.get(record.id)?.status : record.status,
  )
  return {
    all: records.length,
    active: statuses.filter((status) => active.has(status)).length,
    attention: statuses.filter((status) => attention.has(status)).length,
    completed: statuses.filter((status) => status === 'succeeded').length,
  }
}
const evidence = {
  date: '2026-11-15',
  base,
  scope:
    'Synthetic, read-only project workspace browser verification. All /api requests fulfilled locally; provider and business writes forbidden.',
  fixture: {
    projects: projects.map((project) => ({
      id: project.id,
      tasks: tasks.filter((task) => task.project_id === project.id).length,
    })),
    alphaTaskCounts: counts(alphaTasks, true),
    betaTaskCounts: counts(betaTasks, true),
    alphaRunCounts: counts(alphaRuns, false),
    recoveredTask: 'alpha-task-02',
    originalHistoryRetained: true,
  },
  contracts: {
    projectScope:
      'Route project overrides a conflicting project URL parameter.',
    viewChange:
      'Normal view controls explicitly reset page to 1; query, filter, order and pageSize remain committed. Back/Forward restores the prior page.',
    sort: 'Task-list order is asserted against real rendered task IDs. Run history and board retain URL order without claiming identical column semantics.',
    network:
      'Only same-origin static assets continue to the frontend. Every API response is fulfilled by this script; no real backend is contacted.',
  },
  browser: null,
  checks: [],
  states: [],
  screenshots: [],
  requests: [],
  writeAttempts: [],
  unexpectedApi: [],
  blockedExternal: [],
  pageErrors: [],
  failures: [],
}
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(playwright).href)
let browser
let currentPage
let currentCheck = 'launch'

async function screenshot(page, name) {
  const filename = `${name}.png`
  await page.screenshot({ path: resolve(out, filename), fullPage: true })
  evidence.screenshots.push(filename)
}
function parameters(page) {
  const url = new URL(page.url())
  const result = new URLSearchParams(url.search)
  const marker = url.hash.indexOf('?')
  if (marker >= 0)
    new URLSearchParams(url.hash.slice(marker + 1)).forEach((value, key) =>
      result.set(key, value),
    )
  return Object.fromEntries(result)
}
async function poll(read, expected, message) {
  for (let index = 0; index < 80; index++) {
    const actual = await read()
    if (JSON.stringify(actual) === JSON.stringify(expected)) return actual
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 75))
  }
  assert.deepEqual(await read(), expected, message)
}
async function check(name, run) {
  currentCheck = name
  await run()
  evidence.checks.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
async function context(viewport) {
  const result = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await result.addInitScript((appOrigin) => {
    if (location.origin !== appOrigin) return
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.mode', 'light')
    localStorage.setItem('mybot.style', 'neutral')
    localStorage.setItem('mybot.density', 'comfortable')
  }, origin)
  await result.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      evidence.blockedExternal.push({
        method: request.method(),
        origin: url.origin,
        path: url.pathname,
      })
      return route.abort()
    }
    if (url.pathname.startsWith('/api/')) {
      const entry = { method: request.method(), path: url.pathname }
      evidence.requests.push(entry)
      if (request.method() !== 'GET') {
        evidence.writeAttempts.push(entry)
        return route.fulfill({
          status: 405,
          json: { detail: 'Fixture forbids all API writes' },
        })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          status: 200,
          json: { authenticated: true, required: false },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({ status: 200, json: projection })
      evidence.unexpectedApi.push(entry)
      return route.fulfill({
        status: 404,
        json: { detail: 'Not part of the read-only fixture' },
      })
    }
    return route.continue()
  })
  result.on('page', (page) =>
    page.on('pageerror', (error) =>
      evidence.pageErrors.push({
        message: error.message,
        stack: error.stack,
        url: page.url(),
      }),
    ),
  )
  return result
}
function table(page) {
  return page.getByRole('table', { name: 'Tasks', exact: true })
}
function scope(page) {
  return page.getByRole('navigation', { name: 'Task scope', exact: true })
}
async function taskIds(page) {
  return table(page)
    .locator('[data-task-trigger]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.dataset.taskTrigger)),
    ])
}
async function assertTaskRows(page, expected) {
  await table(page).waitFor({ state: 'visible' })
  await poll(
    () => taskIds(page),
    expected.map((task) => task.id),
    'Rendered task IDs follow fixed scope, order and page',
  )
  assert.equal(await table(page).locator('tbody tr').count(), expected.length)
}
async function assertHeadingCount(page, count, unit = 'tasks') {
  await poll(
    () => page.locator('.wf-heading .wf-result-count').innerText(),
    `${count} ${unit}`,
    'Heading count uses the scoped read model and correct unit',
  )
}
async function assertScopeCounts(page, expected, records = false) {
  for (const [key, label] of [
    ['all', records ? 'All runs' : 'All tasks'],
    ['active', 'Active'],
    ['attention', 'Needs attention'],
    ['completed', 'Completed'],
  ]) {
    const button = scope(page).getByRole('button', { name: label, exact: true })
    assert.equal(
      await button.locator('.wf-scope-count').innerText(),
      String(expected[key]),
    )
  }
  const selectedProject = await page.locator('main h1').innerText()
  for (const project of projects.filter(
    (project) => project.name !== selectedProject,
  ))
    assert.equal(
      await scope(page)
        .getByRole('button', { name: project.name, exact: true })
        .count(),
      0,
    )
  assert.equal(
    await scope(page)
      .getByRole('button', { name: 'All projects', exact: true })
      .count(),
    0,
  )
}
async function snapshot(page, label) {
  evidence.states.push({
    label,
    href: page.url(),
    params: parameters(page),
    heading: await page.locator('main h1').innerText(),
    count: await page.locator('.wf-heading .wf-result-count').innerText(),
  })
}
async function assertParams(page, expected) {
  await poll(
    async () => {
      const actual = parameters(page)
      return Object.fromEntries(
        Object.keys(expected).map((key) => [key, actual[key]]),
      )
    },
    expected,
    'Committed controls are represented in the URL',
  )
}
async function setSort(page, label) {
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
  for (let index = 0; index < 3; index++) {
    if (!(await page.getByRole('menu').count())) break
    await page.keyboard.press('Escape')
  }
}
async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(
    dimensions.document <= dimensions.viewport + 1,
    JSON.stringify(dimensions),
  )
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  })
  evidence.browser = { executable, version: browser.version() }
  const desktop = await context({ width: 1440, height: 1000 })
  const page = (currentPage = await desktop.newPage())
  const descending = [...alphaTasks].sort((a, b) =>
    b.title.localeCompare(a.title, 'en'),
  )
  await check(
    'Fixed project route rejects a conflicting project parameter and scopes all current counts',
    async () => {
      await page.goto(
        `${base}#project/scope-alpha?view=list&project=scope-beta`,
      )
      await page
        .getByRole('heading', { name: 'Alpha Project', exact: true })
        .waitFor()
      await assertTaskRows(page, alphaTasks.slice(0, 20))
      await assertHeadingCount(page, alphaTasks.length)
      await assertScopeCounts(page, counts(alphaTasks, true))
      assert.equal(
        await page.getByRole('combobox', { name: /^Project(?:\s|$)/ }).count(),
        0,
      )
      assert.equal(
        await page.locator('.wf-querybar-primary')
          .getByRole('button', { name: /^Project(?:\s|$)/ }).count(),
        0,
      )
      await snapshot(page, 'initial-conflicting-project')
      await screenshot(page, 'project-alpha-desktop-initial')
    },
  )
  await check(
    'Query drafts do not change the URL or results until explicit Enter commits within project scope',
    async () => {
      const before = page.url()
      const input = page.getByRole('searchbox', { name: 'Search', exact: true })
      await input.fill('Alpha task')
      assert.equal(page.url(), before)
      await assertTaskRows(page, alphaTasks.slice(0, 20))
      await input.press('Enter')
      await assertParams(page, {
        q: 'Alpha task',
        project: 'scope-alpha',
        page: '1',
      })
      await assertTaskRows(page, alphaTasks.slice(0, 20))
    },
  )
  await check(
    'Status changes share the committed query and do not reinterpret recovered historical failures as task failures',
    async () => {
      await scope(page)
        .getByRole('button', { name: 'Needs attention', exact: true })
        .click()
      await assertParams(page, {
        q: 'Alpha task',
        filter: 'attention',
        project: 'scope-alpha',
        page: '1',
      })
      const expected = alphaTasks.filter((task) =>
        attention.has(latest.get(task.id)?.status),
      )
      await assertTaskRows(page, expected.slice(0, 20))
      await assertHeadingCount(page, expected.length)
      assert.ok(!expected.some((task) => task.id === 'alpha-task-02'))
      await scope(page)
        .getByRole('button', { name: 'All tasks', exact: true })
        .click()
      await assertParams(page, {
        filter: 'all',
        project: 'scope-alpha',
        page: '1',
      })
    },
  )
  await check(
    'Column-menu sort is committed and task-list pages render the correct fixed-project rows',
    async () => {
      await setSort(page, 'Name Z-A')
      await assertParams(page, {
        order: 'title:descending',
        project: 'scope-alpha',
        page: '1',
      })
      await assertTaskRows(page, descending.slice(0, 20))
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
      await assertParams(page, {
        page: '2',
        order: 'title:descending',
        q: 'Alpha task',
        project: 'scope-alpha',
      })
      await assertTaskRows(page, descending.slice(20, 40))
      await snapshot(page, 'sorted-page-two')
    },
  )
  let secondPageHref
  await check(
    'Page size and page are URL state, with a real final page rather than an all-results claim',
    async () => {
      await page.getByRole('combobox', { name: /^Tasks per page/ }).click()
      await page.getByRole('option', { name: '50 / page', exact: true }).click()
      await assertParams(page, {
        pageSize: '50',
        page: '1',
        order: 'title:descending',
        project: 'scope-alpha',
      })
      await assertTaskRows(page, descending.slice(0, 50))
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
      await assertTaskRows(page, descending.slice(50))
      await assertParams(page, {
        page: '2',
        pageSize: '50',
        q: 'Alpha task',
        filter: 'all',
        project: 'scope-alpha',
      })
      assert.equal(
        await page.locator('.wf-pagination output').innerText(),
        '2 / 2',
      )
      secondPageHref = page.url()
      await snapshot(page, 'fifty-per-page-last-page')
      await screenshot(page, 'project-alpha-page-two')
    },
  )
  await check(
    'Refresh and browser Back/Forward restore the committed project page and page size',
    async () => {
      await page.reload()
      await assertTaskRows(page, descending.slice(50))
      assert.equal(page.url(), secondPageHref)
      await page.goBack()
      await assertTaskRows(page, descending.slice(0, 50))
      await assertParams(page, {
        page: '1',
        pageSize: '50',
        project: 'scope-alpha',
      })
      await page.goForward()
      await assertTaskRows(page, descending.slice(50))
      assert.equal(page.url(), secondPageHref)
    },
  )
  let runsHref
  await check(
    'Run history view retains committed controls but counts only the current project persisted Run records',
    async () => {
      await page.getByRole('radio', { name: 'Runs', exact: true }).click()
      await page
        .getByRole('table', { name: 'Filtered runs', exact: true })
        .waitFor()
      await assertParams(page, {
        q: 'Alpha task',
        filter: 'all',
        project: 'scope-alpha',
        order: 'title:descending',
        pageSize: '50',
        page: '1',
        view: 'table',
      })
      await assertHeadingCount(page, alphaRuns.length, 'runs')
      await assertScopeCounts(page, counts(alphaRuns, false), true)
      const links = await page
        .getByRole('table', { name: 'Filtered runs', exact: true })
        .locator('tbody a.wb-table-task')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('href')),
        )
      assert.ok(links.length > 0)
      assert.ok(
        links.every((href) =>
          alphaRuns.some((run) => href === `#run/${run.id}`),
        ),
      )
      runsHref = page.url()
      await snapshot(page, 'project-run-records')
    },
  )
  await check(
    'View transition Back/Forward restores the prior task page rather than global results',
    async () => {
      await page.goBack()
      await assertTaskRows(page, descending.slice(50))
      assert.equal(page.url(), secondPageHref)
      await page.goForward()
      await page
        .getByRole('table', { name: 'Filtered runs', exact: true })
        .waitFor()
      assert.equal(page.url(), runsHref)
      await page.reload()
      await page
        .getByRole('table', { name: 'Filtered runs', exact: true })
        .waitFor()
      await assertHeadingCount(page, alphaRuns.length, 'runs')
    },
  )
  await check(
    'Board and task-list transitions keep the same project and query without starting work',
    async () => {
      await page.getByRole('radio', { name: 'Board', exact: true }).click()
      const board = page.getByRole('region', {
        name: 'Task board',
        exact: true,
      })
      await board.waitFor()
      await assertParams(page, {
        view: 'board',
        q: 'Alpha task',
        project: 'scope-alpha',
        filter: 'all',
        order: 'title:descending',
        pageSize: '50',
        page: '1',
      })
      const labels = await board.locator('.wb-work-card h2').allTextContents()
      assert.equal(labels.length, alphaTasks.length)
      assert.ok(labels.every((label) => /^Alpha task \d+$/.test(label.trim())))
      await page.getByRole('radio', { name: 'Tasks', exact: true }).click()
      await assertTaskRows(page, descending.slice(0, 50))
      await assertNoOverflow(page)
      await snapshot(page, 'back-to-task-list')
    },
  )
  await check(
    'A non-default query, status and sort combination survives refresh and Back/Forward together',
    async () => {
      await scope(page)
        .getByRole('button', { name: 'Needs attention', exact: true })
        .click()
      const input = page.getByRole('searchbox', { name: 'Search', exact: true })
      await input.fill('Alpha task 0')
      await input.press('Enter')
      const attentionTasks = descending.filter(
        (task) =>
          task.title.includes('Alpha task 0') &&
          attention.has(latest.get(task.id)?.status),
      )
      await assertTaskRows(page, attentionTasks)
      await assertParams(page, {
        q: 'Alpha task 0',
        filter: 'attention',
        order: 'title:descending',
        project: 'scope-alpha',
        page: '1',
        pageSize: '50',
        view: 'list',
      })
      const attentionHref = page.url()
      await page.reload()
      await assertTaskRows(page, attentionTasks)
      assert.equal(page.url(), attentionHref)
      await scope(page)
        .getByRole('button', { name: 'Completed', exact: true })
        .click()
      const completedTasks = descending.filter(
        (task) =>
          task.title.includes('Alpha task 0') &&
          latest.get(task.id)?.status === 'succeeded',
      )
      await assertTaskRows(page, completedTasks)
      const completedHref = page.url()
      await page.goBack()
      await assertTaskRows(page, attentionTasks)
      assert.equal(page.url(), attentionHref)
      await page.goForward()
      await assertTaskRows(page, completedTasks)
      assert.equal(page.url(), completedHref)
      await assertScopeCounts(page, counts(alphaTasks, true))
      await snapshot(page, 'restored-nondefault-combination')
      await screenshot(page, 'project-alpha-combined-query')
    },
  )
  await check(
    'Clearing conditions retains fixed project scope, task order and page-size preference',
    async () => {
      await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click()
      await assertTaskRows(page, descending.slice(0, 50))
      const params = parameters(page)
      assert.equal(params.q, undefined)
      assert.equal(params.filter, undefined)
      await assertParams(page, {
        project: 'scope-alpha',
        order: 'title:descending',
        pageSize: '50',
        page: '1',
        view: 'list',
      })
      await assertHeadingCount(page, alphaTasks.length)
    },
  )
  await check(
    'An empty fixed project shows its own empty state, not tasks from another project',
    async () => {
      await page.goto(
        `${base}#project/scope-empty?view=list&project=scope-alpha`,
      )
      await page
        .getByRole('heading', { name: 'Empty Project', exact: true })
        .waitFor()
      await page
        .getByRole('heading', { name: 'No tasks yet', exact: true })
        .waitFor()
      await assertHeadingCount(page, 0)
      await assertScopeCounts(page, {
        all: 0,
        active: 0,
        attention: 0,
        completed: 0,
      })
      assert.equal(
        await page.locator('.wf-results [data-task-trigger]').count(),
        0,
      )
      await screenshot(page, 'project-empty-desktop')
    },
  )
  await check(
    'A second real project has independent current task counts',
    async () => {
      await page.goto(
        `${base}#project/scope-beta?view=list&project=scope-alpha`,
      )
      await page
        .getByRole('heading', { name: 'Beta Project', exact: true })
        .waitFor()
      await assertTaskRows(page, betaTasks)
      await assertHeadingCount(page, betaTasks.length)
      await assertScopeCounts(page, counts(betaTasks, true))
      assert.equal(
        await scope(page)
          .getByRole('button', { name: 'All tasks', exact: true })
          .locator('.wf-scope-count')
          .innerText(),
        String(betaTasks.length),
      )
      await screenshot(page, 'project-beta-desktop')
    },
  )
  const mobile = await context({ width: 390, height: 844 })
  const mobilePage = (currentPage = await mobile.newPage())
  await check(
    'Mobile uses the same fixed-project scope source and restores focus from its filter dialog',
    async () => {
      await mobilePage.goto(
        `${base}#project/scope-alpha?view=list&project=scope-beta&q=Alpha+task&filter=completed`,
      )
      await mobilePage
        .getByRole('heading', { name: 'Alpha Project', exact: true })
        .waitFor()
      await assertHeadingCount(mobilePage, counts(alphaTasks, true).completed)
      const trigger = mobilePage.getByRole('button', {
        name: 'Filters',
        exact: true,
      })
      await trigger.focus()
      await trigger.click()
      const dialog = mobilePage.getByRole('dialog', {
        name: 'Filters',
        exact: true,
      })
      await dialog.waitFor()
      await assertScopeCounts(mobilePage, counts(alphaTasks, true))
      await dialog.getByRole('button', { name: 'Active', exact: true }).click()
      await assertParams(mobilePage, {
        filter: 'active',
        project: 'scope-alpha',
        q: 'Alpha task',
        page: '1',
      })
      await mobilePage.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await poll(
        () => trigger.evaluate((element) => element === document.activeElement),
        true,
        'Filter dialog returns focus to its own trigger',
      )
      await assertHeadingCount(mobilePage, counts(alphaTasks, true).active)
    },
  )
  await check(
    'Mobile task detail reads the same scoped item, restores task focus, and keeps the committed URL',
    async () => {
      const trigger = mobilePage
        .locator('.wf-mobile-list')
        .getByRole('button', { name: 'Alpha task 01', exact: true })
      await trigger.waitFor()
      const href = mobilePage.url()
      await trigger.focus()
      await trigger.click()
      const dialog = mobilePage.getByRole('dialog', {
        name: 'Task details · Alpha task 01',
        exact: true,
      })
      await dialog.waitFor()
      await dialog
        .getByText(
          'Only synthetic project scope-alpha; no provider execution.',
          { exact: true },
        )
        .waitFor()
      assert.equal(mobilePage.url(), href)
      await mobilePage.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await poll(
        () => trigger.evaluate((element) => element === document.activeElement),
        true,
        'Task dialog returns focus to the original visible task button',
      )
      await assertNoOverflow(mobilePage)
      await snapshot(mobilePage, 'mobile-project-scope')
      await screenshot(mobilePage, 'project-alpha-mobile')
    },
  )
  await check(
    'Read-only network boundary permits only fulfilled auth/bootstrap reads and no provider or business writes',
    async () => {
      assert.ok(
        evidence.requests.some((request) => request.path === '/api/bootstrap'),
      )
      assert.deepEqual(evidence.writeAttempts, [])
      assert.deepEqual(evidence.unexpectedApi, [])
      assert.deepEqual(evidence.blockedExternal, [])
      assert.deepEqual(evidence.pageErrors, [])
      assert.ok(
        evidence.requests.every(
          (request) =>
            request.method === 'GET' &&
            ['/api/auth/state', '/api/bootstrap'].includes(request.path),
        ),
      )
    },
  )
  await mobile.close()
  await desktop.close()
} catch (error) {
  evidence.failures.push({
    check: currentCheck,
    message: error.message,
    stack: error.stack,
    url: currentPage?.url(),
  })
  if (currentPage && !currentPage.isClosed()) {
    try {
      await screenshot(currentPage, 'project-workspace-failure')
    } catch (captureError) {
      evidence.failures.push({
        check: 'failure screenshot',
        message: captureError.message,
      })
    }
  }
  process.exitCode = 1
} finally {
  await browser?.close()
  evidence.summary = {
    checks: evidence.checks.length,
    failures: evidence.failures.length,
    pageErrors: evidence.pageErrors.length,
    writeAttempts: evidence.writeAttempts.length,
    unexpectedApi: evidence.unexpectedApi.length,
    screenshots: evidence.screenshots.length,
  }
  await writeFile(
    resolve(out, 'project-workspace-verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  console.log(JSON.stringify(evidence.summary, null, 2))
}
