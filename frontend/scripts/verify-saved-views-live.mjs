import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'A disposable API fixture is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.SAVED_VIEWS_LIVE_EVIDENCE_DIR ?? '/tmp/mybot-saved-views-live',
)
const { chromium } = await import(
  pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('mybot.locale', 'en')
  localStorage.setItem('mybot.mode', 'light')
  localStorage.setItem('mybot.style', 'neutral')
})
const evidence = {
  fixture: true,
  transport: 'real local API/SQLite, no provider commands',
  checks: [],
  errors: [],
  requests: [],
  screenshots: [],
  lostCreation: null,
}
await mkdir(out, { recursive: true })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.protocol.startsWith('http') && url.origin !== origin
    ? route.abort()
    : route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) =>
  evidence.errors.push({ message: error.message, stack: error.stack }),
)
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/'))
    evidence.requests.push({ method: request.method(), path: url.pathname })
})
function record(name) {
  evidence.checks.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
async function request(path, body, method, expected = 200) {
  const response = await page.evaluate(
    async ({ path, body, method }) => {
      const response = await fetch(`/api${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, body: await response.json() }
    },
    { path, body, method },
  )
  assert.equal(response.status, expected, JSON.stringify(response))
  return response.body
}
async function poll(read, expected, name) {
  for (let index = 0; index < 120; index++) {
    if (JSON.stringify(await read()) === JSON.stringify(expected)) return
    await new Promise((done) => setTimeout(done, 50))
  }
  assert.deepEqual(await read(), expected, name)
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: false })
  evidence.screenshots.push(`${name}.png`)
}
async function views() {
  await page.getByRole('button', { name: 'Views', exact: true }).click()
  await page.getByRole('menu').waitFor()
}
function viewEditor(title = 'Save view') {
  return page
    .getByRole('dialog', { name: title, exact: true })
    .or(page.getByRole('alertdialog', { name: title, exact: true }))
}
async function create(name, command = 'Save current view') {
  await views()
  await page.getByRole('menuitem', { name: command, exact: true }).click()
  const dialog = viewEditor()
  await dialog.getByRole('textbox', { name: /View name/ }).fill(name)
  await dialog.getByRole('button', { name: 'Save view', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}
async function readPage(scope = 'scope_type=workspace') {
  return request(`/saved-views?${scope}`)
}
async function pick(name) {
  await views()
  await page.getByRole('menuitem', { name, exact: true }).click()
  await page.getByText('View snapshot loaded.', { exact: true }).waitFor()
}
function query() {
  return new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '')
}
try {
  await page.goto(base)
  await request('/auth', { token: 'astryx-browser-fixture' })
  await page.reload()
  const before = await request('/bootstrap')
  assert.match(
    before.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.ok(
    !before.projects.some(
      (project) => project.name === 'Live saved views Alpha',
    ),
  )
  const runCount = before.runs.length
  const alpha = await request(
    '/projects',
    {
      name: 'Live saved views Alpha',
      directory: '.',
      goal: 'Isolated configuration acceptance.',
    },
    undefined,
    201,
  )
  const beta = await request(
    '/projects',
    {
      name: 'Live saved views Beta',
      directory: '.',
      goal: 'Isolated scope acceptance.',
    },
    undefined,
    201,
  )
  for (const [project, prefix] of [
    [alpha, 'Alpha'],
    [beta, 'Beta'],
  ]) {
    for (const number of ['01', '02'])
      await request(
        '/tasks',
        {
          project_id: project.id,
          title: `${prefix} release ${number}`,
          goal: 'Verify saved views without executing a provider.',
          files: [],
        },
        undefined,
        201,
      )
  }
  await page.reload()
  await page.getByRole('table', { name: 'Tasks', exact: true }).waitFor()
  const seed = new URLSearchParams({
    q: 'Alpha',
    project: alpha.id,
    states: JSON.stringify(['pending']),
    pageSize: '50',
    order: 'title:descending',
    view: 'list',
  })
  await page.goto(`${base}#workbench?${seed}`)
  const table = page.getByRole('table', { name: 'Tasks', exact: true })
  await table.waitFor()
  await poll(
    () => table.locator('tbody tr').count(),
    2,
    'Only Alpha candidates',
  )
  await page.getByRole('button', { name: 'Columns', exact: true }).click()
  await page
    .getByRole('menuitemcheckbox', { name: 'Project', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await create('Live Alpha view')
  let directory = await readPage()
  const original = directory.items.find(
    (item) => item.name === 'Live Alpha view',
  )
  assert.ok(original)
  assert.equal(original.revision, 1)
  assert.deepEqual(original.definition.query.projects, [alpha.id])
  assert.deepEqual(original.definition.query.states, ['pending'])
  assert.equal(original.definition.table.page_size, 50)
  assert.equal(original.definition.table.columns.includes('projectName'), false)
  assert.deepEqual(original.definition.table.sorts, [
    { sortKey: 'title', direction: 'descending' },
  ])
  record(
    'Creating a saved view persists the exact committed task query and applied table settings through the real API',
  )

  await page.goto(`${base}#workbench?q=Beta`)
  await table.waitFor()
  await pick('Live Alpha view')
  await poll(() => query().get('q'), 'Alpha', 'Saved snapshot query applied')
  await poll(
    () => query().get('project'),
    alpha.id,
    'Saved snapshot project applied',
  )
  assert.equal(query().get('pageSize'), '50')
  await poll(() => table.locator('tbody tr').count(), 2, 'Saved result rows')
  assert.equal(
    await table
      .getByRole('columnheader', { name: 'Project', exact: true })
      .count(),
    0,
  )
  await shot('live-saved-view-loaded')
  record(
    'Loading a persisted record applies its query, page capacity, hidden columns and ordering without executing work',
  )

  const external = await request(
    `/saved-views/${original.id}`,
    {
      name: 'Other editor revision',
      definition: original.definition,
      expected_revision: 1,
    },
    'PUT',
  )
  assert.equal(external.revision, 2)
  await page
    .getByRole('searchbox', { name: 'Search', exact: true })
    .fill('release')
  await page
    .locator('.wf-querybar')
    .getByRole('button', { name: 'Search', exact: true })
    .click()
  await views()
  await page
    .getByRole('menuitem', { name: /^Update selected view(?:\s|$)/ })
    .click()
  let dialog = viewEditor('Update saved view')
  await dialog
    .getByRole('textbox', { name: /View name/ })
    .fill('My stale draft')
  await dialog.getByRole('button', { name: 'Save view', exact: true }).click()
  await dialog
    .getByText('The view changed. Your draft and original revision are kept.', {
      exact: true,
    })
    .waitFor()
  assert.equal(
    await dialog.getByRole('textbox', { name: /View name/ }).inputValue(),
    'My stale draft',
  )
  assert.equal(
    (await request(`/saved-views/${original.id}`)).name,
    'Other editor revision',
  )
  await shot('live-saved-view-conflict')
  record(
    'A real external revision change rejects stale update and preserves the local draft without overwriting the newer resource',
  )
  await dialog
    .getByRole('button', { name: 'Save draft as new view', exact: true })
    .click()
  dialog = viewEditor()
  await dialog.getByRole('button', { name: 'Save view', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  directory = await readPage()
  const fork = directory.items.find(
    (item) => item.name === 'My stale draft copy',
  )
  assert.ok(fork && fork.id !== original.id && fork.revision === 1)
  assert.equal(fork.definition.query.text, 'release')
  assert.equal((await request(`/saved-views/${original.id}`)).revision, 2)
  record(
    'Explicit Save as creates a distinct ID while retaining the concurrent original revision',
  )

  const deleteHref = page.url()
  await views()
  await page
    .getByRole('menuitem', { name: /^Delete selected view(?:\s|$)/ })
    .click()
  dialog = viewEditor('Delete saved view')
  await dialog.getByRole('button', { name: 'Delete view', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(page.url(), deleteHref)
  const missing = await request(
    `/saved-views/${fork.id}`,
    undefined,
    undefined,
    404,
  )
  assert.equal(missing.detail.code, 'saved_view_not_found')
  const replay = await request(`/saved-views/${fork.id}/delete`, {
    expected_revision: 1,
  })
  assert.equal(replay.deleted, true)
  assert.equal(replay.revision, 2)
  const recreate = await request(
    '/saved-views',
    {
      id: fork.id,
      name: fork.name,
      scope_type: fork.scope_type,
      project_id: fork.project_id,
      definition: fork.definition,
    },
    undefined,
    409,
  )
  assert.equal(recreate.detail.code, 'saved_view_deleted')
  record(
    'Deletion uses revision checks, repeats safely and cannot resurrect a tombstoned ID or change the current literal query',
  )

  let dropped = false
  await context.route('**/api/saved-views', async (route) => {
    const request = route.request()
    if (
      request.method() !== 'POST' ||
      dropped ||
      request.postDataJSON().name !== 'Lost create receipt'
    )
      return route.continue()
    dropped = true
    const body = request.postDataJSON()
    const response = await route.fetch({ maxRedirects: 0 })
    assert.equal(response.status(), 201)
    const saved = await response.json()
    assert.equal(saved.id, body.id)
    evidence.lostCreation = { id: body.id, revision: saved.revision }
    await route.abort('failed')
  })
  await views()
  await page
    .getByRole('menuitem', { name: 'Save as new view', exact: true })
    .click()
  dialog = viewEditor()
  await dialog
    .getByRole('textbox', { name: /View name/ })
    .fill('Lost create receipt')
  await dialog.getByRole('button', { name: 'Save view', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'Read current resource', exact: true })
    .waitFor()
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Save view', exact: true })
      .getAttribute('aria-disabled'),
    'true',
  )
  const posts = evidence.requests.filter(
    (item) => item.method === 'POST' && item.path === '/api/saved-views',
  ).length
  await dialog
    .getByRole('button', { name: 'Read current resource', exact: true })
    .click()
  await dialog
    .getByText(/not an exact receipt for the original request/)
    .waitFor()
  assert.equal(
    evidence.requests.filter(
      (item) => item.method === 'POST' && item.path === '/api/saved-views',
    ).length,
    posts,
  )
  assert.equal(
    (await request(`/saved-views/${evidence.lostCreation.id}`)).revision,
    1,
  )
  await shot('live-saved-view-lost-response')
  await dialog
    .getByRole('button', { name: 'Acknowledge current state', exact: true })
    .click()
  await dialog.waitFor({ state: 'hidden' })
  await page.reload()
  assert.equal(
    evidence.requests.filter(
      (item) => item.method === 'POST' && item.path === '/api/saved-views',
    ).length,
    posts,
  )
  directory = await readPage()
  assert.equal(
    directory.items.filter((item) => item.id === evidence.lostCreation.id)
      .length,
    1,
  )
  record(
    'Lost real creation response locks replay and reads only the stable ID; current-state acknowledgement is not presented as an exact mutation receipt',
  )

  await page.goto(`${base}#project/${alpha.id}?project=${beta.id}&view=list`)
  await page
    .getByRole('heading', { name: 'Live saved views Alpha', exact: true })
    .waitFor()
  await table.waitFor()
  await create('Live fixed Alpha view')
  const scoped = await readPage(`scope_type=project&project_id=${alpha.id}`)
  assert.equal(scoped.items.length, 1)
  assert.deepEqual(scoped.items[0].definition.query.projects, [alpha.id])
  assert.equal(scoped.items[0].scope_type, 'project')
  assert.equal(
    (await readPage(`scope_type=project&project_id=${beta.id}`)).total,
    0,
  )
  assert.equal(
    (await readPage()).items.some((item) => item.id === scoped.items[0].id),
    false,
  )
  record(
    'Project view persistence keeps the fixed route scope and separate workspace/project directories',
  )
  assert.equal((await request('/bootstrap')).runs.length, runCount)
  assert.equal(
    evidence.requests.some(
      (item) =>
        item.method !== 'GET' &&
        (/\/runs(?:\/|$)/.test(item.path) ||
          /\/models\/.+\/test$/.test(item.path)),
    ),
    false,
  )
  assert.deepEqual(evidence.errors, [])
  record(
    'The entire actual saved-view workflow leaves Run counts unchanged and never sends a model/test/control command',
  )
} catch (error) {
  evidence.failure = {
    message: error.message,
    stack: error.stack,
    url: page.url(),
  }
  await shot('saved-views-live-failure').catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  await browser.close()
}
