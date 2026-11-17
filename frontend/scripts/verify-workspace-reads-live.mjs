import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.WORKSPACE_LIVE_EVIDENCE_DIR ?? '/tmp/mybot-workspace-live',
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
const record = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function api(path, body) {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const r = await fetch(
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
      return { status: r.status, body: await r.json() }
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
  assert.equal(before.tasks.length, 2)
  assert.equal(before.runs.length, 45)
  assert.equal(before.models.length, 0)
  assert.equal(before.capabilities.workspace_counts, true)
  assert.equal(before.capabilities.workspace_search, true)
  const counts = await api('/workspace/counts')
  assert.deepEqual(counts.task_counts, {
    all: 2,
    pending: 1,
    active: 0,
    attention: 0,
    completed: 1,
    other: 0,
  })
  assert.deepEqual(counts.run_counts, {
    all: 45,
    active: 0,
    attention: 15,
    completed: 15,
    other: 15,
  })
  record(
    'Actual counts classify recovered tasks separately from all 45 historical attempts',
  )
  const result = await api('/workspace/search?q=&limit=20')
  assert.equal(result.total, 48)
  assert.equal(result.items.length, 20)
  assert.equal(result.has_more, true)
  const old = await api('/workspace/search?q=detail-fixture-run-000&limit=20')
  assert.equal(old.total, 1)
  assert.equal(old.items[0].run.id, 'detail-fixture-run-000')
  record(
    'Real search reports 20 of 48 references and finds a Run older than the former 30-item limit',
  )
  await page.reload()
  await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
  await page.waitForFunction(
    () =>
      document
        .querySelector('[aria-label="Inbox task count"]')
        ?.textContent.trim() === '1',
  )
  const all = page
    .getByRole('navigation', { name: 'Task scope', exact: true })
    .getByRole('button', { name: 'All tasks', exact: true })
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.wf-scope-item')].some(
      (n) =>
        n.textContent.includes('All tasks') &&
        n.querySelector('.wf-scope-count')?.textContent === '2',
    ),
  )
  assert.equal(await all.locator('.wf-scope-count').innerText(), '2')
  record('Shell Inbox and task-status rail render actual aggregate values')
  await page.getByRole('button', { name: 'Quick find', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Quick find', exact: true })
  await dialog
    .getByText(
      'Showing 20 / 48 project, task or run results. Refine your search.',
      { exact: true },
    )
    .waitFor()
  await dialog.getByRole('combobox').fill('detail-fixture-run-000')
  await dialog
    .getByRole('option', { name: /detail-fixture-run-000$/ })
    .waitFor()
  await dialog
    .getByText('Showing 1 / 1 project, task or run results', { exact: true })
    .waitFor()
  record(
    'Astryx Quick find consumes actual bounded results and displays the old Run without client filtering',
  )
  await page.screenshot({
    path: resolve(out, 'old-run-desktop.png'),
    fullPage: true,
  })
  report.screenshots.push('old-run-desktop.png')
  await dialog.getByRole('combobox').fill('detail-fixture-empty')
  const candidate = dialog.getByRole('option', {
    name: 'Never-run acceptance · detail-fixture-empty',
    exact: true,
  })
  await candidate.waitFor()
  await page.waitForFunction(
    () =>
      document.querySelector('dialog[open]')?.getAttribute('aria-busy') !==
      'true',
  )
  await candidate.click()
  await dialog.waitFor({ state: 'hidden' })
  await page
    .locator('.wf-title-button')
    .filter({ visible: true })
    .first()
    .waitFor()
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  assert.equal(params.get('q'), 'detail-fixture-empty')
  assert.equal(params.get('project'), 'detail-fixture-project')
  record(
    'Selecting a real never-run task admits its exact query and project through managed navigation',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Quick find', exact: true }).click()
  await dialog.getByRole('combobox').fill('detail-fixture-run-000')
  await dialog
    .getByRole('option', { name: /detail-fixture-run-000$/ })
    .waitFor()
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  )
  await page.screenshot({
    path: resolve(out, 'old-run-mobile.png'),
    fullPage: true,
  })
  report.screenshots.push('old-run-mobile.png')
  await page.keyboard.press('Escape')
  const after = await api('/bootstrap')
  assert.deepEqual(after.tasks, before.tasks)
  assert.deepEqual(after.runs, before.runs)
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  assert.deepEqual(report.errors, [])
  record(
    '390px search works and inspection leaves all tasks/Runs unchanged without Provider or control requests',
  )
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  report.failure.tree = await page
    .locator('body')
    .ariaSnapshot()
    .catch(() => '')
  await page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
