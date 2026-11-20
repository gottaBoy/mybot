import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(process.env.TASK_INBOX_EVIDENCE_DIR ?? '/tmp/mybot-inbox')
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const projects = [
  { id: 'inbox-alpha', name: 'Alpha', goal: '', directory: '.', notes: '' },
  { id: 'inbox-beta', name: 'Beta', goal: '', directory: '.', notes: '' },
]
const rank = Array.from({ length: 45 }, (_, index) =>
  index % 2 ? Math.floor(index / 2) : 44 - index / 2,
)
const sourceRank = new Map(rank.map((value, index) => [value, index]))
const records = ['pending', 'attention', 'completed'].flatMap(
  (state, stateIndex) =>
    Array.from({ length: state === 'completed' ? 1 : 45 }, (_, index) => {
      const id = `inbox-${state}-${String(index).padStart(3, '0')}`
      const project = projects[index % 2]
      return {
        task: {
          id,
          project_id: project.id,
          title: `${index === 2 ? 'é ' : index === 3 ? 'Z ' : ''}${state} release ${index}`,
          goal: `List goal ${id} · 研发协作 ${index === 44 ? '长文本目标验证 '.repeat(7) : ''}`,
          acceptance: `List acceptance ${id}`,
          files: [`list-${id}.md`],
          created_at: `2026-11-20T0${stateIndex}:${String(44 - (sourceRank.get(index) ?? 0)).padStart(2, '0')}:00Z`,
        },
        project: { id: project.id, name: project.name },
        latest_run:
          state === 'pending'
            ? null
            : {
                id: `run-${id}`,
                task_id: id,
                status: state === 'attention' ? 'failed' : 'succeeded',
                created_at: '2026-11-20T09:00:00Z',
              },
        state_category: state,
        attempts: state === 'pending' ? 0 : 2,
      }
    }),
)
const poisonTask = {
  id: 'poison-inbox-task',
  project_id: projects[0].id,
  title: 'Poison Bootstrap Inbox task',
  goal: 'Poison Bootstrap goal',
  acceptance: 'Poison acceptance',
  files: ['poison.md'],
  created_at: '2026-11-20T00:00:00Z',
}
const poisonRun = {
  id: 'poison-inbox-run',
  task_id: poisonTask.id,
  status: 'failed',
  created_at: '2026-11-20T10:00:00Z',
  error: 'POISON_BOOTSTRAP_ERROR',
}
const report = {
  synthetic: true,
  source:
    'Intercepted existing Task query/detail DTOs through production Inbox',
  limits: [
    'Synthetic reads do not prove actual SQLite snapshot or Provider behavior.',
    'Chrome viewports and composing events are not real-device or IME certification.',
    'Poisoned Bootstrap counters intentionally differ from authoritative Inbox results.',
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
    let queryCapability = true,
      detailCapability = true,
      authenticated = true
    let listStatus = 0,
      detailStatus = 0,
      malformedList = false,
      malformedDetail = false
    let pollActive = false,
      holdListText,
      holdDetailId,
      movedId
    const removed = new Set()
    let heldList = 0,
      heldDetail = 0
    const releases = []
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const selectedStates = (type = 'all') =>
      type === 'all' ? ['pending', 'attention'] : [type]
    function projection(
      queryText = '',
      type = 'all',
      requestedPage = 1,
      pageSize = 20,
    ) {
      const term = queryText.trim().toLowerCase()
      const states = selectedStates(type)
      const filtered = records
        .filter(
          (item) =>
            !removed.has(item.task.id) &&
            item.task.id !== movedId &&
            states.includes(item.state_category) &&
            (term === 'authority'
              ? item.task.id === 'inbox-attention-002'
              : !term ||
                `${item.task.id} ${item.task.title} ${item.project.name} ${item.latest_run?.id ?? ''}`
                  .toLowerCase()
                  .includes(term)),
        )
        .sort((a, b) => b.task.created_at.localeCompare(a.task.created_at))
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
      const page = Math.min(requestedPage, totalPages)
      return {
        schema_version: 1,
        unit: 'tasks',
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        total: filtered.length,
        requested_page: requestedPage,
        page,
        page_size: pageSize,
        total_pages: totalPages,
        has_more: page < totalPages,
        query: {
          text: queryText.trim(),
          projects: [],
          states,
          jql: '',
          mode: 'basic',
        },
        sorts: [],
        scope_project_id: null,
        sort_semantics: 'unicode-natural-v1',
      }
    }
    function detail(id) {
      const source = records.find((item) => item.task.id === id)
      assert.ok(source, `Known detail fixture ${id}`)
      const item = structuredClone(source)
      item.task.goal = `Fresh detail goal ${id} · 完整任务目标`
      item.task.acceptance = `Fresh acceptance ${id}`
      item.task.files = [`fresh-${id}.md`, 'README.md']
      if (id === movedId) {
        item.latest_run = {
          id: `completed-${id}`,
          task_id: id,
          status: 'succeeded',
          created_at: '2026-11-20T11:00:00Z',
        }
        item.state_category = 'completed'
        item.attempts = 2
      }
      const history = item.latest_run
        ? [
            item.latest_run,
            {
              id: `old-${id}`,
              task_id: id,
              status: 'failed',
              created_at: '2026-11-19T09:00:00Z',
            },
          ]
        : []
      return {
        schema_version: 1,
        unit: 'task_detail',
        item,
        history: {
          unit: 'runs',
          items: history,
          total: history.length,
          requested_page: 1,
          page: 1,
          page_size: 20,
          total_pages: 1,
          has_more: false,
          order: 'created-desc-source-v1',
        },
      }
    }
    function href(
      query = '',
      type = 'all',
      page = 1,
      capacity = 20,
      extra = {},
    ) {
      const params = new URLSearchParams({
        q: query,
        inboxType: type,
        page: String(page),
        pageSize: String(capacity),
        ...extra,
      })
      return `${base}#inbox?${params}`
    }
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
        path: url.pathname,
        search: url.search,
        method: request.method(),
      })
      if (request.method() !== 'GET') {
        report.writes.push({
          name,
          path: url.pathname,
          method: request.method(),
        })
        return route.fulfill({
          status: 405,
          json: { detail: 'No synthetic writes' },
        })
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
            models: [],
            backends: [],
            runs: [{ ...poisonRun, status: pollActive ? 'running' : 'failed' }],
            workspace: '/synthetic/inbox',
            default_model_id: '',
            local_harnesses: [],
            capabilities: {
              backend_sync: false,
              ...(queryCapability === undefined
                ? {}
                : { task_query: queryCapability }),
              ...(detailCapability === undefined
                ? {}
                : { task_detail: detailCapability }),
            },
          },
        })
      if (url.pathname === '/api/tasks/query') {
        const query = JSON.parse(url.searchParams.get('query'))
        assert.deepEqual(query.projects, [])
        assert.equal(query.jql, '')
        assert.equal(query.mode, 'basic')
        assert.deepEqual(JSON.parse(url.searchParams.get('sorts')), [])
        assert.equal(url.searchParams.has('scope_project_id'), false)
        const type = query.states.length === 2 ? 'all' : query.states[0]
        assert.deepEqual(query.states, selectedStates(type))
        const response = listStatus
          ? listStatus === 401
            ? {
                status: 401,
                contentType: 'text/html',
                body: '<html>Sign in required</html>',
              }
            : {
                status: listStatus,
                json: { detail: 'Synthetic Inbox list failure' },
              }
          : malformedList
            ? { status: 200, json: { items: [] } }
            : {
                json: projection(
                  query.text,
                  type,
                  Number(url.searchParams.get('page')),
                  Number(url.searchParams.get('page_size')),
                ),
              }
        if (listStatus === 401) authenticated = false
        if (holdListText !== undefined && query.text === holdListText) {
          heldList++
          await new Promise((resolve) => releases.push(resolve))
          return route.fulfill(response).catch(() => {})
        }
        return route.fulfill(response)
      }
      const match = /^\/api\/tasks\/([^/]+)\/detail$/.exec(url.pathname)
      if (match) {
        const id = decodeURIComponent(match[1])
        assert.equal(url.searchParams.get('page'), '1')
        assert.equal(url.searchParams.get('page_size'), '20')
        const response = detailStatus
          ? {
              status: detailStatus,
              json: { detail: 'Synthetic Inbox detail failure' },
            }
          : malformedDetail
            ? { status: 200, json: { item: {} } }
            : { json: detail(id) }
        if (holdDetailId === id) {
          heldDetail++
          await new Promise((resolve) => releases.push(resolve))
          return route.fulfill(response).catch(() => {})
        }
        return route.fulfill(response)
      }
      report.unexpected.push({ name, path: url.pathname, search: url.search })
      return route.fulfill({
        status: 404,
        json: { detail: 'Unexpected synthetic endpoint' },
      })
    })
    const page = await context.newPage()
    failurePage = page
    failureName = name
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const view = () => page.getByTestId('inbox-view')
    const rows = () => page.locator('[data-inbox-task]')
    const row = (id) => page.locator(`[data-inbox-task="${id}"]`)
    const search = () =>
      page.getByRole('searchbox', {
        name: text('搜索待处理任务', 'Search inbox'),
        exact: true,
      })
    const body = () =>
      width < 500 ? page.getByRole('dialog') : page.locator('.wb-inbox-detail')
    const listReads = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/tasks/query',
      )
    const detailReads = () =>
      report.requests.filter(
        (r) => r.name === name && /^\/api\/tasks\/[^/]+\/detail$/.test(r.path),
      )
    const bootstraps = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/bootstrap',
      )
    const params = () =>
      new URLSearchParams(new URL(page.url()).hash.split('?')[1])
    function record(message) {
      report.checks.push(`${name}: ${message}`)
      console.log(`PASS ${name}: ${message}`)
    }
    async function expectPage(value) {
      await page.waitForFunction(
        ({ ids, range }) => {
          const root = document.querySelector('[data-testid="inbox-view"]')
          const actual = [
            ...document.querySelectorAll('[data-inbox-task]'),
          ].map((node) => node.getAttribute('data-inbox-task'))
          return (
            root &&
            root.getAttribute('aria-busy') !== 'true' &&
            !root.querySelector('.wb-inbox-layout[aria-busy="true"]') &&
            JSON.stringify(actual) === JSON.stringify(ids) &&
            root
              .querySelector('[data-testid="inbox-range"]')
              ?.textContent.trim() === range
          )
        },
        {
          ids: value.items.map((item) => item.task.id),
          range: `${value.total ? (value.page - 1) * value.page_size + 1 : 0}-${Math.min(value.page * value.page_size, value.total)} / ${value.total}`,
        },
      )
      assert.deepEqual(
        await rows().evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-inbox-task')),
        ),
        value.items.map((item) => item.task.id),
      )
      assert.equal(
        await view().getByText(poisonTask.title, { exact: true }).count(),
        0,
      )
    }
    async function go(
      query = '',
      type = 'all',
      pageNumber = 1,
      capacity = 20,
      extra = {},
    ) {
      await page.goto(href(query, type, pageNumber, capacity, extra))
      await page.reload()
      await expectPage(projection(query, type, pageNumber, capacity))
    }
    async function waitHeld(kind, previous) {
      for (
        let i = 0;
        i < 100 && (kind === 'list' ? heldList : heldDetail) <= previous;
        i++
      )
        await page.waitForTimeout(20)
      assert.ok(
        (kind === 'list' ? heldList : heldDetail) > previous,
        `Held ${kind} read`,
      )
    }
    function releaseAll() {
      holdListText = undefined
      holdDetailId = undefined
      for (const release of releases.splice(0)) release()
    }
    async function choose(id) {
      await row(id).click()
      if (width < 500) await page.getByRole('dialog').waitFor()
    }
    async function expectDetail(id) {
      await body()
        .getByText(`Fresh detail goal ${id} · 完整任务目标`, { exact: true })
        .waitFor()
      await body()
        .getByText(`Fresh acceptance ${id}`, { exact: true })
        .waitFor()
      await body()
        .getByText(`fresh-${id}.md, README.md`, { exact: true })
        .waitFor()
    }
    async function closeDetail() {
      if (width < 500) {
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
      }
    }
    async function retryList() {
      await page
        .getByRole('button', {
          name: text('重试待处理', 'Retry inbox'),
          exact: true,
        })
        .click()
    }
    async function clear() {
      await page
        .locator('.wb-inbox-query')
        .getByRole('button', {
          name: text('清除待处理筛选', 'Clear inbox'),
          exact: true,
        })
        .click()
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
    try {
      await go()
      const firstId = projection().items[0].task.id
      await page.waitForFunction(
        ({ style, mode }) => {
          const root = document.querySelector('.wb-theme')
          return (
            root?.getAttribute('data-style') === style &&
            root.getAttribute('data-mode') === mode
          )
        },
        { style, mode },
      )
      if (width < 500) assert.equal(detailReads().length, 0)
      else await expectDetail(firstId)
      record(
        '90 eligible Task-latest records use exact20-row pages and true total; poisoned Bootstrap is absent',
      )
      report.geometry.push({
        name,
        width,
        style,
        mode,
        ...(await page.locator('.wb-theme').evaluate((node) => {
          const css = getComputedStyle(node)
          const selected = document.querySelector('[data-inbox-task]')
          return {
            background: css.backgroundColor,
            color: css.color,
            font: css.fontFamily,
            rowRadius: selected ? getComputedStyle(selected).borderRadius : '',
          }
        })),
      })
      const geometry = await page
        .getByTestId('inbox-range')
        .evaluate((node) => ({
          bottom: node.getBoundingClientRect().bottom,
          height: innerHeight,
        }))
      assert.ok(
        geometry.bottom <= geometry.height + 1,
        JSON.stringify(geometry),
      )
      await shot('initial')
      if (themeOnly) {
        const before = listReads().length
        await search().fill('Appearance draft')
        await page
          .getByRole('button', {
            name: mode === 'light' ? 'Dark mode' : 'Light mode',
            exact: true,
          })
          .click()
        assert.equal(await search().inputValue(), 'Appearance draft')
        await expectPage(projection())
        assert.equal(listReads().length, before)
        record(
          'appearance changes retain pending search and admitted pages without API reads or mutations',
        )
        await context.close()
        continue
      }

      await choose(firstId)
      await expectDetail(firstId)
      assert.equal(
        await body()
          .getByRole('link', {
            name: text('打开运行', 'Open run'),
            exact: true,
          })
          .getAttribute('href'),
        `#run/run-${firstId}`,
      )
      assert.equal(
        await body()
          .getByText('POISON_BOOTSTRAP_ERROR', { exact: true })
          .count(),
        0,
      )
      await shot('selected')
      await closeDetail()
      if (width < 500)
        assert.equal(
          await row(firstId).evaluate(
            (node) => node === document.activeElement,
          ),
          true,
        )
      record(
        'one presented detail consumer reads fresh goal/acceptance/files, exact Run link and mobile Escape focus',
      )

      const beforeDraft = listReads().length
      await search().fill('Unsubmitted scope draft')
      await page.waitForTimeout(100)
      assert.equal(listReads().length, beforeDraft)
      await page
        .getByRole('radio', {
          name: text('未运行', 'Not started'),
          exact: true,
        })
        .click()
      await expectPage(projection('', 'pending'))
      assert.equal(await search().inputValue(), 'Unsubmitted scope draft')
      await search().fill('release 4')
      const beforeComposition = listReads().length
      await search().dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        keyCode: 229,
      })
      await page.waitForTimeout(100)
      assert.equal(listReads().length, beforeComposition)
      await search().press('Enter')
      await expectPage(projection('release 4', 'pending'))
      assert.equal(params().get('q'), 'release 4')
      await page.reload()
      await expectPage(projection('release 4', 'pending'))
      record(
        'scope navigation preserves a draft; composing Enter makes no GET and ordinary Enter commits search/page1',
      )
      await clear()
      await expectPage(projection())
      assert.equal(await search().inputValue(), '')

      await page.locator('[data-inbox-page="next"]').click()
      await expectPage(projection('', 'all', 2))
      await page.reload()
      await expectPage(projection('', 'all', 2))
      await page.goBack()
      await expectPage(projection())
      await page.goForward()
      await expectPage(projection('', 'all', 2))
      await go('', 'all', 99)
      assert.equal(params().get('page'), '99')
      await page.waitForFunction(() => {
        const button = document.querySelector('[data-inbox-page="next"]')
        return button?.matches(':disabled,[aria-disabled="true"]')
      })
      await shot('clamped')
      record(
        'pagination preserves global server order and URL across reload/Back/Forward; page99 clamps without URL rewrite',
      )
      await go()
      const capacity = page.getByRole('combobox', {
        name: new RegExp(`^${text('每页待处理数', 'Inbox items per page')}`),
      })
      await capacity.click()
      await page
        .getByRole('option', {
          name: text('每页 50', '50 / page'),
          exact: true,
        })
        .click()
      await expectPage(projection('', 'all', 1, 50))
      await page.locator('[data-inbox-page="next"]').click()
      await expectPage(projection('', 'all', 2, 50))
      await page.waitForFunction(() =>
        document.activeElement?.matches('[data-inbox-page="previous"]'),
      )
      await capacity.click()
      await page
        .getByRole('option', {
          name: text('每页 100', '100 / page'),
          exact: true,
        })
        .click()
      await expectPage(projection('', 'all', 1, 100))
      record(
        '20/50/100 capacities use a single real footer; final Next focus moves to available Previous',
      )
      await go('', 'all', 1, 20, {
        order: 'title:ascending',
        sorts: 'malformed Task presentation',
        runOrder: 'malformed Run presentation',
        boardPages: 'malformed Board presentation',
      })
      await search().fill('authority')
      await search().press('Enter')
      await expectPage(projection('authority'))
      assert.equal(await rows().count(), 1)
      record(
        'Task/Run/Board presentation state is inert; server-authoritative Unicode/text matches are not browser-filtered',
      )

      const beforeInvalid = listReads().length
      await page.goto(href('release 2', 'unknown-inbox-type'))
      await page.getByRole('alert').waitFor()
      assert.equal(await rows().count(), 0)
      assert.equal(listReads().length, beforeInvalid)
      assert.equal(params().get('inboxType'), 'unknown-inbox-type')
      await clear()
      await expectPage(projection())
      record(
        'invalid Inbox type is retained and fails closed until explicit Clear',
      )
      const beforeUnsupported = listReads().length
      await page.goto(
        href('', 'all', 1, 20, { jql: 'assignee = currentUser()' }),
      )
      await page.getByRole('alert').waitFor()
      assert.equal(await rows().count(), 0)
      assert.equal(listReads().length, beforeUnsupported)
      await clear()
      await expectPage(projection())
      record(
        'unsupported Inbox JQL fails explicitly rather than returning an unfiltered success',
      )

      await go()
      for (const [index, failure] of [403, 404, 'invalid-2xx'].entries()) {
        const id = projection().items[index + 1].task.id
        detailStatus = typeof failure === 'number' ? failure : 0
        malformedDetail = failure === 'invalid-2xx'
        await choose(id)
        await body().getByRole('alert').waitFor()
        assert.equal(
          await body().getByText(`List goal ${id}`, { exact: true }).count(),
          0,
        )
        assert.equal(
          await body()
            .getByRole('link', {
              name: text('打开运行', 'Open run'),
              exact: true,
            })
            .count(),
          0,
        )
        const before = detailReads().length
        await page.waitForTimeout(100)
        assert.equal(detailReads().length, before)
        detailStatus = 0
        malformedDetail = false
        await body()
          .getByRole('button', {
            name: text('重试待处理详情', 'Retry inbox details'),
            exact: true,
          })
          .click()
        await expectDetail(id)
        assert.equal(detailReads().length, before + 1)
        await closeDetail()
        record(
          `detail ${failure} exposes read error without list/Bootstrap fallback; Retry reads exactly once`,
        )
      }
      await go()
      const moved = projection().items[1].task.id
      movedId = moved
      await choose(moved)
      await body()
        .getByRole('heading', {
          name: text(
            '所选任务已不在当前待处理中',
            'Selected task is no longer in this inbox',
          ),
          exact: true,
        })
        .waitFor()
      assert.equal(
        await body()
          .getByRole('link', {
            name: text('打开运行', 'Open run'),
            exact: true,
          })
          .count(),
        0,
      )
      await body()
        .getByRole('button', {
          name: text('刷新待处理', 'Refresh inbox'),
          exact: true,
        })
        .click()
      await expectPage(projection())
      await closeDetail()
      movedId = undefined
      record(
        'a fresh completed detail is not actionable in Inbox; its explicit refresh revalidates the eligible list',
      )
      detailCapability = false
      const beforeNoDetail = detailReads().length
      await go()
      await choose(firstId)
      await body()
        .getByText(records.find((r) => r.task.id === firstId).task.goal, {
          exact: true,
        })
        .waitFor()
      assert.equal(detailReads().length, beforeNoDetail)
      await closeDetail()
      detailCapability = true
      record(
        'missing detail capability uses the admitted full list Task snapshot without Bootstrap supplementation or GET',
      )

      if (width < 500) pollActive = true
      await go()
      await choose(firstId)
      await expectDetail(firstId)
      removed.add(firstId)
      if (width >= 500)
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await expectPage(projection())
      await body()
        .getByRole('heading', {
          name: text(
            '所选任务已不在当前结果中',
            'Selected task is no longer in these results',
          ),
          exact: true,
        })
        .waitFor()
      assert.equal(
        await rows().evaluateAll(
          (nodes) =>
            nodes.filter((node) => node.getAttribute('aria-pressed') === 'true')
              .length,
        ),
        0,
      )
      await closeDetail()
      removed.clear()
      pollActive = false
      record(
        'same-key removal keeps an explicit selection unavailable instead of silently selecting another Task',
      )

      await go()
      const lateId = projection().items[1].task.id
      const currentId = projection().items[2].task.id
      holdDetailId = lateId
      const previousDetailHeld = heldDetail
      await choose(lateId)
      await waitHeld('detail', previousDetailHeld)
      await closeDetail()
      await choose(currentId)
      await expectDetail(currentId)
      releaseAll()
      await page.waitForTimeout(100)
      await expectDetail(currentId)
      await closeDetail()
      record('a canceled late detail cannot replace a newer selected Task')
      await go()
      holdListText = 'release 4'
      const previousListHeld = heldList
      await search().fill(holdListText)
      await search().press('Enter')
      await waitHeld('list', previousListHeld)
      assert.equal(await rows().count(), 0)
      await search().fill('release 2')
      await search().press('Enter')
      await expectPage(projection('release 2'))
      releaseAll()
      await page.waitForTimeout(100)
      await expectPage(projection('release 2'))
      record('a late obsolete page cannot replace the latest committed query')

      await go()
      listStatus = 503
      await page.locator('[data-inbox-page="next"]').click()
      await page.getByRole('alert').waitFor()
      await page.waitForFunction(
        (label) =>
          document.activeElement?.textContent.includes(label) ||
          document.activeElement?.getAttribute('aria-label') === label,
        text('重试待处理', 'Retry inbox'),
      )
      listStatus = 0
      await retryList()
      await expectPage(projection('', 'all', 2))
      record(
        'failed paging restores read Retry focus and retains the requested page for explicit retry',
      )
      await go()
      holdListText = ''
      const beforeFocus = heldList
      await page.locator('[data-inbox-page="next"]').click()
      await waitHeld('list', beforeFocus)
      await search().focus()
      releaseAll()
      await expectPage(projection('', 'all', 2))
      assert.equal(
        await search().evaluate((node) => node === document.activeElement),
        true,
      )
      record('delayed paging does not steal user-moved search focus')

      for (const [index, failure] of [404, 503, 'invalid-2xx'].entries()) {
        await go()
        listStatus = typeof failure === 'number' ? failure : 0
        malformedList = failure === 'invalid-2xx'
        const candidate = `release ${index + 1}`
        await search().fill(candidate)
        await search().press('Enter')
        await page.getByRole('alert').waitFor()
        assert.equal(await rows().count(), 0)
        assert.equal(await search().inputValue(), candidate)
        const before = listReads().length
        listStatus = 0
        malformedList = false
        await retryList()
        await expectPage(projection(candidate))
        assert.equal(listReads().length, before + 1)
        record(
          `list ${failure} clears old rows and exposes one explicit GET retry without fallback`,
        )
      }
      queryCapability = false
      const beforeLegacy = listReads().length
      await page.reload()
      await page
        .locator('.wb-inbox-list')
        .getByRole('button', { name: poisonTask.title, exact: true })
        .waitFor()
      assert.equal(listReads().length, beforeLegacy)
      queryCapability = undefined
      await page.reload()
      await page
        .locator('.wb-inbox-list')
        .getByRole('button', { name: poisonTask.title, exact: true })
        .waitFor()
      assert.equal(listReads().length, beforeLegacy)
      queryCapability = true
      record(
        'false and absent task_query capability retain the original local Inbox without calling the endpoint',
      )

      if (name === 'desktop') {
        await go()
        await expectDetail(firstId)
        pollActive = true
        holdListText = ''
        const beforeHeld = heldList
        const beforeReads = listReads().length
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await waitHeld('list', beforeHeld)
        const rowBefore = await rows().first().getAttribute('data-inbox-task')
        const beforeActionDetails = detailReads().length
        await rows()
          .nth(1)
          .evaluate((node) => node.click())
        const run = body().getByRole('link', { name: 'Open run', exact: true })
        const previousUrl = page.url()
        if (await run.count()) await run.evaluate((node) => node.click())
        assert.equal(page.url(), previousUrl)
        assert.equal(detailReads().length, beforeActionDetails)
        assert.equal(
          await rows().first().getAttribute('data-inbox-task'),
          rowBefore,
        )
        const beforePoll = bootstraps().length
        await page.waitForTimeout(8_000)
        assert.ok(bootstraps().length > beforePoll)
        assert.equal(listReads().length, beforeReads + 1)
        releaseAll()
        await expectPage(projection())
        record(
          'same-key busy rows/actions are blocked; an8s page GET survives real6s polling without replay',
        )
        await expectDetail(firstId)
        holdDetailId = firstId
        const beforeDetail = heldDetail
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await waitHeld('detail', beforeDetail)
        await page.waitForTimeout(100)
        const previous = page.url()
        const currentRun = body().getByRole('link', {
          name: 'Open run',
          exact: true,
        })
        if (await currentRun.count())
          await currentRun.evaluate((node) => node.click())
        assert.equal(page.url(), previous)
        releaseAll()
        await expectDetail(firstId)
        record(
          'same-key refreshing details retain content but block their domain actions',
        )
        await go('', 'pending')
        const pendingId = projection('', 'pending').items[0].task.id
        await expectDetail(pendingId)
        holdListText = ''
        const beforePendingHeld = heldList
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        await waitHeld('list', beforePendingHeld)
        await body()
          .getByRole('button', { name: 'Review & run', exact: true })
          .evaluate((node) => node.click())
        assert.deepEqual(report.writes, [])
        releaseAll()
        await expectPage(projection('', 'pending'))
        record('busy pending Task details cannot start the Review context flow')
      }

      await go()
      if (name === 'desktop') pollActive = true
      listStatus = 403
      await search().fill('release 3')
      await search().press('Enter')
      await page.getByRole('alert').waitFor()
      assert.equal(await rows().count(), 0)
      const beforeForbidden = listReads().length
      const beforePoll = bootstraps().length
      await page.waitForTimeout(name === 'desktop' ? 6_500 : 150)
      if (name === 'desktop') assert.ok(bootstraps().length > beforePoll)
      assert.equal(listReads().length, beforeForbidden)
      await shot('forbidden')
      listStatus = 0
      await retryList()
      await expectPage(projection('release 3'))
      record(
        '403 keeps its query and remains failed across Bootstrap polling until explicit read retry',
      )
      listStatus = 401
      await search().fill('release 1')
      await search().press('Enter')
      await page
        .getByRole('heading', {
          name: text('登录工作空间', 'Sign in to workspace'),
          exact: true,
        })
        .waitFor()
      assert.equal(await view().count(), 0)
      assert.equal(await rows().count(), 0)
      await shot('signed-out')
      record(
        'non-JSON401 clears private list/detail/search state without replay',
      )
    } finally {
      releaseAll()
    }
    await context.close()
  }
  assert.equal(report.geometry.length, 6)
  assert.ok(
    new Set(
      report.geometry.map((g) =>
        JSON.stringify([g.background, g.color, g.font, g.rowRadius]),
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
