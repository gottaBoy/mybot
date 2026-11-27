import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5177/'
const backend = process.env.DISCARD_FIXTURE_URL ?? 'http://127.0.0.1:4188/'
for (const url of [new URL(base), new URL(backend)]) {
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(!['4180', '5173'].includes(url.port))
}
const origin = new URL(base).origin
const out = resolve(process.env.EVIDENCE_DIR ?? '/tmp/mybot-task-turn-discard')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
).href)
const browser = await chromium.launch({
  headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  fixture: true,
  modelGeneration: 'No model generation; configured deterministic FakeProvider remains unused',
  actualExecution: 'Application HTTP and SQLite preparation/discard; no Run or model call',
  checks: [], errors: [], external: [], reads: [], writes: [], screenshots: [], geometry: [],
}
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`) }
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return
  if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
  if (!localStorage.getItem('mybot.style')) localStorage.setItem('mybot.style', 'neutral')
  if (!localStorage.getItem('mybot.mode')) localStorage.setItem('mybot.mode', 'light')
})
context.on('request', (request) => {
  const url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return
  const item = { path: url.pathname, method: request.method() }
  if (request.method() === 'GET') report.reads.push(item)
  else report.writes.push(item)
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
page.setDefaultTimeout(15000)
page.on('pageerror', (error) => report.errors.push(error.message))
const form = () => page.locator('.wb-form')
const message = (turn) => page.locator(`[data-task-turn="${turn.id}"]`)
const disabled = async (locator) =>
  await locator.isDisabled() || await locator.getAttribute('aria-disabled') === 'true'
const writesTo = (path) =>
  report.writes.filter((item) => item.path === path && item.method === 'POST').length

async function api(path, body) {
  return page.evaluate(async ({ path, body }) => {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workbench-Request': '1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, data: await response.json() }
  }, { path, body })
}
async function read(path) {
  const result = await api(path)
  assert.equal(result.status, 200, JSON.stringify(result.data))
  return result.data
}
async function post(path, body, status = 200) {
  const result = await api(path, body)
  assert.equal(result.status, status, JSON.stringify(result.data))
  return result.data
}
async function fixtureStatus() {
  const response = await fetch(new URL('fixture/status', backend))
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.equal(value.fixture, true)
  assert.match(value.model_generation, /FakeProvider/)
  assert.deepEqual(value.current_hashes, value.initial_hashes)
  assert.deepEqual(value.fixture_writes, [])
  assert.equal(value.model_calls, 0)
  assert.equal(value.counts.runs, 0)
  assert.equal(value.counts.calls, 0)
  assert.equal(value.counts.artifacts, 0)
  return value
}
async function poll(test, name) {
  for (let index = 0; index < 150; index++) {
    if (await test()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${name}`)
}
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
function assertIdentity(current, original) {
  for (const key of ['id', 'task_id', 'request_id', 'content', 'created_at'])
    assert.equal(current[key], original[key], key)
  assert.equal(current.run_id, null)
  assert.deepEqual(current.candidate, original.candidate)
}
async function prepare(task, model, requestId, content) {
  const saved = await post(`/tasks/${task.id}/turns`, {
    request_id: requestId, content,
  }, 201)
  assert.equal(saved.state, 'saved')
  assert.equal(saved.content, content)
  assert.equal(saved.request_id, requestId)
  const snapshot = await post(`/tasks/${task.id}/turns/${saved.id}/preview`, {})
  const prepared = await post(`/tasks/${task.id}/turns/${saved.id}/prepare`, {
    coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
    max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800,
    context_hash: snapshot.context_hash,
  })
  assert.equal(prepared.state, 'prepared')
  assert.equal(prepared.id, saved.id)
  assert.equal(prepared.request_id, requestId)
  assert.equal(prepared.content, content)
  assert.ok(prepared.candidate?.candidate_hash)
  return prepared
}
async function openPrepared(task, turn, locale = 'en') {
  const originalLookup = `/api/tasks/${task.id}/turns/requests/${turn.request_id}`
  const beforeReads = report.reads.filter((item) => item.path === originalLookup).length
  const query = new URLSearchParams({
    taskTab: 'conversation', taskSend: turn.request_id,
  })
  await page.goto(`${base}#task/${encodeURIComponent(task.id)}?${query}`)
  await page.reload()
  await page.getByRole('textbox', {
    name: locale === 'en' ? 'Supplemental requirements' : '补充要求', exact: true,
  }).waitFor()
  await message(turn).getByText(turn.content, { exact: true }).waitFor()
  const lookup = page.waitForResponse((response) =>
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === originalLookup)
  await page.getByRole('button', {
    name: locale === 'en' ? 'Check save receipt' : '核对保存回执', exact: true,
  }).click()
  const lookupResponse = await lookup
  assert.equal(lookupResponse.status(), 200)
  const restored = await lookupResponse.json()
  assert.equal(restored.state, 'prepared')
  assertIdentity(restored, turn)
  await page.waitForFunction(() => !new URLSearchParams(
    location.hash.split('?')[1] ?? '',
  ).has('taskSend'))
  assert.ok(report.reads.filter((item) => item.path === originalLookup).length > beforeReads)
  await message(turn).getByRole('button', {
    name: locale === 'en' ? 'Continue prepared run' : '继续确认下一轮', exact: true,
  }).click()
  await form().waitFor()
}
async function cancelConfirmation(trigger, confirmation) {
  await page.keyboard.press('Escape')
  await confirmation.waitFor({ state: 'hidden' })
  await poll(() => trigger.evaluate((element) => element === document.activeElement),
    'discard trigger focus restoration')
}
async function measure(name, locator) {
  const geometry = await locator.evaluate((element) => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    rect: element.getBoundingClientRect().toJSON(),
    client: element.clientWidth,
    content: element.scrollWidth,
  }))
  assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
  assert.ok(geometry.rect.left >= -1 && geometry.rect.right <= geometry.width + 1,
    JSON.stringify(geometry))
  assert.ok(geometry.content <= geometry.client + 1, JSON.stringify(geometry))
  report.geometry.push({ name, ...geometry })
}
async function loseDiscard(path, original) {
  let complete, fail
  const receipt = new Promise((resolveReceipt, rejectReceipt) => {
    complete = resolveReceipt
    fail = rejectReceipt
  })
  const pattern = `**${path}`
  const handler = async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    try {
      assert.deepEqual(route.request().postDataJSON(), {
        candidate_hash: original.candidate.candidate_hash, consent: true,
      })
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      const value = await response.json()
      assert.equal(value.state, 'discarded')
      assertIdentity(value, original)
      await route.abort('failed')
      complete(value)
    } catch (error) {
      fail(error)
      await route.abort('failed').catch(() => {})
    }
  }
  await page.route(pattern, handler)
  return { receipt, stop: () => page.unroute(pattern, handler) }
}

try {
  await page.goto(base)
  await post('/auth', { token: 'astryx-browser-fixture' })
  const initial = await read('/bootstrap')
  assert.deepEqual([
    initial.projects.length, initial.tasks.length, initial.runs.length, initial.models.length,
  ], [0, 0, 0, 0])
  assert.equal(initial.capabilities.task_conversation, true)
  assert.equal(initial.capabilities.task_turn_discard, true)
  const start = await fixtureStatus()
  assert.equal(start.counts.tasks, 0)
  const project = await post('/projects', {
    name: 'Prepared turn discard acceptance', directory: '.',
    goal: 'Retain immutable supplemental requirements while explicitly releasing a prepared turn.',
    notes: 'Disposable fixture; no external provider or execution.',
  }, 201)
  const model = await post('/models', {
    name: 'Unused prepared-turn fixture', model: 'nested-plan-fixture',
    endpoint: 'http://127.0.0.1:9999/v1', key_env: '',
  }, 201)
  const task = await post('/tasks', {
    project_id: project.id, title: 'Explicit prepared-turn discard',
    goal: 'Inspect the supplied README only after a separately confirmed execution.',
    acceptance: 'Preserve message identity, original candidate and unknown-outcome reconciliation.',
    files: ['README.md'],
  }, 201)
  const original = await prepare(task, model, 'turn-discard-original-request',
    'Keep this immutable supplemental requirement and its original context receipt after discarding preparation.')
  const turnPath = `/api/tasks/${task.id}/turns/${original.id}`
  const discardPath = `${turnPath}/discard`
  const afterPreparation = await fixtureStatus()
  assert.equal(afterPreparation.counts.tasks, 1)
  assert.equal(afterPreparation.counts.plans, 0)
  check('A real flat Task and immutable prepared message persist with zero Runs and zero model calls')

  await openPrepared(task, original)
  const trigger = form().getByRole('button', { name: 'Discard prepared turn', exact: true })
  await trigger.click()
  const confirmation = page.getByRole('dialog', {
    name: 'Discard the prepared next run?', exact: true,
  })
  await confirmation.waitFor()
  await confirmation.getByRole('button', { name: 'Keep preparation', exact: true }).waitFor()
  await capture('discard-confirmation-desktop.png')
  await cancelConfirmation(trigger, confirmation)
  const kept = await read(`/tasks/${task.id}/turns/${original.id}`)
  assert.equal(kept.state, 'prepared')
  assertIdentity(kept, original)
  assert.equal(writesTo(discardPath), 0)
  await fixtureStatus()
  check('The secondary discard confirmation cancels with Escape, preserves the candidate and restores trigger focus')

  const lost = await loseDiscard(discardPath, original)
  await trigger.click()
  await confirmation.getByRole('button', {
    name: 'Confirm prepared turn discard', exact: true,
  }).click()
  const applied = await lost.receipt
  await form().getByText(
    'The discard outcome is unresolved. Check the original message; it will not be resent.',
    { exact: true },
  ).waitFor()
  assert.ok(await disabled(form().getByRole('button', {
    name: 'Discard prepared turn', exact: true,
  })))
  await form().getByText(original.content, { exact: true }).waitFor()
  assert.equal(writesTo(discardPath), 1)
  assert.equal(writesTo(`${turnPath}/execute`), 0)
  await fixtureStatus()
  await capture('discard-response-lost.png')
  await lost.stop()
  check('One real discard POST applies while its lost response leaves the original prepared identity locked and unresolved')

  const readsBeforeReconciliation = report.reads.filter((item) => item.path === turnPath).length
  const reconciliation = page.waitForResponse((response) =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === turnPath)
  await form().getByRole('button', { name: 'Check turn receipt', exact: true }).click()
  const receiptResponse = await reconciliation
  assert.equal(receiptResponse.status(), 200)
  const reconciled = await receiptResponse.json()
  assert.deepEqual(reconciled, applied)
  assertIdentity(reconciled, original)
  await form().waitFor({ state: 'hidden' })
  assert.ok(report.reads.filter((item) => item.path === turnPath).length > readsBeforeReconciliation)
  assert.equal(writesTo(discardPath), 1)
  check('The original wizard reconciles the same discarded Turn by GET without resending a mutation')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'zh'))
  await page.reload()
  const discardedMessage = message(original)
  await discardedMessage.getByText('准备已放弃，消息保留', { exact: true }).waitFor()
  await discardedMessage.getByText(original.content, { exact: true }).waitFor()
  assert.equal(await discardedMessage.getByRole('button').count(), 0)
  const retained = await read(`/tasks/${task.id}/turns/${original.id}`)
  assert.equal(retained.state, 'discarded')
  assertIdentity(retained, original)
  const unlocked = await read(`/tasks/${task.id}/turns`)
  assert.equal(unlocked.prepared, null)
  await measure('Chinese discarded terminal at 390px', discardedMessage)
  await capture('discarded-message-chinese-mobile.png')
  check('Reload retains the discarded immutable message and candidate, clears its prepared lock and fits Chinese mobile presentation')

  const next = await prepare(task, model, 'turn-discard-next-request',
    '新的补充要求：保留上一条消息与原候选凭据，只为这条明确选中的消息准备下一轮。此次验收不执行模型。')
  assert.notEqual(next.id, original.id)
  assert.notEqual(next.request_id, original.request_id)
  const afterReplacement = await read(`/tasks/${task.id}/turns`)
  assert.equal(afterReplacement.prepared.id, next.id)
  assertIdentity(await read(`/tasks/${task.id}/turns/${original.id}`), original)
  await openPrepared(task, next, 'zh')
  const mobileTrigger = form().getByRole('button', { name: '放弃此轮准备', exact: true })
  await mobileTrigger.click()
  const mobileConfirmation = page.getByRole('dialog', {
    name: '放弃已准备的下一轮？', exact: true,
  })
  await mobileConfirmation.waitFor()
  await mobileConfirmation.getByRole('button', { name: '确认放弃此轮准备', exact: true }).waitFor()
  await measure('Chinese discard confirmation at 390px', mobileConfirmation)
  await capture('discard-confirmation-chinese-mobile.png')
  await cancelConfirmation(mobileTrigger, mobileConfirmation)
  const nextKept = await read(`/tasks/${task.id}/turns/${next.id}`)
  assert.equal(nextKept.state, 'prepared')
  assertIdentity(nextKept, next)
  const final = await fixtureStatus()
  assert.equal(final.counts.tasks, 1)
  assert.equal(final.counts.plans, 0)
  assert.equal(final.counts.plan_versions, 0)
  assert.equal(final.counts.nested_roots, 0)
  assert.equal(writesTo(discardPath), 1)
  assert.equal(report.writes.filter((item) => item.path.endsWith('/discard')).length, 1)
  assert.equal(report.writes.filter((item) =>
    item.path.endsWith('/execute') || item.path.endsWith('/runs')).length, 0)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
  check('A new message can be saved and prepared after lock release; its Chinese mobile confirmation cancels with no second discard or execution')

  report.actual = {
    task_id: task.id, original_turn_id: original.id, original_request_id: original.request_id,
    original_candidate_hash: original.candidate.candidate_hash,
    next_turn_id: next.id, next_request_id: next.request_id,
    next_candidate_hash: next.candidate.candidate_hash,
    discard_posts: writesTo(discardPath), final_counts: final.counts,
    model_calls: final.model_calls,
    initial_hashes: final.initial_hashes, current_hashes: final.current_hashes,
  }
  report.summary = {
    status: 'passed', checks: report.checks.length, screenshots: report.screenshots.length,
    discard_posts: 1, runs: 0, model_calls: 0, page_errors: 0, external_requests: 0,
  }
  await writeFile(resolve(out, 'discarded-turn-receipt.json'), JSON.stringify(retained, null, 2))
} catch (error) {
  report.failure = error.stack ?? String(error)
  await capture('failure.png').catch(() => {})
  report.summary = {
    status: 'failed', checks: report.checks.length, screenshots: report.screenshots.length,
    page_errors: report.errors.length, external_requests: report.external.length,
  }
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
