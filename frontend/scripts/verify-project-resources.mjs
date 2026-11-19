import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
const out = resolve(
  process.env.PROJECT_RESOURCES_EVIDENCE_DIR ?? '/tmp/mybot-project-resources',
)
const { chromium } = await import(
  pathToFileURL(
    process.env.PLAYWRIGHT_MODULE ??
      '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
  ).href
)
await mkdir(out, { recursive: true })
const projects = Array.from({ length: 45 }, (_, index) => ({
  id: `resource-project-${String(index).padStart(3, '0')}`,
  name: `Resource project ${String(index).padStart(3, '0')}`,
  goal:
    index === 43
      ? 'Long localized project objective 项目研发协作与多端任务交接验证 '.repeat(
          4,
        )
      : `Actual project objective ${index}`,
  directory: '.',
  notes: `Detail-only project notes ${index}`,
})).reverse()
function projectPage(url) {
  const query = (url.searchParams.get('q') ?? '').trim()
  const requestedPage = Number(url.searchParams.get('page') ?? 1)
  const pageSize = Number(url.searchParams.get('page_size') ?? 20)
  const matches =
    query === 'authority'
      ? projects.slice(-1)
      : projects.filter((p) =>
          `${p.id} ${p.name}`.toLowerCase().includes(query.toLowerCase()),
        )
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'project_query',
    query,
    requested_page: requestedPage,
    page,
    page_size: pageSize,
    total: matches.length,
    total_pages: totalPages,
    has_more: page < totalPages,
    order: 'projects-created-v1',
    items: matches
      .slice((page - 1) * pageSize, page * pageSize)
      .map(({ notes, ...project }) => ({
        project,
        task_count: project.id.endsWith('000') ? 2 : 1,
        run_count: project.id.endsWith('000') ? 45 : 0,
      })),
  }
}
function referencePage(url, empty = false) {
  const selectedIds = JSON.parse(url.searchParams.get('selected') ?? '[]')
  const page = projectPage(url)
  const match = empty ? [] : page.items
  return {
    ...page,
    unit: 'project_references',
    ...(empty ? { total: 0, page: 1, total_pages: 1, has_more: false } : {}),
    totals: empty
      ? { projects: 0, tasks: 0, runs: 0 }
      : { projects: 45, tasks: 46, runs: 45 },
    selected_ids: selectedIds,
    selected: empty
      ? []
      : selectedIds.flatMap((id) => {
          const project = projects.find((p) => p.id === id)
          return project
            ? [
                {
                  project: { id: project.id, name: project.name },
                  task_count: id.endsWith('000') ? 2 : 1,
                  run_count: id.endsWith('000') ? 45 : 0,
                },
              ]
            : []
        }),
    missing_ids: selectedIds.filter(
      (id) => empty || !projects.some((p) => p.id === id),
    ),
    items: match.map((item) => ({
      ...item,
      project: { id: item.project.id, name: item.project.name },
    })),
  }
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
const report = {
  synthetic: true,
  checks: [],
  requests: [],
  writes: [],
  errors: [],
  screenshots: [],
  geometry: [],
}
let failurePage
try {
  for (const [name, width, locale, style, mode, themeOnly] of [
    ['desktop', 1440, 'en', 'neutral', 'light'],
    ['mobile', 390, 'zh', 'zira', 'dark'],
    ['neutral-dark', 1440, 'en', 'neutral', 'dark', true],
    ['zira-light', 1440, 'en', 'zira', 'light', true],
    ['y2k-light', 1440, 'en', 'y2k', 'light', true],
    ['y2k-dark', 1440, 'en', 'y2k', 'dark', true],
  ]) {
    let cap = true,
      queryStatus = 0,
      detailStatus = 0,
      referenceStatus = 0
    let malformed = false,
      holdDetail,
      holdQuery,
      holdValidation = false,
      emptyProjects = false
    const releases = []
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: 'reduce',
    })
    await context.addInitScript(
      ({ locale, style, mode }) => {
        localStorage.setItem('mybot.locale', locale)
        localStorage.setItem('mybot.style', style)
        localStorage.setItem('mybot.mode', mode)
      },
      { locale, style, mode },
    )
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin)
        return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      report.requests.push({
        name,
        path: url.pathname,
        search: url.search,
        method: request.method(),
      })
      if (request.method() !== 'GET') {
        report.writes.push({
          name,
          path: url.pathname,
          body: request.postDataJSON(),
        })
        if (url.pathname === '/api/tasks')
          return route.fulfill({
            status: 422,
            json: {
              detail: [
                { loc: ['body', 'title'], msg: 'Synthetic task rejection' },
              ],
            },
          })
        return route.fulfill({ status: 405, json: {} })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({ json: { authenticated: true, required: false } })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          json: {
            projects: cap ? [] : [{ ...projects[0], name: 'Legacy project' }],
            tasks: [],
            runs: [],
            models: [],
            backends: [],
            local_harnesses: [],
            workspace: '/synthetic/project-resources',
            default_model_id: '',
            capabilities: {
              backend_sync: false,
              project_query: cap,
              project_detail: cap,
              project_references: cap,
            },
          },
        })
      if (url.pathname === '/api/projects/query') {
        if (holdQuery === url.searchParams.get('q'))
          await new Promise((done) => releases.push(done))
        if (queryStatus)
          return route.fulfill({
            status: queryStatus,
            json: { detail: 'fixture read failure' },
          })
        if (malformed) return route.fulfill({ json: { items: [], total: 0 } })
        return route.fulfill({ json: projectPage(url) })
      }
      if (/^\/api\/projects\/[^/]+\/detail$/.test(url.pathname)) {
        const id = decodeURIComponent(url.pathname.split('/')[3])
        if (holdDetail === id) await new Promise((done) => releases.push(done))
        if (detailStatus === 401)
          return route.fulfill({
            status: 401,
            contentType: 'text/html',
            body: 'expired',
          })
        if (detailStatus)
          return route.fulfill({
            status: detailStatus,
            json: { detail: 'fixture read failure' },
          })
        const project = projects.find((p) => p.id === id)
        if (!project)
          return route.fulfill({
            status: 404,
            json: { detail: { code: 'project_detail_unavailable' } },
          })
        if (malformed) return route.fulfill({ json: { project: { id } } })
        return route.fulfill({
          json: {
            schema_version: 1,
            unit: 'project_detail',
            project,
            task_count: id.endsWith('000') ? 2 : 1,
            run_count: id.endsWith('000') ? 45 : 0,
          },
        })
      }
      if (url.pathname === '/api/project-references') {
        if (holdValidation && url.searchParams.get('selected') !== '[]')
          await new Promise((done) => releases.push(done))
        if (referenceStatus)
          return route.fulfill({
            status: referenceStatus,
            json: { detail: 'fixture reference failure' },
          })
        return route.fulfill({ json: referencePage(url, emptyProjects) })
      }
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 100, has_more: false },
        })
      return route.fulfill({ status: 404, json: {} })
    })
    const page = await context.newPage()
    failurePage = page
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const text = (zh, en) => (locale === 'zh' ? zh : en)
    const record = (message) => {
      report.checks.push(`${name}: ${message}`)
      console.log(`PASS ${name}: ${message}`)
    }
    const list = page.getByTestId('project-resource-list')
    const listInput = () =>
      list.getByRole('searchbox', {
        name: text('搜索项目', 'Search projects'),
        exact: true,
      })
    const row = (projectName) =>
      list.getByRole('button', { name: projectName, exact: true })
    const range = () => list.getByTestId('project-resource-range')
    const readCount = (path) =>
      report.requests.filter((r) => r.name === name && r.path === path).length
    const taskWrites = () =>
      report.writes.filter((r) => r.name === name && r.path === '/api/tasks')
        .length
    async function ready() {
      await page.waitForFunction(() => {
        const element = document.querySelector(
          '[data-testid="project-resource-list"]',
        )
        return element && element.getAttribute('aria-busy') !== 'true'
      })
    }
    async function shot(suffix) {
      assert.ok(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      )
      const file = `${name}-${suffix}.png`
      await page.screenshot({ path: resolve(out, file), fullPage: true })
      report.screenshots.push(file)
    }
    function releaseAll() {
      holdDetail = undefined
      holdQuery = undefined
      holdValidation = false
      for (const release of releases.splice(0)) release()
    }
    await page.goto(`${base}#projects`)
    await row('Resource project 044').waitFor()
    await ready()
    assert.equal(await list.locator('.wb-project-resource-row').count(), 20)
    assert.equal(await range().innerText(), '1-20 / 45')
    assert.equal(
      await list
        .getByText('Detail-only project notes 44', { exact: true })
        .count(),
      0,
    )
    assert.match(
      await row('Resource project 044').innerText(),
      /Actual project objective 44/,
    )
    record(
      'Projects page uses20 bounded summaries and real task/Run counts without notes or Bootstrap rows',
    )
    report.geometry.push({
      style,
      mode,
      ...(await list.evaluate((node) => ({
        color: getComputedStyle(node).color,
        font: getComputedStyle(node).fontFamily,
        width: node.getBoundingClientRect().width,
        scrollWidth: node.scrollWidth,
      }))),
    })
    await shot('list')
    if (themeOnly) {
      await listInput().fill('unsent project search')
      await page
        .getByRole('button', {
          name: mode === 'light' ? 'Dark mode' : 'Light mode',
          exact: true,
        })
        .click()
      assert.equal(await listInput().inputValue(), 'unsent project search')
      record(
        'Theme mode switches preserve list search draft and bounded geometry',
      )
      await context.close()
      continue
    }
    await list
      .getByRole('button', {
        name: text('下一页项目', 'Next project page'),
        exact: true,
      })
      .click()
    await row('Resource project 024').waitFor()
    await ready()
    assert.equal(await range().innerText(), '21-40 / 45')
    assert.equal(
      new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('page'),
      '2',
    )
    await page.goBack()
    await row('Resource project 044').waitFor()
    assert.equal(await range().innerText(), '1-20 / 45')
    record(
      'Page navigation uses URL state and Back restores the previous server page',
    )
    const beforeSearch = readCount('/api/projects/query')
    await listInput().fill('authority')
    await listInput().evaluate((node) =>
      node.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          isComposing: true,
        }),
      ),
    )
    await page.waitForTimeout(100)
    assert.equal(readCount('/api/projects/query'), beforeSearch)
    await listInput().press('Enter')
    await row('Resource project 000').waitFor()
    await ready()
    assert.equal(await range().innerText(), '1-1 / 1')
    assert.equal(await list.locator('.wb-project-resource-row').count(), 1)
    record(
      'List search is draft-only and IME-safe; committed results preserve authoritative server matching',
    )
    queryStatus = 403
    await listInput().fill('failed')
    await listInput().press('Enter')
    await list.getByRole('alert').waitFor()
    assert.equal(await list.locator('.wb-project-resource-row').count(), 0)
    const failedReads = readCount('/api/projects/query')
    queryStatus = 0
    await list
      .getByRole('button', {
        name: text('重试项目', 'Retry projects'),
        exact: true,
      })
      .click()
    await ready()
    assert.equal(readCount('/api/projects/query'), failedReads + 1)
    assert.equal(await listInput().inputValue(), 'failed')
    await list
      .getByRole('heading', {
        name: text('没有匹配的项目', 'No matching projects'),
        exact: true,
      })
      .waitFor()
    record(
      'Advertised list failure has no fallback/false empty; explicit retry preserves the exact query',
    )
    malformed = true
    await listInput().fill('malformed')
    await listInput().press('Enter')
    await list.getByRole('alert').waitFor()
    assert.equal(await list.locator('.wb-project-resource-row').count(), 0)
    malformed = false
    holdQuery = 'late'
    await listInput().fill('late')
    await listInput().press('Enter')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="project-resource-list"]')
          ?.getAttribute('aria-busy') === 'true',
    )
    await listInput().fill('authority')
    await listInput().press('Enter')
    await row('Resource project 000').waitFor()
    await ready()
    releaseAll()
    await page.waitForTimeout(100)
    assert.equal(await range().innerText(), '1-1 / 1')
    record(
      'Malformed summaries remain errors and an obsolete delayed page cannot replace the newer query',
    )
    holdDetail = 'resource-project-000'
    await page.goto(`${base}#project/resource-project-000`)
    await page
      .getByLabel(text('正在读取项目', 'Loading project'), { exact: true })
      .waitFor()
    assert.equal(await page.locator('.wf-page').count(), 0)
    await page.goto(`${base}#project/resource-project-044`)
    await page
      .getByRole('heading', { name: 'Resource project 044', exact: true })
      .waitFor()
    releaseAll()
    await page.waitForTimeout(100)
    assert.equal(
      await page
        .getByRole('heading', { name: 'Resource project 000', exact: true })
        .count(),
      0,
    )
    record(
      'Project absent from Bootstrap loads by route ID and late previous-project detail is discarded',
    )
    await page
      .getByRole('button', {
        name: text('项目资料', 'Project info'),
        exact: true,
      })
      .click()
    const info = page.getByRole('dialog', {
      name: `${text('项目资料', 'Project info')} · Resource project 044`,
      exact: true,
    })
    await info
      .getByText('Detail-only project notes 44', { exact: true })
      .waitFor()
    await shot('detail-info')
    await page.keyboard.press('Escape')
    if (width >= 650) {
      const taskSearch = page
        .locator('.wf-querybar-primary')
        .getByRole('searchbox')
      await taskSearch.fill('Retain project draft')
      detailStatus = 503
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      await page
        .getByText(
          'Project refresh failed. Showing the last validated details.',
          { exact: true },
        )
        .waitFor()
      assert.equal(await taskSearch.inputValue(), 'Retain project draft')
      detailStatus = 0
      await page
        .getByRole('button', { name: 'Retry project', exact: true })
        .click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('.wf-heading h1')
            ?.getAttribute('aria-busy') !== 'true',
      )
      assert.equal(await taskSearch.inputValue(), 'Retain project draft')
      record(
        'Same-project transient refresh failure preserves validated content and the unsent task query draft',
      )
    }
    detailStatus = 403
    await page.goto(`${base}#project/resource-project-002`)
    await page
      .getByRole('heading', {
        name: text('无权读取项目', 'Project access forbidden'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-page').count(), 0)
    detailStatus = 0
    await page
      .getByRole('button', {
        name: text('重试项目', 'Retry project'),
        exact: true,
      })
      .click()
    await page
      .getByRole('heading', { name: 'Resource project 002', exact: true })
      .waitFor()
    await page.goto(`${base}#project/missing-project`)
    await page
      .getByRole('heading', {
        name: text('项目不存在', 'Project not found'),
        exact: true,
      })
      .waitFor()
    record(
      'Full project info comes only from detail;403 and confirmed404 are distinct with explicit retry',
    )
    await page.goto(`${base}#project/`)
    await page
      .getByRole('heading', {
        name: text('项目读取失败', 'Project unavailable'),
        exact: true,
      })
      .waitFor()
    record(
      'An invalid empty project ID becomes an explicit failure rather than an endless loading state',
    )
    await page.goto(`${base}#workbench`)
    if (width < 650) {
      await page
        .getByRole('button', {
          name: text('打开导航', 'Open navigation'),
          exact: true,
        })
        .click()
    }
    await (
      width < 650
        ? page.getByRole('dialog', {
            name: text('工作空间导航', 'Workspace navigation'),
            exact: true,
          })
        : page.locator('.wb-sidebar')
    )
      .getByRole('button', { name: text('新建任务', 'New task'), exact: true })
      .click()
    const form = page.getByRole('dialog', {
      name: text('新建任务', 'New task'),
      exact: true,
    })
    await form.waitFor()
    await form
      .getByTestId('project-task-picker-trigger')
      .getByText(text('选择项目', 'Select a project'), { exact: true })
      .waitFor()
    await form
      .getByRole('textbox', {
        name: new RegExp(text('任务名称', 'Task title')),
      })
      .fill('Preserved task candidate')
    await form
      .getByRole('textbox', { name: new RegExp(text('任务目标', 'Objective')) })
      .fill('Synthetic task objective without model calls')
    await form.getByTestId('project-task-picker-trigger').click()
    const picker = page.getByTestId('project-task-picker-dialog')
    await picker
      .getByRole('radio', { name: 'Resource project 044', exact: true })
      .waitFor()
    assert.equal(await picker.getByRole('radio').count(), 20)
    await picker
      .getByRole('button', {
        name: text('下一页项目', 'Next project page'),
        exact: true,
      })
      .click()
    await picker
      .getByRole('radio', { name: 'Resource project 024', exact: true })
      .waitFor()
    const taskRadio = picker.getByRole('radio', {
      name: 'Resource project 024',
      exact: true,
    })
    await taskRadio.focus()
    await page.keyboard.press('Space')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="project-task-picker-dialog"]')
          ?.getAttribute('aria-busy') !== 'true',
    )
    assert.equal(await taskRadio.isChecked(), true)
    assert.equal(await picker.getByRole('radio', { checked: true }).count(), 1)
    await picker
      .getByRole('button', { name: text('完成', 'Done'), exact: true })
      .click()
    await form
      .getByTestId('project-task-picker-trigger')
      .getByText('Resource project 024', { exact: true })
      .waitFor()
    record(
      'Global task creation ignores empty Bootstrap and requires explicit single-project selection across pages',
    )
    const submitName = text('保存任务并检查资料', 'Save task & review context')
    holdValidation = true
    const freshRead = page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === '/api/project-references' &&
        JSON.parse(
          new URL(request.url()).searchParams.get('selected') ?? '[]',
        ).includes('resource-project-024'),
    )
    await form.getByRole('button', { name: submitName, exact: true }).click()
    await freshRead
    assert.equal(taskWrites(), 0)
    referenceStatus = 403
    releaseAll()
    await form.getByRole('alert').first().waitFor()
    assert.equal(taskWrites(), 0)
    assert.equal(
      await form
        .getByRole('textbox', {
          name: new RegExp(text('任务名称', 'Task title')),
        })
        .inputValue(),
      'Preserved task candidate',
    )
    record(
      'Fresh project validation precedes task POST;403 preserves all task fields without creating a task',
    )
    referenceStatus = 0
    await form.getByRole('button', { name: submitName, exact: true }).click()
    await page.waitForFunction(() =>
      document.querySelector('[data-form-field="title"][aria-invalid="true"]'),
    )
    assert.equal(taskWrites(), 1)
    assert.equal(
      report.writes.filter((r) => r.name === name && r.path === '/api/tasks')[0]
        .body.project_id,
      'resource-project-024',
    )
    assert.equal(
      await form
        .getByRole('textbox', {
          name: new RegExp(text('任务名称', 'Task title')),
        })
        .inputValue(),
      'Preserved task candidate',
    )
    record(
      'Only explicit resubmit performs one task POST to the confirmed project;server422 retains the draft',
    )
    await shot('task-form')
    await page
      .getByRole('button', { name: text('关闭', 'Close'), exact: true })
      .first()
      .click()
    const discard = page.getByRole('dialog', {
      name: text('放弃未保存的更改？', 'Discard unsaved changes?'),
      exact: true,
    })
    if (await discard.count())
      await discard
        .getByRole('button', {
          name: text('放弃更改', 'Discard changes'),
          exact: true,
        })
        .click()
    emptyProjects = true
    if (width < 650)
      await page
        .getByRole('button', {
          name: text('打开导航', 'Open navigation'),
          exact: true,
        })
        .click()
    await (
      width < 650
        ? page.getByRole('dialog', {
            name: text('工作空间导航', 'Workspace navigation'),
            exact: true,
          })
        : page.locator('.wb-sidebar')
    )
      .getByRole('button', { name: text('新建任务', 'New task'), exact: true })
      .click()
    await form
      .getByRole('textbox', {
        name: new RegExp(text('任务名称', 'Task title')),
      })
      .fill('Protect before creating project')
    await form.getByTestId('project-task-picker-trigger').click()
    await picker
      .getByText(text('尚无项目', 'No projects yet'), { exact: true })
      .waitFor()
    await picker
      .getByRole('button', {
        name: text('创建项目', 'Create project'),
        exact: true,
      })
      .click()
    await discard.waitFor()
    await discard
      .locator('.wb-form-actions')
      .getByRole('button', {
        name: text('继续编辑', 'Keep editing'),
        exact: true,
      })
      .click()
    assert.equal(
      await form
        .getByRole('textbox', {
          name: new RegExp(text('任务名称', 'Task title')),
        })
        .inputValue(),
      'Protect before creating project',
    )
    record(
      'Verified no-project state offers Create project while dirty task input requires an explicit discard decision',
    )
    await form
      .getByRole('button', { name: text('关闭', 'Close'), exact: true })
      .first()
      .click()
    await discard
      .getByRole('button', {
        name: text('放弃更改', 'Discard changes'),
        exact: true,
      })
      .click()
    emptyProjects = false
    cap = false
    const legacyBefore = readCount('/api/projects/query')
    await page.goto(`${base}?legacy=1#projects`)
    await page
      .locator('.wb-project-list')
      .getByRole('link', { name: /Legacy project/ })
      .waitFor()
    assert.equal(readCount('/api/projects/query'), legacyBefore)
    record(
      'Missing resource capabilities retain legacy project list without new reads',
    )
    cap = true
    detailStatus = 401
    await page.goto(`${base}?expired=1#project/resource-project-000`)
    await page
      .getByRole('heading', {
        name: text('登录工作空间', 'Sign in to workspace'),
        exact: true,
      })
      .waitFor()
    assert.equal(await page.locator('.wf-page').count(), 0)
    record('HTML401 clears full-project and task-form private projections')
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  assert.ok(report.writes.every((r) => r.path === '/api/tasks'))
  assert.notEqual(report.geometry[0].color, report.geometry[2].color)
  assert.notEqual(report.geometry[0].font, report.geometry[4].font)
  for (const geometry of report.geometry)
    assert.ok(geometry.scrollWidth <= geometry.width + 1)
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  if (failurePage && !failurePage.isClosed()) {
    report.failure.tree = await failurePage.locator('body').ariaSnapshot()
    await failurePage.screenshot({
      path: resolve(out, 'failure.png'),
      fullPage: true,
    })
  }
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
