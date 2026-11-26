import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const fixture = process.env.CODING_FIXTURE_DIR
assert.match(fixture ?? '', /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out = resolve(process.env.CODING_EVIDENCE_DIR ?? '/tmp/mybot-coding-pytest')
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
  modelGeneration: 'Injected coding-fixture JSON; no real Provider or paid model call',
  actualExecution: 'Copied mybot source, confined Python pytest subprocesses, HTTP and SQLite',
  profile: 'python-pytest',
  checks: [], errors: [], external: [], reads: [], writes: [], geometry: [], screenshots: [],
}
const check = (text) => { report.checks.push(text); console.log(`PASS ${text}`) }
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
})
await context.addInitScript(() => {
  if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
})
context.on('request', (request) => {
  const url = new URL(request.url())
  if (!url.pathname.startsWith('/api/')) return
  if (request.method() === 'GET') report.reads.push({ path: url.pathname })
  else report.writes.push({ path: url.pathname, method: request.method() })
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
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => window.scrollY === 0)
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
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
async function poll(read, label) {
  for (let index = 0; index < 200; index++) {
    if (await read()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${label}`)
}
function assertProfile(candidate) {
  assert.equal(candidate.config.profile, 'python-pytest')
  assert.equal(candidate.snapshot.profile, 'python-pytest')
}
try {
  const selectedFiles = [
    'workbench/__init__.py', 'workbench/schemas.py',
    'workbench/saved_views.py', 'test_relative_path.py',
  ]
  const originals = new Map(await Promise.all(selectedFiles.map(async (path) => [
    path, await readFile(resolve(fixture, 'workspace', path), 'utf8'),
  ])))
  const repositorySource = fileURLToPath(new URL('../../workbench/schemas.py', import.meta.url))
  const sourceBefore = await readFile(repositorySource, 'utf8')
  assert.match(originals.get('test_relative_path.py'), /@pytest\.fixture/)
  assert.match(originals.get('test_relative_path.py'), /@pytest\.mark\.parametrize/)
  await page.goto(base)
  assert.equal((await api('/auth', { token: 'astryx-browser-fixture' })).status, 200)
  const bootstrap = (await api('/bootstrap')).data
  assert.equal(bootstrap.tasks.length, 0)
  assert.equal(bootstrap.capabilities.isolated_coding, true)
  assert.equal(bootstrap.capabilities.coding_pytest, true)
  const project = (await api('/projects', {
    name: 'mybot pytest coding acceptance', directory: '.',
    notes: 'Copied mybot source; injected model JSON; actual confined pytest',
  })).data
  const model = (await api('/models', {
    name: 'Deterministic coding fixture', model: 'coding-fixture',
    endpoint: 'http://127.0.0.1:9999/v1', key_env: '',
  })).data
  const task = (await api('/tasks', {
    project_id: project.id, title: '拒绝路径中的控制字符 · pytest',
    goal: 'Update mybot relative_path to reject newline and tab while preserving ordinary and Chinese source paths.',
    acceptance: 'Four immutable pytest fixture/parametrize cases pass; the original project remains unchanged.',
    files: selectedFiles,
  })).data
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Implement & validate', exact: true }).click()
  const panel = () => page.getByRole('dialog', { name: 'Implement & validate', exact: true })
  await panel().getByRole('textbox', { name: 'Editable files (one per line)', exact: true })
    .fill('workbench/schemas.py')
  const profileSelector = panel().getByRole('combobox', { name: 'Test profile', exact: true })
  await profileSelector.click()
  await page.getByRole('option', { name: 'Python pytest', exact: true }).click()
  const previewPath = `/api/tasks/${task.id}/coding/preview`
  const previewResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === previewPath && response.request().method() === 'POST')
  await panel().getByRole('button', { name: 'Review sources & test environment', exact: true }).click()
  const preview = await previewResponse
  assert.equal(preview.status(), 200)
  assertProfile(await preview.json())
  await panel().getByRole('checkbox').waitFor()
  await panel().locator('.wb-details').getByText('Python pytest', { exact: false }).waitFor()
  assert.equal((await api('/bootstrap')).data.runs.length, 0)
  check('Explicit Python pytest selection produces an exact pytest source/test candidate without starting a Run')

  const preparePath = `/api/tasks/${task.id}/coding/prepare`
  let requestId
  await page.route(`**${preparePath}`, async (route) => {
    assert.equal(route.request().postDataJSON().profile, 'python-pytest')
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const job = await response.json()
    assertProfile(job.candidate)
    requestId = job.request_id
    await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.', { exact: true }).waitFor()
  await page.unroute(`**${preparePath}`)
  assert.equal((await api('/bootstrap')).data.runs.length, 0)
  assert.ok(page.url().includes(`codingRequest=${requestId}`))
  await page.reload()
  await panel().getByRole('button', { name: 'Discard this preparation', exact: true }).waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(), false)
  const prepared = await api(`/tasks/${task.id}/coding/${requestId}`)
  assert.equal(prepared.status, 200)
  assert.equal(prepared.data.state, 'prepared')
  assertProfile(prepared.data.candidate)
  assert.equal(report.writes.filter((write) => write.path === preparePath).length, 1)
  check('Lost pytest preparation reloads the original GET receipt, keeps its profile and requires fresh consent')

  for (const style of ['neutral', 'zira', 'y2k']) for (const mode of ['light', 'dark']) {
    const locale = mode === 'dark' ? 'zh' : 'en', width = mode === 'dark' ? 390 : 1440
    await page.evaluate(({ style, mode, locale }) => {
      localStorage.setItem('mybot.style', style)
      localStorage.setItem('mybot.mode', mode)
      localStorage.setItem('mybot.locale', locale)
    }, { style, mode, locale })
    await page.setViewportSize({ width, height: 1000 })
    await page.reload()
    await page.getByRole('button', { name: locale === 'zh' ? '放弃此次准备' : 'Discard this preparation', exact: true }).waitFor()
    await page.waitForFunction(({ style, mode }) =>
      Boolean(document.querySelector(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`)),
    { style, mode })
    const geometry = await page.evaluate(() => {
      const theme = document.querySelector('.wb-theme')
      const computed = getComputedStyle(theme)
      return {
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        color: computed.color, background: computed.backgroundColor,
        font: computed.fontFamily,
      }
    })
    assert.ok(geometry.scroll <= geometry.width + 1)
    report.geometry.push({ surface: 'candidate', style, mode, locale, ...geometry })
    await capture(`candidate-${style}-${mode}.png`)
  }
  check('Frozen pytest candidates retain the selected profile across three styles, both modes, desktop English and mobile Chinese')
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'en'))
  await page.reload()
  const executePath = `/api/tasks/${task.id}/coding/${requestId}/execute`
  await page.route(`**${executePath}`, async (route) => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const job = await response.json()
    assert.equal(job.request_id, requestId)
    assertProfile(job.candidate)
    await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  await page.getByText('The outcome is unknown. Keep and check the original request ID; do not repeat execution.', { exact: true }).waitFor()
  await page.unroute(`**${executePath}`)
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('codingRequest=') && location.hash.includes('taskRun='))
  let detail
  await poll(async () => {
    const runs = (await api('/bootstrap')).data.runs
    assert.equal(runs.length, 1)
    detail = (await api(`/runs/${runs[0].id}`)).data
    return ['succeeded', 'failed'].includes(detail.run.status)
  }, 'implementation and actual pytest completion')
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  assert.equal(detail.calls.length, 2)
  assertProfile(detail.run.context.coding)
  assert.deepEqual(detail.harness.tools, ['python-pytest'])
  const tests = detail.artifacts.filter((item) => item.kind === 'test_result')
    .map((item) => JSON.parse(item.content)).sort((a, b) => a.round - b.round)
  assert.deepEqual(tests.map((test) => test.profile), ['python-pytest', 'python-pytest', 'python-pytest'])
  assert.deepEqual(tests.map((test) => test.passed), [false, false, true])
  assert.deepEqual(tests.map((test) => test.tests_run), [4, 4, 4])
  assert.deepEqual(tests.map((test) => test.receipt.failures), [2, 1, 0])
  assert.deepEqual(tests.map((test) => test.receipt.errors), [0, 0, 0])
  assert.deepEqual(tests.map((test) => test.receipt.skipped), [0, 0, 0])
  for (const test of tests) {
    assert.deepEqual(test.test_files, ['test_relative_path.py'])
    assert.equal(test.command[1], '-I')
    assert.equal(test.command[2], '-B')
    assert.match(test.command[3], /\/test_sandbox\.py$/)
    assert.deepEqual(JSON.parse(test.command[5]), {
      profile: 'python-pytest', test_files: ['test_relative_path.py'],
    })
    assert.equal(test.timed_out, false)
    assert.equal(test.truncated, false)
  }
  report.actual = {
    task_id: task.id, run_id: detail.run.id, status: detail.run.status,
    model_calls: detail.calls.length,
    test_attempts: tests.map((test) => ({
      profile: test.profile, round: test.round, tests_run: test.tests_run,
      exit_code: test.exit_code, failures: test.receipt.failures,
      errors: test.receipt.errors, skipped: test.receipt.skipped, passed: test.passed,
    })),
  }
  await writeFile(resolve(out, 'actual-test-attempts.json'), JSON.stringify(tests, null, 2))
  assert.equal(report.writes.filter((write) => write.path === executePath).length, 1)
  check('Actual confined pytest verifies fail2 -> partial fix/fail1 -> pass4 with one execution POST and two injected model responses')
  for (const [path, original] of originals) {
    assert.equal(await readFile(resolve(fixture, 'workspace', path), 'utf8'), original)
  }
  assert.equal(await readFile(repositorySource, 'utf8'), sourceBefore)
  check('Copied source, immutable pytest fixture and original repository source remain byte-for-byte unchanged')
  await page.reload()
  await page.getByTestId('run-test-state').getByText('Passed', { exact: true }).waitFor()
  assert.equal(await page.getByTestId('run-test-profile').innerText(), 'Python pytest')
  assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Retry & resources', exact: true }).count(), 0)
  assert.equal((await api(`/runs/${detail.run.id}/retry-preview`)).status, 409)
  check('Run shows the actual pytest profile and blocks incompatible research recovery controls')
  const diff = detail.artifacts.find((item) => item.kind === 'diff' && item.title.endsWith('2'))
  assert.ok(diff)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'Work graph', exact: true }).click()
  const graph = page.getByRole('region', { name: 'Run work graph', exact: true })
  await graph.getByRole('heading', { name: 'Test verification · 2', exact: true }).waitFor()
  assert.equal(await graph.locator('.wb-graph-member').count(), 1)
  await graph.locator('.wb-graph-rail').getByRole('button', { name: /Implementation · 1/ }).click()
  await graph.getByRole('heading', { name: 'Implementation · 1', exact: true }).waitFor()
  await capture('graph-implementation-desktop.png')
  check('Actual implementation and pytest stages keep their real Agent memberships')
  await page.getByRole('button', { name: /^Artifacts \d+$/ }).click()
  await page.getByRole('combobox', { name: 'Select artifact', exact: true }).click()
  await page.getByRole('option', { name: diff.title, exact: true }).click()
  await page.getByTestId('coding-diff').waitFor()
  assert.match(await page.getByTestId('coding-diff').innerText(), /any\(ord\(char\) < 32/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download artifact', exact: true }).click()
  const saved = await download
  assert.match(saved.suggestedFilename(), /\.patch$/)
  const patchPath = await saved.path()
  assert.equal(await readFile(patchPath, 'utf8'), diff.content)
  execFileSync('git', ['apply', '--check', patchPath], {
    cwd: resolve(fixture, 'workspace'),
    env: {
      PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  })
  await writeFile(resolve(out, 'actual.patch'), diff.content)
  await capture('actual-patch-desktop.png')
  check('Actual Diff downloads unchanged and passes git apply --check without applying it')
  const testArtifact = detail.artifacts.find((item) =>
    item.kind === 'test_result' && JSON.parse(item.content).round === 2)
  await page.getByRole('combobox', { name: 'Select artifact', exact: true }).click()
  await page.getByRole('option', { name: testArtifact.title, exact: true }).click()
  await page.getByTestId('coding-test-output').waitFor()
  assert.match(await page.getByTestId('coding-test-output').innerText(), /4 passed/)
  await page.getByText('Python pytest', { exact: true }).last().waitFor()
  const testDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download artifact', exact: true }).click()
  const testSaved = await testDownload
  assert.match(testSaved.suggestedFilename(), /\.json$/)
  assert.equal(await readFile(await testSaved.path(), 'utf8'), testArtifact.content)
  await capture('actual-tests-desktop.png')
  check('Actual pytest output, fixed argv, result counts and exit evidence display and export as original JSON')
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
    assert.equal(await page.getByTestId('run-test-profile').innerText(), 'Python pytest')
    await page.waitForFunction(({ style, mode }) =>
      Boolean(document.querySelector(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`)),
    { style, mode })
    const geometry = await page.evaluate(() => {
      const theme = document.querySelector('.wb-theme')
      const computed = getComputedStyle(theme)
      return {
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        color: computed.color, background: computed.backgroundColor,
        font: computed.fontFamily,
      }
    })
    assert.ok(geometry.scroll <= geometry.width + 1)
    report.geometry.push({ surface: 'result', style, mode, locale, ...geometry })
    await capture(`result-${style}-${mode}.png`)
  }
  check('Actual pytest results retain their profile across all six style/mode layouts')
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
