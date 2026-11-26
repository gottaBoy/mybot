import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/',
  origin = new URL(base).origin
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.PLAN_EVIDENCE_DIR ?? '/tmp/mybot-plan-editor')
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
  viewport: { width: 390, height: 1000 },
  reducedMotion: 'reduce',
})
await context.addInitScript(() => {
  localStorage.setItem('mybot.locale', 'zh')
  localStorage.setItem('mybot.style', 'zira')
  localStorage.setItem('mybot.mode', 'dark')
})
const page = await context.newPage(),
  report = { checks: [], errors: [], external: [], writes: [] }
page.on('pageerror', (error) => report.errors.push(error.message))
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
const check = (text) => {
  report.checks.push(text)
  console.log(`PASS ${text}`)
}
const disabled = async (locator) =>
  (await locator.getAttribute('aria-disabled')) === 'true' ||
  (await locator.isDisabled())
try {
  await page.goto(base)
  assert.equal(
    (await api('/auth', { token: 'astryx-browser-fixture' })).status,
    200,
  )
  const initial = (await api('/bootstrap')).data
  assert.ok([3, 4].includes(initial.tasks.length))
  assert.equal(initial.runs.length, 2)
  const task =
    initial.tasks.find(
      (item) => item.title === '窄屏任务拆解编辑与草稿保护专项',
    ) ??
    (
      await api('/tasks', {
        project_id: initial.projects[0].id,
        title: '窄屏任务拆解编辑与草稿保护专项',
        goal: 'Verify actual narrow-screen editing and dependency read errors without creating child Tasks or running a model.',
        acceptance:
          'Long labels fit, dirty drafts remain protected and failed reads do not enable new execution.',
        files: ['README.md'],
      })
    ).data
  const planPath = `/api/tasks/${task.id}/plan`
  await page.route(`**${planPath}`, (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  )
  await page.goto(`${base}#task/${task.id}`)
  await page.reload()
  await page
    .getByText('任务依赖读取失败，暂不能发起新的运行。', { exact: true })
    .waitFor()
  assert.ok(
    await disabled(page.getByRole('button', { name: '安排执行', exact: true })),
  )
  assert.equal(
    await page.getByRole('button', { name: '拆分任务', exact: true }).count(),
    0,
  )
  await page.unroute(`**${planPath}`)
  await page.getByRole('button', { name: '刷新任务依赖', exact: true }).click()
  await page.getByRole('button', { name: '拆分任务', exact: true }).click()
  check(
    'Advertised dependency read failure blocks new work and does not fall back to an empty successful plan',
  )
  const editor = page.getByTestId('task-plan-editor')
  const title = '核查受限源码输入、逐项记录假设并等待人工审查的前置研究任务'
  for (let index = 1; index <= 2; index++) {
    const section = editor.getByRole('region', {
      name: `子任务 ${index}`,
      exact: true,
    })
    await section
      .getByRole('textbox', { name: '任务名称', exact: true })
      .fill(
        index === 1
          ? title
          : '在前置研究报告通过人工验收之后建立明确可验证的执行建议',
      )
    await section
      .getByRole('textbox', { name: '任务目标', exact: true })
      .fill(
        '核查明确提供的源码边界，记录待验证事项，并保持任务目标与执行证据可以相互追溯。',
      )
    await section
      .getByRole('textbox', { name: '验收要求', exact: true })
      .fill(
        '只使用明确提供的资料，报告列出依据、未知项以及等待人工确认的结论，不把建议写成已执行测试。',
      )
  }
  await editor
    .getByRole('region', { name: '子任务 2', exact: true })
    .getByRole('checkbox', { name: title, exact: true })
    .check()
  await page.keyboard.press('Escape')
  const guard = page.getByRole('dialog', {
    name: '放弃任务拆解编辑？',
    exact: true,
  })
  await guard.waitFor()
  await guard
    .locator('.wb-form-actions')
    .getByRole('button', { name: '继续编辑', exact: true })
    .click()
  assert.equal(
    await editor
      .getByRole('region', { name: '子任务 1', exact: true })
      .getByRole('textbox', { name: '任务名称', exact: true })
      .inputValue(),
    title,
  )
  assert.equal(
    await editor
      .getByRole('region', { name: '子任务 2', exact: true })
      .getByRole('checkbox', { name: title, exact: true })
      .isChecked(),
    true,
  )
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    dialog: document
      .querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')
      ?.getBoundingClientRect()
      .toJSON(),
  }))
  assert.ok(geometry.document <= geometry.width + 1)
  assert.ok(geometry.dialog.x >= 0 && geometry.dialog.right <= 390)
  await page.screenshot({
    path: resolve(out, 'editor-zira-dark-mobile.png'),
    fullPage: true,
  })
  report.geometry = geometry
  check(
    'Chinese mobile editor fits long labels and retains goals, acceptance and dependency checks after Escape/Keep editing',
  )
  await editor.getByRole('button', { name: '取消编辑', exact: true }).click()
  await page
    .getByRole('dialog', { name: '放弃任务拆解编辑？', exact: true })
    .getByRole('button', { name: '放弃编辑', exact: true })
    .click()
  const final = (await api('/bootstrap')).data
  assert.equal(final.tasks.length, 4)
  assert.equal(final.runs.length, 2)
  assert.equal((await api(`/tasks/${task.id}/plan`)).data.plan, null)
  assert.equal(
    report.writes.filter((write) => write.path.startsWith(planPath)).length,
    0,
  )
  check(
    'Discarding uncreated edits produces no plan, children, file preview or additional Run',
  )
  report.fixture = { editor_task_id: task.id, total_tasks: 4, total_runs: 2 }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} catch (error) {
  report.failure = String(error)
  await page
    .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
