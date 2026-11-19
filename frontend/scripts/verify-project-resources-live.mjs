import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.PROJECT_RESOURCES_LIVE_EVIDENCE_DIR ??
    '/tmp/mybot-project-resources-live',
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
function record(message) {
  report.checks.push(message)
  console.log(`PASS ${message}`)
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
  assert.equal(before.capabilities.project_detail, true)
  assert.equal(before.capabilities.project_query, true)
  const summary = await api('/projects/query')
  assert.equal(summary.total, 45)
  assert.equal(summary.items.length, 20)
  assert.equal(summary.items[0].project.id, 'reference-project-044')
  assert.equal('notes' in summary.items[0].project, false)
  const detail = await api('/projects/reference-project-000/detail')
  assert.deepEqual(Object.keys(detail.project).sort(), [
    'directory',
    'goal',
    'id',
    'name',
    'notes',
  ])
  assert.equal(detail.task_count, 2)
  assert.equal(detail.run_count, 45)
  record(
    'Actual API returns bounded20/45 summaries and full single-project details with distinct2-task/45-Run counts',
  )
  await page.goto(`${base}#projects`)
  await page.reload()
  const list = page.getByTestId('project-resource-list')
  await list
    .getByRole('button', { name: 'Reference project 044', exact: true })
    .waitFor()
  assert.equal(await list.locator('.wb-project-resource-row').count(), 20)
  await list
    .getByRole('button', { name: 'Next project page', exact: true })
    .click()
  await list
    .getByRole('button', { name: 'Reference project 024', exact: true })
    .waitFor()
  assert.equal(
    await list.getByTestId('project-resource-range').innerText(),
    '21-40 / 45',
  )
  await page.reload()
  await list
    .getByRole('button', { name: 'Reference project 024', exact: true })
    .waitFor()
  await list
    .getByRole('searchbox', { name: 'Search projects', exact: true })
    .fill('reference-project-000')
  await list.getByRole('searchbox').press('Enter')
  await list
    .getByRole('button', { name: 'Reference project 000', exact: true })
    .waitFor()
  assert.equal(
    await list.getByTestId('project-resource-range').innerText(),
    '1-1 / 1',
  )
  await list
    .getByRole('button', { name: 'Reference project 000', exact: true })
    .click()
  await page
    .getByRole('heading', { name: 'Reference project 000', exact: true })
    .waitFor()
  await page
    .getByRole('button', { name: 'Reference task 000-0', exact: true })
    .waitFor()
  record(
    'Actual project list page/search survives reload and opens the same fixed-scope workbench',
  )
  await page.getByRole('button', { name: 'Project info', exact: true }).click()
  await page
    .getByRole('dialog', {
      name: 'Project info · Reference project 000',
      exact: true,
    })
    .waitFor()
  await page.screenshot({
    path: resolve(out, 'real-project-info.png'),
    fullPage: true,
  })
  report.screenshots.push('real-project-info.png')
  await page.keyboard.press('Escape')
  await page.goto(`${base}#workbench`)
  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: 'New task', exact: true })
    .click()
  const form = page.getByRole('dialog', { name: 'New task', exact: true })
  await form.getByText('Select a project', { exact: true }).waitFor()
  await form
    .getByRole('textbox', { name: /^Task title/ })
    .fill('Fixture project resource task')
  await form
    .getByRole('textbox', { name: /^Objective/ })
    .fill('Confirm the explicit project without any model execution.')
  await form.getByTestId('project-task-picker-trigger').click()
  const picker = page.getByTestId('project-task-picker-dialog')
  await picker
    .getByRole('radio', { name: 'Reference project 044', exact: true })
    .waitFor()
  await picker
    .getByRole('radio', { name: 'Reference project 044', exact: true })
    .check()
  await picker.getByRole('button', { name: 'Done', exact: true }).click()
  await form
    .getByTestId('project-task-picker-trigger')
    .getByText('Reference project 044', { exact: true })
    .waitFor()
  await form
    .getByRole('button', { name: 'Save task & review context', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Review context & resources', exact: true })
    .waitFor()
  const after = await api('/bootstrap')
  assert.equal(after.tasks.length, 46)
  const created = after.tasks.filter(
    (task) => !before.tasks.some((original) => original.id === task.id),
  )
  assert.equal(created.length, 1)
  assert.equal(created[0].title, 'Fixture project resource task')
  assert.equal(created[0].project_id, 'reference-project-044')
  assert.deepEqual(
    after.tasks.filter((task) =>
      before.tasks.some((original) => original.id === task.id),
    ),
    before.tasks,
  )
  assert.deepEqual(after.projects, before.projects)
  assert.deepEqual(after.runs, before.runs)
  assert.deepEqual(after.models, before.models)
  report.createdTaskId = created[0].id
  assert.deepEqual(
    report.writes.map((write) => write.path),
    ['/api/auth', '/api/tasks', `/api/tasks/${created[0].id}/preview`],
  )
  record(
    'Explicit single-project selection creates exactly one fixture task and preview, with zero new Runs/models/Provider execution',
  )
  await page.screenshot({
    path: resolve(out, 'real-task-context.png'),
    fullPage: true,
  })
  report.screenshots.push('real-task-context.png')
  await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}#projects`)
  await list
    .getByRole('button', { name: 'Reference project 044', exact: true })
    .waitFor()
  await list
    .getByRole('button', { name: 'Reference project 044', exact: true })
    .click()
  await page
    .getByRole('heading', { name: 'Reference project 044', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Project info', exact: true }).click()
  await page
    .getByRole('dialog', {
      name: 'Project info · Reference project 044',
      exact: true,
    })
    .waitFor()
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  )
  await page.screenshot({
    path: resolve(out, 'real-mobile-project.png'),
    fullPage: true,
  })
  report.screenshots.push('real-mobile-project.png')
  assert.deepEqual(report.errors, [])
  record(
    'Actual project summaries and full details also render in the390px mobile workbench without overflow',
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
