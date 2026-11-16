import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(
  process.env.MYBOT_LOCAL_ACTIVATION_READONLY,
  '1',
  'Explicit local, read-only activation check is required',
)
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.ACTIVATION_EVIDENCE_DIR ?? '../.runtime/activation-browser',
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
  headless: true,
})
const report = {
  kind: 'actual-local-service-read-only',
  date: '2026-11-16',
  base,
  checks: [],
  writesBlocked: [],
  unexpectedApi: [],
  pageErrors: [],
  screenshots: 'Not captured: preserve private workspace content',
}
const allowed = new Set([
  '/api/auth/state',
  '/api/bootstrap',
  '/api/saved-views',
])
await mkdir(out, { recursive: true, mode: 0o700 })

async function projection() {
  const response = await fetch(`${origin}/api/bootstrap`)
  assert.equal(response.status, 200)
  const value = await response.json()
  // Compare actual records in memory only; the report contains no user payload.
  return JSON.stringify(
    Object.fromEntries(
      ['projects', 'tasks', 'runs', 'models', 'backends'].map((key) => [
        key,
        value[key],
      ]),
    ),
  )
}

try {
  const baseline = await projection()
  for (const [name, width, height, touch] of [
    ['desktop', 1440, 1000, false],
    ['mobile', 390, 844, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript(() => {
      localStorage.setItem('mybot.locale', 'zh')
      localStorage.setItem('mybot.mode', 'light')
      localStorage.setItem('mybot.style', 'neutral')
    })
    await context.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin)
        return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (request.method() !== 'GET') {
        report.writesBlocked.push({
          method: request.method(),
          path: url.pathname,
        })
        return route.abort('blockedbyclient')
      }
      if (!allowed.has(url.pathname)) {
        report.unexpectedApi.push(url.pathname)
        return route.abort('blockedbyclient')
      }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      report.pageErrors.push({ name, type: error.name }),
    )
    await page.goto(`${base}#workbench`)
    await page.getByRole('heading', { name: '任务', exact: true }).waitFor()
    const trigger = page.getByRole('button', { name: '视图', exact: true })
    await trigger.click()
    await page.getByText('此作用域没有保存的视图。', { exact: true }).waitFor()
    const command = touch
      ? page
          .getByRole('dialog', { name: '视图', exact: true })
          .getByRole('button', { name: '保存当前视图', exact: true })
      : page.getByRole('menuitem', { name: '保存当前视图', exact: true })
    assert.notEqual(await command.getAttribute('aria-disabled'), 'true')
    assert.equal(await command.isEnabled(), true)
    report.checks.push(
      `${name}: actual scoped directory reads successfully and save command is enabled`,
    )
    await page.keyboard.press('Escape')
    await (
      touch
        ? page.getByRole('dialog', { name: '视图', exact: true })
        : page.getByRole('menu')
    ).waitFor({ state: 'hidden' })
    const search = page
      .locator('.wf-querybar-primary')
      .getByRole('searchbox', { name: '搜索', exact: true })
    const href = page.url()
    await search.fill('未提交的本机验收候选')
    await page.locator('.wf-query-draft').waitFor({ state: 'visible' })
    await trigger.click()
    const pending = touch
      ? page
          .getByRole('dialog', { name: '视图', exact: true })
          .getByRole('button', { name: /^保存当前视图(?:\s|$)/ })
      : page.getByRole('menuitem', { name: /^保存当前视图(?:\s|$)/ })
    await pending.waitFor()
    await page.waitForFunction(() => {
      const buttons = [
        ...document.querySelectorAll('[role="menuitem"], dialog button'),
      ]
      return buttons.some(
        (button) =>
          button.textContent.startsWith('保存当前视图') &&
          (button.hasAttribute('disabled') ||
            button.getAttribute('aria-disabled') === 'true'),
      )
    })
    assert.ok(
      (await pending.isDisabled()) ||
        (await pending.getAttribute('aria-disabled')) === 'true',
    )
    assert.equal(page.url(), href)
    report.checks.push(
      `${name}: an unsubmitted candidate disables saving without a URL or server write`,
    )
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    await context.close()
  }
  assert.equal(await projection(), baseline)
  report.checks.push(
    'Actual projects/tasks/runs/models/backends remain unchanged',
  )
  assert.deepEqual(report.writesBlocked, [])
  assert.deepEqual(report.unexpectedApi, [])
  assert.deepEqual(report.pageErrors, [])
} catch (error) {
  report.failure = {
    type: error.name,
    message:
      'Read-only acceptance did not finish; no private DOM or response payload is recorded',
  }
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  )
  await browser.close()
}
console.log(JSON.stringify({ checks: report.checks.length, writes: 0, out }))
