import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'A disposable FakeProvider service is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.WORKBENCH_EVIDENCE_DIR ?? '/tmp/mybot-durable-recovery',
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
const evidence = {
  fixture: true,
  transport: 'real local API with FakeProvider',
  checks: [],
  errors: [],
  requests: [],
  droppedReceipts: [],
  droppedRegistrations: [],
  screenshots: [],
}
await mkdir(out, { recursive: true })
const page = await context.newPage()
page.on('pageerror', (error) =>
  evidence.errors.push({ message: error.message, stack: error.stack }),
)
page.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/'))
    evidence.requests.push({ method: request.method(), path: url.pathname })
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  return url.protocol.startsWith('http') && url.origin !== origin
    ? route.abort()
    : route.continue()
})
function record(name) {
  evidence.checks.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api${path}`, {
        ...(body === undefined
          ? {}
          : {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Workbench-Request': '1',
              },
              body: JSON.stringify(body),
            }),
      })
      const value = await response.json()
      if (!response.ok)
        throw new Error(JSON.stringify({ status: response.status, value }))
      return value
    },
    { path, body },
  )
}
async function poll(read, name) {
  for (let i = 0; i < 200; i++) {
    if (await read()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${name}`)
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  evidence.screenshots.push(`${name}.png`)
}
async function waitStatus(id, status) {
  await poll(
    async () => (await api(`/runs/${id}`)).run.status === status,
    `${id}: ${status}`,
  )
  return api(`/runs/${id}`)
}
async function openRecovery(id, label = '重试与资源') {
  await page.goto(`${base}#run/${id}`)
  await page.getByRole('button', { name: label, exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /检查(重试|继续)范围/ }).waitFor()
  return dialog
}
async function review(dialog, label) {
  await dialog.getByRole('button', { name: label, exact: true }).click()
  await dialog.getByText('已登记，执行尚未确认', { exact: true }).waitFor()
  await poll(
    async () =>
      (await dialog
        .getByRole('checkbox')
        .last()
        .getAttribute('aria-disabled')) !== 'true',
    'Prepared candidate enables a fresh consent decision',
  )
}
async function dropAppliedReceipt(source, requestId) {
  let dropped = false
  const pattern = `**/api/runs/${source}/recovery-intents/${requestId}/execute`
  await context.route(pattern, async (route) => {
    if (dropped) return route.continue()
    dropped = true
    const response = await route.fetch({ maxRedirects: 0 })
    assert.equal(response.status(), 200)
    const receipt = await response.json()
    assert.equal(receipt.state, 'applied')
    assert.equal(receipt.request_id, requestId)
    evidence.droppedReceipts.push(receipt)
    await route.abort('failed')
  })
}
function executionCount(id) {
  return evidence.requests.filter(
    (request) =>
      request.method === 'POST' &&
      request.path.endsWith(`/recovery-intents/${id}/execute`),
  ).length
}

try {
  await page.goto(base)
  await api('/auth', { token: 'astryx-browser-fixture' })
  await page.reload()
  const bootstrap = await api('/bootstrap')
  assert.match(
    bootstrap.workspace,
    /^\/tmp\/mybot-astryx-workbench\.[^/]+\/workspace$/,
  )
  assert.equal(bootstrap.capabilities.backend_sync, true)
  const project = await api('/projects', {
    name: 'Durable recovery · isolated FakeProvider fixture',
    goal: 'No production accounts, credentials or paid model calls.',
    directory: '.',
  })
  const model = await api('/models', {
    name: 'Durable recovery FakeProvider',
    endpoint: 'http://127.0.0.1:11434/v1',
    model: 'fixture-durable-only',
  })
  async function createRun(goal, name) {
    const task = await api('/tasks', {
      project_id: project.id,
      title: name,
      goal,
      files: ['README.md'],
    })
    const snapshot = await api(`/tasks/${task.id}/preview`, {})
    const run = await api(`/tasks/${task.id}/runs`, {
      coordinator_model: model.id,
      researcher_model: model.id,
      reviewer_model: model.id,
      max_calls: 4,
      parallel: 1,
      minutes: 10,
      max_output_tokens: 1800,
      context_hash: snapshot.context_hash,
      request_id: crypto.randomUUID(),
      consent: true,
    })
    return { task, run }
  }
  const { task, run: source } = await createRun(
    'resource-retry-fixture: verify durable retry receipts using FakeProvider only.',
    'Durable linked retry',
  )
  const before = await waitStatus(source.id, 'failed')
  const facts = JSON.stringify({
    run: before.run,
    calls: before.calls,
    agents: before.agents,
    artifacts: before.artifacts,
  })
  record(
    'A failed research source is produced through the isolated API and FakeProvider',
  )
  let dialog = await openRecovery(source.id)
  const executionsBefore = evidence.requests.filter((item) =>
    item.path.endsWith('/execute'),
  ).length
  await review(dialog, '检查重试范围')
  let ledger = await api(`/runs/${source.id}/recovery-intents`)
  let requestId = ledger.unresolved.request_id
  assert.equal(ledger.unresolved.state, 'prepared')
  assert.equal(
    (await api(`/runs/${source.id}`)).calls.length,
    before.calls.length,
  )
  assert.equal(
    evidence.requests.filter((item) => item.path.endsWith('/execute')).length,
    executionsBefore,
  )
  record(
    'Registering a prepared candidate persists its ID without queuing a run or invoking a provider',
  )
  const originalRequestId = requestId
  let registrationDropped = false
  await context.route(
    `**/api/runs/${source.id}/recovery-intents`,
    async (route) => {
      if (route.request().method() !== 'POST' || registrationDropped)
        return route.continue()
      const body = route.request().postDataJSON()
      assert.notEqual(body.request_id, originalRequestId)
      registrationDropped = true
      const response = await route.fetch({ maxRedirects: 0 })
      assert.equal(response.status(), 200)
      const registered = await response.json()
      assert.equal(registered.state, 'prepared')
      evidence.droppedRegistrations.push(registered)
      await route.abort('failed')
    },
  )
  const budget = dialog.getByRole('spinbutton', {
    name: '本次新增调用预算',
    exact: true,
  })
  await budget.fill('2')
  await budget.press('Tab')
  await dialog
    .getByRole('button', { name: '检查重试范围', exact: true })
    .click()
  await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
  ledger = await api(`/runs/${source.id}/recovery-intents`)
  requestId = ledger.unresolved.request_id
  assert.notEqual(requestId, originalRequestId)
  assert.equal(
    (await api(`/runs/${source.id}/recovery-intents/${originalRequestId}`))
      .state,
    'abandoned',
  )
  await dialog
    .getByRole('button', { name: '重新读取恢复状态', exact: true })
    .click()
  await dialog
    .getByRole('region', { name: '恢复请求回执', exact: true })
    .getByText(requestId, { exact: true })
    .waitFor()
  assert.ok(
    evidence.requests.some(
      (request) =>
        request.method === 'GET' &&
        request.path.endsWith(`/recovery-intents/${requestId}`),
    ),
  )
  assert.equal(executionCount(requestId), 0)
  record(
    'A replacement registration lost after commit reconciles new ID B, not abandoned ID A, without executing either',
  )

  await page.reload()
  await page.getByRole('button', { name: '重试与资源', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog
    .getByRole('region', { name: '恢复请求回执', exact: true })
    .getByText(requestId, { exact: true })
    .waitFor()
  assert.equal(await dialog.getByRole('checkbox').last().isChecked(), false)
  assert.equal(executionCount(requestId), 0)
  await review(dialog, '检查重试范围')
  assert.equal(
    (await api(`/runs/${source.id}/recovery-intents`)).unresolved.request_id,
    requestId,
  )
  await dialog
    .getByRole('checkbox', {
      name: '我确认未知结果可能再次产生费用',
      exact: true,
    })
    .check()
  await dialog
    .getByRole('checkbox', {
      name: '我确认原资料快照、模型和本次新增预算',
      exact: true,
    })
    .check()
  await dropAppliedReceipt(source.id, requestId)
  await dialog
    .getByRole('button', { name: '确认创建关联重试', exact: true })
    .click()
  await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
  assert.equal(executionCount(requestId), 1)
  await shot('retry-lost-receipt-locked')
  record(
    'A response lost after the real retry transaction locks the client without replay',
  )

  await page.reload()
  await page.getByRole('button', { name: '重试与资源', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByText('控制请求已应用', { exact: true }).waitFor()
  const applied = await api(`/runs/${source.id}/recovery-intents/${requestId}`)
  assert.equal(applied.state, 'applied')
  assert.notEqual(applied.target_run_id, source.id)
  await dialog
    .getByRole('link', {
      name: `检查运行 ${applied.target_run_id.slice(0, 8)}`,
      exact: true,
    })
    .waitFor()
  assert.equal(
    await dialog
      .getByRole('button', { name: '确认创建关联重试', exact: true })
      .count(),
    0,
  )
  assert.equal(executionCount(requestId), 1)
  const child = await waitStatus(applied.target_run_id, 'succeeded')
  assert.equal(child.run.source_run_id, source.id)
  assert.equal(child.calls.length, 1)
  const after = await api(`/runs/${source.id}`)
  assert.equal(
    JSON.stringify({
      run: after.run,
      calls: after.calls,
      agents: after.agents,
      artifacts: after.artifacts,
    }),
    facts,
  )
  const afterEvents = new Map(after.events.map((event) => [event.id, event]))
  for (const event of before.events)
    assert.deepEqual(afterEvents.get(event.id), event)
  assert.ok(
    after.events
      .filter((event) => !before.events.some((old) => old.id === event.id))
      .every((event) => event.kind.startsWith('recovery.intent.')),
  )
  assert.equal(after.retry_runs.length, 1)
  await shot('retry-reloaded-exact-applied')
  record(
    'Full reload restores the exact applied receipt and one child while preserving all source facts',
  )
  await api(`/runs/${source.id}/recovery-intents/${requestId}/execute`, {
    consent: true,
    acknowledge_replay: true,
  })
  const allRuns = await api('/bootstrap')
  assert.equal(
    allRuns.runs.filter((item) => item.task_id === task.id).length,
    2,
  )
  assert.equal((await api(`/runs/${child.run.id}`)).calls.length, 1)
  record(
    'An explicitly repeated request ID returns the original receipt without a second child or model call',
  )

  const { run: paused } = await createRun(
    'pause-cancel-fixture: verify durable resume using FakeProvider only.',
    'Durable paused resume',
  )
  await waitStatus(paused.id, 'running')
  await api(`/runs/${paused.id}/pause`, {})
  const checkpoint = await waitStatus(paused.id, 'paused')
  assert.equal(checkpoint.calls.length, 1)
  assert.equal(checkpoint.run.config.call_timeout_seconds, undefined)
  dialog = await openRecovery(paused.id, '继续运行')
  await dialog.getByText(/原运行未固定该值/).waitFor()
  await review(dialog, '检查继续范围')
  const resumeId = (await api(`/runs/${paused.id}/recovery-intents`)).unresolved
    .request_id
  await page.reload()
  await page.getByRole('button', { name: '继续运行', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog
    .getByRole('region', { name: '恢复请求回执', exact: true })
    .getByText(resumeId, { exact: true })
    .waitFor()
  assert.equal(await dialog.getByRole('checkbox').last().isChecked(), false)
  await review(dialog, '检查继续范围')
  await dialog
    .getByRole('checkbox', {
      name: '我确认按原资源继续此暂停运行',
      exact: true,
    })
    .check()
  await dropAppliedReceipt(paused.id, resumeId)
  await dialog
    .getByRole('button', { name: '确认继续运行', exact: true })
    .click()
  await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
  assert.equal(executionCount(resumeId), 1)
  record(
    'Resume registers its original resources without inventing a timeout and requires fresh consent after reload',
  )
  await api(`/runs/${paused.id}/pause`, {})
  const secondCheckpoint = await waitStatus(paused.id, 'paused')
  assert.ok(
    secondCheckpoint.calls.length > checkpoint.calls.length &&
      secondCheckpoint.calls.length < 4,
    'The next pause retains completed progress and still has work to resume',
  )
  assert.ok(secondCheckpoint.calls.every((call) => call.status === 'succeeded'))

  await page.reload()
  await page.getByRole('button', { name: '继续运行', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByText('控制请求已应用', { exact: true }).waitFor()
  const resumed = await api(`/runs/${paused.id}/recovery-intents/${resumeId}`)
  assert.equal(resumed.target_run_id, paused.id)
  assert.equal(executionCount(resumeId), 1)
  await shot('resume-reloaded-applied-history')
  await dialog
    .getByRole('button', { name: '准备新的恢复候选', exact: true })
    .click()
  await review(dialog, '检查继续范围')
  const secondResumeId = (await api(`/runs/${paused.id}/recovery-intents`))
    .unresolved.request_id
  assert.notEqual(secondResumeId, resumeId)
  assert.equal(
    (await api(`/runs/${paused.id}/recovery-intents/${resumeId}`)).state,
    'applied',
  )
  assert.equal(executionCount(secondResumeId), 0)
  await dialog
    .getByRole('checkbox', {
      name: '我确认按原资源继续此暂停运行',
      exact: true,
    })
    .check()
  await dialog
    .getByRole('button', { name: '确认继续运行', exact: true })
    .click()
  const completed = await waitStatus(paused.id, 'succeeded')
  assert.equal(completed.calls.length, 4)
  assert.equal(completed.run.config.call_timeout_seconds, undefined)
  assert.equal(executionCount(resumeId), 1)
  assert.equal(executionCount(secondResumeId), 1)
  await page.reload()
  await page.getByRole('button', { name: '恢复请求记录', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByText('控制请求已应用', { exact: true })
    .waitFor()
  record(
    'A paused-again source can register a fresh explicit candidate without replaying an old applied request',
  )
  record(
    'A completed source retains a read-only history entry for exact resume reconciliation',
  )
  assert.deepEqual(evidence.errors, [])
} catch (error) {
  evidence.failure = {
    message: error.message,
    stack: error.stack,
    url: page.url(),
  }
  await shot('failure')
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  await browser.close()
}
