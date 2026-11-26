import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.DEVICE_EXECUTION_EVIDENCE_DIR ?? '/tmp/mybot-device-execution')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs').href)
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome' })
const report = { fixture: true, checks: [], errors: [], external: [], writes: [], screenshots: [], geometry: [] }
let failurePage
const check = text => { report.checks.push(text); console.log(`PASS ${text}`) }
async function context(width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => { if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en') })
  context.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') && request.method() !== 'GET') report.writes.push({ path: url.pathname, method: request.method() })
  })
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      report.external.push(url.origin); return route.abort()
    }
    return route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  return { context, page }
}
async function api(page, path, body, headers = {}) {
  return page.evaluate(async ({ path, body, headers }) => {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workbench-Request': '1', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, data: await response.json() }
  }, { path, body, headers })
}
async function poll(read, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await read()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out: ${label}`)
}
const owner = await context(1440), paired = await context(390)
try {
  failurePage = owner.page
  await owner.page.goto(base)
  assert.equal((await api(owner.page, '/auth', { token: 'astryx-browser-fixture' })).status, 200)
  const baseline = (await api(owner.page, '/bootstrap')).data
  assert.equal(baseline.tasks.length, 0, 'Use a fresh empty fixture')
  assert.equal(baseline.models.length, 0)
  assert.equal(baseline.capabilities.device_execution_delegation, true)
  const project = (await api(owner.page, '/projects', { name: 'Delegation fixture', directory: '.', goal: 'Verify precise device authorization' })).data
  const model = (await api(owner.page, '/models', { name: 'Fixture model', endpoint: 'http://127.0.0.1:11434/v1', model: 'fixture-no-paid-provider', key_env: '' })).data
  const task = (await api(owner.page, '/tasks', { project_id: project.id, title: 'Continue one prepared research run', goal: 'Analyze an explicit source and selected message', acceptance: 'Return one bounded report', files: ['README.md'] })).data
  const pair = (await api(owner.page, '/devices/pairings', { request_id: 'delegation-browser-pair', task_id: task.id, label: 'Fixture phone', pair_secret: 'A'.repeat(43), consent: true })).data
  await paired.page.goto(`${base}#pair?task=${task.id}&view=work`)
  const device = (await api(paired.page, '/device/claim', {
    request_id: 'delegation-browser-claim', pairing_id: pair.result.id, pair_secret: 'A'.repeat(43),
    device_name: 'Explicit fixture phone', device_secret: 'B'.repeat(43),
  })).data
  assert.deepEqual(device.scopes, ['task_read', 'message_save'])
  await paired.page.reload()
  await paired.page.getByText('There is no execution grant.', { exact: true }).waitFor()
  assert.equal((await api(paired.page, `/tasks/${task.id}/runs`, {})).status, 403)
  check('Pairing alone still grants no execution; no broader owner APIs')

  await owner.page.goto(`${base}#task/${task.id}?taskTab=conversation`); await owner.page.reload()
  const conversation = owner.page.getByTestId('task-conversation')
  await conversation.getByRole('textbox', { name: 'Supplemental requirements', exact: true }).fill('Only this message is authorized for a delegated research run.')
  await conversation.getByRole('button', { name: 'Save message', exact: true }).click()
  await conversation.getByRole('button', { name: 'Arrange next run', exact: true }).click()
  let form = owner.page.getByRole('dialog', { name: 'Review context & resources', exact: true })
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('combobox', { name: 'Run arrangement', exact: true }).click()
  await owner.page.getByRole('option', { name: 'Prepare only; delegate or confirm later', exact: true }).click()
  await form.getByRole('checkbox', { name: 'I confirm freezing this context and these resources without calling a model.', exact: true }).check()
  await form.getByRole('button', { name: 'Confirm & prepare next run', exact: true }).click()
  await owner.page.locator('form.wb-form').waitFor({ state: 'hidden' })
  const turns = (await api(owner.page, `/tasks/${task.id}/turns`)).data
  const turn = turns.prepared
  assert.equal(turn.state, 'prepared')
  assert.equal((await api(owner.page, '/bootstrap')).data.runs.length, 0)
  assert.equal(report.writes.filter(item => item.path.endsWith('/execute')).length, 0)
  check('Owner resource wizard prepares and freezes one candidate without executing')

  await owner.page.getByRole('link', { name: 'Delegate from devices', exact: true }).click()
  await owner.page.getByRole('button', { name: 'Execution delegation', exact: true }).click()
  const panel = () => owner.page.getByRole('dialog', { name: 'Single-use execution delegation', exact: true })
  await panel().getByRole('button', { name: 'Confirm single-use execution grant', exact: true }).waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(), false)
  await panel().getByRole('checkbox').check()
  let grantId
  const grantPath = `/api/devices/${device.id}/execution-grants`
  await owner.page.route(`**${grantPath}`, async route => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    grantId = (await response.json()).grant.id
    await route.abort('failed')
  })
  await panel().getByRole('button', { name: 'Confirm single-use execution grant', exact: true }).click()
  await owner.page.getByText('Outcome unknown. Check the original delegation request.', { exact: true }).waitFor()
  await owner.page.unroute(`**${grantPath}`)
  await owner.page.reload()
  await owner.page.getByRole('button', { name: 'Check original delegation', exact: true }).click()
  await panel().getByText('Original delegation receipt confirmed.', { exact: true }).waitFor()
  assert.equal(report.writes.filter(item => item.path === grantPath).length, 1)
  assert.equal((await api(owner.page, '/bootstrap')).data.runs.length, 0)
  check('Lost owner grant response survives reload and reconciles by exact operation GET without repeated grant or execution')

  failurePage = paired.page
  await paired.page.getByRole('button', { name: 'Refresh execution grant', exact: true }).click()
  await paired.page.getByText('Awaiting device confirmation', { exact: true }).waitFor()
  const grantBefore = (await api(paired.page, `/device/execution-grants/${grantId}`, undefined, { 'X-Workbench-Device-Id': device.id })).data.grant
  assert.equal(grantBefore.candidate_hash, turn.candidate.candidate_hash)
  const serialized = JSON.stringify(grantBefore)
  for (const privateField of ['README.md', 'Explicit context fixture', 'key_env', 'endpoint']) assert.ok(!serialized.includes(privateField))
  check('Device sees the exact candidate limits and model identities without source bodies, paths or credentials')

  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    for (const [surface, actor] of [['owner', owner], ['paired', paired]]) {
      const locale = mode === 'dark' ? 'zh' : 'en'
      const width = mode === 'dark' ? 390 : 1440
      await actor.page.evaluate(({ style, mode, locale }) => {
        localStorage.setItem('mybot.style', style); localStorage.setItem('mybot.mode', mode); localStorage.setItem('mybot.locale', locale)
      }, { style, mode, locale })
      await actor.page.setViewportSize({ width, height: 900 }); await actor.page.reload()
      await actor.page.getByText(locale === 'zh' ? '等待设备确认' : 'Awaiting device confirmation', { exact: true }).waitFor()
      const geometry = await actor.page.evaluate(() => ({
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        background: getComputedStyle(document.querySelector('.wb-theme')).getPropertyValue('--wb-bg'),
      }))
      assert.ok(geometry.scroll <= geometry.width + 1)
      report.geometry.push({ surface, style, mode, locale, ...geometry })
      const file = `${surface}-${style}-${mode}.png`
      await actor.page.screenshot({ path: resolve(out, file), fullPage: true }); report.screenshots.push(file)
    }
  }
  check('Both surfaces render three styles in both modes at desktop English and mobile Chinese widths')

  await paired.page.evaluate(() => localStorage.setItem('mybot.locale', 'en')); await paired.page.reload()
  const execPath = `/api/device/execution-grants/${grantId}/execute`
  await paired.page.route(`**${execPath}`, async route => {
    const response = await route.fetch(); assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  const execution = paired.page.getByRole('region', { name: 'Execution delegation', exact: true })
  await execution.getByRole('checkbox').check()
  await execution.getByRole('button', { name: 'Confirm delegated run', exact: true }).click()
  await execution.getByText('Outcome unknown. Check the original execution grant.', { exact: true }).waitFor()
  assert.ok(paired.page.url().includes(`deviceExecute=${grantId}`))
  await paired.page.unroute(`**${execPath}`)
  await paired.page.reload()
  await paired.page.getByRole('button', { name: 'Check original execution', exact: true }).click()
  await paired.page.getByText('The original run is queued. It was not repeated.', { exact: true }).waitFor()
  const after = (await api(owner.page, '/bootstrap')).data
  assert.equal(after.runs.length, 1)
  const runId = after.runs[0].id
  assert.equal(report.writes.filter(item => item.path === execPath).length, 1)
  assert.ok(!paired.page.url().includes('deviceExecute'))
  await poll(async () => (await api(owner.page, `/runs/${runId}`)).data.run.status === 'succeeded', 'fake research completes')
  check('Device explicitly executes once; lost response and reload use only the original grant GET, reaching a real FakeProvider report')

  const ownerExecute = await api(owner.page, `/tasks/${task.id}/turns/${turn.id}/execute`, { candidate_hash: turn.candidate.candidate_hash, consent: true })
  assert.equal(ownerExecute.data.run_id, runId)
  assert.equal((await api(owner.page, '/bootstrap')).data.runs.length, 1)
  assert.equal((await api(paired.page, '/models')).status, 403)
  check('Owner execution replay returns the same Run and device still cannot manage models')

  await owner.page.evaluate(() => localStorage.setItem('mybot.locale', 'en'))
  await owner.page.reload()
  await panel().getByRole('button', { name: 'Close', exact: true }).click()
  await owner.page.goto(`${base}#task/${task.id}`); await owner.page.reload()
  const message = (await api(owner.page, `/tasks/${task.id}/turns`, { request_id: 'second-delegated-message', content: 'Second candidate for revocation check only' })).data
  const snapshot = (await api(owner.page, `/tasks/${task.id}/turns/${message.id}/preview`, {})).data
  const prepared = (await api(owner.page, `/tasks/${task.id}/turns/${message.id}/prepare`, {
    coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
    max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800, context_hash: snapshot.context_hash,
  })).data
  const second = (await api(owner.page, grantPath.replace('/api',''), {
    request_id: 'second-execution-grant', turn_id: prepared.id, candidate_hash: prepared.candidate.candidate_hash,
    expected_device_revision: 1, consent: true,
  })).data.grant
  await owner.page.goto(`${base}#devices?executionDevice=${device.id}`); await owner.page.reload()
  await panel().getByRole('checkbox', { name: 'Revoke this execution delegation', exact: true }).check()
  await panel().getByRole('button', { name: 'Confirm delegation revocation', exact: true }).click()
  await panel().getByText('Revoked', { exact: true }).waitFor()
  const denied = await api(paired.page, `/device/execution-grants/${second.id}/execute`, { candidate_hash: second.candidate_hash, consent: true }, { 'X-Workbench-Device-Id': device.id })
  assert.equal(denied.status, 409)
  assert.equal((await api(owner.page, '/bootstrap')).data.runs.length, 1)
  check('Owner revokes an unused grant in the UI; a stale device confirmation cannot queue another Run')

  await api(owner.page, `/devices/${device.id}/revoke`, { request_id: 'revoke-delegated-device', expected_revision: 1, consent: true })
  await paired.page.reload()
  await paired.page.getByRole('heading', { name: 'Pair device', exact: true }).waitFor()
  assert.equal(await paired.page.getByText(grantBefore.content, { exact: true }).count(), 0)
  check('Revoking the device clears grant and Task content; prior Run history remains intact')
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, [])
} catch (reason) {
  report.failure = String(reason)
  await failurePage?.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  throw reason
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
