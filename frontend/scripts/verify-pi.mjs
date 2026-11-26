import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5178/'
const backend = process.env.PI_FIXTURE_URL ?? 'http://127.0.0.1:4189/'
for (const url of [new URL(base), new URL(backend)]) {
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(!['4180', '5173'].includes(url.port))
}
const fixture = process.env.PI_FIXTURE_DIR
assert.match(fixture ?? '', /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out = resolve(process.env.PI_EVIDENCE_DIR ?? '/tmp/mybot-pi-browser')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
).href)
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' })
const report = {
  fixture: true, sdk: 'Actual pinned Pi SDK; deterministic localhost SSE replies',
  checks: [], errors: [], external: [], writes: [], geometry: [], screenshots: [],
}
const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`) }
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true,
})
await context.addInitScript(() => {
  if (!['http:', 'https:'].includes(location.protocol)) return
  if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
})
context.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
})
await context.route('**/*', (route) => {
  const url = new URL(route.request().url())
  if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) {
    report.external.push(url.origin)
    return route.abort()
  }
  return route.continue()
})
const page = await context.newPage()
page.on('pageerror', (error) => report.errors.push(error.message))
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
async function status() {
  const response = await fetch(new URL('fixture/pi-status', backend))
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.equal(value.fixture, true)
  assert.equal(new URL(value.endpoint).hostname, '127.0.0.1')
  return value
}
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
async function poll(read, name) {
  for (let index = 0; index < 250; index++) {
    if (await read()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${name}`)
}
try {
  const source = await readFile(resolve(fixture, 'workspace/workbench/schemas.py'), 'utf8')
  const testsSource = await readFile(resolve(fixture, 'workspace/test_relative_path.py'), 'utf8')
  const initial = await status()
  assert.equal(initial.calls, 0)
  await page.goto(base)
  await page.getByLabel(/Access token/).fill('astryx-browser-fixture')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('.wb-shell').waitFor()
  assert.equal((await api('/bootstrap')).data.capabilities.pi_sdk, true)
  await page.goto(`${base}#models`)
  await page.locator('.wb-page-heading').getByRole('button', { name: 'Add model', exact: true }).click()
  const modelDialog = page.getByRole('dialog', { name: 'Add model', exact: true })
  const adapter = modelDialog.getByRole('combobox', { name: 'Execution adapter', exact: true })
  await adapter.click()
  await adapter.press('End')
  await adapter.press('Enter')
  await modelDialog.getByRole('textbox', { name: /^Configuration name/ }).fill('Pi SDK acceptance')
  await modelDialog.getByRole('textbox', { name: /^API base URL/ }).fill(initial.endpoint)
  await modelDialog.getByRole('textbox', { name: /^Model ID/ }).fill('mybot-pi-coding')
  await capture('model-pi-desktop.png')
  await modelDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await modelDialog.waitFor({ state: 'hidden' })
  const codingModel = (await api('/bootstrap')).data.models[0]
  assert.equal(codingModel.kind, 'pi_sdk')
  assert.equal((await status()).calls, 0)
  check('Keyboard selects Pi in the real model form; saving config makes no SDK or model request')

  const row = page.locator('.wb-settings-row').filter({ hasText: 'Pi SDK acceptance' })
  await row.getByRole('button', { name: 'Test connection', exact: true }).click()
  const testDialog = page.getByRole('dialog', { name: 'Test model connection', exact: true })
  await testDialog.getByRole('checkbox').check()
  await testDialog.getByRole('button', { name: 'Confirm test', exact: true }).click()
  await testDialog.getByText('Connection test succeeded', { exact: true }).waitFor()
  assert.equal((await status()).calls, 1)
  await testDialog.getByRole('button', { name: 'Check test receipt', exact: true }).click()
  await testDialog.getByText('Connection test succeeded', { exact: true }).waitFor()
  assert.equal((await status()).calls, 1)
  await capture('pi-connection-receipt.png')
  await testDialog.locator('form').getByRole('button', { name: 'Close', exact: true }).click()
  check('Explicit test runs the actual SDK exactly once; checking its durable receipt sends no second request')

  const project = (await api('/projects', { name: 'Pi SDK real workflow', directory: '.' })).data
  const researchModel = (await api('/models', {
    kind: 'pi_sdk', name: 'Pi research fixture', endpoint: initial.endpoint,
    model: 'mybot-pi-research', key_env: '',
  })).data
  const research = (await api('/tasks', {
    project_id: project.id, title: 'Pi SDK research evidence',
    goal: 'Analyze only the selected README through the explicit Pi text adapter.',
    acceptance: 'Retain actual Call and Artifact evidence.', files: ['README.md'],
  })).data
  const preview = (await api(`/tasks/${research.id}/preview`, {})).data
  const researchRun = (await api(`/tasks/${research.id}/runs`, {
    coordinator_model: researchModel.id, researcher_model: researchModel.id,
    reviewer_model: researchModel.id, consent: true, request_id: 'pi-browser-research',
    context_hash: preview.context_hash, max_calls: 4, parallel: 2,
    minutes: 10, max_output_tokens: 1800,
  })).data
  let researchDetail
  await poll(async () => {
    researchDetail = (await api(`/runs/${researchRun.id}`)).data
    return ['succeeded', 'failed'].includes(researchDetail.run.status)
  }, 'Pi research')
  assert.equal(researchDetail.run.status, 'succeeded', researchDetail.run.error)
  assert.equal(researchDetail.calls.length, 4)
  assert.equal((await status()).calls, 5)
  assert.ok(researchDetail.calls.every((call) => call.error_detail.requests === 1))
  await page.goto(`${base}#task/${research.id}?taskTab=review&taskRun=${researchRun.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Accept', exact: true }).waitFor()
  await capture('pi-research-artifact.png')
  check('Actual Pi SDK research creates one Run, four Calls and verifiable reports in the existing Task workspace')

  const task = (await api('/tasks', {
    project_id: project.id, title: 'Pi SDK 隔离研发与真实 pytest',
    goal: 'Reject newline and tab in mybot relative_path while retaining normal and Chinese paths.',
    acceptance: 'Four immutable pytest cases pass; original files remain unchanged.',
    files: ['workbench/__init__.py', 'workbench/schemas.py', 'workbench/saved_views.py', 'test_relative_path.py'],
  })).data
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Implement & validate', exact: true }).click()
  const panel = () => page.getByRole('dialog', { name: 'Implement & validate', exact: true })
  await panel().getByRole('textbox', { name: 'Editable files (one per line)', exact: true }).fill('workbench/schemas.py')
  await panel().getByRole('combobox', { name: 'Implementation model', exact: true }).click()
  await page.getByRole('option', { name: `${codingModel.name} · ${codingModel.model}`, exact: true }).click()
  await panel().getByRole('combobox', { name: 'Test profile', exact: true }).click()
  await page.getByRole('option', { name: 'Python pytest', exact: true }).click()
  await panel().getByRole('button', { name: 'Review sources & test environment', exact: true }).click()
  await panel().getByRole('checkbox').waitFor()
  assert.equal((await status()).calls, 5)
  await capture('pi-coding-candidate.png')
  const executeSuffix = `/coding/`
  let lost = false
  await page.route('**/api/tasks/*/coding/*/execute', async (route) => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    lost = true
    await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.', { exact: true }).waitFor()
  assert.ok(lost)
  await page.unroute('**/api/tasks/*/coding/*/execute')
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('codingRequest=') && location.hash.includes('taskRun='))
  let detail
  await poll(async () => {
    const snapshot = (await api(`/tasks/${task.id}/detail`)).data
    if (!snapshot.item.latest_run) return false
    detail = (await api(`/runs/${snapshot.item.latest_run.id}`)).data
    return ['succeeded', 'failed'].includes(detail.run.status)
  }, 'Pi JSON implementation and actual pytest')
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  assert.equal(detail.calls.length, 2)
  const attempts = detail.artifacts.filter((item) => item.kind === 'test_result')
    .map((item) => JSON.parse(item.content)).sort((a, b) => a.round - b.round)
  assert.deepEqual(attempts.map((item) => item.passed), [false, false, true])
  assert.deepEqual(attempts.map((item) => item.receipt.failures), [2, 1, 0])
  assert.ok(attempts.every((item) => item.profile === 'python-pytest' && item.tests_run === 4))
  assert.equal(detail.run.context.coding.snapshot.model.kind, 'pi_sdk')
  assert.equal(report.writes.filter((item) => item.path.includes(executeSuffix) && item.path.endsWith('/execute')).length, 1)
  assert.equal((await status()).calls, 7)
  assert.equal(await readFile(resolve(fixture, 'workspace/workbench/schemas.py'), 'utf8'), source)
  assert.equal(await readFile(resolve(fixture, 'workspace/test_relative_path.py'), 'utf8'), testsSource)
  report.actual = {
    research_run: researchRun.id, coding_run: detail.run.id,
    sdk_requests: 7, coding_calls: 2, model_kind: 'pi_sdk',
    tests: attempts.map(({ round, tests_run, receipt, passed }) => ({ round, tests_run, receipt, passed })),
  }
  await writeFile(resolve(out, 'actual-tests.json'), JSON.stringify(attempts, null, 2))
  await writeFile(resolve(out, 'sdk-request-counts.json'), JSON.stringify(await status(), null, 2))
  check('Pi JSON drives actual isolated pytest fail2 -> fail1 -> pass4 with one execution POST and unchanged original source')

  await page.reload()
  await page.getByTestId('run-test-state').getByText('Passed', { exact: true }).waitFor()
  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    const locale = mode === 'dark' ? 'zh' : 'en', width = mode === 'dark' ? 390 : 1440
    await page.evaluate(({ style, mode, locale }) => {
      localStorage.setItem('mybot.style', style)
      localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.locale', locale)
    }, { style, mode, locale })
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    await page.getByTestId('run-test-state').getByText(locale === 'zh' ? '通过' : 'Passed', { exact: true }).waitFor()
    const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(geometry.scroll <= geometry.width + 1)
    report.geometry.push({ style, mode, locale, ...geometry })
    await capture(`pi-result-${style}-${mode}.png`)
  }
  check('The same Pi execution and real pytest result render in three styles, both modes and Chinese mobile')
  assert.equal((await status()).calls, 7)
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (reason) {
  report.failure = String(reason)
  await page.screenshot({ path: resolve(out, 'failure.png'), fullPage: true }).catch(() => {})
  throw reason
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
