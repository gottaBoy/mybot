import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/',
  origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const fixture = process.env.CODING_FIXTURE_DIR
assert.match(fixture ?? '', /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+$/)
const out = resolve(
  process.env.CODING_EVIDENCE_DIR ?? '/tmp/mybot-coding-continuation',
)
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs',
  ).href
)
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
  acceptDownloads: true,
})
await context.addInitScript(() => {
  if (!localStorage.getItem('mybot.locale'))
    localStorage.setItem('mybot.locale', 'en')
  if (!localStorage.getItem('mybot.style'))
    localStorage.setItem('mybot.style', 'neutral')
  if (!localStorage.getItem('mybot.mode'))
    localStorage.setItem('mybot.mode', 'light')
})
const report = {
  checks: [],
  errors: [],
  external: [],
  writes: [],
  geometry: [],
  screenshots: [],
}
const check = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
context.on('request', (request) => {
  const url = new URL(request.url())
  if (url.pathname.startsWith('/api/') && request.method() !== 'GET')
    report.writes.push({ path: url.pathname, method: request.method() })
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
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return { status: response.status, data: await response.json() }
    },
    { path, body },
  )
}
async function poll(read, label) {
  for (let index = 0; index < 150; index++) {
    if (await read()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout: ${label}`)
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, name), fullPage: true })
  report.screenshots.push(name)
}
async function loseResponse(path) {
  let resolveDone, rejectDone
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  await page.route(`**${path}`, async (route) => {
    try {
      const response = await route.fetch()
      assert.equal(response.status(), 200)
      await route.abort('failed')
      resolveDone(await response.json())
    } catch (error) {
      rejectDone(error)
    }
  })
  return { done }
}
const panel = () => page.getByTestId('coding-run-dialog')
try {
  const original = await readFile(
    resolve(fixture, 'workspace/workbench/schemas.py'),
    'utf8',
  )
  const immutable = await readFile(
    resolve(fixture, 'workspace/test_relative_path.py'),
    'utf8',
  )
  await page.goto(base)
  assert.equal(
    (await api('/auth', { token: 'astryx-browser-fixture' })).status,
    200,
  )
  const bootstrap = (await api('/bootstrap')).data
  assert.equal(bootstrap.runs.length, 0)
  assert.equal(bootstrap.capabilities.coding_continuation, true)
  const project = (
    await api('/projects', {
      name: 'Code continuation acceptance',
      directory: '.',
      notes: 'Copied mybot sources; isolated fixture only',
    })
  ).data
  const sourceModel = (
    await api('/models', {
      name: 'Partial implementation fixture',
      model: 'coding-fixture',
      endpoint: 'http://127.0.0.1:9999/v1',
      key_env: '',
    })
  ).data
  const nextModel = (
    await api('/models', {
      name: 'Remaining repair fixture',
      model: 'coding-continuation-fixture',
      endpoint: 'http://127.0.0.1:9999/v1',
      key_env: '',
    })
  ).data
  const task = (
    await api('/tasks', {
      project_id: project.id,
      title: '从部分修复继续完成路径校验',
      goal: 'Reject newline and tab in mybot relative_path while preserving ordinary and Chinese source paths.',
      acceptance:
        'All four immutable tests pass; preserve source files and keep cumulative patch reviewable.',
      files: [
        'workbench/__init__.py',
        'workbench/schemas.py',
        'workbench/saved_views.py',
        'test_relative_path.py',
      ],
    })
  ).data
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page
    .getByRole('button', { name: 'Implement & validate', exact: true })
    .click()
  await panel()
    .getByRole('combobox', { name: 'Implementation model', exact: true })
    .click()
  await page
    .getByRole('option', {
      name: `${sourceModel.name} · ${sourceModel.model}`,
      exact: true,
    })
    .click()
  await panel()
    .getByRole('textbox', {
      name: 'Editable files (one per line)',
      exact: true,
    })
    .fill('workbench/schemas.py')
  await panel()
    .getByRole('spinbutton', { name: 'Implementation call limit', exact: true })
    .fill('1')
  await panel()
    .getByRole('button', {
      name: 'Review sources & test environment',
      exact: true,
    })
    .click()
  await panel().getByRole('checkbox').check()
  await panel()
    .getByRole('button', {
      name: 'Confirm implementation & tests',
      exact: true,
    })
    .click()
  let first
  await poll(async () => {
    const runs = (await api('/bootstrap')).data.runs
    if (runs.length !== 1) return false
    first = (await api(`/runs/${runs[0].id}`)).data
    return first.run.status === 'failed'
  }, 'partial implementation fails')
  assert.equal(first.run.error, 'coding_tests_failed')
  assert.equal(first.calls.length, 1)
  const sourceTests = first.artifacts
    .filter((item) => item.kind === 'test_result')
    .map((item) => JSON.parse(item.content))
    .sort((a, b) => a.round - b.round)
  assert.deepEqual(
    sourceTests.map((test) => test.receipt.failures),
    [2, 1],
  )
  const checkpoint = first.artifacts.find(
    (item) => item.kind === 'code_checkpoint',
  )
  assert.ok(checkpoint)
  check(
    'A real bounded implementation fails with one remaining immutable-test failure and retains a trusted code checkpoint',
  )
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page
    .getByRole('button', { name: 'Implement & validate', exact: true })
    .click()
  await panel()
    .getByRole('combobox', {
      name: 'Implementation starting point',
      exact: true,
    })
    .click()
  await page
    .getByRole('option', { name: 'Prior code checkpoint', exact: true })
    .click()
  const listPath = `/api/tasks/${task.id}/coding/checkpoints`
  await page.route(`**${listPath}?*`, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await panel()
    .getByRole('button', { name: 'Refresh checkpoints', exact: true })
    .click()
  await panel()
    .getByText('Checkpoints could not be read. Refresh to retry.', {
      exact: true,
    })
    .waitFor()
  await page.unroute(`**${listPath}?*`)
  await panel()
    .getByRole('button', { name: 'Refresh checkpoints', exact: true })
    .click()
  await panel()
    .getByRole('combobox', { name: 'Code starting point', exact: true })
    .click()
  const startingPoint = panel().getByRole('combobox', {
    name: 'Code starting point',
    exact: true,
  })
  await startingPoint.press('End')
  await startingPoint.press('Enter')
  await panel()
    .getByRole('textbox', {
      name: 'Requirements for this implementation',
      exact: true,
    })
    .fill(
      'Keep the newline rejection already implemented. Complete tab and other ASCII-control rejection without changing tests.',
    )
  await panel()
    .getByRole('textbox', {
      name: 'Editable files (one per line)',
      exact: true,
    })
    .fill('workbench/schemas.py')
  await panel()
    .getByRole('combobox', { name: 'Implementation model', exact: true })
    .click()
  await page
    .getByRole('option', {
      name: `${nextModel.name} · ${nextModel.model}`,
      exact: true,
    })
    .click()
  const callsBefore = (await api('/bootstrap')).data.runs.length
  await panel()
    .getByRole('button', {
      name: 'Review sources & test environment',
      exact: true,
    })
    .click()
  await panel()
    .getByRole('region', { name: 'Continuation code snapshot', exact: true })
    .waitFor()
  assert.equal((await api('/bootstrap')).data.runs.length, callsBefore)
  await panel().getByText('Inherited code changes', { exact: true }).click()
  assert.match(await panel().innerText(), /\\n/)
  await capture('continuation-preview-desktop.png')
  check(
    'Explicit checkpoint selection recovers from catalog failure and previews inherited code with no new Run',
  )
  const preparePath = `/api/tasks/${task.id}/coding/prepare`
  const prepareLost = await loseResponse(preparePath)
  await panel().getByRole('checkbox').check()
  await panel()
    .getByRole('button', {
      name: 'Confirm implementation & tests',
      exact: true,
    })
    .click()
  const prepared = await prepareLost.done
  await page
    .getByText(
      'The outcome is unknown. Keep and check the original request ID; do not repeat execution.',
      { exact: true },
    )
    .waitFor()
  await page.unroute(`**${preparePath}`)
  await page.reload()
  await panel()
    .getByRole('button', { name: 'Discard this preparation', exact: true })
    .waitFor()
  assert.equal(await panel().getByRole('checkbox').isChecked(), false)
  assert.equal(prepared.candidate.snapshot.continuation.id, checkpoint.id)
  assert.ok(
    prepared.candidate.snapshot.files
      .find((file) => file.path === 'workbench/schemas.py')
      .content.includes(String.raw`"\n" in value`),
  )
  assert.equal(
    prepared.candidate.snapshot.origin_files.find(
      (file) => file.path === 'workbench/schemas.py',
    ).content,
    original,
  )
  check(
    'Lost prepare reloads the same frozen checkpoint, original base and requirements with fresh unchecked consent',
  )
  for (const style of ['neutral', 'zira', 'y2k'])
    for (const mode of ['light', 'dark']) {
      const locale = mode === 'dark' ? 'zh' : 'en',
        width = mode === 'dark' ? 390 : 1440
      await page.evaluate(
        ({ style, mode, locale }) => {
          localStorage.setItem('mybot.style', style)
          localStorage.setItem('mybot.mode', mode)
          localStorage.setItem('mybot.locale', locale)
        },
        { style, mode, locale },
      )
      await page.setViewportSize({ width, height: 1000 })
      await page.reload()
      await panel()
        .getByRole('button', {
          name: locale === 'zh' ? '放弃此次准备' : 'Discard this preparation',
          exact: true,
        })
        .waitFor()
      await panel()
        .getByText(
          locale === 'zh' ? '继承的代码修改' : 'Inherited code changes',
          { exact: true },
        )
        .click()
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        panel: document
          .querySelector('[data-testid="coding-run-dialog"]')
          ?.getBoundingClientRect()
          .toJSON(),
      }))
      assert.ok(geometry.scroll <= geometry.width + 1)
      report.geometry.push({ style, mode, locale, ...geometry })
      await capture(`prepared-${style}-${mode}.png`)
    }
  check(
    'Frozen continuation renders across three styles, both modes, English desktop and Chinese mobile',
  )
  await page.evaluate(() => {
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.style', 'neutral')
    localStorage.setItem('mybot.mode', 'light')
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await panel()
    .getByRole('button', { name: 'Discard this preparation', exact: true })
    .waitFor()
  const executePath = `/api/tasks/${task.id}/coding/${prepared.request_id}/execute`
  const executeLost = await loseResponse(executePath)
  await panel().getByRole('checkbox').check()
  await panel()
    .getByRole('button', {
      name: 'Confirm implementation & tests',
      exact: true,
    })
    .click()
  await executeLost.done
  await page
    .getByText(
      'The outcome is unknown. Keep and check the original request ID; do not repeat execution.',
      { exact: true },
    )
    .waitFor()
  await page.unroute(`**${executePath}`)
  await page.reload()
  await page.waitForFunction(
    () =>
      !location.hash.includes('codingRequest=') &&
      location.hash.includes('taskRun='),
  )
  let result
  await poll(async () => {
    const job = (await api(`/tasks/${task.id}/coding/${prepared.request_id}`))
      .data
    result = (await api(`/runs/${job.run_id}`)).data
    return ['succeeded', 'failed'].includes(result.run.status)
  }, 'continued code and actual tests')
  assert.equal(result.run.status, 'succeeded', result.run.error)
  const tests = result.artifacts
    .filter((item) => item.kind === 'test_result')
    .map((item) => JSON.parse(item.content))
    .sort((a, b) => a.round - b.round)
  assert.deepEqual(
    tests.map((test) => test.receipt.failures),
    [1, 0],
  )
  assert.deepEqual(
    tests.map((test) => test.tests_run),
    [4, 4],
  )
  assert.equal(result.calls.length, 1)
  assert.equal((await api('/bootstrap')).data.runs.length, 2)
  assert.equal(
    report.writes.filter((write) => write.path === preparePath).length,
    2,
  ) // original + continued preparation
  assert.equal(
    report.writes.filter((write) => write.path === executePath).length,
    1,
  )
  assert.equal(
    await readFile(resolve(fixture, 'workspace/workbench/schemas.py'), 'utf8'),
    original,
  )
  assert.equal(
    await readFile(resolve(fixture, 'workspace/test_relative_path.py'), 'utf8'),
    immutable,
  )
  await writeFile(
    resolve(out, 'actual-test-attempts.json'),
    JSON.stringify({ source: sourceTests, continued: tests }, null, 2),
  )
  check(
    'One continued Run tests the inherited failing baseline, completes the repair with one fixture call and preserves original files',
  )
  await page.reload()
  await page.getByText('Confirmed context boundary', { exact: true }).click()
  const provenance = page.getByTestId('coding-provenance')
  await provenance.locator('summary').click()
  assert.ok((await provenance.innerText()).includes(first.run.id))
  await capture('run-source-provenance.png')
  check(
    'Run context retains the immediate code source, original base digest and exact supplemental requirements',
  )
  await page.getByRole('button', { name: /^Artifacts \d+$/ }).click()
  const cumulative = result.artifacts.find((item) => item.kind === 'diff')
  const incremental = result.artifacts.find(
    (item) => item.kind === 'incremental_diff',
  )
  const snapshot = result.artifacts.find(
    (item) => item.kind === 'code_checkpoint',
  )
  const inheritedBaseline = result.artifacts.find(
    (item) =>
      item.kind === 'test_result' && JSON.parse(item.content).round === 0,
  )
  await page
    .getByRole('combobox', { name: 'Select artifact', exact: true })
    .click()
  await page
    .getByRole('option', { name: inheritedBaseline.title, exact: true })
    .click()
  await page.getByText('Inherited code baseline', { exact: true }).waitFor()
  await capture('inherited-baseline-test.png')
  check(
    'Baseline test evidence explicitly names the inherited code rather than the original project',
  )
  for (const artifact of [cumulative, incremental, snapshot]) {
    await page
      .getByRole('combobox', { name: 'Select artifact', exact: true })
      .click()
    await page
      .getByRole('option', { name: artifact.title, exact: true })
      .click()
    if (artifact.kind === 'code_checkpoint')
      await page.getByTestId('code-checkpoint').waitFor()
    else await page.getByTestId('coding-diff').waitFor()
    const download = page.waitForEvent('download')
    await page
      .getByRole('button', { name: 'Download artifact', exact: true })
      .click()
    const saved = await download
    assert.match(
      saved.suggestedFilename(),
      artifact.kind === 'code_checkpoint' ? /\.json$/ : /\.patch$/,
    )
    assert.equal(await readFile(await saved.path(), 'utf8'), artifact.content)
    if (artifact.kind === 'diff')
      execFileSync('git', ['apply', '--check', await saved.path()], {
        cwd: resolve(fixture, 'workspace'),
        env: {
          PATH: '/usr/bin:/bin',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_SYSTEM: '/dev/null',
        },
      })
    await writeFile(
      resolve(
        out,
        artifact.kind === 'diff'
          ? 'actual.patch'
          : artifact.kind === 'incremental_diff'
            ? 'incremental.patch'
            : 'code-checkpoint.json',
      ),
      artifact.content,
    )
    await capture(`${artifact.kind}-desktop.png`)
  }
  assert.match(incremental.content, /^-.*\\n/m)
  assert.match(incremental.content, /^\+.*any\(ord/m)
  check(
    'Cumulative and incremental patches plus the structured code checkpoint display and export as exact artifacts',
  )
  report.actual = {
    task_id: task.id,
    source_run_id: first.run.id,
    run_id: result.run.id,
    checkpoint_id: checkpoint.id,
    source_failures: sourceTests.map((test) => test.receipt.failures),
    continued_failures: tests.map((test) => test.receipt.failures),
    continued_calls: result.calls.length,
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (error) {
  report.failure = String(error)
  await capture('failure.png').catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
