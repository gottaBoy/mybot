import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_BOARD_ACTUAL_EVIDENCE_DIR ?? '/tmp/mybot-task-board-actual',
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
const query = { text: '', projects: [], states: [], jql: '', mode: 'basic' }
const pages = () => ({
  pending: 1,
  active: 1,
  attention: 1,
  completed: 1,
  other: 1,
})
const project = 'reference-project-000'
const recoveredTask = 'reference-task-000-0'
const latestRun = 'reference-run-000-0-044'
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
function params(q = query, p = pages(), scope) {
  const value = new URLSearchParams({
    query: JSON.stringify(q),
    pages: JSON.stringify(p),
  })
  if (scope) value.set('scope_project_id', scope)
  return value
}
const expected = (q = query, p = pages(), scope) =>
  read(`/tasks/board?${params(q, p, scope)}`)
function url(q = query, p = pages(), scope) {
  const value = new URLSearchParams({
    view: 'board',
    q: q.text,
    states: JSON.stringify(q.states),
    projects: JSON.stringify(q.projects),
    boardPages: JSON.stringify(p),
  })
  return `${base}#${scope ? `project/${scope}` : 'workbench'}?${value}`
}
const column = (state) => page.locator(`[data-board-state="${state}"]`)
async function matches(
  response,
  visible = ['pending', 'active', 'attention', 'completed'],
) {
  await page.waitForFunction(
    ({ response, visible }) => {
      const board = document.querySelector('[data-testid="task-board"]')
      if (!board || board.getAttribute('aria-busy') === 'true') return false
      if (
        document.querySelector('.wf-result-count')?.textContent.trim() !==
        `${response.total} tasks`
      )
        return false
      return response.columns
        .filter((c) => visible.includes(c.state_category))
        .every((c) => {
          const section = board.querySelector(
            `[data-board-state="${c.state_category}"]`,
          )
          const ids = [
            ...(section?.querySelectorAll('[data-board-task]') ?? []),
          ].map((card) => card.getAttribute('data-board-task'))
          return (
            JSON.stringify(ids) ===
            JSON.stringify(c.items.map((item) => item.task.id))
          )
        })
    },
    { response, visible },
  )
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  report.screenshots.push(`${name}.png`)
}
try {
  await page.goto(base)
  const login = await page.evaluate(async () => {
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
  assert.equal(login, 200)
  await page.reload()
  const before = await read('/bootstrap')
  assert.equal(before.capabilities.task_board, true)
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
  assert.equal(first.total, 45)
  assert.deepEqual(
    first.columns.map((c) => c.total),
    [1, 0, 43, 1, 0],
  )
  assert.deepEqual(
    first.columns.map((c) => c.items.length),
    [1, 0, 20, 1, 0],
  )
  const completed = first.columns.find((c) => c.state_category === 'completed')
    .items[0]
  assert.equal(completed.task.id, recoveredTask)
  assert.equal(completed.latest_run.id, latestRun)
  assert.equal(completed.attempts, 45)
  assert.deepEqual(
    first.columns[0].items[0].task,
    before.tasks.find((t) => t.id === 'reference-task-000-1'),
  )
  record(
    'Actual snapshot returns45 Task-latest records,43 attention/1 pending/1 completed, not88 historical Runs',
  )
  await page.goto(url())
  await matches(first)
  assert.equal(
    await column('attention').locator('.wb-work-card > p').first().innerText(),
    first.columns.find((c) => c.state_category === 'attention').items[0].task.goal,
  )
  assert.equal(
    await column('attention').getByTestId('task-board-range').innerText(),
    '1-20 / 43',
  )
  assert.equal(
    await column('completed').locator(`a[href="#run/${latestRun}"]`).count(),
    2,
  )
  assert.equal(
    await column('attention')
      .locator(`[data-board-task="${recoveredTask}"]`)
      .count(),
    0,
  )
  await shot('actual-board-first')
  record(
    'Production cards preserve exact API identities, full Task goal and recovered latest-success classification',
  )
  const secondPages = { ...pages(), attention: 2 }
  const second = await expected(query, secondPages)
  await column('attention').locator('[data-board-page="next"]').click()
  await matches(second)
  assert.equal(
    await column('attention').getByTestId('task-board-range').innerText(),
    '21-40 / 43',
  )
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(
        new URLSearchParams(location.hash.split('?')[1]).get('boardPages'),
      ),
    ),
    secondPages,
  )
  await page.reload()
  await matches(second)
  await shot('actual-board-second')
  record(
    'Independent attention page2 holds20 globally ordered cards; URL/reload retain other column pages',
  )
  const lastPages = { ...pages(), attention: 3 }
  const last = await expected(query, lastPages)
  await column('attention').locator('[data-board-page="next"]').click()
  await matches(last)
  assert.equal(
    await column('attention').getByTestId('task-board-range').innerText(),
    '41-43 / 43',
  )
  await page.waitForFunction(() =>
    document.activeElement?.matches(
      '[data-board-state="attention"] [data-board-page="previous"]',
    ),
  )
  await page.goBack()
  await matches(second)
  record(
    'Last column page contains3 cards, restores available Previous focus, and Back restores page2',
  )
  const scoped = await expected(query, pages(), project)
  assert.equal(scoped.total, 2)
  assert.deepEqual(
    scoped.columns.map((c) => c.total),
    [1, 0, 0, 1, 0],
  )
  await page.goto(url(query, pages(), project))
  await matches(scoped)
  await shot('actual-board-project')
  record(
    'Fixed project000 contains2 Tasks with0 attention despite15 historic failed Runs; board keeps Task denominator',
  )
  const input = page.locator('.wf-querybar').getByRole('searchbox')
  await input.fill('reference-task-000-1')
  assert.equal(await column('pending').locator('[data-board-task]').count(), 1)
  assert.equal(await page.locator('.wf-result-count').innerText(), '2 tasks')
  await input.press('Enter')
  const searched = await expected(
    { ...query, text: 'reference-task-000-1' },
    pages(),
    project,
  )
  await matches(searched)
  assert.equal(searched.total, 1)
  await page.reload()
  await matches(searched)
  record(
    'Search draft leaves committed cards unchanged; Enter resets all board pages and reload keeps exact Task search',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'zh'))
  await page.goto(url(query, secondPages))
  await page.reload()
  await page.getByRole('heading', { name: '任务', exact: true }).waitFor()
  await page.waitForFunction(() => {
    const board = document.querySelector('[data-testid="task-board"]')
    return (
      board &&
      board.getAttribute('aria-busy') !== 'true' &&
      document
        .querySelector(
          '[data-board-state="attention"] [data-testid="task-board-range"]',
        )
        ?.textContent.trim() === '21-40 / 43'
    )
  })
  await column('attention').scrollIntoViewIfNeeded()
  const geometry = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="task-board"]')
    const cards = document.querySelector(
      '[data-board-state="attention"] .wb-board-cards',
    )
    const footer = document.querySelector(
      '[data-board-state="attention"] footer',
    )
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      horizontal: board.scrollWidth > board.clientWidth,
      vertical: cards.scrollHeight > cards.clientHeight,
      footerBottom: footer.getBoundingClientRect().bottom,
      height: innerHeight,
    }
  })
  assert.ok(geometry.overflow <= 1, JSON.stringify(geometry))
  assert.ok(geometry.horizontal && geometry.vertical)
  assert.ok(
    geometry.footerBottom <= geometry.height + 1,
    JSON.stringify(geometry),
  )
  await shot('actual-board-mobile-zh')
  record(
    '390px Chinese board uses the same exact pages with local horizontal/card scrolling and visible footer, no document overflow',
  )
  const after = await read('/bootstrap')
  for (const key of ['projects', 'tasks', 'runs', 'models'])
    assert.deepEqual(after[key], before[key], key)
  assert.deepEqual(report.blocked, [])
  assert.deepEqual(report.external, [])
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [{ path: '/api/auth', method: 'POST' }])
  record(
    'All original business arrays remain unchanged; only public fixture login POST, no execution or model calls',
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
