import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.PROJECT_REFERENCES_LIVE_EVIDENCE_DIR ??
    '/tmp/mybot-project-references-live',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
  ).href
)
await mkdir(out, { recursive: true })
const report = {
  fixture: true,
  checks: [],
  errors: [],
  writes: [],
  screenshots: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('mybot.locale', 'en')
  localStorage.setItem('mybot.mode', 'light')
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.protocol.startsWith('http') && url.origin !== origin
    ? route.abort()
    : route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => report.errors.push(error.message))
page.on('request', (request) => {
  const path = new URL(request.url()).pathname
  if (path.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path, method: request.method() })
})
const record = (value) => {
  report.checks.push(value)
  console.log(`PASS ${value}`)
}
async function api(path, body) {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(
        `/api${path}`,
        body === undefined
          ? {}
          : {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Workbench-Request': '1',
              },
              body: JSON.stringify(body),
            },
      )
      return { status: response.status, body: await response.json() }
    },
    { path, body },
  )
  assert.equal(result.status, 200, JSON.stringify(result.body))
  return result.body
}
async function ready(container) {
  await page.waitForFunction(
    (testid) => {
      const node = document.querySelector(`[data-testid="${testid}"]`)
      return node && node.getAttribute('aria-busy') !== 'true'
    },
    await container.getAttribute('data-testid'),
  )
}
try {
  await page.goto(base)
  await api('/auth', { token: 'astryx-browser-fixture' })
  const before = await api('/bootstrap')
  assert.match(
    before.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.equal(before.projects.length, 45)
  assert.equal(before.tasks.length, 45)
  assert.equal(before.runs.length, 88)
  assert.equal(before.models.length, 0)
  assert.equal(before.capabilities.project_references, true)
  const first = await api(
    '/project-references?selected=%5B%22reference-project-000%22%2C%22missing-project%22%5D',
  )
  assert.deepEqual(first.totals, { projects: 45, tasks: 45, runs: 88 })
  assert.equal(first.total, 45)
  assert.equal(first.items.length, 20)
  assert.equal(first.items[0].project.id, 'reference-project-044')
  assert.equal(first.has_more, true)
  assert.deepEqual(
    first.selected.map((item) => item.project.id),
    ['reference-project-000'],
  )
  assert.deepEqual(first.missing_ids, ['missing-project'])
  assert.equal(first.selected[0].task_count, 2)
  assert.equal(first.selected[0].run_count, 45)
  record(
    'Actual SQLite snapshot returns20/45 refs, hydrated off-page project and distinct2-task/45-Run counts',
  )
  const last = await api('/project-references?page=999&page_size=20')
  assert.equal(last.requested_page, 999)
  assert.equal(last.page, 3)
  assert.equal(last.items.length, 5)
  assert.equal(last.has_more, false)
  const empty = await api('/project-references?q=reference-project-001')
  assert.equal(empty.total, 1)
  assert.equal(empty.items[0].task_count, 0)
  assert.equal(empty.items[0].run_count, 0)
  assert.deepEqual(empty.totals, first.totals)
  record(
    'Actual API clamps a requested page and returns verified empty-project zero without shrinking workspace totals',
  )
  await page.goto(`${base}#workbench?project=reference-project-000`)
  await page.reload()
  const sidebar = page.getByTestId('project-directory-sidebar')
  const scope = page.getByTestId('project-directory-scope')
  const project = scope.getByRole('button', {
    name: 'Reference project 000',
    exact: true,
  })
  await project.waitFor()
  await ready(scope)
  assert.equal(
    await sidebar.getByRole('button', { name: /^Reference project / }).count(),
    20,
  )
  assert.equal(await project.getAttribute('aria-pressed'), 'true')
  assert.equal(
    await project.locator('[data-project-reference-count]').innerText(),
    '2',
  )
  assert.equal(
    await scope
      .getByRole('button', { name: 'All projects', exact: true })
      .locator('[data-project-reference-count]')
      .innerText(),
    '45',
  )
  record(
    'Real sidebar and scope consume bounded directory, selected hydration and workspace totals',
  )
  await page.getByRole('radio', { name: 'Runs', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Run history', exact: true })
    .waitFor()
  assert.equal(
    await project.locator('[data-project-reference-count]').innerText(),
    '45',
  )
  assert.equal(
    await scope
      .getByRole('button', { name: 'All projects', exact: true })
      .locator('[data-project-reference-count]')
      .innerText(),
    '88',
  )
  record(
    'Switching to Run history uses all88 attempts and selected project45 rather than task totals',
  )
  await page.screenshot({
    path: resolve(out, 'real-run-counts.png'),
    fullPage: true,
  })
  report.screenshots.push('real-run-counts.png')
  await scope
    .getByRole('button', { name: 'Next project page', exact: true })
    .click()
  await scope
    .getByRole('button', { name: 'Reference project 024', exact: true })
    .waitFor()
  await ready(scope)
  assert.equal(
    await scope
      .getByRole('button', { name: 'Reference project 044', exact: true })
      .count(),
    0,
  )
  assert.equal(await project.count(), 1)
  await scope
    .getByRole('textbox', { name: 'Search projects', exact: true })
    .fill('reference-project-001')
  await scope.getByRole('textbox').press('Enter')
  const emptyProject = scope.getByRole('button', {
    name: 'Reference project 001',
    exact: true,
  })
  await emptyProject.waitFor()
  await ready(scope)
  assert.equal(
    await emptyProject.locator('[data-project-reference-count]').innerText(),
    '0',
  )
  assert.equal(await project.count(), 1)
  record(
    'Real paging/search retain off-page selection and expose actual zero for an empty project',
  )
  await emptyProject.click()
  await page.waitForFunction(
    () =>
      new URLSearchParams(location.hash.split('?')[1]).get('project') ===
      'reference-project-001',
  )
  assert.equal(await emptyProject.getAttribute('aria-pressed'), 'true')
  record(
    'Project activation commits the exact scope through managed task-query navigation',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const mobileScope = page.getByTestId('project-directory-scope')
  await mobileScope
    .getByRole('button', { name: 'Reference project 001', exact: true })
    .waitFor()
  await ready(mobileScope)
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  )
  await page.screenshot({
    path: resolve(out, 'real-mobile-scope.png'),
    fullPage: true,
  })
  report.screenshots.push('real-mobile-scope.png')
  record(
    'Actual endpoint works through the mobile Astryx filter dialog without document overflow',
  )
  await page.keyboard.press('Escape')
  const after = await api('/bootstrap')
  assert.deepEqual(after.projects, before.projects)
  assert.deepEqual(after.tasks, before.tasks)
  assert.deepEqual(after.runs, before.runs)
  assert.deepEqual(after.models, before.models)
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  assert.deepEqual(report.errors, [])
  record(
    'All original fixture records are unchanged; only public fixture login POST occurred',
  )
} catch (error) {
  report.failure = {
    message: error.message,
    stack: error.stack,
    tree: await page.locator('body').ariaSnapshot(),
  }
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
