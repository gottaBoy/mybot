import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compareTaskQueryItems } from '../tests/fixtures/task-query-order.ts'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
const out = resolve(
  process.env.TASK_QUERY_CLIENT_EVIDENCE_DIR ?? '/tmp/mybot-task-query-client',
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const projects = [
  { id: 'query-alpha', name: 'Alpha', goal: '', directory: '.', notes: '' },
  { id: 'query-beta', name: 'Beta', goal: '', directory: '.', notes: '' },
]
const tasks = Array.from({ length: 45 }, (_, index) => ({
  id: `query-task-${String(index + 1).padStart(3, '0')}`,
  project_id: projects[index % 2].id,
  title: `Research release ${index + 1}`,
  goal: 'Synthetic server query task',
  acceptance: '',
  files: [],
  created_at: `2026-11-16T00:${String(index % 6).padStart(2, '0')}:00Z`,
}))
const statuses = ['succeeded', 'paused', 'failed', undefined, 'canceled']
const runs = tasks.flatMap((task, index) =>
  statuses[index % statuses.length]
    ? [
        {
          id: `query-run-${index + 1}`,
          task_id: task.id,
          status: statuses[index % statuses.length],
          created_at: `2026-11-16T01:${String(index % 6).padStart(2, '0')}:00Z`,
        },
      ]
    : [],
)
const bootstrap = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  workspace: '/synthetic/task-query-client',
  default_model_id: '',
  local_harnesses: [],
  capabilities: { backend_sync: false, task_query: true },
}
const stateOf = (task) => {
  const run = runs.find((candidate) => candidate.task_id === task.id)
  if (!run) return 'pending'
  if (
    ['queued', 'running', 'pause_requested', 'cancel_requested'].includes(
      run.status,
    )
  )
    return 'active'
  if (['failed', 'interrupted', 'paused'].includes(run.status))
    return 'attention'
  if (run.status === 'succeeded') return 'completed'
  return 'other'
}
function asItem(task) {
  const run = runs.find((candidate) => candidate.task_id === task.id)
  return {
    id: task.id,
    task,
    run,
    projectName: projects.find((project) => project.id === task.project_id)
      .name,
    column: stateOf(task),
    attempts: run ? 1 : 0,
  }
}
const report = {
  synthetic: true,
  checks: [],
  requests: [],
  writes: [],
  errors: [],
  screenshots: [],
}
const savedProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Saved server view',
  scope_type: 'workspace',
  project_id: null,
  revision: 1,
  created_at: '2026-11-16T00:00:00Z',
  updated_at: '2026-11-16T00:00:00Z',
  definition: {
    schema_version: 1,
    query: {
      text: 'release 4',
      projects: [],
      states: [],
      jql: '',
      mode: 'basic',
    },
    table: {
      page_size: 50,
      sorts: [{ sortKey: 'title', direction: 'ascending' }],
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
await mkdir(out, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const contexts = [
  ['desktop', { width: 1440, height: 1000 }, 'en'],
  ['mobile', { width: 390, height: 844 }, 'zh'],
]
try {
  for (const [name, viewport, locale] of contexts) {
    runs[0].status = 'succeeded'
    let capability = true
    let failStatus = 0
    let nonJsonFailure = false
    let authenticated = true
    let malformed = false
    let held
    let release
    let holdText = ''
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript((value) => {
      localStorage.setItem('mybot.locale', value)
      localStorage.setItem('mybot.mode', 'light')
      localStorage.setItem('mybot.style', 'neutral')
    }, locale)
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
        return route.fulfill({
          status: 200,
          json: { authenticated, required: !authenticated },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          status: 200,
          json: {
            ...bootstrap,
            capabilities: { ...bootstrap.capabilities, task_query: capability },
          },
        })
      if (url.pathname === '/api/saved-views') {
        const items =
          url.searchParams.get('scope_type') === 'workspace'
            ? [savedProfile]
            : []
        return route.fulfill({
          status: 200,
          json: {
            items,
            total: items.length,
            offset: 0,
            limit: 20,
            has_more: false,
          },
        })
      }
      if (url.pathname === `/api/saved-views/${savedProfile.id}`)
        return route.fulfill({ status: 200, json: savedProfile })
      if (url.pathname === '/api/tasks/query') {
        const query = JSON.parse(url.searchParams.get('query'))
        if (holdText && query.text === holdText) {
          held = true
          await new Promise((resolve) => {
            release = resolve
          })
        }
        if (failStatus) {
          if (failStatus === 401) authenticated = false
          if (nonJsonFailure)
            return route.fulfill({
              status: failStatus,
              contentType: 'text/html',
              body: '<html><body>Authentication required</body></html>',
            })
          return route.fulfill({
            status: failStatus,
            json: { detail: 'Synthetic read failure' },
          })
        }
        if (malformed)
          return route.fulfill({ status: 200, json: { items: [] } })
        const page = Number(url.searchParams.get('page'))
        const pageSize = Number(url.searchParams.get('page_size'))
        const term = query.text.toLocaleLowerCase()
        const sorts = query.jql
          ? [
              {
                sortKey: query.jql.includes('SUMMARY') ? 'title' : 'created_at',
                direction: query.jql.endsWith('DESC')
                  ? 'descending'
                  : 'ascending',
              },
            ]
          : JSON.parse(url.searchParams.get('sorts'))
        const values = tasks
          .filter((task) => {
            const run = runs.find((candidate) => candidate.task_id === task.id)
            return (
              (!term ||
                `${task.id} ${task.title} ${projects.find((project) => project.id === task.project_id).name}`
                  .toLocaleLowerCase()
                  .includes(term)) &&
              (!query.projects.length ||
                query.projects.includes(task.project_id)) &&
              (!query.states.length || query.states.includes(stateOf(task)))
            )
          })
          .sort((a, b) => compareTaskQueryItems(asItem(a), asItem(b), sorts))
        const totalPages = Math.max(1, Math.ceil(values.length / pageSize))
        const currentPage = Math.min(page, totalPages)
        const selected = values.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        )
        return route.fulfill({
          status: 200,
          json: {
            schema_version: 1,
            unit: 'tasks',
            items: selected.map((task) => {
              const run = runs.find(
                (candidate) => candidate.task_id === task.id,
              )
              return {
                task,
                project: {
                  id: task.project_id,
                  name: projects.find(
                    (project) => project.id === task.project_id,
                  ).name,
                },
                latest_run: run ?? null,
                state_category: stateOf(task),
                attempts: run ? 1 : 0,
              }
            }),
            total: values.length,
            requested_page: page,
            page: currentPage,
            page_size: pageSize,
            total_pages: totalPages,
            has_more: currentPage < totalPages,
            query,
            sorts,
            scope_project_id: url.searchParams.get('scope_project_id'),
            sort_semantics: 'unicode-natural-v1',
          },
        })
      }
      return route.fulfill({ status: 404, json: { detail: 'Unexpected API' } })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    await page.goto(`${base}#workbench`)
    await page
      .getByRole('heading', {
        name: locale === 'zh' ? '任务' : 'Tasks',
        exact: true,
      })
      .waitFor()
    try {
      await page
        .locator('.wf-desktop-table:visible, .wf-mobile-list:visible')
        .first()
        .waitFor()
    } catch (error) {
      report.errors.push({
        name,
        message: error.message,
        tree: await page
          .locator('main')
          .ariaSnapshot()
          .catch(() => ''),
      })
      throw error
    }
    const queryRequests = () =>
      report.requests.filter(
        (item) => item.name === name && item.path === '/api/tasks/query',
      )
    const bootstrapRequests = () =>
      report.requests.filter(
        (item) => item.name === name && item.path === '/api/bootstrap',
      )
    const visibleRows = () =>
      page
        .locator(
          name === 'mobile'
            ? '.wf-mobile-list .wf-title-button'
            : '.wf-desktop-table .wf-title-button',
        )
        .evaluateAll((elements) =>
          elements.map((element) => element.dataset.taskTrigger),
        )
    async function expectRows(expected) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (JSON.stringify(await visibleRows()) === JSON.stringify(expected))
          return
        await page.waitForTimeout(50)
      }
      assert.deepEqual(await visibleRows(), expected)
    }
    const orderedTasks = (filter = '', sorts = []) =>
      tasks
        .filter((task) => !filter || task.title.toLowerCase().includes(filter))
        .sort((a, b) => compareTaskQueryItems(asItem(a), asItem(b), sorts))
        .map((task) => task.id)
    const initialQueryCount = queryRequests().length
    assert.ok(initialQueryCount >= 1, `${name}: initial server query`)
    await expectRows(orderedTasks().slice(0, 20))
    report.checks.push(`${name}: exact first-page IDs follow server order`)
    const search = page.locator('.wf-querybar-primary').getByRole('searchbox', {
      name: locale === 'zh' ? '搜索' : 'Search',
      exact: true,
    })
    await search.fill('release 4')
    assert.equal(
      queryRequests().length,
      initialQueryCount,
      `${name}: draft does not query server`,
    )
    await expectRows(orderedTasks().slice(0, 20))
    await search.press('Enter')
    await expectRows(orderedTasks('release 4'))
    assert.equal(
      await page.locator('.wf-result-count').innerText(),
      locale === 'zh' ? '7 项任务' : '7 tasks',
    )
    report.checks.push(
      `${name}: draft stays local and Enter applies the complete query`,
    )
    await search.fill('')
    await search.press('Enter')
    await expectRows(orderedTasks().slice(0, 20))
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '下一页' : 'Next page',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks().slice(20, 40))
    assert.ok(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get(
        'page',
      ) === '2',
    )
    await page.reload()
    await expectRows(orderedTasks().slice(20, 40))
    report.checks.push(
      `${name}: page 2 has exact rows, is not resliced, and survives reload`,
    )
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '下一页' : 'Next page',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks().slice(40, 60))
    await page.goBack()
    await expectRows(orderedTasks().slice(20, 40))
    await page.goForward()
    await expectRows(orderedTasks().slice(40, 60))
    report.checks.push(`${name}: Back and Forward restore exact server pages`)
    const sorts = [{ sortKey: 'title', direction: 'descending' }]
    await page.goto(
      `${base}#workbench?view=list&sorts=${encodeURIComponent(JSON.stringify(sorts))}&page=2`,
    )
    await expectRows(orderedTasks('', sorts).slice(20, 40))
    report.checks.push(
      `${name}: descending server sorting is preserved without local resorting`,
    )
    const goodUrl = page.url()
    failStatus = 503
    await search.fill('release 3')
    await search.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.deepEqual(await visibleRows(), [])
    assert.equal(await search.inputValue(), 'release 3')
    assert.equal(
      await page.locator('.wf-result-count').innerText(),
      locale === 'zh' ? '- 项任务' : '- tasks',
    )
    failStatus = 0
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '重试查询' : 'Retry query',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks('release 3', sorts))
    report.checks.push(
      `${name}: a read failure hides old results and explicit retry preserves the query`,
    )
    malformed = true
    await search.fill('release 1')
    await search.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.deepEqual(await visibleRows(), [])
    malformed = false
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '重试查询' : 'Retry query',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks('release 1', sorts))
    report.checks.push(
      `${name}: malformed 2xx is rejected instead of falling back to local data`,
    )
    holdText = 'release 4'
    await search.fill(holdText)
    await search.press('Enter')
    for (let index = 0; index < 100 && !held; index++)
      await page.waitForTimeout(20)
    assert.ok(held)
    assert.deepEqual(await visibleRows(), [])
    await search.fill('release 2')
    await search.press('Enter')
    await expectRows(orderedTasks('release 2', sorts))
    holdText = ''
    release()
    await page.waitForTimeout(100)
    await expectRows(orderedTasks('release 2', sorts))
    report.checks.push(
      `${name}: a delayed old query cannot replace the current results`,
    )
    await page.goto(goodUrl)
    await expectRows(orderedTasks('', sorts).slice(20, 40))
    await search.fill('unsubmitted')
    const viewsLabel = locale === 'zh' ? '视图' : 'Views'
    async function pickSavedView() {
      await page.getByRole('button', { name: viewsLabel, exact: true }).click()
      await page
        .getByRole('menuitem', { name: savedProfile.name, exact: true })
        .or(
          page
            .getByRole('dialog', { name: viewsLabel, exact: true })
            .getByRole('button', { name: savedProfile.name, exact: true }),
        )
        .click()
    }
    await pickSavedView()
    const replace = page.getByRole('dialog', {
      name: locale === 'zh' ? '替换查询草稿？' : 'Replace query draft?',
      exact: true,
    })
    await replace
      .locator('.wb-form-actions')
      .getByRole('button', {
        name: locale === 'zh' ? '继续编辑' : 'Keep editing',
        exact: true,
      })
      .click()
    assert.equal(await search.inputValue(), 'unsubmitted')
    await pickSavedView()
    const beforeSavedQuery = queryRequests().length
    await replace
      .locator('.wb-form-actions')
      .getByRole('button', {
        name: locale === 'zh' ? '加载视图' : 'Load view',
        exact: true,
      })
      .click()
    await expectRows(
      orderedTasks('release 4', [{ sortKey: 'title', direction: 'ascending' }]),
    )
    assert.equal(await search.inputValue(), 'release 4')
    assert.equal(queryRequests().length, beforeSavedQuery + 1)
    assert.equal(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get(
        'pageSize',
      ),
      '50',
    )
    report.checks.push(
      `${name}: SavedView replacement protects drafts and issues one exact snapshot query`,
    )
    const alpha = tasks
      .filter((task) => task.project_id === 'query-alpha')
      .sort((a, b) => compareTaskQueryItems(asItem(a), asItem(b), []))
    await page.goto(`${base}#project/query-alpha?project=query-beta&view=list`)
    await expectRows(alpha.slice(0, 20).map((task) => task.id))
    assert.equal(
      await page.locator('.wf-result-count').innerText(),
      locale === 'zh' ? '23 项任务' : '23 tasks',
    )
    report.checks.push(
      `${name}: fixed project scope wins over a conflicting URL`,
    )
    await page.goto(`${base}#workbench?view=list&page=99`)
    await expectRows(orderedTasks().slice(40, 60))
    assert.equal(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('page'),
      '99',
    )
    report.checks.push(
      `${name}: clamped server pages do not rewrite the requested history entry`,
    )
    capability = false
    const beforeLegacy = queryRequests().length
    await page.reload()
    await expectRows(tasks.slice(40, 60).map((task) => task.id))
    assert.equal(queryRequests().length, beforeLegacy)
    report.checks.push(
      `${name}: an old backend without capability keeps the existing local projection`,
    )
    capability = true
    await page.goto(`${base}#workbench?view=list`)
    await page.reload()
    await expectRows(orderedTasks().slice(0, 20))
    failStatus = 404
    await search.fill('release 1')
    await search.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.deepEqual(await visibleRows(), [])
    report.checks.push(
      `${name}: advertised capability with a missing route is an error, never local fallback`,
    )
    failStatus = 0
    await page
      .getByRole('button', {
        name: locale === 'zh' ? '重试查询' : 'Retry query',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks('release 1'))
    const retainedRows = orderedTasks('release 1')
    if (name === 'desktop') {
      await page.locator('.wf-desktop-table .wf-title-button').first().click()
      await page.locator('.wf-inspector').waitFor()
      assert.equal(
        await page.locator('.wf-inspector h2').innerText(),
        tasks.find((task) => task.id === retainedRows[0]).title,
      )
      runs[0].status = 'running'
      held = false
      holdText = 'release 1'
      const beforeSlowRefresh = queryRequests().length
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      for (let index = 0; index < 100 && !held; index++)
        await page.waitForTimeout(20)
      assert.ok(held, 'desktop: refreshed Bootstrap starts a same-key query')
      await expectRows(retainedRows)
      assert.equal(
        await page.locator('.wf-results').getAttribute('aria-busy'),
        'true',
      )
      assert.equal(
        await page.locator('.wf-inspector h2').innerText(),
        tasks.find((task) => task.id === retainedRows[0]).title,
      )
      const beforeSlowPoll = bootstrapRequests().length
      await page.waitForTimeout(8_000)
      assert.ok(
        bootstrapRequests().length > beforeSlowPoll,
        'A real active-Run Bootstrap poll occurred during the slow query',
      )
      assert.equal(
        queryRequests().length,
        beforeSlowRefresh + 1,
        'Background polling must not abort/restart the in-flight task query',
      )
      await expectRows(retainedRows)
      assert.equal(
        await page.locator('.wf-results').getAttribute('aria-busy'),
        'true',
      )
      holdText = ''
      release()
      for (let index = 0; index < 100; index++) {
        if (
          (await page.locator('.wf-results').getAttribute('aria-busy')) !==
          'true'
        )
          break
        await page.waitForTimeout(20)
      }
      assert.notEqual(
        await page.locator('.wf-results').getAttribute('aria-busy'),
        'true',
      )
      await expectRows(retainedRows)
      report.checks.push(
        'desktop: same-query refresh retains exact rows while marked busy',
      )
      report.checks.push(
        'desktop: an 8-second query survives active-Run polling without being restarted',
      )
      assert.equal(
        await page.locator('.wf-inspector h2').innerText(),
        tasks.find((task) => task.id === retainedRows[0]).title,
      )
      await page
        .getByRole('button', { name: 'Close task details', exact: true })
        .click()
      assert.equal(await page.locator('.wf-inspector').count(), 0)
      report.checks.push(
        'desktop: selected Inspector survives a same-query refresh',
      )
    }
    await search.fill('')
    await search.press('Enter')
    await expectRows(orderedTasks().slice(0, 20))
    assert.equal(
      await page.locator('.wf-result-count').innerText(),
      locale === 'zh' ? '45 项任务' : '45 tasks',
    )
    assert.equal(await page.locator('.wf-page-size').count(), 1)
    assert.equal(report.writes.length, 0)
    report.checks.push(
      `${name}: server query, draft isolation, committed search and pagination`,
    )
    await page.screenshot({
      path: resolve(out, `${name}.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}.png`)
    failStatus = 403
    await search.fill('release 2')
    await search.press('Enter')
    const forbidden = page.getByRole('alert')
    await forbidden.waitFor()
    assert.ok(
      (await forbidden.innerText()).includes(
        locale === 'zh'
          ? '没有读取任务列表的权限。'
          : 'Task list access is forbidden.',
      ),
    )
    assert.deepEqual(await visibleRows(), [])
    assert.equal(await search.inputValue(), 'release 2')
    const forbiddenCount = queryRequests().length
    const beforeForbiddenPoll = bootstrapRequests().length
    await page.waitForTimeout(name === 'desktop' ? 6_500 : 150)
    if (name === 'desktop')
      assert.ok(
        bootstrapRequests().length > beforeForbiddenPoll,
        'An active-Run Bootstrap poll must actually occur while forbidden',
      )
    assert.equal(
      queryRequests().length,
      forbiddenCount,
      '403 must not auto-retry',
    )
    await page.screenshot({
      path: resolve(out, `${name}-forbidden.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-forbidden.png`)
    failStatus = 0
    await forbidden
      .getByRole('button', {
        name: locale === 'zh' ? '重试查询' : 'Retry query',
        exact: true,
      })
      .click()
    await expectRows(orderedTasks('release 2'))
    assert.equal(
      queryRequests().length,
      forbiddenCount + 1,
      'Explicit retry starts exactly one GET after a forbidden response',
    )
    report.checks.push(
      `${name}: 403 hides results, keeps the query and requires explicit retry`,
    )
    failStatus = 401
    nonJsonFailure = true
    await search.fill('release 3')
    await search.press('Enter')
    await page
      .getByRole('heading', {
        name: locale === 'zh' ? '登录工作空间' : 'Sign in to workspace',
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-title-button').count(), 0)
    assert.equal(await page.locator('.wf-inspector').count(), 0)
    assert.equal(await page.locator('.wf-querybar-primary').count(), 0)
    assert.equal(
      await page
        .getByRole('button', {
          name: locale === 'zh' ? '重试查询' : 'Retry query',
          exact: true,
        })
        .count(),
      0,
    )
    const signedOutCount = queryRequests().length
    await page.waitForTimeout(150)
    assert.equal(
      queryRequests().length,
      signedOutCount,
      '401 must not auto-retry',
    )
    await page.screenshot({
      path: resolve(out, `${name}-signed-out.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-signed-out.png`)
    report.checks.push(
      `${name}: non-JSON 401 clears private list/Inspector state before showing sign-in`,
    )
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
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
