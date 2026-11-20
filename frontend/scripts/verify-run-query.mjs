import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.RUN_QUERY_EVIDENCE_DIR ?? '/tmp/mybot-run-query',
)
const { chromium } = await import(pathToFileURL(resolve(
  process.env.PLAYWRIGHT_MODULE ??
    '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)).href)
await mkdir(out, { recursive: true })
const report = {
  synthetic: true,
  source: 'Intercepted strict Run-query DTOs through the production frontend',
  limits: [
    'Synthetic endpoint behavior is not actual SQLite or provider evidence.',
    'Chrome viewports and synthetic composing Enter are not physical-device or IME certification.',
  ],
  checks: [],
  requests: [],
  writes: [],
  unexpected: [],
  externalRequests: [],
  errors: [],
  screenshots: [],
  geometry: [],
}
const projects = [
  { id: 'run-query-alpha', name: 'Alpha', goal: '', directory: '.', notes: '' },
  { id: 'run-query-beta', name: 'Beta', goal: '', directory: '.', notes: '' },
]
const order = Array.from({ length: 45 }, (_, index) =>
  index % 2 ? Math.floor(index / 2) : 44 - index / 2,
)
const sourceRank = new Map(order.map((index, rank) => [index, rank]))
const statuses = ['succeeded', 'paused', 'failed', 'canceled', 'running']
const stateOf = (status) =>
  ['queued', 'running', 'pause_requested', 'cancel_requested'].includes(status)
    ? 'active'
    : ['failed', 'interrupted', 'paused'].includes(status)
      ? 'attention'
      : status === 'succeeded' ? 'completed' : 'other'
const records = Array.from({ length: 45 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0')
  const project = projects[index % 2]
  const taskId = `synthetic-task-${number}`
  const status = statuses[index % statuses.length]
  return {
    run: {
      id: `synthetic-run-${number}`,
      task_id: taskId,
      status,
      created_at: `2026-11-20T01:${String(44 - sourceRank.get(index)).padStart(2, '0')}:00Z`,
    },
    task: {
      id: taskId,
      project_id: project.id,
      title: `${index === 2 ? 'é ' : index === 3 ? 'Z ' : ''}Research release ${index + 1}`,
    },
    project: { id: project.id, name: project.name },
    state_category: stateOf(status),
  }
})
const poisonTask = {
  id: 'poison-local-task',
  project_id: projects[0].id,
  title: 'Poison Bootstrap task must stay outside remote Run history',
  goal: '',
  acceptance: '',
  files: [],
  created_at: '2026-11-20T00:00:00Z',
}
const poisonRun = {
  id: 'poison-local-run',
  task_id: poisonTask.id,
  status: 'succeeded',
  created_at: '2026-11-20T03:00:00Z',
}
const emptyQuery = { text: '', projects: [], states: [], jql: '', mode: 'basic' }
const compareText = (left, right) => {
  const tokens = (value) => value.toLowerCase().split(/([0-9]+)/).map((part) => {
    if (/^[0-9]+$/.test(part)) {
      const significant = part.replace(/^0+/, '') || '0'
      return [0, significant.length, significant]
    }
    return [1, part]
  })
  const a = tokens(left)
  const b = tokens(right)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (!a[index]) return -1
    if (!b[index]) return 1
    for (let part = 0; part < Math.max(a[index].length, b[index].length); part++) {
      if (a[index][part] !== b[index][part])
        return a[index][part] < b[index][part] ? -1 : 1
    }
  }
  return 0
}
function projection(query = emptyQuery, options = {}) {
  const scope = options.scope ?? null
  const effectiveQuery = {
    ...query,
    text: query.text.trim(),
    projects: scope ? [scope] : [...query.projects].sort(),
    states: ['pending', 'active', 'attention', 'completed', 'other']
      .filter((value) => query.states.includes(value)),
  }
  const sorts = query.jql
    ? [{
        sortKey: query.jql.includes('SUMMARY') ? 'title' : 'created_at',
        direction: query.jql.endsWith('DESC') ? 'descending' : 'ascending',
      }]
    : options.sorts ?? []
  const term = effectiveQuery.text.toLowerCase()
  const values = records.filter((item) =>
    (term === 'authority'
      ? ['synthetic-run-041', 'synthetic-run-003'].includes(item.run.id)
      : !term || `${item.run.id} ${item.task.id} ${item.task.title} ${item.project.id} ${item.project.name}`
        .toLowerCase().includes(term)) &&
    (!effectiveQuery.projects.length ||
      effectiveQuery.projects.includes(item.project.id)) &&
    (!effectiveQuery.states.length ||
      effectiveQuery.states.includes(item.state_category)),
  ).sort((left, right) => {
    const field = (item, key) =>
      key === 'title' ? item.task.title
        : key === 'projectName' ? item.project.name : item.run[key]
    for (const rule of sorts) {
      const result = compareText(field(left, rule.sortKey), field(right, rule.sortKey))
      if (result) return result * (rule.direction === 'ascending' ? 1 : -1)
    }
    return right.run.created_at < left.run.created_at ? -1 : 1
  })
  const requestedPage = options.page ?? 1
  const pageSize = options.pageSize ?? 20
  const totalPages = Math.max(1, Math.ceil(values.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'runs',
    items: values.slice((page - 1) * pageSize, page * pageSize),
    total: values.length,
    requested_page: requestedPage,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    has_more: page < totalPages,
    query: effectiveQuery,
    sorts,
    scope_project_id: scope,
    sort_semantics: 'unicode-natural-v1',
  }
}
function href(query = emptyQuery, options = {}) {
  const params = new URLSearchParams({
    view: 'table',
    q: query.text,
    mode: query.mode,
    projects: JSON.stringify(query.projects),
    states: JSON.stringify(query.states),
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? 20),
  })
  if (query.jql) params.set('jql', query.jql)
  if (options.runOrder !== undefined) params.set('runOrder', options.runOrder)
  if (options.sorts?.length) params.set('runOrder',
    `${options.sorts[0].sortKey}:${options.sorts[0].direction}`)
  if (options.taskSorts) params.set('sorts', JSON.stringify(options.taskSorts))
  return `${base}#${options.scope ? `project/${options.scope}` : 'workbench'}?${params}`
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
let failurePage
let failureName
try {
  for (const [name, width, locale, style, mode, themeOnly] of [
    ['desktop', 1440, 'en', 'neutral', 'light'],
    ['mobile', 390, 'zh', 'zira', 'dark'],
    ['neutral-dark', 1440, 'en', 'neutral', 'dark', true],
    ['zira-light', 1440, 'en', 'zira', 'light', true],
    ['y2k-light', 1440, 'en', 'y2k', 'light', true],
    ['y2k-dark', 1440, 'en', 'y2k', 'dark', true],
  ]) {
    let capability = true
    let failStatus = 0
    let malformed = false
    let authenticated = true
    let pollActive = false
    let holdText
    let held = 0
    const releases = []
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 1000 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript(({ locale, style, mode }) => {
      localStorage.setItem('mybot.locale', locale)
      localStorage.setItem('mybot.style', style)
      localStorage.setItem('mybot.mode', mode)
    }, { locale, style, mode })
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin) {
        report.externalRequests.push({ name, origin: url.origin, path: url.pathname })
        return route.abort()
      }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      report.requests.push({
        name, method: request.method(), path: url.pathname, search: url.search,
      })
      if (request.method() !== 'GET') {
        report.writes.push({ name, method: request.method(), path: url.pathname })
        return route.fulfill({ status: 405, json: { detail: 'No writes' } })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          status: 200,
          json: { authenticated, required: !authenticated },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          status: 200,
          json: {
            projects, tasks: [poisonTask],
            runs: [{ ...poisonRun, status: pollActive ? 'running' : 'succeeded' }],
            models: [], backends: [], local_harnesses: [],
            workspace: '/synthetic/run-query',
            default_model_id: '',
            capabilities: {
              backend_sync: false,
              ...(capability === undefined ? {} : { run_query: capability }),
            },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          status: 200,
          json: { items: [], total: 0, offset: 0, limit: 20, has_more: false },
        })
      if (url.pathname === '/api/runs/query') {
        const query = JSON.parse(url.searchParams.get('query'))
        const response = failStatus
          ? failStatus === 401
            ? {
                status: 401, contentType: 'text/html',
                body: '<html><body>Authentication required</body></html>',
              }
            : { status: failStatus, json: { detail: 'Synthetic read failure' } }
          : malformed ? { status: 200, json: { items: [] } } : {
              status: 200,
              json: projection(query, {
                page: Number(url.searchParams.get('page')),
                pageSize: Number(url.searchParams.get('page_size')),
                sorts: JSON.parse(url.searchParams.get('sorts')),
                scope: url.searchParams.get('scope_project_id'),
              }),
            }
        if (failStatus === 401) authenticated = false
        if (holdText !== undefined && query.text === holdText) {
          held++
          await new Promise((resolve) => releases.push(resolve))
          return route.fulfill(response).catch(() => {})
        }
        return route.fulfill(response)
      }
      report.unexpected.push({ name, path: url.pathname, search: url.search })
      return route.fulfill({ status: 404, json: { detail: 'Unexpected API' } })
    })
    const page = await context.newPage()
    failurePage = page
    failureName = name
    page.on('pageerror', (error) => report.errors.push({ name, message: error.message }))
    const text = (zh, en) => locale === 'zh' ? zh : en
    const reads = () => report.requests.filter(
      (request) => request.name === name && request.path === '/api/runs/query',
    )
    const bootstraps = () => report.requests.filter(
      (request) => request.name === name && request.path === '/api/bootstrap',
    )
    const section = () => page.getByTestId('run-history-table')
    const table = () => section().getByRole('table', {
      name: text('运行筛选表', 'Filtered runs'), exact: true,
    })
    const search = () => page.locator('.wf-querybar-primary').getByRole('searchbox', {
      name: text('搜索', 'Search'), exact: true,
    })
    const params = () => new URLSearchParams(new URL(page.url()).hash.split('?')[1])
    const visibleIds = () => page.locator('[data-testid="run-history-table"] a.wb-table-task')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href').slice(5)))
    const record = (message) => {
      report.checks.push(`${name}: ${message}`)
      console.log(`PASS ${name}: ${message}`)
    }
    async function expectRows(response, busy = false) {
      const wanted = response.items.map((item) => item.run.id)
      await page.waitForFunction(({ wanted, busy, count }) => {
        const section = document.querySelector('[data-testid="run-history-table"]')
        const values = Array.from(section?.querySelectorAll('a.wb-table-task') ?? [])
          .map((node) => node.getAttribute('href').slice(5))
        return section &&
          (section.getAttribute('aria-busy') === 'true') === busy &&
          JSON.stringify(values) === JSON.stringify(wanted) &&
          document.querySelector('.wf-result-count')?.textContent.trim() === count
      }, {
        wanted, busy,
        count: `${response.total} ${text('次运行', 'runs')}`,
      })
      assert.deepEqual(await visibleIds(), wanted)
      assert.equal(await table().getAttribute('aria-rowcount'), String(response.total))
      assert.deepEqual(await table().locator('a.wb-table-task').evaluateAll(
        (nodes) => nodes.map((node) => node.closest('tr').getAttribute('aria-rowindex')),
      ), wanted.map((_, index) => String((response.page - 1) * response.page_size + index + 1)))
      assert.equal(await page.getByTestId('run-history-range').innerText(),
        `${response.total ? (response.page - 1) * response.page_size + 1 : 0}-${Math.min(response.page * response.page_size, response.total)} / ${response.total}`)
      assert.equal(await section().locator('footer').count(), 1)
      assert.equal(await section().getByText(poisonTask.title, { exact: true }).count(), 0)
    }
    async function shot(suffix) {
      assert.ok(await page.evaluate(
        () => document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ), `${name}: document must not overflow`)
      const file = `${name}-${suffix}.png`
      await page.screenshot({ path: resolve(out, file), fullPage: true })
      report.screenshots.push(file)
    }
    function releaseAll() {
      holdText = undefined
      for (const release of releases.splice(0)) release()
    }
    async function waitHeld(previous = 0) {
      for (let attempt = 0; attempt < 100 && held <= previous; attempt++)
        await page.waitForTimeout(20)
      assert.ok(held > previous, `${name}: a controlled query was held`)
    }
    async function retry() {
      await page.getByRole('button', {
        name: text('重试查询', 'Retry query'), exact: true,
      }).click()
    }
    async function next() {
      await page.getByRole('button', {
        name: text('下一页运行', 'Next run page'), exact: true,
      }).click()
    }
    async function capacity(value) {
      await page.getByRole('combobox', {
        name: new RegExp(`^${text('每页运行数', 'Runs per page')}`),
      }).click()
      await page.getByRole('option', {
        name: text(`每页 ${value}`, `${value} / page`), exact: true,
      }).click()
    }
    try {
      await page.goto(href())
      await expectRows(projection())
      await page.waitForFunction(({ style, mode }) => {
        const node = document.querySelector('.wb-theme')
        return node?.getAttribute('data-style') === style &&
          node.getAttribute('data-mode') === mode
      }, { style, mode })
      assert.ok(reads().length > 0)
      record('45 remote DTO rows own the bounded20-row view; poisoned Bootstrap is absent')
      report.geometry.push({
        name, style, mode, width,
        ...(await page.locator('.wb-theme').evaluate((node) => {
          const css = getComputedStyle(node)
          const input = document.querySelector('.wf-querybar input')
          return {
            background: css.backgroundColor,
            accent: getComputedStyle(document.querySelector('a.wb-table-task')).color,
            color: css.color,
            font: css.fontFamily,
            inputRadius: input ? getComputedStyle(input).borderRadius : '',
            inputHeight: input?.getBoundingClientRect().height,
          }
        })),
      })
      await shot('initial')
      if (themeOnly) {
        const before = reads().length
        await search().fill('unsubmitted theme draft')
        await page.getByRole('button', {
          name: mode === 'light' ? 'Dark mode' : 'Light mode', exact: true,
        }).click()
        assert.equal(await search().inputValue(), 'unsubmitted theme draft')
        await expectRows(projection())
        assert.equal(reads().length, before)
        assert.equal(await page.evaluate(() => localStorage.getItem('mybot.style')), style)
        assert.equal(await page.evaluate(() => localStorage.getItem('mybot.mode')),
          mode === 'light' ? 'dark' : 'light')
        record('appearance switching preserves draft/results and causes no Run query or mutation')
        await context.close()
        continue
      }

      if (name === 'desktop') {
        const tableSettings = () => page.getByRole('dialog', {
          name: 'Table settings', exact: true,
        })
        const rowHeight = () => table().locator('tbody tr').first()
          .evaluate((node) => node.getBoundingClientRect().height)
        const comfortableHeight = await rowHeight()
        await page.getByRole('button', { name: 'Table settings', exact: true }).click()
        await tableSettings().getByRole('checkbox', { name: 'Run ID column', exact: true }).uncheck()
        await tableSettings().getByRole('checkbox', { name: 'Compact rows', exact: true }).check()
        await page.keyboard.press('Escape')
        assert.equal(await table().getByRole('columnheader', { name: 'Run', exact: true }).count(), 0)
        const compactHeight = await rowHeight()
        assert.ok(compactHeight < comfortableHeight)
        await next()
        await expectRows(projection(emptyQuery, { page: 2 }))
        assert.equal(await table().getByRole('columnheader', { name: 'Run', exact: true }).count(), 0)
        assert.equal(await rowHeight(), compactHeight)
        await page.getByRole('button', { name: 'Table settings', exact: true }).click()
        assert.equal(await tableSettings().getByRole('checkbox', { name: 'Run ID column', exact: true }).isChecked(), false)
        assert.equal(await tableSettings().getByRole('checkbox', { name: 'Compact rows', exact: true }).isChecked(), true)
        await tableSettings().getByRole('checkbox', { name: 'Run ID column', exact: true }).check()
        await tableSettings().getByRole('checkbox', { name: 'Compact rows', exact: true }).uncheck()
        await page.keyboard.press('Escape')
        await page.goto(href())
        await expectRows(projection())
        record('column visibility and compact row geometry survive a remote page remount')
      }
      const beforeDraft = reads().length
      await search().fill('release 4')
      await search().evaluate((node) => node.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', bubbles: true, isComposing: true,
      })))
      await page.waitForTimeout(100)
      assert.equal(reads().length, beforeDraft)
      assert.equal(params().get('q') ?? '', '')
      await expectRows(projection())
      await search().press('Enter')
      await expectRows(projection({ ...emptyQuery, text: 'release 4' }))
      record('Basic drafts and composing Enter issue no GET; ordinary Enter commits the exact candidate')
      await search().fill('')
      await search().press('Enter')
      await expectRows(projection())
      await next()
      await expectRows(projection(emptyQuery, { page: 2 }))
      assert.equal(params().get('page'), '2')
      await page.reload()
      await expectRows(projection(emptyQuery, { page: 2 }))
      await next()
      await expectRows(projection(emptyQuery, { page: 3 }))
      assert.equal(await page.getByRole('button', {
        name: text('上一页运行', 'Previous run page'), exact: true,
      }).evaluate((node) => node === document.activeElement), true)
      await page.goBack()
      await expectRows(projection(emptyQuery, { page: 2 }))
      await page.goForward()
      await expectRows(projection(emptyQuery, { page: 3 }))
      record('exact20-row pages retain global ARIA indices across reload/Back/Forward')
      record('last-page focus moves to available Previous rather than native/ARIA-disabled Next')
      await page.goto(href())
      await expectRows(projection())
      failStatus = 503
      await next()
      await page.getByRole('alert').waitFor()
      assert.equal(await page.getByRole('button', {
        name: text('重试查询', 'Retry query'), exact: true,
      }).evaluate((node) => node === document.activeElement), true)
      failStatus = 0
      await retry()
      await expectRows(projection(emptyQuery, { page: 2 }))
      record('a failed page read restores focus to the explicit read Retry')
      await page.goto(href())
      await expectRows(projection())
      holdText = ''
      const beforeFocusedRead = held
      await next()
      await waitHeld(beforeFocusedRead)
      await search().focus()
      releaseAll()
      await expectRows(projection(emptyQuery, { page: 2 }))
      assert.equal(await search().evaluate((node) => node === document.activeElement), true)
      record('settling a delayed page read preserves user-moved search focus')
      await capacity(50)
      await expectRows(projection(emptyQuery, { pageSize: 50 }))
      assert.equal(params().get('pageSize'), '50')
      assert.equal(params().get('page'), '1')
      await capacity(100)
      await expectRows(projection(emptyQuery, { pageSize: 100 }))
      assert.equal(params().get('pageSize'), '100')
      await page.goto(href(emptyQuery, { page: 99 }))
      await expectRows(projection(emptyQuery, { page: 99 }))
      assert.equal(params().get('page'), '99')
      await shot('clamped')
      record('20/50/100 capacities use one real footer and server clamp does not rewrite requested page99')

      const titleSort = [{ sortKey: 'title', direction: 'ascending' }]
      await page.goto(href())
      await expectRows(projection())
      await table().getByRole('columnheader', {
        name: text('任务', 'Task'), exact: false,
      }).getByRole('button').first().click()
      await expectRows(projection(emptyQuery, { sorts: titleSort }))
      assert.equal(params().get('runOrder'), 'title:ascending')
      assert.equal(params().get('order'), null)
      assert.equal(params().get('sorts'), null)
      await next()
      await expectRows(projection(emptyQuery, { sorts: titleSort, page: 2 }))
      await next()
      const lastTitlePage = projection(emptyQuery, { sorts: titleSort, page: 3 })
      await expectRows(lastTitlePage)
      assert.equal(lastTitlePage.items.at(-1).task.title, 'é Research release 3')
      await shot('server-sorted-last-page')
      record('header sorting commits Run-only runOrder and preserves server Unicode order without client sorting')

      await page.goto(href({ ...emptyQuery, text: 'authority' }))
      const authoritative = projection({ ...emptyQuery, text: 'authority' })
      await expectRows(authoritative)
      assert.equal(authoritative.total, 2)
      assert.ok(authoritative.items.every((item) => !item.task.title.includes('authority')))
      record('server-authoritative text matches are displayed without browser re-filtering')
      const beforeInvalid = reads().length
      await page.goto(href(emptyQuery, { runOrder: 'attempts:descending' }))
      await page.getByRole('alert').waitFor()
      await page.waitForTimeout(100)
      assert.equal(reads().length, beforeInvalid)
      assert.deepEqual(await visibleIds(), [])
      assert.equal(params().get('runOrder'), 'attempts:descending')
      await page.getByRole('alert').getByRole('button', {
        name: text('清除查询', 'Clear query'), exact: true,
      }).click()
      await expectRows(projection())
      assert.equal(params().get('runOrder'), null)
      record('invalid runOrder remains visible and blocks GET/results until explicit clear')
      const jqlQuery = { ...emptyQuery, jql: 'ORDER BY SUMMARY DESC', mode: 'jql' }
      await page.goto(href(jqlQuery, {
        runOrder: 'created_at:ascending',
        taskSorts: [{ sortKey: 'attempts', direction: 'descending' }],
      }))
      await expectRows(projection(jqlQuery, {
        sorts: [{ sortKey: 'created_at', direction: 'ascending' }],
      }))
      const jqlRequest = new URLSearchParams(reads().at(-1).search)
      assert.deepEqual(JSON.parse(jqlRequest.get('sorts')),
        [{ sortKey: 'created_at', direction: 'ascending' }])
      assert.equal(JSON.parse(jqlRequest.get('query')).jql, 'ORDER BY SUMMARY DESC')
      assert.equal(await table().getByRole('columnheader', {
        name: text('任务', 'Task'), exact: false,
      }).getByRole('button').count(), 0)
      const beforeLockedSort = reads().length
      await table().getByRole('columnheader', {
        name: text('任务', 'Task'), exact: false,
      }).click()
      assert.equal(reads().length, beforeLockedSort)
      record('JQL SUMMARY ordering overrides valid Run ordering, ignores Task sorts and locks header sorting')

      await page.goto(href(emptyQuery, { scope: projects[0].id }))
      await expectRows(projection(emptyQuery, { scope: projects[0].id }))
      await page.goto(href({ ...emptyQuery, states: ['attention'] }))
      await expectRows(projection({ ...emptyQuery, states: ['attention'] }))
      await page.goto(href({ ...emptyQuery, states: ['pending'] }))
      await expectRows(projection({ ...emptyQuery, states: ['pending'] }))
      assert.equal(await page.getByTestId('run-history-range').innerText(), '0-0 / 0')
      record('fixed project and each Run state filter use bounded remote rows; pending has verified zero Runs')

      await page.goto(href())
      await expectRows(projection())
      for (const failure of [404, 503, 'invalid-2xx']) {
        failStatus = typeof failure === 'number' ? failure : 0
        malformed = failure === 'invalid-2xx'
        const query = {
          ...emptyQuery,
          text: failure === 404 ? 'release 1'
            : failure === 503 ? 'release 2' : 'release 5',
        }
        await search().fill(query.text)
        await search().press('Enter')
        await page.getByRole('alert').waitFor()
        assert.deepEqual(await visibleIds(), [])
        assert.equal(await search().inputValue(), query.text)
        assert.equal(await page.locator('.wf-result-count').innerText(),
          text('- 次运行', '- runs'))
        const failedReads = reads().length
        await page.waitForTimeout(100)
        assert.equal(reads().length, failedReads)
        failStatus = 0
        malformed = false
        await retry()
        await expectRows(projection(query))
        assert.equal(reads().length, failedReads + 1)
        record(`${failure} hides obsolete rows and never falls back; explicit retry sends one exact GET`)
      }

      holdText = 'release 4'
      const beforeHeld = held
      await search().fill(holdText)
      await search().press('Enter')
      await waitHeld(beforeHeld)
      assert.deepEqual(await visibleIds(), [])
      await search().fill('release 2')
      await search().press('Enter')
      await expectRows(projection({ ...emptyQuery, text: 'release 2' }))
      releaseAll()
      await page.waitForTimeout(150)
      await expectRows(projection({ ...emptyQuery, text: 'release 2' }))
      record('a delayed old response cannot replace a newer committed query')

      await page.goto(href())
      await expectRows(projection())
      capability = false
      const beforeLegacy = reads().length
      await page.reload()
      await table().getByText(poisonTask.title, { exact: true }).waitFor()
      assert.deepEqual(await visibleIds(), [poisonRun.id])
      assert.equal(reads().length, beforeLegacy)
      assert.equal(await page.getByTestId('run-history-range').count(), 0)
      capability = undefined
      await page.reload()
      await table().getByText(poisonTask.title, { exact: true }).waitFor()
      assert.deepEqual(await visibleIds(), [poisonRun.id])
      assert.equal(reads().length, beforeLegacy)
      record('false and absent run_query capability retain legacy projection without querying the new route')
      capability = true
      await page.reload()
      await expectRows(projection())

      if (name === 'desktop') {
        pollActive = true
        holdText = ''
        const previousHeld = held
        const beforeSlow = reads().length
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await waitHeld(previousHeld)
        await expectRows(projection(), true)
        const firstLink = table().locator('a.wb-table-task').first()
        assert.equal(await firstLink.getAttribute('aria-disabled'), 'true')
        const busyUrl = page.url()
        await firstLink.click({ force: true })
        assert.equal(page.url(), busyUrl)
        const beforePoll = bootstraps().length
        await page.waitForTimeout(8_000)
        assert.ok(bootstraps().length > beforePoll, 'a real6s Bootstrap poll occurred')
        assert.equal(reads().length, beforeSlow + 1)
        await expectRows(projection(), true)
        releaseAll()
        await expectRows(projection())
        record('same-key refresh retains busy rows and blocks activation; an8s GET survives real6s polling')
      }
      failStatus = 403
      const forbiddenQuery = { ...emptyQuery, text: 'release 3' }
      await search().fill(forbiddenQuery.text)
      await search().press('Enter')
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert.ok((await alert.innerText()).includes(text(
        '没有读取运行记录的权限。', 'Run history access is forbidden.',
      )))
      assert.deepEqual(await visibleIds(), [])
      assert.equal(await search().inputValue(), forbiddenQuery.text)
      const beforeForbidden = reads().length
      const beforeForbiddenPoll = bootstraps().length
      await page.waitForTimeout(name === 'desktop' ? 6_500 : 150)
      if (name === 'desktop')
        assert.ok(bootstraps().length > beforeForbiddenPoll, 'forbidden period includes an actual poll')
      assert.equal(reads().length, beforeForbidden)
      await shot('forbidden')
      failStatus = 0
      await retry()
      await expectRows(projection(forbiddenQuery))
      assert.equal(reads().length, beforeForbidden + 1)
      record('403 preserves the candidate, clears results and never auto-retries, including Bootstrap polling')

      failStatus = 401
      await search().fill('release 1')
      await search().press('Enter')
      await page.getByRole('heading', {
        name: text('登录工作空间', 'Sign in to workspace'), exact: true,
      }).waitFor()
      assert.equal(await page.getByTestId('run-history-table').count(), 0)
      assert.equal(await page.locator('.wf-querybar-primary').count(), 0)
      assert.equal(await page.getByRole('button', {
        name: text('重试查询', 'Retry query'), exact: true,
      }).count(), 0)
      const signedOutReads = reads().length
      await page.waitForTimeout(150)
      assert.equal(reads().length, signedOutReads)
      await shot('signed-out')
      record('non-JSON401 clears private Run rows/query controls and shows sign-in without replay')
    } finally {
      releaseAll()
    }
    await context.close()
  }
  assert.equal(report.geometry.length, 6)
  assert.equal(new Set(report.geometry.map((value) => value.style)).size, 3)
  for (const style of ['neutral', 'zira', 'y2k'])
    assert.deepEqual(report.geometry.filter((value) => value.style === style)
      .map((value) => value.mode).sort(), ['dark', 'light'])
  assert.ok(new Set(report.geometry.map((value) => value.color)).size >= 2)
  assert.ok(new Set(report.geometry.map((value) => JSON.stringify([
    value.background, value.color, value.accent, value.font, value.inputRadius,
  ]))).size >= 3)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.externalRequests, [])
} catch (error) {
  report.failure = {
    name: failureName,
    message: error.message,
    stack: error.stack,
    tree: await failurePage?.locator('body').ariaSnapshot().catch(() => ''),
  }
  await failurePage?.screenshot({
    path: resolve(out, 'failure.png'), fullPage: true,
  }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`)
  await browser.close()
}
console.log(JSON.stringify({
  checks: report.checks.length,
  screenshots: report.screenshots.length,
  out,
}))
