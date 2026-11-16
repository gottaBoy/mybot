import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1', 'Explicit synthetic opt-in is required')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
const out = resolve(process.env.NAVIGATION_EVIDENCE_DIR ?? '/tmp/mybot-navigation-history')
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
  : 'playwright')
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const evidence = {
  synthetic: true, base, backendMutation: false,
  scenarioFilter: process.env.NAVIGATION_SCENARIO ?? null,
  checks: [], screenshots: [], requests: [], errors: [], scenarios: [],
}
await mkdir(out, { recursive: true })
let activePage
function record(name) {
  evidence.checks.push({ name, passed: true })
  console.log(`PASS ${name}`)
}
async function poll(check, description) {
  for (let index = 0; index < 100; index++) {
    if (await check()) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  throw new Error(`Timed out: ${description}`)
}
async function snapshot(page) {
  return page.evaluate(() => {
    const nativeSupported = typeof window.navigation?.traverseTo === 'function'
    return {
      href: location.href, length: history.length,
      stamp: history.state?.__mybotNavigation ?? null,
      nativeSupported,
      nativeKey: nativeSupported ? window.navigation.currentEntry.key : null,
      nativeStamp: nativeSupported
        ? window.navigation.currentEntry.getState()?.__mybotNavigation ?? null
        : null,
    }
  })
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(out, `${name}.png`), fullPage: false })
  evidence.screenshots.push(`${name}.png`)
}
function projectForm(page) {
  return page.locator('.wb-dialog').filter({
    has: page.locator('.wb-dialog-head h2').filter({ hasText: /^Create project$/ }),
  })
}
function discardDialog(page) {
  return page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })
}
async function choose(page, choice) {
  const dialog = discardDialog(page)
  await dialog.waitFor()
  await dialog.locator('.wb-form-actions').getByRole('button', {
    name: choice === 'keep' ? 'Keep editing' : 'Discard changes', exact: true,
  }).click()
  await dialog.waitFor({ state: 'hidden' })
}
async function waitOrigin(page, entry) {
  await poll(async () => {
    const current = await snapshot(page)
    return current.href === entry.href && current.stamp?.key === entry.stamp?.key
  }, `restore ${entry.href}`)
}
async function nav(page, name, heading) {
  await page.locator('.wb-nav').getByRole('link', { name, exact: true }).click()
  await page.getByRole('heading', { name: heading, exact: true }).waitFor()
  return snapshot(page)
}
async function seed(page, queries = false) {
  const entries = [await snapshot(page)]
  entries.push(await nav(page, 'Overview', 'Workspace overview'))
  entries.push(await nav(page, 'Projects', 'Projects'))
  entries.push(await nav(page, 'Models & resources', 'Models & resources'))
  entries.push(await nav(page, 'Workbench', 'Tasks'))
  if (queries) {
    for (const value of ['alpha', 'beta']) {
      await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(value)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await poll(async () => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '').get('q') === value, `commit ${value}`)
      entries.push(await snapshot(page))
    }
  }
  await page.evaluate(() => { window.__historyEvents.length = 0 })
  for (const entry of entries)
    if (entry.nativeSupported) assert.deepEqual(entry.nativeStamp, entry.stamp)
  return entries
}
async function draft(page, value) {
  await page.locator('.wb-sidebar').getByRole('button', {
    name: 'Create project', exact: true,
  }).click()
  const form = projectForm(page)
  await form.waitFor()
  await form.getByLabel(/Project name/).fill(value)
  return form
}
async function fixture(name, run) {
  if (process.env.NAVIGATION_SCENARIO && process.env.NAVIGATION_SCENARIO !== name) return
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
  })
  await context.addInitScript(() => {
    localStorage.setItem('mybot.locale', 'en')
    localStorage.setItem('mybot.style', 'neutral')
    localStorage.setItem('mybot.mode', 'light')
    window.__historyEvents = []
    window.addEventListener('mybot:navigation', () => {
      window.__historyEvents.push({
        href: location.href, stamp: history.state?.__mybotNavigation ?? null,
      })
    })
    window.addEventListener('popstate', () => {
      if (!window.__interleaveBack) return
      window.__interleaveBack = false
      history.back()
    }, true)
  })
  const project = { id: 'history-project', name: 'Synthetic history project', goal: '', directory: '.', notes: 'Synthetic only' }
  const data = {
    projects: [project],
    tasks: [{ id: 'history-task', project_id: project.id, title: 'alpha task', goal: 'Synthetic read-only history task', acceptance: '', files: [] }],
    runs: [], models: [], backends: [], default_model_id: '', local_harnesses: [],
    workspace: '/tmp/mybot-navigation-synthetic', capabilities: { backend_sync: false },
  }
  let authenticated = true
  let saveMode = 'reject'
  let releaseSave
  let postCount = 0
  const requests = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const item = { method: request.method(), path: url.pathname }
    requests.push(item)
    evidence.requests.push({ scenario: name, ...item })
    if (url.pathname === '/api/auth/state' && request.method() === 'GET')
      return route.fulfill({ status: 200, json: { authenticated, required: true } })
    if (url.pathname === '/api/bootstrap' && request.method() === 'GET')
      return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? data : { detail: 'unauthorized' } })
    if (url.pathname === '/api/projects' && request.method() === 'POST') {
      postCount++
      const body = request.postDataJSON()
      const mode = saveMode
      if (mode.startsWith('defer-'))
        await new Promise((resolveSave) => { releaseSave = resolveSave })
      if (mode === 'defer-unauthorized') {
        authenticated = false
        return route.fulfill({ status: 401, json: { detail: 'unauthorized' } })
      }
      if (mode === 'defer-success') {
        const saved = { ...project, ...body, id: 'history-saved-project' }
        data.projects.push(saved)
        return route.fulfill({ status: 201, json: saved })
      }
      return route.fulfill({
        status: 422,
        json: { detail: [{ loc: ['body', 'name'], msg: 'Synthetic rejected save', type: 'value_error' }] },
      })
    }
    if (url.pathname === '/api/tasks/history-task/preview' && request.method() === 'POST')
      return route.fulfill({
        status: 200,
        json: { context_hash: 'a'.repeat(64), goal: data.tasks[0].goal, acceptance: '', notes: project.notes, text: 'Synthetic context', bytes: 17, evidence: [] },
      })
    throw new Error(`Unexpected synthetic API request: ${request.method()} ${url.pathname}`)
  })
  const page = await context.newPage()
  activePage = page
  page.on('pageerror', (error) => evidence.errors.push({ scenario: name, message: error.message, stack: error.stack }))
  const scenario = { name, passed: false }
  evidence.scenarios.push(scenario)
  try {
    await page.goto(`${base}#workbench`)
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
    assert.ok((await snapshot(page)).stamp)
    await run(page, {
      save(mode) { saveMode = mode },
      async release() {
        await poll(() => !!releaseSave, 'deferred synthetic save')
        releaseSave()
        releaseSave = undefined
      },
      postCount: () => postCount,
    })
    assert.equal(requests.some((item) => item.path.includes('/models/') || item.path.endsWith('/runs')), false)
    scenario.passed = true
  } catch (error) {
    scenario.failure = { message: error.message, stack: error.stack }
    scenario.lastLocation = await snapshot(page).catch(() => null)
    scenario.navigationEvents = await page.evaluate(() => window.__historyEvents).catch(() => [])
    await shot(page, `${name}-failure`)
    throw error
  } finally {
    await context.close()
    activePage = undefined
  }
}

try {
  await fixture('back-query', async (page) => {
    const entries = await seed(page, true)
    const origin = entries.at(-1)
    const target = entries.at(-2)
    const form = await draft(page, 'Back draft remains')
    await page.goBack()
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await shot(page, 'back-discard-prompt')
    await choose(page, 'keep')
    assert.equal(await form.getByLabel(/Project name/).inputValue(), 'Back draft remains')
    assert.equal((await snapshot(page)).length, origin.length)
    assert.deepEqual(await page.evaluate(() => window.__historyEvents), [])
    await page.goBack()
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await choose(page, 'discard')
    await poll(async () => (await snapshot(page)).stamp?.key === target.stamp.key, 'confirmed Back target')
    assert.equal(page.url(), target.href)
    assert.equal(await page.getByRole('searchbox', { name: 'Search', exact: true }).inputValue(), 'alpha')
    await page.goForward()
    await waitOrigin(page, origin)
    assert.equal(await page.getByRole('searchbox', { name: 'Search', exact: true }).inputValue(), 'beta')
    await shot(page, 'back-forward-query-restored')
    record('Back cancel preserves the original entry and draft; discard reaches the real query target and Forward returns to its unchanged successor')
  })

  await fixture('consecutive-pop', async (page) => {
    const entries = await seed(page, true)
    const origin = entries.at(-1)
    const target = entries.find((entry) => entry.stamp.index === origin.stamp.index - 4)
    await draft(page, 'Consecutive Back draft')
    await page.evaluate(() => history.back())
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    const prompt = await discardDialog(page).elementHandle()
    await page.evaluate(() => history.back())
    await waitOrigin(page, origin)
    await page.evaluate(() => history.go(-2))
    await waitOrigin(page, origin)
    assert.equal(await discardDialog(page).count(), 1)
    assert.equal(await discardDialog(page).evaluate((element, original) => element === original, prompt), true)
    assert.deepEqual(await page.evaluate(() => window.__historyEvents), [])
    await choose(page, 'discard')
    await poll(async () => (await snapshot(page)).stamp?.key === target.stamp.key, 'cumulative Back target')
    assert.equal(page.url(), target.href)
    await page.evaluate(() => history.go(4))
    await waitOrigin(page, origin)
    assert.equal((await snapshot(page)).length, origin.length)
    await shot(page, 'consecutive-multistep-restored')
    record('Consecutive Back and multi-step pop retain all requested steps behind one dialog without rewriting the traversed entries')
  })

  await fixture('forward', async (page) => {
    const entries = await seed(page)
    const origin = entries.find((entry) => entry.stamp.index === 2)
    const target = entries.at(-1)
    await page.evaluate(() => history.go(-2))
    await waitOrigin(page, origin)
    const form = await draft(page, 'Forward draft remains')
    await page.goForward()
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await choose(page, 'keep')
    assert.equal(await form.getByLabel(/Project name/).inputValue(), 'Forward draft remains')
    await page.goForward()
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await page.goForward()
    await waitOrigin(page, origin)
    await choose(page, 'discard')
    await waitOrigin(page, target)
    await shot(page, 'forward-confirmed-target')
    record('Forward cancel and consecutive Forward preserve direction, history identity and cumulative distance')
  })

  await fixture('rapid-native-pop', async (page) => {
    const entries = await seed(page, true)
    const origin = entries.at(-1)
    assert.equal(origin.nativeSupported, true, 'This stress scenario requires absolute native traversal support')
    const target = entries.at(-3)
    await draft(page, 'Interleaved native traversal draft')
    await page.evaluate(() => {
      window.__interleaveBack = true
      history.back()
    })
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await choose(page, 'discard')
    await waitOrigin(page, target)
    await shot(page, 'interleaved-native-pop-target')
    record('A second native Back queued during pop dispatch preserves both steps and settles at the real target')
  })

  await fixture('managed-reload', async (page) => {
    const entries = await seed(page, true)
    const origin = entries.at(-1)
    const target = entries.at(-3)
    await page.reload()
    await page.getByRole('heading', { name: 'Tasks', exact: true }).waitFor()
    await waitOrigin(page, origin)
    const reloaded = await snapshot(page)
    assert.equal(reloaded.nativeKey, origin.nativeKey)
    assert.deepEqual(reloaded.nativeStamp, reloaded.stamp)
    await draft(page, 'Reloaded managed-entry draft')
    await page.goBack()
    await discardDialog(page).waitFor()
    await waitOrigin(page, origin)
    await page.goBack()
    await waitOrigin(page, origin)
    await choose(page, 'discard')
    await waitOrigin(page, target)
    await page.evaluate(() => history.go(2))
    await waitOrigin(page, origin)
    await shot(page, 'managed-entry-reload-traversal')
    record('Reload retains managed entry identity and range, so subsequent guarded traversal reaches its existing targets without rebuilding history')
  })

  await fixture('ordinary-link', async (page, state) => {
    await seed(page)
    const origin = await snapshot(page)
    await page.getByRole('table', { name: 'Tasks', exact: true })
      .getByRole('button', { name: 'alpha task', exact: true }).click()
    await page.locator('.wf-inspector').getByRole('button', { name: 'Review & run', exact: true }).click()
    const wizard = page.getByRole('dialog', { name: 'Review context & resources', exact: true })
    await wizard.getByRole('button', { name: 'Next', exact: true }).click()
    await wizard.getByRole('spinbutton', { name: 'Call budget', exact: true }).fill('5')
    await wizard.getByRole('spinbutton', { name: 'Call budget', exact: true }).blur()
    await wizard.getByRole('link', { name: 'Open model settings', exact: true }).click()
    await discardDialog(page).waitFor()
    assert.equal(page.url(), origin.href)
    await choose(page, 'keep')
    assert.equal(await wizard.getByRole('spinbutton', { name: 'Call budget', exact: true }).inputValue(), '5')
    await wizard.getByRole('link', { name: 'Open model settings', exact: true }).click()
    await choose(page, 'discard')
    await page.getByRole('heading', { name: 'Models & resources', exact: true }).waitFor()
    assert.equal(state.postCount(), 0)
    await page.goBack()
    await waitOrigin(page, origin)
    record('An ordinary form link is admitted before push: Keep leaves URL/history untouched and Discard performs exactly one real navigation')
  })

  await fixture('busy-intent', async (page, state) => {
    const entries = await seed(page)
    const origin = entries.at(-1)
    const target = entries.at(-2)
    const form = await draft(page, 'Deferred failure draft')
    state.save('defer-reject')
    await form.getByRole('button', { name: 'Save', exact: true }).click()
    await poll(() => state.postCount() === 1, 'first synthetic save started')
    await page.goBack()
    await waitOrigin(page, origin)
    assert.equal(await discardDialog(page).count(), 0)
    await state.release()
    await discardDialog(page).waitFor()
    await choose(page, 'keep')
    assert.equal(await form.getByLabel(/Project name/).inputValue(), 'Deferred failure draft')
    await form.locator('p.wb-error[role="alert"]').waitFor()
    state.save('defer-success')
    await form.getByLabel(/Project name/).fill('Deferred successful draft')
    await form.getByRole('button', { name: 'Save', exact: true }).click()
    await poll(() => state.postCount() === 2, 'second synthetic save started')
    await page.goBack()
    await waitOrigin(page, origin)
    await state.release()
    await poll(async () => (await snapshot(page)).stamp?.key === target.stamp.key, 'busy success retains the queued Back')
    assert.equal(page.url(), target.href)
    assert.equal(await discardDialog(page).count(), 0)
    assert.equal(state.postCount(), 2)
    await shot(page, 'busy-success-retained-intent')
    record('Busy navigation is retained: rejected saves prompt after settling; successful saves finish the original queued traversal without resubmission')
  })

  await fixture('authorization-priority', async (page, state) => {
    const entries = await seed(page)
    const origin = entries.at(-1)
    const form = await draft(page, 'Private draft must clear')
    state.save('defer-unauthorized')
    await form.getByRole('button', { name: 'Save', exact: true }).click()
    await poll(() => state.postCount() === 1, 'unauthorized synthetic save started')
    await page.goBack()
    await waitOrigin(page, origin)
    await state.release()
    await page.getByRole('heading', { name: 'Sign in to workspace', exact: true }).waitFor()
    assert.equal(await discardDialog(page).count(), 0)
    assert.equal(await page.getByText('Private draft must clear', { exact: true }).count(), 0)
    assert.deepEqual(await page.evaluate(() => window.__historyEvents), [])
    await shot(page, 'authorization-clears-pending-navigation')
    record('401 cleanup wins over busy/dirty protection, clears private projections and never replays the pending destination')
  })

  await fixture('unmanaged-boundary', async (page) => {
    await seed(page)
    const form = await draft(page, 'Unmanaged boundary draft')
    await page.evaluate(() => {
      history.pushState({ foreign: 'unchanged' }, '', '#unmanaged')
      window.dispatchEvent(new Event('mybot:list-location'))
    })
    await discardDialog(page).waitFor()
    await discardDialog(page).getByText(/unmanaged history entry/).waitFor()
    await choose(page, 'keep')
    assert.deepEqual(await page.evaluate(() => history.state), { foreign: 'unchanged' })
    assert.equal(new URL(page.url()).hash, '#unmanaged')
    assert.equal(await form.getByLabel(/Project name/).inputValue(), 'Unmanaged boundary draft')
    const unload = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    assert.equal(unload, true)
    await shot(page, 'unmanaged-entry-fail-closed')
    record('Unmanaged history is explicitly fail-closed without forged indices or rewritten entries; beforeunload requests native protection only')
  })
  assert.ok(evidence.scenarios.length)
  assert.deepEqual(evidence.errors, [])
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack }
  if (activePage) await shot(activePage, 'failure').catch(() => {})
  throw error
} finally {
  await writeFile(resolve(out, 'verification.json'), JSON.stringify(evidence, null, 2))
  await browser.close()
}
