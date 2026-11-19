import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_SYNTHETIC,
  '1',
  'Explicit synthetic opt-in is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.SAVED_VIEWS_EVIDENCE_DIR ?? '/tmp/mybot-saved-views',
)
const playwright =
  process.env.PLAYWRIGHT_MODULE ??
  '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs'
const executable = process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome'
assert.ok(
  existsSync(playwright) && existsSync(executable),
  'Use existing browser tools',
)
const { chromium } = await import(pathToFileURL(playwright).href)
const clone = (value) => structuredClone(value)
const uuid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const columns = [
  'id',
  'title',
  'projectName',
  'status',
  'updated',
  'attempts',
  'created_at',
]
const projects = ['Alpha', 'Beta'].map((name) => ({
  id: `saved-${name.toLowerCase()}`,
  name: `${name} Project`,
  goal: 'Synthetic saved-view scope',
  directory: '.',
  notes: '',
}))
const tasks = projects.flatMap((project) =>
  Array.from({ length: 12 }, (_, index) => ({
    id: `${project.id}-task-${String(index + 1).padStart(2, '0')}`,
    project_id: project.id,
    title: `${project.name.split(' ')[0]} release ${String(index + 1).padStart(2, '0')}`,
    goal: 'Read-only synthetic task; no provider execution.',
    acceptance: '',
    files: [],
    created_at: `2026-11-15T00:${String(index).padStart(2, '0')}:00Z`,
  })),
)
const runs = tasks.flatMap((task, index) =>
  index % 4 === 0
    ? []
    : [
        {
          id: `run-${task.id}`,
          task_id: task.id,
          status: ['running', 'failed', 'succeeded'][(index % 4) - 1],
          created_at: '2026-11-15T02:00:00Z',
        },
      ],
)
const bootstrap = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  default_model_id: '',
  workspace: '/synthetic/saved-views',
  local_harnesses: [],
  capabilities: { backend_sync: false },
}
function definition(text = '', project = [], states = []) {
  return {
    schema_version: 1,
    query: { text, projects: project, states, jql: '', mode: 'basic' },
    table: {
      page_size: 50,
      sorts: [{ sortKey: 'title', direction: 'descending' }],
      columns: ['title', 'projectName', 'status'],
      column_order: [
        'title',
        'projectName',
        'status',
        'id',
        'updated',
        'attempts',
        'created_at',
      ],
    },
  }
}
function initialRecords() {
  return Array.from({ length: 22 }, (_, index) => ({
    id: uuid(index + 1),
    name:
      index === 0
        ? 'Alpha active'
        : index === 1
          ? 'Beta complete'
          : `Window view ${String(index + 1).padStart(2, '0')}`,
    scope_type: 'workspace',
    project_id: null,
    definition:
      index === 0
        ? definition('Alpha', ['saved-alpha'], ['active'])
        : index === 1
          ? definition('Beta', ['saved-beta'], ['completed'])
          : definition(),
    revision: 1,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
  }))
}
const evidence = {
  date: '2026-11-16',
  base,
  synthetic: true,
  backendMutation: false,
  scope:
    'Saved-view client contract and UI with every API fulfilled locally. CRUD writes modify only this script memory.',
  contracts: {
    reads:
      'Directory is on demand; scoped pagination is not a full-result claim.',
    save: 'Only committed query and applied table state; fixed editor snapshots, stable create ID, CAS revisions and no automatic write retries.',
    load: 'A confirmed resource snapshot is copied into literal URL/table state, not dynamically bound by saved-view ID.',
    unknown:
      'GET reads current resource state, not an exact receipt for the original mutation. No durable unknown-operation journal is claimed.',
    browser:
      'Chrome desktop/mobile viewports, synthetic composition and local fixtures are not real-provider, physical-device, Safari or final visual acceptance.',
  },
  checks: [],
  screenshots: [],
  requests: [],
  errors: [],
  failures: [],
  unexpectedApi: [],
  blockedExternal: [],
  observations: [],
}
await mkdir(out, { recursive: true })
let browser
let scenario
let checkName = 'launch'
let currentPage
const views = (page) => page.getByRole('button', { name: /^(?:Views|视图)$/ })
const search = (page) =>
  page
    .locator('.wf-querybar-primary')
    .getByRole('searchbox', { name: 'Search', exact: true })
const action = (page, name) =>
  page
    .getByRole('menuitem', { name, exact: true })
    .or(
      page
        .getByRole('dialog', { name: 'Views', exact: true })
        .getByRole('button', { name, exact: true }),
    )
const editor = (page, title = 'Save view') =>
  page
    .getByRole('dialog', { name: title, exact: true })
    .or(page.getByRole('alertdialog', { name: title, exact: true }))
const formActions = (dialog) => dialog.locator('.wb-form-actions')
async function poll(read, expected, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (JSON.stringify(await read()) === JSON.stringify(expected)) return
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.deepEqual(await read(), expected, label)
}
async function check(name, fn) {
  checkName = name
  await fn()
  evidence.checks.push({ scenario, name, passed: true })
  console.log(`PASS ${name}`)
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  evidence.screenshots.push(`${name}.png`)
}
function params(page) {
  const url = new URL(page.url())
  const result = new URLSearchParams(url.search)
  new URLSearchParams(url.hash.split('?')[1] ?? '').forEach((value, key) =>
    result.set(key, value),
  )
  return Object.fromEntries(result)
}
async function navigation(page) {
  return page.evaluate(() => window.__savedViewNavigation ?? [])
}
async function openViews(page) {
  await views(page).click()
  await action(page, 'Refresh views').waitFor()
}
async function closeMenu(page) {
  await page.keyboard.press('Escape')
  await page.getByRole('menu').waitFor({ state: 'hidden' })
}
async function startCreate(page) {
  await openViews(page)
  await action(page, 'Save current view').click()
  await editor(page).waitFor()
  return editor(page)
}
async function chooseView(page, name) {
  await openViews(page)
  await action(page, name).click()
}
async function saveName(page, name, title = 'Save view') {
  const dialog = editor(page, title)
  await dialog
    .getByRole('textbox', { name: /^View name(?: Required)?$/ })
    .fill(name)
  await formActions(dialog)
    .getByRole('button', { name: 'Save view', exact: true })
    .click()
}
function writes(server, method) {
  return server.requests.filter(
    (item) => item.method !== 'GET' && (!method || item.method === method),
  )
}
function savedReads(server) {
  return server.requests.filter(
    (item) => item.method === 'GET' && item.path.startsWith('/api/saved-views'),
  )
}
async function assertNoOverflow(page) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
  evidence.observations.push({ scenario, geometry })
}
async function fixture(name, run, options = {}) {
  if (
    process.env.SAVED_VIEWS_SCENARIO &&
    process.env.SAVED_VIEWS_SCENARIO !== name
  )
    return
  scenario = name
  const server = {
    records: new Map(
      initialRecords().map((record) => [record.id, clone(record)]),
    ),
    requests: [],
    failList: null,
    detailOverrides: new Map(),
    dropNextWrite: false,
    rejectNextWrite: null,
    gate: null,
    holdNext(method, path) {
      let release
      const promise = new Promise((done) => {
        release = done
      })
      const gate = { method, path, promise, release, held: false }
      this.gate = gate
      return gate
    },
  }
  server.records.set(uuid(100), {
    ...clone(server.records.get(uuid(1))),
    id: uuid(100),
    name: 'Alpha project scope',
    scope_type: 'project',
    project_id: 'saved-alpha',
  })
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    hasTouch: Boolean(options.touch),
  })
  await context.addInitScript(
    ({ appOrigin, mode, locale, startupHref }) => {
      if (location.origin !== appOrigin) return
      localStorage.setItem('mybot.locale', locale)
      localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.style', 'neutral')
      localStorage.setItem('mybot.density', 'comfortable')
      window.__savedViewNavigation = []
      window.addEventListener('mybot:navigation', (event) =>
        window.__savedViewNavigation.push({
          href: location.href,
          kind: event.detail?.kind,
        }),
      )
      if (startupHref) {
        const original = window.addEventListener
        window.addEventListener = function (type, listener, options) {
          if (type === 'mybot:navigation') {
            window.addEventListener = original
            history.replaceState(history.state, '', startupHref)
            window.dispatchEvent(new HashChangeEvent('hashchange'))
          }
          return original.call(this, type, listener, options)
        }
      }
    },
    {
      appOrigin: origin,
      mode: options.mode ?? 'light',
      locale: options.locale ?? 'en',
      startupHref: options.startupHref,
    },
  )
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      evidence.blockedExternal.push({ scenario: name, url: request.url() })
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    let body = null
    try {
      body = request.postDataJSON()
    } catch {}
    const item = {
      scenario: name,
      method: request.method(),
      path: url.pathname,
      search: url.search,
      body,
    }
    evidence.requests.push(item)
    server.requests.push(item)
    const fulfill = (json, status = 200) => route.fulfill({ status, json })
    if (item.path === '/api/auth/state')
      return fulfill({ authenticated: true, required: false })
    if (item.path === '/api/bootstrap') return fulfill(bootstrap)
    if (!item.path.startsWith('/api/saved-views')) {
      evidence.unexpectedApi.push(item)
      return fulfill({ detail: 'Not allowed by the saved-view fixture' }, 405)
    }
    const gate = server.gate
    if (
      gate &&
      !gate.held &&
      gate.method === item.method &&
      gate.path === item.path
    ) {
      gate.held = true
      await gate.promise
    }
    if (item.method === 'GET' && item.path === '/api/saved-views') {
      if (server.failList?.text !== undefined)
        return route.fulfill({
          status: server.failList.status,
          contentType: 'text/html',
          body: server.failList.text,
        })
      if (server.failList)
        return fulfill(server.failList.body, server.failList.status)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 20)
      const scopeType = url.searchParams.get('scope_type')
      const project = url.searchParams.get('project_id')
      const records = [...server.records.values()].filter(
        (record) =>
          record.scope_type === scopeType &&
          (scopeType === 'workspace'
            ? record.project_id === null
            : record.project_id === project),
      )
      return fulfill({
        items: records.slice(offset, offset + limit),
        total: records.length,
        offset,
        limit,
        has_more: offset + limit < records.length,
      })
    }
    const match = item.path.match(/^\/api\/saved-views\/([^/]+)(\/delete)?$/)
    if (item.method === 'GET' && match) {
      const override = server.detailOverrides.get(match[1])
      if (override) return fulfill(override.body, override.status)
      const record = server.records.get(match[1])
      return record
        ? fulfill(record)
        : fulfill({ detail: { code: 'saved_view_not_found' } }, 404)
    }
    if (server.rejectNextWrite) {
      const rejected = server.rejectNextWrite
      server.rejectNextWrite = null
      return fulfill(rejected.body, rejected.status)
    }
    let result
    if (item.method === 'POST' && item.path === '/api/saved-views') {
      assert.ok(body.id && /^[a-f0-9-]{36}$/.test(body.id))
      const old = server.records.get(body.id)
      if (old)
        return fulfill(
          {
            detail: {
              code: 'saved_view_id_conflict',
              current_revision: old.revision,
            },
          },
          409,
        )
      result = {
        ...clone(body),
        name: body.name.trim(),
        revision: 1,
        created_at: '2026-11-15T03:00:00Z',
        updated_at: '2026-11-15T03:00:00Z',
      }
      server.records.set(body.id, result)
    } else if (match && ['PUT', 'POST'].includes(item.method)) {
      const old = server.records.get(match[1])
      if (!old)
        return fulfill({ detail: { code: 'saved_view_not_found' } }, 404)
      if (body.expected_revision !== old.revision)
        return fulfill(
          {
            detail: {
              code: 'saved_view_revision_conflict',
              current_revision: old.revision,
            },
          },
          409,
        )
      if (match[2]) {
        server.records.delete(match[1])
        result = {
          id: old.id,
          deleted: true,
          revision: old.revision + 1,
          deleted_at: '2026-11-15T04:00:00Z',
        }
      } else {
        result = {
          ...old,
          name: body.name.trim(),
          definition: clone(body.definition),
          revision: old.revision + 1,
          updated_at: '2026-11-15T04:00:00Z',
        }
        server.records.set(old.id, result)
      }
    } else {
      evidence.unexpectedApi.push(item)
      return fulfill({ detail: 'Unsupported synthetic request' }, 405)
    }
    if (server.dropNextWrite) {
      server.dropNextWrite = false
      return route.abort('failed')
    }
    return fulfill(result, item.path === '/api/saved-views' ? 201 : 200)
  })
  const page = (currentPage = await context.newPage())
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/saved-views'))
      evidence.observations.push({
        scenario: name,
        type: 'request-failed',
        path: new URL(request.url()).pathname,
        failure: request.failure(),
      })
  })
  page.on('pageerror', (error) =>
    evidence.errors.push({
      scenario: name,
      message: error.message,
      stack: error.stack,
    }),
  )
  let complete = false
  try {
    await page.goto(
      `${base}${options.href ?? '#workbench?view=list&mode=basic'}`,
    )
    await views(page).waitFor()
    await run(page, server)
    complete = true
  } catch (error) {
    try {
      await shot(page, `${name}-failure`)
    } catch {}
    try {
      evidence.observations.push({
        scenario: name,
        tree: await page.locator('body').ariaSnapshot(),
        gateHeld: server.gate?.held,
        savedNames: [...server.records.values()].map((record) => record.name),
      })
    } catch {}
    throw error
  } finally {
    if (complete) await shot(page, `${name}-final`)
    server.gate?.release()
    await context.close()
  }
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  })
  evidence.browser = { executable, version: browser.version() }
  await fixture(
    'startup-navigation',
    async (page, server) => {
      await check(
        'A URL change before the first React navigation subscription initializes the actual project and query',
        async () => {
          await poll(
            () => search(page).inputValue(),
            'Beta',
            'Initial query reads the current URL after subscription',
          )
          await page
            .getByRole('heading', { name: 'Beta Project', exact: true })
            .waitFor()
          assert.equal(
            await page.locator('.wf-result-count').innerText(),
            '12 tasks',
          )
          assert.equal(writes(server).length, 0)
        },
      )
    },
    { startupHref: '#project/saved-beta?q=Beta&view=list' },
  )
  await fixture('directory', async (page, server) => {
    await check(
      'Mount does not read the saved-view directory and opening it reads one scoped page',
      async () => {
        assert.equal(savedReads(server).length, 0)
        await openViews(page)
        await page.getByText('Showing 20 / 22', { exact: true }).waitFor()
        assert.equal(savedReads(server).length, 1)
        assert.ok(savedReads(server)[0].search.includes('scope_type=workspace'))
        await shot(page, 'saved-view-directory-window')
      },
    )
    await check(
      'Load more keeps the denominator and does not claim the first window is the whole result set',
      async () => {
        await page
          .getByRole('button', { name: 'Load more views', exact: true })
          .click()
        await page.getByText('Showing 22 / 22', { exact: true }).waitFor()
        assert.equal(savedReads(server).length, 2)
        assert.ok(savedReads(server)[1].search.includes('offset=20'))
        assert.equal(await action(page, 'Window view 22').count(), 1)
        await closeMenu(page)
      },
    )
  })
  await fixture('committed-save-load', async (page, server) => {
    await check(
      'Dirty Basic candidates disable saving with a reason and do not issue writes',
      async () => {
        await search(page).fill('unsubmitted Basic text')
        await openViews(page)
        const save = page.getByRole('menuitem', { name: /Save current view/ })
        await poll(
          () => save.getAttribute('aria-disabled'),
          'true',
          'Dirty candidate save is disabled',
        )
        await page
          .getByText('Apply the query draft first.', { exact: false })
          .first()
          .waitFor()
        assert.equal(writes(server).length, 0)
        await closeMenu(page)
        await search(page).fill('')
      },
    )
    await check(
      'Create saves only committed query and applied table state without changing the URL',
      async () => {
        const href = page.url()
        await startCreate(page)
        await saveName(page, 'My committed view')
        await editor(page).waitFor({ state: 'hidden' })
        await page.getByText('View saved.', { exact: true }).waitFor()
        assert.equal(writes(server).length, 1)
        const request = writes(server)[0]
        assert.equal(request.body.name, 'My committed view')
        assert.equal(request.body.definition.query.text, '')
        assert.equal(request.body.definition.schema_version, 1)
        assert.equal(request.body.scope_type, 'workspace')
        assert.equal(request.body.project_id, null)
        assert.equal(page.url(), href)
      },
    )
    await check(
      'Loading a view copies its snapshot to query and table state with one canonical transition',
      async () => {
        const before = (await navigation(page)).length
        await chooseView(page, 'Alpha active')
        await poll(
          () => search(page).inputValue(),
          'Alpha',
          'Loaded text snapshot',
        )
        assert.equal((await navigation(page)).length, before + 1)
        assert.equal(params(page).project, 'saved-alpha')
        assert.equal(params(page).filter, 'active')
        assert.equal(params(page).pageSize, '50')
        assert.deepEqual(JSON.parse(params(page).sorts), [
          { sortKey: 'title', direction: 'descending' },
        ])
        assert.equal(params(page).savedView, undefined)
        assert.deepEqual(
          await page
            .locator('.wf-desktop-table')
            .getByRole('columnheader')
            .allTextContents(),
          ['Task', 'Project', 'Execution'],
        )
        assert.equal(
          await page.locator('.wf-desktop-table .wf-title-button').count(),
          3,
        )
      },
    )
    await check(
      'Refreshing keeps literal query state without silently binding to a newer resource revision',
      async () => {
        const current = server.records.get(uuid(1))
        server.records.set(current.id, {
          ...current,
          revision: 7,
          definition: definition('Beta', ['saved-beta'], ['completed']),
        })
        await page.reload()
        await views(page).waitFor()
        assert.equal(await search(page).inputValue(), 'Alpha')
        await openViews(page)
        const update = page.getByRole('menuitem', {
          name: /Update selected view/,
        })
        assert.equal(await update.getAttribute('aria-disabled'), 'true')
        await closeMenu(page)
      },
    )
  })
  await fixture('replace-drafts', async (page) => {
    await check(
      'Loading against a dirty query requires an explicit Keep or Load decision',
      async () => {
        await search(page).fill('keep this draft')
        await chooseView(page, 'Alpha active')
        const prompt = editor(page, 'Replace query draft?')
        await formActions(prompt)
          .getByRole('button', { name: 'Keep editing', exact: true })
          .click()
        assert.equal(await search(page).inputValue(), 'keep this draft')
        assert.equal(params(page).project, undefined)
        await chooseView(page, 'Alpha active')
        await formActions(prompt)
          .getByRole('button', { name: 'Load view', exact: true })
          .click()
        await poll(
          () => search(page).inputValue(),
          'Alpha',
          'Confirmed snapshot replaces candidate',
        )
      },
    )
    await check('Dirty JQL is not saved or silently replaced', async () => {
      await page.getByRole('radio', { name: 'JQL', exact: true }).click()
      const jql = page.getByRole('textbox', { name: 'JQL query', exact: true })
      await jql.fill('ORDER BY summary DESC')
      await openViews(page)
      assert.equal(
        await page
          .getByRole('menuitem', { name: /Save current view/ })
          .getAttribute('aria-disabled'),
        'true',
      )
      await action(page, 'Beta complete').click()
      const prompt = editor(page, 'Replace query draft?')
      await prompt.waitFor()
      assert.equal(await jql.inputValue(), 'ORDER BY summary DESC')
      await formActions(prompt)
        .getByRole('button', { name: 'Load view', exact: true })
        .click()
      await poll(
        () => search(page).inputValue(),
        'Beta',
        'Loaded Basic snapshot resets JQL draft',
      )
      assert.equal(params(page).jql ?? '', '')
    })
  })
  await fixture('stable-create-and-guard', async (page, server) => {
    await check(
      'Local validation and dirty-close protection preserve name and do not submit empty names',
      async () => {
        const dialog = await startCreate(page)
        await saveName(page, '   ')
        assert.equal(writes(server).length, 0)
        const nameField = dialog.getByRole('textbox', {
          name: /^View name(?: Required)?$/,
        })
        await poll(
          () =>
            nameField.evaluate((node) =>
              (node.getAttribute('aria-describedby') ?? '')
                .split(/\s+/)
                .some((id) =>
                  document
                    .getElementById(id)
                    ?.textContent?.includes(
                      'Use 1-100 characters for the name.',
                    ),
                ),
            ),
          true,
          'Name validation is attached to the actual field',
        )
        await dialog
          .getByRole('textbox', { name: /^View name(?: Required)?$/ })
          .fill('Keep this name')
        await formActions(dialog)
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
        const prompt = editor(page, 'Discard view changes?')
        await formActions(prompt)
          .getByRole('button', { name: 'Keep editing', exact: true })
          .click()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .inputValue(),
          'Keep this name',
        )
      },
    )
    await check(
      'A pending create blocks duplicate submissions and retains its original client ID',
      async () => {
        const gate = server.holdNext('POST', '/api/saved-views')
        const started = Date.now()
        const dialog = editor(page)
        await formActions(dialog)
          .getByRole('button', { name: 'Save view', exact: true })
          .click()
        await poll(() => writes(server).length, 1, 'One pending create')
        await page
          .getByRole('alertdialog', { name: 'Save view', exact: true })
          .waitFor()
        await dialog
          .locator('form')
          .evaluate((form) =>
            form.dispatchEvent(
              new Event('submit', { bubbles: true, cancelable: true }),
            ),
          )
        assert.equal(writes(server).length, 1)
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .isDisabled(),
          true,
        )
        gate.release()
        evidence.observations.push({
          scenario,
          type: 'gate-released',
          elapsedMs: Date.now() - started,
          held: gate.held,
        })
        assert.ok(
          Date.now() - started < 5000,
          'Release the fixture response before the real mutation timeout',
        )
        await dialog.waitFor({ state: 'hidden' })
        assert.ok(server.records.has(writes(server)[0].body.id))
      },
    )
  })
  await fixture('cas-conflict', async (page, server) => {
    await chooseView(page, 'Alpha active')
    await poll(
      () => search(page).inputValue(),
      'Alpha',
      'Initial selected view',
    )
    await search(page).fill('local committed update')
    await search(page).press('Enter')
    await openViews(page)
    await page.getByRole('menuitem', { name: /Update selected view/ }).click()
    const dialog = editor(page, 'Update saved view')
    const original = server.records.get(uuid(1))
    server.records.set(original.id, {
      ...original,
      name: 'Server version',
      revision: 4,
    })
    await check(
      'CAS conflict keeps the draft and original revision without automatic overwrite or reads',
      async () => {
        const reads = savedReads(server).length
        await saveName(page, 'My conflicted name', 'Update saved view')
        await page
          .getByText(
            'The view changed. Your draft and original revision are kept.',
            { exact: true },
          )
          .waitFor()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .inputValue(),
          'My conflicted name',
        )
        assert.equal(writes(server, 'PUT')[0].body.expected_revision, 1)
        assert.equal(savedReads(server).length, reads)
        assert.equal(
          await formActions(dialog)
            .getByRole('button', { name: 'Save view', exact: true })
            .isDisabled(),
          true,
        )
      },
    )
    await check(
      'Reading latest does not change the draft until explicit replacement is confirmed',
      async () => {
        await dialog
          .getByRole('button', { name: 'Read latest version', exact: true })
          .click()
        await dialog
          .getByText('Current resource revision: 4', { exact: true })
          .waitFor()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .inputValue(),
          'My conflicted name',
        )
        await dialog
          .getByRole('button', {
            name: 'Replace draft with latest',
            exact: true,
          })
          .click()
        const prompt = editor(page, 'Replace view draft?')
        await formActions(prompt)
          .getByRole('button', { name: 'Replace draft', exact: true })
          .click()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .inputValue(),
          'Server version',
        )
        await saveName(
          page,
          'Explicit revision four update',
          'Update saved view',
        )
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(writes(server, 'PUT').at(-1).body.expected_revision, 4)
      },
    )
  })
  await fixture('dirty-navigation', async (page, server) => {
    await check(
      'Native Back preserves a dirty saved-view editor until an explicit discard decision',
      async () => {
        await search(page).fill('release')
        await search(page).press('Enter')
        const href = page.url()
        const dialog = await startCreate(page)
        await dialog
          .getByRole('textbox', { name: /^View name(?: Required)?$/ })
          .fill('Retain this editor')
        await page.goBack()
        const prompt = editor(page, 'Discard view changes?')
        await prompt.waitFor()
        await formActions(prompt)
          .getByRole('button', { name: 'Keep editing', exact: true })
          .click()
        assert.equal(page.url(), href)
        assert.equal(
          await dialog
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .inputValue(),
          'Retain this editor',
        )
        assert.equal(writes(server).length, 0)
        await page.goBack()
        await formActions(prompt)
          .getByRole('button', { name: 'Discard changes', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await poll(
          () => search(page).inputValue(),
          '',
          'Confirmed Back restores the prior query',
        )
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture('conflict-save-as', async (page, server) => {
    await chooseView(page, 'Alpha active')
    await poll(
      () => search(page).inputValue(),
      'Alpha',
      'Selected original view',
    )
    await openViews(page)
    await page.getByRole('menuitem', { name: /Update selected view/ }).click()
    const original = server.records.get(uuid(1))
    server.records.set(original.id, { ...original, revision: 2 })
    await check(
      'Save as after a rejected CAS is an explicit new resource and preserves the original',
      async () => {
        await saveName(page, 'My copy', 'Update saved view')
        const dialog = editor(page, 'Update saved view')
        await dialog
          .getByRole('button', { name: 'Save draft as new view', exact: true })
          .click()
        await editor(page).waitFor()
        await saveName(page, 'Separate copy')
        await editor(page).waitFor({ state: 'hidden' })
        const created = writes(server).find((item) => item.method === 'POST')
        assert.notEqual(created.body.id, original.id)
        assert.equal(server.records.get(original.id).revision, 2)
        assert.equal(server.records.get(created.body.id).name, 'Separate copy')
      },
    )
  })
  await fixture('unknown-create', async (page, server) => {
    await check(
      'A lost create response locks the original ID without retry or replacement-ID writes',
      async () => {
        await startCreate(page)
        server.dropNextWrite = true
        await saveName(page, 'Uncertain create')
        await page.getByText(/The change outcome is unknown/).waitFor()
        assert.equal(writes(server).length, 1)
        assert.equal(
          await editor(page)
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .isDisabled(),
          true,
        )
        assert.equal(
          await formActions(editor(page))
            .getByRole('button', { name: 'Save view', exact: true })
            .isDisabled(),
          true,
        )
        await page.waitForTimeout(150)
        assert.equal(writes(server).length, 1)
      },
    )
    await check(
      'Closing an unresolved change keeps its stable ID and exposes reconciliation rather than another write',
      async () => {
        const id = writes(server)[0].body.id
        await formActions(editor(page))
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
        await editor(page).waitFor({ state: 'hidden' })
        await openViews(page)
        assert.equal(
          await page
            .getByRole('menuitem', { name: /Save current view/ })
            .getAttribute('aria-disabled'),
          'true',
        )
        assert.equal(
          await action(page, 'Alpha active').getAttribute('aria-disabled'),
          'true',
        )
        await action(page, 'Review unresolved change').click()
        await editor(page).waitFor()
        assert.equal(writes(server).length, 1)
        assert.equal(writes(server)[0].body.id, id)
        assert.equal(
          await editor(page)
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .isDisabled(),
          true,
        )
      },
    )
    await check(
      'Reading the same ID is labeled current state, not an exact mutation receipt',
      async () => {
        const id = writes(server)[0].body.id
        await editor(page)
          .getByRole('button', { name: 'Read current resource', exact: true })
          .click()
        await editor(page)
          .getByText(/not an exact receipt for the original request/)
          .waitFor()
        assert.ok(
          savedReads(server).some(
            (item) => item.path === `/api/saved-views/${id}`,
          ),
        )
        assert.equal(writes(server).length, 1)
        await editor(page)
          .getByRole('button', {
            name: 'Acknowledge current state',
            exact: true,
          })
          .click()
        await editor(page).waitFor({ state: 'hidden' })
        assert.equal(params(page).q, undefined)
        await page
          .getByText(/original request outcome was not independently verified/)
          .waitFor()
      },
    )
  })
  await fixture('delete-and-missing', async (page, server) => {
    await chooseView(page, 'Alpha active')
    await poll(
      () => search(page).inputValue(),
      'Alpha',
      'Selected view for deletion',
    )
    await check(
      'Deletion uses the selected revision and confirms the server receipt before removing the record',
      async () => {
        await openViews(page)
        await page
          .getByRole('menuitem', { name: /Delete selected view/ })
          .click()
        const dialog = editor(page, 'Delete saved view')
        await dialog
          .getByRole('button', { name: 'Delete view', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(writes(server).at(-1).body.expected_revision, 1)
        assert.equal(server.records.has(uuid(1)), false)
        assert.equal(await search(page).inputValue(), 'Alpha')
      },
    )
    await check(
      'A missing detail is reported and never substituted with another saved view',
      async () => {
        server.detailOverrides.set(uuid(2), {
          status: 404,
          body: { detail: { code: 'saved_view_not_found' } },
        })
        await chooseView(page, 'Beta complete')
        await page
          .getByText(
            'This view is currently missing. No substitute was loaded.',
            { exact: true },
          )
          .waitFor()
        assert.equal(await search(page).inputValue(), 'Alpha')
      },
    )
  })
  await fixture('directory-errors', async (page, server) => {
    await check(
      'An unavailable backend is an explicit error rather than a success-shaped empty directory',
      async () => {
        server.failList = { status: 404, body: { detail: 'Not Found' } }
        await openViews(page)
        await page
          .getByText('Saved views are unavailable on this backend.', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await page
            .getByText('No saved views in this scope.', { exact: true })
            .count(),
          0,
        )
        assert.equal(
          await page
            .getByRole('menuitem', { name: /Save current view/ })
            .getAttribute('aria-disabled'),
          'true',
        )
      },
    )
    await check(
      'Explicit refresh can recover to a true scoped empty state without fake records',
      async () => {
        server.failList = null
        server.records.clear()
        await action(page, 'Refresh views').click()
        await page
          .getByText('No saved views in this scope.', { exact: true })
          .waitFor()
        await page.getByText('Showing 0 / 0', { exact: true }).waitFor()
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture(
    'project-unavailable',
    async (page, server) => {
      await check(
        'An unavailable project has specific feedback instead of a generic validation or empty result',
        async () => {
          server.failList = {
            status: 422,
            body: { detail: { code: 'saved_view_project_unavailable' } },
          }
          await openViews(page)
          await page
            .getByRole('alert')
            .getByText('The view project or scope is unavailable.', {
              exact: true,
            })
            .waitFor()
          assert.equal(
            await page
              .getByText('No saved views in this scope.', { exact: true })
              .count(),
            0,
          )
          assert.equal(
            await page
              .getByRole('menuitem', { name: /Save current view/ })
              .getAttribute('aria-disabled'),
            'true',
          )
          assert.equal(writes(server).length, 0)
        },
      )
    },
    { href: '#project/saved-alpha?view=list' },
  )
  await fixture('invalid-directory', async (page, server) => {
    await check(
      'A malformed 2xx directory is an error and cannot enable writes',
      async () => {
        server.failList = { status: 200, body: { items: [] } }
        await openViews(page)
        await page
          .getByRole('alert')
          .getByText('The saved view could not be read or validated.', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await page
            .getByText('No saved views in this scope.', { exact: true })
            .count(),
          0,
        )
        assert.equal(
          await page
            .getByRole('menuitem', { name: /Save current view/ })
            .getAttribute('aria-disabled'),
          'true',
        )
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture('forbidden-detail', async (page, server) => {
    await check(
      'Forbidden detail cannot apply a cached directory snapshot or change query state',
      async () => {
        server.detailOverrides.set(uuid(1), {
          status: 403,
          body: { detail: { code: 'saved_view_not_found' } },
        })
        const href = page.url()
        await chooseView(page, 'Alpha active')
        await page
          .getByText('Saved views are forbidden.', { exact: true })
          .waitFor()
        assert.equal(page.url(), href)
        assert.equal(await search(page).inputValue(), '')
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture('detail-race-draft', async (page, server) => {
    await check(
      'A draft created while detail is loading still requires replacement confirmation',
      async () => {
        const gate = server.holdNext('GET', `/api/saved-views/${uuid(1)}`)
        await chooseView(page, 'Alpha active')
        await poll(() => gate.held, true, 'Deferred detail request')
        await search(page).fill('typed while loading')
        gate.release()
        await editor(page, 'Replace query draft?').waitFor()
        assert.equal(await search(page).inputValue(), 'typed while loading')
      },
    )
  })
  await fixture('detail-race-scope', async (page, server) => {
    await check(
      'A pending detail from the previous scope cannot apply after project navigation',
      async () => {
        const gate = server.holdNext('GET', `/api/saved-views/${uuid(1)}`)
        await chooseView(page, 'Alpha active')
        await poll(() => gate.held, true, 'Original scope detail is pending')
        await page
          .locator('.wb-sidebar')
          .getByRole('link', { name: 'Beta Project', exact: true })
          .click()
        await page
          .getByRole('heading', { name: 'Beta Project', exact: true })
          .waitFor()
        gate.release()
        await page.waitForTimeout(100)
        assert.ok(new URL(page.url()).hash.startsWith('#project/saved-beta'))
        assert.equal(await search(page).inputValue(), '')
        assert.equal(params(page).filter, undefined)
        assert.equal(
          await page
            .getByText('View snapshot loaded.', { exact: true })
            .count(),
          0,
        )
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture('authorization-priority', async (page, server) => {
    await check(
      'A 401 clears cached private saved-view names and pending editor state',
      async () => {
        await openViews(page)
        await action(page, 'Alpha active').waitFor()
        server.failList = {
          status: 401,
          body: { detail: 'Authentication required' },
        }
        await action(page, 'Refresh views').click()
        await poll(
          () => views(page).count(),
          0,
          'Unauthorized workbench is cleared',
        )
        assert.equal(
          await page.getByText('Alpha active', { exact: true }).count(),
          0,
        )
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture('non-json-unauthorized', async (page, server) => {
    await check(
      'A non-JSON proxy 401 still clears private views and does not replay any mutation',
      async () => {
        await openViews(page)
        await action(page, 'Alpha active').waitFor()
        server.failList = { status: 401, text: '<html>Expired session</html>' }
        await action(page, 'Refresh views').click()
        await poll(
          () => views(page).count(),
          0,
          'Unauthorized private workbench is removed before JSON parsing',
        )
        assert.equal(
          await page.getByText('Alpha active', { exact: true }).count(),
          0,
        )
        assert.equal(writes(server).length, 0)
      },
    )
  })
  await fixture(
    'mobile-dark',
    async (page, server) => {
      await check(
        'Mobile dark mode exposes the same real menu and save form without document overflow',
        async () => {
          await openViews(page)
          await action(page, 'Alpha active').waitFor()
          await assertNoOverflow(page)
          await shot(page, 'saved-views-mobile-dark-menu')
          await action(page, 'Save current view').click()
          await editor(page).waitFor()
          await editor(page)
            .getByRole('textbox', { name: /^View name(?: Required)?$/ })
            .fill('移动端研发视图')
          await assertNoOverflow(page)
          await shot(page, 'saved-views-mobile-dark-form')
          await formActions(editor(page))
            .getByRole('button', { name: 'Save view', exact: true })
            .click()
          await editor(page).waitFor({ state: 'hidden' })
          assert.equal(writes(server).length, 1)
          assert.equal(writes(server)[0].body.name, '移动端研发视图')
          await assertNoOverflow(page)
          await poll(
            () =>
              views(page).evaluate(
                (element) => document.activeElement === element,
              ),
            true,
            'Mobile save restores the visible view trigger focus',
          )
        },
      )
    },
    { viewport: { width: 320, height: 740 }, touch: true, mode: 'dark' },
  )
  await fixture(
    'mobile-unknown',
    async (page, server) => {
      await check(
        'Mobile unknown creation preserves its stable ID and fits both error and acknowledged-state feedback',
        async () => {
          await startCreate(page)
          server.dropNextWrite = true
          await saveName(page, 'Mobile unresolved view')
          await editor(page)
            .getByText(/The change outcome is unknown/)
            .waitFor()
          await assertNoOverflow(page)
          await editor(page)
            .getByRole('button', { name: 'Read current resource', exact: true })
            .click()
          await editor(page)
            .getByRole('button', {
              name: 'Acknowledge current state',
              exact: true,
            })
            .click()
          await editor(page).waitFor({ state: 'hidden' })
          await page
            .getByText(
              /original request outcome was not independently verified/,
            )
            .waitFor()
          await assertNoOverflow(page)
          const geometry = await page.evaluate(() => {
            const heading = document
              .querySelector('.wf-heading h1')
              .getBoundingClientRect()
            const feedback = document
              .querySelector('.wf-view-feedback')
              .getBoundingClientRect()
            const header = document
              .querySelector('.wf-heading')
              .getBoundingClientRect()
            const pageSize = document
              .querySelector('.wf-page-size')
              .getBoundingClientRect()
            const next = document
              .querySelector('.wf-pagination-next')
              .getBoundingClientRect()
            return {
              titleHeight: heading.height,
              feedbackTop: feedback.top,
              headerBottom: header.bottom,
              pageSizeWidth: pageSize.width,
              pageSizeBottom: pageSize.bottom,
              nextTop: next.top,
            }
          })
          assert.ok(
            geometry.titleHeight <= 34,
            'Long feedback does not split the Tasks heading',
          )
          assert.ok(
            geometry.feedbackTop >= geometry.headerBottom,
            'Feedback has its own flow region',
          )
          assert.ok(
            geometry.pageSizeWidth >= 136,
            'The page-size label has a stable readable width',
          )
          assert.ok(
            geometry.nextTop >= geometry.pageSizeBottom,
            '320px pagination has two deliberate rows',
          )
          evidence.observations.push({
            scenario,
            type: 'mobile-feedback-layout',
            ...geometry,
          })
          await shot(page, 'saved-views-mobile-unknown-acknowledged')
          assert.equal(writes(server).length, 1)
        },
      )
    },
    { viewport: { width: 320, height: 740 }, touch: true, mode: 'dark' },
  )
  await fixture(
    'mobile-chinese',
    async (page, server) => {
      await check(
        'Chinese mobile uses localized save controls and persists the submitted name without overflow',
        async () => {
          await views(page).click()
          const sheet = page.getByRole('dialog', { name: '视图', exact: true })
          await sheet
            .getByRole('button', { name: '保存当前视图', exact: true })
            .click()
          const dialog = page
            .getByRole('dialog', { name: '保存视图', exact: true })
            .or(
              page.getByRole('alertdialog', { name: '保存视图', exact: true }),
            )
          await dialog
            .getByRole('textbox', { name: /^视图名称/ })
            .fill('多端协作研究视图')
          await assertNoOverflow(page)
          await shot(page, 'saved-views-mobile-chinese-form')
          await formActions(dialog)
            .getByRole('button', { name: '保存视图', exact: true })
            .click()
          await dialog.waitFor({ state: 'hidden' })
          await page.getByText('视图已保存。', { exact: true }).waitFor()
          assert.equal(writes(server).length, 1)
          assert.equal(writes(server)[0].body.name, '多端协作研究视图')
          await assertNoOverflow(page)
        },
      )
    },
    { viewport: { width: 390, height: 844 }, touch: true, locale: 'zh' },
  )
  assert.equal(
    evidence.unexpectedApi.length,
    0,
    'No hidden provider or business API request',
  )
  assert.equal(evidence.errors.length, 0, 'No page errors')
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
