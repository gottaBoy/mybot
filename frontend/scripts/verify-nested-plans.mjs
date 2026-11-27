import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const backend = process.env.NESTED_PLAN_FIXTURE_URL ?? 'http://127.0.0.1:4187/'
for (const url of [new URL(base), new URL(backend)]) {
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(!['4180', '5173'].includes(url.port))
}
const origin = new URL(base).origin
const out = resolve(process.env.NESTED_PLAN_EVIDENCE_DIR ?? '/tmp/mybot-nested-plans')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
).href)
const browser = await chromium.launch({
  headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  fixture: true,
  modelGeneration: 'Deterministic FakeProvider text; no paid provider transport',
  actualExecution: 'Application HTTP, SQLite, explicit research Runs and human report decisions',
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
const editor = () => page.getByTestId('task-plan-editor')
const section = (number) => editor().getByRole('region', { name: `Subtask ${number}`, exact: true })
const arrange = () => page.getByRole('button', { name: 'Arrange execution', exact: true })
const disabled = async (locator) =>
  await locator.isDisabled() || await locator.getAttribute('aria-disabled') === 'true'
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
  return value
}
async function poll(test, name) {
  for (let index = 0; index < 250; index++) {
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
async function openTask(id, tab = 'goal', runId) {
  const query = new URLSearchParams()
  if (tab !== 'goal') query.set('taskTab', tab)
  if (runId) query.set('taskRun', runId)
  await page.goto(`${base}#task/${encodeURIComponent(id)}${query.size ? `?${query}` : ''}`)
  await page.reload()
  await arrange().waitFor()
  if (tab === 'goal') await page.locator('.wb-task-plan').waitFor()
}
async function finished(id) {
  let value
  await poll(async () => {
    value = await read(`/runs/${id}`)
    return ['succeeded', 'failed', 'canceled'].includes(value.run.status)
  }, 'explicit fixture research Run')
  assert.equal(value.run.status, 'succeeded', value.run.error)
  assert.equal(value.calls.length, 4)
  assert.equal(value.artifacts.filter((item) => item.kind === 'report').length, 1)
  return value
}
async function startFromTask(task) {
  await openTask(task.id)
  await poll(async () => !await disabled(arrange()), 'ready task execution controls')
  await arrange().click()
  const form = page.locator('.wb-form')
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('checkbox').check()
  const response = page.waitForResponse((value) =>
    new URL(value.url()).pathname === `/api/tasks/${task.id}/runs` &&
    value.request().method() === 'POST')
  await form.getByRole('button', { name: 'Confirm & start run', exact: true }).click()
  const result = await response
  assert.equal(result.status(), 201)
  return finished((await result.json()).id)
}
async function decideReport(task, detail, accepted = true) {
  const artifact = detail.artifacts.find((item) => item.kind === 'report')
  assert.ok(artifact)
  await openTask(task.id, 'review', detail.run.id)
  await page.getByRole('button', {
    name: accepted ? 'Accept' : 'Request changes', exact: true,
  }).click()
  const decision = accepted ? 'accepted' : 'changes_requested'
  await poll(async () => (await read(`/runs/${detail.run.id}`)).artifacts
    .find((item) => item.id === artifact.id)?.decision === decision, 'explicit human report decision')
  return { ...artifact, decision }
}
async function blockedRun(task, model, requestId) {
  const before = await fixtureStatus()
  const snapshot = await post(`/tasks/${task.id}/preview`, {})
  await post(`/tasks/${task.id}/runs`, {
    coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
    max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800,
    context_hash: snapshot.context_hash, consent: true, request_id: requestId,
  }, 409)
  const after = await fixtureStatus()
  assert.equal(after.model_calls, before.model_calls)
  assert.equal(after.counts.runs, before.counts.runs)
}
async function losePost(path, expectedStatus = 200) {
  let complete, fail
  const receipt = new Promise((resolveReceipt, rejectReceipt) => {
    complete = resolveReceipt
    fail = rejectReceipt
  })
  const pattern = `**${path}`
  const handler = async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    try {
      const response = await route.fetch()
      assert.equal(response.status(), expectedStatus)
      const value = await response.json()
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
function writesTo(path) {
  return report.writes.filter((item) => item.path === path && item.method === 'POST').length
}
async function startPreparedWithLostResponse(task, model) {
  const turn = await post(`/tasks/${task.id}/turns`, {
    request_id: 'nested-a1-original-turn',
    content: 'Analyze only this selected source supplement and record unknowns without claiming tests ran.',
  }, 201)
  const snapshot = await post(`/tasks/${task.id}/turns/${turn.id}/preview`, {})
  const prepared = await post(`/tasks/${task.id}/turns/${turn.id}/prepare`, {
    coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
    max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800,
    context_hash: snapshot.context_hash,
  })
  assert.equal(prepared.state, 'prepared')
  const executePath = `/api/tasks/${task.id}/turns/${turn.id}/execute`
  const lost = await losePost(executePath)
  await openTask(task.id)
  await page.getByRole('button', { name: 'Continue prepared run', exact: true }).click()
  const form = page.locator('.wb-form')
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Confirm & start run', exact: true }).click()
  const applied = await lost.receipt
  assert.equal(applied.id, turn.id)
  assert.equal(applied.request_id, turn.request_id)
  assert.equal(applied.state, 'applied')
  assert.equal(applied.candidate.candidate_hash, prepared.candidate.candidate_hash)
  await form.getByText(
    'The request outcome is unconfirmed. Check the original receipt before sending again.',
    { exact: true },
  ).waitFor()
  await capture('a1-execution-response-lost.png')
  await lost.stop()
  await form.getByRole('button', { name: 'Check turn receipt', exact: true }).click()
  await form.waitFor({ state: 'hidden' })
  const value = await finished(applied.run_id)
  assert.equal(value.run.request_id, turn.request_id)
  assert.equal(writesTo(executePath), 1)
  assert.ok(report.reads.some((item) => item.path === `/api/tasks/${task.id}/turns/${turn.id}`))
  report.executionReconciliation = {
    task_id: task.id, turn_id: turn.id, request_id: turn.request_id,
    candidate_hash: prepared.candidate.candidate_hash, run_id: value.run.id,
    execute_posts: writesTo(executePath),
  }
  return value
}

try {
  await page.goto(base)
  await post('/auth', { token: 'astryx-browser-fixture' })
  const initial = await read('/bootstrap')
  assert.equal(initial.tasks.length, 0)
  assert.equal(initial.capabilities.task_plans, true)
  assert.equal(initial.capabilities.task_plan_revisions, true)
  assert.equal(initial.capabilities.nested_task_plans, true)
  const start = await fixtureStatus()
  assert.equal(start.model_calls, 0)
  assert.equal(start.counts.tasks, 0)
  assert.equal(start.counts.runs, 0)
  const project = await post('/projects', {
    name: 'Nested task plan acceptance', directory: '.',
    goal: 'Deliver a reviewed nested source outcome with explicit integration.',
    notes: 'Disposable nested-plan fixture; deterministic FakeProvider only.',
  }, 201)
  const model = await post('/models', {
    name: 'Nested plan research fixture', model: 'nested-plan-fixture',
    endpoint: 'http://127.0.0.1:9999/v1', key_env: '',
  }, 201)
  const root = await post('/tasks', {
    project_id: project.id, title: 'Reviewed nested source outcome',
    goal: 'Establish the source boundary, integrate reviewed analysis, then validate the outcome.',
    acceptance: 'Explicit child reports and a separately reviewed integration support the outcome.',
    files: ['README.md'],
  }, 201)
  const definition = { items: [
    { key: 'x', title: 'X - Establish the source boundary',
      goal: 'Inspect the explicit source and establish the evidence boundary.',
      acceptance: 'The boundary report is explicitly accepted.', files: ['README.md'], depends_on: [] },
    { key: 'a', title: 'A - Integrate the reviewed source analysis',
      goal: 'Integrate accepted child analysis after the source boundary is reviewed.',
      acceptance: 'A fresh integration report binds the reviewed child evidence.',
      files: ['README.md'], depends_on: ['x'] },
    { key: 'b', title: 'B - Validate the accepted integration',
      goal: 'Validate the accepted current integration without claiming unexecuted tests.',
      acceptance: 'The validation report distinguishes evidence from recommendations.',
      files: ['README.md'], depends_on: ['a'] },
  ] }
  const rootPreview = await post(`/tasks/${root.id}/plan/preview`, definition)
  const originalRoot = await post(`/tasks/${root.id}/plan`, {
    ...definition, request_id: 'nested-root-original-plan',
    preview_hash: rootPreview.preview_hash, consent: true,
  })
  assert.equal(originalRoot.result.schema_version, 1)
  const [x, container, dependent] = originalRoot.result.plan.items.map((item) => item.task)
  await openTask(root.id)
  await page.locator('.wb-task-plan-items > li').first().waitFor()
  await capture('root-flat-plan-before-nesting.png')

  await openTask(container.id)
  assert.ok(await disabled(arrange()))
  await page.getByRole('button', { name: 'Break down task', exact: true }).click()
  const firstTitle = 'A1 - Inspect explicit source assumptions'
  const secondTitle = 'A2 - Validate the reviewed first analysis'
  for (const [number, title, goal, acceptance] of [
    [1, firstTitle, 'Inspect the explicit source assumptions and record bounded unknowns.',
      'The first source report receives explicit human acceptance.'],
    [2, secondTitle, 'Validate the reviewed first analysis and document remaining risks.',
      'The second source report distinguishes verified evidence from proposed checks.'],
  ]) {
    await section(number).getByRole('textbox', { name: 'Task title', exact: true }).fill(title)
    await section(number).getByRole('textbox', { name: 'Task goal', exact: true }).fill(goal)
    await section(number).getByRole('textbox', { name: 'Acceptance', exact: true }).fill(acceptance)
    await section(number).getByRole('checkbox', { name: 'README.md', exact: true }).check()
  }
  await section(2).getByRole('checkbox', { name: firstTitle, exact: true }).check()
  await page.keyboard.press('Escape')
  const guard = page.getByRole('dialog', { name: 'Discard breakdown edits?', exact: true })
  await guard.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await section(1).getByRole('textbox', { name: 'Task title', exact: true }).inputValue(), firstTitle)
  assert.equal(await section(2).getByRole('checkbox', { name: firstTitle, exact: true }).isChecked(), true)
  assert.equal((await fixtureStatus()).model_calls, 0)
  check('A blocked container can draft a nested plan; Escape/Keep editing preserves its goals and dependency without model calls')

  await editor().getByRole('button', { name: 'Review task breakdown', exact: true }).click()
  await editor().getByRole('region', { name: 'Verified breakdown', exact: true }).waitFor()
  await editor().getByRole('region', { name: 'Nested breakdown impact', exact: true }).waitFor()
  await capture('nested-preview-desktop.png')
  const createPath = `/api/tasks/${container.id}/plan`
  const lostCreate = await losePost(createPath)
  await editor().getByRole('checkbox', {
    name: 'Confirm creating these tasks and fixed dependencies without starting a model.', exact: true,
  }).check()
  await editor().getByRole('button', { name: 'Confirm subtask creation', exact: true }).click()
  const nestedReceipt = await lostCreate.receipt
  assert.equal(nestedReceipt.schema_version, 3)
  assert.equal(nestedReceipt.result.schema_version, 3)
  assert.equal(nestedReceipt.result.parent.task_id, root.id)
  await editor().getByText(
    'Creation outcome is unknown. Keep and check the original request; do not repeat creation.',
    { exact: true },
  ).waitFor()
  assert.ok(page.url().includes(`taskPlanRequest=${nestedReceipt.request_id}`))
  await lostCreate.stop()
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('taskPlanRequest='))
  await page.locator('.wb-task-plan-items > li').first().waitFor()
  const [first, second] = nestedReceipt.result.plan.items.map((item) => item.task)
  assert.equal(writesTo(createPath), 1)
  assert.ok(report.reads.some((item) =>
    item.path === `${createPath}/operations/${nestedReceipt.request_id}`))
  const published = await read(`/tasks/${container.id}/plan`)
  assert.equal(published.schema_version, 3)
  assert.equal(published.depth, 1)
  assert.equal(published.parent.task_id, root.id)
  assert.equal(published.plan.items.length, 2)
  await page.locator('.wb-task-plan').getByRole('link', { name: root.title, exact: true }).waitFor()
  await capture('nested-parent-and-own-plan.png')
  assert.equal((await fixtureStatus()).model_calls, 0)
  assert.equal((await fixtureStatus()).counts.tasks, 6)
  assert.deepEqual(await read(`/tasks/${root.id}/plan/operations/${originalRoot.request_id}`), originalRoot)
  check('Lost nested creation reconciles schema3 by the original GET ID, keeps the old schema1 receipt, and presents parent plus own plan with one POST')

  await page.locator('.wb-task-plan-item-heading').getByRole('link', { name: first.title, exact: true }).click()
  await arrange().waitFor()
  await page.getByText('Inherited ancestor prerequisites', { exact: false }).first().waitFor()
  assert.ok(await disabled(arrange()))
  assert.equal((await read(`/tasks/${first.id}/plan`)).gate.depth, 2)
  await blockedRun(first, model, 'nested-blocked-ancestor')
  await capture('grandchild-inherited-prerequisite-blocked.png')
  check('A real child navigation opens the grandchild, and its missing ancestor review blocks both the UI and direct Run POST without a model call')

  await openTask(container.id)
  const planReadPath = `/api/tasks/${container.id}/plan`
  const unavailable = (route) => route.request().method() === 'GET'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"unavailable"}' })
    : route.continue()
  await page.route(`**${planReadPath}`, unavailable)
  await page.reload()
  await page.locator('.wb-task-plan').getByText(
    'Task dependencies could not be read. New execution is blocked.', { exact: true },
  ).waitFor()
  assert.ok(await disabled(arrange()))
  await capture('nested-read-failure-blocks-execution.png')
  await page.unroute(`**${planReadPath}`, unavailable)
  await page.getByRole('button', { name: 'Refresh task dependencies', exact: true }).click()
  await page.locator('.wb-task-plan-items > li').first().waitFor()
  assert.equal((await fixtureStatus()).model_calls, 0)
  check('An advertised nested-plan read failure blocks new execution and recovers by GET without pretending the plan or counts are empty')

  const xRun = await startFromTask(x)
  await decideReport(x, xRun)
  assert.equal((await read(`/tasks/${first.id}/plan`)).gate.ready, true)
  await openTask(first.id)
  await poll(async () => !await disabled(arrange()), 'grandchild admission after ancestor acceptance')
  const firstRun = await startPreparedWithLostResponse(first, model)
  assert.equal(firstRun.run.context.task_dependencies.schema_version, 3)
  assert.equal(firstRun.run.context.task_dependencies.external_scopes[1].prerequisites[0].latest_run.id, xRun.run.id)
  await openTask(second.id)
  assert.ok(await disabled(arrange()))
  await blockedRun(second, model, 'nested-blocked-unreviewed-child')
  await capture('successful-child-still-awaits-human-review.png')
  check('Accepted ancestor evidence admits A1; its lost execution reconciles the same prepared message by GET with one execute POST, while unreviewed success still blocks A2')

  const firstReport = await decideReport(first, firstRun)
  assert.equal((await read(`/tasks/${second.id}/plan`)).gate.ready, true)
  const secondRun = await startFromTask(second)
  const secondReport = await decideReport(second, secondRun)
  const readyContainer = await read(`/tasks/${container.id}/plan`)
  assert.equal(readyContainer.gate.own_plan.ready, true)
  assert.equal(readyContainer.gate.ready, true)
  assert.equal((await read(`/tasks/${dependent.id}/plan`)).gate.ready, false)
  await openTask(container.id)
  await page.getByText('Direct child reports accepted 2 / 2', { exact: false }).first().waitFor()
  await poll(async () => !await disabled(arrange()), 'container admission after child acceptance')
  await capture('children-accepted-container-needs-integration.png')
  await blockedRun(dependent, model, 'nested-blocked-before-integration')
  check('Both real child reports are accepted before A can run, and B remains blocked until A has a separately reviewed integration')

  const integrationRun = await startFromTask(container)
  const recorded = integrationRun.run.context.task_dependencies
  assert.equal(recorded.own_plan.completion_scope_hash, readyContainer.gate.own_plan.completion_scope_hash)
  assert.equal(integrationRun.run.context.task_plan_scope.scope_hash, readyContainer.gate.scope_hash)
  assert.deepEqual(recorded.own_plan.children.map((item) => item.latest_run.id), [firstRun.run.id, secondRun.run.id])
  assert.ok(!integrationRun.run.context.text.includes(firstReport.content))
  assert.ok(!integrationRun.run.context.text.includes(secondReport.content))
  const integrationReport = await decideReport(container, integrationRun)
  assert.equal((await read(`/tasks/${dependent.id}/plan`)).gate.ready, true)
  await openTask(root.id)
  await page.getByText('Latest report accepted', { exact: true }).first().waitFor()
  await capture('reviewed-integration-unlocks-upper-dependent.png')
  const dependentRun = await startFromTask(dependent)
  assert.equal(dependentRun.run.context.task_dependencies.external_scopes[0].prerequisites[0].latest_run.id, integrationRun.run.id)
  const frozenDependentContext = structuredClone(dependentRun.run.context)
  const frozenIntegrationContext = structuredClone(integrationRun.run.context)
  check('A fresh explicit integration binds exact child completion evidence without sending child bodies, and human acceptance admits a real four-call B Run')

  await decideReport(first, firstRun, false)
  const blockedDependent = await read(`/tasks/${dependent.id}/plan`)
  assert.equal(blockedDependent.gate.ready, false)
  assert.equal(blockedDependent.gate.external_scopes[0].prerequisites[0].state, 'children_pending')
  await openTask(dependent.id, 'work', dependentRun.run.id)
  assert.ok(await disabled(arrange()))
  const confirmed = page.getByText('Confirmed context boundary', { exact: true })
  await confirmed.click()
  const admission = page.getByTestId('dependency-admission')
  await admission.locator(':scope > summary').click()
  await capture('withdrawn-child-current-gate-and-original-admission.png')
  await blockedRun(dependent, model, 'nested-blocked-after-withdrawal')
  const afterDependent = await read(`/runs/${dependentRun.run.id}`)
  const afterIntegration = await read(`/runs/${integrationRun.run.id}`)
  assert.equal(afterDependent.run.status, 'succeeded')
  assert.deepEqual(afterDependent.run.context, frozenDependentContext)
  assert.deepEqual(afterIntegration.run.context, frozenIntegrationContext)
  assert.equal(afterIntegration.artifacts.find((item) => item.id === integrationReport.id).decision, 'accepted')
  check('Withdrawing A1 review blocks future B execution while the completed B Run, original integration context and accepted integration report remain unchanged')

  const beforeAppearance = await fixtureStatus()
  await openTask(container.id)
  for (const style of ['neutral', 'zira', 'y2k']) {
    for (const mode of ['light', 'dark']) {
      const locale = mode === 'dark' ? 'zh' : 'en'
      const width = mode === 'dark' ? 390 : 1440
      await page.evaluate(({ style, mode, locale }) => {
        localStorage.setItem('mybot.style', style)
        localStorage.setItem('mybot.mode', mode)
        localStorage.setItem('mybot.locale', locale)
      }, { style, mode, locale })
      await page.setViewportSize({ width, height: 1000 })
      await page.reload()
      await page.locator(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`).waitFor()
      await page.locator('.wb-task-plan-items > li').first().waitFor()
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('.wb-theme')
        const panel = document.querySelector('.wb-task-plan')
        const button = panel.querySelector('button')
        const a = getComputedStyle(root), b = getComputedStyle(button)
        return {
          width: innerWidth, scroll: document.documentElement.scrollWidth,
          root: { color: a.color, background: a.backgroundColor, font: a.fontFamily },
          button: { color: b.color, background: b.backgroundColor, radius: b.borderRadius, font: b.fontFamily },
          items: [...panel.querySelectorAll('.wb-task-plan-items > li')].map((item) => item.getBoundingClientRect().toJSON()),
        }
      })
      assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
      assert.equal(geometry.items.length, 2)
      report.geometry.push({ style, mode, locale, ...geometry })
      await capture(`nested-${style}-${mode}.png`)
    }
  }
  assert.equal(new Set(report.geometry.filter((item) => item.mode === 'light')
    .map(({ root, button }) => JSON.stringify({ root, button }))).size, 3)
  for (const style of ['neutral', 'zira', 'y2k']) {
    const light = report.geometry.find((item) => item.style === style && item.mode === 'light')
    const dark = report.geometry.find((item) => item.style === style && item.mode === 'dark')
    assert.notEqual(light.root.background, dark.root.background)
  }
  const final = await fixtureStatus()
  assert.equal(final.model_calls, beforeAppearance.model_calls)
  assert.deepEqual(final.counts, beforeAppearance.counts)
  assert.equal(final.counts.tasks, 6)
  assert.equal(final.counts.runs, 5)
  assert.equal(final.counts.calls, 20)
  assert.equal(final.model_calls, 20)
  assert.equal(final.counts.plans, 2)
  assert.equal(final.counts.nested_roots, 1)
  check('The same parent-plus-own-plan view fits three computed styles in both modes, English desktop and Chinese mobile, without changing stored work or calling a model')

  report.actual = {
    root_task_id: root.id, ancestor_task_id: x.id, container_task_id: container.id,
    first_task_id: first.id, second_task_id: second.id, dependent_task_id: dependent.id,
    run_ids: [xRun.run.id, firstRun.run.id, secondRun.run.id, integrationRun.run.id, dependentRun.run.id],
    creation_request_id: nestedReceipt.request_id, creation_posts: writesTo(createPath),
    integration_completion_scope_hash: recorded.own_plan.completion_scope_hash,
    final_counts: final.counts, model_calls: final.model_calls,
    initial_hashes: final.initial_hashes, current_hashes: final.current_hashes,
  }
  await writeFile(resolve(out, 'nested-creation-receipt.json'), JSON.stringify(nestedReceipt, null, 2))
  await writeFile(resolve(out, 'integration-admission.json'), JSON.stringify(recorded, null, 2))
  await writeFile(resolve(out, 'original-dependent-admission.json'),
    JSON.stringify(dependentRun.run.context.task_dependencies, null, 2))
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (error) {
  report.failure = error.stack ?? String(error)
  await capture('failure.png').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
