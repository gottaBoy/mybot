import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const backend = process.env.RECONCILIATION_FIXTURE_URL ?? 'http://127.0.0.1:4187/'
for (const url of [new URL(base), new URL(backend)]) {
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(!['4180', '5173'].includes(url.port))
}
const fixture = process.env.CODING_FIXTURE_DIR
assert.match(fixture ?? '', /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out = resolve(process.env.CODING_EVIDENCE_DIR ?? '/tmp/mybot-coding-reconciliation')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
).href)
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' })
const report = {
  fixture: true, modelGeneration: 'Injected strict JSON; no paid model calls',
  actualExecution: 'Copied mybot source, explicit fixture base advance, confined pytest, HTTP/SQLite',
  checks: [], errors: [], external: [], writes: [], screenshots: [], geometry: [],
}
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`) }
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true,
})
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return
  if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
})
context.on('request', request => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
})
await context.route('**/*', route => {
  const url = new URL(route.request().url())
  if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) {
    report.external.push(url.origin); return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', error => report.errors.push(error.message))
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
async function fixtureStatus() {
  const response = await fetch(new URL('fixture/status', backend))
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.equal(value.fixture, true)
  return value
}
async function poll(read, name) {
  for (let index = 0; index < 250; index++) {
    if (await read()) return
    await new Promise(done => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${name}`)
}
async function runDetail(id) {
  let value
  await poll(async () => {
    value = (await api(`/runs/${id}`)).data
    return ['succeeded', 'failed', 'canceled'].includes(value.run.status)
  }, 'actual coding Run')
  return value
}
const attempts = detail => detail.artifacts.filter(item => item.kind === 'test_result')
  .map(item => JSON.parse(item.content)).sort((a, b) => a.round - b.round)
const panel = () => page.getByTestId('coding-run-dialog')
async function capture(file) {
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
async function loseResponse(path) {
  let finished
  const done = new Promise(resolve => { finished = resolve })
  await page.route(`**${path}`, async route => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const value = await response.json()
    await route.abort('failed')
    finished(value)
  })
  return done
}
try {
  const files = [
    'workbench/__init__.py', 'workbench/schemas.py', 'workbench/saved_views.py',
    'baseline_info.py', 'test_relative_path.py',
  ]
  const oldSource = await readFile(resolve(fixture, 'workspace/workbench/schemas.py'), 'utf8')
  await page.goto(base)
  await page.getByLabel(/Access token/).fill('astryx-browser-fixture')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('.wb-shell').waitFor()
  const bootstrap = (await api('/bootstrap')).data
  assert.equal(bootstrap.tasks.length, 0)
  assert.equal(bootstrap.capabilities.coding_reconciliation, true)
  const project = (await api('/projects', {
    name: 'Explicit baseline reconciliation', directory: '.',
    notes: 'Three original copies are review provenance; only resolved code and actual tests enter the model.',
  })).data
  const models = []
  for (const [name, model] of [
    ['Partial fixture', 'reconciliation-partial-fixture'],
    ['Current baseline repair', 'reconciliation-repair-fixture'],
    ['New-anchor continuation', 'reconciliation-annotate-fixture'],
  ]) models.push((await api('/models', { name, model, endpoint: 'http://127.0.0.1:9999/v1', key_env: '' })).data)
  const task = (await api('/tasks', {
    project_id: project.id, title: '项目变化后继续路径校验',
    goal: 'Reject newline and tab while preserving current maintenance changes and explicit readonly dependencies.',
    acceptance: 'Run current immutable tests and retain the adopted baseline and each change as evidence.', files,
  })).data
  const config = {
    model_id: models[0].id, writable: ['workbench/schemas.py'], tests: ['test_relative_path.py'],
    max_rounds: 1, test_timeout: 10, max_output_tokens: 8192, profile: 'python-pytest',
  }
  const firstPreview = (await api(`/tasks/${task.id}/coding/preview`, config)).data
  const firstJob = (await api(`/tasks/${task.id}/coding/prepare`, {
    ...config, request_id: 'reconciliation-source-original', preview_hash: firstPreview.candidate_hash,
  })).data
  const firstApplied = (await api(`/tasks/${task.id}/coding/${firstJob.request_id}/execute`, {
    candidate_hash: firstJob.candidate_hash, consent: true,
  })).data
  const first = await runDetail(firstApplied.run_id)
  assert.equal(first.run.status, 'failed')
  assert.deepEqual(attempts(first).map(item => item.receipt.failures), [2, 1])
  const checkpoint = (await api(`/tasks/${task.id}/coding/checkpoints?page=1`)).data.items[0]
  const checkpointBody = JSON.parse(first.artifacts.find(item => item.id === checkpoint.id).content)
  assert.equal((await fixtureStatus()).model_calls, 1)
  check('The old base really fails two tests; a bounded partial fix leaves one failure and a trusted checkpoint')

  const advance = await fetch(new URL('fixture/advance-current', backend), {
    method: 'POST', headers: {
      'X-Mybot-Fixture-Token': 'astryx-browser-fixture', 'X-Workbench-Request': '1',
    },
  })
  assert.equal(advance.status, 200)
  const advanced = await advance.json()
  assert.equal(advanced.fixture_writes.length, 1)
  const current = new Map(await Promise.all(files.map(async path => [
    path, await readFile(resolve(fixture, 'workspace', path), 'utf8'),
  ])))
  const next = {
    ...config, model_id: models[1].id,
    continuation: {
      checkpoint: { id: checkpoint.id, sha256: checkpoint.sha256 },
      instruction: 'Keep the current maintenance comment and current tests. Repair the remaining tab validation.',
    },
  }
  const strict = await api(`/tasks/${task.id}/coding/preview`, next)
  assert.equal(strict.status, 409)
  assert.equal(strict.data.detail.code, 'coding_checkpoint_base_changed')
  assert.equal((await fixtureStatus()).model_calls, 1)
  check('One explicit fixture operation advances source, readonly dependency and tests; strict legacy continuation still refuses drift')

  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Implement & validate', exact: true }).click()
  await panel().getByRole('textbox', { name: 'Editable files (one per line)', exact: true }).fill('workbench/schemas.py')
  await panel().getByRole('combobox', { name: 'Implementation model', exact: true }).click()
  await page.getByRole('option', { name: `${models[1].name} · ${models[1].model}`, exact: true }).click()
  await panel().getByRole('spinbutton', { name: 'Implementation call limit', exact: true }).fill('1')
  await panel().getByRole('combobox', { name: 'Test profile', exact: true }).click()
  await page.getByRole('option', { name: 'Python pytest', exact: true }).click()
  await panel().getByRole('combobox', { name: 'Implementation starting point', exact: true }).click()
  await page.getByRole('option', { name: 'Prior code checkpoint', exact: true }).click()
  const picker = panel().getByRole('combobox', { name: 'Code starting point', exact: true })
  await picker.click()
  await picker.press('End')
  await picker.press('Enter')
  await panel().getByRole('textbox', { name: 'Requirements for this implementation', exact: true }).fill(next.continuation.instruction)
  const comparePath = `/api/tasks/${task.id}/coding/reconciliation/preview`
  const comparing = page.waitForResponse(response => new URL(response.url()).pathname === comparePath)
  await panel().getByRole('button', { name: 'Compare & resolve baseline changes', exact: true }).click()
  const compared = await comparing
  assert.equal(compared.status(), 200)
  const review = await compared.json()
  assert.equal(review.current_files.find(file => file.path === 'baseline_info.py').content, current.get('baseline_info.py'))
  assert.equal(review.checkpoint_files.find(file => file.path === 'workbench/schemas.py').content, checkpointBody.files.find(file => file.path === 'workbench/schemas.py').content)
  const region = panel().getByRole('region', { name: 'Baseline comparison & resolution', exact: true })
  await region.waitFor()
  const readonly = region.getByRole('region', { name: 'test_relative_path.py', exact: true })
  assert.equal(await readonly.getByRole('combobox').count(), 0)
  assert.match(await readonly.innerText(), /Current content required/)
  assert.equal((await fixtureStatus()).model_calls, 1)
  check('Three exact versions are readable without a model call; current tests and readonly dependencies have no resolution controls')

  const writable = region.getByRole('region', { name: 'workbench/schemas.py', exact: true })
  await writable.getByRole('combobox', { name: 'Starting content · workbench/schemas.py', exact: true }).click()
  await page.getByRole('option', { name: 'Enter complete content manually', exact: true }).click()
  const manual = current.get('workbench/schemas.py').replace(
    'if "\\\\" in value or ', 'if "\\n" in value or "\\\\" in value or ',
  )
  assert.notEqual(manual, current.get('workbench/schemas.py'))
  assert.match(manual, /^# Current project maintenance marker/)
  const textbox = writable.getByRole('textbox', { name: 'Complete manual content · workbench/schemas.py', exact: true })
  await textbox.fill(manual)
  await textbox.scrollIntoViewIfNeeded()
  await capture('manual-resolution-desktop.png')
  await page.setViewportSize({ width: 390, height: 1000 })
  await textbox.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await capture('manual-resolution-mobile.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await panel().getByRole('button', { name: 'Compare the three baselines again', exact: true }).click()
  await region.getByText('This comparison is stale.', { exact: false }).waitFor({ state: 'hidden' })
  await writable.getByRole('combobox', { name: 'Starting content · workbench/schemas.py', exact: true }).click()
  await page.getByRole('option', { name: 'Enter complete content manually', exact: true }).click()
  assert.equal(await textbox.inputValue(), manual)
  await panel().getByRole('button', { name: 'Review sources & test environment', exact: true }).click()
  await panel().getByRole('checkbox').waitFor()
  assert.equal((await fixtureStatus()).model_calls, 1)
  check('Manual content preserves the new maintenance change; explicit recompare retains text but requires choosing each writable file again')

  const preparePath = `/api/tasks/${task.id}/coding/prepare`
  const preparation = loseResponse(preparePath)
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  const frozen = await preparation
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.', { exact: true }).waitFor()
  await page.unroute(`**${preparePath}`)
  assert.equal(frozen.state, 'prepared')
  assert.equal(frozen.candidate.snapshot.files.find(file => file.path === 'workbench/schemas.py').content, manual)
  assert.equal(frozen.candidate.snapshot.origin_files.find(file => file.path === 'workbench/schemas.py').content, current.get('workbench/schemas.py'))
  await page.reload()
  await panel().getByRole('button', { name: 'Discard this preparation', exact: true }).waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(), false)
  assert.equal(report.writes.filter(item => item.path === preparePath).length, 2)
  assert.equal((await fixtureStatus()).model_calls, 1)
  check('Lost preparation reloads the original frozen resolved/current baselines with unchecked consent and no new model call')

  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    const locale = mode === 'dark' ? 'zh' : 'en', width = mode === 'dark' ? 390 : 1440
    await page.evaluate(({ style, mode, locale }) => {
      localStorage.setItem('mybot.style', style); localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.locale', locale)
    }, { style, mode, locale })
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    await page.getByRole('button', { name: locale === 'zh' ? '放弃此次准备' : 'Discard this preparation', exact: true }).waitFor()
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(geometry.scroll <= geometry.width + 1)
    report.geometry.push({ surface: 'prepared', style, mode, locale, ...geometry })
    await capture(`prepared-${style}-${mode}.png`)
  }
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'en'))
  await page.reload()
  const executePath = `/api/tasks/${task.id}/coding/${frozen.request_id}/execute`
  const execution = loseResponse(executePath)
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  const applied = await execution
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.', { exact: true }).waitFor()
  await page.unroute(`**${executePath}`)
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('codingRequest=') && location.hash.includes('taskRun='))
  const repaired = await runDetail(applied.run_id)
  assert.equal(repaired.run.status, 'succeeded', repaired.run.error)
  const tests = attempts(repaired)
  assert.deepEqual(tests.map(item => item.receipt.failures), [1, 0])
  assert.deepEqual(tests.map(item => item.tests_run), [5, 5])
  assert.equal(repaired.calls.length, 1)
  assert.equal(report.writes.filter(item => item.path === executePath).length, 1)
  const state = await fixtureStatus()
  assert.equal(state.model_calls, 2)
  assert.deepEqual(state.calls[1].source_checkpoint_fields, [
    'current_hash', 'id', 'origin_hash', 'resolved_hash', 'round', 'run_id', 'sha256',
  ])
  assert.equal((await api(`/runs/${first.run.id}`)).data.run.context.coding.candidate_hash, first.run.context.coding.candidate_hash)
  for (const [path, content] of current) assert.equal(await readFile(resolve(fixture, 'workspace', path), 'utf8'), content)
  check('The resolved baseline runs all five current tests, then a real isolated fix passes them without sending old source bodies or writing the project')

  const cumulative = repaired.artifacts.find(item => item.kind === 'diff')
  const incremental = repaired.artifacts.find(item => item.kind === 'incremental_diff')
  assert.match(cumulative.content, /-    if "\\\\" in value/)
  assert.match(incremental.content, /-    if "\\n" in value/)
  assert.ok(!cumulative.content.includes('+# Current project maintenance marker'))
  const newCheckpoint = JSON.parse(repaired.artifacts.find(item => item.kind === 'code_checkpoint').content)
  assert.equal(newCheckpoint.origin_hash, frozen.candidate.snapshot.reconciliation.current_hash)
  await writeFile(resolve(out, 'cumulative.patch'), cumulative.content)
  await writeFile(resolve(out, 'incremental.patch'), incremental.content)
  execFileSync('git', ['apply', '--check', resolve(out, 'cumulative.patch')], {
    cwd: resolve(fixture, 'workspace'), env: {
      PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  })
  check('Cumulative patch is against the current project, incremental patch against manual start, and the new checkpoint anchors to the adopted project fingerprint')

  await page.reload()
  await page.getByTestId('run-test-state').getByText('Passed', { exact: true }).waitFor()
  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    const locale = mode === 'dark' ? 'zh' : 'en', width = mode === 'dark' ? 390 : 1440
    await page.evaluate(({ style, mode, locale }) => {
      localStorage.setItem('mybot.style', style); localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.locale', locale)
    }, { style, mode, locale })
    await page.setViewportSize({ width, height: 1000 }); await page.reload()
    await page.getByTestId('run-test-state').getByText(locale === 'zh' ? '通过' : 'Passed', { exact: true }).waitFor()
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(geometry.scroll <= geometry.width + 1)
    report.geometry.push({ surface: 'result', style, mode, locale, ...geometry })
    await capture(`result-${style}-${mode}.png`)
  }
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'en')); await page.reload()
  const selected = (await api(`/tasks/${task.id}/coding/checkpoints?page=1`)).data.items.find(item => item.run_id === repaired.run.id)
  const thirdConfig = {
    ...config, model_id: models[2].id,
    continuation: {
      checkpoint: { id: selected.id, sha256: selected.sha256 },
      instruction: 'Add a brief continuation annotation without changing tested behavior.',
    },
  }
  const thirdCandidate = await api(`/tasks/${task.id}/coding/preview`, thirdConfig)
  assert.equal(thirdCandidate.status, 200)
  assert.equal(thirdCandidate.data.snapshot.reconciliation, undefined)
  const thirdJob = (await api(`/tasks/${task.id}/coding/prepare`, {
    ...thirdConfig, request_id: 'reconciliation-new-anchor-third', preview_hash: thirdCandidate.data.candidate_hash,
  })).data
  const thirdApplied = (await api(`/tasks/${task.id}/coding/${thirdJob.request_id}/execute`, {
    candidate_hash: thirdJob.candidate_hash, consent: true,
  })).data
  const third = await runDetail(thirdApplied.run_id)
  assert.equal(third.run.status, 'succeeded', third.run.error)
  assert.ok(attempts(third).every(item => item.passed && item.tests_run === 5))
  const finalState = await fixtureStatus()
  assert.equal(finalState.model_calls, 3)
  assert.deepEqual(finalState.current_hashes, advanced.current_hashes)
  check('A third strict continuation succeeds from the new checkpoint without reconciliation, proving the adopted project base is the new root')
  report.actual = {
    task_id: task.id, source_run: first.run.id, reconciled_run: repaired.run.id, third_run: third.run.id,
    model_calls: 3, adopted_current_hash: frozen.candidate.snapshot.reconciliation.current_hash,
    source_origin_hash: checkpointBody.origin_hash,
    tests: tests.map(({ round, tests_run, receipt, passed }) => ({ round, tests_run, receipt, passed })),
  }
  await writeFile(resolve(out, 'actual-tests.json'), JSON.stringify(tests, null, 2))
  await writeFile(resolve(out, 'fixture-writes-and-calls.json'), JSON.stringify(finalState, null, 2))
  assert.notEqual(oldSource, current.get('workbench/schemas.py'))
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, [])
} catch (reason) {
  report.failure = String(reason)
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  throw reason
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
