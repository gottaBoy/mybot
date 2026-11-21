import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(process.env.TASK_CONVERSATION_EVIDENCE_DIR ?? '/tmp/mybot-task-conversation')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(resolve(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
)).href)
const project = {
  id: 'turn-project', name: 'Shared Agent research 研发协作',
  goal: 'Build a shared Agent workspace with verifiable outcomes.',
  directory: '.', notes: 'Synthetic explicit project context.',
}
const task = {
  id: 'turn-task', project_id: project.id,
  title: 'Continue a research task with explicit supplemental requirements',
  goal: 'Compare device handoff approaches and produce a testable implementation plan.',
  acceptance: 'Cite evidence, preserve unknowns and propose an implementation step.',
  files: ['README.md'], created_at: '2026-11-21T02:00:00Z',
}
const otherTask = { ...task, id: 'other-turn-task', title: 'Independent Task with isolated conversation' }
const model = {
  id: 'turn-model', kind: 'chat_completions', name: 'Synthetic read-only model',
  endpoint: 'http://127.0.0.1:11434/v1', model: 'synthetic-not-a-provider',
  key_env: '', key_available: true,
}
const config = {
  coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
  max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800,
}
const snapshotFor = (turn) => {
  const text = 'FILE README.md\nSynthetic research source 研发资料\nEND FILE'
  return {
    goal: `${task.goal}\n\nSelected supplemental requirement:\n${turn.content}`,
    acceptance: task.acceptance, notes: project.notes, text,
    evidence: [{ path: 'README.md', bytes: 35 }],
    bytes: Buffer.byteLength(text), context_hash: 'a'.repeat(64),
    access: 'read_only', tools: [], supplement: { id: turn.id, content: turn.content },
  }
}
const initialTurns = () => Array.from({ length: 23 }, (_, index) => ({
  id: `saved-turn-${String(index).padStart(3, '0')}`, task_id: task.id,
  request_id: `saved-request-${String(index).padStart(3, '0')}`,
  content: `Persisted supplemental requirement ${index + 1} · 研发多端协作`,
  created_at: `2026-11-21T03:${String(23 - index).padStart(2, '0')}:00Z`,
  state: 'saved', run_id: null, candidate: null,
}))
const report = {
  synthetic: true,
  source: 'Production TaskConversation and Forms with intercepted exact ADR-0022 DTOs.',
  limits: [
    'Synthetic HTTP fixtures do not prove database, Provider or primary-service activation.',
    'Desktop/mobile Chrome viewports do not certify physical devices or IMEs.',
    'Every fixture mutation below follows a scripted explicit user action.',
  ],
  checks: [], requests: [], writes: [], unexpected: [], externalRequests: [],
  errors: [], geometry: [], screenshots: [],
}
const browser = await chromium.launch({
  headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
let failurePage
function record(name, message) {
  report.checks.push(`${name}: ${message}`)
  console.log(`PASS ${name}: ${message}`)
}
async function disabled(locator) {
  return locator.evaluate((element) => Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'))
}
async function fixture(name, options = {}) {
  const state = {
    capability: true, authenticated: true, listStatus: 0, receiptStatus: 0,
    malformed: false, saveLoss: false, savePersist: true, prepareLoss: false,
    executeLoss: false, held: false, holdList: false, releaseList: undefined,
    prepareReceiptMutation: '', receiptMutation: '',
    turns: initialTurns(), runs: [], serial: 0,
  }
  const locale = options.locale ?? 'en'
  const tr = (zh, en) => locale === 'zh' ? zh : en
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: options.width < 500 ? 844 : 1000 },
    reducedMotion: 'reduce', serviceWorkers: 'block',
  })
  await context.addInitScript(({ locale, style, mode }) => {
    localStorage.setItem('mybot.locale', locale)
    localStorage.setItem('mybot.style', style)
    localStorage.setItem('mybot.mode', mode)
  }, { locale, style: options.style ?? 'neutral', mode: options.mode ?? 'light' })
  const requests = [], writes = []
  const knownTask = (id) => id === task.id ? task : id === otherTask.id ? otherTask : undefined
  const turnBy = (id) => state.turns.find((turn) => turn.id === id)
  const mutateReceipt = (turn, mutation) => {
    const receipt = structuredClone(turn)
    if (mutation === 'request_id') receipt.request_id = 'changed-request-identity'
    if (mutation === 'created_at') receipt.created_at = '2026-11-21T10:00:00Z'
    if (mutation === 'content') {
      receipt.content = 'A different valid message must never gain execution consent'
      receipt.candidate.snapshot.supplement.content = receipt.content
      receipt.candidate.snapshot.goal = `${task.goal}\n\n${receipt.content}`
    }
    if (mutation === 'config') receipt.candidate.config.max_calls += 1
    if (mutation === 'context_hash') receipt.candidate.snapshot.context_hash = 'd'.repeat(64)
    if (mutation === 'candidate_hash') receipt.candidate.candidate_hash = 'e'.repeat(64)
    return receipt
  }
  const taskDetail = (id) => {
    const source = knownTask(id)
    const runs = id === task.id ? state.runs : []
    return {
      schema_version: 1, unit: 'task_detail',
      item: {
        task: source, project: { id: project.id, name: project.name },
        latest_run: runs[0] ?? null, state_category: runs.length ? 'completed' : 'pending',
        attempts: runs.length,
      },
      history: {
        unit: 'runs', items: runs, total: runs.length, requested_page: 1, page: 1,
        page_size: 20, total_pages: 1, has_more: false, order: 'created-desc-source-v1',
      },
    }
  }
  const turnPage = (id, requestedPage) => {
    const turns = id === task.id ? state.turns : []
    const totalPages = Math.max(1, Math.ceil(turns.length / 20))
    const page = Math.min(requestedPage, totalPages)
    return {
      schema_version: 1, unit: 'task_turns', task_id: id,
      items: turns.slice((page - 1) * 20, page * 20),
      prepared: turns.find((turn) => turn.state === 'prepared') ?? null,
      total: turns.length, requested_page: requestedPage, page, page_size: 20,
      total_pages: totalPages, has_more: page < totalPages, order: 'turns-created-v1',
    }
  }
  const failure = (route, status, code = 'synthetic_read_failure') => route.fulfill({
    status, json: { detail: { code } },
  })
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      report.externalRequests.push({ name, url: request.url() })
      return route.abort()
    }
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const logged = { name, path: url.pathname, search: url.search, method: request.method() }
    requests.push(logged); report.requests.push(logged)
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (request.method() !== 'GET') {
      const body = request.postDataJSON()
      const write = { ...logged, body }
      writes.push(write); report.writes.push(write)
      assert.equal(request.headers()['x-workbench-request'], '1')
      if (segments[1] === 'tasks' && segments[3] === 'turns' && segments.length === 4) {
        assert.deepEqual(Object.keys(body).sort(), ['content', 'request_id'])
        assert.match(body.request_id, /^[A-Za-z0-9_-]{8,100}$/)
        assert.ok(body.content.trim())
        let turn = state.turns.find((item) => item.request_id === body.request_id)
        if (turn) assert.equal(turn.content, body.content)
        else if (!state.saveLoss || state.savePersist) {
          turn = {
            id: `new-turn-${++state.serial}`, task_id: task.id, request_id: body.request_id,
            content: body.content, created_at: '2026-11-21T09:00:00Z',
            state: 'saved', run_id: null, candidate: null,
          }
          state.turns.unshift(turn)
        }
        if (state.saveLoss) { state.saveLoss = false; return route.abort('failed') }
        return route.fulfill({ status: 201, json: turn })
      }
      if (segments[1] === 'tasks' && segments[3] === 'turns' && segments.length === 6) {
        const turn = turnBy(segments[4])
        assert.ok(turn)
        if (segments[5] === 'preview') {
          assert.deepEqual(body, {})
          return route.fulfill({ json: turn.candidate?.snapshot ?? snapshotFor(turn) })
        }
        if (segments[5] === 'prepare') {
          assert.equal(turn.state, 'saved')
          assert.deepEqual(Object.keys(body).sort(), [...Object.keys(config), 'context_hash'].sort())
          assert.equal(body.context_hash, 'a'.repeat(64))
          assert.ok(!Object.hasOwn(body, 'consent'))
          const { context_hash, ...candidateConfig } = body
          turn.state = 'prepared'
          turn.candidate = {
            candidate_hash: 'b'.repeat(64), config: candidateConfig, snapshot: snapshotFor(turn),
          }
          if (state.prepareLoss) { state.prepareLoss = false; return route.abort('failed') }
          return route.fulfill({ json: mutateReceipt(turn, state.prepareReceiptMutation) })
        }
        if (segments[5] === 'execute') {
          assert.equal(turn.state, 'prepared')
          assert.deepEqual(body, { candidate_hash: turn.candidate.candidate_hash, consent: true })
          turn.state = 'applied'; turn.run_id = `linked-run-${++state.serial}`
          state.runs.unshift({
            id: turn.run_id, task_id: task.id, status: 'succeeded', created_at: '2026-11-21T09:01:00Z',
          })
          if (state.executeLoss) { state.executeLoss = false; return route.abort('failed') }
          return route.fulfill({ json: turn })
        }
      }
      report.unexpected.push(logged)
      return failure(route, 405, 'unexpected_fixture_mutation')
    }
    if (url.pathname === '/api/auth/state')
      return route.fulfill({ json: { authenticated: state.authenticated, required: !state.authenticated } })
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: {
      projects: [project], tasks: [task, otherTask], runs: state.runs, models: [model],
      backends: [], workspace: '/synthetic/task-conversation', default_model_id: model.id,
      local_harnesses: [], capabilities: {
        backend_sync: false, task_detail: true, project_detail: true,
        task_conversation: state.capability,
      },
    } })
    if (url.pathname === `/api/projects/${project.id}/detail`) return route.fulfill({ json: {
      schema_version: 1, unit: 'project_detail', project, task_count: 2, run_count: state.runs.length,
    } })
    if (segments[1] === 'tasks' && segments[3] === 'detail')
      return route.fulfill({ json: taskDetail(segments[2]) })
    if (segments[1] === 'tasks' && segments[3] === 'turns') {
      if (segments.length === 4) {
        const captured = structuredClone(turnPage(segments[2], Number(url.searchParams.get('page') ?? 1)))
        if (state.holdList) {
          state.holdList = false; state.held = true
          await new Promise((release) => { state.releaseList = release })
        }
        if (state.listStatus) {
          if (state.listStatus === 401) state.authenticated = false
          return failure(route, state.listStatus)
        }
        if (state.malformed) return route.fulfill({ json: { ...captured, items: [{ id: 'POISON_MALFORMED_MESSAGE' }] } })
        return route.fulfill({ json: captured })
      }
      if (state.receiptStatus) return failure(route, state.receiptStatus)
      const turn = segments[4] === 'requests'
        ? state.turns.find((item) => item.request_id === segments[5])
        : turnBy(segments[4])
      if (!turn || turn.task_id !== segments[2]) return failure(route, 404, 'task_turn_request_unavailable')
      return route.fulfill({ json: mutateReceipt(turn, state.receiptMutation) })
    }
    if (segments[1] === 'runs' && segments.length === 3) {
      const run = state.runs.find((item) => item.id === segments[2])
      assert.ok(run)
      return route.fulfill({ json: {
        run: { ...run, config, context: { evidence: [{ path: 'README.md', bytes: 35 }] } },
        task, project, agents: [], calls: [], artifacts: [], events: [], retry_runs: [],
        harness: { parallel_limit: 2, stages: [] },
      } })
    }
    if (url.pathname === '/api/saved-views') return route.fulfill({
      json: { items: [], total: 0, offset: 0, limit: 20, has_more: false },
    })
    report.unexpected.push(logged)
    return failure(route, 404, 'unexpected_fixture_read')
  })
  const page = await context.newPage()
  failurePage = page
  page.on('pageerror', (error) => report.errors.push({ name, message: error.message }))
  page.on('dialog', (dialog) => dialog.accept())
  const root = page.getByTestId('task-workspace')
  const conversation = page.getByTestId('task-conversation')
  const urlFor = (id = task.id, tab = 'conversation', pending) => {
    const query = new URLSearchParams({ taskTab: tab })
    if (pending) query.set('taskSend', pending)
    return `${base}#task/${id}?${query}`
  }
  const ready = async (id = task.id) => {
    await root.getByRole('heading', { name: knownTask(id).title, exact: true }).waitFor()
    await conversation.getByTestId('task-turn-range').waitFor()
    await page.waitForFunction(() => document.querySelector('[data-testid="task-conversation"]')?.getAttribute('aria-busy') !== 'true')
  }
  const shot = async (label) => {
    const file = `${name}-${label}.png`
    await page.screenshot({ path: resolve(out, file), fullPage: true })
    report.screenshots.push(file)
  }
  const open = async (turnId = state.turns[0].id) => {
    await conversation.locator(`[data-task-turn="${turnId}"]`).getByRole('button', {
      name: tr('安排下一轮', 'Arrange next run'), exact: true,
    }).click()
    const form = page.getByRole('dialog')
    await form.waitFor()
    await form.getByText(tr('本轮补充要求', 'Selected supplemental message'), { exact: true }).waitFor()
    return form
  }
  const next = async (form) => form.getByRole('button', { name: tr('下一步', 'Next'), exact: true }).click()
  const consent = (form) => form.getByRole('checkbox', { name: /I consent to sending|我确认将上述资料/ })
  const toConfirm = async (form) => { await next(form); await next(form); assert.equal(await consent(form).isChecked(), false) }
  const submit = async (form) => {
    await consent(form).check()
    await form.getByRole('button', { name: tr('确认并开始运行', 'Confirm & start run'), exact: true }).click()
  }
  const checkReceipt = async (form) => form.getByRole('button', {
    name: tr('核对本轮记录', 'Check turn receipt'), exact: true,
  }).click()
  const waitUnknown = async (form) => form.getByText(
    tr('请求结果未确认。请查询原记录，勿重复发送。', 'The request outcome is unconfirmed. Check the original receipt before sending again.'),
    { exact: true },
  ).waitFor()
  const close = async () => {
    state.releaseList?.()
    await page.screenshot({ path: resolve(out, `${name}-final.png`), fullPage: true }).catch(() => {})
    await context.close()
  }
  return {
    name, state, context, page, root, conversation, tr, requests, writes, ready,
    urlFor, shot, open, next, consent, toConfirm, submit, checkReceipt, waitUnknown, close,
  }
}

try {
  {
    const f = await fixture('desktop')
    try {
      await f.page.goto(f.urlFor()); await f.ready()
      assert.equal(await f.conversation.locator('[data-task-turn]').count(), 20)
      await f.conversation.getByRole('button', { name: 'Next messages', exact: true }).click()
      await f.conversation.getByTestId('task-turn-range').getByText('21-23 / 23', { exact: true }).waitFor()
      assert.equal(await f.conversation.locator('[data-task-turn]').count(), 3)
      await f.conversation.getByRole('button', { name: 'Previous messages', exact: true }).click()
      await f.conversation.getByTestId('task-turn-range').getByText('1-20 / 23', { exact: true }).waitFor()
      record(f.name, 'Conversation shows real persisted messages with bounded20/3 paging.')
      const composer = f.conversation.getByRole('textbox', { name: 'Supplemental requirements', exact: true })
      const message = 'Only this saved supplemental requirement is selected for the next Run. 研发验收'
      await composer.fill(message)
      await f.root.getByRole('radio', { name: 'Goal & acceptance', exact: true }).click()
      await f.root.getByRole('radio', { name: 'Conversation', exact: true }).click()
      assert.equal(await composer.inputValue(), message)
      await f.page.locator('a[href="#workbench"]').first().click()
      const draftGuard = f.page.getByRole('dialog', { name: 'Discard unsaved supplemental requirements?', exact: true })
      await draftGuard.waitFor()
      await draftGuard.getByRole('button', { name: 'Keep editing', exact: true }).last().click()
      assert.equal(await composer.inputValue(), message)
      await f.page.getByRole('button', { name: 'Preferences', exact: true }).click()
      const preferences = f.page.getByRole('dialog', { name: 'Preferences', exact: true })
      await preferences.getByRole('radio', { name: 'Zira', exact: true }).click()
      await preferences.getByRole('radio', { name: 'Dark', exact: true }).click()
      await preferences.getByRole('button', { name: 'Close', exact: true }).click()
      assert.equal(await composer.inputValue(), message)
      assert.equal(f.writes.length, 0)
      record(f.name, 'Dirty composer survives Task tabs/theme changes and rejected navigation; none of those actions writes or calls a model.')
      await f.conversation.getByRole('button', { name: 'Save message', exact: true }).click()
      await f.conversation.getByText('Message saved. No run has started.', { exact: true }).waitFor()
      assert.equal(await composer.inputValue(), '')
      assert.equal(f.writes.length, 1)
      assert.ok(f.writes[0].path.endsWith('/turns'))
      assert.equal(f.state.runs.length, 0)
      assert.equal(new URLSearchParams(f.page.url().split('?')[1]).has('taskSend'), false)
      const saved = f.state.turns[0]
      assert.equal(saved.request_id, f.writes[0].body.request_id)
      await f.shot('saved-conversation')
      record(f.name, 'Save persists one stable request ID and clears its taskSend marker without preview/prepare/Run side effects.')
      const form = await f.open(saved.id)
      assert.equal(f.writes.length, 2)
      assert.ok(f.writes[1].path.endsWith('/preview'))
      await f.next(form)
      await form.getByRole('spinbutton', { name: 'Call budget', exact: true }).fill('5')
      await f.next(form)
      assert.equal(await f.consent(form).isChecked(), false)
      assert.equal(f.state.runs.length, 0)
      await f.submit(form)
      await f.page.waitForURL(/taskTab=work/)
      await f.root.locator('.wb-workflow').waitFor()
      assert.deepEqual(f.writes.slice(2).map((write) => write.path.split('/').at(-1)), ['prepare', 'execute'])
      assert.equal(f.writes[2].body.max_calls, 5)
      assert.equal(f.writes[3].body.candidate_hash, saved.candidate.candidate_hash)
      assert.equal(f.state.runs.length, 1)
      assert.equal(new URLSearchParams(f.page.url().split('?')[1]).get('taskRun'), saved.run_id)
      await f.shot('linked-agent-work')
      record(f.name, 'Explicit preview and resource review lead to exact prepare/execute with fresh consent; linked Run stays in Task Agent work.')
    } finally { await f.close() }
  }
  for (const kind of ['prepare', 'execute']) {
    const f = await fixture(`${kind}-response-loss`)
    try {
      f.state[`${kind}Loss`] = true
      await f.page.goto(f.urlFor()); await f.ready()
      const turnId = f.state.turns[0].id
      const form = await f.open(turnId)
      await f.toConfirm(form); await f.submit(form); await f.waitUnknown(form)
      const before = f.writes.length
      assert.equal(await f.consent(form).isChecked(), false)
      assert.equal(await disabled(form.getByRole('button', { name: 'Confirm & start run', exact: true })), true)
      f.state.receiptStatus = 503
      await f.checkReceipt(form); await f.waitUnknown(form)
      assert.equal(f.writes.length, before)
      f.state.receiptStatus = 0
      await f.checkReceipt(form)
      if (kind === 'execute') {
        await f.page.waitForURL(/taskTab=work/)
        assert.equal(f.state.runs.length, 1)
        assert.equal(f.writes.length, before)
        record(f.name, 'Lost applied execute response reconciles through exact Turn GET only; a failed receipt read preserves the lock and no duplicate Run appears.')
      } else {
        await form.getByText('This turn context and resources are locked. Fresh execution consent is still required.', { exact: true }).waitFor()
        assert.equal(f.state.runs.length, 0)
        assert.equal(f.writes.length, before)
        assert.equal(await f.consent(form).isChecked(), false)
        await f.page.reload(); await f.ready()
        assert.equal(await disabled(f.root.getByRole('button', { name: 'Arrange execution', exact: true })), true)
        assert.equal(f.state.runs.length, 0)
        const locked = f.state.turns[0]
        await f.conversation.locator(`[data-task-turn="${locked.id}"]`).getByRole('button', {
          name: 'Continue prepared run', exact: true,
        }).click()
        const reopened = f.page.getByRole('dialog')
        await reopened.waitFor()
        await f.next(reopened)
        const resources = reopened.locator('.wb-wizard-section').nth(1)
        assert.equal(await resources.getAttribute('inert'), '')
        await f.next(reopened)
        assert.equal(await f.consent(reopened).isChecked(), false)
        assert.equal(f.writes.length, before)
        await f.submit(reopened)
        await f.page.waitForURL(/taskTab=work/)
        assert.equal(f.state.runs.length, 1)
        assert.equal(f.writes.length, before + 1)
        assert.ok(f.writes.at(-1).path.endsWith('/execute'))
        record(f.name, 'Lost preparation response reconciles without auto-execution; reload keeps the prepared lock, immutable resources and unchecked consent until explicit reopen/start.')
      }
    } finally { await f.close() }
  }
  for (const persisted of [true, false]) {
    const f = await fixture(persisted ? 'saved-response-loss' : 'unsaved-response-loss')
    try {
      f.state.saveLoss = true; f.state.savePersist = persisted
      await f.page.goto(f.urlFor()); await f.ready()
      const composer = f.conversation.getByRole('textbox', { name: 'Supplemental requirements', exact: true })
      await composer.fill('Immutable candidate retained across an uncertain save')
      await f.conversation.getByRole('button', { name: 'Save message', exact: true }).click()
      const check = f.conversation.getByRole('button', { name: 'Check save receipt', exact: true })
      await check.waitFor()
      const requestId = f.writes[0].body.request_id
      assert.equal(new URLSearchParams(f.page.url().split('?')[1]).get('taskSend'), requestId)
      assert.equal(await composer.isDisabled(), true)
      f.state.receiptStatus = 503
      await check.click()
      await f.conversation.getByText('The receipt could not be read. The original request remains unresolved.', { exact: true }).waitFor()
      assert.equal(f.writes.length, 1)
      assert.equal(await f.conversation.getByRole('button', { name: 'Retry original message', exact: true }).count(), 0)
      f.state.receiptStatus = 0
      if (persisted) {
        await f.page.reload(); await f.ready()
        assert.equal(await composer.isDisabled(), true)
        assert.equal(f.writes.length, 1)
        await check.click()
        await f.conversation.getByText('Message saved. No run has started.', { exact: true }).waitFor()
        assert.equal(f.writes.length, 1)
        assert.ok(f.requests.some((request) => request.path.endsWith(`/requests/${requestId}`)))
        assert.equal(new URLSearchParams(f.page.url().split('?')[1]).has('taskSend'), false)
        record(f.name, 'Uncertain saved message survives reload through taskSend and exact request receipt GET; no automatic or duplicate POST occurs.')
      } else {
        await check.click()
        const retry = f.conversation.getByRole('button', { name: 'Retry original message', exact: true })
        await retry.waitFor()
        assert.equal(await composer.isDisabled(), true)
        await retry.click()
        await f.conversation.getByText('Message saved. No run has started.', { exact: true }).waitFor()
        assert.equal(f.writes.length, 2)
        assert.deepEqual(f.writes[0].body, f.writes[1].body)
        record(f.name, 'Failed receipt reads keep the original save locked; authoritative404 alone enables an explicit retry of the identical message/request ID.')
      }
      assert.equal(f.state.runs.length, 0)
      assert.equal(f.writes.some((write) => /\/preview$|\/prepare$|\/execute$/.test(write.path)), false)
    } finally { await f.close() }
  }
  {
    const f = await fixture('reload-missing-save-receipt')
    try {
      f.state.saveLoss = true; f.state.savePersist = false
      await f.page.goto(f.urlFor()); await f.ready()
      const composer = f.conversation.getByRole('textbox', { name: 'Supplemental requirements', exact: true })
      await composer.fill('This original text is never persisted in browser storage')
      await f.conversation.getByRole('button', { name: 'Save message', exact: true }).click()
      await f.conversation.getByRole('button', { name: 'Check save receipt', exact: true }).waitFor()
      const requestId = f.writes[0].body.request_id
      await f.page.reload(); await f.ready()
      await f.conversation.getByRole('button', { name: 'Check save receipt', exact: true }).click()
      await f.conversation.getByText(
        'The original request was not found yet, but its earlier save may still be in flight. Its text was not stored in the browser. Keep this request and check again.',
        { exact: true },
      ).waitFor()
      assert.equal(await composer.isDisabled(), true)
      assert.equal(await composer.inputValue(), '')
      assert.equal(new URLSearchParams(f.page.url().split('?')[1]).get('taskSend'), requestId)
      assert.equal(f.writes.length, 1)
      assert.equal(await f.conversation.getByRole('button', { name: 'Retry original message', exact: true }).count(), 0)
      assert.equal(await disabled(f.root.getByRole('button', { name: 'Arrange execution', exact: true })), true)
      record(f.name, 'A reload404 without the original in-memory save candidate keeps its request marker and mutation lock; it cannot invent text or unlock a new request.')
    } finally { await f.close() }
  }
  for (const mutation of ['request_id', 'content', 'created_at']) {
    const f = await fixture(`changed-prepare-${mutation}`)
    try {
      f.state.prepareReceiptMutation = mutation
      await f.page.goto(f.urlFor()); await f.ready()
      const selected = structuredClone(f.state.turns[0])
      const form = await f.open(selected.id)
      await f.toConfirm(form); await f.submit(form); await f.waitUnknown(form)
      assert.equal(f.writes.length, 2)
      assert.equal(f.writes.some((write) => write.path.endsWith('/execute')), false)
      assert.equal(f.state.runs.length, 0)
      assert.equal(await f.consent(form).isChecked(), false)
      assert.equal(await disabled(form.getByRole('button', { name: 'Confirm & start run', exact: true })), true)
      await form.getByText(selected.content, { exact: true }).waitFor()
      record(f.name, `A schema-valid prepare receipt with changed ${mutation} fails immutable message identity validation before execute and preserves the uncertain lock.`)
    } finally { await f.close() }
  }
  for (const mutation of ['config', 'context_hash']) {
    const f = await fixture(`changed-prepare-reconcile-${mutation}`)
    try {
      f.state.prepareLoss = true
      await f.page.goto(f.urlFor()); await f.ready()
      const form = await f.open()
      await f.toConfirm(form); await f.submit(form); await f.waitUnknown(form)
      f.state.receiptMutation = mutation
      const before = f.writes.length
      await f.checkReceipt(form); await f.waitUnknown(form)
      assert.equal(f.writes.length, before)
      assert.equal(f.state.runs.length, 0)
      assert.equal(await f.consent(form).isChecked(), false)
      assert.equal(await disabled(form.getByRole('button', { name: 'Confirm & start run', exact: true })), true)
      f.state.receiptMutation = ''
      await f.checkReceipt(form)
      await form.getByText('This turn context and resources are locked. Fresh execution consent is still required.', { exact: true }).waitFor()
      assert.equal(f.writes.length, before)
      assert.equal(f.state.runs.length, 0)
      assert.equal(await f.consent(form).isChecked(), false)
      f.state.receiptMutation = 'candidate_hash'
      await f.checkReceipt(form); await f.waitUnknown(form)
      assert.equal(f.writes.length, before)
      assert.equal(f.state.runs.length, 0)
      assert.equal(await disabled(form.getByRole('button', { name: 'Confirm & start run', exact: true })), true)
      record(f.name, `An unknown prepare GET with changed ${mutation} cannot replace its pending exact candidate or unlock execution; the matching receipt restores review without auto-execution.`)
    } finally { await f.close() }
  }
  {
    const f = await fixture('read-boundaries')
    try {
      f.state.capability = false
      await f.page.goto(f.urlFor())
      await f.conversation.getByText('Task conversation is not enabled on this server', { exact: true }).waitFor()
      assert.equal(f.requests.filter((request) => request.path.includes('/turns')).length, 0)
      f.state.capability = true
      await f.page.reload(); await f.ready()
      const offPage = f.state.turns.at(-1)
      offPage.state = 'prepared'
      offPage.candidate = {
        candidate_hash: 'c'.repeat(64), config, snapshot: snapshotFor(offPage),
      }
      await f.conversation.getByRole('button', { name: 'Refresh conversation', exact: true }).click()
      await f.conversation.locator(`[data-task-turn="${offPage.id}"]`).waitFor()
      assert.equal(await f.conversation.locator('[data-task-turn]').count(), 21)
      assert.equal(await disabled(f.root.getByRole('button', { name: 'Arrange execution', exact: true })), true)
      await f.conversation.getByRole('button', { name: 'Next messages', exact: true }).click()
      await f.conversation.getByTestId('task-turn-range').getByText('21-23 / 23', { exact: true }).waitFor()
      assert.equal(await f.conversation.locator('[data-task-turn]').count(), 3)
      assert.equal(await f.conversation.locator(`[data-task-turn="${offPage.id}"]`).count(), 1)
      offPage.state = 'saved'; offPage.candidate = null
      await f.conversation.getByRole('button', { name: 'Previous messages', exact: true }).click()
      await f.conversation.getByTestId('task-turn-range').getByText('1-20 / 23', { exact: true }).waitFor()
      record(f.name, 'An independently hydrated off-page prepared Turn remains visible as the21st bounded DTO and locks Arrange; its page overlap renders one consistent message.')
      for (const [status, malformed] of [[403, false], [404, false], [503, false], [0, true]]) {
        f.state.listStatus = status; f.state.malformed = malformed
        await f.conversation.getByRole('button', { name: 'Refresh conversation', exact: true }).click()
        await f.conversation.getByRole('button', { name: 'Retry conversation', exact: true }).waitFor()
        assert.equal(await f.conversation.locator('[data-task-turn]').count(), 0)
        assert.equal(await disabled(f.root.getByRole('button', { name: 'Arrange execution', exact: true })), true)
        f.state.listStatus = 0; f.state.malformed = false
        await f.conversation.getByRole('button', { name: 'Retry conversation', exact: true }).click()
        await f.ready()
      }
      record(f.name, 'Capabilityfalse performs no Turn reads; advertised403/404/503/malformed pages hide old content and pause Arrange without Bootstrap fallback.')
      f.state.holdList = true
      await f.conversation.getByRole('button', { name: 'Refresh conversation', exact: true }).click()
      await f.page.waitForFunction(() => document.querySelector('[data-testid="task-conversation"]')?.getAttribute('aria-busy') === 'true')
      assert.equal(f.state.held, true)
      await f.page.goto(f.urlFor(otherTask.id)); await f.ready(otherTask.id)
      f.state.releaseList?.()
      await f.page.waitForTimeout(100)
      assert.equal(await f.conversation.locator('[data-task-turn]').count(), 0)
      assert.equal(await f.root.getByRole('heading', { name: otherTask.title, exact: true }).count(), 1)
      record(f.name, 'An obsolete held Task conversation response cannot overwrite the next Task or expose its message controls.')
      await f.page.goto(f.urlFor()); await f.ready()
      f.state.listStatus = 401
      await f.conversation.getByRole('button', { name: 'Refresh conversation', exact: true }).click()
      await f.page.getByRole('heading', { name: 'Sign in to workspace', exact: true }).waitFor()
      assert.equal(await f.page.locator('[data-task-turn]').count(), 0)
      assert.equal(f.writes.length, 0)
      record(f.name, '401 removes the private conversation and returns to authentication without mutations or replay.')
    } finally { await f.close() }
  }
  for (const [style, mode, width, locale] of [
    ['neutral', 'light', 1440, 'en'], ['neutral', 'dark', 1440, 'en'],
    ['zira', 'light', 1440, 'en'], ['zira', 'dark', 390, 'zh'],
    ['y2k', 'light', 1440, 'en'], ['y2k', 'dark', 390, 'zh'],
  ]) {
    const f = await fixture(`${style}-${mode}-${width}`, { style, mode, width, locale })
    try {
      await f.page.goto(f.urlFor()); await f.ready()
      const geometry = await f.page.evaluate(() => {
        const element = document.querySelector('[data-testid="task-conversation"]')
        const style = getComputedStyle(element)
        const root = document.querySelector('.wb-app') ?? document.body
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          color: style.color, background: getComputedStyle(root).backgroundColor,
          font: style.fontFamily, radius: style.borderRadius,
          visibleWidth: element.getBoundingClientRect().width,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          bodyColor: getComputedStyle(document.body).backgroundColor,
        }
      })
      assert.ok(geometry.overflow <= 1, JSON.stringify(geometry))
      assert.ok(geometry.visibleWidth > 250 && geometry.reducedMotion)
      report.geometry.push({ style, mode, width, locale, ...geometry })
      const composer = f.conversation.getByRole('textbox', { name: f.tr('补充要求', 'Supplemental requirements'), exact: true })
      await composer.fill('Long localized requirements remain readable across appearance settings. 中英文补充要求')
      await f.shot('conversation')
      assert.equal(f.writes.length, 0)
      record(f.name, 'One Conversation tree renders reduced motion, localized controls and bounded content without document overflow or model/mutation calls.')
    } finally { await f.close() }
  }
  assert.ok(new Set(report.geometry.map((item) => `${item.color}|${item.background}|${item.font}|${item.bodyColor}`)).size >= 3)
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.errors, [])
  assert.equal(report.writes.some((write) => /\/runs$|\/test$|\/check$/.test(write.path)), false)
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  await failurePage?.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
