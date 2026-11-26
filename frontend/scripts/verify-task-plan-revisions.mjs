import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.PLAN_REVISION_EVIDENCE_DIR ?? '/tmp/mybot-task-plan-revisions')
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs').href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  fixture: true,
  modelGeneration: 'BrowserProvider/FakeProvider fixture; no paid or real Provider call',
  actualExecution: 'Actual HTTP, SQLite, explicit research Runs and human Artifact decisions',
  checks: [], errors: [], external: [], reads: [], writes: [], screenshots: [], geometry: [], dialogs: [],
}
const check = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
async function watch(context, name) {
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return
    const value = { context: name, path: url.pathname, method: request.method() }
    if (request.method() === 'GET') report.reads.push(value)
    else report.writes.push(value)
  })
  context.on('page', (page) => {
    page.on('pageerror', (error) => report.errors.push(error.message))
    page.on('dialog', async (dialog) => {
      report.dialogs.push({ type: dialog.type(), message: dialog.message() })
      await dialog.accept()
    })
  })
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol.startsWith('http') && url.origin !== origin) {
      report.external.push({ context: name, origin: url.origin })
      return route.abort()
    }
    return route.continue()
  })
}
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return
  if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
  if (!localStorage.getItem('mybot.style')) localStorage.setItem('mybot.style', 'neutral')
  if (!localStorage.getItem('mybot.mode')) localStorage.setItem('mybot.mode', 'light')
})
await watch(context, 'owner')
const page = await context.newPage()
page.setDefaultTimeout(15000)
const editor = () => page.getByTestId('task-plan-editor')
const section = (number) => editor().getByRole('region', { name: `Subtask ${number}`, exact: true })
async function api(target, path, body) {
  return target.evaluate(async ({ path, body }) => {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workbench-Request': '1' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: response.status, data: await response.json() }
  }, { path, body })
}
async function read(path) {
  const response = await api(page, path)
  assert.equal(response.status, 200, JSON.stringify(response.data))
  return response.data
}
async function poll(test, label) {
  for (let index = 0; index < 200; index++) {
    if (await test()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${label}`)
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
  await page.getByRole('button', { name: 'Arrange execution', exact: true }).waitFor()
}
async function disabled(locator) {
  return await locator.isDisabled() || await locator.getAttribute('aria-disabled') === 'true'
}
async function runFromTask(id) {
  await page.getByRole('button', { name: 'Arrange execution', exact: true }).click()
  const form = page.locator('.wb-form')
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('button', { name: 'Next', exact: true }).click()
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Confirm & start run', exact: true }).click()
  let detail
  await poll(async () => {
    const latest = (await read(`/tasks/${id}/detail`)).item.latest_run
    if (!latest) return false
    detail = await read(`/runs/${latest.id}`)
    return ['succeeded', 'failed'].includes(detail.run.status)
  }, 'actual fixture research Run')
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  assert.equal(detail.calls.length, 4)
  return detail
}
async function acceptReport(task, detail) {
  const artifact = detail.artifacts.find((item) => item.kind === 'report')
  assert.ok(artifact)
  await openTask(task.id, 'review', detail.run.id)
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await poll(async () => (await read(`/runs/${detail.run.id}`)).artifacts
    .find((item) => item.id === artifact.id).decision === 'accepted', 'human report review')
  return artifact
}
async function blockedStart(task, model, requestId) {
  const context = (await api(page, `/tasks/${task.id}/preview`, {})).data
  const response = await api(page, `/tasks/${task.id}/runs`, {
    coordinator_model: model.id, researcher_model: model.id, reviewer_model: model.id,
    context_hash: context.context_hash, consent: true, request_id: requestId,
  })
  assert.equal(response.status, 409, JSON.stringify(response.data))
}
let competingContext
try {
  await page.goto(base)
  assert.equal((await api(page, '/auth', { token: 'astryx-browser-fixture' })).status, 200)
  const initial = await read('/bootstrap')
  assert.equal(initial.tasks.length, 0)
  assert.equal(initial.capabilities.task_plans, true)
  assert.equal(initial.capabilities.task_plan_revisions, true)
  const project = (await api(page, '/projects', {
    name: 'Task plan revision acceptance', directory: '.',
    goal: 'Revise real research work while preserving its accepted history',
    notes: 'Disposable plan revision fixture, deterministic BrowserProvider only',
  })).data
  const model = (await api(page, '/models', {
    name: 'Plan revision research fixture', model: 'fake-test',
    endpoint: 'http://127.0.0.1:9999/v1', key_env: '',
  })).data
  const parent = (await api(page, '/tasks', {
    project_id: project.id, title: '真实任务计划修订与历史保护',
    goal: 'Analyze source boundaries and revise the plan when acceptance changes, preserving all earlier work.',
    acceptance: 'New requirements receive new Task identities and fresh reviewed evidence before dependent execution.',
    files: ['README.md'],
  })).data
  const root = `/tasks/${parent.id}/plan`
  const createPath = `/api${root}`
  const previewPath = `/api${root}/revisions/preview`
  const publishPath = `/api${root}/revisions`
  const sourceTitle = '梳理源码边界与未知项'
  const dependentTitle = '基于已验收结论制定验证步骤'
  const oldAcceptance = 'A final source report records explicit evidence and unresolved assumptions.'
  const revisedAcceptance = '重新核查源码边界、原有假设及变化风险；本版结论必须经过新的人工验收。'
  await openTask(parent.id)
  await page.getByRole('button', { name: 'Break down task', exact: true }).click()
  for (const [number, title, goal, acceptance] of [
    [1, sourceTitle, 'Analyze the selected README and record source boundaries with explicit unknowns.', oldAcceptance],
    [2, dependentTitle, 'Develop concrete validation advice after the source report has been accepted.',
      'The validation report separates actual evidence from recommended tests.'],
  ]) {
    await section(number).getByRole('textbox', { name: 'Task title', exact: true }).fill(title)
    await section(number).getByRole('textbox', { name: 'Task goal', exact: true }).fill(goal)
    await section(number).getByRole('textbox', { name: 'Acceptance', exact: true }).fill(acceptance)
    await section(number).getByRole('checkbox', { name: 'README.md', exact: true }).check()
  }
  await section(2).getByRole('checkbox', { name: sourceTitle, exact: true }).check()
  await editor().getByRole('button', { name: 'Review task breakdown', exact: true }).click()
  await editor().getByRole('region', { name: 'Verified breakdown', exact: true }).waitFor()
  await editor().getByRole('checkbox', {
    name: 'Confirm creating these tasks and fixed dependencies without starting a model.', exact: true,
  }).check()
  const creationResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === createPath && response.request().method() === 'POST')
  await editor().getByRole('button', { name: 'Confirm subtask creation', exact: true }).click()
  const createdResponse = await creationResponse
  assert.equal(createdResponse.status(), 200)
  const creation = await createdResponse.json()
  const oldSource = creation.result.plan.items[0].task
  const oldDependent = creation.result.plan.items[1].task
  await page.locator('.wb-task-plan-items > li').first().waitFor()
  assert.equal((await read('/bootstrap')).runs.length, 0)
  const versionOne = await read(`${root}/versions/1`)
  await capture('v1-real-task-plan.png')
  check('The real editor creates v1 with two persisted child Tasks and an explicit dependency without starting a model')

  await openTask(oldSource.id)
  const firstRun = await runFromTask(oldSource.id)
  const oldReport = await acceptReport(oldSource, firstRun)
  const frozenOldDetail = await read(`/runs/${firstRun.run.id}`)
  assert.equal(frozenOldDetail.artifacts.find((item) => item.id === oldReport.id).decision, 'accepted')
  await openTask(parent.id)
  await page.getByText('Latest report accepted', { exact: true }).waitFor()
  check('A v1 prerequisite actually completes four FakeProvider calls and receives an explicit human report acceptance')

  await page.getByRole('button', { name: 'Revise plan', exact: true }).click()
  await page.getByRole('dialog', { name: 'Revise task plan', exact: true }).waitFor()
  assert.equal(await section(1).getByRole('textbox', { name: 'Acceptance', exact: true }).inputValue(), oldAcceptance)
  await section(1).getByRole('textbox', { name: 'Acceptance', exact: true }).fill(revisedAcceptance)
  const inspectedResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === previewPath && response.request().method() === 'POST')
  await editor().getByRole('button', { name: 'Review plan revision', exact: true }).click()
  const inspected = await inspectedResponse
  assert.equal(inspected.status(), 200)
  const preview = await inspected.json()
  assert.deepEqual(preview.impact.replaced_keys, ['step1', 'step2'])
  assert.deepEqual(preview.impact.retired_task_ids, [oldSource.id, oldDependent.id])
  assert.deepEqual(preview.impact.blockers, [])
  const impact = editor().getByRole('region', { name: 'Revision impact', exact: true })
  await impact.getByRole('heading', { name: 'Revision impact', exact: true }).waitFor()
  assert.match(await impact.innerText(), /Replace with new tasks/)
  await impact.getByText(oldSource.id, { exact: true }).waitFor()
  await impact.getByText(oldDependent.id, { exact: true }).waitFor()
  assert.equal((await read('/bootstrap')).tasks.length, 3)
  await capture('v2-reviewed-impact-desktop.png')
  check('Editing source acceptance shows a real verified impact: both the source and its downstream task get fresh identities while old work is retained')

  let resolveLost, rejectLost
  const lost = new Promise((done, reject) => { resolveLost = done; rejectLost = reject })
  await page.route(`**${publishPath}`, async (route) => {
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      const receipt = await response.json()
      await route.abort('failed')
      resolveLost(receipt)
    } catch (error) {
      rejectLost(error)
    }
  })
  await editor().getByRole('checkbox', {
    name: 'Confirm publishing this revision and its impact, preserving old tasks and runs without starting a model.', exact: true,
  }).check()
  await editor().getByRole('button', { name: 'Confirm plan revision', exact: true }).click()
  const revision = await lost
  await editor().getByText(
    'Creation outcome is unknown. Keep and check the original request; do not repeat creation.', { exact: true },
  ).waitFor()
  assert.ok(page.url().includes(`taskPlanRequest=${revision.request_id}`))
  await page.unroute(`**${publishPath}`)
  const writesBeforeReload = report.writes.length
  const readsBeforeReload = report.reads.length
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('taskPlanRequest='))
  await page.getByText('Current plan · v2', { exact: true }).waitFor()
  assert.equal(report.writes.length, writesBeforeReload)
  assert.ok(report.reads.slice(readsBeforeReload).some((request) =>
    request.path === `/api${root}/operations/${revision.request_id}`))
  assert.equal(report.writes.filter((request) => request.path === publishPath).length, 1)
  const newSource = revision.result.plan.items[0].task
  const newDependent = revision.result.plan.items[1].task
  assert.notEqual(newSource.id, oldSource.id)
  assert.notEqual(newDependent.id, oldDependent.id)
  assert.equal((await read('/bootstrap')).tasks.length, 5)
  assert.equal((await read('/bootstrap')).runs.length, 1)
  check('Lost v2 publication reloads the same exact GET receipt with one POST, no automatic repeat and exactly two new replacement Tasks')

  assert.deepEqual(await read(`${root}/operations/${creation.request_id}`), creation)
  assert.deepEqual(await read(`${root}/versions/1`), versionOne)
  const preserved = await read(`/runs/${firstRun.run.id}`)
  for (const field of ['run', 'task', 'agents', 'calls', 'artifacts', 'events'])
    assert.deepEqual(preserved[field], frozenOldDetail[field])
  await openTask(oldSource.id)
  await page.getByText('Retired plan task', { exact: true }).waitFor()
  assert.ok(await disabled(page.getByRole('button', { name: 'Arrange execution', exact: true })))
  assert.ok(await disabled(page.getByRole('button', { name: 'Implement & validate', exact: true })))
  await blockedStart(oldSource, model, 'retired-browser-direct-start')
  await capture('retired-task-controls.png')
  await openTask(oldSource.id, 'review', firstRun.run.id)
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor()
  assert.ok(await disabled(page.getByRole('button', { name: 'Accept', exact: true })))
  check('The old Task is visibly retired and cannot start research or coding; its accepted report, Run, original creation receipt and v1 snapshot remain unchanged')

  await openTask(newDependent.id)
  await page.getByText('Waiting for prerequisite review', { exact: true }).waitFor()
  await page.getByText('Not run', { exact: true }).waitFor()
  assert.ok(await disabled(page.getByRole('button', { name: 'Arrange execution', exact: true })))
  assert.ok(await disabled(page.getByRole('button', { name: 'Implement & validate', exact: true })))
  await blockedStart(newDependent, model, 'new-dependent-before-fresh-source')
  await capture('fresh-dependent-requires-new-evidence.png')
  await openTask(newSource.id)
  const freshRun = await runFromTask(newSource.id)
  await openTask(newDependent.id)
  await page.getByText('Awaiting report review', { exact: true }).waitFor()
  assert.ok(await disabled(page.getByRole('button', { name: 'Arrange execution', exact: true })))
  const freshReport = await acceptReport(newSource, freshRun)
  await openTask(newDependent.id)
  await page.getByText('Prerequisites satisfied', { exact: true }).waitFor()
  assert.equal(await disabled(page.getByRole('button', { name: 'Arrange execution', exact: true })), false)
  const dependentRun = await runFromTask(newDependent.id)
  const admission = dependentRun.run.context.task_dependencies
  assert.equal(admission.plan_version, 2)
  assert.equal(admission.membership, 'current')
  assert.equal(admission.prerequisites[0].latest_run.id, freshRun.run.id)
  assert.equal(admission.prerequisites[0].reports[0].id, freshReport.id)
  assert.ok(!dependentRun.run.context.text.includes(freshReport.content))
  await page.getByText('Confirmed context boundary', { exact: true }).click()
  await page.getByTestId('dependency-admission').locator(':scope > summary').click()
  await capture('v2-fresh-admission.png')
  check('Old acceptance cannot satisfy replacement Tasks: a fresh four-call prerequisite Run and new human review unlock the four-call dependent with exact v2 admission')

  await openTask(parent.id)
  const currentTwo = await read(root)
  await page.getByRole('button', { name: 'Revise plan', exact: true }).click()
  const dirtyAcceptance = 'This unsaved requirement must survive a real concurrent publication conflict.'
  await section(1).getByRole('textbox', { name: 'Acceptance', exact: true }).fill(dirtyAcceptance)
  competingContext = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce',
  })
  await watch(competingContext, 'competing-writer')
  const competingPage = await competingContext.newPage()
  await competingPage.goto(base)
  let competingReceipt
  await page.route(`**${previewPath}`, async (route) => {
    const command = {
      expected_version: currentTwo.plan.version, expected_plan_hash: currentTwo.plan.plan_hash,
      items: [...currentTwo.plan.definition.items].reverse(),
    }
    const reviewed = await api(competingPage, `${root}/revisions/preview`, command)
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data))
    assert.deepEqual(reviewed.data.impact.retired_task_ids, [])
    const applied = await api(competingPage, `${root}/revisions`, {
      ...command, request_id: 'competing-browser-plan-reorder',
      preview_hash: reviewed.data.preview_hash, consent: true,
    })
    assert.equal(applied.status, 200, JSON.stringify(applied.data))
    competingReceipt = applied.data
    const response = await route.fetch()
    assert.equal(response.status(), 409)
    await route.fulfill({ response })
  })
  const conflictResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === previewPath && response.status() === 409)
  await editor().getByRole('button', { name: 'Review plan revision', exact: true }).click()
  await conflictResponse
  await editor().getByText(
    'The current plan changed. Edits are retained. Explicitly discard them before reopening the latest version.', { exact: true },
  ).waitFor()
  await page.unroute(`**${previewPath}`)
  assert.equal(await section(1).getByRole('textbox', { name: 'Acceptance', exact: true }).inputValue(), dirtyAcceptance)
  assert.equal(await editor().getByRole('button', { name: 'Confirm plan revision', exact: true }).count(), 0)
  assert.equal(competingReceipt.result.plan.version, 3)
  assert.deepEqual(
    competingReceipt.result.plan.items.map((item) => item.task.id),
    [newDependent.id, newSource.id],
  )
  await capture('real-cas-conflict-keeps-draft.png')
  await editor().getByRole('button', { name: 'Cancel editing', exact: true }).click()
  const discard = page.getByRole('dialog', { name: 'Discard breakdown edits?', exact: true })
  await discard.locator('.wb-form-actions').getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await section(1).getByRole('textbox', { name: 'Acceptance', exact: true }).inputValue(), dirtyAcceptance)
  await editor().getByRole('button', { name: 'Cancel editing', exact: true }).click()
  await discard.getByRole('button', { name: 'Discard edits', exact: true }).click()
  await editor().waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Refresh task dependencies', exact: true }).click()
  await page.getByText('Current plan · v3', { exact: true }).waitFor()
  check('A second browser really wins CAS during the first editor request; the HTTP 409 retains dirty input until explicit discard, and reorder preserves both Task identities')

  const historyWrites = report.writes.length
  await page.getByRole('button', { name: 'Version history', exact: true }).click()
  const history = page.getByRole('region', { name: 'Plan version history', exact: true })
  const firstSummary = history.locator('summary').filter({ hasText: /^v1 ·/ })
  await firstSummary.waitFor()
  await firstSummary.focus()
  await firstSummary.press('Enter')
  await history.getByText(oldSource.id, { exact: true }).waitFor()
  await history.getByText(oldAcceptance, { exact: true }).waitFor()
  assert.equal(report.writes.length, historyWrites)
  assert.equal(await history.getByRole('button', { name: /publish|restore|apply/i }).count(), 0)
  assert.deepEqual(await read(`${root}/versions/1`), versionOne)
  await capture('immutable-v1-history-keyboard.png')
  check('Version history opens by keyboard and displays immutable v1 Task identities and acceptance through GET-only reads, without restoration or execution controls')

  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    const locale = mode === 'dark' ? 'zh' : 'en'
    const width = mode === 'dark' ? 390 : 1440
    await page.evaluate(({ style, mode, locale }) => {
      localStorage.setItem('mybot.style', style)
      localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.locale', locale)
    }, { style, mode, locale })
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    await page.getByText(`${locale === 'zh' ? '当前计划' : 'Current plan'} · v3`, { exact: true }).waitFor()
    await page.getByRole('button', { name: locale === 'zh' ? '版本历史' : 'Version history', exact: true }).click()
    const currentHistory = page.getByRole('region', {
      name: locale === 'zh' ? '计划版本历史' : 'Plan version history', exact: true,
    })
    await currentHistory.locator('summary').filter({ hasText: /^v1 ·/ }).click()
    await currentHistory.getByText(oldAcceptance, { exact: true }).waitFor()
    await page.waitForFunction(({ style, mode }) => Boolean(
      document.querySelector(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`),
    ), { style, mode })
    const geometry = await page.evaluate(() => {
      const theme = document.querySelector('.wb-theme')
      const computed = getComputedStyle(theme)
      const button = document.querySelector('.wb-task-plan button')
      return {
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        color: computed.color, background: computed.backgroundColor, font: computed.fontFamily,
        radius: button ? getComputedStyle(button).borderRadius : null,
        taskIds: [...document.querySelectorAll('.wb-task-plan-items > li a')].map((link) => link.hash),
      }
    })
    assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
    assert.ok(geometry.font && geometry.color && geometry.radius !== null)
    report.geometry.push({ style, mode, locale, ...geometry })
    await capture(`history-${style}-${mode}.png`)
  }
  check('The current plan and immutable history render in three styles, both modes, English desktop and Chinese 390px layouts with computed styles and no document overflow')
  const final = await read('/bootstrap')
  assert.equal(final.tasks.length, 5)
  assert.equal(final.runs.length, 3)
  const finalDetails = await Promise.all(final.runs.map((run) => read(`/runs/${run.id}`)))
  assert.equal(finalDetails.reduce((total, detail) => total + detail.calls.length, 0), 12)
  assert.equal(report.writes.filter((request) => request.path === createPath).length, 1)
  assert.equal(report.writes.filter((request) => request.path === publishPath && request.context === 'owner').length, 1)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
  report.actual = {
    parent_task_id: parent.id, original_source_task_id: oldSource.id,
    original_dependent_task_id: oldDependent.id, current_source_task_id: newSource.id,
    current_dependent_task_id: newDependent.id, original_run_id: firstRun.run.id,
    fresh_source_run_id: freshRun.run.id, dependent_run_id: dependentRun.run.id,
    creation_request_id: creation.request_id, revision_request_id: revision.request_id,
    competing_request_id: competingReceipt.request_id, versions: 3, tasks: 5, runs: 3, fake_calls: 12,
  }
  await writeFile(resolve(out, 'v1-creation-receipt.json'), JSON.stringify(creation, null, 2))
  await writeFile(resolve(out, 'v2-revision-receipt.json'), JSON.stringify(revision, null, 2))
  await writeFile(resolve(out, 'v3-competing-receipt.json'), JSON.stringify(competingReceipt, null, 2))
  await writeFile(resolve(out, 'fresh-admission.json'), JSON.stringify(admission, null, 2))
} catch (error) {
  report.failure = String(error)
  await capture('failure.png').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await competingContext?.close()
  await browser.close()
}
