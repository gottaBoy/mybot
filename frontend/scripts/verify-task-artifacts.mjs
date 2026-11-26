import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(
  process.env.ARTIFACT_EVIDENCE_DIR ?? '/tmp/mybot-task-artifacts',
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
  screenshots: [],
  geometry: [],
}
const check = (message) => {
  report.checks.push(message)
  console.log(`PASS ${message}`)
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
async function capture(file) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: resolve(out, file), fullPage: true })
  report.screenshots.push(file)
}
const form = () => page.locator('.wb-form')
const references = () =>
  page.getByRole('region', { name: 'Prior work references', exact: true })
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
      resolveDone()
    } catch (error) {
      rejectDone(error)
    }
  })
  return { done }
}
try {
  await page.goto(base)
  assert.equal(
    (await api('/auth', { token: 'astryx-browser-fixture' })).status,
    200,
  )
  const initial = (await api('/bootstrap')).data
  assert.equal(initial.capabilities.task_artifact_references, true)
  assert.equal(
    initial.runs.length,
    1,
    'Run verify-coding first in the same fresh fixture',
  )
  const task = initial.tasks[0],
    source = (await api(`/runs/${initial.runs[0].id}`)).data
  assert.equal(source.run.status, 'succeeded')
  const diff = source.artifacts.find(
    (item) => item.kind === 'diff' && item.title.endsWith('2'),
  )
  const tests = source.artifacts.find(
    (item) =>
      item.kind === 'test_result' && JSON.parse(item.content).round === 2,
  )
  assert.ok(diff && tests)
  const model =
    initial.models.find(
      (item) => item.name === 'Continuation acceptance model',
    ) ??
    (
      await api('/models', {
        name: 'Continuation acceptance model',
        model: 'fake-test',
        endpoint: 'http://127.0.0.1:9999/v1',
        key_env: '',
      })
    ).data
  await page.goto(`${base}#task/${task.id}?taskTab=conversation`)
  await page.reload()
  await page
    .getByRole('textbox', { name: 'Supplemental requirements', exact: true })
    .fill(
      'Review the selected source patch and actual test evidence; identify remaining risks.',
    )
  await page.getByRole('button', { name: 'Save message', exact: true }).click()
  await page
    .getByText('Message saved. No run has started.', { exact: true })
    .waitFor()
  await page
    .getByRole('button', { name: 'Arrange next run', exact: true })
    .click()
  await references()
    .getByRole('button', { name: 'Select prior artifacts', exact: true })
    .waitFor()
  const turn = (await api(`/tasks/${task.id}/turns`)).data.items[0]
  assert.equal((await api('/bootstrap')).data.runs.length, 1)
  check(
    'Saved continuation opens a bounded reference picker without a new Run or model call',
  )

  const catalog = `/api/tasks/${task.id}/artifacts`
  await page.route(`**${catalog}?*`, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await references()
    .getByRole('button', { name: 'Select prior artifacts', exact: true })
    .click()
  await references()
    .getByText('Artifacts could not be read. Refresh to retry.', {
      exact: true,
    })
    .waitFor()
  assert.equal(await references().getByRole('checkbox').count(), 0)
  await page.unroute(`**${catalog}?*`)
  await references()
    .getByRole('button', { name: 'Refresh artifacts', exact: true })
    .click()
  await references()
    .getByRole('checkbox', { name: diff.title, exact: true })
    .waitFor()
  check(
    'Advertised catalog failure stays an explicit error and refresh uses the real GET',
  )
  await references()
    .getByRole('checkbox', { name: diff.title, exact: true })
    .focus()
  await page.keyboard.press('Space')
  await references()
    .getByRole('checkbox', { name: tests.title, exact: true })
    .check()
  const next = form().getByRole('button', { name: 'Next', exact: true })
  assert.equal(await next.getAttribute('aria-disabled'), 'true')
  await capture('reference-selection-desktop.png')
  await references()
    .getByRole('button', { name: 'Review selected artifacts', exact: true })
    .click()
  await references().locator('details').first().waitFor()
  assert.equal(await next.getAttribute('aria-disabled'), null)
  const selected = (await api(`/tasks/${task.id}/artifacts`)).data.items.filter(
    (item) => [diff.id, tests.id].includes(item.id),
  )
  assert.equal(selected.length, 2)
  check(
    'Keyboard and pointer selection require an exact-content preview before advancing',
  )
  await capture('reference-preview-desktop.png')
  await next.click()
  for (const name of ['Planning', 'Research', 'Synthesis']) {
    await form().getByRole('combobox', { name, exact: true }).click()
    await page
      .getByRole('option', {
        name: `${model.name} · ${model.model}`,
        exact: true,
      })
      .click()
  }
  await form().getByRole('button', { name: 'Next', exact: true }).click()
  const preparePath = `/api/tasks/${task.id}/turns/${turn.id}/prepare`
  const executePath = `/api/tasks/${task.id}/turns/${turn.id}/execute`
  const preparationLost = await loseResponse(preparePath)
  await form().getByRole('checkbox').check()
  await form()
    .getByRole('button', { name: 'Confirm & start run', exact: true })
    .click()
  await preparationLost.done
  await page
    .getByText(
      'The request outcome is unconfirmed. Check the original receipt before sending again.',
      { exact: true },
    )
    .waitFor()
  assert.equal((await api('/bootstrap')).data.runs.length, 1)
  await page.unroute(`**${preparePath}`)
  await page.reload()
  await page
    .getByTestId('task-conversation')
    .getByRole('button', { name: 'Continue prepared run', exact: true })
    .click()
  await references().locator('details').first().waitFor()
  assert.equal(
    await references()
      .getByRole('button', { name: 'Select prior artifacts', exact: true })
      .count(),
    0,
  )
  const frozen = (await api(`/tasks/${task.id}/turns/${turn.id}`)).data
  assert.deepEqual(
    frozen.candidate.snapshot.artifacts.map((item) => item.id),
    [diff.id, tests.id],
  )
  assert.equal(frozen.candidate.snapshot.artifacts[0].content, diff.content)
  assert.equal(frozen.candidate.snapshot.artifacts[1].content, tests.content)
  assert.equal(
    report.writes.filter((item) => item.path === preparePath).length,
    1,
  )
  check(
    'Lost preparation restores the original immutable references by GET after reload',
  )
  // Capture real frozen content, including long patch/test text, across themes.
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
      await page
        .getByTestId('task-conversation')
        .getByRole('button', {
          name: locale === 'zh' ? '继续确认下一轮' : 'Continue prepared run',
          exact: true,
        })
        .click()
      const region = page.getByRole('region', {
        name: locale === 'zh' ? '引用前轮成果' : 'Prior work references',
        exact: true,
      })
      await region.locator('details').first().locator('summary').click()
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        dialog: document
          .querySelector('[role="dialog"]')
          ?.getBoundingClientRect()
          .toJSON(),
      }))
      assert.ok(geometry.scroll <= geometry.width + 1)
      report.geometry.push({ style, mode, locale, ...geometry })
      const file = `frozen-references-${style}-${mode}.png`
      await capture(file)
    }
  check(
    'Frozen patch/test sources render in three styles, both modes, English desktop and Chinese mobile',
  )
  await page.evaluate(() => localStorage.setItem('mybot.locale', 'en'))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.reload()
  await page
    .getByTestId('task-conversation')
    .getByRole('button', { name: 'Continue prepared run', exact: true })
    .click()
  await form().getByRole('button', { name: 'Next', exact: true }).click()
  await form().getByRole('button', { name: 'Next', exact: true }).click()
  assert.equal(await form().getByRole('checkbox').isChecked(), false)
  const executionLost = await loseResponse(executePath)
  await form().getByRole('checkbox').check()
  await form()
    .getByRole('button', { name: 'Confirm & start run', exact: true })
    .click()
  await executionLost.done
  await page
    .getByText(
      'The request outcome is unconfirmed. Check the original receipt before sending again.',
      { exact: true },
    )
    .waitFor()
  await page.unroute(`**${executePath}`)
  await form()
    .getByRole('button', { name: 'Check turn receipt', exact: true })
    .click()
  await page.waitForFunction(() => location.hash.includes('taskRun='))
  let detail
  for (let index = 0; index < 100; index++) {
    const receipt = (await api(`/tasks/${task.id}/turns/${turn.id}`)).data
    detail = (await api(`/runs/${receipt.run_id}`)).data
    if (['succeeded', 'failed'].includes(detail.run.status)) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(detail.run.status, 'succeeded', detail.run.error)
  assert.equal(detail.calls.length, 4)
  assert.deepEqual(
    detail.run.context.artifacts,
    frozen.candidate.snapshot.artifacts,
  )
  assert.equal(detail.run.context.text, frozen.candidate.snapshot.text)
  assert.equal((await api('/bootstrap')).data.runs.length, 2)
  assert.equal(
    report.writes.filter((item) => item.path === preparePath).length,
    1,
  )
  assert.equal(
    report.writes.filter((item) => item.path === executePath).length,
    1,
  )
  check(
    'Lost execution reconciles the same Run; one POST and four fixture calls use the frozen context',
  )
  await page.reload()
  await page.getByText('Confirmed context boundary', { exact: true }).click()
  const boundary = page.locator('.wb-activity > details').first()
  assert.equal(await boundary.locator('details').count(), 2)
  await boundary.locator('details').first().locator('summary').click()
  assert.ok((await boundary.innerText()).includes(source.run.id))
  await capture('continuation-run-provenance.png')
  report.actual = {
    task_id: task.id,
    source_run_id: source.run.id,
    run_id: detail.run.id,
    status: detail.run.status,
    calls: detail.calls.length,
    references: detail.run.context.artifacts.map(
      ({ content, ...metadata }) => metadata,
    ),
  }
  await writeFile(
    resolve(out, 'frozen-references.json'),
    JSON.stringify(detail.run.context.artifacts, null, 2),
  )
  check(
    'Result view preserves original artifact IDs, hashes, bodies and source Run provenance',
  )
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
