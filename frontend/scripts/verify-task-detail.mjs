import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_SYNTHETIC,
  '1',
  'Explicit synthetic browser opt-in is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_DETAIL_EVIDENCE_DIR ?? '/tmp/mybot-task-detail',
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const project = {
  id: 'detail-project',
  name: 'Detail research',
  goal: '',
  directory: '.',
  notes: '',
}
const tasks = ['Alpha', 'Beta', 'Empty'].map((name, index) => ({
  id: `detail-task-${name.toLowerCase()}`,
  project_id: project.id,
  title: `Task ${name}`,
  goal: `Bootstrap goal ${name}`,
  acceptance: 'Synthetic acceptance',
  files: ['README.md'],
  created_at: `2026-11-17T00:0${index}:00Z`,
}))
const historyFor = (task, count, status) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${task.id}-run-${String(count - index).padStart(3, '0')}`,
    task_id: task.id,
    status: index ? 'failed' : status,
    created_at: new Date(
      Date.UTC(2026, 10, 17, 1, count - index),
    ).toISOString(),
  }))
const histories = new Map([
  [tasks[0].id, historyFor(tasks[0], 45, 'succeeded')],
  [tasks[1].id, historyFor(tasks[1], 2, 'canceled')],
  [tasks[2].id, []],
])
const legacyRun = {
  id: 'bootstrap-only-legacy-run',
  task_id: tasks[0].id,
  status: 'failed',
  created_at: '2026-11-16T00:00:00Z',
}
const bootstrap = {
  projects: [project],
  tasks,
  runs: [legacyRun],
  models: [],
  backends: [],
  workspace: '/synthetic/task-detail',
  default_model_id: '',
  local_harnesses: [],
  capabilities: {
    backend_sync: false,
    task_query: false,
    task_detail: true,
  },
}
const report = {
  synthetic: true,
  source: 'Production frontend with all APIs locally intercepted',
  checks: [],
  requests: [],
  writes: [],
  errors: [],
  screenshots: [],
}
await mkdir(out, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const contexts = [
  ['desktop', { width: 1440, height: 1000 }, 'en', 'light'],
  ['mobile', { width: 390, height: 844 }, 'zh', 'dark'],
]
let pageForFailure

function stateOf(runs) {
  if (!runs.length) return 'pending'
  if (runs[0].status === 'succeeded') return 'completed'
  if (['failed', 'paused', 'interrupted'].includes(runs[0].status))
    return 'attention'
  if (
    ['queued', 'running', 'pause_requested', 'cancel_requested'].includes(
      runs[0].status,
    )
  )
    return 'active'
  return 'other'
}

function detailResponse(taskId, requestedPage, pageSize, pollActive) {
  const task = tasks.find((candidate) => candidate.id === taskId)
  assert.ok(task)
  const runs = histories
    .get(taskId)
    .map((run, index) =>
      pollActive && taskId === tasks[0].id && index === 0
        ? { ...run, status: 'running' }
        : run,
    )
  const totalPages = Math.max(1, Math.ceil(runs.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'task_detail',
    item: {
      task: {
        ...task,
        goal: task.goal.replace('Bootstrap', 'Fetched'),
      },
      project: { id: project.id, name: project.name },
      latest_run: runs[0] ?? null,
      state_category: stateOf(runs),
      attempts: runs.length,
    },
    history: {
      unit: 'runs',
      items: runs.slice((page - 1) * pageSize, page * pageSize),
      total: runs.length,
      requested_page: requestedPage,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      has_more: page < totalPages,
      order: 'created-desc-source-v1',
    },
  }
}

try {
  for (const [name, viewport, locale, mode] of contexts) {
    let enabled = true
    let authenticated = true
    let failStatus = 0
    let malformed = false
    let pollActive = false
    let holdTask = ''
    let held = false
    let release
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      ({ locale, mode }) => {
        localStorage.setItem('mybot.locale', locale)
        localStorage.setItem('mybot.mode', mode)
        localStorage.setItem('mybot.style', 'neutral')
        localStorage.setItem('mybot.work-view', 'list')
      },
      { locale, mode },
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
        return route.fulfill({
          status: 200,
          json: { authenticated, required: !authenticated },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          status: 200,
          json: {
            ...bootstrap,
            runs: pollActive
              ? [{ ...histories.get(tasks[0].id)[0], status: 'running' }]
              : bootstrap.runs,
            capabilities: { ...bootstrap.capabilities, task_detail: enabled },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          status: 200,
          json: { items: [], total: 0, offset: 0, limit: 20, has_more: false },
        })
      const detail = /^\/api\/tasks\/([^/]+)\/detail$/.exec(url.pathname)
      if (detail) {
        const taskId = decodeURIComponent(detail[1])
        const requestedPage = Number(url.searchParams.get('page'))
        const pageSize = Number(url.searchParams.get('page_size'))
        if (taskId === holdTask) {
          held = true
          await new Promise((done) => {
            release = done
          })
        }
        if (failStatus === 401) {
          authenticated = false
          return route.fulfill({
            status: 401,
            contentType: 'text/html',
            body: '<html><body>Authentication required</body></html>',
          })
        }
        if (failStatus)
          return route.fulfill({
            status: failStatus,
            json: { detail: { code: 'task_detail_unavailable' } },
          })
        if (malformed)
          return route.fulfill({
            status: 200,
            json: { schema_version: 1, unit: 'task_detail', history: [] },
          })
        return route.fulfill({
          status: 200,
          json: detailResponse(taskId, requestedPage, pageSize, pollActive),
        })
      }
      return route.fulfill({
        status: 404,
        json: { detail: 'Unexpected intercepted API path' },
      })
    })
    const page = await context.newPage()
    pageForFailure = page
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const details = () =>
      report.requests.filter(
        (request) =>
          request.name === name &&
          /^\/api\/tasks\/[^/]+\/detail$/.test(request.path),
      )
    const bootstrapReads = () =>
      report.requests.filter(
        (request) => request.name === name && request.path === '/api/bootstrap',
      )
    const inspector = () => page.locator('.wf-task-inspector')
    const visibleTask = (task) =>
      page.locator(
        `${name === 'desktop' ? '.wf-desktop-table' : '.wf-mobile-list'} .wf-title-button[data-task-trigger="${task.id}"]`,
      )
    async function open(task) {
      await visibleTask(task).click()
      await inspector().waitFor()
    }
    async function close() {
      if (name === 'desktop')
        await inspector()
          .getByRole('button', { name: 'Close task details', exact: true })
          .click()
      else
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
      await inspector().waitFor({ state: 'hidden' })
    }
    async function expectHistory(ids) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const actual = await inspector()
          .locator('.wf-history-row')
          .evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute('href')?.replace('#run/', ''),
            ),
          )
        if (JSON.stringify(actual) === JSON.stringify(ids)) return
        await page.waitForTimeout(50)
      }
      assert.deepEqual(
        await inspector()
          .locator('.wf-history-row')
          .evaluateAll((elements) =>
            elements.map((element) =>
              element.getAttribute('href')?.replace('#run/', ''),
            ),
          ),
        ids,
      )
    }
    async function nextHistory() {
      const button = inspector().getByRole('button', {
        name: locale === 'zh' ? '下一页历史' : 'Next history page',
        exact: true,
      })
      if (name === 'desktop') {
        await button.focus()
        await button.press('Enter')
      } else await button.click()
    }
    async function previousHistory() {
      const button = inspector().getByRole('button', {
        name: locale === 'zh' ? '上一页历史' : 'Previous history page',
        exact: true,
      })
      if (name === 'desktop') {
        await button.focus()
        await button.press('Enter')
      } else await button.click()
    }
    async function expectPageFocus(direction) {
      await page.waitForFunction(
        (value) =>
          document.activeElement?.getAttribute('data-history-page') === value,
        direction,
      )
    }
    async function expectElementFocus(locator) {
      for (let index = 0; index < 100; index++) {
        if (
          await locator.evaluate(
            (element) => document.activeElement === element,
          )
        )
          return
        await page.waitForTimeout(20)
      }
      assert.equal(
        await locator.evaluate((element) => document.activeElement === element),
        true,
      )
    }
    async function retry() {
      await inspector()
        .getByRole('button', {
          name: locale === 'zh' ? '重试读取详情' : 'Retry task details',
          exact: true,
        })
        .click()
    }
    function record(label) {
      report.checks.push(`${name}: ${label}`)
      console.log(`PASS ${name}: ${label}`)
    }
    async function screenshot(label) {
      const filename = `${name}-${label}.png`
      await page.screenshot({ path: resolve(out, filename), fullPage: true })
      report.screenshots.push(filename)
    }

    await page.goto(`${base}#workbench?view=list`)
    await visibleTask(tasks[0]).waitFor()
    assert.equal(details().length, 0)
    assert.equal(await inspector().count(), 0)
    record('no task detail request before selecting a task')

    await open(tasks[0])
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(0, 20)
        .map((run) => run.id),
    )
    await inspector().getByText('Fetched goal Alpha', { exact: true }).waitFor()
    assert.equal(
      await inspector()
        .getByText('Bootstrap goal Alpha', { exact: true })
        .count(),
      0,
    )
    assert.equal(
      await inspector()
        .locator('a[href="#run/bootstrap-only-legacy-run"]')
        .count(),
      0,
    )
    assert.match(
      await inspector()
        .locator('h3')
        .filter({ hasText: locale === 'zh' ? '历史运行' : 'Run history' })
        .innerText(),
      /45/,
    )
    assert.equal(new URLSearchParams(details().at(-1).search).get('page'), '1')
    assert.equal(
      new URLSearchParams(details().at(-1).search).get('page_size'),
      '20',
    )
    record(
      'selected task uses exact bounded server history and authoritative detail, not Bootstrap',
    )
    await screenshot('page-1')

    if (name === 'desktop') {
      const beforeRefresh = details().length
      const beforeBootstrap = bootstrapReads().length
      holdTask = tasks[0].id
      held = false
      pollActive = true
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      for (let index = 0; index < 100 && !held; index++)
        await page.waitForTimeout(20)
      assert.ok(held)
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(0, 20)
          .map((run) => run.id),
      )
      await inspector()
        .getByText('Fetched goal Alpha', { exact: true })
        .waitFor()
      assert.equal(await inspector().getAttribute('aria-busy'), 'true')
      await page.waitForTimeout(8000)
      assert.ok(bootstrapReads().length >= beforeBootstrap + 2)
      assert.equal(details().length, beforeRefresh + 1)
      assert.equal(await inspector().getAttribute('aria-busy'), 'true')
      holdTask = ''
      release()
      await inspector()
        .getByText('Fetched goal Alpha', { exact: true })
        .waitFor()
      for (let index = 0; index < 100; index++) {
        if ((await inspector().getAttribute('aria-busy')) !== 'true') break
        await page.waitForTimeout(20)
      }
      assert.notEqual(await inspector().getAttribute('aria-busy'), 'true')
      assert.equal(details().length, beforeRefresh + 1)
      record(
        'same-query refresh retains detail and exact history while explicitly busy',
      )
      record(
        'an eight-second detail read spans a real active-Run Bootstrap poll without interruption or replay',
      )
      pollActive = false
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      for (let index = 0; index < 100; index++) {
        if (
          details().length === beforeRefresh + 2 &&
          (await inspector().getAttribute('aria-busy')) !== 'true'
        )
          break
        await page.waitForTimeout(20)
      }
      assert.equal(details().length, beforeRefresh + 2)
      assert.notEqual(await inspector().getAttribute('aria-busy'), 'true')
    }

    await nextHistory()
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(20, 40)
        .map((run) => run.id),
    )
    assert.equal(new URLSearchParams(details().at(-1).search).get('page'), '2')
    record('history page 2 has exact server IDs without reslicing')
    if (name === 'desktop') {
      await expectPageFocus('next')
      record(
        'keyboard Next preserves focus on the enabled Next control after page 2 loads',
      )
    }
    await nextHistory()
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(40, 60)
        .map((run) => run.id),
    )
    if (name === 'desktop') {
      await expectPageFocus('previous')
      record(
        'keyboard Next on the last page restores focus to the enabled Previous control',
      )
    }
    await previousHistory()
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(20, 40)
        .map((run) => run.id),
    )
    record(
      'last and previous history pages preserve the task denominator and exact rows',
    )
    const historyNavigation = inspector().getByRole('navigation', {
      name: locale === 'zh' ? '运行历史分页' : 'Run history pagination',
      exact: true,
    })
    assert.equal(await historyNavigation.locator('output').innerText(), '2 / 3')
    await historyNavigation.scrollIntoViewIfNeeded()
    const historyNavigationBox = await historyNavigation.boundingBox()
    assert.ok(historyNavigationBox)
    assert.ok(historyNavigationBox.y >= 0)
    assert.ok(
      historyNavigationBox.y + historyNavigationBox.height <=
        viewport.height + 1,
    )
    record(
      'history pagination is reachable inside the Inspector and reports page 2 of 3',
    )
    await screenshot('page-2')
    if (name === 'desktop') {
      await visibleTask(tasks[1]).click()
      await expectHistory(histories.get(tasks[1].id).map((run) => run.id))
      await visibleTask(tasks[0]).click()
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(0, 20)
          .map((run) => run.id),
      )
      assert.equal(
        new URLSearchParams(details().at(-1).search).get('page'),
        '1',
      )
      record(
        'switching Alpha page 2 to Beta and back resets Alpha history to exact page 1',
      )
      holdTask = tasks[0].id
      held = false
      await nextHistory()
      for (let index = 0; index < 100 && !held; index++)
        await page.waitForTimeout(20)
      assert.ok(held)
      const search = page
        .locator('.wf-querybar-primary')
        .getByRole('searchbox', { name: 'Search', exact: true })
      await search.focus()
      holdTask = ''
      release()
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(20, 40)
          .map((run) => run.id),
      )
      assert.equal(
        await search.evaluate((element) => document.activeElement === element),
        true,
      )
      record(
        'a completed history read does not steal focus moved to the query input while loading',
      )
      failStatus = 403
      await nextHistory()
      await inspector().getByRole('alert').waitFor()
      await expectElementFocus(
        inspector().getByRole('button', {
          name: 'Retry task details',
          exact: true,
        }),
      )
      await screenshot('page-error')
      failStatus = 0
      await retry()
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(40, 60)
          .map((run) => run.id),
      )
      await expectPageFocus('previous')
      record(
        'a failed keyboard page read focuses Retry and its successful retry restores an enabled page control',
      )
      failStatus = 403
      holdTask = tasks[0].id
      held = false
      await previousHistory()
      for (let index = 0; index < 100 && !held; index++)
        await page.waitForTimeout(20)
      assert.ok(held)
      await search.focus()
      holdTask = ''
      release()
      await inspector().getByRole('alert').waitFor()
      await expectElementFocus(search)
      record(
        'a failed history read does not steal focus moved to the query input while loading',
      )
      failStatus = 0
      await retry()
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(20, 40)
          .map((run) => run.id),
      )
    }
    await close()
    assert.equal(
      await visibleTask(tasks[0]).evaluate(
        (element) => document.activeElement === element,
      ),
      true,
    )
    record('closing details restores focus to the selected visible task')
    await open(tasks[0])
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(0, 20)
        .map((run) => run.id),
    )
    assert.equal(new URLSearchParams(details().at(-1).search).get('page'), '1')
    record('reopening starts the selected task history at page 1')
    await close()

    if (name === 'desktop') {
      held = false
      holdTask = tasks[0].id
      await open(tasks[0])
      for (let index = 0; index < 100 && !held; index++)
        await page.waitForTimeout(20)
      assert.ok(held)
      assert.equal(await inspector().locator('.wf-history-row').count(), 0)
      await visibleTask(tasks[1]).click()
      await expectHistory(histories.get(tasks[1].id).map((run) => run.id))
      await inspector()
        .getByText('Fetched goal Beta', { exact: true })
        .waitFor()
      holdTask = ''
      release()
      await page.waitForTimeout(100)
      await expectHistory(histories.get(tasks[1].id).map((run) => run.id))
      assert.equal(
        await inspector()
          .getByText('Fetched goal Alpha', { exact: true })
          .count(),
        0,
      )
      record(
        'a canceled late Alpha response cannot replace the selected Beta detail',
      )
      await close()
    }

    held = false
    holdTask = tasks[0].id
    await open(tasks[0])
    for (let index = 0; index < 100 && !held; index++)
      await page.waitForTimeout(20)
    assert.ok(held)
    await close()
    holdTask = ''
    release()
    await page.waitForTimeout(100)
    assert.equal(await inspector().count(), 0)
    await open(tasks[1])
    await expectHistory(histories.get(tasks[1].id).map((run) => run.id))
    record('closing an in-flight read cannot reopen or refill private detail')
    await close()

    await open(tasks[2])
    await inspector().getByText('Fetched goal Empty', { exact: true }).waitFor()
    await inspector()
      .getByText(locale === 'zh' ? '尚未发起运行' : 'No runs yet', {
        exact: true,
      })
      .waitFor()
    await expectHistory([])
    record('a real zero-history task renders an explicit empty history')
    await close()

    for (const failure of [403, 404, 'malformed']) {
      if (failure === 403 && name === 'desktop') {
        pollActive = true
        const beforeBootstrap = bootstrapReads().length
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        for (let index = 0; index < 100; index++) {
          if (bootstrapReads().length > beforeBootstrap) break
          await page.waitForTimeout(20)
        }
        assert.ok(bootstrapReads().length > beforeBootstrap)
      }
      failStatus = typeof failure === 'number' ? failure : 0
      malformed = failure === 'malformed'
      const before = details().length
      await open(tasks[0])
      await inspector().getByRole('alert').waitFor()
      await expectHistory([])
      assert.equal(
        await inspector()
          .getByText('Bootstrap goal Alpha', { exact: true })
          .count(),
        0,
      )
      assert.equal(
        await inspector()
          .getByText('Fetched goal Alpha', { exact: true })
          .count(),
        0,
      )
      assert.equal(details().length, before + 1)
      if (failure === 403 && name === 'desktop') {
        const beforePoll = bootstrapReads().length
        await page.waitForTimeout(6500)
        assert.ok(bootstrapReads().length > beforePoll)
      } else await page.waitForTimeout(150)
      assert.equal(details().length, before + 1)
      failStatus = 0
      malformed = false
      await retry()
      await expectHistory(
        histories
          .get(tasks[0].id)
          .slice(0, 20)
          .map((run) => run.id),
      )
      assert.equal(details().length, before + 2)
      record(
        `${failure} is explicit failure without local fallback; one manual retry makes one GET`,
      )
      await close()
      if (failure === 403 && name === 'desktop') {
        const beforeBootstrap = bootstrapReads().length
        pollActive = false
        await page.getByRole('button', { name: 'Refresh', exact: true }).click()
        for (let index = 0; index < 100; index++) {
          if (bootstrapReads().length > beforeBootstrap) break
          await page.waitForTimeout(20)
        }
        assert.ok(bootstrapReads().length > beforeBootstrap)
        record(
          '403 remains locked through a real background poll until explicit GET retry',
        )
      }
    }

    enabled = false
    const beforeLegacy = details().length
    await page.reload()
    await visibleTask(tasks[0]).waitFor()
    await open(tasks[0])
    await expectHistory([legacyRun.id])
    await inspector()
      .getByText('Bootstrap goal Alpha', { exact: true })
      .waitFor()
    assert.equal(details().length, beforeLegacy)
    record(
      'an old backend without the detail capability retains legacy history and makes no new request',
    )
    await close()

    enabled = true
    await page.goto(`${base}#project/${project.id}?view=list`)
    await page.reload()
    await visibleTask(tasks[0]).waitFor()
    await open(tasks[0])
    await expectHistory(
      histories
        .get(tasks[0].id)
        .slice(0, 20)
        .map((run) => run.id),
    )
    assert.equal(
      new URLSearchParams(details().at(-1).search).get('scope_project_id'),
      project.id,
    )
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    record(
      'fixed-project detail requests bind the route scope without document overflow',
    )
    await screenshot('fixed-project')
    await close()

    failStatus = 401
    await visibleTask(tasks[0]).click()
    await page
      .getByRole('heading', {
        name: locale === 'zh' ? '登录工作空间' : 'Sign in to workspace',
        exact: true,
      })
      .waitFor()
    assert.equal(await inspector().count(), 0)
    assert.equal(await page.locator('.wf-title-button').count(), 0)
    const afterUnauthorized = details().length
    await page.waitForTimeout(150)
    assert.equal(details().length, afterUnauthorized)
    record(
      'HTML 401 clears private task/detail content before showing sign-in and never auto-retries',
    )
    await screenshot('signed-out')
    await context.close()
    pageForFailure = undefined
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  if (pageForFailure && !pageForFailure.isClosed()) {
    await pageForFailure
      .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
      .catch(() => {})
    report.failure.tree = await pageForFailure
      .locator('main')
      .ariaSnapshot()
      .catch(() => '')
    report.failure.focus = await pageForFailure.evaluate(() => {
      const element = document.activeElement
      return element
        ? {
            tag: element.tagName,
            id: element.id,
            role: element.getAttribute('role'),
            disabled: 'disabled' in element ? element.disabled : undefined,
            ariaDisabled: element.getAttribute('aria-disabled'),
            historyPage: element.getAttribute('data-history-page'),
            text: element.textContent?.slice(0, 200),
          }
        : null
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
console.log(
  JSON.stringify({
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    errors: report.errors.length,
    writes: report.writes.length,
    report: resolve(out, 'verification.json'),
  }),
)
