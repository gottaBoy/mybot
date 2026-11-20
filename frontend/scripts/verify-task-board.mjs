import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_BOARD_EVIDENCE_DIR ?? '/tmp/mybot-task-board',
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
const states = ['pending', 'active', 'attention', 'completed', 'other']
const firstPages = (patch = {}) =>
  Object.assign(Object.fromEntries(states.map((s) => [s, 1])), patch)
const emptyQuery = {
  text: '',
  projects: [],
  states: [],
  jql: '',
  mode: 'basic',
}
const projects = [
  { id: 'board-alpha', name: 'Alpha', goal: '', directory: '.', notes: '' },
  { id: 'board-beta', name: 'Beta', goal: '', directory: '.', notes: '' },
]
const order = Array.from({ length: 45 }, (_, index) =>
  index % 2 ? Math.floor(index / 2) : 44 - index / 2,
)
const sourceRank = new Map(order.map((index, rank) => [index, rank]))
const records = states.flatMap((state, stateIndex) =>
  Array.from(
    {
      length: ['pending', 'attention'].includes(state)
        ? 45
        : state === 'active'
          ? 2
          : 1,
    },
    (_, index) => {
      const project = projects[index % 2]
      const id = `board-${state}-${String(index).padStart(3, '0')}`
      const rank = sourceRank.get(index)
      const task = {
        id,
        project_id: project.id,
        title: `${index === 2 ? 'é ' : index === 3 ? 'Z ' : ''}${state} release ${index}`,
        goal: `Verified task goal ${state} ${index} · 多智能体研发协作目标 ${index === 44 ? '长文本内容验证 '.repeat(8) : ''}`,
        acceptance: `Acceptance of ${id}`,
        files: [`${id}.md`],
        created_at: `2026-11-20T0${stateIndex}:${String(44 - rank).padStart(2, '0')}:00Z`,
      }
      return {
        task,
        project: { id: project.id, name: project.name },
        latest_run:
          state === 'pending'
            ? null
            : {
                id: `run-${id}`,
                task_id: id,
                status: {
                  active: 'running',
                  attention: 'failed',
                  completed: 'succeeded',
                  other: 'canceled',
                }[state],
                created_at: '2026-11-20T09:00:00Z',
              },
        state_category: state,
        attempts: state === 'pending' ? 0 : state === 'completed' ? 7 : 1,
      }
    },
  ),
)
const poisonTask = {
  id: 'poison-local-task',
  project_id: projects[0].id,
  title: 'Poison Bootstrap task must stay outside remote board',
  goal: '',
  acceptance: '',
  files: [],
  created_at: '2026-11-20T00:00:00Z',
}
const poisonRun = {
  id: 'poison-local-run',
  task_id: poisonTask.id,
  status: 'succeeded',
  created_at: '2026-11-20T10:00:00Z',
}
function projection(query = emptyQuery, pages = firstPages(), scope = null) {
  const effectiveQuery = {
    ...query,
    text: query.text.trim(),
    projects: scope ? [scope] : [...query.projects].sort(),
    states: states.filter((state) => query.states.includes(state)),
  }
  const term = effectiveQuery.text.toLowerCase()
  const filtered = records.filter(
    (item) =>
      (term === 'authority'
        ? ['board-pending-002', 'board-attention-003'].includes(item.task.id)
        : !term ||
          `${item.task.id} ${item.task.title} ${item.project.name} ${item.latest_run?.id ?? ''}`
            .toLowerCase()
            .includes(term)) &&
      (!effectiveQuery.projects.length ||
        effectiveQuery.projects.includes(item.project.id)) &&
      (!effectiveQuery.states.length ||
        effectiveQuery.states.includes(item.state_category)),
  )
  return {
    schema_version: 1,
    unit: 'task_board',
    query: effectiveQuery,
    scope_project_id: scope,
    order: 'tasks-created-v1',
    column_size: 20,
    total: filtered.length,
    columns: states.map((state) => {
      const items = filtered
        .filter((item) => item.state_category === state)
        .sort((left, right) =>
          right.task.created_at.localeCompare(left.task.created_at),
        )
      const totalPages = Math.max(1, Math.ceil(items.length / 20))
      const page = Math.min(pages[state], totalPages)
      return {
        state_category: state,
        total: items.length,
        requested_page: pages[state],
        page,
        total_pages: totalPages,
        has_more: page < totalPages,
        items: items.slice((page - 1) * 20, page * 20),
      }
    }),
  }
}
function href(query = emptyQuery, options = {}) {
  const params = new URLSearchParams({
    view: options.view ?? 'board',
    q: query.text,
    mode: query.mode,
    projects: JSON.stringify(query.projects),
    states: JSON.stringify(query.states),
  })
  if (query.jql) params.set('jql', query.jql)
  if (options.pages)
    params.set(
      'boardPages',
      typeof options.pages === 'string'
        ? options.pages
        : JSON.stringify(options.pages),
    )
  if (options.inert) {
    params.set('sorts', 'malformed Task-only sorts')
    params.set('runOrder', 'malformed Run-only sort')
    params.set('page', '99')
    params.set('pageSize', '100')
  }
  return `${base}#${options.scope ? `project/${options.scope}` : 'workbench'}?${params}`
}
const report = {
  synthetic: true,
  source:
    'Intercepted strict bounded Task-board DTOs through the production frontend',
  limits: [
    'Synthetic endpoint behavior does not prove SQLite snapshot or real Provider behavior.',
    'Chrome viewports and synthetic composing Enter are not physical-device or IME certification.',
    'Poisoned legacy Bootstrap counters are deliberately different from authoritative board totals.',
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
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
let failurePage, failureName
try {
  for (const [name, width, locale, style, mode, themeOnly] of [
    ['desktop', 1440, 'en', 'neutral', 'light'],
    ['mobile', 390, 'zh', 'zira', 'dark'],
    ['neutral-dark', 1440, 'en', 'neutral', 'dark', true],
    ['zira-light', 1440, 'en', 'zira', 'light', true],
    ['y2k-light', 1440, 'en', 'y2k', 'light', true],
    ['y2k-dark', 1440, 'en', 'y2k', 'dark', true],
  ]) {
    let capability = true,
      failStatus = 0,
      malformed = false
    let authenticated = true,
      pollActive = false,
      holdText
    let held = 0
    const releases = []
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 1000 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      ({ locale, style, mode }) => {
        localStorage.setItem('mybot.locale', locale)
        localStorage.setItem('mybot.style', style)
        localStorage.setItem('mybot.mode', mode)
      },
      { locale, style, mode },
    )
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin) {
        report.externalRequests.push({
          name,
          origin: url.origin,
          path: url.pathname,
        })
        return route.abort()
      }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      report.requests.push({
        name,
        method: request.method(),
        path: url.pathname,
        search: url.search,
      })
      if (request.method() !== 'GET') {
        report.writes.push({
          name,
          method: request.method(),
          path: url.pathname,
        })
        return route.fulfill({ status: 405, json: { detail: 'No writes' } })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          json: { authenticated, required: !authenticated },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          json: {
            projects,
            tasks: [poisonTask],
            runs: [
              { ...poisonRun, status: pollActive ? 'running' : 'succeeded' },
            ],
            models: [],
            backends: [],
            local_harnesses: [],
            workspace: '/synthetic/task-board',
            default_model_id: '',
            capabilities: {
              backend_sync: false,
              ...(capability === undefined ? {} : { task_board: capability }),
            },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 20, has_more: false },
        })
      if (url.pathname === '/api/tasks/board') {
        const query = JSON.parse(url.searchParams.get('query'))
        const response = failStatus
          ? failStatus === 401
            ? {
                status: 401,
                contentType: 'text/html',
                body: '<html>Sign in required</html>',
              }
            : {
                status: failStatus,
                json: { detail: 'Synthetic board read failure' },
              }
          : malformed
            ? { status: 200, json: { columns: [] } }
            : {
                json: projection(
                  query,
                  JSON.parse(url.searchParams.get('pages')),
                  url.searchParams.get('scope_project_id'),
                ),
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
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const board = () => page.getByTestId('task-board')
    const col = (state) =>
      page.locator(`[data-testid="task-board"] [data-board-state="${state}"]`)
    const search = () =>
      page.locator('.wf-querybar-primary').getByRole('searchbox', {
        name: text('搜索', 'Search'),
        exact: true,
      })
    const params = () =>
      new URLSearchParams(new URL(page.url()).hash.split('?')[1])
    const reads = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/tasks/board',
      )
    const bootstraps = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/bootstrap',
      )
    const visibleIds = () =>
      board()
        .locator('[data-board-task]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-board-task')),
        )
    const record = (message) => {
      report.checks.push(`${name}: ${message}`)
      console.log(`PASS ${name}: ${message}`)
    }
    const shownColumns = (response) =>
      response.columns.filter((c) =>
        response.query.states.length
          ? response.query.states.includes(c.state_category)
          : c.state_category !== 'other' || c.total > 0,
      )
    async function expectBoard(response, busy = false) {
      const columns = shownColumns(response)
      await page.waitForFunction(
        ({ columns, busy, count }) => {
          const board = document.querySelector('[data-testid="task-board"]')
          const shown = Array.from(
            board?.querySelectorAll('[data-board-state]') ?? [],
          )
          return (
            board &&
            (board.getAttribute('aria-busy') === 'true') === busy &&
            document.querySelector('.wf-result-count')?.textContent.trim() ===
              count &&
            shown.length === columns.length &&
            columns.every((column, index) => {
              const element = shown[index]
              return (
                element.getAttribute('data-board-state') === column.state &&
                JSON.stringify(
                  Array.from(element.querySelectorAll('[data-board-task]')).map(
                    (node) => node.getAttribute('data-board-task'),
                  ),
                ) === JSON.stringify(column.ids) &&
                element
                  .querySelector('[data-testid="task-board-range"]')
                  ?.textContent.trim() === column.range
              )
            })
          )
        },
        {
          busy,
          count: `${response.total} ${text('项任务', 'tasks')}`,
          columns: columns.map((c) => ({
            state: c.state_category,
            ids: c.items.map((item) => item.task.id),
            range: `${c.total ? (c.page - 1) * 20 + 1 : 0}-${Math.min(c.page * 20, c.total)} / ${c.total}`,
          })),
        },
      )
      assert.deepEqual(
        await visibleIds(),
        columns.flatMap((c) => c.items.map((i) => i.task.id)),
      )
      for (const column of columns) {
        assert.equal(
          await col(column.state_category)
            .locator('header > span')
            .last()
            .innerText(),
          String(column.total),
        )
        assert.equal(
          await col(column.state_category).locator('footer').count(),
          1,
        )
      }
      assert.equal(
        await board().getByText(poisonTask.title, { exact: true }).count(),
        0,
      )
    }
    async function next(state) {
      await col(state).locator('[data-board-page="next"]').click()
    }
    async function retry() {
      await page
        .getByRole('button', {
          name: text('重试查询', 'Retry query'),
          exact: true,
        })
        .click()
    }
    function releaseAll() {
      holdText = undefined
      for (const release of releases.splice(0)) release()
    }
    async function waitHeld(previous) {
      for (let i = 0; i < 100 && held <= previous; i++)
        await page.waitForTimeout(20)
      assert.ok(held > previous, `${name}: controlled read held`)
    }
    async function shot(suffix) {
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      const file = `${name}-${suffix}.png`
      await page.screenshot({ path: resolve(out, file), fullPage: true })
      report.screenshots.push(file)
    }
    async function go(query = emptyQuery, options = {}) {
      await page.goto(href(query, options))
      await expectBoard(
        projection(
          query,
          options.pages && typeof options.pages !== 'string'
            ? options.pages
            : firstPages(),
          options.scope ?? null,
        ),
      )
    }
    try {
      await go()
      await page.waitForFunction(
        ({ style, mode }) => {
          const node = document.querySelector('.wb-theme')
          return (
            node?.getAttribute('data-style') === style &&
            node.getAttribute('data-mode') === mode
          )
        },
        { style, mode },
      )
      record(
        '94 latest-state Tasks use bounded columns and exact totals; poisoned Bootstrap is absent',
      )
      report.geometry.push({
        name,
        style,
        mode,
        width,
        ...(await page.locator('.wb-theme').evaluate((node) => {
          const css = getComputedStyle(node)
          const firstCard = document.querySelector('[data-board-task]')
          return {
            background: css.backgroundColor,
            color: css.color,
            font: css.fontFamily,
            accent: getComputedStyle(
              document.querySelector('[data-board-task] h2'),
            ).color,
            cardRadius: firstCard
              ? getComputedStyle(firstCard).borderRadius
              : '',
            boardWidth: document.querySelector('[data-testid="task-board"]')
              ?.clientWidth,
          }
        })),
      })
      const footers = await board()
        .locator('footer')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const rect = node.getBoundingClientRect()
            return { top: rect.top, bottom: rect.bottom, height: innerHeight }
          }),
        )
      assert.ok(footers.every((r) => r.top >= 0 && r.bottom <= r.height + 1))
      await shot('initial')
      if (themeOnly) {
        const before = reads().length
        await search().fill('unsubmitted appearance draft')
        await page
          .getByRole('button', {
            name: mode === 'light' ? 'Dark mode' : 'Light mode',
            exact: true,
          })
          .click()
        assert.equal(
          await search().inputValue(),
          'unsubmitted appearance draft',
        )
        await expectBoard(projection())
        assert.equal(reads().length, before)
        assert.equal(
          await page.evaluate(() => localStorage.getItem('mybot.style')),
          style,
        )
        record(
          'appearance changes preserve draft and bounded results without a board GET or write',
        )
        await context.close()
        continue
      }

      const beforeDraft = reads().length
      await search().fill('release 4')
      await search().evaluate((node) =>
        node.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            isComposing: true,
          }),
        ),
      )
      await page.waitForTimeout(100)
      assert.equal(reads().length, beforeDraft)
      await expectBoard(projection())
      await search().press('Enter')
      await expectBoard(projection({ ...emptyQuery, text: 'release 4' }))
      record(
        'Basic drafts and composing Enter issue no GET; ordinary Enter commits',
      )
      await go()
      await next('pending')
      await expectBoard(projection(emptyQuery, firstPages({ pending: 2 })))
      assert.deepEqual(
        JSON.parse(params().get('boardPages')),
        firstPages({ pending: 2 }),
      )
      await page.reload()
      await expectBoard(projection(emptyQuery, firstPages({ pending: 2 })))
      await next('pending')
      await expectBoard(projection(emptyQuery, firstPages({ pending: 3 })))
      assert.equal(
        await col('pending')
          .locator('[data-board-page="previous"]')
          .evaluate((node) => node === document.activeElement),
        true,
      )
      await page.goBack()
      await expectBoard(projection(emptyQuery, firstPages({ pending: 2 })))
      await page.goForward()
      await expectBoard(projection(emptyQuery, firstPages({ pending: 3 })))
      record(
        'per-column20 pagination preserves the other columns, URL/reload/Back/Forward and last-page focus',
      )

      await board().evaluate((node) => {
        node.scrollLeft = 310
      })
      await col('attention')
        .locator('[data-board-page="next"]')
        .scrollIntoViewIfNeeded()
      const originalScroll = await board().evaluate((node) => node.scrollLeft)
      await next('attention')
      await expectBoard(
        projection(emptyQuery, firstPages({ pending: 3, attention: 2 })),
      )
      assert.ok(
        Math.abs(
          (await board().evaluate((node) => node.scrollLeft)) - originalScroll,
        ) <= 1,
      )
      record(
        'paging another column retains its independent page and board horizontal position',
      )
      await go(emptyQuery, { pages: firstPages({ pending: 99, attention: 2 }) })
      assert.equal(JSON.parse(params().get('boardPages')).pending, 99)
      await shot('clamped')
      record(
        'server-clamped page99 remains requested in the URL and does not change another column page',
      )

      await search().fill('authority')
      await search().press('Enter')
      await expectBoard(projection({ ...emptyQuery, text: 'authority' }))
      assert.equal(params().get('boardPages'), null)
      record(
        'Search resets every board page atomically and displays authoritative text matches without re-filtering',
      )
      await go(emptyQuery, { inert: true })
      assert.equal(
        new URLSearchParams(reads().at(-1).search).has('sorts'),
        false,
      )
      assert.equal(
        new URLSearchParams(reads().at(-1).search).has('page_size'),
        false,
      )
      record(
        'Task sorts, Run order and Task page size never reorder or resize board columns',
      )
      const invalidPages = '{"pending":1}'
      const beforeInvalid = reads().length
      await page.goto(href(emptyQuery, { pages: invalidPages }))
      await page.getByRole('alert').waitFor()
      await page.waitForTimeout(100)
      assert.equal(reads().length, beforeInvalid)
      assert.equal(await board().count(), 0)
      assert.equal(params().get('boardPages'), invalidPages)
      await page
        .getByRole('radio', { name: text('任务列表', 'Tasks'), exact: true })
        .click()
      assert.equal(await page.getByRole('alert').count(), 0)
      assert.equal(params().get('boardPages'), invalidPages)
      await page
        .getByRole('radio', { name: text('看板', 'Board'), exact: true })
        .click()
      await page.getByRole('alert').waitFor()
      await page
        .getByRole('alert')
        .getByRole('button', {
          name: text('清除查询', 'Clear query'),
          exact: true,
        })
        .click()
      await expectBoard(projection())
      assert.equal(params().get('boardPages'), null)
      record(
        'invalid boardPages blocks only the remote board and remains recoverable by explicit Clear',
      )
      const beforeJql = reads().length
      await page.goto(
        href({ ...emptyQuery, jql: 'ORDER BY CREATED DESC', mode: 'jql' }),
      )
      await page.getByRole('alert').waitFor()
      assert.equal(await board().count(), 0)
      assert.equal(reads().length, beforeJql)
      await page
        .getByRole('alert')
        .getByRole('button', {
          name: text('清除查询', 'Clear query'),
          exact: true,
        })
        .click()
      await expectBoard(projection())
      record('nonempty JQL fails explicitly without issuing a board read')

      await go({ ...emptyQuery, states: ['completed'] })
      assert.equal(await col('attention').count(), 0)
      assert.ok(
        (await col('completed').innerText()).includes(
          text('7 次运行', '7 runs'),
        ),
      )
      assert.equal(
        await col('completed').locator('h2 a').getAttribute('href'),
        '#run/run-board-completed-000',
      )
      await go(emptyQuery, { scope: projects[0].id })
      await go({
        ...emptyQuery,
        projects: [projects[1].id],
        states: ['pending', 'attention'],
      })
      record(
        'project/state filters count Tasks by latest Run, preserving recovered-task attempts and exact links',
      )
      if (name === 'desktop') {
        await go(emptyQuery, {
          pages: firstPages({ pending: 2, attention: 2 }),
        })
        await page
          .locator('.wf-scope-navigation')
          .getByRole('button', { name: /Needs attention/ })
          .click()
        await expectBoard(projection({ ...emptyQuery, states: ['attention'] }))
        assert.equal(params().get('boardPages'), null)
        await go(emptyQuery, {
          pages: firstPages({ pending: 2, attention: 2 }),
        })
        await page
          .locator('.wf-scope-navigation')
          .getByRole('button', { name: /^Beta/ })
          .click()
        await expectBoard(
          projection({ ...emptyQuery, projects: [projects[1].id] }),
        )
        assert.equal(params().get('boardPages'), null)
        record(
          'immediate state/project scope commits reset board pages in the same URL patch',
        )
      }

      const fixedPages = firstPages({ pending: 2, attention: 2 })
      await go(emptyQuery, { scope: projects[0].id, pages: fixedPages })
      await page
        .getByRole('radio', {
          name: text('任务列表', 'Tasks'),
          exact: true,
        })
        .click()
      await page
        .getByRole('combobox', {
          name: new RegExp(`^${text('每页任务数', 'Tasks per page')}`),
        })
        .click()
      await page
        .getByRole('option', {
          name: text('每页 50', '50 / page'),
          exact: true,
        })
        .click()
      assert.deepEqual(JSON.parse(params().get('boardPages')), fixedPages)
      if (name === 'desktop') {
        await page
          .getByRole('table', { name: 'Tasks', exact: true })
          .getByRole('columnheader', { name: 'Task', exact: false })
          .getByRole('button')
          .first()
          .click()
        assert.deepEqual(JSON.parse(params().get('boardPages')), fixedPages)
      }
      await page
        .getByRole('radio', {
          name: text('看板', 'Board'),
          exact: true,
        })
        .click()
      await expectBoard(projection(emptyQuery, fixedPages, projects[0].id))
      async function changeMode(value) {
        const controls = page.locator('.wf-query-mode')
        if (name === 'desktop') {
          await controls
            .getByRole('radio', {
              name: value === 'jql' ? 'JQL' : 'Basic',
              exact: true,
            })
            .click()
        } else {
          await controls.getByRole('combobox').click()
          await page
            .getByRole('option', {
              name: value === 'jql' ? 'JQL' : '基本',
              exact: true,
            })
            .click()
        }
      }
      await changeMode('jql')
      await expectBoard(
        projection({ ...emptyQuery, mode: 'jql' }, fixedPages, projects[0].id),
      )
      assert.deepEqual(JSON.parse(params().get('boardPages')), fixedPages)
      await changeMode('basic')
      await expectBoard(projection(emptyQuery, fixedPages, projects[0].id))
      assert.deepEqual(JSON.parse(params().get('boardPages')), fixedPages)
      await search().fill('release 4')
      await search().press('Enter')
      await expectBoard(
        projection(
          { ...emptyQuery, text: 'release 4' },
          firstPages(),
          projects[0].id,
        ),
      )
      assert.equal(params().get('boardPages'), null)
      record(
        'fixed-project view/mode/Task capacity/sort changes preserve board pages; only query Search resets them',
      )

      await go()
      failStatus = 503
      await next('pending')
      await page.getByRole('alert').waitFor()
      assert.equal(
        await page
          .getByRole('button', {
            name: text('重试查询', 'Retry query'),
            exact: true,
          })
          .evaluate((node) => node === document.activeElement),
        true,
      )
      failStatus = 0
      await retry()
      await expectBoard(projection(emptyQuery, firstPages({ pending: 2 })))
      record(
        'failed column paging restores focus to read Retry without showing stale cards',
      )
      await go()
      holdText = ''
      const beforeFocus = held
      await next('pending')
      await waitHeld(beforeFocus)
      await search().focus()
      releaseAll()
      await expectBoard(projection(emptyQuery, firstPages({ pending: 2 })))
      assert.equal(
        await search().evaluate((node) => node === document.activeElement),
        true,
      )
      record('settling delayed paging does not steal user-moved search focus')

      await go()
      for (const failure of [404, 503, 'invalid-2xx']) {
        failStatus = typeof failure === 'number' ? failure : 0
        malformed = failure === 'invalid-2xx'
        const query = {
          ...emptyQuery,
          text: `release ${failure === 404 ? 1 : failure === 503 ? 2 : 5}`,
        }
        await search().fill(query.text)
        await search().press('Enter')
        await page.getByRole('alert').waitFor()
        assert.equal(await board().count(), 0)
        assert.equal(await search().inputValue(), query.text)
        assert.equal(
          await page.locator('.wf-result-count').innerText(),
          text('- 项任务', '- tasks'),
        )
        const count = reads().length
        await page.waitForTimeout(100)
        assert.equal(reads().length, count)
        failStatus = 0
        malformed = false
        await retry()
        await expectBoard(projection(query))
        assert.equal(reads().length, count + 1)
        record(
          `${failure} hides stale cards without fallback; explicit retry makes one GET`,
        )
      }
      holdText = 'release 4'
      const beforeHeld = held
      await search().fill(holdText)
      await search().press('Enter')
      await waitHeld(beforeHeld)
      assert.equal(await board().count(), 0)
      await search().fill('release 2')
      await search().press('Enter')
      await expectBoard(projection({ ...emptyQuery, text: 'release 2' }))
      releaseAll()
      await page.waitForTimeout(150)
      await expectBoard(projection({ ...emptyQuery, text: 'release 2' }))
      record(
        'a delayed obsolete response cannot replace a newer committed board',
      )

      await go()
      capability = false
      const beforeLegacy = reads().length
      await page.reload()
      await board().getByText(poisonTask.title, { exact: true }).waitFor()
      assert.equal(await board().locator('footer').count(), 0)
      assert.equal(reads().length, beforeLegacy)
      capability = undefined
      await page.reload()
      await board().getByText(poisonTask.title, { exact: true }).waitFor()
      assert.equal(reads().length, beforeLegacy)
      record(
        'false and absent task_board capability retain the original local board',
      )
      capability = true
      await page.reload()
      await expectBoard(projection())
      if (name === 'desktop') {
        pollActive = true
        holdText = ''
        const previous = held,
          count = reads().length
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await waitHeld(previous)
        await expectBoard(projection(), true)
        const link = col('attention').locator('h2 a').first()
        assert.equal(await link.getAttribute('aria-disabled'), 'true')
        const url = page.url()
        await link.click({ force: true })
        await col('pending')
          .getByRole('button', { name: 'Review & run', exact: true })
          .first()
          .evaluate((node) => node.click())
        assert.equal(page.url(), url)
        const beforePoll = bootstraps().length
        await page.waitForTimeout(8_000)
        assert.ok(bootstraps().length > beforePoll)
        assert.equal(reads().length, count + 1)
        await expectBoard(projection(), true)
        releaseAll()
        await expectBoard(projection())
        record(
          'same-key busy cards block Run links and Review; an8s GET survives real6s polling without replay',
        )
      }
      failStatus = 403
      const forbidden = { ...emptyQuery, text: 'release 3' }
      await search().fill(forbidden.text)
      await search().press('Enter')
      await page.getByRole('alert').waitFor()
      assert.ok(
        (await page.getByRole('alert').innerText()).includes(
          text('没有读取看板的权限', 'Task board access is forbidden'),
        ),
      )
      assert.equal(await board().count(), 0)
      const count = reads().length,
        beforePoll = bootstraps().length
      await page.waitForTimeout(name === 'desktop' ? 6_500 : 150)
      if (name === 'desktop') assert.ok(bootstraps().length > beforePoll)
      assert.equal(reads().length, count)
      await shot('forbidden')
      failStatus = 0
      await retry()
      await expectBoard(projection(forbidden))
      assert.equal(reads().length, count + 1)
      record(
        '403 preserves the candidate and never auto-retries, including an actual background poll',
      )

      failStatus = 401
      await search().fill('release 1')
      await search().press('Enter')
      await page
        .getByRole('heading', {
          name: text('登录工作空间', 'Sign in to workspace'),
          exact: true,
        })
        .waitFor()
      assert.equal(await board().count(), 0)
      assert.equal(await page.locator('.wf-querybar-primary').count(), 0)
      const signedOutReads = reads().length
      await page.waitForTimeout(100)
      assert.equal(reads().length, signedOutReads)
      await shot('signed-out')
      record(
        'non-JSON401 clears private cards and query controls without replay',
      )
    } finally {
      releaseAll()
    }
    await context.close()
  }
  assert.equal(report.geometry.length, 6)
  for (const style of ['neutral', 'zira', 'y2k'])
    assert.deepEqual(
      report.geometry
        .filter((r) => r.style === style)
        .map((r) => r.mode)
        .sort(),
      ['dark', 'light'],
    )
  assert.ok(
    new Set(
      report.geometry.map((r) =>
        JSON.stringify([r.background, r.color, r.font, r.cardRadius]),
      ),
    ).size >= 3,
  )
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.externalRequests, [])
} catch (error) {
  report.failure = {
    name: failureName,
    message: error.message,
    stack: error.stack,
    tree: await failurePage
      ?.locator('body')
      .ariaSnapshot()
      .catch(() => ''),
  }
  await failurePage
    ?.screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    out,
  }),
)
