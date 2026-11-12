import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const baseUrl = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const outputDirectory = resolve(process.env.THEME_EVIDENCE_DIR ?? '/tmp/mybot-theme-verification')
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright'
const moduleUrl = moduleName.startsWith('/') || moduleName.startsWith('.')
  ? pathToFileURL(resolve(moduleName)).href
  : moduleName
const {chromium} = await import(moduleUrl)
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
})
const evidence = {baseUrl, checks: [], blockedBusinessRequests: 0, blockedExternalRequests: 0}
const baseOrigin = new URL(baseUrl).origin
const contexts = []
const targetColor = 'rgb(201, 43, 75)'

await mkdir(outputDirectory, {recursive: true})

async function waitUntil(check, description, timeout = 12_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch {
      // A live theme update may replace the preview frame between checks.
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 80))
  }
  throw new Error(`Timed out: ${description}`)
}

function record(name, details = {}) {
  evidence.checks.push({name, result: 'passed', ...details})
  console.log(`PASS ${name}`)
}

async function createPage(viewport) {
  const context = await browser.newContext({viewport, reducedMotion: 'reduce', acceptDownloads: true})
  contexts.push(context)
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/api/')) {
      evidence.blockedBusinessRequests += 1
      await route.abort('blockedbyclient')
    } else if (url.protocol.startsWith('http') && url.origin !== baseOrigin) {
      evidence.blockedExternalRequests += 1
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })
  const page = await context.newPage()
  return {context, page}
}

async function openTemplates(page) {
  const url = new URL(baseUrl)
  url.hash = 'templates'
  await page.goto(url.href)
  await page.locator('.pg-root').waitFor({state: 'visible'})
}

function preview(page) {
  return page.frameLocator('iframe[title="Isolated local template preview"]')
}

async function waitForPreview(page) {
  await preview(page).getByRole('heading', {name: 'Welcome', exact: true}).waitFor({timeout: 20_000})
  await page.locator('.pg-sandbox-status').waitFor({state: 'hidden', timeout: 20_000})
}

async function buttonColor(page) {
  return preview(page).getByRole('button', {name: 'Get started', exact: true})
    .evaluate(element => getComputedStyle(element).backgroundColor)
}

async function buttonStyle(page, property) {
  return preview(page).getByRole('button', {name: 'Get started', exact: true})
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property)
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    root: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  assert.ok(
    dimensions.root <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1,
    `${label} overflows horizontally: ${JSON.stringify(dimensions)}`,
  )
  record(`${label}: no document horizontal overflow`, dimensions)
}

async function selectEditorTab(page, name) {
  const tab = page.locator('.pg-theme-pane').getByRole('button', {name})
  await tab.click()
  assert.equal(await tab.getAttribute('aria-current'), 'true')
}

async function findThemeConfirmation(page) {
  const confirmation = page.getByRole('dialog').filter({hasText: /unsaved|discard|未保存|丢失|放弃/i})
    .or(page.getByRole('alert').filter({hasText: /unsaved|discard|未保存|丢失|放弃/i}))
  await confirmation.waitFor({state: 'visible'})
  return confirmation
}

async function requestDifferentTheme(page) {
  await page.getByRole('button', {name: 'Themes', exact: true}).click()
  const menu = page.locator('.pg-theme-dropdown')
  await menu.waitFor({state: 'visible'})
  const choices = menu.getByRole('button')
  assert.ok(await choices.count() >= 2, 'Theme menu must contain more than one preset')
  await choices.last().click()
}

try {
  const {page} = await createPage({width: 1440, height: 1000})
  await openTemplates(page)
  await waitForPreview(page)
  await page.screenshot({path: resolve(outputDirectory, 'desktop-code.png')})
  await page.getByRole('button', {name: 'Theme Editor', exact: true}).click()

  await selectEditorTab(page, /^(?:Theme|Base Styles)$/)
  await page.getByRole('combobox', {name: 'Heading Font', exact: true}).waitFor({state: 'visible'})
  await page.getByRole('combobox', {name: 'Body Font', exact: true}).waitFor({state: 'visible'})
  const spacing = page.getByRole('spinbutton', {name: 'Spacing', exact: true})
  await spacing.fill('6')
  await spacing.press('Tab')
  await waitUntil(async () => await buttonStyle(page, '--spacing-1') === '0.375rem', 'Spacing scale reaches live preview')
  await spacing.fill('4')
  await spacing.press('Tab')
  await waitUntil(async () => await buttonStyle(page, '--spacing-1') === '0.25rem', 'Spacing scale restores to 4px')
  await page.screenshot({path: resolve(outputDirectory, 'desktop-base-styles.png')})
  record('Theme Editor rail, Base Styles controls and numeric spacing update')

  await selectEditorTab(page, /^Components$/)
  await page.getByLabel('CSS property (camelCase)', {exact: true}).waitFor({state: 'visible'})
  await page.getByLabel('CSS value', {exact: true}).waitFor({state: 'visible'})
  const originalRadius = await buttonStyle(page, 'border-radius')
  await page.getByLabel('CSS property (camelCase)', {exact: true}).fill('borderRadius')
  await page.getByLabel('CSS value', {exact: true}).fill('13px')
  await page.getByRole('button', {name: 'Add Override', exact: true}).click()
  await waitUntil(async () => await buttonStyle(page, 'border-radius') === '13px', 'Custom override reaches iframe')
  await page.screenshot({path: resolve(outputDirectory, 'desktop-components.png')})
  await page.getByRole('button', {name: 'Remove', exact: true}).click()
  await waitUntil(async () => await buttonStyle(page, 'border-radius') === originalRadius, 'Removing override restores preset')
  record('Components tab adds and removes a live custom button override')

  await selectEditorTab(page, /^(?:Tokens|Advanced)$/)
  const accentInput = page.getByRole('textbox', {name: '--color-accent', exact: true})
  await accentInput.fill('#C92B4B 100%')
  await accentInput.press('Tab')
  await waitUntil(async () => await buttonColor(page) === targetColor, 'Edited accent reaches sandbox computed style')
  await page.screenshot({path: resolve(outputDirectory, 'desktop-live-accent.png')})
  record('Advanced color edit changes the iframe primary-button computed style', {color: await buttonColor(page)})

  const beforeToggle = await buttonColor(page)
  await page.locator('.pg-preview-controls').getByRole('button', {name: 'Toggle theme', exact: true}).click()
  await waitForPreview(page)
  const darkColor = await buttonColor(page)
  assert.notEqual(darkColor, beforeToggle, 'Editing the light branch must not replace the dark branch')
  await page.locator('.pg-preview-controls').getByRole('button', {name: 'Toggle theme', exact: true}).click()
  await waitUntil(async () => await buttonColor(page) === targetColor, 'Light branch survives dark mode toggle')
  record('Light/dark color branches remain independent', {light: beforeToggle, dark: darkColor})

  await requestDifferentTheme(page)
  const cancelledConfirmation = await findThemeConfirmation(page)
  await cancelledConfirmation.getByRole('button', {name: /^(?:Cancel|取消)$/i}).click()
  assert.equal(await buttonColor(page), targetColor)
  record('Cancelling preset replacement retains custom edits')

  const exportButton = page.locator('.pg-preview-controls').getByRole('button', {name: /Export/i})
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const downloadedPath = await download.path()
  assert.ok(downloadedPath, 'Theme export must create a readable local download')
  const exportedSource = await readFile(downloadedPath, 'utf8')
  assert.match(exportedSource, /defineTheme/)
  assert.match(exportedSource, /--color-accent/)
  assert.match(exportedSource, /C92B4B/i)
  record('Theme export contains live token edits', {filename: download.suggestedFilename()})

  await requestDifferentTheme(page)
  const acceptedConfirmation = await findThemeConfirmation(page)
  await acceptedConfirmation.getByRole('button', {name: /discard|switch|放弃|切换/i}).click()
  await waitUntil(async () => await buttonColor(page) !== targetColor, 'Confirmed preset replaces custom edits')
  record('Confirmed preset replacement clears custom edits')
  await selectEditorTab(page, /^(?:Theme|Base Styles)$/)
  const resetBefore = await buttonStyle(page, '--spacing-1')
  const resetSpacing = page.getByRole('spinbutton', {name: 'Spacing', exact: true})
  await resetSpacing.fill('7')
  await resetSpacing.press('Tab')
  await waitUntil(async () => await buttonStyle(page, '--spacing-1') === '0.4375rem', 'Preset spacing can be edited again')
  await page.getByRole('button', {name: 'Reset theme', exact: true}).click()
  const resetConfirmation = await findThemeConfirmation(page)
  await resetConfirmation.getByRole('button', {name: /discard|switch|放弃|切换/i}).click()
  await waitUntil(async () => await buttonStyle(page, '--spacing-1') === resetBefore, 'Reset restores the same preset')
  record('Reset remounts the current preset and restores its original values')
  await assertNoOverflow(page, 'Desktop 1440px')

  const {page: mobile} = await createPage({width: 390, height: 844})
  await openTemplates(mobile)
  await mobile.locator('.pg-mobile-tabs').getByRole('button', {name: 'Theme', exact: true}).click()
  await selectEditorTab(mobile, /^(?:Tokens|Advanced)$/)
  const mobileAccent = mobile.getByRole('textbox', {name: '--color-accent', exact: true})
  await mobileAccent.fill('#C92B4B 100%')
  await mobileAccent.press('Tab')
  await mobile.screenshot({path: resolve(outputDirectory, 'mobile-theme.png')})
  await assertNoOverflow(mobile, 'Mobile Theme 390px')
  await mobile.locator('.pg-mobile-tabs').getByRole('button', {name: 'Preview', exact: true}).click()
  await waitForPreview(mobile)
  await waitUntil(async () => await buttonColor(mobile) === targetColor, 'Mobile theme edit reaches preview')
  await mobile.screenshot({path: resolve(outputDirectory, 'mobile-preview.png')})
  await assertNoOverflow(mobile, 'Mobile Preview 390px')
  record('Mobile Theme/Preview switching retains live edits')

  const {page: recovering} = await createPage({width: 1280, height: 900})
  let injectError = true
  await recovering.route(url => url.searchParams.get('preview') === '1', async route => {
    if (!injectError) {
      await route.continue()
      return
    }
    injectError = false
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><script>
window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'mybot-preview-connect') return;
  const port = event.ports[0];
  port.onmessage = () => port.postMessage({
    type: 'mybot-preview-error',
    error: 'Injected offline preview failure',
    phase: 'runtime'
  });
  port.postMessage({type: 'mybot-preview-ready'});
});
parent.postMessage({
  type: 'mybot-preview-hello',
  nonce: new URLSearchParams(location.hash.slice(1)).get('mybot-preview-nonce')
}, '*');
</script></body></html>`,
    })
  })
  await openTemplates(recovering)
  await recovering.getByRole('alert').filter({hasText: 'Injected offline preview failure'}).waitFor()
  await recovering.getByRole('button', {name: /^(?:Retry preview|Rebuild preview|Retry|重试|重新构建)$/i}).click()
  await waitForPreview(recovering)
  await recovering.screenshot({path: resolve(outputDirectory, 'desktop-recovered-preview.png')})
  record('Preview runtime error is visible and retry establishes a new working frame')

  evidence.result = 'passed'
} catch (error) {
  evidence.result = 'failed'
  evidence.error = error instanceof Error ? error.stack : String(error)
  console.error(evidence.error)
  for (const [index, context] of contexts.entries()) {
    const page = context.pages()[0]
    if (page && !page.isClosed()) {
      await page.screenshot({path: resolve(outputDirectory, `failure-${index}.png`)}).catch(() => {})
    }
  }
  process.exitCode = 1
} finally {
  await writeFile(resolve(outputDirectory, 'verification.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
  console.log(`Evidence: ${outputDirectory}`)
}
