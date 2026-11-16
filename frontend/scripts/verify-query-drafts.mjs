import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'Explicit fixture opt-in is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.WORKBENCH_EVIDENCE_DIR ?? '/tmp/mybot-query-drafts',
)
const playwright = resolve(
  process.env.PLAYWRIGHT_MODULE ??
    '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)
const executable = process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome'
assert.ok(
  existsSync(playwright),
  'An existing Playwright installation is required',
)
assert.ok(existsSync(executable), 'An existing Chrome installation is required')

const projects = [
  {
    id: 'draft-alpha',
    name: 'Alpha Drafts',
    goal: 'Synthetic Alpha scope',
    directory: '.',
    notes: '',
  },
  {
    id: 'draft-beta',
    name: 'Beta Drafts',
    goal: 'Synthetic Beta scope',
    directory: '.',
    notes: '',
  },
]
const tasks = projects.flatMap((project) =>
  Array.from({ length: 24 }, (_, index) => ({
    id: `${project.id}-task-${String(index + 1).padStart(2, '0')}`,
    project_id: project.id,
    title: `${project.id === 'draft-alpha' ? 'Alpha' : 'Beta'} release ${String(index + 1).padStart(2, '0')}`,
    goal: 'Synthetic query projection only; no model execution.',
    acceptance: '',
    files: [],
    created_at: new Date(Date.UTC(2026, 10, 15, 0, index)).toISOString(),
  })),
)
const runs = tasks.flatMap((task) => {
  const number = Number(task.id.slice(-2))
  if (number % 4 === 0) return []
  return [
    {
      id: `run-${task.id}`,
      task_id: task.id,
      status: { 1: 'running', 2: 'failed', 3: 'succeeded' }[number % 4],
      created_at: '2026-11-15T02:00:00Z',
    },
  ]
})
const projection = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  workspace: '/synthetic/query-drafts',
  default_model_id: '',
  local_harnesses: [],
  capabilities: { backend_sync: false },
}
const statuses = new Map(runs.map((run) => [run.task_id, run.status]))
function expectedTasks({ query = '', project, filter = 'all', order } = {}) {
  const term = query.trim().toLowerCase()
  const result = tasks.filter((task) => {
    const projectName =
      projects.find((item) => item.id === task.project_id)?.name ?? ''
    const status = statuses.get(task.id)
    const searchable =
      `${task.id} ${task.title} ${projectName} ${status ? `run-${task.id}` : ''}`.toLowerCase()
    return (
      (!project || project === task.project_id) &&
      (!term || searchable.includes(term)) &&
      (filter === 'all' ||
        (filter === 'active' && status === 'running') ||
        (filter === 'attention' && status === 'failed') ||
        (filter === 'completed' && status === 'succeeded'))
    )
  })
  if (order === 'title:descending')
    result.sort((a, b) => b.title.localeCompare(a.title, 'en'))
  return result
}
const evidence = {
  date: '2026-11-15',
  base,
  synthetic: true,
  scope:
    'Basic text/project/status drafts, atomic committed navigation, traversal restoration and responsive boundaries. Every API request is fulfilled locally.',
  contracts: {
    draft:
      'Project, status and text are local candidates until Search or non-composing Enter.',
    push: 'View, mode, order, page and appearance preserve unsubmitted Basic/JQL drafts.',
    scope: 'Immediate side-scope push rebases only the field it changes.',
    traverse:
      'Native Back/Forward restores the whole committed Basic/JQL query snapshot and discards local unsubmitted candidates.',
    ime: 'Synthetic composition/keyboard events exercise browser handlers, not a physical IME engine.',
  },
  browser: null,
  checks: [],
  failures: [],
  errors: [],
  requests: [],
  writes: [],
  unexpectedApi: [],
  blockedExternal: [],
  screenshots: [],
  observations: [],
}
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(playwright).href)
let browser
let currentPage
let currentCheck = 'launch'
let currentScenario

async function poll(read, expected, label) {
  for (let index = 0; index < 100; index++) {
    if (JSON.stringify(await read()) === JSON.stringify(expected)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  assert.deepEqual(await read(), expected, label)
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
async function events(page) {
  return page.evaluate(() => window.__queryDraftEvents ?? [])
}
async function assertParams(page, expected) {
  await poll(
    async () => {
      const actual = params(page)
      return Object.fromEntries(
        Object.keys(expected).map((key) => [key, actual[key]]),
      )
    },
    expected,
    'Committed URL parameters',
  )
}
const primary = (page) => page.locator('.wf-querybar-primary')
const search = (page) =>
  primary(page).getByRole('searchbox', { name: 'Search', exact: true })
const jql = (page) =>
  primary(page).getByRole('textbox', { name: 'JQL query', exact: true })
const projectSelector = (page) =>
  primary(page).getByRole('button', { name: /^Project(?:\s|$)/ })
const statusSelector = (page) =>
  primary(page).getByRole('button', { name: /^Status(?:\s|$)/ })
const scope = (page) =>
  page.getByRole('navigation', { name: 'Task scope', exact: true })
async function select(page, control, option) {
  await control.click()
  const selected = page.getByRole('option', { selected: true })
  while (await selected.count()) {
    const before = await selected.count()
    await selected.first().click()
    await poll(
      () => selected.count(),
      before - 1,
      'Single-value compatibility selection clears prior values',
    )
  }
  if (!['Project', 'Status'].includes(option))
    await page.getByRole('option', { name: option, exact: true }).click()
  await page.keyboard.press('Escape')
}
async function draftValues(page) {
  return {
    query: await search(page).inputValue(),
    project: await projectSelector(page).innerText(),
    filter: await statusSelector(page).innerText(),
  }
}
async function assertDraft(page, expected) {
  await poll(
    () => draftValues(page),
    expected,
    'All three candidate controls retain their local draft',
  )
}
async function rows(page, mobile = false) {
  return page
    .locator(
      mobile
        ? '.wf-mobile-list .wf-title-button'
        : '.wf-desktop-table .wf-title-button',
    )
    .evaluateAll((elements) =>
      elements.map((element) => element.dataset.taskTrigger),
    )
}
async function assertRows(
  page,
  expected,
  { mobile = false, pageNumber = 1, pageSize = 20 } = {},
) {
  const ids = expected
    .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
    .map((task) => task.id)
  await poll(
    () => rows(page, mobile),
    ids,
    'Only the committed query determines visible task IDs',
  )
  await poll(
    () => page.locator('.wf-result-count').innerText(),
    `${expected.length} tasks`,
    'Committed result count',
  )
}
async function assertPending(page, pending) {
  await poll(
    () => page.locator('.wf-query-draft').count(),
    pending ? 1 : 0,
    'Unapplied indication matches draft state',
  )
}
async function assertNavigationDelta(page, before, delta, kind = 'push') {
  await poll(
    async () => (await events(page)).length,
    before + delta,
    'Exactly one canonical event per commit',
  )
  if (delta) assert.equal((await events(page)).at(-1).kind, kind)
  await page.waitForTimeout(50)
  assert.equal((await events(page)).length, before + delta)
}
async function assertOneRow(page) {
  const geometry = await primary(page).evaluate((element) => {
    const controls = [
      ...new Set(
        element.querySelectorAll(
          'input, button, [role="radio"], [role="combobox"]',
        ),
      ),
    ]
      .map((control) => ({ control, rect: control.getBoundingClientRect() }))
      .filter(
        ({ control, rect }) =>
          rect.width > 0 && rect.height > 0 && control.getClientRects().length,
      )
    return {
      controls: controls.map(({ control, rect }) => ({
        name:
          control.getAttribute('aria-label') ??
          control.textContent?.trim().slice(0, 30),
        center: rect.top + rect.height / 2,
      })),
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }
  })
  const centers = geometry.controls.map((control) => control.center)
  assert.ok(
    Math.max(...centers) - Math.min(...centers) <= 2,
    JSON.stringify(geometry),
  )
  assert.ok(
    geometry.document <= geometry.viewport + 1,
    JSON.stringify(geometry),
  )
  evidence.observations.push({
    scenario: currentScenario,
    type: 'query-row',
    ...geometry,
  })
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  evidence.screenshots.push(`${name}.png`)
}
async function check(name, action) {
  currentCheck = name
  await action()
  evidence.checks.push({ scenario: currentScenario, name, passed: true })
  console.log(`PASS ${name}`)
}
async function fixture(name, run, href = '#workbench?view=list&mode=basic') {
  currentScenario = name
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await context.addInitScript((appOrigin) => {
    if (location.origin !== appOrigin) return
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.mode', 'light')
    localStorage.setItem('mybot.style', 'neutral')
    localStorage.setItem('mybot.density', 'comfortable')
    window.__queryDraftEvents = []
    window.addEventListener('mybot:navigation', (event) => {
      window.__queryDraftEvents.push({
        href: location.href,
        kind: event.detail?.kind,
        stamp: history.state?.__mybotNavigation ?? null,
      })
    })
  }, origin)
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
        json: { detail: 'Query fixture forbids writes' },
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
  let completed = false
  try {
    await page.goto(`${base}${href}`)
    await page.locator('main h1').waitFor()
    await search(page).waitFor()
    await run(page)
    completed = true
  } catch (error) {
    if (!page.isClosed()) {
      try {
        await shot(page, `${name}-failure`)
      } catch {}
    }
    throw error
  } finally {
    if (!page.isClosed()) {
      evidence.observations.push({
        scenario: name,
        type: 'navigation-events',
        events: await events(page),
      })
    }
    if (completed && !page.isClosed()) await shot(page, `${name}-final`)
    await context.close()
  }
}
async function editThreeFields(page, values) {
  await search(page).fill(values.query)
  await select(page, projectSelector(page), values.project)
  await select(page, statusSelector(page), values.filter)
}
async function apply(page, expected, { enter = false } = {}) {
  const before = (await events(page)).length
  if (enter) await search(page).press('Enter')
  else
    await primary(page)
      .getByRole('button', { name: 'Search', exact: true })
      .click()
  await assertNavigationDelta(page, before, 1)
  await assertParams(page, expected)
}
async function setSort(page, label) {
  await page.locator('.wf-results-toolbar')
    .getByRole('button', { name: 'Columns', exact: true })
    .click()
  await page.getByRole('menuitem', { name: /^Sort:/ }).click()
  await page.getByRole('menuitemradio', { name: label, exact: true }).click()
  for (
    let index = 0;
    index < 3 && (await page.getByRole('menu').count());
    index++
  )
    await page.keyboard.press('Escape')
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  })
  evidence.browser = { executable, version: browser.version() }
  await fixture('atomic-query', async (page) => {
    await check(
      'Project, status and text edits leave URL, results and navigation untouched',
      async () => {
        await assertRows(page, tasks)
        const href = page.url()
        const before = (await events(page)).length
        await editThreeFields(page, {
          query: 'Beta release',
          project: 'Beta Drafts',
          filter: 'Active',
        })
        await assertDraft(page, {
          query: 'Beta release',
          project: 'Beta Drafts',
          filter: 'Active',
        })
        assert.equal(page.url(), href)
        await assertNavigationDelta(page, before, 0)
        await assertRows(page, tasks)
        await assertPending(page, true)
        await assertOneRow(page)
        await shot(page, 'atomic-three-field-draft')
      },
    )
    await check(
      'Search atomically commits all three candidates with one canonical push event',
      async () => {
        await apply(page, {
          q: 'Beta release',
          project: 'draft-beta',
          filter: 'active',
          page: '1',
        })
        await assertRows(
          page,
          expectedTasks({
            query: 'Beta release',
            project: 'draft-beta',
            filter: 'active',
          }),
        )
        await assertPending(page, false)
        const last = (await events(page)).at(-1)
        const committed = new URLSearchParams(
          new URL(last.href).hash.split('?')[1],
        )
        assert.equal(committed.get('q'), 'Beta release')
        assert.equal(committed.get('project'), 'draft-beta')
        assert.equal(committed.get('filter'), 'active')
      },
    )
    await check(
      'Composing Enter cannot submit; a subsequent normal Enter commits the same complete candidate',
      async () => {
        await editThreeFields(page, {
          query: '  Alpha release  ',
          project: 'Alpha Drafts',
          filter: 'Completed',
        })
        const href = page.url()
        const before = (await events(page)).length
        await search(page).evaluate((element) => {
          element.dispatchEvent(
            new CompositionEvent('compositionstart', {
              bubbles: true,
              data: 'Alpha',
            }),
          )
          element.dispatchEvent(
            new KeyboardEvent('keydown', {
              bubbles: true,
              key: 'Enter',
              code: 'Enter',
              isComposing: true,
              keyCode: 229,
            }),
          )
          element.dispatchEvent(
            new KeyboardEvent('keyup', {
              bubbles: true,
              key: 'Enter',
              code: 'Enter',
              isComposing: true,
              keyCode: 229,
            }),
          )
        })
        assert.equal(page.url(), href)
        await assertNavigationDelta(page, before, 0)
        await assertRows(
          page,
          expectedTasks({
            query: 'Beta release',
            project: 'draft-beta',
            filter: 'active',
          }),
        )
        await search(page).evaluate((element) =>
          element.dispatchEvent(
            new CompositionEvent('compositionend', {
              bubbles: true,
              data: 'Alpha',
            }),
          ),
        )
        await apply(
          page,
          {
            q: 'Alpha release',
            project: 'draft-alpha',
            filter: 'completed',
            page: '1',
          },
          { enter: true },
        )
        await assertRows(
          page,
          expectedTasks({
            query: 'Alpha release',
            project: 'draft-alpha',
            filter: 'completed',
          }),
        )
        assert.equal(await search(page).inputValue(), 'Alpha release')
        await assertPending(page, false)
      },
    )
  })

  await fixture('presentation-and-traverse', async (page) => {
    const candidate = {
      query: 'Beta release',
      project: 'Beta Drafts',
      filter: 'Active',
    }
    await editThreeFields(page, candidate)
    await check(
      'View and query-mode pushes preserve both Basic and JQL drafts without applying them',
      async () => {
        for (const view of ['Board', 'Runs', 'Tasks']) {
          await page.getByRole('radio', { name: view, exact: true }).click()
          await assertDraft(page, candidate)
          const committed = params(page)
          assert.equal(committed.q, undefined)
          assert.equal(committed.project, undefined)
          assert.equal(committed.filter, undefined)
          await assertPending(page, true)
        }
        await primary(page)
          .getByRole('radio', { name: 'JQL', exact: true })
          .click()
        await jql(page).fill('ORDER BY summary DESC')
        await primary(page)
          .getByRole('radio', { name: 'Basic', exact: true })
          .click()
        await assertDraft(page, candidate)
        await primary(page)
          .getByRole('radio', { name: 'JQL', exact: true })
          .click()
        assert.equal(await jql(page).inputValue(), 'ORDER BY summary DESC')
        assert.equal(params(page).jql, undefined)
        await primary(page)
          .getByRole('radio', { name: 'Basic', exact: true })
          .click()
        await assertDraft(page, candidate)
      },
    )
    await check(
      'Sort and pagination pushes retain unsubmitted criteria while only changing presentation',
      async () => {
        await setSort(page, 'Name Z-A')
        await assertDraft(page, candidate)
        await assertRows(page, expectedTasks({ order: 'title:descending' }))
        await page
          .getByRole('button', { name: 'Next page', exact: true })
          .click()
        await assertParams(page, { page: '2', order: 'title:descending' })
        await assertRows(page, expectedTasks({ order: 'title:descending' }), {
          pageNumber: 2,
        })
        await assertDraft(page, candidate)
        assert.equal(params(page).q, undefined)
        await assertPending(page, true)
      },
    )
    await check(
      'Light/dark and style changes retain draft controls and do not navigate or apply a query',
      async () => {
        const href = page.url()
        const before = (await events(page)).length
        const light = await page
          .locator('.wb-theme')
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor)
        await page
          .getByRole('button', { name: 'Dark mode', exact: true })
          .click()
        await page
          .getByRole('button', { name: 'Light mode', exact: true })
          .waitFor()
        const dark = await page
          .locator('.wb-theme')
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor)
        assert.notEqual(light, dark)
        await page
          .getByRole('button', { name: 'Preferences', exact: true })
          .click()
        const dialog = page.getByRole('dialog', {
          name: 'Preferences',
          exact: true,
        })
        await dialog.getByRole('radio', { name: 'Matcha', exact: true }).click()
        await poll(
          () => page.evaluate(() => localStorage.getItem('mybot.style')),
          'matcha',
          'Selected style is saved',
        )
        await dialog
          .locator('.wb-dialog-head')
          .getByRole('button', { name: 'Close', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await assertDraft(page, candidate)
        assert.equal(page.url(), href)
        await assertNavigationDelta(page, before, 0)
        await assertPending(page, true)
      },
    )
    await check(
      'Back/Forward traversals reset all Basic and JQL candidates to the committed snapshot',
      async () => {
        const basicHref = page.url()
        await primary(page)
          .getByRole('radio', { name: 'JQL', exact: true })
          .click()
        await jql(page).fill('ORDER BY created ASC')
        const jqlHref = page.url()
        const before = (await events(page)).length
        await page.goBack()
        await assertNavigationDelta(page, before, 1, 'traverse')
        assert.equal(page.url(), basicHref)
        await assertDraft(page, {
          query: '',
          project: 'Project',
          filter: 'Status',
        })
        await assertPending(page, false)
        await assertRows(page, expectedTasks({ order: 'title:descending' }), {
          pageNumber: 2,
        })
        const next = (await events(page)).length
        await page.goForward()
        await assertNavigationDelta(page, next, 1, 'traverse')
        assert.equal(page.url(), jqlHref)
        assert.equal(await jql(page).inputValue(), '')
        await assertPending(page, false)
        await primary(page)
          .getByRole('radio', { name: 'Basic', exact: true })
          .click()
        await assertDraft(page, {
          query: '',
          project: 'Project',
          filter: 'Status',
        })
      },
    )
  })

  await fixture(
    'side-status-rebase',
    async (page) => {
      await check(
        'Immediate side status rebases only status, preserving dirty text and project candidates',
        async () => {
          await editThreeFields(page, {
            query: 'Beta release 0',
            project: 'Beta Drafts',
            filter: 'Completed',
          })
          const beforeNoOp = (await events(page)).length
          await scope(page)
            .getByRole('button', { name: 'All tasks', exact: true })
            .click()
          await assertParams(page, { q: 'release', project: 'draft-alpha' })
          assert.equal(params(page).filter ?? 'all', 'all')
          await assertDraft(page, {
            query: 'Beta release 0',
            project: 'Beta Drafts',
            filter: 'Completed',
          })
          await assertRows(
            page,
            expectedTasks({ query: 'release', project: 'draft-alpha' }),
          )
          await assertPending(page, true)
          evidence.observations.push({
            scenario: currentScenario,
            type: 'side-scope-no-op',
            field: 'filter',
            committed: 'all',
            candidate: 'completed',
            navigationEvents: (await events(page)).length - beforeNoOp,
            pendingRetained: true,
          })
          const before = (await events(page)).length
          await scope(page)
            .getByRole('button', { name: 'Active', exact: true })
            .click()
          await assertNavigationDelta(page, before, 1)
          await assertParams(page, {
            q: 'release',
            project: 'draft-alpha',
            filter: 'active',
          })
          await assertDraft(page, {
            query: 'Beta release 0',
            project: 'Beta Drafts',
            filter: 'Active',
          })
          await assertRows(
            page,
            expectedTasks({
              query: 'release',
              project: 'draft-alpha',
              filter: 'active',
            }),
          )
          await assertPending(page, true)
          await apply(page, {
            q: 'Beta release 0',
            project: 'draft-beta',
            filter: 'active',
            page: '1',
          })
          await assertRows(
            page,
            expectedTasks({
              query: 'Beta release 0',
              project: 'draft-beta',
              filter: 'active',
            }),
          )
        },
      )
    },
    '#workbench?view=list&q=release&project=draft-alpha',
  )

  await fixture(
    'side-project-rebase',
    async (page) => {
      await check(
        'Immediate side project rebases only project, preserving dirty text and status candidates',
        async () => {
          await editThreeFields(page, {
            query: 'release 0',
            project: 'Alpha Drafts',
            filter: 'Completed',
          })
          const before = (await events(page)).length
          await scope(page)
            .getByRole('button', { name: 'Beta Drafts', exact: true })
            .click()
          await assertNavigationDelta(page, before, 1)
          await assertParams(page, { q: 'release', project: 'draft-beta' })
          assert.equal(params(page).filter, undefined)
          await assertDraft(page, {
            query: 'release 0',
            project: 'Beta Drafts',
            filter: 'Completed',
          })
          await assertRows(
            page,
            expectedTasks({ query: 'release', project: 'draft-beta' }),
          )
          await assertPending(page, true)
          await apply(page, {
            q: 'release 0',
            project: 'draft-beta',
            filter: 'completed',
            page: '1',
          })
          await assertRows(
            page,
            expectedTasks({
              query: 'release 0',
              project: 'draft-beta',
              filter: 'completed',
            }),
          )
        },
      )
    },
    '#workbench?view=list&q=release&project=draft-alpha',
  )

  await fixture('clear-draft-only', async (page) => {
    await check(
      'Clear is usable for draft-only changes and explicitly clears all three local candidates',
      async () => {
        const clear = primary(page).getByRole('button', {
          name: 'Clear filters',
          exact: true,
        })
        assert.equal(await clear.isEnabled(), false)
        const href = page.url()
        await editThreeFields(page, {
          query: 'Never applied',
          project: 'Beta Drafts',
          filter: 'Needs attention',
        })
        assert.equal(page.url(), href)
        assert.equal(await clear.isEnabled(), true)
        await assertRows(page, tasks)
        const before = (await events(page)).length
        await clear.click()
        await assertNavigationDelta(page, before, 1)
        await assertDraft(page, {
          query: '',
          project: 'Project',
          filter: 'Status',
        })
        const committed = params(page)
        for (const key of ['q', 'project', 'filter'])
          assert.equal(committed[key], undefined)
        await assertRows(page, tasks)
        await assertPending(page, false)
        assert.equal(await clear.isEnabled(), false)
        await assertOneRow(page)
      },
    )
  })

  await fixture('committed-traverse', async (page) => {
    await check(
      'Traversing between committed three-field queries restores each complete query, not a mixed candidate',
      async () => {
        await editThreeFields(page, {
          query: 'Alpha release',
          project: 'Alpha Drafts',
          filter: 'Active',
        })
        await apply(page, {
          q: 'Alpha release',
          project: 'draft-alpha',
          filter: 'active',
          page: '1',
        })
        const first = page.url()
        await editThreeFields(page, {
          query: 'Beta release',
          project: 'Beta Drafts',
          filter: 'Completed',
        })
        await apply(page, {
          q: 'Beta release',
          project: 'draft-beta',
          filter: 'completed',
          page: '1',
        })
        const second = page.url()
        await editThreeFields(page, {
          query: 'Unsubmitted replacement',
          project: 'Alpha Drafts',
          filter: 'Needs attention',
        })
        await page.goBack()
        await poll(
          async () => page.url(),
          first,
          'Back restores the first query entry',
        )
        await assertDraft(page, {
          query: 'Alpha release',
          project: 'Alpha Drafts',
          filter: 'Active',
        })
        await assertRows(
          page,
          expectedTasks({
            query: 'Alpha release',
            project: 'draft-alpha',
            filter: 'active',
          }),
        )
        await assertPending(page, false)
        await page.goForward()
        await poll(
          async () => page.url(),
          second,
          'Forward restores the second query entry',
        )
        await assertDraft(page, {
          query: 'Beta release',
          project: 'Beta Drafts',
          filter: 'Completed',
        })
        await assertRows(
          page,
          expectedTasks({
            query: 'Beta release',
            project: 'draft-beta',
            filter: 'completed',
          }),
        )
        await assertPending(page, false)
      },
    )
  })

  await fixture(
    'fixed-project',
    async (page) => {
      await check(
        'Fixed project route wins over conflicting URL and non-editable project draft on atomic submit',
        async () => {
          assert.equal(await projectSelector(page).count(), 0)
          await search(page).fill('release')
          await select(page, statusSelector(page), 'Completed')
          await assertRows(page, expectedTasks({ project: 'draft-alpha' }))
          await apply(page, {
            q: 'release',
            project: 'draft-alpha',
            filter: 'completed',
            page: '1',
          })
          await assertRows(
            page,
            expectedTasks({
              query: 'release',
              project: 'draft-alpha',
              filter: 'completed',
            }),
          )
          await assertPending(page, false)
        },
      )
    },
    '#project/draft-alpha?view=list&project=draft-beta',
  )

  await fixture('mobile-query', async (page) => {
    await check(
      'Responsive resize retains hidden condition drafts; mobile Search atomically commits the same candidate',
      async () => {
        await editThreeFields(page, {
          query: 'release',
          project: 'Beta Drafts',
          filter: 'Active',
        })
        const href = page.url()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(page.url(), href)
        await assertRows(page, tasks, { mobile: true })
        const before = (await events(page)).length
        await primary(page)
          .getByRole('button', { name: 'Search', exact: true })
          .click()
        await assertNavigationDelta(page, before, 1)
        await assertParams(page, {
          q: 'release',
          project: 'draft-beta',
          filter: 'active',
          page: '1',
        })
        await assertRows(
          page,
          expectedTasks({
            query: 'release',
            project: 'draft-beta',
            filter: 'active',
          }),
          { mobile: true },
        )
        await assertPending(page, false)
        await assertOneRow(page)
      },
    )
    await check(
      'Mobile scope dialog changes only its immediate field and returns focus without applying dirty text',
      async () => {
        await search(page).fill('Beta release 0')
        const trigger = page.getByRole('button', {
          name: 'Filters',
          exact: true,
        })
        await trigger.focus()
        await trigger.click()
        const dialog = page.getByRole('dialog', {
          name: 'Filters',
          exact: true,
        })
        await dialog
          .getByRole('button', { name: 'Completed', exact: true })
          .click()
        await assertParams(page, {
          q: 'release',
          project: 'draft-beta',
          filter: 'completed',
        })
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await poll(
          () =>
            trigger.evaluate((element) => element === document.activeElement),
          true,
          'Mobile filter focus returns',
        )
        assert.equal(await search(page).inputValue(), 'Beta release 0')
        await assertRows(
          page,
          expectedTasks({
            query: 'release',
            project: 'draft-beta',
            filter: 'completed',
          }),
          { mobile: true },
        )
        await assertPending(page, true)
        await apply(page, {
          q: 'Beta release 0',
          project: 'draft-beta',
          filter: 'completed',
          page: '1',
        })
        await assertRows(
          page,
          expectedTasks({
            query: 'Beta release 0',
            project: 'draft-beta',
            filter: 'completed',
          }),
          { mobile: true },
        )
        await assertPending(page, false)
        await assertOneRow(page)
      },
    )
  })

  await check(
    'Read-only boundary has no model calls, writes, unexpected API reads, external requests or page errors',
    async () => {
      assert.deepEqual(evidence.writes, [])
      assert.deepEqual(evidence.unexpectedApi, [])
      assert.deepEqual(evidence.blockedExternal, [])
      assert.deepEqual(evidence.errors, [])
      assert.ok(evidence.requests.length > 0)
      assert.ok(
        evidence.requests.every(
          (request) =>
            request.method === 'GET' &&
            ['/api/auth/state', '/api/bootstrap'].includes(request.path),
        ),
      )
    },
  )
} catch (error) {
  evidence.failures.push({
    scenario: currentScenario,
    check: currentCheck,
    message: error.message,
    stack: error.stack,
    url: currentPage?.url(),
  })
  if (currentPage && !currentPage.isClosed()) {
    try {
      await shot(currentPage, 'query-drafts-failure')
    } catch {}
  }
  process.exitCode = 1
} finally {
  await browser?.close()
  evidence.summary = {
    checks: evidence.checks.length,
    failures: evidence.failures.length,
    pageErrors: evidence.errors.length,
    writes: evidence.writes.length,
    unexpectedApi: evidence.unexpectedApi.length,
    screenshots: evidence.screenshots.length,
  }
  await writeFile(
    resolve(out, 'query-drafts-verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  console.log(JSON.stringify(evidence.summary, null, 2))
}
