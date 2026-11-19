import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.PROJECT_QUERY_EVIDENCE_DIR ??
    '/tmp/mybot-project-query-selection',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
  ).href
)
await mkdir(out, { recursive: true })
const projects = Array.from({ length: 45 }, (_, index) => ({
  id: `picker-project-${String(index).padStart(3, '0')}`,
  name:
    index === 43
      ? 'Remote project 043 · Long localized project name 项目研发协作与多端任务交接验证'
      : `Remote project ${String(index).padStart(3, '0')}`,
})).reverse()
const tasks = projects.map((project) => ({
  id: `task-${project.id}`,
  project_id: project.id,
  title: `Remote task ${project.id.slice(-3)}`,
  goal: 'Read-only synthetic project-query fixture',
  acceptance: '',
  files: [],
  created_at: '2026-11-19T00:00:00Z',
}))
const saved = {
  id: '11111111-1111-4111-8111-111111111116',
  name: 'Remote project snapshot',
  scope_type: 'workspace',
  project_id: null,
  revision: 1,
  created_at: '2026-11-19T00:00:00Z',
  updated_at: '2026-11-19T00:00:00Z',
  definition: {
    schema_version: 1,
    query: {
      text: '',
      projects: ['picker-project-005'],
      states: [],
      jql: '',
      mode: 'basic',
    },
    table: {
      page_size: 50,
      sorts: [],
      columns: ['title', 'status'],
      column_order: [
        'id',
        'title',
        'projectName',
        'status',
        'updated',
        'attempts',
        'created_at',
      ],
    },
  },
}
function referenceResponse(url) {
  const query = (url.searchParams.get('q') ?? '').trim()
  const selectedIds = JSON.parse(url.searchParams.get('selected') ?? '[]')
  const requestedPage = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('page_size') ?? '20')
  const matched =
    query === 'authority'
      ? projects.filter((item) => item.id === 'picker-project-000')
      : projects.filter((item) =>
          `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase()),
        )
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const asReference = (project) => ({ project, task_count: 1, run_count: 0 })
  return {
    schema_version: 1,
    unit: 'project_references',
    query,
    requested_page: requestedPage,
    page,
    page_size: pageSize,
    total: matched.length,
    total_pages: totalPages,
    has_more: page < totalPages,
    order: 'projects-created-v1',
    selected_ids: selectedIds,
    selected: selectedIds.flatMap((id) =>
      projects.filter((item) => item.id === id).map(asReference),
    ),
    missing_ids: selectedIds.filter(
      (id) => !projects.some((item) => item.id === id),
    ),
    totals: { projects: 45, tasks: 45, runs: 0 },
    items: matched
      .slice((page - 1) * pageSize, page * pageSize)
      .map(asReference),
  }
}
function taskResponse(url) {
  const query = JSON.parse(url.searchParams.get('query'))
  const sorts = JSON.parse(url.searchParams.get('sorts'))
  const requestedPage = Number(url.searchParams.get('page'))
  const pageSize = Number(url.searchParams.get('page_size'))
  const scope = url.searchParams.get('scope_project_id')
  const matched = tasks.filter(
    (task) =>
      (!query.text ||
        `${task.id} ${task.title}`
          .toLowerCase()
          .includes(query.text.toLowerCase())) &&
      (!scope || task.project_id === scope) &&
      (!query.projects.length || query.projects.includes(task.project_id)) &&
      (!query.states.length || query.states.includes('pending')),
  )
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'tasks',
    items: matched
      .slice((page - 1) * pageSize, page * pageSize)
      .map((task) => ({
        task,
        project: projects.find((item) => item.id === task.project_id),
        latest_run: null,
        state_category: 'pending',
        attempts: 0,
      })),
    total: matched.length,
    requested_page: requestedPage,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    has_more: page < totalPages,
    query,
    sorts,
    scope_project_id: scope,
    sort_semantics: 'unicode-natural-v1',
  }
}
const report = {
  synthetic: true,
  checks: [],
  requests: [],
  writes: [],
  errors: [],
  screenshots: [],
  geometry: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
let failurePage
try {
  for (const [name, width, locale, style, mode, styleOnly] of [
    ['desktop', 1440, 'en', 'neutral', 'light'],
    ['mobile', 390, 'zh', 'zira', 'dark'],
    ['neutral-dark', 1440, 'en', 'neutral', 'dark', true],
    ['zira-light', 1440, 'en', 'zira', 'light', true],
    ['y2k-light', 1440, 'en', 'y2k', 'light', true],
    ['y2k-dark', 1440, 'en', 'y2k', 'dark', true],
  ]) {
    let capability = true
    let referenceStatus = 0
    let malformed = false
    let holdQuery
    let holdSelected
    const releases = []
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
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
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin)
        return route.abort()
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
        return route.fulfill({ json: { authenticated: true, required: false } })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          json: {
            projects: [
              {
                id: 'picker-project-044',
                name: 'Wrong Bootstrap name',
                goal: '',
                directory: '.',
                notes: '',
              },
            ],
            tasks: [],
            runs: [],
            models: [],
            backends: [],
            workspace: '/synthetic/project-query-selection',
            default_model_id: '',
            local_harnesses: [],
            capabilities: {
              backend_sync: false,
              task_query: true,
              project_references: capability,
            },
          },
        })
      if (url.pathname === '/api/project-references') {
        const selected = JSON.parse(url.searchParams.get('selected') ?? '[]')
        if (
          holdQuery === url.searchParams.get('q') ||
          (holdSelected && selected.includes(holdSelected))
        )
          await new Promise((done) => releases.push(done))
        if (referenceStatus === 401)
          return route.fulfill({
            status: 401,
            contentType: 'text/html',
            body: 'expired',
          })
        if (referenceStatus)
          return route.fulfill({
            status: referenceStatus,
            json: { detail: 'Synthetic reference failure' },
          })
        if (malformed) return route.fulfill({ json: { items: [], total: 0 } })
        return route.fulfill({ json: referenceResponse(url) })
      }
      if (url.pathname === '/api/tasks/query')
        return route.fulfill({ json: taskResponse(url) })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: {
            items: [saved],
            total: 1,
            offset: 0,
            limit: 20,
            has_more: false,
          },
        })
      if (url.pathname === `/api/saved-views/${saved.id}`)
        return route.fulfill({ json: saved })
      return route.fulfill({ status: 404, json: { detail: 'Unexpected API' } })
    })
    const page = await context.newPage()
    failurePage = page
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const record = (check) => {
      report.checks.push(`${name}: ${check}`)
      console.log(`PASS ${name}: ${check}`)
    }
    const requests = (path, predicate = () => true) =>
      report.requests.filter(
        (item) => item.name === name && item.path === path && predicate(item),
      )
    const referenceReads = () => requests('/api/project-references').length
    const taskReads = () => requests('/api/tasks/query').length
    const queryReads = (q) =>
      requests(
        '/api/project-references',
        (item) => new URLSearchParams(item.search).get('q') === q,
      ).length
    const params = () =>
      new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '')
    const selectedParams = () => {
      const value = params()
      return value.has('projects')
        ? JSON.parse(value.get('projects'))
        : value.has('project')
          ? [value.get('project')]
          : []
    }
    const picker = page.getByTestId('project-query-picker-dialog')
    const trigger = page
      .getByTestId('project-query-picker-trigger')
      .filter({ visible: true })
    const option = (label) =>
      picker.getByRole('checkbox', { name: label, exact: true })
    const mainSearch = () =>
      page.locator('.wf-querybar-primary').getByRole('button', {
        name: text('搜索', 'Search'),
        exact: true,
      })
    const resultSearch = () =>
      page.locator('.wf-querybar-primary').getByRole('searchbox')
    const readyPicker = async () =>
      page.waitForFunction(() => {
        const node = document.querySelector(
          '[data-testid="project-query-picker-dialog"]',
        )
        return node && node.getAttribute('aria-busy') !== 'true'
      })
    async function openPicker() {
      if (width < 650 && !(await trigger.isVisible())) {
        await page
          .getByRole('button', {
            name: text('筛选条件', 'Filters'),
            exact: true,
          })
          .click()
      }
      await trigger.click()
      await picker.waitFor()
      await readyPicker()
    }
    async function closePicker() {
      await picker
        .getByRole('button', { name: text('完成', 'Done'), exact: true })
        .click()
      await picker.waitFor({ state: 'hidden' })
    }
    async function commitCandidate() {
      if (width < 650)
        await page
          .getByRole('dialog', {
            name: text('筛选条件', 'Filters'),
            exact: true,
          })
          .getByRole('button', { name: text('搜索', 'Search'), exact: true })
          .click()
      else await mainSearch().click()
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
    function releaseAll() {
      holdQuery = undefined
      holdSelected = undefined
      for (const release of releases.splice(0)) release()
    }

    holdSelected = 'picker-project-000'
    await page.goto(`${base}#workbench?project=picker-project-000`)
    await page
      .getByRole('heading', { name: text('任务', 'Tasks'), exact: true })
      .waitFor()
    await page
      .getByLabel(text('正在确认项目引用', 'Validating project references'))
      .waitFor()
    assert.equal(taskReads(), 0)
    assert.equal(await page.locator('.wf-title-button').count(), 0)
    record(
      'Committed project absent from Bootstrap waits for reference admission before querying tasks',
    )
    releaseAll()
    await page
      .getByRole('button', { name: 'Remote task 000', exact: true })
      .waitFor()
    assert.match(
      await page.locator('.wf-heading-scope').innerText(),
      /Remote project 000/,
    )
    assert.equal(
      await page
        .getByText(
          'A selected project is unavailable. Review the conditions.',
          { exact: true },
        )
        .count(),
      0,
    )
    record(
      'Authoritative selected hydration admits an off-page project and heading without Bootstrap fallback',
    )

    await openPicker()
    await option('Remote project 044').waitFor()
    assert.equal(await picker.getByRole('checkbox').count(), 20)
    await picker
      .locator('[data-project-picker-id="picker-project-000"]')
      .getByText('Remote project 000', { exact: true })
      .waitFor()
    assert.equal(
      await picker.getByTestId('project-picker-range').innerText(),
      '1-20 / 45',
    )
    report.geometry.push({
      style,
      mode,
      ...(await picker.evaluate((node) => ({
        color: getComputedStyle(node).color,
        font: getComputedStyle(node).fontFamily,
        width: node.getBoundingClientRect().width,
        scrollWidth: node.scrollWidth,
      }))),
    })
    if (styleOnly) {
      const initial = page.url()
      await option('Remote project 044').check()
      await shot('theme-picker')
      await closePicker()
      await page
        .getByRole('button', {
          name: mode === 'light' ? 'Dark mode' : 'Light mode',
          exact: true,
        })
        .click()
      await openPicker()
      assert.equal(await option('Remote project 044').isChecked(), true)
      assert.equal(page.url(), initial)
      assert.equal(
        await page.evaluate(() => localStorage.getItem('mybot.style')),
        style,
      )
      await page.keyboard.press('Escape')
      record(
        'Theme renders with bounded geometry and preserves the unsent project selection across mode changes',
      )
      releaseAll()
      await context.close()
      continue
    }
    const beforeDraftUrl = page.url()
    const beforeDraftTasks = taskReads()
    await option('Remote project 044').check()
    await picker
      .getByRole('button', {
        name: text('下一页项目', 'Next project page'),
        exact: true,
      })
      .click()
    await option('Remote project 024').waitFor()
    await readyPicker()
    await option('Remote project 024').check()
    assert.equal(page.url(), beforeDraftUrl)
    assert.equal(taskReads(), beforeDraftTasks)
    assert.equal(
      await picker.getByTestId('project-picker-range').innerText(),
      '21-40 / 45',
    )
    record(
      'Selecting projects on different directory pages changes only the unsent Basic draft',
    )
    const find = picker.getByRole('textbox', {
      name: text('查找项目', 'Find projects'),
      exact: true,
    })
    const beforeIme = referenceReads()
    await find.fill('authority')
    await find.evaluate((node) =>
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
    assert.equal(referenceReads(), beforeIme)
    await find.press('Enter')
    await option('Remote project 000').waitFor()
    await readyPicker()
    assert.equal(await picker.getByRole('checkbox').count(), 1)
    assert.equal(
      await picker.getByTestId('project-picker-range').innerText(),
      '1-1 / 1',
    )
    assert.equal(
      await picker
        .locator('[data-project-picker-id="picker-project-044"]')
        .count(),
      1,
    )
    assert.equal(
      await picker
        .locator('[data-project-picker-id="picker-project-024"]')
        .count(),
      1,
    )
    record(
      'IME does not submit; independent directory search preserves off-page selections and server matching',
    )
    await shot('picker-selected')
    await closePicker()
    assert.equal(page.url(), beforeDraftUrl)
    assert.equal(taskReads(), beforeDraftTasks)
    await commitCandidate()
    await page.waitForFunction(
      () =>
        JSON.parse(
          new URLSearchParams(location.hash.split('?')[1]).get('projects') ??
            '[]',
        ).length === 3,
    )
    assert.deepEqual(selectedParams(), [
      'picker-project-000',
      'picker-project-024',
      'picker-project-044',
    ])
    await page
      .getByRole('button', { name: 'Remote task 024', exact: true })
      .waitFor()
    record(
      'Main Search commits the complete project candidate once and server results reflect all three projects',
    )
    await openPicker()
    await picker
      .getByRole('button', {
        name: text('清空项目选择', 'Clear project selection'),
        exact: true,
      })
      .click()
    assert.deepEqual(selectedParams(), [
      'picker-project-000',
      'picker-project-024',
      'picker-project-044',
    ])
    await closePicker()
    await commitCandidate()
    await page.waitForFunction(
      () =>
        !new URLSearchParams(location.hash.split('?')[1]).has('projects') &&
        !new URLSearchParams(location.hash.split('?')[1]).has('project'),
    )
    record(
      'Clearing project selection remains draft-only until the existing main query commit',
    )

    await openPicker()
    referenceStatus = 403
    await find.fill('failed')
    await find.press('Enter')
    await picker.getByRole('alert').waitFor()
    assert.equal(await picker.getByRole('checkbox').count(), 0)
    assert.equal(
      await picker.getByText(/Unavailable project|不可用项目/).count(),
      0,
    )
    const failedReads = queryReads('failed')
    await page.waitForTimeout(150)
    assert.equal(queryReads('failed'), failedReads)
    record(
      'Picker reference failure is an explicit error, not missing IDs, Bootstrap options or a success empty state',
    )
    referenceStatus = 0
    await picker
      .getByRole('button', {
        name: text('重试项目目录', 'Retry project directory'),
        exact: true,
      })
      .click()
    await readyPicker()
    await picker
      .getByText(text('没有匹配的项目', 'No matching projects'), {
        exact: true,
      })
      .waitFor()
    assert.equal(queryReads('failed'), failedReads + 1)
    assert.equal(await find.inputValue(), 'failed')
    record(
      'Explicit picker GET retry keeps its search input and occurs exactly once',
    )
    malformed = true
    await find.fill('malformed')
    await find.press('Enter')
    await picker.getByRole('alert').waitFor()
    assert.equal(
      await picker
        .getByText(text('没有匹配的项目', 'No matching projects'), {
          exact: true,
        })
        .count(),
      0,
    )
    malformed = false
    holdQuery = 'late'
    await find.fill('late')
    await find.press('Enter')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="project-query-picker-dialog"]')
          ?.getAttribute('aria-busy') === 'true',
    )
    assert.equal(await picker.getByRole('checkbox').count(), 0)
    await find.fill('authority')
    await find.press('Enter')
    await option('Remote project 000').waitFor()
    releaseAll()
    await page.waitForTimeout(100)
    assert.equal(await find.inputValue(), 'authority')
    assert.equal(
      await picker.getByTestId('project-picker-range').innerText(),
      '1-1 / 1',
    )
    record(
      'Malformed 2xx stays an error and a late obsolete read cannot replace a newer directory query',
    )
    await page.keyboard.press('Escape')
    await picker.waitFor({ state: 'hidden' })
    assert.equal(
      await trigger.evaluate((node) => node === document.activeElement),
      true,
    )
    if (width < 650) {
      assert.equal(
        await page
          .getByRole('dialog', {
            name: text('筛选条件', 'Filters'),
            exact: true,
          })
          .count(),
        1,
      )
      await page.keyboard.press('Escape')
    }
    record(
      'Escape restores picker trigger focus and leaves the mobile outer Filters dialog intact',
    )

    referenceStatus = 403
    const beforeBadUrl = `${base}#workbench?project=picker-project-002`
    await page.goto(beforeBadUrl)
    await page
      .getByRole('button', {
        name: text('重试项目引用', 'Retry project references'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-title-button').count(), 0)
    assert.equal(
      await page
        .getByText(
          text(
            '所选项目不可用，请重新选择条件。',
            'A selected project is unavailable. Review the conditions.',
          ),
          { exact: true },
        )
        .count(),
      0,
    )
    referenceStatus = 0
    const beforeRetryTasks = taskReads()
    await page
      .getByRole('button', {
        name: text('重试项目引用', 'Retry project references'),
        exact: true,
      })
      .click()
    await page
      .getByRole('button', { name: 'Remote task 002', exact: true })
      .waitFor()
    assert.ok(taskReads() > beforeRetryTasks)
    record(
      'Committed-reference failure blocks all result views and explicit retry restores the exact selected scope',
    )
    await page.goto(`${base}#workbench?project=missing-project`)
    await page
      .getByText(
        text(
          '所选项目不可用，请重新选择条件。',
          'A selected project is unavailable. Review the conditions.',
        ),
        { exact: true },
      )
      .waitFor()
    await openPicker()
    await picker
      .getByText(
        `${text('不可用项目', 'Unavailable project')} · missing-project`,
        { exact: true },
      )
      .waitFor()
    await picker
      .getByRole('button', {
        name: `${text('移除项目', 'Remove project')}: missing-project`,
        exact: true,
      })
      .click()
    assert.deepEqual(selectedParams(), ['missing-project'])
    await closePicker()
    await commitCandidate()
    await page.waitForFunction(
      () => !new URLSearchParams(location.hash.split('?')[1]).has('project'),
    )
    record(
      'Only server-confirmed missing IDs are labelled unavailable and can be removed from the draft',
    )

    if (width >= 650) {
      const viewAction = (label) =>
        page.getByRole('menuitem', { name: label, exact: true })
      const chooseSaved = async () => {
        await page.getByRole('button', { name: 'Views', exact: true }).click()
        await viewAction(saved.name).waitFor()
        await viewAction(saved.name).click()
      }
      holdSelected = 'picker-project-005'
      const validationRead = page.waitForRequest((request) => {
        const url = new URL(request.url())
        return (
          url.pathname === '/api/project-references' &&
          JSON.parse(url.searchParams.get('selected') ?? '[]').includes(
            'picker-project-005',
          )
        )
      })
      await chooseSaved()
      const beforeSaved = page.url()
      await validationRead
      assert.equal(page.url(), beforeSaved)
      assert.equal(
        await page.getByText('View snapshot loaded.', { exact: true }).count(),
        0,
      )
      await page.locator('.wb-nav a[href="#projects"]').click()
      assert.equal(page.url(), beforeSaved)
      await page.getByRole('button', { name: 'Views', exact: true }).click()
      assert.equal(
        await viewAction(saved.name).getAttribute('aria-disabled'),
        'true',
      )
      assert.equal(
        requests('/api/project-references', (item) =>
          JSON.parse(
            new URLSearchParams(item.search).get('selected') ?? '[]',
          ).includes('picker-project-005'),
        ).length,
        1,
      )
      await page.keyboard.press('Escape')
      await resultSearch().fill('changed while validating')
      releaseAll()
      await page
        .getByText(
          'The query or draft changed during validation. Load the view again.',
          { exact: true },
        )
        .waitFor()
      assert.equal(page.url(), beforeSaved)
      assert.equal(
        await resultSearch().inputValue(),
        'changed while validating',
      )
      assert.equal(
        await page.getByText('View snapshot loaded.', { exact: true }).count(),
        0,
      )
      record(
        'SavedView reference validation leaves URL untouched and refuses application after the Basic candidate changes',
      )
      await page.waitForTimeout(100)
      assert.equal(page.url(), beforeSaved)
      record(
        'SavedView validation blocks duplicate loads and navigation; rejected validation does not replay a queued route',
      )
      await page
        .locator('.wf-querybar-primary')
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click()
      await chooseSaved()
      await page.getByText('View snapshot loaded.', { exact: true }).waitFor()
      assert.deepEqual(selectedParams(), ['picker-project-005'])
      await page
        .getByRole('button', { name: 'Remote task 005', exact: true })
        .waitFor()
      assert.equal(params().get('pageSize'), '50')
      record(
        'A fresh validated SavedView applies its exact project and table snapshot after confirmation',
      )
      await resultSearch().fill('keep this draft')
      const beforeRejectedView = page.url()
      referenceStatus = 403
      await chooseSaved()
      await page
        .getByRole('dialog', { name: 'Replace query draft?', exact: true })
        .waitFor()
      await page.getByRole('button', { name: 'Load view', exact: true }).click()
      await page
        .getByText(
          'Project reference access is forbidden. The view was not loaded.',
          { exact: true },
        )
        .waitFor()
      assert.equal(page.url(), beforeRejectedView)
      assert.equal(await resultSearch().inputValue(), 'keep this draft')
      assert.equal(params().get('pageSize'), '50')
      record(
        'Dirty confirmation precedes fresh reference validation;403 retains query, draft and applied table settings',
      )
      referenceStatus = 0
    }
    await shot('committed')
    capability = false
    const beforeLegacy = referenceReads()
    await page.goto(`${base}?legacy=1#workbench`)
    await page
      .getByRole('heading', { name: text('任务', 'Tasks'), exact: true })
      .waitFor()
    await page.waitForTimeout(100)
    assert.equal(referenceReads(), beforeLegacy)
    assert.equal(
      await page.getByTestId('project-query-picker-trigger').count(),
      0,
    )
    record(
      'Missing project-reference capability retains the legacy selector without reference GETs',
    )
    capability = true
    referenceStatus = 401
    await page.goto(`${base}?expired=1#workbench?project=picker-project-002`)
    await page
      .getByRole('heading', {
        name: text('登录工作空间', 'Sign in to workspace'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-page').count(), 0)
    assert.equal(
      await page.getByTestId('project-query-picker-dialog').count(),
      0,
    )
    record(
      'HTML 401 clears private picker/reference projections and returns to sign-in',
    )
    releaseAll()
    await context.close()
  }
  assert.deepEqual(report.writes, [])
  assert.deepEqual(report.errors, [])
  assert.notEqual(report.geometry[0].color, report.geometry[2].color)
  assert.notEqual(report.geometry[0].font, report.geometry[4].font)
  for (const value of report.geometry)
    assert.ok(value.scrollWidth <= value.width + 1)
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  if (failurePage && !failurePage.isClosed()) {
    report.failure.tree = await failurePage.locator('body').ariaSnapshot()
    await failurePage.screenshot({
      path: resolve(out, 'failure.png'),
      fullPage: true,
    })
  }
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
