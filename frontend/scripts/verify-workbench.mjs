import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// This script mutates only the isolated tests/browser_server.py fixture.
// Never point it at the user's production backend.
assert.equal(
  process.env.MYBOT_BROWSER_FIXTURE,
  '1',
  'Explicit fixture opt-in is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.WORKBENCH_EVIDENCE_DIR ?? '/tmp/mybot-workbench-verification',
)
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : 'playwright'
)
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE,
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
})
const errors = []
const writes = []
const evidence = {
  fixture: true,
  scenario: process.env.MYBOT_BROWSER_CASE ?? 'full',
  base,
  checks: [],
  errors,
  writes,
  screenshots: [],
}
await mkdir(out, { recursive: true })
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  if (url.protocol.startsWith('http') && url.origin !== origin)
    return route.abort()
  return route.continue()
})
const page = await context.newPage()
const primaryTaskTitle = '梳理多端协作与 Agent 工作流'
page.on('pageerror', (error) =>
  errors.push({ message: error.message, stack: error.stack, url: page.url() }),
)
page.on('request', (request) => {
  if (request.method() === 'POST') writes.push(new URL(request.url()).pathname)
})
function record(name) {
  evidence.checks.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
async function checkOverflow(name) {
  try {
    await page.waitForFunction(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, null, { timeout: 2000 })
  } catch {
    await page.screenshot({ path: resolve(out, 'overflow-failure.png'), fullPage: true })
    console.log('OVERFLOW', await page.evaluate(() => [...document.querySelectorAll('body *')].map(element => ({ tag: element.tagName, className: typeof element.className === 'string' ? element.className.slice(0, 80) : '', right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })).filter(item => item.width > 0 && item.right > innerWidth + 1)))
  }
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert.ok(
    dimensions.scroll <= dimensions.width + 1,
    `${name}: ${JSON.stringify(dimensions)}`,
  )
  record(`${name}: no horizontal overflow`)
}
async function shot(name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: true })
  evidence.screenshots.push(`${name}.png`)
}
async function api(path, body) {
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
      if (!response.ok) throw new Error(JSON.stringify(value))
      return value
    },
    { path, body },
  )
}
async function waitRun(id, status) {
  await assertPoll(
    async () => (await api(`/runs/${id}`)).run.status === status,
    `${id}: ${status}`,
  )
}
async function assertPoll(check, name) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error(`Timed out: ${name}`)
}
function taskTable(locale = 'zh') {
  return page.getByRole('table', {
    name: locale === 'zh' ? '任务列表' : 'Tasks',
    exact: true,
  })
}
async function inspectTask(title) {
  const trigger = page
    .locator('.wf-results')
    .getByRole('button', { name: title, exact: true })
  await trigger.focus()
  await trigger.click()
  await page
    .locator('.wf-task-inspector')
    .getByRole('heading', { name: title, exact: true })
    .waitFor()
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
  const controlledId = await trigger.getAttribute('aria-controls')
  assert.ok(controlledId)
  assert.equal(
    await page.evaluate((id) => Boolean(document.getElementById(id)), controlledId),
    true,
  )
  return trigger
}
async function selectStatus(label) {
  await page
    .getByRole('navigation', { name: '任务范围', exact: true })
    .getByRole('button', { name: label, exact: true })
    .click()
}
async function assertQuickFindBlocked(targetPage, overlayName) {
  await targetPage.keyboard.press('Control+k')
  assert.equal(
    await targetPage.getByRole('dialog', {
      name: '快速查找',
      exact: true,
    }).count(),
    0,
    `${overlayName} owns the keyboard scope`,
  )
}
async function verifyContextConflict(sourceDetail, bootstrap) {
  const conflictContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const task = { ...structuredClone(sourceDetail.task), title: 'Read-only context conflict task' }
  const project = structuredClone(sourceDetail.project)
  const mockRunId = 'readonly-context-conflict-result'
  const requests = []
  const submissions = []
  let previewCount = 0
  const snapshots = ['a'.repeat(64), 'b'.repeat(64)]
  evidence.contextConflictProjection = {
    synthetic: true,
    backendMutation: false,
    requests,
    submissions,
  }
  await conflictContext.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin)
      return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push({ method: request.method(), path: url.pathname })
    if (url.pathname === '/api/auth/state' && request.method() === 'GET')
      return route.fulfill({ status: 200, json: { authenticated: true, required: false } })
    if (url.pathname === '/api/bootstrap' && request.method() === 'GET')
      return route.fulfill({
        status: 200,
        json: { ...bootstrap, capabilities: { ...bootstrap.capabilities, task_query: false, task_detail: false, workflow_versions: false, isolated_coding: false }, projects: [project], tasks: [task], runs: [] },
      })
    if (url.pathname === `/api/tasks/${task.id}/preview` && request.method() === 'POST') {
      previewCount++
      return route.fulfill({
        status: 200,
        json: {
          context_hash: snapshots[Math.min(previewCount - 1, 1)],
          goal: task.goal,
          acceptance: task.acceptance,
          notes: project.notes,
          text: previewCount === 1 ? 'Original conflict snapshot context' : 'Updated conflict snapshot context',
          bytes: 48,
          evidence: [{ path: 'README.md', bytes: 48 }],
        },
      })
    }
    if (url.pathname === `/api/tasks/${task.id}/runs` && request.method() === 'POST') {
      submissions.push(request.postDataJSON())
      return submissions.length === 1
        ? route.fulfill({
            status: 409,
            json: { detail: 'Context changed after preview; inspect and confirm the latest snapshot' },
          })
        : route.fulfill({ status: 201, json: { id: mockRunId } })
    }
    if (url.pathname === `/api/runs/${mockRunId}` && request.method() === 'GET') {
      const detail = structuredClone(sourceDetail)
      detail.run.id = mockRunId
      detail.task = task
      return route.fulfill({ status: 200, json: detail })
    }
    return route.abort()
  })
  const conflictPage = await conflictContext.newPage()
  conflictPage.on('pageerror', (error) =>
    errors.push({ message: error.message, url: conflictPage.url(), scenario: 'context-conflict-projection' }),
  )
  try {
    await conflictPage.goto(`${base}#workbench`)
    await conflictPage.getByRole('table', { name: '任务列表', exact: true })
      .getByRole('button', { name: task.title, exact: true }).click()
    await conflictPage.locator('.wf-inspector').getByRole('button', {
      name: '检查并运行',
      exact: true,
    }).click()
    const wizard = conflictPage.getByRole('dialog', {
      name: '确认资料与运行资源',
      exact: true,
    })
    await wizard.waitFor()
    await wizard.getByRole('button', { name: '下一步', exact: true }).click()
    await wizard.getByRole('spinbutton', { name: '调用总上限', exact: true }).fill('3')
    await wizard.getByRole('button', { name: '下一步', exact: true }).click()
    await wizard.getByRole('checkbox').check()
    await wizard.getByRole('button', { name: '确认并开始运行', exact: true }).click()
    await wizard.getByRole('button', { name: '重新检查资料', exact: true }).waitFor()
    assert.equal(previewCount, 1, 'A context conflict must not automatically read a new snapshot')
    assert.equal(submissions.length, 1)
    assert.equal(await wizard.getByRole('checkbox').isChecked(), false)
    assert.equal(
      await wizard.getByRole('button', { name: '确认并开始运行', exact: true })
        .getAttribute('aria-disabled'),
      'true',
    )
    await wizard.getByRole('button', { name: '重新检查资料', exact: true }).click()
    await wizard.getByText('Updated conflict snapshot context', { exact: false }).waitFor()
    assert.equal(previewCount, 2)
    await wizard.getByRole('button', { name: '下一步', exact: true }).click()
    assert.equal(
      await wizard.getByRole('spinbutton', { name: '调用总上限', exact: true }).inputValue(),
      '3',
    )
    await wizard.getByRole('button', { name: '下一步', exact: true }).click()
    assert.equal(await wizard.getByRole('checkbox').isChecked(), false)
    await wizard.getByRole('checkbox').check()
    await wizard.getByRole('button', { name: '确认并开始运行', exact: true }).click()
    await conflictPage.waitForURL(new RegExp(`#run/${mockRunId}$`))
    assert.equal(submissions.length, 2)
    assert.equal(submissions[0].context_hash, snapshots[0])
    assert.equal(submissions[1].context_hash, snapshots[1])
    assert.equal(submissions[0].request_id, submissions[1].request_id)
    assert.equal(submissions[1].max_calls, 3)
    for (const role of ['coordinator_model', 'researcher_model', 'reviewer_model'])
      assert.equal(submissions[0][role], submissions[1][role])
    assert.equal(
      requests.filter((request) => request.method !== 'GET')
        .every((request) => [
          `/api/tasks/${task.id}/preview`, `/api/tasks/${task.id}/runs`,
        ].includes(request.path)),
      true,
    )
    record(
      'Mocked 409 context conflict revokes consent, requires explicit recheck and fresh consent, preserves resources/request ID, and submits only the new snapshot hash',
    )
  } finally {
    await conflictContext.close()
  }
}
async function verifyRecoveryWorkflow(sourceDetail, bootstrap) {
  const recoveryContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const sourceId = 'readonly-recovery-source'
  const unknownId = 'readonly-recovery-unknown'
  const childId = 'readonly-recovery-child'
  const pausedId = 'readonly-recovery-paused'
  const modelId = bootstrap.models[0].id
  const defaults = {
    coordinator_model: modelId, researcher_model: modelId, reviewer_model: modelId,
    max_calls: 2, parallel: 1, minutes: 10, max_output_tokens: 1800, call_timeout_seconds: 120,
  }
  const source = structuredClone(sourceDetail)
  source.run = { ...source.run, id: sourceId, status: 'failed', config: { ...defaults, max_calls: 4 } }
  source.calls = source.calls.slice(0, 2).map((call, index) => ({
    ...call, status: index ? 'failed' : 'succeeded',
    input_tokens: index ? null : 20, output_tokens: index ? null : 10,
  }))
  source.retry_runs = []
  const originalFacts = JSON.stringify({
    run: source.run, agents: source.agents, calls: source.calls,
    artifacts: source.artifacts, events: source.events,
  })
  const requests = []
  const submissions = []
  const resumes = []
  const registered = []
  const abandoned = []
  const receipts = new Map()
  let children = []
  let pausedStatus = 'paused'
  evidence.recoveryProjection = {
    synthetic: true, backendMutation: false, requests, submissions, resumes,
    registered, abandoned,
  }
  function preview(id, paused = false) {
    return {
      source_run_id: id, source_status: paused ? pausedStatus : 'failed',
      allowed: true, snapshot_hash: (paused ? 'c' : 'd').repeat(64),
      defaults, minimum_calls: 2, source_call_count: paused ? 1 : 2,
      source_unknown_usage: paused ? 0 : 1, requires_acknowledgement: !paused,
      reuse_step_keys: ['plan'],
      steps: [
        { key: 'plan', role: 'coordinator', title: 'Reusable planning output', action: 'reuse' },
        { key: 'research-0', role: 'researcher', title: 'Unfinished research', action: 'retry' },
        { key: 'synthesis', role: 'reviewer', title: 'Final synthesis', action: 'retry' },
      ],
      context: {
        goal: source.task.goal, acceptance: source.task.acceptance,
        notes: source.project.notes, text: 'Original immutable recovery snapshot',
        evidence: [{ path: 'README.md', bytes: 48 }],
      },
      reused_outputs: [{
        agent_id: source.agents[0].id, step_key: 'plan',
        title: 'Reusable planning output', output: 'Already completed planning body',
      }],
      retry_runs: id === sourceId ? children : [],
    }
  }
  function detail(id) {
    const next = structuredClone(source)
    if (id === childId) {
      next.run = { ...next.run, id, source_run_id: sourceId, status: 'succeeded' }
      next.retry_runs = []
    } else if (id === pausedId) {
      next.run = { ...next.run, id, status: pausedStatus }
      next.calls = next.calls.slice(0, 1)
      next.retry_runs = []
    } else {
      next.run.id = id
      next.retry_runs = id === sourceId ? children : []
    }
    return next
  }
  await recoveryContext.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push({ method: request.method(), path: url.pathname })
    if (url.pathname === '/api/auth/state' && request.method() === 'GET')
      return route.fulfill({ status: 200, json: { authenticated: true, required: false } })
    if (url.pathname === '/api/bootstrap' && request.method() === 'GET')
      return route.fulfill({
        status: 200,
        json: { ...bootstrap, capabilities: { ...bootstrap.capabilities, task_query: false, task_detail: false, workflow_versions: false, isolated_coding: false }, projects: [source.project], tasks: [source.task], runs: [source.run] },
      })
    if (request.method() === 'GET') {
      for (const id of [sourceId, childId, pausedId, unknownId]) {
        if (url.pathname === `/api/runs/${id}`)
          return route.fulfill({ status: 200, json: detail(id) })
        if (url.pathname === `/api/runs/${id}/retry-preview`)
          return route.fulfill({ status: 200, json: preview(id, id === pausedId) })
      }
    }
    const intentRoute = url.pathname.match(/^\/api\/runs\/([^/]+)\/recovery-intents(?:\/([^/]+)(?:\/(execute|abandon))?)?$/)
    if (intentRoute) {
      const [, owner, requestId, action] = intentRoute
      const history = [...receipts.values()].filter((item) => item.source_run_id === owner).reverse()
      const unresolved = history.find((item) => ['prepared', 'applying', 'unknown'].includes(item.state)) ?? null
      if (request.method() === 'GET' && !requestId)
        return route.fulfill({ status: 200, json: {
          latest: history[0] ?? null, unresolved, history, total: history.length, history_truncated: false,
        } })
      if (request.method() === 'GET') {
        const value = receipts.get(requestId)
        return value?.source_run_id === owner
          ? route.fulfill({ status: 200, json: value })
          : route.fulfill({ status: 404, json: { detail: 'receipt_not_found' } })
      }
      if (request.method() === 'POST' && !requestId) {
        const body = request.postDataJSON()
        assert.equal(body.consent, undefined)
        if (unresolved && unresolved.request_id !== body.request_id)
          return route.fulfill({ status: 409, json: { detail: 'recovery_intent_pending' } })
        const value = {
          request_id: body.request_id, source_run_id: owner, mode: body.mode,
          snapshot_hash: body.snapshot_hash, candidate_hash: 'e'.repeat(64),
          config: body.mode === 'resume' ? detail(owner).run.config : body.config,
          state: 'prepared', target_run_id: null, error_code: null,
          requires_acknowledgement: body.mode !== 'resume', outcome_unknown: false,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(), settled_at: null,
        }
        receipts.set(body.request_id, value)
        registered.push(structuredClone(value))
        return route.fulfill({ status: 200, json: value })
      }
      const value = receipts.get(requestId)
      if (!value || value.source_run_id !== owner)
        return route.fulfill({ status: 404, json: { detail: 'receipt_not_found' } })
      if (action === 'abandon') {
        assert.equal(value.state, 'prepared')
        value.state = 'abandoned'
        value.settled_at = new Date().toISOString()
        abandoned.push(requestId)
        return route.fulfill({ status: 200, json: value })
      }
      if (action === 'execute') {
        const body = request.postDataJSON()
        assert.equal(value.state, 'prepared')
        assert.equal(body.consent, true)
        if (value.mode === 'resume') {
          resumes.push(body)
          pausedStatus = 'queued'
          value.state = 'applied'
          value.target_run_id = owner
        } else {
          submissions.push({ ...value.config, ...body, request_id: requestId, snapshot_hash: value.snapshot_hash })
          value.state = owner === unknownId ? 'unknown' : 'applied'
          value.outcome_unknown = owner === unknownId
          value.target_run_id = owner === unknownId ? null : childId
          if (owner === sourceId)
            children = [{ id: childId, status: 'succeeded', created_at: new Date().toISOString() }]
        }
        value.settled_at = new Date().toISOString()
        if (owner === unknownId)
          return route.fulfill({ status: 503, json: { detail: 'submission_outcome_unknown_fixture' } })
        return route.fulfill({ status: 200, json: value })
      }
    }
    return route.abort()
  })
  const recoveryPage = await recoveryContext.newPage()
  recoveryPage.on('pageerror', (error) =>
    errors.push({ message: error.message, url: recoveryPage.url(), scenario: 'recovery-projection' }),
  )
  const dialog = recoveryPage.getByRole('dialog', { name: '重试与资源', exact: true })
  async function checkCandidate() {
    await dialog.getByRole('button', { name: '检查重试范围', exact: true }).click()
    await dialog.getByRole('checkbox', {
      name: '我确认原资料快照、模型和本次新增预算', exact: true,
    }).waitFor()
    await assertPoll(
      async () => await dialog.getByRole('checkbox', {
        name: '我确认原资料快照、模型和本次新增预算', exact: true,
      }).getAttribute('aria-disabled') !== 'true',
      'A freshly reviewed recovery candidate enables consent',
    )
  }
  async function consentToRetry() {
    await dialog.getByRole('checkbox', { name: '我确认未知结果可能再次产生费用', exact: true }).check()
    await dialog.getByRole('checkbox', { name: '我确认原资料快照、模型和本次新增预算', exact: true }).check()
  }
  try {
    await recoveryPage.goto(`${base}#run/${sourceId}`)
    await recoveryPage.getByRole('button', { name: '重试与资源', exact: true }).click()
    await dialog.getByRole('button', { name: '检查重试范围', exact: true }).waitFor()
    assert.equal(submissions.length, 0)
    assert.equal(await dialog.getByRole('combobox', { name: /^规划模型/ }).getAttribute('aria-disabled'), 'true')
    assert.equal(await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).getAttribute('aria-disabled'), 'true')
    await checkCandidate()
    await consentToRetry()
    const retryBudget = dialog.getByRole('spinbutton', {
      name: '本次新增调用预算',
      exact: true,
    })
    await retryBudget.fill('3')
    await retryBudget.press('Tab')
    assert.equal(await dialog.getByRole('checkbox', {
      name: '我确认原资料快照、模型和本次新增预算', exact: true,
    }).isChecked(), false)
    assert.equal(await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).getAttribute('aria-disabled'), 'true')
    await recoveryPage.keyboard.press('Escape')
    const discardRecovery = recoveryPage.getByRole('dialog', {
      name: '放弃恢复资源草稿？',
      exact: true,
    })
    await discardRecovery.waitFor()
    await discardRecovery.locator('.wb-form-actions').getByRole('button', {
      name: '继续编辑',
      exact: true,
    }).click()
    await discardRecovery.waitFor({ state: 'hidden' })
    assert.equal(
      await dialog.getByRole('spinbutton', { name: '本次新增调用预算', exact: true }).inputValue(),
      '3',
    )
    assert.equal(submissions.length, 0)
    await recoveryPage.keyboard.press('Escape')
    await discardRecovery.waitFor()
    await discardRecovery.locator('.wb-form-actions').getByRole('button', {
      name: '放弃更改',
      exact: true,
    }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(submissions.length, 0)
    await recoveryPage.getByRole('button', { name: '重试与资源', exact: true }).click()
    await dialog.getByRole('spinbutton', { name: '本次新增调用预算', exact: true }).fill('3')
    record('Recovery resource drafts require an explicit discard choice; keeping edits retains values and neither choice executes a control')
    await checkCandidate()
    assert.equal(abandoned.length, 1)
    const preparedId = registered.at(-1).request_id
    await recoveryPage.reload()
    await recoveryPage.getByRole('button', { name: '重试与资源', exact: true }).click()
    await dialog.getByRole('region', { name: '恢复请求回执', exact: true })
      .getByText(preparedId, { exact: true }).waitFor()
    assert.equal(submissions.length, 0)
    assert.equal(await dialog.getByRole('checkbox', {
      name: '我确认原资料快照、模型和本次新增预算', exact: true,
    }).isChecked(), false)
    assert.equal(registered.at(-1).request_id, preparedId)
    await checkCandidate()
    assert.equal(registered.at(-1).request_id, preparedId)
    await consentToRetry()
    await recoveryPage.screenshot({ path: resolve(out, 'recovery-retry-desktop.png'), fullPage: false })
    evidence.screenshots.push('recovery-retry-desktop.png')
    await recoveryPage.setViewportSize({ width: 390, height: 844 })
    assert.ok(await recoveryPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await recoveryPage.screenshot({ path: resolve(out, 'recovery-retry-mobile.png'), fullPage: false })
    evidence.screenshots.push('recovery-retry-mobile.png')
    await recoveryPage.setViewportSize({ width: 1440, height: 1000 })
    await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).click()
    await recoveryPage.waitForURL(new RegExp(`#run/${childId}$`))
    assert.equal(submissions.length, 1)
    assert.equal(submissions[0].max_calls, 3)
    assert.equal(submissions[0].snapshot_hash, 'd'.repeat(64))
    assert.equal(submissions[0].consent, true)
    assert.equal(submissions[0].acknowledge_replay, true)
    assert.ok(submissions[0].request_id.length >= 8)
    assert.equal(JSON.stringify({
      run: source.run, agents: source.agents, calls: source.calls,
      artifacts: source.artifacts, events: source.events,
    }), originalFacts)
    record('Mocked native retry locks reused models, invalidates consent after edits, requires replay consent, creates a linked run and preserves source facts')

    await recoveryPage.goto(`${base}#run/${unknownId}`)
    await recoveryPage.getByRole('button', { name: '重试与资源', exact: true }).click()
    await checkCandidate()
    await consentToRetry()
    await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).click()
    await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
    assert.equal(submissions.length, 2)
    assert.equal(await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).count(), 0)
    await recoveryPage.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    await recoveryPage.getByRole('button', { name: '核对恢复请求', exact: true }).click()
    await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
    await dialog.getByRole('button', { name: '重新读取恢复状态', exact: true }).click()
    await dialog.getByText('控制请求结果未知', { exact: true }).waitFor()
    assert.equal(submissions.length, 2)
    await recoveryPage.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    const unknownRequestId = registered.at(-1).request_id
    await recoveryPage.reload()
    await recoveryPage.getByRole('button', { name: '重试与资源', exact: true }).click()
    await dialog.getByRole('region', { name: '恢复请求回执', exact: true })
      .getByText(unknownRequestId, { exact: true }).waitFor()
    await dialog.getByText(/请求结果尚未确认，已锁定此候选/).waitFor()
    assert.equal(await dialog.getByRole('button', { name: '确认创建关联重试', exact: true }).count(), 0)
    assert.equal(await dialog.getByRole('button', { name: '放弃已登记候选', exact: true }).count(), 0)
    assert.equal(submissions.length, 2)
    await recoveryPage.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    record('Durable unknown recovery remains locked across close/reopen and a full reload, with the same exact request ID and GET-only reconciliation')

    await recoveryPage.goto(`${base}#run/${pausedId}`)
    await recoveryPage.getByRole('button', { name: '继续运行', exact: true }).click()
    const resume = recoveryPage.getByRole('dialog', { name: '继续暂停运行', exact: true })
    await resume.getByRole('button', { name: '检查继续范围', exact: true }).click()
    await resume.getByRole('checkbox', { name: '我确认按原资源继续此暂停运行', exact: true }).check()
    await resume.getByRole('button', { name: '确认继续运行', exact: true }).click()
    await assertPoll(
      async () => resumes.length === 1,
      'An explicitly confirmed resume completes its fresh reads before one POST',
    )
    await resume.waitFor({ state: 'hidden' })
    assert.deepEqual(resumes, [{ consent: true, acknowledge_replay: false }])
    assert.equal(submissions.length, 2)
    assert.equal(
      requests.filter((request) => request.method !== 'GET').every((request) =>
        /^\/api\/runs\/readonly-recovery-(source|unknown|paused)\/recovery-intents(?:\/[^/]+\/(?:execute|abandon))?$/.test(request.path),
      ),
      true,
    )
    record('Paused resume uses a registered snapshot and exact durable control receipt, retaining original resources and separate execution consent')
  } finally {
    await recoveryContext.close()
  }
}
async function verifyFormsAndModelReceipts(bootstrap) {
  const formContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  await formContext.addInitScript(() => localStorage.setItem('mybot.locale', 'en'))
  const model = {
    ...structuredClone(bootstrap.models[0]),
    id: 'readonly-model-test-lifecycle',
    name: 'Read-only model lifecycle',
    test_status: 'untested',
    latest_test: null,
  }
  const requests = []
  const testBodies = []
  let projectPosts = 0
  let receiptState = 'running'
  const receipts = new Map()
  evidence.formsAndModelTestsProjection = {
    synthetic: true, backendMutation: false, requests, testBodies,
  }
  function receipt(id, state) {
    return {
      request_id: id, model_id: model.id, state,
      status: state === 'succeeded' ? 'reachable' : state === 'running' ? 'running' : 'provider_timeout_outcome_unknown',
      input_tokens: state === 'succeeded' ? 12 : null,
      output_tokens: state === 'succeeded' ? 34 : null,
      outcome_unknown: state === 'unknown',
      usage_unknown: state !== 'succeeded',
    }
  }
  await formContext.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push({ method: request.method(), path: url.pathname })
    if (url.pathname === '/api/auth/state' && request.method() === 'GET')
      return route.fulfill({ status: 200, json: { authenticated: true, required: false } })
    if (url.pathname === '/api/bootstrap' && request.method() === 'GET')
      return route.fulfill({
        status: 200,
        json: { ...bootstrap, capabilities: { ...bootstrap.capabilities, task_query: false, task_detail: false, workflow_versions: false, isolated_coding: false }, tasks: [], runs: [], models: [model], default_model_id: model.id },
      })
    if (url.pathname === '/api/projects' && request.method() === 'POST') {
      projectPosts++
      return route.fulfill({
        status: 422,
        json: { detail: [{ loc: ['body', 'name'], msg: 'fixture project-name conflict', type: 'value_error' }] },
      })
    }
    if (url.pathname === `/api/models/${model.id}/test` && request.method() === 'POST') {
      const body = request.postDataJSON()
      testBodies.push(body)
      const result = receipt(body.request_id, testBodies.length === 1 ? 'running' : 'succeeded')
      receipts.set(body.request_id, result)
      model.latest_test = result
      model.test_status = result.status
      return route.fulfill({ status: 200, json: result })
    }
    if (url.pathname.startsWith(`/api/models/${model.id}/tests/`) && request.method() === 'GET') {
      const id = decodeURIComponent(url.pathname.split('/').at(-1))
      if (!receipts.has(id)) return route.fulfill({ status: 404, json: { detail: 'receipt_not_found' } })
      const result = receipt(id, receiptState)
      receipts.set(id, result)
      model.latest_test = result
      model.test_status = result.status
      return route.fulfill({ status: 200, json: result })
    }
    return route.abort()
  })
  const formPage = await formContext.newPage()
  formPage.on('pageerror', (error) =>
    errors.push({ message: error.message, url: formPage.url(), scenario: 'forms-model-receipt-projection' }),
  )
  try {
    await formPage.goto(`${base}#projects`)
    await formPage.locator('.wb-page-heading').getByRole('button', {
      name: 'Create project', exact: true,
    }).click()
    const projectForm = formPage.getByRole('dialog', { name: 'Create project', exact: true })
    const name = projectForm.getByLabel(/Project name/)
    await projectForm.getByRole('button', { name: 'Save', exact: true }).click()
    assert.equal(projectPosts, 0)
    await assertPoll(
      () => name.evaluate((element) => element === document.activeElement),
      'Local validation focuses the first invalid field',
    )
    await name.fill('Keep this unsaved project name')
    await projectForm.getByRole('button', { name: 'Save', exact: true }).click()
    await projectForm.locator('[data-form-field="name"]').getByText(
      'fixture project-name conflict', { exact: true },
    ).waitFor()
    assert.equal(projectPosts, 1)
    assert.equal(await name.inputValue(), 'Keep this unsaved project name')
    await assertPoll(
      () => name.evaluate((element) => element === document.activeElement),
      'Structured API field errors restore first-field focus',
    )
    await formPage.keyboard.press('Escape')
    const discard = formPage.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
    await discard.waitFor()
    await discard.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
    await discard.waitFor({ state: 'hidden' })
    assert.equal(await name.inputValue(), 'Keep this unsaved project name')
    const originalHref = formPage.url()
    const navigateToModels = () => formPage.evaluate(() => {
      const link = [...document.querySelectorAll('a[href]')]
        .find((item) => new URL(item.href).hash === '#models')
      if (!link) throw new Error('Models navigation link missing')
      link.click()
    })
    await navigateToModels()
    await discard.waitFor()
    assert.equal(formPage.url(), originalHref)
    await discard.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
    await discard.waitFor({ state: 'hidden' })
    assert.equal(await name.inputValue(), 'Keep this unsaved project name')
    await navigateToModels()
    await discard.waitFor()
    await discard.locator('.wb-form-actions').getByRole('button', { name: 'Discard changes', exact: true }).click()
    await projectForm.waitFor({ state: 'hidden' })
    await formPage.getByRole('heading', { name: 'Models & resources', exact: true }).waitFor()
    assert.equal(projectPosts, 1)
    record('Mocked form validation blocks empty submission, focuses field errors, preserves 422 input and confirms dirty Escape/navigation before discarding')

    await formPage.getByRole('button', { name: 'Test connection', exact: true }).click()
    let testForm = formPage.getByRole('dialog', { name: 'Test model connection', exact: true })
    assert.equal(await testForm.getByRole('button', { name: 'Confirm test', exact: true }).getAttribute('aria-disabled'), 'true')
    await testForm.getByRole('checkbox', { name: 'Confirm one real model request', exact: true }).check()
    await testForm.getByRole('button', { name: 'Confirm test', exact: true }).click()
    await testForm.getByText('Test in progress', { exact: true }).waitFor()
    assert.equal(testBodies.length, 1)
    assert.equal(testBodies[0].consent, true)
    assert.match(testBodies[0].request_id, /^[A-Za-z0-9_-]{8,100}$/)
    receiptState = 'unknown'
    await testForm.getByRole('button', { name: 'Check test receipt', exact: true }).click()
    await testForm.getByText('Test outcome unknown', { exact: true }).waitFor()
    assert.equal(testBodies.length, 1)
    assert.equal(await testForm.getByRole('button', { name: 'Confirm test', exact: true }).getAttribute('aria-disabled'), 'true')
    assert.equal(await testForm.getByRole('button', { name: 'Prepare new test', exact: true }).getAttribute('aria-disabled'), 'true')
    assert.deepEqual(await testForm.locator('.wb-details dd').allTextContents(), ['Unknown', 'Unknown'])
    await testForm.getByRole('checkbox', {
      name: 'I understand the previous outcome or cost is unknown; a new test may incur duplicate charges',
      exact: true,
    }).check()
    await testForm.getByRole('button', { name: 'Prepare new test', exact: true }).click()
    assert.equal(testBodies.length, 1, 'Preparing a new authorization must not invoke a provider')
    assert.equal(await testForm.getByRole('checkbox', {
      name: 'Confirm one real model request', exact: true,
    }).isChecked(), false)
    await testForm.getByRole('checkbox', { name: 'Confirm one real model request', exact: true }).check()
    await testForm.getByRole('button', { name: 'Confirm test', exact: true }).click()
    await testForm.getByText('Connection test succeeded', { exact: true }).waitFor()
    assert.equal(testBodies.length, 2)
    assert.notEqual(testBodies[0].request_id, testBodies[1].request_id)
    assert.deepEqual(await testForm.locator('.wb-details dd').allTextContents(), ['12', '34'])
    await formPage.keyboard.press('Escape')
    await testForm.waitFor({ state: 'hidden' })
    await formPage.reload()
    await formPage.getByRole('button', { name: 'Test connection', exact: true }).click()
    testForm = formPage.getByRole('dialog', { name: 'Test model connection', exact: true })
    await testForm.getByText('Connection test succeeded', { exact: true }).waitFor()
    assert.equal(testBodies.length, 2)
    assert.equal(await testForm.getByRole('checkbox', { name: 'Confirm one real model request', exact: true }).count(), 0)
    assert.equal(
      requests.filter((request) => request.method !== 'GET').every((request) =>
        ['/api/projects', `/api/models/${model.id}/test`].includes(request.path),
      ),
      true,
    )
    record('Mocked model tests use explicit request IDs and consent, reconcile unknown outcomes by GET only, require new authorization for a new test and restore persisted receipts after reload')
  } catch (error) {
    evidence.formsAndModelTestsProjection.failureUrl = formPage.url()
    evidence.formsAndModelTestsProjection.failureText =
      await formPage.locator('body').innerText()
    await formPage.screenshot({
      path: resolve(out, 'forms-model-receipt-failure.png'),
      fullPage: true,
    })
    throw error
  } finally {
    await formContext.close()
  }
}
async function verifyReadOnlySelectionRefresh(sourceDetail) {
  assert.ok(sourceDetail.calls.length > 0, 'A completed fixture call is required')
  const readContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const projection = {
    workspace: '/tmp/mybot-browser-selection-projection',
    projects: [],
    tasks: [],
    runs: [],
    models: [],
    backends: [],
    default_model_id: '',
    local_harnesses: [],
    capabilities: { backend_sync: false },
  }
  const documentTask = {
    ...structuredClone(sourceDetail.task),
    title: 'Read-only selected task context',
    goal: 'Selected task content remains visible when directory search excludes it.',
  }
  const projectionRunId = 'readonly-call-poll-projection'
  const originalCall = structuredClone(sourceDetail.calls[0])
  let callPhase = 'running'
  const requests = []
  evidence.selectionRefreshProjection = {
    synthetic: true,
    readOnly: true,
    requests,
    callPhases: [],
  }
  await readContext.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin)
      return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push({ method: request.method(), path: url.pathname, callPhase })
    if (request.method() !== 'GET') return route.abort()
    if (url.pathname === '/api/auth/state')
      return route.fulfill({
        status: 200,
        json: { authenticated: true, required: false },
      })
    if (url.pathname === '/api/bootstrap')
      return route.fulfill({ status: 200, json: projection })
    if (url.pathname === `/api/runs/${projectionRunId}`) {
      const detail = structuredClone(sourceDetail)
      detail.run = { ...detail.run, id: projectionRunId, status: 'running' }
      detail.task = documentTask
      detail.retry_runs = []
      detail.calls = callPhase === 'missing'
        ? []
        : [{
            ...originalCall,
            status: callPhase,
            duration_ms: callPhase === 'running' ? null : 1234,
            input_tokens: callPhase === 'running'
              ? null
              : callPhase === 'succeeded' ? 101 : 303,
            output_tokens: callPhase === 'running'
              ? null
              : callPhase === 'succeeded' ? 202 : 404,
            error: callPhase === 'failed' ? 'readonly_projection_failure' : null,
            error_detail: callPhase === 'failed'
              ? { fixture: true, diagnostic: 'refreshed-call-error' }
              : {},
          }]
      return route.fulfill({ status: 200, json: detail })
    }
    return route.abort()
  })
  const readPage = await readContext.newPage()
  readPage.on('pageerror', (error) =>
    errors.push({
      message: error.message,
      stack: error.stack,
      url: readPage.url(),
      scenario: 'read-only-selection-refresh',
    }),
  )
  try {
    await readPage.goto(`${base}#documents`)
    await readPage.getByRole('heading', {
      name: '尚无项目资料',
      exact: true,
    }).waitFor()
    projection.projects = [structuredClone(sourceDetail.project)]
    projection.tasks = [documentTask]
    await readPage.getByRole('button', { name: '刷新', exact: true }).click()
    const documentContent = readPage.locator('.wb-doc-content')
    await documentContent.getByRole('heading', {
      name: '项目背景',
      exact: true,
    }).waitFor()
    assert.equal(
      await documentContent.locator('.wb-eyebrow').innerText(),
      sourceDetail.project.name,
    )
    await readPage.locator('.wb-doc-nav').getByRole('button', {
      name: documentTask.title,
      exact: true,
    }).click()
    await documentContent.getByRole('heading', {
      name: documentTask.title,
      exact: true,
    }).waitFor()
    await readPage.getByRole('searchbox', {
      name: '搜索资料目录',
      exact: true,
    }).fill('directory-search-excludes-selected-task')
    assert.equal(
      await readPage.locator('.wb-doc-nav').getByRole('button', {
        name: documentTask.title,
        exact: true,
      }).count(),
      0,
    )
    await documentContent.getByRole('heading', {
      name: documentTask.title,
      exact: true,
    }).waitFor()
    assert.equal(
      await documentContent.locator('#document-objective p').innerText(),
      documentTask.goal,
    )
    await readPage.screenshot({
      path: resolve(out, 'documents-selected-filtered-readonly.png'),
      fullPage: true,
    })
    evidence.screenshots.push('documents-selected-filtered-readonly.png')
    projection.tasks = []
    await readPage.getByRole('button', { name: '刷新', exact: true }).click()
    await documentContent.getByRole('heading', {
      name: '任务资料不可用',
      exact: true,
    }).waitFor()
    await documentContent.getByText(
      '所选任务不在当前项目中，或资料已不可用。',
      { exact: true },
    ).waitFor()
    assert.equal(
      await documentContent.getByRole('heading', {
        name: '项目背景',
        exact: true,
      }).count(),
      0,
    )
    record(
      'Read-only document refresh: empty projects adopt the first arriving project, directory search preserves selected content, and removed selection is explicitly unavailable',
    )

    const backgroundTask = {
      ...documentTask,
      id: 'readonly-background-task',
      title: 'Background active task excluded from Inbox',
    }
    const inboxRun = {
      ...structuredClone(sourceDetail.run),
      id: projectionRunId,
      status: 'failed',
    }
    projection.tasks = [documentTask, backgroundTask]
    projection.runs = [
      inboxRun,
      {
        ...inboxRun,
        id: 'readonly-background-active-run',
        task_id: backgroundTask.id,
        status: 'running',
      },
    ]
    await readPage.goto(`${base}#inbox`)
    await readPage.getByRole('button', { name: '刷新', exact: true }).click()
    await readPage.setViewportSize({ width: 390, height: 844 })
    const inboxTrigger = readPage.locator('.wb-inbox-list').getByRole('button', {
      name: documentTask.title,
      exact: true,
    })
    await inboxTrigger.waitFor()
    assert.equal(await readPage.locator('.wb-inbox-detail').count(), 0)
    assert.equal(await readPage.getByRole('dialog').count(), 0)
    await inboxTrigger.click()
    let inboxDialog = readPage.getByRole('dialog', {
      name: `任务详情 · ${documentTask.title}`,
      exact: true,
    })
    await inboxDialog.waitFor()
    await inboxDialog.getByText(documentTask.goal, { exact: true }).waitFor()
    assert.deepEqual(
      await inboxDialog.locator('.wb-details dd').allTextContents(),
      [
        documentTask.acceptance || '未填写',
        documentTask.files.join(', ') || '未选择',
        '1',
      ],
    )
    assert.equal(
      await inboxDialog.getByRole('link', { name: '打开运行', exact: true })
        .getAttribute('href'),
      `#run/${projectionRunId}`,
    )
    await readPage.keyboard.press('Escape')
    await inboxDialog.waitFor({ state: 'hidden' })
    await assertPoll(
      () => inboxTrigger.evaluate((element) => element === document.activeElement),
      'Mobile Inbox returns focus to its selected task trigger',
    )
    await inboxTrigger.click()
    await inboxDialog.waitFor()
    const updatedGoal = 'Updated selected task context from the latest read-only Bootstrap.'
    projection.tasks = [{ ...documentTask, goal: updatedGoal }, backgroundTask]
    await inboxDialog.getByText(updatedGoal, { exact: true }).waitFor({ timeout: 12_000 })
    projection.tasks = [backgroundTask]
    inboxDialog = readPage.getByRole('dialog', { name: '任务详情', exact: true })
    await inboxDialog.getByRole('heading', {
      name: '所选任务已不在当前结果中',
      exact: true,
    }).waitFor({ timeout: 12_000 })
    assert.equal(
      await inboxDialog.getByRole('heading', {
        name: backgroundTask.title,
        exact: true,
      }).count(),
      0,
    )
    await readPage.keyboard.press('Escape')
    await inboxDialog.waitFor({ state: 'hidden' })
    await readPage.setViewportSize({ width: 1440, height: 1000 })
    record(
      'Read-only mobile Inbox opens selected context in a dialog, restores focus, follows refreshed task content and reports a removed task without selecting another',
    )

    projection.tasks = [documentTask]
    projection.runs = [{
      ...structuredClone(sourceDetail.run),
      id: projectionRunId,
      status: 'succeeded',
    }]
    await readPage.goto(`${base}#hierarchy`)
    await readPage.getByRole('heading', {
      name: '项目层级',
      exact: true,
    }).waitFor()
    await readPage.getByRole('button', { name: '刷新', exact: true }).click()
    const hierarchy = readPage.getByRole('table', {
      name: '项目任务层级',
      exact: true,
    })
    const taskRow = hierarchy.locator('tbody tr').filter({
      hasText: documentTask.title,
    })
    const projectRow = hierarchy.locator('tbody tr').filter({
      hasText: sourceDetail.project.name,
    })
    const taskExpander = taskRow.locator('button[aria-expanded]')
    const projectExpander = projectRow.locator('button[aria-expanded]')
    await taskExpander.waitFor()
    assert.equal(await taskExpander.getAttribute('aria-expanded'), 'false')
    await taskExpander.click()
    await hierarchy.getByRole('link', {
      name: projectionRunId.slice(0, 8),
      exact: true,
    }).waitFor()
    const hierarchyHandle = await hierarchy.elementHandle()
    const hierarchySearch = readPage.getByRole('searchbox', {
      name: '搜索项目层级',
      exact: true,
    })
    await hierarchySearch.fill(projectionRunId)
    await hierarchy.getByRole('link', {
      name: projectionRunId.slice(0, 8),
      exact: true,
    }).waitFor()
    await hierarchySearch.fill('')
    assert.equal(await taskExpander.getAttribute('aria-expanded'), 'true')
    await hierarchy.getByRole('link', {
      name: projectionRunId.slice(0, 8),
      exact: true,
    }).waitFor()
    await projectExpander.click()
    assert.equal(await projectExpander.getAttribute('aria-expanded'), 'false')
    await hierarchySearch.fill(projectionRunId)
    await hierarchy.getByRole('link', {
      name: projectionRunId.slice(0, 8),
      exact: true,
    }).waitFor()
    await hierarchySearch.fill('')
    assert.equal(await projectExpander.getAttribute('aria-expanded'), 'false')
    assert.equal(await hierarchy.locator('tbody tr').count(), 1)
    assert.equal(
      await hierarchy.evaluate((element, original) => element === original, hierarchyHandle),
      true,
      'Hierarchy search does not remount the table',
    )
    assert.equal(
      await hierarchySearch.evaluate((element) => element === document.activeElement),
      true,
      'Hierarchy search keeps input focus while restoring prior expansion',
    )
    record(
      'Read-only hierarchy search auto-expands matching branches, then restores both expanded and collapsed user choices without remounting or losing input focus',
    )

    await readPage.goto(`${base}#run/${projectionRunId}`)
    await readPage.getByRole('heading', {
      name: documentTask.title,
      exact: true,
    }).waitFor()
    await readPage.getByRole('button', { name: '调用 1', exact: true }).click()
    await readPage.getByRole('region', { name: '模型调用', exact: true })
      .getByRole('button', { name: originalCall.id.slice(0, 7), exact: true })
      .click()
    const callDialog = readPage.getByRole('dialog', {
      name: `调用详情 · ${originalCall.id.slice(0, 7)}`,
      exact: true,
    })
    await callDialog.waitFor()
    await assertQuickFindBlocked(readPage, 'Call details dialog')
    const originalDialog = await callDialog.elementHandle()
    const diagnostics = callDialog.locator('.wb-call-diagnostics')
    assert.equal(JSON.parse(await diagnostics.innerText()).status, 'running')
    for (const phase of ['succeeded', 'failed']) {
      callPhase = phase
      await assertPoll(
        async () => JSON.parse(await diagnostics.innerText()).status === phase,
        `Open call dialog receives ${phase} through normal active-run polling`,
      )
      assert.equal(
        await callDialog.evaluate((element, original) => element === original, originalDialog),
        true,
        'Call dialog remains open instead of being reopened',
      )
      const snapshot = JSON.parse(await diagnostics.innerText())
      const expectedInput = phase === 'succeeded' ? 101 : 303
      const expectedOutput = phase === 'succeeded' ? 202 : 404
      assert.equal(snapshot.id, originalCall.id)
      assert.equal(snapshot.input_tokens, expectedInput)
      assert.equal(snapshot.output_tokens, expectedOutput)
      assert.equal(snapshot.duration_ms, 1234)
      assert.equal(
        await readPage.locator('.wb-usage-strip strong').first().innerText(),
        String(expectedInput + expectedOutput),
      )
      if (phase === 'failed') {
        await callDialog.getByText('readonly_projection_failure', {
          exact: true,
        }).waitFor()
        assert.equal(snapshot.error_detail.diagnostic, 'refreshed-call-error')
      } else {
        await callDialog.getByText('无错误记录', { exact: true }).waitFor()
      }
      evidence.selectionRefreshProjection.callPhases.push(snapshot)
    }
    callPhase = 'missing'
    await callDialog.getByText(
      '调用记录暂不可用：最新运行记录中没有此调用，请重新同步后检查。',
      { exact: true },
    ).waitFor()
    await callDialog.locator('.wb-error[role="status"]').waitFor()
    assert.equal(await callDialog.locator('.wb-call-diagnostics').count(), 0)
    assert.equal(
      await callDialog.evaluate((element, original) => element === original, originalDialog),
      true,
    )
    await readPage.screenshot({
      path: resolve(out, 'call-selected-missing-readonly.png'),
      fullPage: true,
    })
    evidence.screenshots.push('call-selected-missing-readonly.png')
    await readPage.keyboard.press('Escape')
    await callDialog.waitFor({ state: 'hidden' })
    assert.deepEqual(requests.filter((request) => request.method !== 'GET'), [])
    assert.equal(
      requests.every((request) =>
        ['/api/auth/state', '/api/bootstrap', `/api/runs/${projectionRunId}`]
          .includes(request.path),
      ),
      true,
    )
    assert.ok(
      requests.filter((request) => request.path === `/api/runs/${projectionRunId}`).length >= 4,
      'Selection refresh must be driven by repeated GET detail responses',
    )
    record(
      'Read-only active-run polling updates the same open call dialog with status, usage and errors, then explicitly reports a removed call without API mutations',
    )
  } finally {
    await readContext.close()
  }
}
async function verifyPageInventory(project, runId) {
  const routes = [
    ['overview', '工作总览', 'overview'],
    ['workbench', '任务', 'workbench'],
    ['inbox', '待处理', 'inbox'],
    ['projects', '项目', 'projects'],
    [`project/${project.id}`, project.name, 'project-detail'],
    ['hierarchy', '项目层级', 'hierarchy'],
    ['documents', '项目资料', 'documents'],
    ['models', '模型与资源', 'models'],
    ['backends', '会话后端', 'backends'],
    [`run/${runId}`, primaryTaskTitle, 'run'],
  ]
  const startingWrites = writes.length
  evidence.pageAudit = []
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [hash, heading, id] of routes) {
      await page.goto(`${base}#${hash}`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      await page.waitForFunction(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      )
      evidence.pageAudit.push({
        page: id,
        width,
        ...await page.evaluate(() => ({
          title: document.title,
          viewportWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          h1Count: document.querySelectorAll('main h1').length,
        })),
      })
      await shot(`audit-${id}-${width}`)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const [route, command, title] of [
    ['projects', '创建项目', '创建项目'],
    ['models', '添加模型', '添加模型'],
    ['backends', '添加后端', '添加会话后端'],
  ]) {
    await page.goto(`${base}#${route}`)
    await page.locator('.wb-page-heading').getByRole('button', {
      name: command,
      exact: true,
    }).click()
    const form = page.getByRole('dialog', { name: title, exact: true })
    await form.waitFor()
    await shot(`audit-form-${route}`)
    await form.locator('.wb-dialog-head').getByRole('button', { name: '关闭', exact: true }).click()
    await form.waitFor({ state: 'hidden' })
  }
  assert.equal(writes.length, startingWrites, 'Read-only page/form audit must not write or invoke a provider')
  record('Page inventory: 10 routes at 1440/1024/390px and three configuration forms render without overflow or API writes')
  await page.goto(`${base}#overview`)
  await page.getByRole('heading', { name: '工作总览', exact: true }).waitFor()
}
async function verifyReadOnlyPagination() {
  const projectionTasks = Array.from({ length: 45 }, (_, index) => ({
    id: `pg${String(index + 1).padStart(5, '0')}-pagination-task`,
    project_id: 'pagination-project',
    title: `Pagination task ${String(45 - index).padStart(2, '0')}`,
    goal: 'Synthetic read-only pagination projection; no provider request.',
    acceptance: '',
    files: [],
  }))
  projectionTasks[0].title += ` ${'Long localized task label for truncation verification '.repeat(8).trim()}`
  const projection = {
    workspace: '/tmp/mybot-browser-readonly-projection',
    projects: [
      {
        id: 'pagination-project',
        name: 'Pagination fixture',
        goal: 'Read-only browser projection',
        notes: '',
        directory: '',
      },
      {
        id: 'pagination-empty-project',
        name: 'Empty pagination project',
        goal: 'Read-only project scope with no matching tasks',
        notes: '',
        directory: '',
      },
    ],
    tasks: projectionTasks,
    runs: [],
    models: [],
    backends: [],
    default_model_id: '',
    local_harnesses: [],
    capabilities: { backend_sync: false },
  }
  const projectionContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  const projectionRequests = []
  evidence.paginationProjection = {
    synthetic: true,
    readOnly: true,
    taskCount: projectionTasks.length,
    requests: projectionRequests,
  }
  await projectionContext.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin)
      return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    projectionRequests.push({ method: request.method(), path: url.pathname })
    if (request.method() !== 'GET') return route.abort()
    if (url.pathname === '/api/auth/state')
      return route.fulfill({
        status: 200,
        json: { authenticated: true, required: false },
      })
    if (url.pathname === '/api/bootstrap')
      return route.fulfill({ status: 200, json: projection })
    return route.abort()
  })
  const projectionPage = await projectionContext.newPage()
  projectionPage.on('pageerror', (error) =>
    errors.push({
      message: error.message,
      stack: error.stack,
      url: projectionPage.url(),
      scenario: 'read-only-pagination',
    }),
  )
  const table = projectionPage.getByRole('table', {
    name: '任务列表',
    exact: true,
  })
  const idPrefixes = (tasks) => tasks.map((task) => task.id.slice(0, 7))
  const scopeNav = projectionPage.getByRole('navigation', {
    name: '任务范围',
    exact: true,
  })
  function listParams() {
    const url = new URL(projectionPage.url())
    const parameters = new URLSearchParams(url.search)
    new URLSearchParams(url.hash.split('?')[1] ?? '').forEach((value, key) =>
      parameters.set(key, value),
    )
    return parameters
  }
  async function expectScope(name, pressed = true) {
    await scopeNav.getByRole('button', { name, exact: true }).waitFor()
    assert.equal(
      await scopeNav.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'),
      String(pressed),
    )
  }
  async function assertRows(tasks) {
    const expected = idPrefixes(tasks)
    await assertPoll(
      async () => {
        const actual = await table
          .locator('tbody tr .wf-task-id')
          .allTextContents()
        return actual.length === expected.length &&
          actual.every((id, index) => id === expected[index])
      },
      `Pagination renders expected task IDs: ${expected.join(', ')}`,
    )
    assert.equal(await table.locator('tbody tr').count(), tasks.length)
    assert.deepEqual(
      await table.locator('tbody tr .wf-task-id').allTextContents(),
      expected,
    )
  }
  async function assertPageState(expectedPage, expectedSize, expectedRows) {
    await assertPoll(
      async () =>
        await table.locator('tbody tr').count() === expectedRows &&
        await projectionPage.locator('.wf-pagination output').innerText() ===
          `${expectedPage} / ${Math.ceil(projectionTasks.length / expectedSize)}`,
      `Pagination restores page ${expectedPage}, size ${expectedSize}`,
    )
    const parameters = listParams()
    assert.equal(Number(parameters.get('page') ?? '1'), expectedPage)
    assert.equal(Number(parameters.get('pageSize') ?? '20'), expectedSize)
    assert.match(
      await projectionPage.getByRole('combobox', {
        name: /^每页任务数/,
      }).innerText(),
      new RegExp(String(expectedSize)),
    )
  }
  async function assertDesktopBlueprint() {
    const primary = projectionPage.locator('.wf-querybar-primary')
    assert.equal(await primary.count(), 1)
    assert.equal(await projectionPage.locator('.wf-content-shell').count(), 0)
    const elements = [
      primary.getByRole('searchbox', { name: '搜索', exact: true }),
      primary.getByRole('button', { name: /^项目(?:\s|$)/ }),
      primary.getByRole('button', { name: /^状态(?:\s|$)/ }),
      primary.getByRole('radio', { name: '基本搜索', exact: true }),
      primary.getByRole('radio', { name: 'JQL', exact: true }),
      primary.getByRole('button', { name: '搜索', exact: true }),
    ]
    const boxes = []
    for (const element of elements) {
      await element.waitFor({ state: 'visible' })
      const box = await element.boundingBox()
      assert.ok(box)
      boxes.push(box)
    }
    const centers = boxes.map((box) => box.y + box.height / 2)
    assert.ok(
      Math.max(...centers) - Math.min(...centers) <= 6,
      `1440px query controls share one row: ${JSON.stringify(boxes)}`,
    )
    const primaryBox = await primary.boundingBox()
    assert.ok(boxes[0].width >= 280, 'Search is no longer squeezed by view and column tools')
    const resultToolbar = projectionPage.locator('.wf-results-toolbar')
    const resultControls = [
      resultToolbar.getByRole('radio', { name: '任务列表', exact: true }),
      resultToolbar.getByRole('radio', { name: '看板', exact: true }),
      resultToolbar.getByRole('radio', { name: '运行记录', exact: true }),
      resultToolbar.getByRole('button', { name: '列设置', exact: true }),
    ]
    const resultBoxes = []
    for (const element of resultControls) {
      await element.waitFor({ state: 'visible' })
      resultBoxes.push(await element.boundingBox())
    }
    const resultCenters = resultBoxes.map((box) => box.y + box.height / 2)
    assert.ok(Math.max(...resultCenters) - Math.min(...resultCenters) <= 6)
    const resultBox = await resultToolbar.boundingBox()
    assert.ok(resultBox.y >= primaryBox.y + primaryBox.height, 'Result tools follow the single query row')
    const columnsBox = resultBoxes.at(-1)
    const lastViewBox = resultBoxes.at(-2)
    assert.ok(columnsBox.x >= lastViewBox.x + lastViewBox.width - 1)
    assert.ok(
      resultBox.x + resultBox.width - columnsBox.x - columnsBox.width <= 32,
      'Columns control stays at the upper-right edge of results, outside the query row',
    )
    const geometry = await projectionPage.evaluate(() => {
      const rect = (selector) => {
        const node = document.querySelector(selector)
        const box = node?.getBoundingClientRect()
        return box ? {
          x: box.x, y: box.y, width: box.width, height: box.height,
          bottom: box.bottom, right: box.right,
        } : null
      }
      return {
        display: getComputedStyle(document.querySelector('.wf-page')).display,
        topbar: rect('.wb-topbar'),
        scope: rect('.wf-scope-rail'),
        heading: rect('.wf-heading'),
        workspace: rect('.wf-workspace'),
      }
    })
    assert.equal(geometry.display, 'grid')
    assert.ok(geometry.scope && geometry.heading && geometry.workspace && geometry.topbar)
    assert.ok(Math.abs(geometry.scope.y - geometry.heading.y) <= 2, JSON.stringify(geometry))
    assert.ok(geometry.heading.y >= geometry.topbar.bottom - 1, JSON.stringify(geometry))
    assert.ok(geometry.heading.y <= geometry.topbar.bottom + 32, JSON.stringify(geometry))
    assert.ok(geometry.workspace.x > geometry.scope.x, JSON.stringify(geometry))
    assert.equal(
      await projectionPage.locator('.wf-querybar').getByRole('combobox', {
        name: /^排序(?:\s|$)/,
      }).count(),
      0,
    )
    assert.equal(
      await projectionPage.locator('.wf-heading').getByRole('button', {
        name: /^排序(?:\s|$)/,
      }).count(),
      0,
    )
    assert.equal(
      await projectionPage.locator('.wf-querybar').getByRole('button', {
        name: '收起筛选条件',
        exact: true,
      }).count(),
      0,
    )
    assert.equal(
      await scopeNav.locator('.wf-scope-header').getByRole('button', {
        name: '收起筛选条件',
        exact: true,
      }).count(),
      1,
    )
    assert.equal(
      await projectionPage.locator('.wf-heading .wf-result-count[role="status"]').count(),
      1,
    )
    const closedTipsAreHidden = await projectionPage.locator('.wf-heading [role=tooltip]').evaluateAll(tips =>
      tips.every(tip => tip.matches(':popover-open') || getComputedStyle(tip).display === 'none'),
    )
    assert.ok(closedTipsAreHidden, 'Page heading styles must not reveal a closed vendor tooltip')
    const paginationControl = projectionPage.getByRole('combobox', {
      name: /^每页任务数/,
    })
    assert.equal(
      await paginationControl.evaluate((element) =>
        Boolean(element.closest('.wf-pagination')),
      ),
      true,
    )
    evidence.paginationProjection.layout = { ...geometry, queryControlBoxes: boxes, resultControlBoxes: resultBoxes }
    await projectionPage.screenshot({
      path: resolve(out, 'layout-full-shell-columns-desktop.png'),
      fullPage: false,
    })
    evidence.screenshots.push('layout-full-shell-columns-desktop.png')
    record('Workbench layout: aligned scope/page headings, one usable query row, and separate result view controls with Columns at the table upper right')
  }
  async function assertListScrollLayout() {
    const body = projectionPage.locator('.wf-list-body')
    await body.waitFor({ state: 'visible' })
    const before = await body.evaluate((element) => {
      const footer = document.querySelector('.wf-pagination').getBoundingClientRect()
      const box = element.getBoundingClientRect()
      return {
        viewport: innerHeight,
        documentTop: document.scrollingElement.scrollTop,
        documentHeight: document.documentElement.scrollHeight,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: getComputedStyle(element).overflowY,
        bodyBottom: box.bottom,
        footerTop: footer.top,
        footerBottom: footer.bottom,
      }
    })
    assert.ok(before.scrollHeight > before.clientHeight + 100, JSON.stringify(before))
    assert.ok(['auto', 'scroll'].includes(before.overflowY), JSON.stringify(before))
    assert.ok(before.footerBottom <= before.viewport + 1, JSON.stringify(before))
    assert.ok(before.footerBottom >= before.viewport - 100, JSON.stringify(before))
    assert.ok(before.bodyBottom <= before.footerTop + 2, JSON.stringify(before))
    assert.ok(before.documentHeight <= before.viewport + 1, JSON.stringify(before))
    await body.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await assertPoll(
      () => body.evaluate((element) => element.scrollTop > 100),
      'Only task-list body scrolls through the 45-row result',
    )
    const after = await projectionPage.evaluate(() => ({
      documentTop: document.scrollingElement.scrollTop,
      footerBottom: document.querySelector('.wf-pagination').getBoundingClientRect().bottom,
    }))
    assert.equal(after.documentTop, before.documentTop)
    assert.ok(Math.abs(after.footerBottom - before.footerBottom) <= 1)
    await body.evaluate((element) => { element.scrollTop = 0 })
    evidence.paginationProjection.scrollLayout = { before, after }
    record('Blueprint scrolling: 45 rows scroll inside the list body while pagination stays near the viewport bottom')
  }
  const columnsTrigger = projectionPage.getByRole('button', {
    name: '列设置',
    exact: true,
  })
  async function closeColumnsMenus() {
    for (let index = 0; index < 3; index++) {
      if (!await projectionPage.getByRole('menu').count()) break
      await projectionPage.keyboard.press('Escape')
    }
    assert.equal(await projectionPage.getByRole('menu').count(), 0)
    await assertPoll(
      () => columnsTrigger.evaluate((element) => element === document.activeElement),
      'Columns menu restores its trigger focus',
    )
  }
  async function openColumnsMenu() {
    const projectColumn = projectionPage.getByRole('menuitemcheckbox', {
      name: '项目',
      exact: true,
    })
    if (!await projectColumn.isVisible()) await columnsTrigger.click()
    await projectColumn.waitFor({ state: 'visible' })
    return projectColumn
  }
  async function setColumnsSort(label) {
    await openColumnsMenu()
    await projectionPage.getByRole('menuitem', { name: /^排序:/ }).click()
    await projectionPage.getByRole('menuitemradio', { name: label, exact: true }).click()
    await closeColumnsMenus()
  }
  async function verifyColumnsSelection(expectedRows) {
    const beforeUrl = projectionPage.url()
    const initialHeaders = await table.getByRole('columnheader').allTextContents()
    let projectColumn = await openColumnsMenu()
    const mandatoryTitle = projectionPage.getByRole('menuitemcheckbox', {
      name: '任务',
      exact: true,
    })
    assert.equal(await mandatoryTitle.getAttribute('aria-checked'), 'true')
    assert.equal(await mandatoryTitle.getAttribute('aria-disabled'), 'true')
    await assertQuickFindBlocked(projectionPage, 'Columns menu')
    assert.equal(await projectColumn.getAttribute('aria-checked'), 'true')
    await projectionPage.screenshot({
      path: resolve(out, 'columns-menu-full-shell-desktop.png'),
      fullPage: false,
    })
    evidence.screenshots.push('columns-menu-full-shell-desktop.png')
    await projectColumn.click()
    await closeColumnsMenus()
    assert.equal(
      await table.getByRole('columnheader', { name: '项目', exact: true }).count(),
      0,
    )
    assert.equal(projectionPage.url(), beforeUrl)
    await assertRows(expectedRows)
    await projectionPage.reload()
    await table.waitFor()
    await assertRows(expectedRows)
    assert.equal(projectionPage.url(), beforeUrl)
    assert.equal(
      await table.getByRole('columnheader', { name: '项目', exact: true }).count(),
      0,
      'Optional visible columns persist without changing the shared query URL',
    )
    projectColumn = await openColumnsMenu()
    assert.equal(await projectColumn.getAttribute('aria-checked'), 'false')
    await projectColumn.click()
    await closeColumnsMenus()
    await table.getByRole('columnheader', { name: '项目', exact: true }).waitFor()
    assert.equal(projectionPage.url(), beforeUrl)
    projectColumn = await openColumnsMenu()
    await projectColumn.click()
    await closeColumnsMenus()
    assert.equal(
      await table.getByRole('columnheader', { name: '项目', exact: true }).count(),
      0,
    )
    await openColumnsMenu()
    await projectionPage.getByRole('menuitem', { name: '重置列', exact: true }).click()
    await closeColumnsMenus()
    assert.deepEqual(
      await table.getByRole('columnheader').allTextContents(),
      initialHeaders,
    )
    assert.equal(projectionPage.url(), beforeUrl)
    record('Columns menu hides, restores and resets real optional columns, keeps title required, preserves shared query state and returns keyboard focus')
  }
  async function verifyDensityAndAccent() {
    const search = projectionPage.getByRole('searchbox', {
      name: '搜索',
      exact: true,
    })
    const draft = 'unsubmitted-density-and-accent-draft'
    await search.fill(draft)
    const beforeUrl = projectionPage.url()
    const beforeStyle = await projectionPage.locator('.wb-theme').getAttribute('data-style')
    const measurements = []
    const primary = projectionPage.locator('.wf-querybar-primary')
    const button = projectionPage.locator('.wb-sidebar').getByRole('button', {
      name: '偏好设置',
      exact: true,
    })
    const preferences = projectionPage.getByRole('dialog', {
      name: '偏好设置',
      exact: true,
    })
    async function choosePreference(label) {
      await button.click()
      await preferences.getByRole('radio', { name: label, exact: true }).click()
      await projectionPage.keyboard.press('Escape')
      await preferences.waitFor({ state: 'hidden' })
    }
    async function height(locator) {
      const box = await locator.boundingBox()
      assert.ok(box)
      return box.height
    }
    for (const [density, label] of [
      ['comfortable', '舒适'],
      ['compact', '紧凑'],
      ['touch', '触控'],
    ]) {
      await choosePreference(label)
      await projectionPage.locator(`.wb-theme[data-density="${density}"]`).waitFor()
      const rowHeight = await table.locator('tbody tr').nth(1)
        .evaluate((element) => element.getBoundingClientRect().height)
      // Measure product-owned frames, not an inner input's text line box.
      const controlHeights = {
        input: await height(primary.locator('.wf-search-input')),
        project: await height(primary.locator('.wf-inline-filter').nth(0)),
        status: await height(primary.locator('.wf-inline-filter').nth(1)),
        submit: await height(primary.getByRole('button', { name: '搜索', exact: true })),
        columns: await height(columnsTrigger),
        queryMode: await height(primary.locator('.wf-query-mode')),
        views: await height(projectionPage.locator('.wf-result-view')),
      }
      const optionHeights = {
        basic: await height(primary.getByRole('radio', { name: '基本搜索', exact: true })),
        jql: await height(primary.getByRole('radio', { name: 'JQL', exact: true })),
        tasks: await height(projectionPage.getByRole('radio', { name: '任务列表', exact: true })),
        board: await height(projectionPage.getByRole('radio', { name: '看板', exact: true })),
        runs: await height(projectionPage.getByRole('radio', { name: '运行记录', exact: true })),
      }
      const frameHeights = Object.values(controlHeights)
      assert.ok(
        Math.max(...frameHeights) - Math.min(...frameHeights) <= 2,
        `Toolbar frames share one density profile: ${JSON.stringify(controlHeights)}`,
      )
      const radioHeights = Object.values(optionHeights)
      assert.ok(Math.max(...radioHeights) - Math.min(...radioHeights) <= 2)
      assert.equal(await search.inputValue(), draft)
      assert.equal(projectionPage.url(), beforeUrl)
      assert.equal(await table.locator('tbody tr').count(), 45)
      measurements.push({ density, rowHeight, controlHeights, optionHeights })
    }
    const comfortable = measurements.find((item) => item.density === 'comfortable')
    const compact = measurements.find((item) => item.density === 'compact')
    const touch = measurements.find((item) => item.density === 'touch')
    assert.ok(compact.rowHeight < comfortable.rowHeight)
    assert.ok(comfortable.rowHeight < touch.rowHeight)
    for (const kind of Object.keys(comfortable.controlHeights)) {
      assert.ok(
        compact.controlHeights[kind] < comfortable.controlHeights[kind] &&
        comfortable.controlHeights[kind] < touch.controlHeights[kind],
        `${kind} follows compact < comfortable < touch: ${JSON.stringify(measurements)}`,
      )
    }
    const accentBefore = await projectionPage.locator('.wb-theme')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--color-accent').trim())
    await choosePreference('青色')
    await projectionPage.locator('.wb-theme[data-accent="teal"]').waitFor()
    const accentAfter = await projectionPage.locator('.wb-theme')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--color-accent').trim())
    assert.notEqual(accentAfter, accentBefore)
    assert.equal(await projectionPage.locator('.wb-theme').getAttribute('data-style'), beforeStyle)
    assert.equal(await projectionPage.locator('.wb-theme').getAttribute('data-density'), 'touch')
    assert.equal(await search.inputValue(), draft)
    assert.equal(projectionPage.url(), beforeUrl)
    await choosePreference('跟随样式')
    await projectionPage.locator('.wb-theme[data-accent="theme"]').waitFor()
    await choosePreference('舒适')
    await search.fill('')
    evidence.paginationProjection.densityControls = measurements
    evidence.paginationProjection.accent = { before: accentBefore, after: accentAfter }
    record('Global compact/comfortable/touch density changes real row and shared-control heights without discarding a pending search draft')
    record('Independent accent tokens change without changing style, density, URL, pending draft or API state')
  }
  try {
    await projectionPage.goto(`${base}#workbench`)
    await table.waitFor()
    await assertRows(projectionTasks.slice(0, 20))
    await assertDesktopBlueprint()
    assert.equal(
      await projectionPage.getByRole('navigation', {
        name: '任务范围',
        exact: true,
        includeHidden: true,
      }).count(),
      1,
    )
    const firstRow = table.locator('tbody tr').first()
    await firstRow.getByRole('button', {
      name: projectionTasks[0].title,
      exact: true,
    }).waitFor()
    const rowHeights = await table.locator('tbody tr').evaluateAll((rows) =>
      rows.slice(0, 2).map((row) => row.getBoundingClientRect().height),
    )
    assert.ok(rowHeights[0] <= rowHeights[1] + 8, 'Long title remains one compact table row')
    const countFits = await table.locator('.wf-history-button').evaluateAll(buttons =>
      buttons.every(button => {
        const count = button.querySelector('.wf-run-count')
        const root = button.getBoundingClientRect()
        const content = count?.getBoundingClientRect()
        return content && content.right <= root.right && content.left >= root.left && count.scrollWidth <= count.clientWidth
      }),
    )
    assert.ok(countFits, 'Run-history counters fit without clipping')
    await firstRow.getByRole('button', {
      name: projectionTasks[0].title,
      exact: true,
    }).click()
    await projectionPage.locator('.wf-inspector').getByRole('heading', {
      name: projectionTasks[0].title,
      exact: true,
    }).waitFor()
    assert.equal(await scopeNav.count(), 0, '1440px Inspector suppresses the docked scope')
    const inspectorTableWidth = await projectionPage.locator('.wf-desktop-table')
      .evaluate((element) => element.getBoundingClientRect().width)
    assert.ok(inspectorTableWidth >= 720, `Inspector table width: ${inspectorTableWidth}`)
    await projectionPage.setViewportSize({ width: 390, height: 844 })
    const resizedInspector = projectionPage.getByRole('dialog', {
      name: /^任务详情 · /,
    })
    await resizedInspector.waitFor()
    await projectionPage.keyboard.press('Escape')
    await resizedInspector.waitFor({ state: 'hidden' })
    const visibleTaskTrigger = projectionPage.locator('.wf-mobile-list')
      .getByRole('button', {
        name: projectionTasks[0].title,
        exact: true,
      })
    await assertPoll(
      () => visibleTaskTrigger.evaluate((element) =>
        element === document.activeElement &&
        element.getClientRects().length > 0 &&
        !element.closest('.wf-desktop-table'),
      ),
      'Resized Inspector returns focus to visible mobile task title',
    )
    await projectionPage.setViewportSize({ width: 1440, height: 1000 })
    await table.waitFor({ state: 'visible' })
    await assertRows(projectionTasks.slice(0, 20))
    assert.equal(await projectionPage.locator('.wf-task-inspector').count(), 0)
    await scopeNav.waitFor({ state: 'visible' })
    record(
      'Open desktop Inspector survives mobile resize; Escape restores visible mobile title focus, not a hidden desktop trigger',
    )
    const dockTrigger = scopeNav.locator('.wf-scope-header').getByRole('button', {
      name: '收起筛选条件',
      exact: true,
    })
    await projectionPage.locator('.wf-page.has-scope').waitFor()
    const dockedWidth = await projectionPage.locator('.wf-workspace')
      .evaluate((element) => element.getBoundingClientRect().width)
    await dockTrigger.click()
    await scopeNav.waitFor({ state: 'hidden' })
    await projectionPage.locator('.wf-page.has-collapsed-scope').waitFor()
    await assertPoll(
      async () => await projectionPage.locator('.wf-workspace')
        .evaluate((element) => element.getBoundingClientRect().width) >= dockedWidth + 140,
      'Collapsed scope layout reclaims the released grid track',
    )
    const expandedWidth = await projectionPage.locator('.wf-workspace')
      .evaluate((element) => element.getBoundingClientRect().width)
    assert.ok(expandedWidth >= dockedWidth + 140, `Collapsed scope reclaims width: ${dockedWidth} -> ${expandedWidth}`)
    const expandTrigger = projectionPage.locator('.wf-scope-collapsed').getByRole('button', {
      name: '展开筛选条件',
      exact: true,
    })
    await expandTrigger.click()
    await scopeNav.waitFor({ state: 'visible' })
    await expectScope('所有任务')
    await assertPoll(
      async () => Math.abs(await projectionPage.locator('.wf-workspace')
        .evaluate((element) => element.getBoundingClientRect().width) - dockedWidth) <= 2,
      'Expanded scope layout restores the original content width',
    )
    await setColumnsSort('名称 Z-A')
    await assertRows([...projectionTasks].sort((a, b) => b.title.localeCompare(a.title, 'zh-CN')).slice(0, 20))
    assert.equal(listParams().get('order'), 'title:descending')
    await setColumnsSort('默认顺序')
    await assertRows(projectionTasks.slice(0, 20))
    record('Blueprint filter-header collapse reclaims content width and the collapsed rail restores its remembered scope')
    assert.equal(
      await projectionPage.getByRole('button', {
        name: '上一页',
        exact: true,
      }).getAttribute('aria-disabled'),
      'true',
    )
    await projectionPage.getByRole('button', {
      name: '下一页',
      exact: true,
    }).click()
    await assertRows(projectionTasks.slice(20, 40))
    await assertPageState(2, 20, 20)
    await projectionPage.reload()
    await table.waitFor()
    await assertRows(projectionTasks.slice(20, 40))
    await assertPageState(2, 20, 20)
    await projectionPage.getByRole('button', {
      name: '上一页',
      exact: true,
    }).click()
    await assertRows(projectionTasks.slice(0, 20))

    await table
      .getByRole('columnheader', { name: '任务', exact: false })
      .getByRole('button')
      .first()
      .click()
    assert.equal(await table.locator('th[aria-sort="ascending"]').count(), 1)
    const sorted = [...projectionTasks].sort((a, b) =>
      a.title.localeCompare(b.title, 'zh-CN'),
    )
    await assertRows(sorted.slice(0, 20))
    await projectionPage.getByRole('button', {
      name: '下一页',
      exact: true,
    }).click()
    await assertRows(sorted.slice(20, 40))
    assert.equal(listParams().get('order'), 'title:ascending')
    await projectionPage.setViewportSize({ width: 390, height: 844 })
    const mobileRows = projectionPage.locator('.wf-mobile-row')
    await mobileRows.first().waitFor({ state: 'visible' })
    assert.deepEqual(
      await mobileRows.locator('.wf-mobile-meta code').allTextContents(),
      idPrefixes(sorted.slice(20, 40)),
    )
    await mobileRows.first().getByRole('button', {
      name: sorted[20].title,
      exact: true,
    }).waitFor()
    assert.equal(await projectionPage.locator('.wf-pagination output').innerText(), '2 / 3')
    await projectionPage.screenshot({
      path: resolve(out, 'pagination-mobile-sort-390.png'),
      fullPage: true,
    })
    evidence.screenshots.push('pagination-mobile-sort-390.png')
    await projectionPage.setViewportSize({ width: 1440, height: 1000 })
    await table.waitFor({ state: 'visible' })
    await assertRows(sorted.slice(20, 40))
    await projectionPage.getByRole('button', {
      name: '下一页',
      exact: true,
    }).click()
    await assertRows(sorted.slice(40))
    assert.equal(await projectionPage.locator('.wf-pagination output').innerText(), '3 / 3')
    assert.equal(
      await projectionPage.getByRole('button', {
        name: '下一页',
        exact: true,
      }).getAttribute('aria-disabled'),
      'true',
    )
    const lastPageHref = projectionPage.url()
    await projectionPage.getByRole('combobox', {
      name: /^每页任务数/,
    }).click()
    await projectionPage.getByRole('option', {
      name: '每页 50',
      exact: true,
    }).click()
    await assertRows(sorted)
    assert.equal(await projectionPage.locator('.wf-pagination output').innerText(), '1 / 1')
    await assertListScrollLayout()
    assert.equal(
      await table.locator('tbody tr').first().locator('.wf-task-id').innerText(),
      sorted[0].id.slice(0, 7),
    )
    assert.equal(
      await table.locator('tbody tr').last().locator('.wf-task-id').innerText(),
      sorted.at(-1).id.slice(0, 7),
    )
    const fullCapacityHref = projectionPage.url()
    await projectionPage.reload()
    await table.waitFor()
    await assertRows(sorted)
    await assertPageState(1, 50, 45)
    assert.equal(listParams().get('order'), 'title:ascending')
    await projectionPage.goBack()
    await table.waitFor()
    assert.equal(projectionPage.url(), lastPageHref)
    await assertRows(sorted.slice(40))
    await assertPageState(3, 20, 5)
    await projectionPage.goForward()
    await table.waitFor()
    assert.equal(projectionPage.url(), fullCapacityHref)
    await assertRows(sorted)
    await assertPageState(1, 50, 45)
    const requestedTask = projectionTasks[22]
    await projectionPage.getByRole('searchbox', {
      name: '搜索',
      exact: true,
    }).fill(requestedTask.id)
    const draftHref = projectionPage.url()
    await assertRows(sorted)
    await projectionPage.getByRole('searchbox', {
      name: '搜索',
      exact: true,
    }).dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      isComposing: true,
      bubbles: true,
    })
    assert.equal(projectionPage.url(), draftHref)
    await assertRows(sorted)
    await projectionPage.getByRole('button', { name: '搜索', exact: true }).click()
    await assertRows([requestedTask])
    assert.equal(listParams().get('q'), requestedTask.id)
    await projectionPage.reload()
    await table.waitFor()
    await assertRows([requestedTask])
    assert.equal(
      await projectionPage.getByRole('searchbox', {
        name: '搜索',
        exact: true,
      }).inputValue(),
      requestedTask.id,
    )
    await table.getByRole('button', {
      name: requestedTask.title,
      exact: true,
    }).waitFor()
    await projectionPage.getByRole('searchbox', {
      name: '搜索',
      exact: true,
    }).fill('')
    await projectionPage.getByRole('button', { name: '搜索', exact: true }).click()
    await assertRows(sorted)
    await projectionPage.goBack()
    await table.waitFor()
    await assertRows([requestedTask])
    assert.equal(listParams().get('q'), requestedTask.id)
    await projectionPage.goForward()
    await table.waitFor()
    await assertRows(sorted)
    assert.equal(listParams().get('q'), null)
    await scopeNav.getByRole('button', {
      name: 'Pagination fixture',
      exact: true,
    }).click()
    await expectScope('Pagination fixture')
    await scopeNav.getByRole('button', {
      name: '运行中',
      exact: true,
    }).click()
    await projectionPage.getByRole('heading', {
      name: '没有匹配的任务',
      exact: true,
    }).waitFor()
    assert.equal(listParams().get('filter'), 'active')
    await projectionPage.reload()
    await projectionPage.getByRole('heading', {
      name: '没有匹配的任务',
      exact: true,
    }).waitFor()
    await expectScope('运行中')
    await expectScope('Pagination fixture')
    await projectionPage.getByRole('radio', { name: 'JQL', exact: true }).click()
    const draftJql = projectionPage.getByLabel('JQL 查询', { exact: true })
    const pendingJql = 'draft-only unsupported expression'
    await draftJql.fill(pendingJql)
    assert.equal(listParams().get('jql') ?? '', '')
    await projectionPage.getByRole('radio', {
      name: '基本搜索',
      exact: true,
    }).click()
    await projectionPage.getByRole('radio', { name: 'JQL', exact: true }).click()
    assert.equal(await draftJql.inputValue(), pendingJql)
    await projectionPage.getByRole('radio', { name: '看板', exact: true }).click()
    await projectionPage.getByRole('radio', {
      name: '任务列表',
      exact: true,
    }).click()
    assert.equal(await draftJql.inputValue(), pendingJql)
    await projectionPage.locator('.wb-sidebar').getByRole('button', {
      name: '偏好设置',
      exact: true,
    }).click()
    await projectionPage.getByRole('dialog').getByRole('radio', {
      name: 'Zira',
      exact: true,
    }).click()
    await projectionPage.keyboard.press('Escape')
    await projectionPage.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(await draftJql.inputValue(), pendingJql)
    await projectionPage.locator('.wf-querybar-primary').getByRole('button', {
      name: '清除筛选',
      exact: true,
    }).click()
    await projectionPage.getByRole('radio', { name: 'JQL', exact: true }).click()
    assert.equal(await draftJql.inputValue(), '')
    assert.equal(listParams().get('jql') ?? '', '')
    await projectionPage.getByRole('radio', {
      name: '基本搜索',
      exact: true,
    }).click()
    record(
      'Dirty JQL survives mode/view/theme changes, while explicit Clear filters removes an uncommitted JQL draft',
    )
    await scopeNav.getByRole('button', {
      name: 'Pagination fixture',
      exact: true,
    }).click()
    await scopeNav.getByRole('button', {
      name: '所有任务',
      exact: true,
    }).click()
    await assertRows(sorted)
    const sharedSearch = projectionPage.getByRole('searchbox', {
      name: '搜索',
      exact: true,
    })
    await sharedSearch.fill('Pagination task')
    await sharedSearch.press('Enter')
    await assertRows(sorted)
    await projectionPage.getByRole('combobox', {
      name: /^每页任务数/,
    }).click()
    await projectionPage.getByRole('option', {
      name: '每页 20',
      exact: true,
    }).click()
    await assertRows(sorted.slice(0, 20))
    await projectionPage.getByRole('button', {
      name: '下一页',
      exact: true,
    }).click()
    await assertRows(sorted.slice(20, 40))
    const sharedHref = projectionPage.url()
    const sharedParameters = Object.fromEntries(listParams())
    assert.equal(sharedParameters.q, 'Pagination task')
    assert.equal(sharedParameters.filter ?? 'all', 'all')
    assert.equal(sharedParameters.project, 'pagination-project')
    assert.equal(sharedParameters.order, 'title:ascending')
    assert.equal(sharedParameters.page, '2')
    assert.equal(sharedParameters.pageSize, '20')
    await verifyColumnsSelection(sorted.slice(20, 40))
    await projectionPage.getByRole('button', {
      name: '清除筛选',
      exact: true,
    }).click()
    await assertPoll(
      async () =>
        await table.locator('tbody tr').count() === 20 &&
        (listParams().get('q') ?? '') === '' &&
        (listParams().get('filter') ?? 'all') === 'all' &&
        (listParams().get('project') ?? 'all') === 'all',
      'Clear filters resets query and scope',
    )
    assert.equal(listParams().get('page') ?? '1', '1')
    await projectionPage.goBack()
    await table.waitFor()
    await assertRows(sorted.slice(20, 40))
    assert.equal(projectionPage.url(), sharedHref)
    assert.deepEqual(Object.fromEntries(listParams()), sharedParameters)
    await projectionPage.reload()
    await table.waitFor()
    await assertRows(sorted.slice(20, 40))
    await assertPageState(2, 20, 20)
    assert.deepEqual(Object.fromEntries(listParams()), sharedParameters)
    assert.equal(await sharedSearch.inputValue(), 'Pagination task')
    await expectScope('Pagination fixture')
    await expectScope('所有任务')
    await projectionPage.setViewportSize({ width: 390, height: 844 })
    const mobileFilterTrigger = projectionPage.getByRole('button', {
      name: '筛选条件',
      exact: true,
    })
    await scopeNav.waitFor({ state: 'hidden' })
    await mobileFilterTrigger.focus()
    await mobileFilterTrigger.click()
    const filterDialog = projectionPage.getByRole('dialog', {
      name: '筛选条件',
      exact: true,
    })
    await filterDialog.waitFor()
    await assertQuickFindBlocked(projectionPage, 'Mobile filters dialog')
    await projectionPage.screenshot({
      path: resolve(out, 'filters-mobile-390.png'),
      fullPage: false,
    })
    evidence.screenshots.push('filters-mobile-390.png')
    assert.equal(
      await projectionPage.getByRole('navigation', {
        name: '任务范围',
        exact: true,
        includeHidden: true,
      }).count(),
      1,
    )
    await expectScope('Pagination fixture')
    await scopeNav.getByRole('button', {
      name: 'Empty pagination project',
      exact: true,
    }).click()
    assert.equal(listParams().get('project'), 'pagination-empty-project')
    await projectionPage.keyboard.press('Escape')
    await filterDialog.waitFor({ state: 'hidden' })
    await assertPoll(
      () => mobileFilterTrigger.evaluate((element) => element === document.activeElement),
      'Mobile filters return focus to the toolbar trigger',
    )
    await projectionPage.getByRole('heading', {
      name: '没有匹配的任务',
      exact: true,
    }).waitFor()
    await projectionPage.reload()
    await projectionPage.getByRole('heading', {
      name: '没有匹配的任务',
      exact: true,
    }).waitFor()
    await mobileFilterTrigger.click()
    await filterDialog.waitFor()
    await expectScope('Empty pagination project')
    await scopeNav.getByRole('button', {
      name: '全部项目',
      exact: true,
    }).click()
    await projectionPage.keyboard.press('Escape')
    await filterDialog.waitFor({ state: 'hidden' })
    await projectionPage.getByRole('button', {
      name: '清除筛选',
      exact: true,
    }).click()
    await projectionPage.setViewportSize({ width: 1440, height: 1000 })
    await table.waitFor()
    await scopeNav.waitFor({ state: 'visible' })
    await projectionPage.getByRole('combobox', {
      name: /^每页任务数/,
    }).click()
    await projectionPage.getByRole('option', {
      name: '每页 50',
      exact: true,
    }).click()
    await assertPoll(
      async () => await table.locator('tbody tr').count() === 45,
      'All tasks return after clearing mobile filters',
    )
    await projectionPage.screenshot({
      path: resolve(out, 'pagination-45-readonly.png'),
      fullPage: true,
    })
    evidence.screenshots.push('pagination-45-readonly.png')
    await projectionPage.screenshot({
      path: resolve(out, 'search-list-45-desktop.png'),
      fullPage: false,
    })
    evidence.screenshots.push('search-list-45-desktop.png')
    await projectionPage.getByRole('radio', { name: '看板', exact: true }).click()
    await projectionPage.getByRole('region', {
      name: '任务看板',
      exact: true,
    }).waitFor()
    assert.equal(await projectionPage.locator('.wb-work-card').count(), 45)
    assert.equal(
      await projectionPage.getByRole('combobox', { name: /^每页任务数/ }).count(),
      0,
    )
    await projectionPage.getByRole('radio', {
      name: '运行记录',
      exact: true,
    }).click()
    await projectionPage.getByRole('heading', {
      name: '运行记录',
      exact: true,
    }).waitFor()
    await projectionPage.getByText('没有匹配的运行', { exact: true }).waitFor()
    assert.equal(
      await projectionPage.getByRole('combobox', { name: /^每页任务数/ }).count(),
      0,
    )
    await projectionPage.getByRole('radio', {
      name: '任务列表',
      exact: true,
    }).click()
    await table.waitFor()
    assert.equal(await table.locator('tbody tr').count(), 45)
    await verifyDensityAndAccent()
    const quickFindHref = projectionPage.url()
    const neverRunTask = projectionTasks.at(-1)
    await projectionPage.getByRole('button', {
      name: '快速查找',
      exact: true,
    }).click()
    const quickFind = projectionPage.getByRole('dialog', {
      name: '快速查找',
      exact: true,
    })
    await quickFind.waitFor()
    await quickFind.locator('input').fill(neverRunTask.id)
    await quickFind.getByRole('option', {
      name: `${neverRunTask.title} · ${neverRunTask.id}`,
      exact: true,
    }).waitFor()
    assert.equal(projectionPage.url(), quickFindHref)
    await projectionPage.keyboard.press('ArrowDown')
    await projectionPage.keyboard.press('Enter')
    await quickFind.waitFor({ state: 'hidden' })
    await projectionPage.getByTestId('task-workspace')
      .getByRole('heading', { name: neverRunTask.title, exact: true }).waitFor()
    assert.equal(new URL(projectionPage.url()).hash, `#task/${neverRunTask.id}`)
    await projectionPage.getByTestId('task-goal')
      .getByText(neverRunTask.goal, { exact: true }).waitFor()
    record('Quick find finds a never-run Task beyond the old30 cap and opens its exact goal workspace only after selection')
    const dimensions = await projectionPage.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))
    assert.ok(dimensions.scroll <= dimensions.width + 1)
    assert.deepEqual(
      projectionRequests.filter((request) => request.method !== 'GET'),
      [],
    )
    assert.equal(
      projectionRequests.every((request) =>
        ['/api/auth/state', '/api/bootstrap'].includes(request.path),
      ),
      true,
    )
    record(
      'Read-only 45-task projection: submitted search and scope/order/page/capacity restore via URL; mobile filters restore focus, global sorting matches mobile, long titles stay compact, and views make no API mutations',
    )
  } finally {
    await projectionContext.close()
  }
}
async function verifyFullWorkbench() {
  await page.goto(base)
  await page
    .getByRole('heading', { name: '登录工作空间', exact: true })
    .waitFor()
  assert.equal(writes.length, 0)
  await page.getByText('企业单点登录', { exact: true }).waitFor()
  assert.equal(
    await page.getByRole('button', { name: /SSO|单点登录/ }).count(),
    0,
  )
  await shot('login-desktop')
  await page.getByLabel(/访问令牌/).fill('astryx-browser-fixture')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByRole('heading', { name: '任务', exact: true }).waitFor()
  await page.getByRole('link', { name: '跳到主要内容', exact: true }).focus()
  await page.keyboard.press('Enter')
  assert.equal(
    await page
      .locator('#wb-main')
      .evaluate((element) => document.activeElement === element),
    true,
  )
  assert.notEqual(new URL(page.url()).hash, '#wb-main')
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((item) => item.name),
  )
  assert.equal(
    initialResources.some((name) =>
      /monaco\/|preview-typescript|TemplatesPage|PreviewRunner/.test(name),
    ),
    false,
  )
  evidence.initialScriptResources = initialResources.filter((name) =>
    /\.js(?:\?|$)/.test(name),
  )
  const bootstrap = await api('/bootstrap')
  assert.match(bootstrap.workspace, /^\/tmp\/mybot-astryx-workbench\./)
  assert.equal(
    bootstrap.projects.length,
    0,
    'Use a fresh disposable fixture directory for each verification',
  )
  assert.deepEqual(
    await page.evaluate(() =>
      Object.values(localStorage).filter((value) =>
        value.includes('astryx-browser-fixture'),
      ),
    ),
    [],
  )
  record('Token login through same-origin proxy; token not persisted')

  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: '创建项目', exact: true })
    .click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel(/项目名称/).fill('mybot 研发协作 · 隔离验收')
  await dialog
    .getByLabel('项目目标', { exact: true })
    .fill('验证多 Agent 工作过程与成果审查。此项目仅为隔离测试夹具。')
  await dialog
    .getByLabel('允许提供给模型的项目资料', { exact: true })
    .fill('Fixture only; no business account or paid model.')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  record('Project creation persists through API, without model invocation')
  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: '新建任务', exact: true })
    .click()
  dialog = page.getByRole('dialog')
  await dialog.getByTestId('project-task-picker-trigger').click()
  const taskProjectPicker = page.getByTestId('project-task-picker-dialog')
  await taskProjectPicker.getByRole('radio', {
    name: 'mybot 研发协作 · 隔离验收', exact: true,
  }).check()
  await taskProjectPicker.getByRole('button', { name: '完成', exact: true }).click()
  await dialog.getByTestId('project-task-picker-trigger').getByText(
    'mybot 研发协作 · 隔离验收', { exact: true },
  ).waitFor()
  await dialog.getByLabel(/任务名称/).fill(primaryTaskTitle)
  await dialog
    .getByLabel(/任务目标/)
    .fill('核对项目资料中多端共享、可视化编排与角色分工的实现边界')
  await dialog.getByLabel('明确选择的文件', { exact: true }).fill('README.md')
  await dialog
    .getByRole('button', { name: '保存并打开任务', exact: true })
    .click()
  await page.getByTestId('task-workspace').waitFor()
  await page.getByRole('heading', { name: primaryTaskTitle, exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(
    await page.getByRole('button', { name: '安排执行', exact: true })
      .getAttribute('aria-disabled'), 'true',
  )
  assert.equal(writes.filter((path) => /\/preview$/.test(path)).length, 0)
  assert.equal(writes.filter((path) => /\/runs$/.test(path)).length, 0)
  await page.reload()
  await page.getByTestId('task-workspace').waitFor()
  await page.locator('.wb-nav').getByRole('link', { name: '工作台', exact: true }).click()
  await taskTable().getByRole('button', {
    name: primaryTaskTitle,
    exact: true,
  }).waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 1)
  await taskTable().getByText('未运行', { exact: true }).waitFor()
  assert.equal(await page.locator('.wf-task-inspector').count(), 0)
  record('Task survives refresh; missing model prevents starting a run')

  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '模型与资源', exact: true })
    .click()
  await page
    .locator('.wb-page-heading')
    .getByRole('button', { name: '添加模型', exact: true })
    .click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '本机推理', exact: true }).click()
  await dialog.getByLabel(/配置名称/).fill('Mock research · 隔离夹具')
  await dialog.getByLabel(/模型标识/).fill('fixture-only')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText('Mock research · 隔离夹具', { exact: true }).waitFor()
  assert.equal(writes.filter((path) => path.endsWith('/test')).length, 0)
  await page.getByRole('button', { name: '设为默认', exact: true }).click()
  await page.getByText('默认', { exact: true }).waitFor()
  record(
    'Local model preset and default selection save without connection tests',
  )
  await page.getByRole('button', { name: '测试连接', exact: true }).click()
  dialog = page.getByRole('dialog')
  assert.equal(
    await dialog
      .getByRole('button', { name: '确认测试' })
      .getAttribute('aria-disabled'),
    'true',
  )
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(writes.filter((path) => path.endsWith('/test')).length, 0)
  assert.equal(
    await page
      .getByRole('button', { name: '测试连接', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  )
  record('Model test requires confirmation; Escape restores trigger focus')

  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '工作台', exact: true })
    .click()
  await inspectTask(primaryTaskTitle)
  await page
    .locator('.wf-inspector')
    .getByRole('link', { name: '打开任务工作区', exact: true })
    .click()
  await page.getByTestId('task-goal').waitFor()
  await shot('task-goal-desktop')
  await page
    .getByRole('button', { name: '安排执行', exact: true })
    .click()
  dialog = page.getByRole('dialog')
  await dialog.getByText(/Browser test repository/, { exact: false }).waitFor()
  await dialog.getByRole('button', { name: '下一步', exact: true }).click()
  await dialog
    .getByRole('spinbutton', { name: '调用总上限', exact: true })
    .fill('3')
  await dialog.getByRole('button', { name: '下一步', exact: true }).click()
  assert.equal(writes.filter((path) => /\/runs$/.test(path)).length, 0)
  await dialog.getByRole('button', { name: '确认并开始运行', exact: true }).click()
  await dialog.locator('p.wb-error[role="alert"]').waitFor()
  assert.equal(
    await dialog.locator('[data-form-field="consent"]').getAttribute('aria-invalid'),
    'true',
  )
  assert.equal(writes.filter((path) => /\/runs$/.test(path)).length, 0)
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '上一步', exact: true }).click()
  await dialog.getByRole('button', { name: '下一步', exact: true }).click()
  assert.equal(await dialog.getByRole('checkbox').isChecked(), false)
  await dialog.getByRole('checkbox').check()
  await dialog
    .getByRole('button', { name: '确认并开始运行', exact: true })
    .click()
  await page.waitForURL(/#task\/.*taskRun=/)
  const taskRunParams = new URLSearchParams(new URL(page.url()).hash.split('?')[1])
  assert.equal(taskRunParams.get('taskTab'), 'work')
  const id = taskRunParams.get('taskRun')
  assert.ok(id)
  await waitRun(id, 'succeeded')
  await page.getByRole('button', { name: '刷新运行', exact: true }).click()
  await page
    .locator('.wb-run-axes')
    .getByText('已完成', { exact: true })
    .waitFor()
  const complete = await api(`/runs/${id}`)
  assert.equal(complete.calls.length, 3)
  assert.equal(complete.run.config.max_calls, 3)
  assert.equal(writes.filter((path) => /\/runs$/.test(path)).length, 1)
  record(
    'Task workspace uses explicit snapshot consent and budget, starts one fixture Run, stays in Task Agent view and reaches completion',
  )
  await shot('run-desktop-light')
  await page
    .locator('.wb-artifact-pane')
    .getByRole('button', { name: '接受方案', exact: true })
    .click()
  await page
    .locator('.wb-run-axes')
    .getByText('已接受', { exact: true })
    .waitFor()
  await page.getByRole('button', { name: '调用 3', exact: true }).click()
  await page.getByRole('region', { name: '模型调用', exact: true }).waitFor()
  assert.equal(await page.locator('.wb-table tbody tr').count(), 3)
  assert.equal(
    await page
      .locator('.wb-usage-strip')
      .innerText()
      .then((value) => value.includes('90')),
    true,
  )
  const callButton = page
    .locator('.wb-table tbody tr')
    .first()
    .getByRole('button')
  await callButton.click()
  await page
    .getByRole('dialog')
    .getByText('无错误记录', { exact: true })
    .waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  record(
    'Human review persists; call usage and diagnostics are real fixture facts',
  )
  await page.getByRole('button', { name: '成果 2', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载成果', exact: true }).click()
  const download = await downloadPromise
  assert.match(download.suggestedFilename(), /^mybot-.*\.md$/)
  record('Artifact download and dedicated artifact view work')

  await page.getByRole('button', { name: '工作图', exact: true }).click()
  await page.getByRole('region', { name: '工作图画布', exact: true }).waitFor()
  await page.locator('.wb-graph-node').nth(1).click()
  await page
    .locator('.wb-graph-inspector')
    .getByText('分析边界', { exact: true })
    .first()
    .waitFor()
  await page.getByRole('button', { name: '放大工作图', exact: true }).click()
  assert.equal(await page.locator('.wb-graph-tools output').innerText(), '110%')
  await page.getByRole('button', { name: '重置缩放', exact: true }).click()
  await shot('work-graph-desktop')
  await page.getByRole('button', { name: '对话', exact: true }).click()
  await page
    .locator('.wb-run-transcript')
    .getByText('这是测试输出；没有执行任何测试。', { exact: false })
    .first()
    .waitFor()
  assert.equal(await page.locator('.wb-run-transcript textarea').count(), 0)
  record(
    'Read-only work graph, inspector, zoom, Agent avatars and real transcript',
  )

  await page.getByRole('button', { name: '审计', exact: true }).click()
  await page
    .locator('.wb-audit')
    .getByText('run.succeeded', { exact: true })
    .waitFor()
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '会话后端', exact: true })
    .click()
  await page
    .getByRole('button', { name: '添加后端', exact: true })
    .first()
    .click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel(/连接名称/).fill('OMB fixture')
  await dialog.getByLabel(/本机服务地址/).fill('http://127.0.0.1:8000')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '检查', exact: true }).click()
  dialog = page.getByRole('dialog')
  assert.equal(
    await dialog
      .getByRole('button', { name: '确认检查', exact: true })
      .getAttribute('aria-disabled'),
    'true',
  )
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '确认检查', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText(/健康检查: reachable/).waitFor()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: '确认撤销', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await assertPoll(
    async () =>
      (await page
        .getByRole('button', { name: '检查', exact: true })
        .getAttribute('aria-disabled')) === 'true',
    'Revocation disables health check after refresh',
  )
  record(
    'Backend save, explicitly consented MockTransport health check and revoke',
  )

  const seed = await api('/bootstrap')
  const nextSnapshot = await api(`/tasks/${complete.run.task_id}/preview`, {})
  const latestRun = await api(`/tasks/${complete.run.task_id}/runs`, {
    ...complete.run.config,
    consent: true,
    request_id: crypto.randomUUID(),
    context_hash: nextSnapshot.context_hash,
  })
  await waitRun(latestRun.id, 'succeeded')
  assert.notEqual(latestRun.id, id)
  await api('/tasks', {
    project_id: seed.projects[0].id,
    title: '待启动任务 · 隔离验收',
    goal: '检查任务看板与待处理页面的数据一致性',
    files: [],
  })
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '工作台', exact: true })
    .click()
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await taskTable().waitFor()
  await assertPoll(
    async () => await taskTable().locator('tbody tr').count() === 2,
    'Refreshed workbench includes both persisted tasks',
  )
  await taskTable().getByRole('button', {
    name: '待启动任务 · 隔离验收',
    exact: true,
  }).waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 2)
  assert.equal(
    await taskTable().getByRole('button', {
      name: primaryTaskTitle,
      exact: true,
    }).count(),
    1,
  )
  assert.equal(await page.locator('.wf-task-inspector').count(), 0)
  await page.locator('.wf-heading .wf-result-count[role="status"]').waitFor()
  assert.match(
    await page.locator('.wf-heading .wf-result-count[role="status"]').innerText(),
    /项任务/,
  )
  await inspectTask(primaryTaskTitle)
  const desktopInspector = page.locator('.wf-inspector')
  await desktopInspector.locator(`.wf-history-row[href="#run/${latestRun.id}"]`).waitFor()
  assert.equal(await desktopInspector.locator('.wf-history-row').count(), 2)
  assert.equal(
    await desktopInspector
      .getByRole('link', { name: '打开最近运行', exact: true })
      .getAttribute('href'),
    `#run/${latestRun.id}`,
  )
  for (const runId of [id, latestRun.id]) {
    assert.equal(
      await desktopInspector.locator(`.wf-history-row[href="#run/${runId}"]`).count(),
      1,
    )
  }
  await desktopInspector
    .getByRole('button', { name: '关闭任务详情', exact: true })
    .click()
  assert.equal(await page.locator('.wf-task-inspector').count(), 0)
  record(
    'Task-first list renders one latest-state row per task; optional inspector retains both real fixture runs',
  )
  await page.getByRole('radio', { name: '运行记录', exact: true }).click()
  const runsTable = page.getByRole('table', { name: '运行筛选表', exact: true })
  await runsTable.waitFor()
  assert.equal(await runsTable.locator('tbody tr').count(), 2)
  await runsTable
    .getByRole('columnheader', { name: '任务', exact: false })
    .getByRole('button')
    .first()
    .click()
  await assertPoll(
    () => runsTable.locator('th[aria-sort="ascending"]').count(),
    (count) => count === 1,
  )
  await page.getByRole('button', { name: '表格设置', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: '项目列', exact: true }).uncheck()
  await dialog.getByRole('checkbox', { name: '紧凑行距', exact: true }).check()
  await page.keyboard.press('Escape')
  assert.equal(
    await runsTable
      .getByRole('columnheader', { name: '项目', exact: true })
      .count(),
    0,
  )
  record(
    'Run history keeps both attempts with real rows, sorting, column visibility and density',
  )
  await page.getByRole('radio', { name: '看板', exact: true }).click()
  await page.getByRole('region', { name: '任务看板', exact: true }).waitFor()
  assert.equal(await page.locator('.wb-work-card').count(), 2)
  await shot('task-board-desktop')
  await page.getByRole('button', { name: '快速查找', exact: true }).click()
  assert.equal(
    await page
      .locator('.wb-sidebar')
      .getByRole('button', { name: '快速查找', exact: true })
      .count(),
    0,
  )
  dialog = page.getByRole('dialog', { name: '快速查找', exact: true })
  await dialog.getByText('导航', { exact: true }).waitFor()
  await dialog.locator('input').fill('项目层级')
  await dialog.getByRole('option', { name: '项目层级', exact: true }).waitFor()
  await assertPoll(
    async () => await dialog.getAttribute('aria-busy') !== 'true',
    'Quick find finishes the current search before keyboard selection',
  )
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByRole('heading', { name: '项目层级', exact: true }).waitFor()
  const hierarchy = page.getByRole('table', {
    name: '项目任务层级',
    exact: true,
  })
  await hierarchy.locator('tbody button[aria-expanded="false"]').first().click()
  await hierarchy
    .getByRole('link', { name: id.slice(0, 8), exact: true })
    .waitFor()
  record(
    'Grouped command palette keyboard navigation and persisted project/task/run hierarchy',
  )
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: /待处理/ })
    .click()
  await page.getByRole('heading', { name: '待处理', exact: true }).waitFor()
  await page
    .locator('.wb-inbox-detail')
    .getByRole('heading', { name: '待启动任务 · 隔离验收', exact: true })
    .waitFor()
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '项目资料', exact: true })
    .click()
  await page
    .locator('.wb-doc-content')
    .getByText('Fixture only; no business account or paid model.', {
      exact: false,
    })
    .waitFor()
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '总览', exact: true })
    .click()
  await page.getByRole('heading', { name: '工作总览', exact: true }).waitFor()
  assert.equal(await page.locator('.wb-project-progress').count(), 1)
  assert.equal(await page.locator('.wb-overview-run').count(), 1)
  assert.equal(
    await page.locator('.wb-overview-run').getAttribute('href'),
    `#run/${latestRun.id}`,
  )
  assert.equal(
    await page.locator('.wb-overview-run').getByText('执行失败', { exact: true }).count(),
    0,
  )
  await page.getByRole('heading', { name: '最近任务动态', exact: true }).waitFor()
  await shot('overview-desktop')
  record(
    'Inbox, documentation, progress and alert rail share persisted business projections',
  )
  await verifyPageInventory(seed.projects[0], id)
  await page
    .locator('.wb-nav')
    .getByRole('link', { name: '工作台', exact: true })
    .click()
  await page.getByRole('radio', { name: '任务列表', exact: true }).click()
  await taskTable().waitFor()
  await page.getByRole('searchbox', { name: '搜索', exact: true }).fill('does-not-exist')
  const basicDraftHref = page.url()
  assert.equal(await taskTable().locator('tbody tr').count(), 2)
  await page.getByRole('searchbox', {
    name: '搜索',
    exact: true,
  }).dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  })
  assert.equal(page.url(), basicDraftHref)
  assert.equal(await taskTable().locator('tbody tr').count(), 2)
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await page
    .getByRole('heading', { name: '没有匹配的任务', exact: true })
    .waitFor()
  assert.equal(
    new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '').get('q'),
    'does-not-exist',
  )
  await page.getByRole('searchbox', { name: '搜索', exact: true }).fill('')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await selectStatus('运行中')
  await page
    .getByRole('heading', { name: '没有匹配的任务', exact: true })
    .waitFor()
  assert.equal(await page.getByRole('table', { name: '任务列表', exact: true }).count(), 0)
  await selectStatus('所有任务')
  await taskTable().waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 2)
  await checkOverflow('Desktop work list')
  await shot('work-desktop-light')
  await page.getByRole('searchbox', { name: '搜索', exact: true }).fill('梳理')
  await page.getByRole('button', { name: '搜索', exact: true }).click()
  await taskTable().getByRole('button', { name: primaryTaskTitle, exact: true }).waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 1)
  const queryBar = page.locator('.wf-querybar')
  const committedConditionHref = page.url()
  await queryBar
    .getByRole('button', { name: /^状态(?:\s|$)/ })
    .click()
  await page.getByRole('option', { name: '运行中', exact: true }).click()
  await page.keyboard.press('Escape')
  assert.equal(page.url(), committedConditionHref)
  assert.equal(
    await page.locator('.wf-heading').getByText('未应用', { exact: true }).count(),
    1,
  )
  await queryBar.getByRole('button', { name: '搜索', exact: true }).click()
  await assertPoll(
    async () =>
      new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '').get(
        'filter',
      ) === 'active',
    'basic condition draft commits atomically with the query',
  )
  record(
    'Basic query conditions stay draft-only until Search commits one URL transaction',
  )
  await selectStatus('所有任务')
  await taskTable().waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 1)
  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: '偏好设置', exact: true })
    .click()
  const appearanceWrites = writes.length
  const computed = []
  for (const style of [
    'Neutral',
    'Zira',
    'Gothic',
    'Matcha',
    'Stone',
    'Butter',
    'Chocolate',
    'Y2K',
  ]) {
    await page
      .getByRole('dialog')
      .getByRole('radio', { name: style, exact: true })
      .click()
    const styleId = style.toLowerCase()
    await page.locator(`.wb-theme[data-style="${styleId}"]`).waitFor()
    for (const mode of ['light', 'dark']) {
      await page
        .getByRole('dialog')
        .getByRole('radio', {
          name: mode === 'light' ? '浅色' : '深色',
          exact: true,
        })
        .click()
      computed.push(
        await page.locator('.wb-theme').evaluate((element) => {
          const css = getComputedStyle(element)
          const title = document.querySelector('.wf-heading h1')
          return {
            style: element.dataset.style,
            mode: element.dataset.mode,
            background: css.backgroundColor,
            color: css.color,
            radius: css.getPropertyValue('--radius-container'),
            font: title ? getComputedStyle(title).fontFamily : '',
          }
        }),
      )
      if (style === 'Zira') {
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        await shot(`work-zira-${mode}`)
        await page
          .locator('.wb-sidebar')
          .getByRole('button', { name: '偏好设置', exact: true })
          .click()
      }
    }
  }
  evidence.productStyles = computed
  assert.ok(
    new Set(
      computed.map(
        (item) => item.background + item.color + item.font + item.radius,
      ),
    ).size >= 8,
  )
  assert.equal(writes.length, appearanceWrites)
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: 'Matcha', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: '紧凑', exact: true })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('searchbox', {
    name: '搜索',
    exact: true,
  }).inputValue(), '梳理')
  await page.reload()
  await page
    .locator(
      '.wb-theme[data-style="matcha"][data-mode="dark"][data-density="compact"]',
    )
    .waitFor()
  assert.equal(await page.getByRole('searchbox', {
    name: '搜索',
    exact: true,
  }).inputValue(), '梳理')
  await taskTable().getByRole('button', { name: primaryTaskTitle, exact: true }).waitFor()
  assert.equal(await taskTable().locator('tbody tr').count(), 1)
  await shot('work-matcha-dark')
  await page
    .locator('.wb-sidebar')
    .getByRole('button', { name: '偏好设置', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: 'Neutral', exact: true })
    .click()
  await page.keyboard.press('ArrowRight')
  await page.locator('.wb-theme[data-style="zira"]').waitFor()
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: 'Neutral', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: '浅色', exact: true })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  record(
    'Eight styles × two modes: computed tokens differ, preferences persist, keyboard works, no API writes',
  )
  const queryWrites = writes.length
  const queryText = 'assignee = currentUser() ORDER BY created DESC'
  const requested = new URL(base)
  requested.hash = `workbench?${new URLSearchParams({ jql: queryText, mode: 'basic', view: 'list', groupBy: '', group: 'none' })}`
  await page.goto(requested.href)
  await page
    .getByRole('alert')
    .getByText(/尚无负责人和用户模型/)
    .waitFor()
  await page.locator('.wf-query-scope code').waitFor()
  assert.equal(await page.locator('.wf-query-scope code').innerText(), queryText)
  await page.getByRole('radio', { name: 'JQL', exact: true }).click()
  assert.equal(
    await page.getByLabel('JQL 查询', { exact: true }).inputValue(),
    queryText,
  )
  assert.equal(await taskTable().count(), 0)
  await page
    .getByRole('alert')
    .getByRole('button', { name: '清除查询', exact: true })
    .click()
  await taskTable().waitFor()
  await page.goBack()
  await page
    .getByRole('alert')
    .getByText(/尚无负责人和用户模型/)
    .waitFor()
  const jqlInput = page.getByLabel('JQL 查询', { exact: true })
  await jqlInput.fill('ORDER BY created DESC')
  const draftUrl = page.url()
  await page.getByRole('alert').getByText(/尚无负责人和用户模型/).waitFor()
  await jqlInput.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
    bubbles: true,
  })
  assert.equal(page.url(), draftUrl)
  assert.equal(await taskTable().count(), 0)
  await page.getByRole('button', { name: '应用查询', exact: true }).click()
  await taskTable().waitFor()
  await page.getByRole('radio', { name: '运行记录', exact: true }).click()
  await page.reload()
  await page.getByRole('table', { name: '运行筛选表', exact: true }).waitFor()
  assert.equal(
    await page.getByLabel('JQL 查询', { exact: true }).inputValue(),
    'ORDER BY created DESC',
  )
  await page.getByLabel('JQL 查询', { exact: true }).fill('')
  await page.getByRole('button', { name: '应用查询', exact: true }).click()
  await page.getByRole('radio', { name: '基本搜索', exact: true }).click()
  await page.getByRole('radio', { name: '任务列表', exact: true }).click()
  assert.equal(writes.length, queryWrites)
  record(
    'JQL draft and IME Enter do not submit; URL survives refresh/back/view changes and unsupported assignee/currentUser fails closed',
  )
  await page.getByRole('button', { name: '切换深色', exact: true }).click()
  assert.notEqual(
    await page
      .locator('.wb-theme')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgb(255, 255, 255)',
  )
  await shot('work-desktop-dark')
  await page
    .getByRole('button', { name: 'Switch to English', exact: true })
    .click()
  await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
  assert.equal(
    await page.locator('.wb-theme').getAttribute('data-mode'),
    'dark',
  )
  record('Search, filters, persisted dark theme and English locale')

  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 })
    await checkOverflow(`Work list ${width}px`)
    const taskTrigger = await inspectTask(primaryTaskTitle)
    const inspectorDialog = page.getByRole('dialog', {
      name: /^Task details · /,
    })
    await inspectorDialog.waitFor()
    assert.equal(await page.locator('.wf-inspector').count(), 0)
    await inspectorDialog.locator(`.wf-history-row[href="#run/${latestRun.id}"]`).waitFor()
    assert.equal(await inspectorDialog.locator('.wf-history-row').count(), 2)
    assert.equal(
      await inspectorDialog
        .getByRole('link', { name: 'Open latest run', exact: true })
        .getAttribute('href'),
      `#run/${latestRun.id}`,
    )
    await checkOverflow(`Task inspector ${width}px`)
    await shot(`task-inspector-${width}-dark`)
    await page.keyboard.press('Escape')
    await inspectorDialog.waitFor({ state: 'hidden' })
    await assertPoll(
      () => taskTrigger.evaluate((element) => element === document.activeElement),
      `Inspector restores task trigger focus at ${width}px`,
    )
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('link', { name: 'Projects', exact: true })
      .click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor()
    await checkOverflow(`Projects ${width}px`)
    await page.goto(`${base}#run/${id}`)
    await page.getByRole('button', { name: 'Artifacts 2', exact: true }).click()
    await page
      .getByRole('heading', {
        name: complete.artifacts.find((item) => item.kind === 'report').title,
        exact: true,
      })
      .waitFor()
    await checkOverflow(`Run artifacts ${width}px`)
    await shot(`run-${width}-dark`)
    await page.goto(`${base}#workbench`)
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
  }
  record(
    'Mobile/tablet task inspector retains history and restores focus; navigation, artifacts and long localized content work',
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'New task', exact: true })
    .click()
  await page.getByRole('dialog').waitFor()
  await checkOverflow('Mobile task dialog')
  await shot('task-mobile-dark')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  record('Dialog keyboard dismissal under reduced motion')

  await verifyReadOnlyPagination()
  await verifyReadOnlySelectionRefresh(complete)
  await verifyContextConflict(complete, await api('/bootstrap'))
  await verifyRecoveryWorkflow(complete, await api('/bootstrap'))
  await verifyFormsAndModelReceipts(await api('/bootstrap'))

  // The provider delays only this fixture marker; no real provider is reachable.
  const current = await api('/bootstrap')
  const slowTask = await api('/tasks', {
    project_id: current.projects[0].id,
    title: 'Pause/cancel fixture',
    goal: 'pause-cancel-fixture: verify cooperative control',
    files: ['README.md'],
  })
  const slowSnapshot = await api(`/tasks/${slowTask.id}/preview`, {})
  const modelId = current.models[0].id
  const slowRun = await api(`/tasks/${slowTask.id}/runs`, {
    coordinator_model: modelId,
    researcher_model: modelId,
    reviewer_model: modelId,
    max_calls: 3,
    parallel: 1,
    minutes: 1,
    max_output_tokens: 256,
    consent: true,
    request_id: crypto.randomUUID(),
    context_hash: slowSnapshot.context_hash,
  })
  await page.goto(`${base}#run/${slowRun.id}`)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await waitRun(slowRun.id, 'paused')
  await page.getByRole('button', { name: 'Refresh run', exact: true }).click()
  await page
    .locator('.wb-run-axes')
    .getByText('Paused', { exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  dialog = page.getByRole('dialog')
  assert.equal(
    await dialog
      .getByRole('button', { name: 'Confirm cancellation', exact: true })
      .getAttribute('aria-disabled'),
    'true',
  )
  await dialog.getByRole('checkbox').check()
  await dialog
    .getByRole('button', { name: 'Confirm cancellation', exact: true })
    .click()
  await waitRun(slowRun.id, 'canceled')
  record(
    'Cooperative pause and explicitly confirmed cancellation retain prior calls',
  )

  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Sign in to workspace', exact: true })
    .waitFor()
  assert.equal(
    await page.getByText('mybot 研发协作 · 隔离验收', { exact: true }).count(),
    0,
  )
  record('Logout clears cached project and run content')
  assert.deepEqual(errors, [])
}
try {
  if (process.env.MYBOT_BROWSER_CASE === 'forms') {
    await verifyFormsAndModelReceipts({
      workspace: '/tmp/mybot-synthetic-form-contract',
      projects: [],
      tasks: [],
      runs: [],
      models: [{
        id: 'synthetic-model',
        name: 'Synthetic model',
        kind: 'chat_completions',
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'synthetic-only',
        key_env: '',
        key_available: true,
      }],
      backends: [],
      default_model_id: '',
      local_harnesses: [],
      capabilities: { backend_sync: false },
    })
  } else if (process.env.MYBOT_BROWSER_CASE === 'recovery') {
    await page.goto(base)
    await api('/auth', { token: 'astryx-browser-fixture' })
    const bootstrap = await api('/bootstrap')
    assert.match(bootstrap.workspace, /^\/tmp\/mybot-astryx-workbench\./)
    const source = bootstrap.runs.find((run) => run.status === 'failed')
    assert.ok(source, 'A failed source from a disposable fixture is required')
    await verifyRecoveryWorkflow(await api(`/runs/${source.id}`), bootstrap)
  } else {
    assert.ok(
      !process.env.MYBOT_BROWSER_CASE || process.env.MYBOT_BROWSER_CASE === 'full',
      'Unknown browser verification case',
    )
    await verifyFullWorkbench()
  }
  assert.deepEqual(errors, [])
} catch (error) {
  evidence.failure = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(evidence, null, 2),
  )
  await browser.close()
}
