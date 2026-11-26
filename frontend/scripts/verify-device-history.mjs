import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(
  process.env.DEVICE_HISTORY_EVIDENCE_DIR ?? '/tmp/mybot-device-history',
)
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  checks: [],
  errors: [],
  external: [],
  geometry: [],
  writes: [],
}
const check = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
const taskId = 'reference-task-000-0'
const oldRun = 'reference-run-000-0-000'
const latestRun = 'reference-run-000-0-044'
const oldUrl = `${base}#pair?task=${taskId}&view=review&run=${oldRun}`
async function context(width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion: 'reduce',
  })
  await context.addInitScript(() => {
    if (!localStorage.getItem('mybot.locale'))
      localStorage.setItem('mybot.locale', 'en')
  })
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
      report.writes.push({ path: url.pathname, method: request.method() })
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      report.external.push(url.origin)
      return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => report.errors.push(error.message))
  return { context, page }
}
async function api(page, path, body, headers = {}) {
  return page.evaluate(
    async ({ path, body, headers }) => {
      const response = await fetch(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, data: await response.json() }
    },
    { path, body, headers },
  )
}
const owner = await context(1440)
const paired = await context(390)
try {
  await owner.page.goto(base)
  assert.equal(
    (await api(owner.page, '/auth', { token: 'astryx-browser-fixture' }))
      .status,
    200,
  )
  const bootstrap = (await api(owner.page, '/bootstrap')).data
  assert.equal(bootstrap.capabilities.device_run_history, true)
  assert.equal(bootstrap.runs.length, 88)
  await owner.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await owner.page.goto(`${base}#task/${taskId}`)
  await owner.page.reload()
  await owner.page.getByRole('button', { name: 'Copy device continuation link', exact: true }).click()
  const copied = await owner.page.evaluate(() => navigator.clipboard.readText())
  const copyLocation = new URL(copied)
  assert.equal(copyLocation.origin, origin)
  assert.equal(copyLocation.hash, `#pair?task=${taskId}&view=goal`)
  assert.ok(!copied.includes('secret'))
  assert.equal(report.writes.filter((item) => item.path === '/api/devices/pairings').length, 0)
  check('Owner copies an exact read-position link without creating an invitation or granting execution')
  const secret = 'A'.repeat(43),
    deviceSecret = 'B'.repeat(43)
  const pairing = await api(owner.page, '/devices/pairings', {
    request_id: 'history-browser-pair',
    task_id: taskId,
    label: 'History fixture',
    pair_secret: secret,
    consent: true,
  })
  assert.equal(pairing.status, 200)
  await paired.page.goto(oldUrl)
  const claimed = await api(paired.page, '/device/claim', {
    request_id: 'history-browser-claim',
    pairing_id: pairing.data.result.id,
    pair_secret: secret,
    device_name: 'Phone history fixture',
    device_secret: deviceSecret,
  })
  assert.equal(claimed.status, 200)
  const device = claimed.data
  await paired.page.reload()
  const panel = paired.page.getByRole('region', {
    name: 'Selected run',
    exact: true,
  })
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  assert.equal(
    await panel
      .getByText('Original report for run 0. No real provider was called.')
      .count(),
    1,
  )
  assert.equal(
    await paired.page
      .getByText('Original report for run 44. No real provider was called.')
      .count(),
    0,
  )
  check(
    'Exact historical report restored from a scoped URL; latest report never substituted',
  )

  await paired.page
    .getByRole('button', { name: 'Next runs', exact: true })
    .click()
  await paired.page
    .getByRole('button', { name: 'reference-run-000-0-024', exact: true })
    .waitFor()
  assert.match(paired.page.url(), /historyPage=2/)
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  await paired.page.reload()
  await paired.page
    .getByRole('button', { name: 'reference-run-000-0-024', exact: true })
    .waitFor()
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  check('History paging and selected off-page Run survive reload independently')

  await paired.page
    .getByRole('radio', { name: 'Conversation', exact: true })
    .click()
  await paired.page
    .getByLabel('Supplemental requirements', { exact: true })
    .fill('Keep my same-Task draft')
  await paired.page.getByRole('radio', { name: 'Reports', exact: true }).click()
  await paired.page
    .getByRole('radio', { name: 'Conversation', exact: true })
    .click()
  assert.equal(
    await paired.page
      .getByLabel('Supplemental requirements', { exact: true })
      .inputValue(),
    'Keep my same-Task draft',
  )
  await paired.page.route('**/api/device/messages', async (route) => {
    await route.fetch()
    await route.abort()
  })
  await paired.page
    .getByRole('button', { name: 'Save requirement', exact: true })
    .click()
  await paired.page
    .getByText(
      'The save outcome is unconfirmed. Check the original message; it will not be resent automatically.',
      { exact: true },
    )
    .waitFor()
  const unresolved = paired.page.url()
  await paired.page.getByRole('radio', { name: 'Reports', exact: true }).click()
  assert.equal(paired.page.url(), unresolved)
  await paired.page.unroute('**/api/device/messages')
  await paired.page
    .getByRole('button', { name: 'Check save receipt', exact: true })
    .click()
  await paired.page
    .getByText('The supplemental requirement was saved. No run has started.', {
      exact: true,
    })
    .waitFor()
  assert.match(paired.page.url(), new RegExp(`run=${oldRun}`))
  assert.ok(!paired.page.url().includes('deviceSend'))
  assert.equal(
    report.writes.filter((item) => item.path === '/api/device/messages').length,
    1,
  )
  check(
    'Same-Task draft survives view changes; unknown save blocks navigation and reconciles by original GET',
  )

  await paired.page.getByRole('radio', { name: 'Reports', exact: true }).click()
  await paired.page.goBack()
  await paired.page
    .getByRole('button', { name: 'Save requirement', exact: true })
    .waitFor()
  await paired.page.goForward()
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  check('Managed Back/Forward restores paired position without a second save')

  await paired.page.goto(
    `${base}#pair?task=reference-task-002-0&view=review&run=${oldRun}`,
  )
  await paired.page.reload()
  await paired.page
    .getByText(
      'This continuation link does not match the authorized task. Task content is hidden.',
      { exact: true },
    )
    .waitFor()
  assert.equal(
    await paired.page
      .getByText('Original report for run 0. No real provider was called.')
      .count(),
    0,
  )
  await paired.page
    .getByRole('button', { name: 'Open authorized task overview', exact: true })
    .click()
  await paired.page
    .getByRole('button', { name: latestRun, exact: true })
    .waitFor()
  check(
    'Wrong-Task link hides content and returns only to explicitly authorized Task',
  )

  await paired.page.goto(
    `${base}#pair?task=${taskId}&view=review&run=missing-run`,
  )
  await paired.page.reload()
  await paired.page
    .getByText('The selected run is missing or outside this task.', {
      exact: true,
    })
    .waitFor()
  assert.equal(
    await paired.page
      .getByText('Original report for run 44. No real provider was called.')
      .count(),
    0,
  )
  check('Missing selected Run fails explicitly without falling back to latest')

  await paired.page.goto(oldUrl)
  await paired.page.reload()
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  await paired.page.route(`**/api/device/runs/${oldRun}`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'fixture read failure' }),
    }),
  )
  await paired.page.reload()
  await paired.page
    .getByText('The selected run could not be read.', { exact: true })
    .waitFor()
  assert.equal(
    await paired.page
      .getByText('Original report for run 0. No real provider was called.')
      .count(),
    0,
  )
  await paired.page.unroute(`**/api/device/runs/${oldRun}`)
  await paired.page
    .getByRole('button', { name: 'Retry selected run', exact: true })
    .click()
  await panel
    .getByRole('heading', { name: 'Historical report 0', exact: true })
    .waitFor()
  check(
    'Advertised detail failure hides uncertain report and recovers only by explicit GET retry',
  )

  for (const style of ['neutral', 'zira', 'y2k']) {
    for (const mode of ['light', 'dark']) {
      await paired.page.evaluate(
        ({ style, mode }) => {
          localStorage.setItem('mybot.style', style)
          localStorage.setItem('mybot.mode', mode)
          localStorage.setItem('mybot.locale', mode === 'dark' ? 'zh' : 'en')
        },
        { style, mode },
      )
      await paired.page.setViewportSize({
        width: mode === 'dark' ? 390 : 1440,
        height: 900,
      })
      await paired.page.reload()
      await paired.page
        .getByRole('heading', { name: 'Historical report 0', exact: true })
        .waitFor()
      await paired.page.getByRole('radio', { name: mode === 'dark' ? '成果' : 'Reports', exact: true }).waitFor()
      await paired.page.waitForFunction(
        (style) =>
          document.querySelector('.wb-theme')?.getAttribute('data-style') ===
          style,
        style,
      )
      const geometry = await paired.page.evaluate(() => ({
        width: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        background: getComputedStyle(
          document.querySelector('.wb-theme'),
        ).getPropertyValue('--wb-bg'),
      }))
      assert.ok(geometry.documentWidth <= geometry.width + 1)
      report.geometry.push({ style, mode, ...geometry })
      await paired.page.screenshot({
        path: resolve(out, `history-${style}-${mode}.png`),
        fullPage: true,
      })
    }
  }
  check(
    'Three styles in both modes; desktop/mobile, English/Chinese and off-page selected report',
  )

  const cross = await api(
    paired.page,
    '/device/runs/reference-run-002-0-000',
    undefined,
    { 'X-Workbench-Device-Id': device.id },
  )
  assert.equal(cross.status, 404)
  assert.equal((await api(paired.page, '/bootstrap')).status, 403)
  assert.equal(
    (await api(paired.page, `/tasks/${taskId}/runs`, {})).status,
    403,
  )
  const revoked = await api(owner.page, `/devices/${device.id}/revoke`, {
    request_id: 'history-browser-revoke',
    expected_revision: 1,
    consent: true,
  })
  assert.equal(revoked.status, 200)
  await paired.page.reload()
  await paired.page
    .getByRole('heading', { name: /配对设备|Pair device/, exact: true })
    .waitFor()
  assert.equal(
    await paired.page
      .getByText('Original report for run 0. No real provider was called.')
      .count(),
    0,
  )
  check(
    'Historical reads respect Task boundary; execution forbidden; revocation clears private content',
  )
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (reason) {
  report.failure = String(reason)
  await paired.page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw reason
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
