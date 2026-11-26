import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '/tmp/mybot-browser-tools/node_modules/playwright/index.mjs'

assert.equal(process.env.MYBOT_BROWSER_FIXTURE, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
assert.equal(new URL(base).hostname, '127.0.0.1')
assert.ok(!['4180', '5173'].includes(new URL(base).port))
const out = resolve(process.env.PLAN_REVISION_EVIDENCE_DIR ?? '/tmp/mybot-plan-revision-frame')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome' })
const report = { checks: [], screenshots: [], errors: [], external: [] }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    if (location.protocol === 'http:') localStorage.setItem('mybot.locale', 'en')
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
  await page.goto(base)
  await page.getByLabel(/Access token/).fill('astryx-browser-fixture')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.locator('.wb-shell').waitFor()
  const data = await page.evaluate(async () => (await fetch('/api/bootstrap')).json())
  assert.match(data.workspace, /^\/tmp\/mybot-astryx-workbench\.[A-Za-z0-9_-]+\/workspace$/)
  let root, plan
  for (const task of data.tasks) {
    const value = await page.evaluate(async id => (await fetch(`/api/tasks/${id}/plan`)).json(), task.id)
    if (value.plan) { root = task; plan = value.plan; break }
  }
  assert.equal(plan.version, 3)
  await page.goto(`${base}#task/${root.id}`)
  await page.reload()
  await page.getByRole('button', { name: 'Revise plan', exact: true }).click()
  const editor = page.getByTestId('task-plan-editor')
  const source = editor.getByRole('region', { name: 'Subtask 2', exact: true })
  await source.getByRole('textbox', { name: 'Acceptance', exact: true }).fill('Review the new assumptions and preserve exact original evidence.')
  await editor.getByRole('button', { name: 'Review plan revision', exact: true }).click()
  const impact = editor.getByRole('region', { name: 'Revision impact', exact: true })
  await impact.getByRole('heading', { name: 'Revision impact', exact: true }).waitFor()
  await impact.scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(out, 'visible-revision-impact-desktop.png'), fullPage: true })
  report.screenshots.push('visible-revision-impact-desktop.png')
  await page.setViewportSize({ width: 390, height: 1000 })
  await impact.scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: resolve(out, 'visible-revision-impact-mobile.png'), fullPage: true })
  report.screenshots.push('visible-revision-impact-mobile.png')
  await editor.getByRole('button', { name: 'Cancel editing', exact: true }).click()
  await page.getByRole('button', { name: 'Discard edits', exact: true }).click()
  const after = await page.evaluate(async () => (await fetch('/api/bootstrap')).json())
  assert.equal(after.tasks.length, data.tasks.length)
  assert.equal(after.runs.length, data.runs.length)
  report.checks.push('Revision impact and confirmation are framed inside the desktop and mobile dialog; discard adds no Task, Run or version')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.external, [])
} finally {
  await browser.close()
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(report, null, 2))
}
