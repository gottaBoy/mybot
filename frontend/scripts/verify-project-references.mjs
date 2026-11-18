import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.PROJECT_REFERENCES_EVIDENCE_DIR ??
    '/tmp/mybot-project-references',
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
  geometry: [],
}
const projects = Array.from({ length: 45 }, (_, index) => ({
  project: {
    id: `reference-project-${String(index).padStart(3, '0')}`,
    name:
      index === 43
        ? 'Remote project 043 · Long localized project name 项目研发协作与多端任务交接验证'
        : `Remote project ${String(index).padStart(3, '0')}`,
  },
  task_count: index === 0 ? 2 : index === 1 ? 0 : 1,
  run_count: index === 0 ? 45 : index === 1 ? 0 : 1,
})).reverse()
const totals = { projects: 45, tasks: 45, runs: 88 }
function directoryResponse(url) {
  const query = (url.searchParams.get('q') ?? '').trim()
  const selectedIds = JSON.parse(url.searchParams.get('selected') ?? '[]')
  const requestedPage = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('page_size') ?? '20')
  const matched =
    query === 'authority'
      ? projects.slice(-1)
      : projects.filter((item) =>
          `${item.project.id} ${item.project.name}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
  const totalPages = Math.max(1, Math.ceil(matched.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
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
      projects.filter((item) => item.project.id === id),
    ),
    missing_ids: selectedIds.filter(
      (id) => !projects.some((item) => item.project.id === id),
    ),
    totals,
    items: matched.slice((page - 1) * pageSize, page * pageSize),
  }
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
let failurePage
try {
  for (const [name, width, locale, style, mode] of [
    ['desktop', 1440, 'en', 'neutral', 'light'],
    ['mobile', 390, 'zh', 'zira', 'dark'],
  ]) {
    let capability = true
    let status = 0
    let malformed = false
    let delayedQuery
    const releases = []
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    })
    await context.addInitScript(
      ({ locale, style, mode }) => {
        localStorage.setItem('mybot.locale', locale)
        localStorage.setItem('mybot.mode', mode)
        localStorage.setItem('mybot.style', style)
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
        path: url.pathname,
        search: url.search,
        method: request.method(),
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
            projects: projects.map((item) => ({
              ...item.project,
              name: item.project.name.replace('Remote', 'Bootstrap'),
              goal: '',
              directory: '.',
              notes: '',
            })),
            tasks: [],
            runs: [
              {
                id: 'synthetic-observation',
                task_id: 'synthetic-observation-task',
                status: 'running',
                created_at: '2026-11-18T00:00:00Z',
              },
            ],
            models: [],
            backends: [],
            workspace: '/synthetic/project-references',
            default_model_id: '',
            local_harnesses: [],
            capabilities: {
              backend_sync: false,
              project_references: capability,
            },
          },
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 100, has_more: false },
        })
      if (url.pathname === '/api/project-references') {
        if (delayedQuery === url.searchParams.get('q'))
          await new Promise((done) => releases.push(done))
        if (status === 401)
          return route.fulfill({
            status,
            contentType: 'text/html',
            body: 'expired',
          })
        if (status)
          return route.fulfill({ status, json: { detail: 'fixture failure' } })
        if (malformed) return route.fulfill({ json: { items: [], total: 0 } })
        return route.fulfill({ json: directoryResponse(url) })
      }
      return route.fulfill({ status: 404, json: {} })
    })
    const page = await context.newPage()
    failurePage = page
    page.on('pageerror', (error) => report.errors.push(error.message))
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const record = (value) => {
      report.checks.push(`${name}: ${value}`)
      console.log(`PASS ${name}: ${value}`)
    }
    const count = () =>
      report.requests.filter(
        (item) => item.name === name && item.path === '/api/project-references',
      ).length
    const queryCount = (query) =>
      report.requests.filter(
        (item) =>
          item.name === name &&
          item.path === '/api/project-references' &&
          new URLSearchParams(item.search).get('q') === query,
      ).length
    const bootstrapCount = () =>
      report.requests.filter(
        (item) => item.name === name && item.path === '/api/bootstrap',
      ).length
    const screenshot = async (suffix) => {
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      for (const container of [sidebar, scope]) {
        if (!(await container.count())) continue
        const edges = await container
          .locator('.wb-project-directory-row [data-project-reference-count]')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getBoundingClientRect().right),
          )
        if (edges.length > 1)
          assert.ok(Math.max(...edges) - Math.min(...edges) <= 1)
      }
      const file = `${name}-${suffix}.png`
      await page.screenshot({ path: resolve(out, file), fullPage: true })
      report.screenshots.push(file)
    }
    const sidebar = page.getByTestId('project-directory-sidebar')
    const scope = page.getByTestId('project-directory-scope')
    async function openSidebar() {
      if (width < 650 && !(await page.locator('.wb-sidebar').isVisible()))
        await page
          .getByRole('button', {
            name: text('打开导航', 'Open navigation'),
            exact: true,
          })
          .click()
      await sidebar.waitFor()
    }
    async function openScope() {
      if (width < 650) {
        if (await page.getByRole('dialog').count())
          await page.keyboard.press('Escape')
        await page
          .getByRole('button', {
            name: text('筛选条件', 'Filters'),
            exact: true,
          })
          .click()
      }
      await scope.waitFor()
    }
    const row = (container, projectName) =>
      container.getByRole('button', { name: projectName, exact: true })
    const ready = async (container) => {
      await page.waitForFunction(
        (testid) => {
          const node = document.querySelector(`[data-testid="${testid}"]`)
          return node && node.getAttribute('aria-busy') !== 'true'
        },
        await container.getAttribute('data-testid'),
      )
    }
    await page.goto(`${base}#workbench?project=reference-project-000`)
    await page
      .getByRole('heading', {
        name: text('任务', 'Tasks'),
        exact: true,
      })
      .waitFor()
    await openSidebar()
    await row(sidebar, 'Remote project 044').waitFor()
    await ready(sidebar)
    assert.equal(
      await sidebar.getByRole('button', { name: /^Remote project / }).count(),
      20,
    )
    assert.equal(
      await sidebar.getByText('Bootstrap project 044', { exact: true }).count(),
      0,
    )
    record(
      'Sidebar uses a bounded server page rather than the Bootstrap first eight',
    )
    await screenshot('sidebar')
    await openScope()
    await row(scope, 'Remote project 000').waitFor()
    await ready(scope)
    assert.equal(
      await row(scope, 'Remote project 000').getAttribute('aria-pressed'),
      'true',
    )
    assert.match(await row(scope, 'Remote project 000').innerText(), /2$/)
    assert.match(
      await row(scope, text('全部项目', 'All projects')).innerText(),
      /45$/,
    )
    record(
      'Off-page selected reference is hydrated; task total comes from workspace totals',
    )
    if (width >= 650) {
      delayedQuery = ''
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="project-directory-scope"]')
            ?.getAttribute('aria-busy') === 'true',
      )
      assert.equal(await row(scope, 'Remote project 044').count(), 1)
      assert.equal(
        await row(scope, 'Remote project 044').getAttribute('aria-disabled'),
        'true',
      )
      assert.match(await row(scope, 'Remote project 000').innerText(), /2$/)
      delayedQuery = undefined
      for (const release of releases.splice(0)) release()
      await ready(scope)
      record(
        'Same-key explicit refresh retains validated counts and disables activation while busy',
      )
    }
    const scopeInput = scope.getByRole('textbox')
    const beforeDraft = count()
    await scopeInput.fill('authority')
    await scopeInput.evaluate((node) => {
      node.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          isComposing: true,
        }),
      )
    })
    await page.waitForTimeout(120)
    assert.equal(count(), beforeDraft)
    await scopeInput.press('Enter')
    await ready(scope)
    await row(scope, 'Remote project 000').waitFor()
    assert.equal(await row(scope, 'Remote project 044').count(), 0)
    assert.equal(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('q'),
      null,
    )
    record(
      'Directory search commits separately and preserves server matches without browser filtering',
    )
    await screenshot('selected-search')
    await scopeInput.fill('')
    await scopeInput.press('Enter')
    await row(scope, 'Remote project 044').waitFor()
    await ready(scope)
    await scope
      .getByRole('button', {
        name: text('下一页项目', 'Next project page'),
        exact: true,
      })
      .click()
    await row(scope, 'Remote project 024').waitFor()
    await ready(scope)
    assert.equal(await row(scope, 'Remote project 044').count(), 0)
    assert.equal(await row(scope, 'Remote project 000').count(), 1)
    record(
      'Actual next page replaces rows while selected off-page project remains available',
    )
    await screenshot('page-two')
    if (width >= 650) {
      await scope
        .getByRole('button', {
          name: text('下一页项目', 'Next project page'),
          exact: true,
        })
        .focus()
      await page.keyboard.press('Enter')
      await row(scope, 'Remote project 004').waitFor()
      await ready(scope)
      assert.equal(
        await scope
          .getByRole('button', {
            name: text('下一页项目', 'Next project page'),
            exact: true,
          })
          .getAttribute('aria-disabled'),
        'true',
      )
      assert.notEqual(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-disabled'),
        ),
        'true',
      )
      record(
        'Keyboard pagination reaches last page and restores focus to an available control',
      )
      await scopeInput.fill('draft retained')
      await page.getByRole('button', { name: 'Dark mode', exact: true }).click()
      assert.equal(await scopeInput.inputValue(), 'draft retained')
      record('Theme mode change preserves the directory draft and page')
    }
    delayedQuery = 'slow'
    await scopeInput.fill('slow')
    await scopeInput.press('Enter')
    await page.waitForFunction(
      (testid) =>
        document
          .querySelector(`[data-testid="${testid}"]`)
          ?.getAttribute('aria-busy') === 'true',
      'project-directory-scope',
    )
    assert.equal(await row(scope, 'Remote project 000').count(), 0)
    const heldCount = queryCount('slow')
    const pollBeforeSlow = bootstrapCount()
    await page.waitForTimeout(width >= 650 ? 6500 : 120)
    assert.equal(queryCount('slow'), heldCount)
    if (width >= 650) assert.ok(bootstrapCount() > pollBeforeSlow)
    record(
      'Changed query hides obsolete activations and background polling does not cancel slow reads',
    )
    delayedQuery = undefined
    for (const release of releases.splice(0)) release()
    await ready(scope)
    assert.equal(
      await scope.getByRole('button', { name: /^Remote project / }).count(),
      1,
    )
    record(
      'True empty search retains only the independently hydrated selected project',
    )
    status = 403
    await scopeInput.fill('failed')
    await scopeInput.press('Enter')
    await scope.getByRole('alert').waitFor()
    assert.equal(
      await scope.getByRole('button', { name: /^Remote project / }).count(),
      0,
    )
    const failedCount = queryCount('failed')
    const pollBeforeError = bootstrapCount()
    if (width >= 650) await page.waitForTimeout(6500)
    assert.equal(queryCount('failed'), failedCount)
    if (width >= 650) assert.ok(bootstrapCount() > pollBeforeError)
    record(
      'Advertised endpoint failure exposes no Bootstrap fallback or automatic GET retry',
    )
    status = 0
    await scope
      .getByRole('button', {
        name: text('重试项目目录', 'Retry project directory'),
        exact: true,
      })
      .click()
    await ready(scope)
    assert.equal(queryCount('failed'), failedCount + 1)
    assert.equal(await scopeInput.inputValue(), 'failed')
    record(
      'Explicit retry reads the same directory query once and preserves input',
    )
    malformed = true
    await scopeInput.fill('malformed')
    await scopeInput.press('Enter')
    await scope.getByRole('alert').waitFor()
    record('Malformed successful HTTP response remains an error')
    malformed = false
    delayedQuery = 'late'
    await scopeInput.fill('late')
    await scopeInput.press('Enter')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="project-directory-scope"]')
          ?.getAttribute('aria-busy') === 'true',
    )
    await scopeInput.fill('authority')
    await scopeInput.press('Enter')
    await row(scope, 'Remote project 000').waitFor()
    await ready(scope)
    delayedQuery = undefined
    for (const release of releases.splice(0)) release()
    await page.waitForTimeout(100)
    assert.equal(await scopeInput.inputValue(), 'authority')
    assert.equal(
      await scope.getByTestId('project-directory-status').innerText(),
      '1-1 / 1',
    )
    record(
      'A late obsolete directory response cannot overwrite the newer search',
    )
    await page.goto(`${base}#workbench?project=missing-project`)
    await scope
      .getByText(
        text('项目不可用', 'Unavailable project') + ' · missing-project',
        { exact: true },
      )
      .waitFor()
    await ready(scope)
    assert.equal(
      await scope.getByTestId('project-directory-selected').count(),
      0,
    )
    record(
      'A server-confirmed missing selected project is distinct from off-page hydration',
    )
    await page.goto(`${base}#project/reference-project-000`)
    await openScope()
    await scope
      .locator('[data-project-reference="reference-project-000"]')
      .waitFor()
    await ready(scope)
    assert.equal(await scope.locator('[data-project-reference]').count(), 1)
    assert.equal(
      await scope.getByRole('button', { name: /^Remote project / }).count(),
      0,
    )
    assert.equal(await row(scope, text('全部项目', 'All projects')).count(), 0)
    assert.equal(await scope.getByRole('textbox').count(), 0)
    record(
      'Fixed project route displays one hydrated project without global scope switching',
    )
    await screenshot('fixed-project')
    capability = false
    const beforeLegacy = count()
    await page.goto(`${base}?legacy_fixture=1#workbench`)
    await page
      .getByRole('heading', { name: text('任务', 'Tasks'), exact: true })
      .waitFor()
    await page.waitForTimeout(150)
    assert.equal(count(), beforeLegacy)
    assert.equal(await scope.count(), 0)
    record(
      'Missing capability keeps legacy directory and makes no reference GET',
    )
    capability = true
    status = 401
    await page.reload()
    if (width < 650) {
      await page
        .getByRole('heading', {
          name: text('任务', 'Tasks'),
          exact: true,
        })
        .waitFor()
      await page
        .getByRole('button', {
          name: text('筛选条件', 'Filters'),
          exact: true,
        })
        .click()
    }
    await page
      .getByRole('heading', {
        name: text('登录工作空间', 'Sign in to workspace'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.getByTestId('project-directory-sidebar').count(), 0)
    assert.equal(await page.getByTestId('project-directory-scope').count(), 0)
    record(
      'HTML 401 clears private directory projections and returns to sign-in',
    )
    await context.close()
  }
  for (const style of ['neutral', 'zira', 'y2k']) {
    for (const mode of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
      })
      await context.addInitScript(
        ({ style, mode }) => {
          localStorage.setItem('mybot.locale', 'en')
          localStorage.setItem('mybot.style', style)
          localStorage.setItem('mybot.mode', mode)
        },
        { style, mode },
      )
      await context.route('**/api/**', (route) => {
        const url = new URL(route.request().url())
        if (route.request().method() !== 'GET') {
          report.writes.push(url.pathname)
          return route.fulfill({ status: 405, json: {} })
        }
        if (url.pathname === '/api/auth/state')
          return route.fulfill({
            json: { authenticated: true, required: false },
          })
        if (url.pathname === '/api/bootstrap')
          return route.fulfill({
            json: {
              projects: [],
              tasks: [],
              runs: [],
              models: [],
              backends: [],
              workspace: '/synthetic/themes',
              local_harnesses: [],
              default_model_id: '',
              capabilities: { backend_sync: false, project_references: true },
            },
          })
        if (url.pathname === '/api/project-references')
          return route.fulfill({ json: directoryResponse(url) })
        if (url.pathname === '/api/saved-views')
          return route.fulfill({
            json: {
              items: [],
              total: 0,
              offset: 0,
              limit: 100,
              has_more: false,
            },
          })
        return route.fulfill({ status: 404, json: {} })
      })
      const page = await context.newPage()
      failurePage = page
      page.on('pageerror', (error) => report.errors.push(error.message))
      await page.goto(`${base}#workbench`)
      const scope = page.getByTestId('project-directory-scope')
      await scope
        .getByRole('button', { name: 'Remote project 044', exact: true })
        .waitFor()
      const geometry = await scope.evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        scrollWidth: node.scrollWidth,
        color: getComputedStyle(node).color,
        background: getComputedStyle(node.closest('.wf-scope-navigation'))
          .backgroundColor,
        font: getComputedStyle(node).fontFamily,
      }))
      assert.ok(geometry.scrollWidth <= geometry.width + 1)
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      report.geometry.push({ style, mode, ...geometry })
      const file = `${style}-${mode}.png`
      await page.screenshot({ path: resolve(out, file), fullPage: true })
      report.screenshots.push(file)
      report.checks.push(
        `${style}/${mode}: rendered project directory fits its region and document`,
      )
      await context.close()
    }
  }
  assert.notEqual(report.geometry[0].color, report.geometry[1].color)
  assert.notEqual(report.geometry[0].font, report.geometry[4].font)
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
