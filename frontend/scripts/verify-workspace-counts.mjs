import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.WORKSPACE_COUNTS_EVIDENCE_DIR ?? '/tmp/mybot-workspace-counts',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
  ).href
)
await mkdir(out, { recursive: true })
const report = {
  synthetic: true,
  checks: [],
  requests: [],
  errors: [],
  writes: [],
  screenshots: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const project = {
  id: 'counts-project',
  name: 'Counts project',
  goal: '',
  directory: '.',
  notes: '',
}
const taskCounts = {
  all: 16,
  pending: 5,
  active: 2,
  attention: 3,
  completed: 4,
  other: 2,
}
const runCounts = { all: 45, active: 2, attention: 30, completed: 11, other: 2 }
let failurePage
try {
  for (const [name, width, locale] of [
    ['desktop', 1440, 'en'],
    ['mobile', 390, 'zh'],
  ]) {
    let status = 0
    let malformed = false
    let capability = true
    let hold = false
    let held = false
    const releases = []
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
        search: url.search,
      })
      if (request.method() !== 'GET') {
        report.writes.push(url.pathname)
        return route.fulfill({ status: 405, json: {} })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({ json: { authenticated: true, required: false } })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          json: {
            projects: [project],
            tasks: [],
            runs: [],
            models: [],
            backends: [],
            workspace: '/synthetic/counts',
            local_harnesses: [],
            default_model_id: '',
            capabilities: { backend_sync: false, workspace_counts: capability },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 100, has_more: false },
        })
      if (url.pathname === '/api/workspace/counts') {
        if (hold) {
          held = true
          await new Promise((done) => {
            releases.push(done)
          })
        }
        if (status === 401)
          return route.fulfill({
            status,
            contentType: 'text/html',
            body: 'expired',
          })
        if (status)
          return route.fulfill({ status, json: { detail: 'fixture failure' } })
        if (malformed) return route.fulfill({ json: { task_counts: {} } })
        const scope = url.searchParams.get('scope_project_id')
        const selected = scope
          ? [scope]
          : JSON.parse(url.searchParams.get('projects'))
        return route.fulfill({
          json: {
            schema_version: 1,
            unit: 'workspace_counts',
            projects: selected,
            scope_project_id: scope,
            task_counts: taskCounts,
            run_counts: runCounts,
          },
        })
      }
      return route.fulfill({ status: 404, json: {} })
    })
    const page = await context.newPage()
    failurePage = page
    page.on('pageerror', (error) => report.errors.push(error.message))
    const record = (value) => report.checks.push(`${name}: ${value}`)
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const readCount = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/workspace/counts',
      ).length
    await page.goto(`${base}#workbench`)
    await page
      .getByRole('heading', { name: text('任务', 'Tasks'), exact: true })
      .waitFor()
    const revealMenu = async () => {
      if (width < 650 && !(await page.locator('.wb-sidebar').isVisible()))
        await page
          .getByRole('button', {
            name: text('打开导航', 'Open navigation'),
            exact: true,
          })
          .click()
    }
    if (width < 650) await revealMenu()
    const inbox = page
      .getByLabel(text('待处理任务数', 'Inbox task count'), {
        exact: true,
      })
      .first()
    await page.waitForFunction(
      (label) =>
        document
          .querySelector(`[aria-label="${label}"]`)
          ?.textContent.trim() === '8',
      text('待处理任务数', 'Inbox task count'),
    )
    assert.equal(await inbox.innerText(), '8')
    assert.equal(
      await page
        .getByLabel(text('活跃运行数', 'Active run count'), { exact: true })
        .first()
        .innerText(),
      '2',
    )
    record(
      'Shell counts use remote task/Run aggregates even when Bootstrap contains no tasks or Runs',
    )
    if (width < 650) {
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', { name: text('筛选条件', 'Filters'), exact: true })
        .click()
    }
    const scope = page
      .getByRole('navigation', {
        name: text('任务范围', 'Task scope'),
        exact: true,
      })
      .filter({ visible: true })
    await scope
      .getByRole('button', { name: text('所有任务', 'All tasks'), exact: true })
      .waitFor()
    assert.equal(
      await scope
        .getByRole('button', {
          name: text('所有任务', 'All tasks'),
          exact: true,
        })
        .locator('.wf-scope-count')
        .innerText(),
      '16',
    )
    record(
      'Task-status counts are remote totals, independent of the current empty list',
    )
    await page.screenshot({
      path: resolve(out, `${name}-counts.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-counts.png`)
    if (width < 650) await page.keyboard.press('Escape')
    else {
      hold = true
      held = false
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Inbox task count"]')
            ?.textContent.trim() === '8',
      )
      for (let i = 0; i < 100 && !held; i++) await page.waitForTimeout(20)
      assert.ok(held)
      assert.equal(await inbox.innerText(), '8')
      assert.equal(await inbox.getAttribute('aria-busy'), 'true')
      hold = false
      for (const release of releases.splice(0)) release()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Inbox task count"]')
            ?.getAttribute('aria-busy') !== 'true',
      )
      record(
        'Same-scope explicit refresh retains validated counts while reads are pending',
      )
      await page.getByRole('radio', { name: 'Runs', exact: true }).click()
      const allRuns = scope.getByRole('button', {
        name: 'All runs',
        exact: true,
      })
      await allRuns.waitFor()
      assert.equal(await allRuns.locator('.wf-scope-count').innerText(), '45')
      await page.getByRole('radio', { name: 'Tasks', exact: true }).click()
      record(
        'Scope status switches from task totals to all-Run totals without conflating their denominators',
      )
      await page.goto(
        `${base}#project/${project.id}?view=list&project=conflicting-project`,
      )
      await page.waitForFunction(() =>
        [...document.querySelectorAll('.wf-scope-item')].some(
          (n) =>
            n.textContent.includes('All tasks') &&
            n.querySelector('.wf-scope-count')?.textContent === '16',
        ),
      )
      assert.ok(
        report.requests.some(
          (request) =>
            request.name === name &&
            new URLSearchParams(request.search).get('scope_project_id') ===
              project.id,
        ),
      )
      record(
        'Fixed project route binds the aggregate request despite a conflicting URL project',
      )
      await page.goto(`${base}#workbench`)
      await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
    }
    status = 403
    await page.reload()
    await page
      .getByRole('button', {
        name: text('重试计数', 'Retry counts'),
        exact: true,
      })
      .waitFor()
    if (width < 650)
      await page
        .getByRole('button', { name: text('筛选条件', 'Filters'), exact: true })
        .click()
    await page.locator('.wf-count-error').waitFor({ state: 'attached' })
    if (width < 650) await page.keyboard.press('Escape')
    if (width < 650) await revealMenu()
    assert.equal(await inbox.innerText(), '-')
    await page.screenshot({
      path: resolve(out, `${name}-unknown.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-unknown.png`)
    if (width < 650) await page.keyboard.press('Escape')
    const failedReads = readCount()
    const bootstrapReads = () =>
      report.requests.filter(
        (r) => r.name === name && r.path === '/api/bootstrap',
      ).length
    const beforePoll = bootstrapReads()
    await page.waitForTimeout(width < 650 ? 250 : 6500)
    if (width >= 650)
      assert.ok(
        bootstrapReads() > beforePoll,
        'Unknown active count must not stop background state checks',
      )
    assert.equal(readCount(), failedReads)
    status = 0
    await page
      .getByRole('button', {
        name: text('重试计数', 'Retry counts'),
        exact: true,
      })
      .click()
    await page.waitForFunction(
      (label) =>
        document
          .querySelector(`[aria-label="${label}"]`)
          ?.textContent.trim() === '8',
      text('待处理任务数', 'Inbox task count'),
    )
    assert.equal(readCount(), failedReads + 1)
    record(
      '403 keeps counts unknown without automatic count retries; explicit shell retry issues exactly one GET',
    )
    malformed = true
    await page.reload()
    await page
      .getByRole('button', {
        name: text('重试计数', 'Retry counts'),
        exact: true,
      })
      .waitFor()
    assert.equal(await inbox.innerText(), '-')
    record('Malformed 2xx cannot become a success-shaped zero aggregate')
    malformed = false
    capability = false
    const beforeLegacy = readCount()
    await page.reload()
    await page
      .getByRole('heading', { name: text('任务', 'Tasks'), exact: true })
      .waitFor()
    await page.waitForTimeout(150)
    assert.equal(readCount(), beforeLegacy)
    record(
      'Backend without the capability keeps local count behavior and makes no aggregate request',
    )
    capability = true
    status = 401
    await page.reload()
    await page
      .getByRole('heading', {
        name: text('登录工作空间', 'Sign in to workspace'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-page').count(), 0)
    record('HTML 401 clears private counts and returns to sign-in')
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    )
    await page.screenshot({
      path: resolve(out, `${name}-signed-out.png`),
      fullPage: true,
    })
    report.screenshots.push(`${name}-signed-out.png`)
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
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
