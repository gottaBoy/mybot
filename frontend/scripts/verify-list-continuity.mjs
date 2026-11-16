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
  process.env.WORKBENCH_EVIDENCE_DIR ?? '/tmp/mybot-list-continuity',
)
const playwright = resolve(
  process.env.PLAYWRIGHT_MODULE ??
    '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)
const executable = process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome'
assert.ok(existsSync(playwright), 'Use an existing Playwright installation')
assert.ok(existsSync(executable), 'Use an existing Chrome executable')
const { chromium } = await import(pathToFileURL(playwright).href)
const evidence = {
  date: '2026-11-15',
  base,
  synthetic: true,
  scope:
    'Task/Run list continuity with intercepted API projections. No provider or business writes.',
  checks: [],
  failures: [],
  errors: [],
  requests: [],
  writes: [],
  unexpectedApi: [],
  blockedExternal: [],
  screenshots: [],
  observations: [],
  limitations: [
    'Memory-only continuity: reload does not promise selection, focus or scroll durability.',
    'Chrome desktop and 390px responsive projection, not Safari or physical-device certification.',
    '401 verifies private DOM cleanup; no fake reauthentication or tools-page remount is used.',
    'Offsets may clamp when responsive geometry removes an axis or shortens its scroll range.',
  ],
}
await mkdir(out, { recursive: true })
let browser
let activePage
let activeCheck = 'launch'
let activeScenario

function labels(locale) {
  return locale === 'zh'
    ? {
        project: '连续性项目',
        title: (number) => `连续性任务 ${String(number).padStart(2, '0')}`,
        columns: '列设置',
        created: '创建时间',
        latest: '打开最近运行',
        refresh: '刷新',
        next: '下一页',
        dark: '切换深色',
        light: '切换浅色',
        signIn: '登录工作空间',
        synced: '已同步',
      }
    : {
        project: 'Continuity project',
        title: (number) => `Continuity task ${String(number).padStart(2, '0')}`,
        columns: 'Columns',
        created: 'Created',
        latest: 'Open latest run',
        refresh: 'Refresh',
        next: 'Next page',
        dark: 'Dark mode',
        light: 'Light mode',
        signIn: 'Sign in to workspace',
        synced: 'Synced',
      }
}
function projection(locale) {
  const copy = labels(locale)
  const projects = [
    {
      id: 'continuity-project',
      name: copy.project,
      goal: 'Synthetic continuity scope',
      directory: '.',
      notes: 'Fixture only',
    },
    {
      id: 'other-project',
      name: 'Other project',
      goal: 'Other scope',
      directory: '.',
      notes: '',
    },
  ]
  const tasks = Array.from({ length: 60 }, (_, index) => ({
    id: `continuity-task-${String(index + 1).padStart(2, '0')}`,
    project_id: projects[0].id,
    title: copy.title(index + 1),
    goal: 'Read-only synthetic continuity task; no provider execution.',
    acceptance:
      'Keep selection, scroll and focus bound to the managed list entry.',
    files: [],
    created_at: new Date(Date.UTC(2026, 10, 15, 0, index)).toISOString(),
  }))
  const runs = tasks.map((task) => ({
    id: `run-${task.id}`,
    task_id: task.id,
    status: 'succeeded',
    created_at: '2026-11-15T02:00:00Z',
  }))
  const sourceTasks = new Map(
    tasks.map((task) => [task.id, structuredClone(task)]),
  )
  const sourceRuns = new Map(runs.map((run) => [run.id, structuredClone(run)]))
  // An unrelated active record causes real read-only workspace polling.
  const otherTask = {
    ...tasks[0],
    id: 'other-task',
    project_id: projects[1].id,
    title: 'Other active task',
  }
  const data = {
    projects,
    tasks: [...tasks, otherTask],
    runs: [
      ...runs,
      {
        id: 'other-active-run',
        task_id: otherTask.id,
        status: 'running',
        created_at: '2026-11-15T03:00:00Z',
      },
    ],
    models: [],
    backends: [],
    workspace: `/synthetic/list-continuity/${locale}`,
    default_model_id: '',
    local_harnesses: [],
    capabilities: { backend_sync: false },
  }
  return {
    data,
    detail(id) {
      const run = sourceRuns.get(id)
      const task = run && sourceTasks.get(run.task_id)
      if (!run || !task) return undefined
      return {
        run: {
          ...run,
          config: { max_calls: 3 },
          context: {
            evidence: [],
            text: 'Fixture context',
            hash: 'a'.repeat(64),
          },
        },
        task,
        project: projects[0],
        agents: [],
        calls: [],
        artifacts: [],
        events: [],
        retry_runs: [],
        harness: { stages: [], parallel_limit: 1 },
      }
    },
  }
}
async function poll(read, expected, name) {
  for (let index = 0; index < 120; index++) {
    if (JSON.stringify(await read()) === JSON.stringify(expected)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  assert.deepEqual(await read(), expected, name)
}
async function check(name, run) {
  activeCheck = name
  await run()
  evidence.checks.push({ scenario: activeScenario, name, passed: true })
  console.log(`PASS ${name}`)
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  evidence.screenshots.push(`${name}.png`)
}
async function fixture(name, locale, run) {
  activeScenario = name
  const copy = labels(locale)
  const source = projection(locale)
  let unauthorized = false
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  })
  await context.addInitScript(
    ({ appOrigin, locale }) => {
      if (location.origin !== appOrigin) return
      localStorage.setItem('mybot.locale', locale)
      localStorage.setItem('mybot.style', 'neutral')
      localStorage.setItem('mybot.mode', 'light')
      localStorage.setItem('mybot.density', 'comfortable')
    },
    { appOrigin: origin, locale },
  )
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
        json: { detail: 'Continuity fixture forbids writes' },
      })
    }
    if (url.pathname === '/api/auth/state')
      return route.fulfill({
        status: 200,
        json: { authenticated: true, required: false },
      })
    if (url.pathname === '/api/bootstrap')
      return route.fulfill(
        unauthorized
          ? {
              status: 401,
              json: { detail: 'Synthetic authentication expired' },
            }
          : { status: 200, json: source.data },
      )
    if (url.pathname.startsWith('/api/runs/')) {
      const detail = source.detail(
        decodeURIComponent(url.pathname.slice('/api/runs/'.length)),
      )
      if (detail) return route.fulfill({ status: 200, json: detail })
    }
    evidence.unexpectedApi.push(item)
    return route.fulfill({
      status: 404,
      json: { detail: 'Not an allowed continuity projection' },
    })
  })
  const page = (activePage = await context.newPage())
  page.on('pageerror', (error) =>
    evidence.errors.push({
      scenario: name,
      message: error.message,
      stack: error.stack,
      url: page.url(),
    }),
  )
  try {
    await page.goto(
      `${base}#project/continuity-project?view=list&pageSize=50&page=1`,
    )
    await page
      .getByRole('heading', { name: copy.project, exact: true })
      .waitFor()
    await page.locator('.wf-list-body').waitFor()
    await run({
      page,
      copy,
      source,
      expire: () => {
        unauthorized = true
      },
    })
  } catch (error) {
    evidence.observations.push({
      scenario: name,
      failureScrollTargets: await page
        .locator('.wf-list-body')
        .evaluateAll((bodies) =>
          bodies.flatMap((body) =>
            [body, ...body.querySelectorAll('*')]
              .filter(
                (element) =>
                  element instanceof HTMLElement &&
                  (element.scrollTop ||
                    element.scrollLeft ||
                    element.scrollWidth > element.clientWidth + 1),
              )
              .map((element) => ({
                tag: element.tagName,
                top: element.scrollTop,
                left: element.scrollLeft,
                width: element.clientWidth,
                scrollWidth: element.scrollWidth,
                overflowX: getComputedStyle(element).overflowX,
              })),
          ),
        ),
    })
    try {
      await shot(page, `${name}-failure`)
    } catch {}
    throw error
  } finally {
    await context.close()
  }
}
function scrollGeometry(page, offsets) {
  return page.locator('.wf-list-body').evaluate((vertical, offsets) => {
    const horizontal =
      [vertical, ...vertical.querySelectorAll('*')].find(
        (element) =>
          element instanceof HTMLElement &&
          element.clientWidth > 0 &&
          element.scrollWidth > element.clientWidth + 1 &&
          /auto|scroll/.test(getComputedStyle(element).overflowX),
      ) ?? vertical
    if (offsets) {
      vertical.scrollTop = offsets.top
      horizontal.scrollLeft = offsets.left
    }
    return {
      top: vertical.scrollTop,
      left: horizontal.scrollLeft,
      topLimit: vertical.scrollHeight - vertical.clientHeight,
      leftLimit: horizontal.scrollWidth - horizontal.clientWidth,
    }
  }, offsets)
}
async function selected(page) {
  return page
    .locator('[data-task-trigger][aria-expanded="true"]')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => element.dataset.taskTrigger)),
    ])
}
async function assertSelected(page, id) {
  await poll(
    () => selected(page),
    id ? [id] : [],
    'Only the saved task ID is selected',
  )
}
async function refreshProjection(page, copy) {
  const before = evidence.requests.filter(
    (request) =>
      request.scenario === activeScenario && request.path === '/api/bootstrap',
  ).length
  await page
    .locator('.wb-topbar')
    .getByRole('button', { name: copy.refresh, exact: true })
    .click()
  await poll(
    async () =>
      evidence.requests.filter(
        (request) =>
          request.scenario === activeScenario &&
          request.path === '/api/bootstrap',
      ).length > before,
    true,
    'The explicit refresh reads a new projection',
  )
  await poll(
    () => page.locator('.wb-sync').innerText(),
    copy.synced,
    'The refreshed projection is applied',
  )
}
async function showCreated(page, copy) {
  await page.getByRole('button', { name: copy.columns, exact: true }).click()
  const checkbox = page.getByRole('menuitemcheckbox', {
    name: copy.created,
    exact: true,
  })
  await checkbox.waitFor()
  if ((await checkbox.getAttribute('aria-checked')) !== 'true')
    await checkbox.click()
  for (
    let index = 0;
    index < 3 && (await page.getByRole('menu').count());
    index++
  )
    await page.keyboard.press('Escape')
}
async function chooseTask(page, copy, number) {
  const title = copy.title(number)
  const trigger = page.getByRole('button', { name: title, exact: true })
  await trigger.click()
  await page
    .locator('.wf-task-inspector')
    .getByRole('heading', { name: title, exact: true })
    .waitFor()
  const id = `continuity-task-${String(number).padStart(2, '0')}`
  await assertSelected(page, id)
  return id
}
async function enterRun(page, copy, number, offsets) {
  const id = await chooseTask(page, copy, number)
  const position = await scrollGeometry(page, offsets)
  const link = page
    .locator('.wf-task-inspector')
    .getByRole('link', { name: copy.latest, exact: true })
  await link.focus()
  const focusKey = await link.getAttribute('data-list-focus-key')
  assert.ok(focusKey, 'The Run link needs a stable project-owned focus key')
  const href = page.url()
  const stamp = await page.evaluate(
    () => history.state?.__mybotNavigation ?? null,
  )
  assert.ok(stamp?.session && stamp?.key)
  await link.click()
  await page
    .getByRole('heading', { name: copy.title(number), exact: true, level: 1 })
    .waitFor()
  return { id, position, focusKey, href, stamp }
}
async function backToSaved(page, copy, saved, mobile = false) {
  await page.goBack()
  await page.getByRole('heading', { name: copy.project, exact: true }).waitFor()
  await assertSelected(page, saved.id)
  await poll(
    async () => {
      const current = await scrollGeometry(page)
      return {
        top: Math.round(current.top),
        left: Math.round(current.left),
      }
    },
    {
      top: Math.round(saved.position.top),
      left: mobile ? 0 : Math.round(saved.position.left),
    },
    'Scroll coordinates restore after list and inspector render',
  )
  await poll(
    () =>
      page.evaluate(() =>
        document.activeElement?.getAttribute('data-list-focus-key'),
      ),
    saved.focusKey,
    'Run-link focus restores instead of inspector heading focus',
  )
  assert.equal(page.url(), saved.href)
  const current = await page.evaluate(
    () => history.state?.__mybotNavigation ?? null,
  )
  assert.equal(current.session, saved.stamp.session)
  assert.equal(current.key, saved.stamp.key)
  const payload = await page.evaluate(() => ({
    history: JSON.stringify(history.state),
    preferences: JSON.stringify({ ...localStorage }),
  }))
  assert.ok(
    !payload.history.includes(saved.id),
    'Selected task IDs must not enter history state',
  )
  assert.ok(
    !payload.preferences.includes(saved.id),
    'Continuity must not enter preference storage',
  )
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: executable,
  })
  evidence.browser = { executable, version: browser.version() }
  await fixture('desktop-entries', 'en', async ({ page, copy }) => {
    let first
    await check(
      'Desktop native Back restores the selected task, both scroll axes and the original Run-link focus',
      async () => {
        await showCreated(page, copy)
        first = await enterRun(page, copy, 18, { top: 620, left: 80 })
        assert.ok(
          first.position.top > 0 && first.position.left > 0,
          'Both scroll axes are genuinely exercised',
        )
        await backToSaved(page, copy, first)
        await shot(page, 'desktop-restored')
        evidence.observations.push({ scenario: activeScenario, saved: first })
      },
    )
    await check(
      'Forward and Back save the current snapshot rather than replaying an older offset',
      async () => {
        const adjusted = await scrollGeometry(page, { top: 320, left: 40 })
        const link = page
          .locator('.wf-task-inspector')
          .getByRole('link', { name: copy.latest, exact: true })
        await link.focus()
        await page.goForward()
        await page
          .getByRole('heading', { name: copy.title(18), level: 1, exact: true })
          .waitFor()
        first = { ...first, position: adjusted }
        await backToSaved(page, copy, first)
      },
    )
    await check(
      'Theme and a real read-only polling refresh do not overwrite user-changed scroll or selection',
      async () => {
        const changed = await scrollGeometry(page, { top: 480, left: 55 })
        const count = evidence.requests.filter(
          (request) =>
            request.scenario === activeScenario &&
            request.path === '/api/bootstrap',
        ).length
        await page.getByRole('button', { name: copy.dark, exact: true }).click()
        const toggle = page.getByRole('button', {
          name: copy.light,
          exact: true,
        })
        await toggle.waitFor()
        for (let index = 0; index < 160; index++) {
          if (
            evidence.requests.filter(
              (request) =>
                request.scenario === activeScenario &&
                request.path === '/api/bootstrap',
            ).length > count
          )
            break
          await page.waitForTimeout(50)
        }
        assert.ok(
          evidence.requests.filter(
            (request) =>
              request.scenario === activeScenario &&
              request.path === '/api/bootstrap',
          ).length > count,
        )
        await poll(
          () => page.locator('.wb-sync').innerText(),
          copy.synced,
          'Polling has finished applying its projection',
        )
        await assertSelected(page, first.id)
        const current = await scrollGeometry(page)
        assert.equal(Math.round(current.top), Math.round(changed.top))
        assert.equal(Math.round(current.left), Math.round(changed.left))
        assert.equal(
          await toggle.evaluate(
            (element) => element === document.activeElement,
          ),
          true,
        )
        first.position = changed
      },
    )
    await check(
      'Each pagination history entry has its own selection and scroll, while a new page starts clean',
      async () => {
        await page.getByRole('button', { name: copy.next, exact: true }).click()
        await assertSelected(page, '')
        await poll(
          async () => Math.round((await scrollGeometry(page)).top),
          0,
          'A new page push starts at its own scroll origin',
        )
        const second = await enterRun(page, copy, 55, { top: 0, left: 25 })
        await backToSaved(page, copy, second)
        await page.goBack()
        await page
          .getByRole('heading', { name: copy.project, exact: true })
          .waitFor()
        await assertSelected(page, first.id)
        await poll(
          async () => Math.round((await scrollGeometry(page)).top),
          Math.round(first.position.top),
          'The first page retains its independent offset',
        )
        await page.goForward()
        await assertSelected(page, second.id)
        await poll(
          async () => Math.round((await scrollGeometry(page)).left),
          Math.round(second.position.left),
          'The second page retains its independent horizontal offset',
        )
        await shot(page, 'independent-page-entry')
        evidence.observations.push({ scenario: activeScenario, first, second })
      },
    )
  })
  await fixture('responsive-chinese', 'zh', async ({ page, copy }) => {
    await check(
      'Chinese desktop-to-390px Back restores the same ID and visible portal focus without document overflow',
      async () => {
        await showCreated(page, copy)
        const saved = await enterRun(page, copy, 18, { top: 620, left: 60 })
        await page.setViewportSize({ width: 390, height: 844 })
        await backToSaved(page, copy, saved, true)
        const focused = await page.evaluate(() => {
          const element = document.activeElement
          const rect = element.getBoundingClientRect()
          return {
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight,
            document: document.documentElement.scrollWidth,
            viewport: document.documentElement.clientWidth,
          }
        })
        assert.equal(focused.visible, true)
        assert.ok(focused.document <= focused.viewport + 1)
        await shot(page, 'chinese-mobile-restored')
      },
    )
  })
  for (const moved of [false, true])
    await fixture(
      moved ? 'moved-result' : 'removed-task',
      'en',
      async ({ page, copy, source }) => {
        await check(
          `${moved ? 'Moved-out' : 'Removed'} saved task shows unavailable and never selects another task`,
          async () => {
            const saved = await enterRun(page, copy, 18, { top: 620, left: 0 })
            source.data.tasks = moved
              ? source.data.tasks.map((task) =>
                  task.id === saved.id
                    ? { ...task, project_id: 'other-project' }
                    : task,
                )
              : source.data.tasks.filter((task) => task.id !== saved.id)
            await refreshProjection(page, copy)
            await page.goBack()
            await page
              .getByRole('heading', { name: copy.project, exact: true })
              .waitFor()
            await assertSelected(page, '')
            const notice = page.locator('[data-list-unavailable]')
            await notice.waitFor()
            assert.equal(
              await notice.getAttribute('data-list-unavailable'),
              saved.id,
            )
            assert.equal(await page.locator('.wf-task-inspector').count(), 0)
            await shot(
              page,
              moved ? 'moved-task-unavailable' : 'removed-task-unavailable',
            )
          },
        )
      },
    )
  await fixture('unmanaged-entry', 'en', async ({ page, copy }) => {
    await check(
      'An entry stripped of its managed identity never restores by URL similarity or guessed index',
      async () => {
        await chooseTask(page, copy, 18)
        await scrollGeometry(page, { top: 620, left: 0 })
        await page.evaluate(() => history.replaceState(null, '', location.href))
        const link = page
          .locator('.wf-task-inspector')
          .getByRole('link', { name: copy.latest, exact: true })
        await link.click()
        await page
          .getByRole('heading', { name: copy.title(18), level: 1, exact: true })
          .waitFor()
        await page.goBack()
        await page
          .getByRole('heading', { name: copy.project, exact: true })
          .waitFor()
        await assertSelected(page, '')
        assert.equal(await page.locator('.wf-task-inspector').count(), 0)
        evidence.observations.push({
          scenario: activeScenario,
          controlledUnmanagedEntry: true,
          historyState: await page.evaluate(() => history.state),
        })
      },
    )
  })
  await fixture(
    'authentication-clear',
    'en',
    async ({ page, copy, expire }) => {
      await check(
        'A real intercepted 401 clears private list projections without restoring a cached task',
        async () => {
          const saved = await enterRun(page, copy, 18, { top: 620, left: 0 })
          expire()
          await page
            .locator('.wb-topbar')
            .getByRole('button', { name: copy.refresh, exact: true })
            .click()
          await page
            .getByRole('heading', { name: copy.signIn, exact: true })
            .waitFor()
          assert.equal(await page.locator('.wf-page').count(), 0)
          assert.equal(await page.locator('.wf-task-inspector').count(), 0)
          assert.equal(await page.locator('[data-task-trigger]').count(), 0)
          assert.equal(
            await page
              .locator('main')
              .getByText(copy.title(18), { exact: true })
              .count(),
            0,
          )
          evidence.observations.push({
            scenario: activeScenario,
            originalEntry: saved.stamp,
            reauthenticationNotTested: true,
          })
          await shot(page, 'authentication-cleared')
        },
      )
    },
  )
  await check(
    'All API responses are intercepted reads with no provider calls or writes',
    async () => {
      assert.deepEqual(evidence.writes, [])
      assert.deepEqual(evidence.unexpectedApi, [])
      assert.deepEqual(evidence.blockedExternal, [])
      assert.deepEqual(evidence.errors, [])
      assert.ok(evidence.requests.every((request) => request.method === 'GET'))
    },
  )
} catch (error) {
  evidence.failures.push({
    scenario: activeScenario,
    check: activeCheck,
    message: error.message,
    stack: error.stack,
    url: activePage?.url(),
  })
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
    resolve(out, 'list-continuity-verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  console.log(JSON.stringify(evidence.summary, null, 2))
}
