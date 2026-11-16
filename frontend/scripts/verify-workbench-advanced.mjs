import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.ok(
  process.env.MYBOT_BROWSER_FIXTURE === '1' ||
    process.env.MYBOT_BROWSER_SYNTHETIC === '1',
  'Explicit browser fixture opt-in is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.ADVANCED_EVIDENCE_DIR ??
    process.env.WORKBENCH_EVIDENCE_DIR ??
    '/tmp/mybot-workbench-advanced',
)
const playwright = resolve(
  process.env.PLAYWRIGHT_MODULE ??
    '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)
const executable = process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome'
assert.ok(existsSync(playwright), 'Use an existing Playwright installation')
assert.ok(existsSync(executable), 'Use an existing Chrome installation')

const projects = ['Alpha', 'Beta', 'Gamma'].map((name) => ({
  id: `advanced-${name.toLowerCase()}`,
  name: `${name} Research`,
  goal: `Synthetic ${name} project`,
  directory: '.',
  notes: '',
}))
const tasks = projects.flatMap((project) =>
  Array.from({ length: 24 }, (_, index) => ({
    id: `${project.id}-${String(index + 1).padStart(2, '0')}`,
    project_id: project.id,
    title: `Group ${['A', 'B', 'C'][index % 3]} release ${index % 2 ? 'odd' : 'even'}`,
    goal: 'Synthetic read-only task; no model request or business write.',
    acceptance: '',
    files: [],
    created_at: new Date(Date.UTC(2026, 10, 15, 0, index % 4)).toISOString(),
  })),
)
const statuses = [
  undefined,
  'running',
  'failed',
  'succeeded',
  'canceled',
  'unrecognized_provider_state',
]
const runs = tasks.flatMap((task) => {
  const index = Number(task.id.slice(-2)) - 1
  const status = statuses[index % statuses.length]
  if (!status) return []
  return [
    ...(status === 'succeeded'
      ? [
          {
            id: `old-failed-${task.id}`,
            task_id: task.id,
            status: 'failed',
            created_at: '2026-11-14T02:00:00Z',
          },
        ]
      : []),
    {
      id: `current-${task.id}`,
      task_id: task.id,
      status,
      created_at: new Date(Date.UTC(2026, 10, 15, 2, index % 4)).toISOString(),
    },
  ]
})
const projection = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  workspace: '/synthetic/advanced-workbench',
  default_model_id: '',
  local_harnesses: [],
  capabilities: { backend_sync: false },
}
const collator = new Intl.Collator('en', { numeric: true })
const latest = new Map()
for (const run of runs) {
  const previous = latest.get(run.task_id)
  if (!previous || previous.created_at < run.created_at)
    latest.set(run.task_id, run)
}
const records = tasks.map((task) => {
  const run = latest.get(task.id)
  return {
    ...task,
    projectName: projects.find((project) => project.id === task.project_id).name,
    status: run?.status ?? 'pending',
    updated: run?.created_at ?? '',
    attempts: runs.filter((candidate) => candidate.task_id === task.id).length,
    state: !run
      ? 'pending'
      : run.status === 'running'
        ? 'active'
        : run.status === 'failed'
          ? 'attention'
          : run.status === 'succeeded'
            ? 'completed'
            : 'other',
    currentRun: run?.id ?? '',
  }
})
function expected({
  projectIds = [],
  stateIds = [],
  query = '',
  sorts = [],
  fixedProject,
} = {}) {
  const term = query.trim().toLowerCase()
  const result = records.filter(
    (record) =>
      (fixedProject
        ? record.project_id === fixedProject
        : !projectIds.length || projectIds.includes(record.project_id)) &&
      (!stateIds.length || stateIds.includes(record.state)) &&
      (!term ||
        `${record.id} ${record.title} ${record.projectName} ${record.currentRun}`
          .toLowerCase()
          .includes(term)),
  )
  return result.sort((a, b) => {
    for (const { sortKey, direction } of sorts) {
      const compared =
        typeof a[sortKey] === 'number'
          ? a[sortKey] - b[sortKey]
          : collator.compare(String(a[sortKey]), String(b[sortKey]))
      if (compared)
        return compared * (direction === 'descending' ? -1 : 1)
    }
    return 0
  })
}
const evidence = {
  date: '2026-11-15',
  base,
  synthetic: true,
  backendMutation: false,
  scope:
    'Project/state candidate multiselect, bounded JSON query and multi-sort URL contracts, column order and responsive interactions. Every API request is intercepted.',
  contracts: {
    query:
      'OR within each selected field; AND across fields and text. Empty means all. Current Task state, not historic Run failures.',
    canonical:
      'Single project and active/attention/completed state use legacy project/filter. Multiple projects/states and single pending/other use JSON projects/states.',
    sorting:
      'At most three unique sort keys, applied in declared priority before pagination; hidden columns may remain sort keys.',
    ime:
      'Synthetic composition events cover application handlers, not a physical IME.',
    browser:
      'Local Chrome desktop/mobile viewports, not cross-browser or physical-device certification.',
  },
  fixture: {
    projects: projects.map(({ id, name }) => ({ id, name })),
    tasks: tasks.length,
    runs: runs.length,
    stateCounts: Object.fromEntries(
      ['pending', 'active', 'attention', 'completed', 'other'].map((state) => [
        state,
        records.filter((record) => record.state === state).length,
      ]),
    ),
    historicFailuresExcludedFromCurrentAttention: true,
  },
  browser: null,
  checks: [],
  screenshots: [],
  observations: [],
  errors: [],
  failures: [],
  requests: [],
  writes: [],
  unexpectedApi: [],
  blockedExternal: [],
}
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(playwright).href)
let browser
let currentPage
let scenario
let checkName = 'launch'

function href(parameters = {}, route = 'workbench') {
  const params = new URLSearchParams({ view: 'list', mode: 'basic' })
  for (const [key, value] of Object.entries(parameters))
    params.set(
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    )
  return `#${route}?${params}`
}
function params(page) {
  const url = new URL(page.url())
  const result = new URLSearchParams(url.search)
  const marker = url.hash.indexOf('?')
  if (marker >= 0)
    new URLSearchParams(url.hash.slice(marker + 1)).forEach((value, key) =>
      result.set(key, value),
    )
  return Object.fromEntries(result)
}
async function poll(read, wanted, label) {
  for (let count = 0; count < 100; count++) {
    const actual = await read()
    if (JSON.stringify(actual) === JSON.stringify(wanted)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  assert.deepEqual(await read(), wanted, label)
}
const primary = (page) => page.locator('.wf-querybar-primary')
const search = (page) =>
  primary(page).getByRole('searchbox', { name: 'Search', exact: true })
const projectControl = (root) =>
  root.getByRole('button', { name: /^Project(?:\s|$)/ })
const stateControl = (root) =>
  root.getByRole('button', { name: /^Status(?:\s|$)/ })
async function events(page) {
  return page.evaluate(() => window.__advancedNavigation ?? [])
}
async function screenshot(page, name) {
  const filename = `${name}.png`
  await page.screenshot({ path: resolve(out, filename), fullPage: true })
  evidence.screenshots.push(filename)
}
async function check(name, action) {
  checkName = name
  await action()
  evidence.checks.push({ scenario, name, passed: true })
  console.log(`PASS ${name}`)
}
async function rows(page, mobile = false) {
  return page
    .locator(
      `${mobile ? '.wf-mobile-list' : '.wf-desktop-table'} .wf-title-button`,
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.dataset.taskTrigger),
    )
}
async function assertRows(
  page,
  wanted,
  { mobile = false, pageNumber = 1, pageSize = 20 } = {},
) {
  await poll(
    () => rows(page, mobile),
    wanted
      .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      .map((record) => record.id),
    'Rendered task IDs follow committed filters, sort priority and pagination',
  )
  await poll(
    () => page.locator('.wf-result-count').innerText(),
    `${wanted.length} tasks`,
    'Result denominator counts current tasks, not historical Runs',
  )
}
async function toggleOptions(page, control, labels) {
  await control.click()
  const list = page.getByRole('listbox')
  await list.waitFor()
  assert.equal(await list.getAttribute('aria-multiselectable'), 'true')
  for (const label of labels)
    await list.getByRole('option', { name: label, exact: true }).click()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'hidden' })
}
async function assertCommit(page, before, kind = 'push') {
  await poll(
    async () => (await events(page)).length,
    before + 1,
    'One canonical transition per explicit commit',
  )
  assert.equal((await events(page)).at(-1).kind, kind)
  await page.waitForTimeout(75)
  assert.equal((await events(page)).length, before + 1)
}
async function apply(page, { enter = false } = {}) {
  const before = (await events(page)).length
  if (enter) await search(page).press('Enter')
  else
    await primary(page)
      .getByRole('button', { name: 'Search', exact: true })
      .click()
  await assertCommit(page, before)
}
async function assertSelectionParams(page, projectIds, stateIds) {
  const actual = params(page)
  const legacyState =
    stateIds.length === 1 &&
    ['active', 'attention', 'completed'].includes(stateIds[0])
  if (projectIds.length === 1) {
    assert.equal(actual.project, projectIds[0])
    assert.equal(actual.projects, undefined)
  } else {
    assert.equal(actual.project, undefined)
    assert.deepEqual(
      actual.projects ? JSON.parse(actual.projects).sort() : [],
      [...projectIds].sort(),
    )
  }
  if (legacyState) {
    assert.equal(actual.filter, stateIds[0])
    assert.equal(actual.states, undefined)
  } else {
    assert.equal(actual.filter, undefined)
    assert.deepEqual(
      actual.states ? JSON.parse(actual.states).sort() : [],
      [...stateIds].sort(),
    )
  }
}
async function fixture(
  name,
  run,
  initial = href(),
  viewport = { width: 1440, height: 1000 },
  mode = 'light',
) {
  scenario = name
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await context.addInitScript(({ appOrigin, themeMode }) => {
    if (location.origin !== appOrigin) return
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.mode', themeMode)
    localStorage.setItem('mybot.style', 'neutral')
    localStorage.setItem('mybot.density', 'comfortable')
    window.__advancedNavigation = []
    window.addEventListener('mybot:navigation', (event) =>
      window.__advancedNavigation.push({
        href: location.href,
        kind: event.detail?.kind,
      }),
    )
  }, { appOrigin: origin, themeMode: mode })
  await context.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      evidence.blockedExternal.push({
        scenario: name,
        origin: url.origin,
        path: url.pathname,
      })
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const item = {
      scenario: name,
      method: request.method(),
      path: url.pathname,
    }
    evidence.requests.push(item)
    if (request.method() !== 'GET') {
      evidence.writes.push(item)
      return route.fulfill({
        status: 405,
        json: { detail: 'Read-only advanced fixture forbids writes' },
      })
    }
    if (url.pathname === '/api/auth/state')
      return route.fulfill({
        status: 200,
        json: { authenticated: true, required: false },
      })
    if (url.pathname === '/api/bootstrap')
      return route.fulfill({ status: 200, json: projection })
    evidence.unexpectedApi.push(item)
    return route.fulfill({
      status: 404,
      json: { detail: 'Not an allowed synthetic read' },
    })
  })
  const page = (currentPage = await context.newPage())
  page.on('pageerror', (error) =>
    evidence.errors.push({
      scenario: name,
      message: error.message,
      stack: error.stack,
      url: page.url(),
    }),
  )
  let complete = false
  try {
    await page.goto(`${base}${initial}`)
    await page.locator('main h1').waitFor()
    await run(page)
    complete = true
  } catch (error) {
    if (!page.isClosed()) {
      try {
        evidence.observations.push({
          scenario: name,
          type: 'failure-accessibility-tree',
          tree: await page.locator('main').ariaSnapshot(),
        })
      } catch {}
      try {
        await screenshot(page, `${name}-failure`)
      } catch {}
    }
    throw error
  } finally {
    if (!page.isClosed())
      evidence.observations.push({
        scenario: name,
        type: 'canonical-navigation',
        events: await events(page),
      })
    if (complete && !page.isClosed())
      await screenshot(page, `${name}-final`)
    await context.close()
  }
}
async function assertNoOverflow(page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }))
  assert.ok(width.document <= width.viewport + 1, JSON.stringify(width))
  evidence.observations.push({ scenario, type: 'viewport-width', ...width })
}
async function openSettings(page) {
  await page.locator('.wf-results-toolbar').getByRole('button', { name: 'Columns', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Manage columns & sorting', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Manage columns & sorting', exact: true })
  await dialog.waitFor()
  return dialog
}
async function choose(page, control, label) {
  await control.click()
  await page.getByRole('option', { name: label, exact: true }).click()
}
async function headers(page) {
  return page.locator('.wf-desktop-table').getByRole('columnheader').allTextContents()
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  })
  evidence.browser = { executable, version: browser.version() }
  await fixture('multi-candidates', async (page) => {
    await check('Multiselect edits remain candidates and preserve keyboard focus', async () => {
      await assertRows(page, expected())
      const originHref = page.url()
      const before = (await events(page)).length
      const project = projectControl(primary(page))
      await project.focus()
      await page.keyboard.press('Enter')
      const list = page.getByRole('listbox')
      const finder = page.getByPlaceholder('Find projects', { exact: true })
      for (const name of ['Alpha Research', 'Beta Research']) {
        await finder.fill(name)
        await finder.press('ArrowDown')
        await finder.press('Enter')
        await list.getByRole('option', { name, exact: true }).waitFor()
      }
      await page.keyboard.press('Escape')
      await poll(
        () => project.evaluate((element) => element === document.activeElement),
        true,
        'Escape returns keyboard focus to the multiselect trigger',
      )
      await toggleOptions(page, stateControl(primary(page)), ['Active', 'Needs attention'])
      await search(page).fill('release')
      assert.equal(await project.innerText(), 'Project (2)')
      assert.equal(await stateControl(primary(page)).innerText(), 'Status (2)')
      assert.equal(page.url(), originHref)
      assert.equal((await events(page)).length, before)
      await assertRows(page, expected())
      await page.locator('.wf-query-draft').waitFor()
      await assertNoOverflow(page)
      await screenshot(page, 'multiselect-uncommitted-candidates')
    })
    await check('Search commits project OR and state OR with fieldwise AND exactly once', async () => {
      await apply(page)
      await assertSelectionParams(page, ['advanced-alpha', 'advanced-beta'], ['active', 'attention'])
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'attention'],
        query: 'release',
      }))
    })
    await check('Text is ANDed with both committed multiselect fields', async () => {
      await search(page).fill('even')
      await apply(page, { enter: true })
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'attention'],
        query: 'even',
      }))
    })
    await check('Back and Forward restore full committed selection snapshots and discard candidates', async () => {
      await search(page).fill('unsaved local text')
      await toggleOptions(page, projectControl(primary(page)), ['Gamma Research'])
      const before = (await events(page)).length
      await page.goBack()
      await assertCommit(page, before, 'traverse')
      assert.equal(await search(page).inputValue(), 'release')
      assert.equal(await projectControl(primary(page)).innerText(), 'Project (2)')
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'attention'],
        query: 'release',
      }))
      const forwardBefore = (await events(page)).length
      await page.goForward()
      await assertCommit(page, forwardBefore, 'traverse')
      assert.equal(await search(page).inputValue(), 'even')
      await page.reload()
      await search(page).waitFor()
      await assertSelectionParams(page, ['advanced-alpha', 'advanced-beta'], ['active', 'attention'])
      assert.equal(await search(page).inputValue(), 'even')
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'attention'],
        query: 'even',
      }))
    })
  })
  await fixture('canonical-empty-and-single', async (page) => {
    await check('A single project and legacy state canonicalize to project/filter', async () => {
      await toggleOptions(page, projectControl(primary(page)), ['Beta Research'])
      await toggleOptions(page, stateControl(primary(page)), ['Completed'])
      await apply(page)
      await assertSelectionParams(page, ['advanced-beta'], ['completed'])
      await assertRows(page, expected({
        projectIds: ['advanced-beta'],
        stateIds: ['completed'],
      }))
      assert.equal(await page.locator('.wf-desktop-table .wf-title-button').count(), 4)
    })
    await check('Empty selections mean all without an invented All option', async () => {
      await toggleOptions(page, projectControl(primary(page)), ['Beta Research'])
      await toggleOptions(page, stateControl(primary(page)), ['Completed'])
      await apply(page)
      await assertSelectionParams(page, [], [])
      await assertRows(page, expected())
    })
    await check('Pending and Other are real current-task categories with JSON single-state URLs', async () => {
      await toggleOptions(page, stateControl(primary(page)), ['Not started'])
      await apply(page)
      await assertSelectionParams(page, [], ['pending'])
      await assertRows(page, expected({ stateIds: ['pending'] }))
      await toggleOptions(page, stateControl(primary(page)), ['Not started', 'Canceled / other'])
      await apply(page)
      await assertSelectionParams(page, [], ['other'])
      await assertRows(page, expected({ stateIds: ['other'] }))
    })
  })
  await fixture('ime-multiselect', async (page) => {
    await check('Composing Enter does not submit any candidates; noncomposing Enter submits once', async () => {
      await toggleOptions(page, projectControl(primary(page)), ['Alpha Research', 'Gamma Research'])
      await toggleOptions(page, stateControl(primary(page)), ['Active', 'Completed'])
      await search(page).fill('release')
      const before = (await events(page)).length
      await search(page).evaluate((element) => {
        element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
        element.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          isComposing: true,
          bubbles: true,
        }))
      })
      assert.equal((await events(page)).length, before)
      await assertRows(page, expected())
      await search(page).evaluate((element) =>
        element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
      )
      await apply(page, { enter: true })
      await assertSelectionParams(page, ['advanced-alpha', 'advanced-gamma'], ['active', 'completed'])
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-gamma'],
        stateIds: ['active', 'completed'],
        query: 'release',
      }))
    })
  })
  await fixture('fixed-project-scope', async (page) => {
    await check('A project route is the authoritative fixed scope despite a conflicting multiselect URL', async () => {
      assert.equal(await projectControl(primary(page)).count(), 0)
      assert.equal(await page.locator('main h1').innerText(), 'Alpha Research')
      await assertRows(page, expected({
        fixedProject: 'advanced-alpha',
        stateIds: ['active', 'completed'],
      }))
      await search(page).fill('even')
      await apply(page)
      await assertRows(page, expected({
        fixedProject: 'advanced-alpha',
        stateIds: ['active', 'completed'],
        query: 'even',
      }))
      assert.equal(params(page).projects, undefined)
      assert.equal(params(page).project, 'advanced-alpha')
    })
  }, href({
    projects: ['advanced-beta', 'advanced-gamma'],
    states: ['active', 'completed'],
  }, 'project/advanced-alpha'))
  const priority = [
    { sortKey: 'title', direction: 'ascending' },
    { sortKey: 'projectName', direction: 'descending' },
    { sortKey: 'id', direction: 'descending' },
  ]
  await fixture('multi-sort-url', async (page) => {
    await check('Three-level URL sorting applies declared priority before real pagination', async () => {
      const wanted = expected({ sorts: priority })
      await assertRows(page, wanted, { pageNumber: 2 })
      assert.deepEqual(JSON.parse(params(page).sorts), priority)
      await page.getByRole('button', { name: 'Previous page', exact: true }).click()
      await assertRows(page, wanted)
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
      await assertRows(page, wanted, { pageNumber: 2 })
      await page.reload()
      await search(page).waitFor()
      await assertRows(page, wanted, { pageNumber: 2 })
    })
  }, href({ sorts: priority, page: '2' }))
  await fixture('legacy-single-sort-url', async (page) => {
    await check('The legacy single-order URL remains compatible with real task sorting', async () => {
      await assertRows(page, expected({ sorts: [priority[1]] }))
      assert.equal(params(page).order, 'projectName:descending')
      assert.equal(params(page).sorts, undefined)
      await page.reload()
      await search(page).waitFor()
      await assertRows(page, expected({ sorts: [priority[1]] }))
    })
  }, href({ order: 'projectName:descending' }))
  const headerPriority = [
    { sortKey: 'projectName', direction: 'descending' },
    { sortKey: 'id', direction: 'descending' },
    { sortKey: 'title', direction: 'ascending' },
  ]
  await fixture('header-sort-removal', async (page) => {
    await check('The real header context menu removes only its sort and preserves the other two priorities', async () => {
      await assertRows(page, expected({ sorts: headerPriority }), { pageNumber: 2 })
      const header = page.locator('.wf-desktop-table').getByRole('columnheader', { name: 'ID', exact: true })
      await header.getByRole('button', { name: 'ID', exact: true }).click({ button: 'right' })
      const clear = page.getByRole('menuitem', { name: 'Clear sort', exact: true })
      await clear.waitFor()
      await screenshot(page, 'header-sort-context-menu')
      const before = (await events(page)).length
      await clear.click()
      await assertCommit(page, before)
      const remaining = [headerPriority[0], headerPriority[2]]
      assert.deepEqual(JSON.parse(params(page).sorts), remaining)
      assert.equal(params(page).order, undefined)
      assert.equal(params(page).page, '1')
      await assertRows(page, expected({ sorts: remaining }))
    })
    await check('Removing another real header sort retains its remaining single priority through legacy order', async () => {
      const header = page.locator('.wf-desktop-table').getByRole('columnheader', { name: 'Task', exact: true })
      await header.getByRole('button', { name: 'Task', exact: true }).click({ button: 'right' })
      const before = (await events(page)).length
      await page.getByRole('menuitem', { name: 'Clear sort', exact: true }).click()
      await assertCommit(page, before)
      assert.equal(params(page).sorts, undefined)
      assert.equal(params(page).order, 'projectName:descending')
      await assertRows(page, expected({ sorts: [headerPriority[0]] }))
    })
  }, href({ sorts: headerPriority, page: '2' }))
  await fixture('column-and-sort-dialog', async (page) => {
    await check('Column and sorting controls are unapplied local drafts with keyboard reordering', async () => {
      await search(page).fill('unsubmitted query draft')
      await search(page).evaluate((element) => { window.__advancedSearchNode = element })
      await toggleOptions(page, projectControl(primary(page)), ['Alpha Research'])
      const before = (await events(page)).length
      const settings = await openSettings(page)
      assert.equal(await settings.getByRole('checkbox', { name: 'Task', exact: true }).isDisabled(), true)
      await settings.getByRole('button', { name: 'Move up: Task', exact: true }).focus()
      await page.keyboard.press('Enter')
      await settings.getByRole('checkbox', { name: 'Project', exact: true }).uncheck()
      await settings.getByRole('button', { name: 'Add sort', exact: true }).click()
      await choose(page, settings.getByRole('combobox', { name: 'Sort field 1', exact: true }), 'Task')
      await settings.getByRole('button', { name: 'Add sort', exact: true }).click()
      await choose(page, settings.getByRole('combobox', { name: 'Sort field 2', exact: true }), 'Project')
      await choose(page, settings.getByRole('combobox', { name: 'Sort direction 2', exact: true }), 'Descending')
      await settings.getByRole('button', { name: 'Add sort', exact: true }).click()
      await choose(page, settings.getByRole('combobox', { name: 'Sort direction 3', exact: true }), 'Descending')
      assert.equal(await settings.getByRole('button', { name: 'Add sort', exact: true }).isDisabled(), true)
      assert.equal((await events(page)).length, before)
      await assertRows(page, expected())
      await settings.getByRole('combobox', { name: 'Sort field 1', exact: true }).click()
      assert.equal(await page.getByRole('option', { name: 'Project', exact: true }).count(), 0)
      assert.equal(await page.getByRole('option', { name: 'ID', exact: true }).count(), 0)
      await page.keyboard.press('Escape')
      await screenshot(page, 'column-sort-unapplied-dialog')
    })
    await check('Apply preserves main query drafts and input identity while sorting hidden fields', async () => {
      const settings = page.getByRole('dialog', { name: 'Manage columns & sorting', exact: true })
      const before = (await events(page)).length
      await settings.getByRole('button', { name: 'Apply', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await assertCommit(page, before)
      assert.deepEqual(JSON.parse(params(page).sorts), priority)
      assert.equal(params(page).q, undefined)
      assert.equal(params(page).project, undefined)
      assert.equal(await search(page).inputValue(), 'unsubmitted query draft')
      assert.equal(await projectControl(primary(page)).innerText(), 'Alpha Research')
      assert.equal(await search(page).evaluate((element) => element === window.__advancedSearchNode), true)
      await poll(() => headers(page), ['Task', 'ID', 'Execution', 'Latest run', 'History'], 'Rendered column order and visibility')
      await assertRows(page, expected({ sorts: priority }))
      const saved = await page.evaluate(() => ({
        order: JSON.parse(localStorage.getItem('mybot.task-column-order.v1')),
        visible: JSON.parse(localStorage.getItem('mybot.task-columns.v1')),
      }))
      assert.deepEqual(saved.order, ['title', 'id', 'projectName', 'status', 'updated', 'attempts', 'created_at'])
      assert.equal(saved.visible.includes('projectName'), false)
      assert.equal(saved.visible.includes('title'), true)
      assert.equal(await page.getByRole('dialog', { name: 'Discard table setting changes?', exact: true }).count(), 0)
    })
    await check('Settings close offers Keep and Discard without mutating applied column preferences', async () => {
      const settings = await openSettings(page)
      await settings.getByRole('checkbox', { name: 'ID', exact: true }).uncheck()
      await settings.getByRole('button', { name: 'Cancel', exact: true }).click()
      const prompt = page.getByRole('dialog', { name: 'Discard table setting changes?', exact: true })
      await prompt.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
      assert.equal(await settings.getByRole('checkbox', { name: 'ID', exact: true }).isChecked(), false)
      await settings.getByRole('button', { name: 'Cancel', exact: true }).click()
      await prompt.getByRole('button', { name: 'Discard changes', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await poll(() => headers(page), ['Task', 'ID', 'Execution', 'Latest run', 'History'], 'Discard never applies column draft')
      const reopened = await openSettings(page)
      assert.equal(await reopened.getByRole('checkbox', { name: 'ID', exact: true }).isChecked(), true)
      await reopened.getByRole('button', { name: 'Cancel', exact: true }).click()
    })
    await check('Changing sort priority reorders actual tasks and persists ordered hidden-column sort rules', async () => {
      const settings = await openSettings(page)
      await settings.getByRole('button', { name: 'Move sort down 1', exact: true }).click()
      const before = (await events(page)).length
      await settings.getByRole('button', { name: 'Apply', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await assertCommit(page, before)
      const reordered = [priority[1], priority[0], priority[2]]
      assert.deepEqual(JSON.parse(params(page).sorts), reordered)
      await assertRows(page, expected({ sorts: reordered }))
      await page.reload()
      await search(page).waitFor()
      await poll(() => headers(page), ['Task', 'ID', 'Execution', 'Latest run', 'History'], 'Column preferences survive reload')
      await assertRows(page, expected({ sorts: reordered }))
    })
    await check('Removing rules retains exactly one supported sort without stale secondary priorities', async () => {
      const settings = await openSettings(page)
      await settings.getByRole('button', { name: 'Remove sort 3', exact: true }).click()
      await settings.getByRole('button', { name: 'Remove sort 2', exact: true }).click()
      await settings.getByRole('button', { name: 'Apply', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      assert.deepEqual(JSON.parse(params(page).sorts), [priority[1]])
      assert.equal(params(page).order, undefined)
      await assertRows(page, expected({ sorts: [priority[1]] }))
    })
  })
  await fixture('settings-native-history-guard', async (page) => {
    await check('Native Back keeps dirty table drafts until an explicit discard decision', async () => {
      await page.getByRole('button', { name: 'Next page', exact: true }).click()
      await assertRows(page, expected(), { pageNumber: 2 })
      const acceptedHref = page.url()
      const settings = await openSettings(page)
      await settings.getByRole('button', { name: 'Move up: Task', exact: true }).click()
      await page.goBack()
      const prompt = page.getByRole('dialog', { name: 'Discard table setting changes?', exact: true })
      await prompt.waitFor()
      assert.equal(page.url(), acceptedHref)
      await prompt.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
      assert.equal(await settings.locator('[data-column-key]').first().getAttribute('data-column-key'), 'title')
      await page.goBack()
      await prompt.getByRole('button', { name: 'Discard changes', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await assertRows(page, expected())
      assert.equal(params(page).page, undefined)
    })
  })
  await fixture('mobile-candidates-dark', async (page) => {
    await check('Mobile Filters edits the same candidates and Search commits once then restores focus', async () => {
      await assertRows(page, expected(), { mobile: true })
      const filters = page.getByRole('button', { name: 'Filters', exact: true })
      await filters.click()
      const dialog = page.getByRole('dialog', { name: 'Filters', exact: true })
      await dialog.waitFor()
      const before = (await events(page)).length
      await toggleOptions(page, projectControl(dialog), ['Alpha Research', 'Beta Research'])
      await toggleOptions(page, stateControl(dialog), ['Active', 'Completed'])
      await dialog.getByRole('textbox', { name: 'Search', exact: true }).fill('release')
      assert.equal((await events(page)).length, before)
      await assertRows(page, expected(), { mobile: true })
      await screenshot(page, 'mobile-dark-candidates')
      await dialog.getByRole('button', { name: 'Search', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      await assertCommit(page, before)
      await assertSelectionParams(page, ['advanced-alpha', 'advanced-beta'], ['active', 'completed'])
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'completed'],
        query: 'release',
      }), { mobile: true })
      await poll(() => filters.evaluate((element) => element === document.activeElement), true, 'Mobile Search returns focus to the visible Filters trigger')
      await assertNoOverflow(page)
    })
    await check('Closing and reopening mobile Filters retains unapplied candidates without changing committed results', async () => {
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Filters', exact: true })
      await toggleOptions(page, projectControl(dialog), ['Gamma Research'])
      await dialog.getByRole('textbox', { name: 'Search', exact: true }).fill('mobile local draft')
      const before = (await events(page)).length
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      await page.getByRole('button', { name: 'Filters', exact: true }).click()
      assert.equal(await projectControl(dialog).innerText(), 'Project (3)')
      assert.equal(await dialog.getByRole('textbox', { name: 'Search', exact: true }).inputValue(), 'mobile local draft')
      assert.equal((await events(page)).length, before)
      await assertRows(page, expected({
        projectIds: ['advanced-alpha', 'advanced-beta'],
        stateIds: ['active', 'completed'],
        query: 'release',
      }), { mobile: true })
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    })
  }, href(), { width: 390, height: 844 }, 'dark')
  await fixture('mobile-multi-sort', async (page) => {
    await check('Narrow mobile uses the same three-level sorted page and a reachable column settings dialog', async () => {
      await assertRows(page, expected({ sorts: priority }), { mobile: true, pageNumber: 2 })
      const settings = await openSettings(page)
      assert.equal(await settings.getByRole('combobox', { name: /^Sort field / }).count(), 3)
      await assertNoOverflow(page)
      await screenshot(page, 'mobile-multi-sort-dialog')
      await settings.getByRole('button', { name: 'Cancel', exact: true }).click()
      await settings.waitFor({ state: 'hidden' })
      await assertNoOverflow(page)
    })
  }, href({ sorts: priority, page: '2' }), { width: 320, height: 740 })
  const invalid = [
    ['unknown-project', { projects: ['advanced-alpha', 'missing-project'] }],
    ['unknown-state', { states: ['active', 'invented-state'] }],
    ['malformed-projects', { projects: '[broken' }],
    ['object-states', { states: '{"active":true}' }],
    ['duplicate-sort', { sorts: [
      { sortKey: 'title', direction: 'ascending' },
      { sortKey: 'title', direction: 'descending' },
    ] }],
    ['too-many-sorts', { sorts: [
      ...priority,
      { sortKey: 'status', direction: 'ascending' },
    ] }],
    ['unknown-sort-field', { sorts: [{ sortKey: 'assignee', direction: 'ascending' }] }],
    ['unknown-sort-direction', { sorts: [{ sortKey: 'title', direction: 'sideways' }] }],
  ]
  for (const [name, query] of invalid)
    await fixture(`invalid-${name}`, async (page) => {
      await check(`${name} is explicitly rejected instead of returning unfiltered success`, async () => {
        await page.locator('.wf-query-error[role="alert"]').waitFor()
        assert.equal(await page.locator('.wf-results').count(), 0)
        assert.equal(await page.locator('.wf-result-count').innerText(), '- tasks')
        for (const [key, value] of Object.entries(query))
          assert.equal(params(page)[key], typeof value === 'string' ? value : JSON.stringify(value))
      })
    }, href(query))
  assert.equal(evidence.writes.length, 0, 'No business mutation is allowed')
  assert.equal(evidence.unexpectedApi.length, 0, 'No hidden API fallback is allowed')
  assert.equal(evidence.errors.length, 0, 'No browser page errors')
} catch (error) {
  evidence.failures.push({
    scenario,
    check: checkName,
    message: error.message,
    stack: error.stack,
    url: currentPage && !currentPage.isClosed() ? currentPage.url() : null,
  })
  console.error(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
}
