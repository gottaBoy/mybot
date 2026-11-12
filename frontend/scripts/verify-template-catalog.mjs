import assert from 'node:assert/strict'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const frontendDirectory = resolve(scriptDirectory, '..')
const manifest = JSON.parse(await readFile(resolve(frontendDirectory, 'src/templates/generated/manifest.json'), 'utf8'))
const selectedIds = process.env.TEMPLATE_IDS?.split(',').map(value => value.trim()).filter(Boolean)
const templates = selectedIds ? manifest.filter(item => selectedIds.includes(item.id)) : manifest
assert.ok(templates.length > 0, 'No catalog templates selected')
if (selectedIds) assert.equal(templates.length, new Set(selectedIds).size, 'Unknown or duplicated requested template id')

const baseUrl = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5186/'
const baseOrigin = new URL(baseUrl).origin
const outputDirectory = resolve(process.env.CATALOG_EVIDENCE_DIR ?? '/tmp/mybot-template-catalog-verification')
const moduleName = process.env.PLAYWRIGHT_MODULE ?? 'playwright'
const moduleUrl = moduleName.startsWith('/') || moduleName.startsWith('.')
  ? pathToFileURL(resolve(moduleName)).href
  : moduleName
const {chromium} = await import(moduleUrl)
const evidence = {
  baseUrl,
  scope: 'Production smoke of allowlisted generated templates; not arbitrary TSX execution or business integration',
  manifestCount: manifest.length,
  selectedCount: templates.length,
  viewport: {width: 1440, height: 1000},
  results: [],
}
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
})
await mkdir(outputDirectory, {recursive: true})

async function inspectPreview(page, id) {
  const frame = page.frameLocator('iframe[title="Isolated local template preview"]')
  const root = frame.locator(`main[data-template-id="${id}"]`)
  await root.waitFor({state: 'visible', timeout: 20_000})
  await page.locator('.pg-sandbox-status').waitFor({state: 'hidden', timeout: 20_000})
  const contents = await root.evaluate(element => {
    const box = element.getBoundingClientRect()
    const visible = Array.from(element.querySelectorAll('*')).filter(child => {
      const childBox = child.getBoundingClientRect()
      const style = getComputedStyle(child)
      return childBox.width > 0 && childBox.height > 0 &&
        childBox.bottom > 0 && childBox.right > 0 &&
        childBox.top < innerHeight && childBox.left < innerWidth &&
        style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
    })
    const images = Array.from(element.querySelectorAll('img')).map(image => ({
      src: image.currentSrc || image.src,
      complete: image.complete,
      loaded: image.complete && image.naturalWidth > 0,
    }))
    return {
      id: element.getAttribute('data-template-id'),
      text: element.innerText.replace(/\s+/g, ' ').trim().slice(0, 180),
      textLength: element.innerText.trim().length,
      width: Math.round(box.width),
      height: Math.round(box.height),
      visibleElementCount: visible.length,
      images,
    }
  })
  assert.equal(contents.id, id)
  assert.ok(contents.width > 0 && contents.height > 0, 'Preview root must have nonzero dimensions')
  assert.ok(contents.visibleElementCount > 0, 'Preview must contain visible child elements')
  assert.ok(contents.textLength >= 2, 'Preview must contain nonempty rendered content')
  const frameErrors = await root.getByRole('alert').allTextContents()
  assert.ok(!frameErrors.some(text => /Preview failed:/i.test(text)), `Runtime error: ${frameErrors.join('; ')}`)
  const iframe = page.locator('iframe[title="Isolated local template preview"]')
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts', 'Production preview must use an opaque sandbox')
  assert.equal(await page.locator('script[src*="@vite/client"]').count(), 0, 'Catalog smoke requires a production build')
  return contents
}

try {
  for (const item of templates) {
    const started = Date.now()
    const context = await browser.newContext({viewport: evidence.viewport, reducedMotion: 'reduce'})
    const page = await context.newPage()
    const result = {
      id: item.id,
      name: item.name,
      upstreamReady: item.isReady,
      pageErrors: [],
      blockedBusinessRequests: [],
      blockedExternalRequests: [],
      devRequests: [],
      webSockets: [],
    }
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('/@vite/client') || url.pathname.includes('/@react-refresh')) {
        result.devRequests.push(url.pathname)
      }
      if (url.pathname.startsWith('/api/')) {
        result.blockedBusinessRequests.push(url.pathname)
        await route.abort('blockedbyclient')
      } else if (url.protocol.startsWith('http') && url.origin !== baseOrigin) {
        result.blockedExternalRequests.push(url.href)
        await route.abort('blockedbyclient')
      } else {
        await route.continue()
      }
    })
    page.on('pageerror', error => result.pageErrors.push(error.message))
    page.on('websocket', socket => result.webSockets.push(socket.url()))
    try {
      const url = new URL(baseUrl)
      url.hash = `templates?${new URLSearchParams({template: item.id})}`
      await page.goto(url.href, {waitUntil: 'domcontentloaded'})
      await page.locator('.pg-root').waitFor({state: 'visible'})
      result.preview = await inspectPreview(page, item.id)
      await page.screenshot({path: resolve(outputDirectory, `${item.id}.png`)})
      assert.deepEqual(result.pageErrors, [], 'No uncaught page/iframe exceptions')
      assert.deepEqual(result.blockedBusinessRequests, [], 'Template preview must not request business APIs')
      assert.deepEqual(result.devRequests, [], 'Production smoke must not load Vite development runtime')
      assert.deepEqual(result.webSockets, [], 'Production smoke must not rely on HMR WebSockets')
      result.result = 'passed'
      console.log(`PASS ${item.id}: ${result.preview.visibleElementCount} visible elements`)
    } catch (error) {
      result.result = 'failed'
      result.error = error instanceof Error ? error.stack : String(error)
      console.error(`FAIL ${item.id}: ${result.error}`)
      await page.screenshot({path: resolve(outputDirectory, `${item.id}-failed.png`)}).catch(() => {})
    } finally {
      result.durationMs = Date.now() - started
      evidence.results.push(result)
      await context.close()
      await writeFile(resolve(outputDirectory, 'verification.json'), `${JSON.stringify(evidence, null, 2)}\n`)
    }
  }
} finally {
  evidence.passed = evidence.results.filter(item => item.result === 'passed').length
  evidence.failed = evidence.results.filter(item => item.result === 'failed').length
  evidence.result = evidence.failed === 0 && evidence.results.length === templates.length ? 'passed' : 'failed'
  evidence.unloadedImageCount = evidence.results.reduce(
    (total, item) => total + (item.preview?.images.filter(image => !image.loaded).length ?? 0),
    0,
  )
  await writeFile(resolve(outputDirectory, 'verification.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  await browser.close()
  console.log(`${evidence.passed}/${templates.length} templates passed; ${evidence.failed} failed`)
  console.log(`Unloaded image elements (not counted as rendered assets): ${evidence.unloadedImageCount}`)
  console.log(`Evidence: ${outputDirectory}`)
  if (evidence.result !== 'passed') process.exitCode = 1
}
