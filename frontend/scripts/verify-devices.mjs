import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.DEVICE_EVIDENCE_DIR ?? '/tmp/mybot-devices')
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
})
const report = {
  fixture: true,
  checks: [],
  errors: [],
  external: [],
  writes: [],
  geometry: [],
}
const record = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function setup(width, locale = 'en') {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  })
  await context.addInitScript(
    (locale) => localStorage.setItem('mybot.locale', locale),
    locale,
  )
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
      report.writes.push({
        path: url.pathname,
        method: request.method(),
        width,
      })
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (
      url.protocol.startsWith('http') &&
      url.origin !== new URL(base).origin
    ) {
      report.external.push(url.origin)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => report.errors.push(error.message))
  return { context, page }
}
async function api(page, path, body) {
  return page.evaluate(
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
      const value = await response.json()
      if (!response.ok)
        throw new Error(`${response.status}:${JSON.stringify(value)}`)
      return value
    },
    { path, body },
  )
}
async function poll(check, label) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${label}`)
}
const owner = await setup(1440)
const companion = await setup(390)
let code
try {
  await owner.page.goto(base)
  await api(owner.page, '/auth', { token: 'astryx-browser-fixture' })
  const empty = await api(owner.page, '/bootstrap')
  assert.deepEqual(
    [
      empty.projects.length,
      empty.tasks.length,
      empty.models.length,
      empty.runs.length,
    ],
    [0, 0, 0, 0],
  )
  assert.equal(empty.capabilities.device_continuation, true)
  const project = await api(owner.page, '/projects', {
    name: 'Device continuation fixture',
    goal: 'Task-scoped sharing',
    directory: '.',
    notes: 'Unshared notes: fixture-private-project-notes',
  })
  const task = await api(owner.page, '/tasks', {
    project_id: project.id,
    title: 'Continue one real Task across browsers',
    goal: 'Verify paired devices continue a Task without granting model execution.',
    acceptance:
      'Scope, revocation and exact message receipts remain verifiable.',
    files: ['README.md'],
  })
  const other = await api(owner.page, '/tasks', {
    project_id: project.id,
    title: 'Unshared fixture Task',
    goal: 'This goal must never reach the paired device.',
    files: [],
  })
  await owner.page.goto(`${base}#devices?task=${task.id}`)
  await owner.page.reload()
  await owner.page
    .getByRole('heading', { name: 'Device continuation', exact: true })
    .waitFor()
  await owner.page
    .getByRole('textbox', { name: /^Invitation label/ })
    .fill('My fixture phone')
  await owner.page
    .getByRole('button', { name: 'Create pairing code', exact: true })
    .click()
  const grant = owner.page.getByRole('dialog', {
    name: 'Authorize task device',
    exact: true,
  })
  await grant.getByRole('checkbox').check()
  await owner.page.route('**/api/devices/pairings', async route => {
    await route.fetch()
    await route.abort()
  })
  await grant
    .getByRole('button', { name: 'Confirm pairing', exact: true })
    .click()
  await owner.page.getByText('The write outcome is unconfirmed. Check the original request; it will not be resent automatically.', { exact: true }).waitFor()
  await owner.page.unroute('**/api/devices/pairings')
  const pairWrites = report.writes.filter(item => item.path === '/api/devices/pairings').length
  await owner.page.getByRole('button', { name: 'Check original request', exact: true }).click()
  const codeField = owner.page.getByLabel(/^Pairing code/)
  await codeField.waitFor()
  code = await codeField.inputValue()
  assert.match(code, /^[A-Za-z0-9_-]{8,100}\.[A-Za-z0-9_-]{43}$/)
  assert.ok(!owner.page.url().includes(code))
  assert.equal(report.writes.filter(item => item.path === '/api/devices/pairings').length, pairWrites)
  record('Owner recovers a lost invitation-creation response by its exact receipt while the original code remains only in memory')
  await owner.page
    .getByRole('button', { name: 'Close code', exact: true })
    .click()
  assert.equal((await api(owner.page, '/devices')).total, 0)
  record(
    'Owner explicitly authorizes one Task; invitation does not create a device, preview context or Run',
  )
  await owner.page.screenshot({
    path: resolve(out, 'owner-invitation-created.png'),
    fullPage: true,
  })

  await companion.page.goto(`${base}#pair`)
  await companion.page.getByLabel(/^Pairing code/).fill(code)
  await companion.page
    .getByRole('textbox', { name: /^Device name/ })
    .fill('Fixture mobile browser with a long device name 研发手机与平板接续验证')
  await companion.page.route('**/api/device/claim', async route => {
    await route.fetch()
    await route.abort()
  })
  await companion.page
    .getByRole('button', { name: 'Pair device', exact: true })
    .click()
  await companion.page.getByText('The pairing outcome is unconfirmed. Check the device session; it will not be retried automatically.', { exact: true }).waitFor()
  await companion.page.unroute('**/api/device/claim')
  const claimPosts = report.writes.filter(item => item.path === '/api/device/claim').length
  await companion.page.getByRole('button', { name: 'Check pairing result', exact: true }).click()
  const paired = companion.page.getByTestId('paired-task')
  await paired.getByRole('heading', { name: task.title, exact: true }).waitFor()
  const session = await api(companion.page, '/device/session')
  assert.equal(session.device.task_id, task.id)
  assert.deepEqual(session.device.scopes, ['task_read', 'message_save'])
  assert.equal((await api(owner.page, '/devices')).total, 1)
  assert.equal(report.writes.filter(item => item.path === '/api/device/claim').length, claimPosts)
  const cookies = await companion.context.cookies()
  const deviceCookie = cookies.find((item) => item.name === 'workbench_device')
  assert.equal(deviceCookie.httpOnly, true)
  assert.equal(deviceCookie.sameSite, 'Strict')
  assert.equal(
    await companion.page.evaluate(() =>
      document.cookie.includes('workbench_device'),
    ),
    false,
  )
  const snapshot = await api(companion.page, '/device/task')
  const serialized = JSON.stringify(snapshot)
  assert.ok(!serialized.includes(other.goal))
  assert.ok(!serialized.includes('fixture-private-project-notes'))
  assert.ok(!serialized.includes('FILE README'))
  assert.ok(!serialized.includes(code.split('.')[1]))
  record(
    'Second isolated browser receives an HttpOnly scoped identity and only the granted Task snapshot',
  )
  record('Lost claim response is reconciled through the exact cookie-backed session without repeating the claim POST')
  await companion.page.screenshot({
    path: resolve(out, 'paired-mobile-task.png'),
    fullPage: true,
  })
  code = undefined

  const denials = await companion.page.evaluate(async (otherId) => {
    const checks = [
      ['/api/bootstrap', 'GET'],
      [`/api/tasks/${otherId}/detail`, 'GET'],
      ['/api/models', 'POST'],
      [`/api/tasks/${otherId}/runs`, 'POST'],
      ['/api/workflows/local-research', 'GET'],
      ['/api/devices', 'GET'],
    ]
    const results = []
    for (const [path, method] of checks)
      results.push(
        (
          await fetch(path, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'X-Workbench-Request': '1',
            },
            ...(method === 'POST' ? { body: '{}' } : {}),
          })
        ).status,
      )
    return results
  }, other.id)
  assert.deepEqual(denials, [403, 403, 403, 403, 403, 403])
  const auth = await api(companion.page, '/auth/state')
  assert.equal(auth.authenticated, false)
  record(
    'A paired cookie cannot inherit local-owner authority, read other Tasks or invoke model/control/config endpoints',
  )

  const content =
    'Phone supplement: prioritize exact scope and explain the unresolved cost boundary.'
  await companion.page
    .getByRole('textbox', { name: 'Supplemental requirements', exact: true })
    .fill(content)
  await companion.page
    .getByRole('button', { name: 'Save requirement', exact: true })
    .click()
  await paired.getByText(content, { exact: true }).waitFor()
  await owner.page.goto(`${base}#task/${task.id}?taskTab=conversation`)
  await owner.page.reload()
  await owner.page
    .locator('.wb-task-message-content')
    .filter({ hasText: content })
    .waitFor()
  assert.equal((await api(owner.page, '/bootstrap')).runs.length, 0)
  const turns = await api(owner.page, `/tasks/${task.id}/turns`)
  assert.equal(turns.items[0].state, 'saved')
  record(
    'The paired device saves a real immutable requirement in the owner Task conversation without creating a Run',
  )

  const lostText =
    'Lost response supplement: keep the same request and reconcile by GET.'
  await companion.page.route('**/api/device/messages', async (route) => {
    await route.fetch()
    await route.abort()
  })
  await companion.page
    .getByRole('textbox', { name: 'Supplemental requirements', exact: true })
    .fill(lostText)
  await companion.page
    .getByRole('button', { name: 'Save requirement', exact: true })
    .click()
  await companion.page
    .getByText('The save outcome is unconfirmed. Check the original message; it will not be resent automatically.', { exact: true })
    .waitFor()
  await companion.page.unroute('**/api/device/messages')
  const beforeReceipt = report.writes.filter(
    (item) => item.path === '/api/device/messages',
  ).length
  await companion.page
    .getByRole('button', { name: 'Check save receipt', exact: true })
    .click()
  await paired.getByText(lostText, { exact: true }).waitFor()
  assert.equal(
    report.writes.filter((item) => item.path === '/api/device/messages').length,
    beforeReceipt,
  )
  assert.equal((await api(owner.page, `/tasks/${task.id}/turns`)).total, 2)
  record(
    'A lost save response resolves through the exact original receipt without another message POST',
  )

  const model = await api(owner.page, '/models', {
    name: 'Device fixture FakeProvider',
    endpoint: 'http://127.0.0.1:9999/v1',
    model: 'fixture-only',
  })
  const context = await api(owner.page, `/tasks/${task.id}/preview`, {})
  const run = await api(owner.page, `/tasks/${task.id}/runs`, {
    coordinator_model: model.id,
    researcher_model: model.id,
    reviewer_model: model.id,
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
    request_id: crypto.randomUUID(),
    context_hash: context.context_hash,
    consent: true,
  })
  await poll(async () => {
    const current = await api(companion.page, '/device/task')
    return (
      current.latest_run?.id === run.id &&
      current.latest_run.status === 'succeeded' &&
      current.report !== null
    )
  }, 'actual fixture Run and report')
  record(
    'The companion observes the owner-started FakeProvider Run and report through its bounded Task projection',
  )

  let offline = true
  await companion.page.route('**/api/device/events?*', (route) =>
    offline ? route.abort() : route.continue(),
  )
  await companion.page.reload()
  await paired.getByRole('heading', { name: task.title, exact: true }).waitFor()
  await companion.page.getByText('The connection was interrupted and content may be stale. Refreshing does not resend messages.', { exact: true }).waitFor({ timeout: 30000 })
  const ownerMessage =
    'Owner update during disconnect; resume by incremental read only.'
  await api(owner.page, `/tasks/${task.id}/turns`, {
    request_id: crypto.randomUUID(),
    content: ownerMessage,
  })
  const reconnectWrites = report.writes.filter(
    (item) => item.width === 390,
  ).length
  offline = false
  await companion.page.getByRole('button', { name: 'Refresh task', exact: true }).click()
  await paired
    .getByText(ownerMessage, { exact: true })
    .waitFor({ timeout: 30000 })
  assert.equal(
    report.writes.filter((item) => item.width === 390).length,
    reconnectWrites,
  )
  const progressed = await api(companion.page, '/device/task')
  const events = await api(
    companion.page,
    `/device/events?after=${snapshot.cursor}`,
  )
  assert.equal(events.device_id, session.device.id)
  assert.equal(events.task_id, task.id)
  assert.ok(events.items.every((item) => !('payload' in item)))
  assert.ok(progressed.cursor > snapshot.cursor)
  record(
    'The cookie survives reload and GET-only event/snapshot reconciliation catches up after a simulated disconnect',
  )

  for (const [style, mode, width, locale] of [
    ['neutral', 'light', 1440, 'en'],
    ['neutral', 'dark', 390, 'zh'],
    ['zira', 'light', 1440, 'zh'],
    ['zira', 'dark', 390, 'en'],
    ['y2k', 'light', 1440, 'en'],
    ['y2k', 'dark', 390, 'zh'],
  ]) {
    await companion.page.evaluate(
      (options) => {
        for (const [key, value] of Object.entries(options))
          localStorage.setItem(`mybot.${key}`, value)
      },
      { style, mode, locale },
    )
    await companion.page.setViewportSize({ width, height: 900 })
    const count = report.writes.length
    await companion.page.reload()
    await paired
      .getByRole('heading', { name: task.title, exact: true })
      .waitFor()
    const geometry = await companion.page
      .locator('.wb-theme')
      .evaluate((element) => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        color: getComputedStyle(element).color,
        background: getComputedStyle(element).backgroundColor,
        font: getComputedStyle(element).fontFamily,
      }))
    assert.ok(geometry.overflow <= 1)
    assert.equal(report.writes.length, count)
    report.geometry.push({ style, mode, width, locale, ...geometry })
    await companion.page.screenshot({
      path: resolve(out, `paired-${style}-${mode}-${width}.png`),
      fullPage: true,
    })
  }
  record(
    'One scoped Task tree renders three styles in both modes on desktop and Chinese/English390px without writes or overflow',
  )

  await owner.page.goto(`${base}#devices`)
  await owner.page.reload()
  const row = owner.page.locator(`[data-device-id="${session.device.id}"]`)
  await row.getByRole('button', { name: 'Revoke device', exact: true }).click()
  const revoke = owner.page.getByRole('dialog', {
    name: 'Revoke device access',
    exact: true,
  })
  await revoke.getByRole('checkbox').check()
  await owner.page.route(`**/api/devices/${session.device.id}/revoke`, async route => {
    await route.fetch()
    await route.abort()
  })
  await revoke
    .getByRole('button', { name: 'Confirm revocation', exact: true })
    .click()
  await owner.page.getByText('The write outcome is unconfirmed. Check the original request; it will not be resent automatically.', { exact: true }).waitFor()
  await owner.page.unroute(`**/api/devices/${session.device.id}/revoke`)
  const revokePosts = report.writes.filter(item => item.path.endsWith('/revoke')).length
  await owner.page.getByRole('button', { name: 'Check original request', exact: true }).click()
  await owner.page.getByText('Device access revoked. Previously saved messages remain.', { exact: true }).waitFor()
  assert.equal(report.writes.filter(item => item.path.endsWith('/revoke')).length, revokePosts)
  record('A lost revocation response resolves by the exact operation receipt without a duplicate revoke')
  await poll(
    async () =>
      (await api(owner.page, '/devices')).items[0].revoked_at !== null,
    'revocation',
  )
  await poll(
    async () => (await api(companion.page, '/device/session')).device === null,
    'revoked session',
  )
  await companion.page.reload()
  await companion.page
    .getByLabel(/配对码|Pairing code/)
    .waitFor()
  assert.equal(await paired.count(), 0)
  const deniedAfterRevoke = await companion.page.evaluate(async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Workbench-Request': '1',
    }
    return [
      (await fetch('/api/device/task')).status,
      (
        await fetch('/api/device/messages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            request_id: 'revoked-request-id',
            content: 'Must be denied',
          }),
        })
      ).status,
      (await fetch('/api/bootstrap')).status,
    ]
  })
  assert.deepEqual(deniedAfterRevoke, [401, 401, 403])
  assert.equal((await api(owner.page, `/tasks/${task.id}/turns`)).total, 3)
  assert.equal((await api(owner.page, '/bootstrap')).runs.length, 1)
  await owner.page.screenshot({
    path: resolve(out, 'owner-revoked-device.png'),
    fullPage: true,
  })
  record(
    'Owner revocation clears private companion content and denies subsequent reads/writes without deleting saved messages',
  )
  for (const [style, mode, width, locale] of [
    ['neutral', 'light', 1440, 'en'], ['neutral', 'dark', 390, 'zh'],
    ['zira', 'light', 1440, 'zh'], ['zira', 'dark', 390, 'en'],
    ['y2k', 'light', 1440, 'en'], ['y2k', 'dark', 390, 'zh'],
  ]) {
    await owner.page.evaluate(options => {
      for (const [key, value] of Object.entries(options)) localStorage.setItem(`mybot.${key}`, value)
    }, { style, mode, locale })
    await owner.page.setViewportSize({ width, height: 900 })
    const count = report.writes.length
    await owner.page.reload()
    await row.waitFor()
    const geometry = await owner.page.locator('.wb-theme').evaluate(element => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      font: getComputedStyle(element).fontFamily,
    }))
    assert.ok(geometry.overflow <= 1)
    assert.equal(report.writes.length, count)
    report.geometry.push({ surface: 'owner', style, mode, width, locale, ...geometry })
    await owner.page.screenshot({ path: resolve(out, `owner-${style}-${mode}-${width}.png`), fullPage: true })
  }
  record('Owner device management retains real revoked records and long localized names across three styles and both modes')
  assert.deepEqual(report.external, [])
  assert.deepEqual(report.errors, [])
} catch (reason) {
  report.failure = reason.stack
  // Codes may be present in memory/inputs on failure; retain metadata only.
  throw reason
} finally {
  code = undefined
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
