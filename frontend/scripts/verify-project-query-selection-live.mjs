import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.PROJECT_QUERY_LIVE_EVIDENCE_DIR ??
    '/tmp/mybot-project-query-selection-live',
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
  serviceWorkers: 'block',
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
const picker = page.getByTestId('project-query-picker-dialog')
async function ready() {
  await page.waitForFunction(() => {
    const node = document.querySelector(
      '[data-testid="project-query-picker-dialog"]',
    )
    return node && node.getAttribute('aria-busy') !== 'true'
  })
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
  assert.equal(before.capabilities.task_query, true)
  await page.goto(`${base}#workbench?project=reference-project-000`)
  await page.reload()
  await page
    .getByRole('button', { name: 'Reference task 000-0', exact: true })
    .waitFor()
  assert.equal(
    await page.locator('.wf-heading-scope').innerText(),
    'Reference project 000',
  )
  record(
    'Actual selected-project hydration admits project000 and two server task rows',
  )
  await page.getByTestId('project-query-picker-trigger').click()
  await picker
    .getByRole('checkbox', { name: 'Reference project 044', exact: true })
    .waitFor()
  await ready()
  assert.equal(await picker.getByRole('checkbox').count(), 20)
  assert.equal(
    await picker.getByTestId('project-picker-range').innerText(),
    '1-20 / 45',
  )
  await picker
    .locator('[data-project-picker-id="reference-project-000"]')
    .getByText('Reference project 000', { exact: true })
    .waitFor()
  const initialUrl = page.url()
  await picker
    .getByRole('checkbox', { name: 'Reference project 044', exact: true })
    .check()
  await picker
    .getByRole('button', { name: 'Next project page', exact: true })
    .click()
  await picker
    .getByRole('checkbox', { name: 'Reference project 024', exact: true })
    .waitFor()
  await ready()
  await picker
    .getByRole('checkbox', { name: 'Reference project 024', exact: true })
    .check()
  assert.equal(page.url(), initialUrl)
  assert.equal(
    await picker.getByTestId('project-picker-range').innerText(),
    '21-40 / 45',
  )
  record(
    'Actual20-item pages preserve off-page selection while changing only the Basic draft',
  )
  await picker
    .getByRole('textbox', { name: 'Find projects', exact: true })
    .fill('reference-project-001')
  await picker.getByRole('textbox').press('Enter')
  await picker
    .getByRole('checkbox', { name: 'Reference project 001', exact: true })
    .waitFor()
  await ready()
  assert.equal(await picker.getByRole('checkbox').count(), 1)
  assert.equal(
    await picker
      .locator('[data-project-picker-id="reference-project-044"]')
      .count(),
    1,
  )
  assert.equal(
    await picker
      .locator('[data-project-picker-id="reference-project-024"]')
      .count(),
    1,
  )
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  assert.equal(page.url(), initialUrl)
  await page
    .locator('.wf-querybar-primary')
    .getByRole('button', { name: 'Search', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Reference task 024-0', exact: true })
    .waitFor()
  const query = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  assert.deepEqual(JSON.parse(query.get('projects')), [
    'reference-project-000',
    'reference-project-024',
    'reference-project-044',
  ])
  assert.equal(
    await page.locator('.wf-title-button').filter({ visible: true }).count(),
    4,
  )
  record(
    'Actual directory search keeps all candidate projects and main Search queries four matching tasks',
  )
  await page.screenshot({
    path: resolve(out, 'real-desktop-candidate.png'),
    fullPage: true,
  })
  report.screenshots.push('real-desktop-candidate.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const filters = page.getByRole('dialog', { name: 'Filters', exact: true })
  await filters.getByTestId('project-query-picker-trigger').click()
  await picker
    .getByRole('checkbox', { name: 'Reference project 044', exact: true })
    .waitFor()
  await ready()
  await picker
    .getByRole('button', { name: 'Clear project selection', exact: true })
    .click()
  await picker
    .getByRole('checkbox', { name: 'Reference project 044', exact: true })
    .check()
  await page.keyboard.press('Escape')
  await picker.waitFor({ state: 'hidden' })
  await filters.waitFor()
  assert.equal(
    await filters
      .getByTestId('project-query-picker-trigger')
      .evaluate((node) => node === document.activeElement),
    true,
  )
  assert.deepEqual(
    JSON.parse(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get(
        'projects',
      ),
    ),
    ['reference-project-000', 'reference-project-024', 'reference-project-044'],
  )
  await filters.getByRole('button', { name: 'Search', exact: true }).click()
  await page
    .getByRole('button', { name: 'Reference task 044-0', exact: true })
    .waitFor()
  assert.equal(
    new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('project'),
    'reference-project-044',
  )
  assert.equal(
    await page.locator('.wf-title-button').filter({ visible: true }).count(),
    1,
  )
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  )
  await page.screenshot({
    path: resolve(out, 'real-mobile-committed.png'),
    fullPage: true,
  })
  report.screenshots.push('real-mobile-committed.png')
  record(
    'Actual mobile nested Astryx picker restores focus and commits only through outer Filters Search',
  )
  const after = await api('/bootstrap')
  assert.deepEqual(after.projects, before.projects)
  assert.deepEqual(after.tasks, before.tasks)
  assert.deepEqual(after.runs, before.runs)
  assert.deepEqual(after.models, before.models)
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  assert.deepEqual(report.errors, [])
  record(
    'Project/task/Run/model fixture rows remain unchanged; only public fixture login POST occurred',
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
