import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const fixture = process.env.CODING_FIXTURE_DIR
assert.match(fixture ?? '', /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out = resolve(process.env.CODING_EVIDENCE_DIR ?? '/tmp/mybot-coding-node')
await mkdir(out, { recursive: true })
const { chromium } = await import(pathToFileURL(
  process.env.PLAYWRIGHT_MODULE ?? '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
).href)
const browser = await chromium.launch({
  headless: true, executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  fixture: true, profile: 'node-test',
  modelGeneration: 'Injected fixed JSON; no paid or real model',
  actualExecution: 'Extracted mybot forwardedOrigin body, confined node:test, HTTP and SQLite',
  checks: [], errors: [], external: [], writes: [], reads: [], geometry: [], screenshots: [],
}
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true,
})
await context.addInitScript(() => {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    if (!localStorage.getItem('mybot.locale')) localStorage.setItem('mybot.locale', 'en')
  }
})
context.on('request', (request) => {
  const path = new URL(request.url()).pathname
  if (path.startsWith('/api/')) {
    (request.method() === 'GET' ? report.reads : report.writes).push({
      path, method: request.method(),
    })
  }
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
const check = (text) => { report.checks.push(text); console.log(`PASS ${text}`) }
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
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForFunction(() => window.scrollY === 0)
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
async function poll(read, label) {
  for (let index = 0; index < 200; index++) {
    if (await read()) return
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error(`Timed out: ${label}`)
}
function profile(candidate) {
  assert.equal(candidate.config.profile, 'node-test')
  assert.equal(candidate.snapshot.profile, 'node-test')
}
const files = ['forwarded-origin.mjs', 'test_forwarded_origin.mjs']
const original = new Map(await Promise.all(files.map(async (path) => [
  path, await readFile(resolve(fixture, 'workspace', path), 'utf8'),
])))
const sourcePath = fileURLToPath(new URL('../scripts/api-proxy.ts', import.meta.url))
const sourceBefore = await readFile(sourcePath, 'utf8')
try {
  await page.goto(base)
  assert.equal((await api('/auth', { token: 'astryx-browser-fixture' })).status, 200)
  await page.reload()
  await page.locator('.wb-shell').waitFor()
  const bootstrap = (await api('/bootstrap')).data
  assert.equal(bootstrap.tasks.length, 0)
  assert.equal(bootstrap.capabilities.coding_node_test, true)
  const project = (await api('/projects', {
    name: 'mybot Node.js verification', directory: '.',
    notes: 'Real forwardedOrigin function body, mechanically stripped signature in disposable fixture.',
  })).data
  const model = (await api('/models', {
    name: 'Node deterministic fixture', model: 'node-origin-fixture',
    endpoint: 'http://127.0.0.1:9999/v1', key_env: '',
  })).data
  const task = (await api('/tasks', {
    project_id: project.id, title: '校验代理目标 Origin · Node.js',
    goal: 'Reject proxy targets with credentials or a non-root path; retain valid same-origin translation and foreign origins.',
    acceptance: 'Four immutable node:test cases pass; the selected source and original mybot file remain unchanged.',
    files,
  })).data
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Implement & validate', exact: true }).click()
  const panel = () => page.getByRole('dialog', { name: 'Implement & validate', exact: true })
  await panel().getByRole('textbox', { name: 'Editable files (one per line)', exact: true }).fill(files[0])
  await panel().getByRole('textbox', { name: 'Immutable test files (one per line)', exact: true }).fill(files[1])
  await panel().getByRole('combobox', { name: 'Test profile', exact: true }).click()
  await page.getByRole('option', { name: 'Node.js node:test', exact: true }).click()
  assert.equal(await panel().getByRole('textbox', {
    name: 'Immutable test files (one per line)', exact: true,
  }).inputValue(), files[1])
  const previewPath = `/api/tasks/${task.id}/coding/preview`
  const pendingPreview = page.waitForResponse((response) =>
    new URL(response.url()).pathname === previewPath && response.request().method() === 'POST')
  await panel().getByRole('button', { name: 'Review sources & test environment', exact: true }).click()
  const preview = await pendingPreview
  assert.equal(preview.status(), 200)
  profile(await preview.json())
  await panel().getByRole('checkbox').waitFor()
  assert.equal((await api('/bootstrap')).data.runs.length, 0)
  check('Explicit Node profile retains selected immutable paths and previews without a model or Run')

  const preparePath = `/api/tasks/${task.id}/coding/prepare`
  let requestId
  await page.route(`**${preparePath}`, async (route) => {
    assert.equal(route.request().postDataJSON().profile, 'node-test')
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const job = await response.json()
    requestId = job.request_id
    profile(job.candidate)
    await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  await page.getByText(
    'The outcome is unknown. Keep and check the original request ID; do not repeat execution.',
    { exact: true },
  ).waitFor()
  await page.unroute(`**${preparePath}`)
  assert.ok(page.url().includes(`codingRequest=${requestId}`))
  await page.reload()
  await panel().getByRole('button', { name: 'Discard this preparation', exact: true }).waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(), false)
  const prepared = (await api(`/tasks/${task.id}/coding/${requestId}`)).data
  assert.equal(prepared.state, 'prepared')
  profile(prepared.candidate)
  assert.equal(report.writes.filter((write) => write.path === preparePath).length, 1)
  check('A lost preparation restores the same persisted ID by GET and requires fresh consent')

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
    await page.getByRole('button', {
      name: locale === 'zh' ? '放弃此次准备' : 'Discard this preparation', exact: true,
    }).waitFor()
    await page.waitForFunction(({ style, mode }) =>
      !!document.querySelector(`.wb-theme[data-style="${style}"][data-mode="${mode}"]`),
    { style, mode })
    const geometry = await page.evaluate(() => {
      const computed = getComputedStyle(document.querySelector('.wb-theme'))
      return {
        width: innerWidth, scroll: document.documentElement.scrollWidth,
        color: computed.color, background: computed.backgroundColor, font: computed.fontFamily,
      }
    })
    assert.ok(geometry.scroll <= width + 1)
    report.geometry.push({ style, mode, locale, ...geometry })
    await capture(`candidate-${style}-${mode}.png`)
  }
  check('A frozen Node candidate survives three styles, two modes and English desktop/Chinese mobile')
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'en'))
  await page.reload()
  const executePath = `/api/tasks/${task.id}/coding/${requestId}/execute`
  await page.route(`**${executePath}`, async (route) => {
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    const job = await response.json()
    assert.equal(job.request_id, requestId)
    profile(job.candidate)
    await route.abort('failed')
  })
  await panel().getByRole('checkbox').check()
  await panel().getByRole('button', { name: 'Confirm implementation & tests', exact: true }).click()
  await page.getByText(
    'The outcome is unknown. Keep and check the original request ID; do not repeat execution.',
    { exact: true },
  ).waitFor()
  await page.unroute(`**${executePath}`)
  await page.reload()
  await page.waitForFunction(() => !location.hash.includes('codingRequest=') && location.hash.includes('taskRun='))
  let detail
  await poll(async () => {
    const runs = (await api('/bootstrap')).data.runs
    assert.equal(runs.length, 1)
    detail = (await api(`/runs/${runs[0].id}`)).data
    return ['failed', 'succeeded'].includes(detail.run.status)
  }, 'real Node tests')
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  profile(detail.run.context.coding)
  assert.deepEqual(detail.harness.tools, ['node-test'])
  const tests = detail.artifacts.filter((item) => item.kind === 'test_result')
    .map((item) => JSON.parse(item.content)).sort((a, b) => a.round - b.round)
  assert.deepEqual(tests.map((test) => test.tests_run), [4, 4, 4])
  assert.deepEqual(tests.map((test) => test.receipt.failures), [2, 1, 0])
  assert.deepEqual(tests.map((test) => test.passed), [false, false, true])
  for (const test of tests) {
    assert.equal(test.profile, 'node-test')
    assert.equal(test.receipt.errors, 0)
    assert.equal(test.receipt.skipped, 0)
    assert.deepEqual(test.test_files, [files[1]])
    assert.equal(test.timed_out, false)
    assert.equal(test.truncated, false)
    assert.deepEqual(test.command.slice(1, 3), ['-I', '-B'])
    assert.match(test.command[3], /\/node_test_launcher\.py$/)
    const runtimeLines = test.output.split('\n').filter((line) =>
      line.startsWith('MYBOT_NODE_RUNTIME='))
    assert.equal(runtimeLines.length, 1)
    const runtime = JSON.parse(runtimeLines[0].slice('MYBOT_NODE_RUNTIME='.length))
    assert.equal(runtime.version, 'v24.21.0')
    assert.equal(runtime.executable, test.command[5])
    assert.ok(runtime.execArgv.includes('--permission'))
    assert.ok(runtime.execArgv.includes('--jitless'))
    assert.ok(runtime.execArgv.includes('--no-experimental-strip-types'))
    assert.deepEqual(JSON.parse(runtime.argv[3]), {
      profile: 'node-test', test_files: [files[1]],
    })
  }
  assert.equal(detail.calls.length, 2)
  assert.equal(report.writes.filter((write) => write.path === executePath).length, 1)
  report.actual = {
    task_id: task.id, run_id: detail.run.id, model_calls: detail.calls.length,
    attempts: tests.map((test) => ({
      round: test.round, profile: test.profile, tests_run: test.tests_run,
      exit_code: test.exit_code, receipt: test.receipt, passed: test.passed,
    })),
  }
  await writeFile(resolve(out, 'actual-test-attempts.json'), JSON.stringify(tests, null, 2))
  check('Actual confined Node tests fail two cases, then one, then pass four after two injected JSON changes')
  check('A lost execution response reconciles the applied original ID without a second execution POST')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await page.getByTestId('run-test-state').getByText('Passed', { exact: true }).waitFor()
  await page.getByText('Node.js node:test', { exact: true }).first().waitFor()
  await capture('result-desktop.png')
  const diff = detail.artifacts.filter((item) => item.kind === 'diff').at(-1)
  assert.ok(diff?.content.includes('forwarded-origin.mjs'))
  await page.getByRole('button', { name: /^Artifacts \d+$/ }).click()
  await page.getByRole('combobox', { name: 'Select artifact', exact: true }).click()
  await page.getByRole('option', { name: diff.title, exact: true }).click()
  await page.getByTestId('coding-diff').waitFor()
  const pendingDiff = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download artifact', exact: true }).click()
  const downloadedDiff = await pendingDiff
  assert.equal(await readFile(await downloadedDiff.path(), 'utf8'), diff.content)
  await capture('actual-diff-desktop.png')
  await writeFile(resolve(out, 'verified.diff'), diff.content)
  execFileSync('git', ['apply', '--check', resolve(out, 'verified.diff')], {
    cwd: resolve(fixture, 'workspace'), stdio: 'pipe',
    env: {
      PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    },
  })
  assert.ok(detail.artifacts.some((item) => item.kind === 'code_checkpoint'))
  check('Result evidence names the actual profile; its patch validates and a trusted checkpoint is available')
  const finalTest = detail.artifacts.find((item) =>
    item.kind === 'test_result' && JSON.parse(item.content).round === 2)
  assert.ok(finalTest)
  await page.getByRole('combobox', { name: 'Select artifact', exact: true }).click()
  await page.getByRole('option', { name: finalTest.title, exact: true }).click()
  await page.getByTestId('coding-test-output').waitFor()
  await page.getByText('Test cases', { exact: true }).waitFor()
  const pendingTest = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download artifact', exact: true }).click()
  const downloadedTest = await pendingTest
  assert.equal(await readFile(await downloadedTest.path(), 'utf8'), finalTest.content)
  await capture('actual-tests-desktop.png')
  check('Actual Node test output, counts and fixed argv display and export as the unchanged test JSON')

  await page.evaluate(() => localStorage.setItem('mybot.locale', 'zh'))
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.reload()
  await page.getByText('Node.js node:test', { exact: true }).first().waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await capture('result-mobile.png')
  for (const [path, before] of original) {
    assert.equal(await readFile(resolve(fixture, 'workspace', path), 'utf8'), before)
  }
  assert.equal(await readFile(sourcePath, 'utf8'), sourceBefore)
  check('Mobile evidence fits and all selected source/tests and the original mybot source remain unchanged')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  await capture('failure.png').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  await context.close()
  await browser.close()
}
