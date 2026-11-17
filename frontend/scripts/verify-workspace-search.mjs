import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.WORKSPACE_SEARCH_EVIDENCE_DIR ?? '/tmp/mybot-workspace-search',
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
const report = {
  synthetic: true,
  checks: [],
  requests: [],
  writes: [],
  errors: [],
  screenshots: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const project = {
  id: 'search-project',
  name: 'Search lab',
  goal: '',
  directory: '.',
  notes: '',
}
const legacy = {
  id: 'legacy-task',
  project_id: project.id,
  title: 'Legacy only',
  goal: '',
  acceptance: '',
  files: [],
  created_at: '2026-11-17T00:00:00Z',
}
const task = {
  id: 'remote-task',
  project_id: project.id,
  title: 'Remote needle task',
}
const secondTask = {
  id: 'second-task',
  project_id: project.id,
  title: 'Second current task',
}
const run = {
  id: 'historic-run-001',
  task_id: task.id,
  status: 'succeeded',
  created_at: '2026-11-17T01:00:00Z',
}
const taskItem = {
  kind: 'task',
  task,
  project: { id: project.id, name: project.name },
}
const secondItem = {
  kind: 'task',
  task: secondTask,
  project: { id: project.id, name: project.name },
}
const runItem = {
  kind: 'run',
  run,
  task,
  project: { id: project.id, name: project.name },
}
const boundedItems = Array.from({ length: 20 }, (_, index) => ({
  kind: 'task',
  task: {
    id: `bounded-task-${index + 1}`,
    project_id: project.id,
    title: `Bounded remote task ${index + 1}`,
  },
  project: { id: project.id, name: project.name },
}))
function envelope(query, items, total = items.length) {
  return {
    schema_version: 1,
    unit: 'workspace_search',
    query: query.trim(),
    limit: 20,
    total,
    has_more: total > 20,
    scope_project_id: null,
    order: 'projects-tasks-runs-created-v1',
    items,
  }
}
let pageForFailure
try {
  for (const [name, width, locale] of [
    ['desktop', 1440, 'en'],
    ['mobile', 390, 'zh'],
  ]) {
    let capability = true
    let failure = 0
    let malformed = false
    let hold = ''
    let held = false
    let release
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    })
    await context.addInitScript((locale) => {
      localStorage.setItem('mybot.locale', locale)
      localStorage.setItem('mybot.mode', locale === 'zh' ? 'dark' : 'light')
    }, locale)
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin)
        return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      report.requests.push({
        name,
        path: url.pathname,
        method: request.method(),
        query: url.searchParams.get('q'),
      })
      if (request.method() !== 'GET') {
        report.writes.push({ path: url.pathname, method: request.method() })
        return route.fulfill({ status: 405, json: { detail: 'No writes' } })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          status: 200,
          json: { authenticated: true, required: false },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          status: 200,
          json: {
            projects: [project],
            tasks: [legacy],
            runs: [],
            models: [],
            backends: [],
            workspace: '/synthetic/workspace-search',
            default_model_id: '',
            local_harnesses: [],
            capabilities: { backend_sync: false, workspace_search: capability },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          status: 200,
          json: { items: [], total: 0, offset: 0, limit: 100, has_more: false },
        })
      if (url.pathname === '/api/workspace/search') {
        const query = url.searchParams.get('q') ?? ''
        if (hold && query === hold) {
          held = true
          await new Promise((done) => {
            release = done
          })
        }
        if (failure === 401)
          return route.fulfill({
            status: 401,
            contentType: 'text/html',
            body: '<p>Login expired</p>',
          })
        if (failure)
          return route.fulfill({
            status: failure,
            json: { detail: 'Synthetic search failure' },
          })
        if (malformed)
          return route.fulfill({ status: 200, json: { items: [] } })
        if (query === 'bounded')
          return route.fulfill({
            status: 200,
            json: envelope(query, boundedItems, 35),
          })
        const items = query.includes('second')
          ? [secondItem]
          : query.includes('historic')
            ? [runItem]
            : query === 'none'
              ? []
              : [taskItem]
        return route.fulfill({ status: 200, json: envelope(query, items) })
      }
      return route.fulfill({ status: 404, json: { detail: 'Unexpected API' } })
    })
    const page = await context.newPage()
    pageForFailure = page
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
    const requests = () =>
      report.requests.filter(
        (item) => item.name === name && item.path === '/api/workspace/search',
      )
    assert.equal(requests().length, 0)
    const open = async () => {
      await page
        .getByRole('button', {
          name: locale === 'zh' ? '快速查找' : 'Quick find',
          exact: true,
        })
        .click()
      await page
        .getByRole('dialog', {
          name: locale === 'zh' ? '快速查找' : 'Quick find',
          exact: true,
        })
        .waitFor()
    }
    const dialog = () =>
      page.getByRole('dialog', {
        name: locale === 'zh' ? '快速查找' : 'Quick find',
        exact: true,
      })
    const input = () => dialog().getByRole('combobox')
    const option = (title) =>
      dialog().getByRole('option', { name: title, exact: true })
    const record = (text) => report.checks.push(`${name}: ${text}`)
    await open()
    await option(`${task.title} · ${task.id}`).waitFor()
    assert.equal(requests()[0].query, '')
    assert.equal(requests().length, 1)
    assert.equal(
      await dialog()
        .getByText('Legacy only · legacy-task', { exact: true })
        .count(),
      0,
    )
    record(
      'Open performs one bounded remote read without using Bootstrap task results',
    )
    const navigationLabel = locale === 'zh' ? '项目层级' : 'Project hierarchy'
    hold = navigationLabel
    held = false
    await input().fill(hold)
    for (let index = 0; index < 100 && !held; index++)
      await page.waitForTimeout(20)
    assert.ok(held)
    assert.equal(await dialog().getAttribute('aria-busy'), 'true')
    await option(navigationLabel).waitFor()
    const navigationHref = page.url()
    await input().press('ArrowDown')
    await input().press('Enter')
    assert.equal(page.url(), navigationHref)
    assert.equal(await dialog().count(), 1)
    record(
      'A matching local navigation row is blocked while the new query is pending',
    )
    hold = ''
    release()
    await page.waitForFunction(() => {
      const dialog = document.querySelector('dialog[open]')
      return dialog && dialog.getAttribute('aria-busy') !== 'true'
    })
    await option(navigationLabel).hover()
    await input().press('Enter')
    await dialog().waitFor({ state: 'hidden' })
    assert.equal(new URL(page.url()).hash, '#hierarchy')
    record(
      'After the exact query settles, local navigation remains keyboard-selectable',
    )
    await page.goto(`${base}#workbench`)
    await open()
    await option(`${task.title} · ${task.id}`).waitFor()
    await input().fill('bounded')
    await option(
      `${boundedItems[19].task.title} · ${boundedItems[19].task.id}`,
    ).waitFor()
    assert.equal(await dialog().getByRole('option').count(), 20)
    const boundedText = await dialog().innerText()
    assert.ok(boundedText.includes('20 / 35'))
    assert.ok(
      boundedText.includes(
        locale === 'zh' ? '请缩小搜索范围' : 'Refine your search',
      ),
    )
    await page.screenshot({
      path: resolve(out, `${name}-bounded.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-bounded.png`)
    record('A limited 20-row page reports total 35 and asks for refinement')
    await input().fill('historic')
    const runLabel = `${locale === 'zh' ? '运行记录' : 'Run record'} · ${task.title} · ${run.id}`
    await option(runLabel).waitFor()
    assert.equal(await input().inputValue(), 'historic')
    await input().press('ArrowDown')
    await input().press('Enter')
    await dialog().waitFor({ state: 'hidden' })
    assert.equal(new URL(page.url()).hash, `#run/${run.id}`)
    record(
      'Historic Run beyond local sources navigates through the managed route',
    )
    await page.goto(`${base}#workbench`)
    await open()
    await option(`${task.title} · ${task.id}`).waitFor()
    hold = 'Remote'
    held = false
    await input().fill(hold)
    for (let index = 0; index < 100 && !held; index++)
      await page.waitForTimeout(20)
    assert.ok(held)
    assert.equal(await dialog().getAttribute('aria-busy'), 'true')
    const href = page.url()
    await option(`${task.title} · ${task.id}`).waitFor()
    await option(`${task.title} · ${task.id}`).click()
    assert.equal(page.url(), href)
    assert.equal(await dialog().count(), 1)
    record('A matching optimistic stale row cannot be clicked while pending')
    await input().press('ArrowDown')
    await input().press('Enter')
    assert.equal(page.url(), href)
    assert.equal(await dialog().count(), 1)
    await input().fill('second')
    await option(`${secondTask.title} · ${secondTask.id}`).waitFor()
    hold = ''
    release()
    await page.waitForTimeout(100)
    assert.equal(await option(`${task.title} · ${task.id}`).count(), 0)
    await option(`${secondTask.title} · ${secondTask.id}`).waitFor()
    record(
      'Pending stale results cannot navigate and a delayed old response cannot replace current results',
    )
    await input().fill('Remote')
    await option(`${task.title} · ${task.id}`).waitFor()
    const composing = await input().evaluate((node) => {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      node.dispatchEvent(event)
      return event.defaultPrevented
    })
    assert.equal(composing, false)
    assert.equal(page.url(), href)
    assert.equal(await dialog().count(), 1)
    record('Synthetic composing Enter is not captured as command selection')
    failure = 403
    await input().fill('forbidden')
    await dialog().getByRole('alert').waitFor()
    assert.equal(await option(`${task.title} · ${task.id}`).count(), 0)
    assert.equal(
      await dialog().getByText('No results', { exact: true }).count(),
      0,
    )
    assert.equal(
      await dialog()
        .getByText(locale === 'zh' ? '没有匹配项' : 'No matches', {
          exact: true,
        })
        .count(),
      0,
    )
    const beforeRetry = requests().length
    await page.waitForTimeout(100)
    assert.equal(requests().length, beforeRetry)
    failure = 0
    await dialog()
      .getByRole('button', {
        name: locale === 'zh' ? '重试搜索' : 'Retry search',
        exact: true,
      })
      .click()
    await option(`${task.title} · ${task.id}`).waitFor()
    assert.equal(requests().length, beforeRetry + 1)
    assert.equal(await input().inputValue(), 'forbidden')
    record('403 has explicit failure, preserves query and retries one GET only')
    failure = 404
    await input().fill('missing-endpoint')
    await dialog().getByRole('alert').waitFor()
    assert.ok(
      (await dialog().getByRole('alert').innerText()).includes(
        locale === 'zh'
          ? '服务端搜索接口不可用'
          : 'The server search is unavailable',
      ),
    )
    assert.equal(await option(`${task.title} · ${task.id}`).count(), 0)
    const missingCount = requests().length
    failure = 0
    await dialog()
      .getByRole('button', {
        name: locale === 'zh' ? '重试搜索' : 'Retry search',
        exact: true,
      })
      .click()
    await option(`${task.title} · ${task.id}`).waitFor()
    assert.equal(requests().length, missingCount + 1)
    assert.equal(await input().inputValue(), 'missing-endpoint')
    record('An advertised missing endpoint remains an error without fallback')
    malformed = true
    await input().fill('malformed')
    await dialog().getByRole('alert').waitFor()
    assert.equal(await option(`${task.title} · ${task.id}`).count(), 0)
    malformed = false
    await dialog()
      .getByRole('button', {
        name: locale === 'zh' ? '重试搜索' : 'Retry search',
        exact: true,
      })
      .click()
    await option(`${task.title} · ${task.id}`).waitFor()
    record('Malformed 2xx is an error rather than a Bootstrap fallback')
    hold = 'closing'
    held = false
    await input().fill(hold)
    for (let index = 0; index < 100 && !held; index++)
      await page.waitForTimeout(20)
    assert.ok(held)
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })
    hold = ''
    release()
    await page.waitForTimeout(100)
    assert.equal(await dialog().count(), 0)
    const beforeReopen = requests().length
    await open()
    await option(`${task.title} · ${task.id}`).waitFor()
    assert.equal(await input().inputValue(), '')
    assert.equal(requests().length, beforeReopen + 1)
    record(
      'Closing cancels the active read and a late answer cannot reopen or seed the next query',
    )
    await input().fill('none')
    await dialog()
      .getByText(locale === 'zh' ? '没有匹配项' : 'No matches', { exact: true })
      .waitFor()
    record('True empty results remain distinct from failed search')
    await input().fill('needle')
    await option(`${task.title} · ${task.id}`).waitFor()
    await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
    report.screenshots.push(`${name}.png`)
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })
    assert.equal(
      await page
        .getByRole('button', {
          name: locale === 'zh' ? '快速查找' : 'Quick find',
          exact: true,
        })
        .evaluate((node) => node === document.activeElement),
      true,
    )
    record('Escape closes and restores the global trigger focus')
    capability = false
    await page.reload()
    const legacyCount = requests().length
    await open()
    await option('Legacy only · legacy-task').waitFor()
    assert.equal(requests().length, legacyCount)
    record(
      'Missing capability uses the original local command source without remote reads',
    )
    await page.keyboard.press('Escape')
    capability = true
    await page.reload()
    await open()
    await option(`${task.title} · ${task.id}`).waitFor()
    failure = 401
    await input().fill('expired')
    await page
      .getByRole('heading', {
        name: locale === 'zh' ? '登录工作空间' : 'Sign in to workspace',
        exact: true,
      })
      .waitFor()
    assert.equal(await dialog().count(), 0)
    record('HTML 401 clears the palette and private search results')
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  if (pageForFailure && !pageForFailure.isClosed()) {
    await pageForFailure.screenshot({
      path: resolve(out, 'failure.png'),
      fullPage: true,
    })
    report.failure.tree = await pageForFailure.locator('body').ariaSnapshot()
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
    out,
  }),
)
