import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_INBOX_ACTUAL_EVIDENCE_DIR ?? '/tmp/mybot-inbox-actual',
)
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const report = {
  fixture: true,
  source: 'Actual disposable HTTP/API/SQLite through production UI',
  checks: [],
  errors: [],
  writes: [],
  blocked: [],
  external: [],
  details: [],
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
  if (!localStorage.getItem('mybot.locale'))
    localStorage.setItem('mybot.locale', 'en')
  localStorage.setItem('mybot.style', 'neutral')
  localStorage.setItem('mybot.mode', 'light')
})
await context.route('**/*', (route) => {
  const r = route.request()
  const url = new URL(r.url())
  if (url.protocol.startsWith('http') && url.origin !== origin) {
    report.external.push(url.origin)
    return route.abort()
  }
  if (url.pathname.startsWith('/api/') && r.method() !== 'GET') {
    report.writes.push({ path: url.pathname, method: r.method() })
    if (url.pathname !== '/api/auth' || r.method() !== 'POST') {
      report.blocked.push(url.pathname)
      return route.abort()
    }
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (e) => report.errors.push(e.message))
page.on('request', (r) => {
  const url = new URL(r.url())
  if (/\/api\/tasks\/[^/]+\/detail$/.test(url.pathname))
    report.details.push(url.pathname)
})
function record(text) {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function read(path) {
  const r = await page.evaluate(async (path) => {
    const response = await fetch(`/api${path}`)
    return { status: response.status, body: await response.json() }
  }, path)
  assert.equal(r.status, 200, JSON.stringify(r.body))
  return r.body
}
const states = (type) => (type === 'all' ? ['pending', 'attention'] : [type])
function query(text = '', type = 'all') {
  return { text, projects: [], states: states(type), jql: '', mode: 'basic' }
}
function locationFor({ text = '', type = 'all', number = 1, size = 20 } = {}) {
  return `${base}#inbox?${new URLSearchParams({
    q: text,
    inboxType: type,
    page: String(number),
    pageSize: String(size),
  })}`
}
function expected({ text = '', type = 'all', number = 1, size = 20 } = {}) {
  return read(
    `/tasks/query?${new URLSearchParams({
      query: JSON.stringify(query(text, type)),
      sorts: '[]',
      page: String(number),
      page_size: String(size),
    })}`,
  )
}
async function matches(response) {
  const ids = response.items.map((item) => item.task.id)
  await page.waitForFunction(
    ({ ids, total }) => {
      const view = document.querySelector('[data-testid="inbox-view"]')
      if (!view || view.getAttribute('aria-busy') === 'true') return false
      return (
        JSON.stringify(
          [...view.querySelectorAll('[data-inbox-task]')].map((item) =>
            item.getAttribute('data-inbox-task'),
          ),
        ) === JSON.stringify(ids) &&
        view
          .querySelector('[data-testid="inbox-range"]')
          ?.textContent.includes(`/ ${total}`)
      )
    },
    { ids, total: response.total },
  )
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  report.screenshots.push(`${name}.png`)
}
try {
  await page.goto(base)
  const status = await page.evaluate(async () => {
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workbench-Request': '1',
      },
      body: JSON.stringify({ token: 'astryx-browser-fixture' }),
    })
    return r.status
  })
  assert.equal(status, 200)
  await page.reload()
  const before = await read('/bootstrap')
  assert.equal(before.capabilities.task_query, true)
  assert.equal(before.capabilities.task_detail, true)
  assert.deepEqual(
    [
      before.projects.length,
      before.tasks.length,
      before.runs.length,
      before.models.length,
    ],
    [45, 45, 88, 0],
  )
  const first = await expected()
  assert.equal(first.total, 44)
  assert.equal(first.items.length, 20)
  assert.ok(
    !first.items.some((item) => item.task.id === 'reference-task-000-0'),
  )
  const pending = await expected({ type: 'pending' })
  const attention = await expected({ type: 'attention' })
  assert.equal(pending.total, 1)
  assert.equal(attention.total, 43)
  record(
    'Existing Task query API gives44 Inbox Tasks (43 attention+1 pending), excluding recovered latest-success Task and88 Run denominator',
  )
  await page.goto(locationFor())
  await matches(first)
  const detail = page.locator('.wb-inbox-detail')
  await detail.getByText(first.items[0].task.goal, { exact: true }).waitFor()
  assert.ok(
    report.details.some((path) => path.includes(first.items[0].task.id)),
  )
  const exactDetail = await read(
    `/tasks/${first.items[0].task.id}/detail?page=1&page_size=20`,
  )
  await detail.getByRole('link', { name: 'Open run', exact: true }).waitFor()
  assert.equal(
    await detail
      .getByRole('link', { name: 'Open run', exact: true })
      .getAttribute('href'),
    `#run/${exactDetail.item.latest_run.id}`,
  )
  await shot('actual-inbox-first')
  record(
    'Production list preserves exact server page; desktop reads only selected task details and links exact fresh latestRun',
  )
  await page.locator('[data-inbox-page="next"]').click()
  const second = await expected({ number: 2 })
  await matches(second)
  await page.reload()
  await matches(second)
  await shot('actual-inbox-second')
  record('Page2 uses globally ordered20 items and survives reload')
  await page.locator('[data-inbox-page="next"]').click()
  await matches(await expected({ number: 3 }))
  await page.waitForFunction(() =>
    document.activeElement?.matches('[data-inbox-page="previous"]'),
  )
  await page.goBack()
  await matches(second)
  record(
    'Last page contains4 items and restores available Previous focus; Back restores page2',
  )
  const capacity = page.getByRole('combobox', {
    name: 'Inbox items per page',
    exact: true,
  })
  await capacity.click()
  await page.getByRole('option', { name: '50 / page', exact: true }).click()
  await matches(await expected({ size: 50 }))
  assert.equal(await page.locator('[data-inbox-task]').count(), 44)
  await capacity.click()
  await page.getByRole('option', { name: '100 / page', exact: true }).click()
  await matches(await expected({ size: 100 }))
  record(
    'Real50/100 capacities reset page and return all44 matched Tasks, not a sliced20-row cache',
  )
  const input = page.getByRole('searchbox', {
    name: 'Search inbox',
    exact: true,
  })
  await input.fill('reference-task-000-1')
  await page.getByRole('radio', { name: 'Not started', exact: true }).click()
  await matches(await expected({ type: 'pending', size: 100 }))
  assert.equal(await input.inputValue(), 'reference-task-000-1')
  await input.press('Enter')
  await matches(
    await expected({
      text: 'reference-task-000-1',
      type: 'pending',
      size: 100,
    }),
  )
  await detail
    .getByRole('button', { name: 'Review & run', exact: true })
    .waitFor()
  await detail.getByText('No real model execution', { exact: true }).waitFor()
  await page.reload()
  await matches(
    await expected({
      text: 'reference-task-000-1',
      type: 'pending',
      size: 100,
    }),
  )
  record(
    'Immediate type scope preserves search draft; Enter commits exact TaskID and fresh pending detail retains full acceptance',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'zh'))
  await page.goto(locationFor({ number: 2 }))
  await page.reload()
  await matches(second)
  await page.getByRole('heading', { name: '待处理', exact: true }).waitFor()
  const readsBeforeSelection = report.details.length
  await page.waitForTimeout(300)
  assert.equal(report.details.length, readsBeforeSelection)
  assert.equal(await page.locator('.wb-inbox-detail').count(), 0)
  const trigger = page.locator('[data-inbox-task]').first()
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByText(second.items[0].task.goal, { exact: true }).waitFor()
  assert.equal(report.details.length, readsBeforeSelection + 1)
  await shot('actual-inbox-mobile-details')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute('data-inbox-task') === id,
    second.items[0].task.id,
  )
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    footer: document
      .querySelector('[data-testid="inbox-range"]')
      ?.getBoundingClientRect().bottom,
    height: innerHeight,
  }))
  assert.ok(geometry.overflow <= 1, JSON.stringify(geometry))
  assert.ok(geometry.footer <= geometry.height + 1, JSON.stringify(geometry))
  await shot('actual-inbox-mobile')
  record(
    '390px Chinese Inbox reads details only after selection, shares one dialog body and restores visible trigger focus without document overflow',
  )
  const after = await read('/bootstrap')
  for (const key of ['projects', 'tasks', 'runs', 'models'])
    assert.deepEqual(after[key], before[key], key)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.blocked, [])
  assert.deepEqual(report.external, [])
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  record(
    'Original business arrays unchanged; only public fixture login POST, no model, review preview or execution request',
  )
} catch (error) {
  report.failure = error.stack
  await page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
