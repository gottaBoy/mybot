import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5176/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const out = resolve(
  process.env.TASK_WORKSPACE_EVIDENCE_DIR ?? '/tmp/mybot-task-workspace',
)
await mkdir(out, { recursive: true })
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const project = {
  id: 'goal-project',
  name: 'Research platform 研发协作项目',
  goal: 'Project goal: deliver a shared Agent workbench with verifiable research outcomes.',
  directory: '.',
  notes: 'Synthetic project context, not production data.',
}
const task = {
  id: 'goal-task',
  project_id: project.id,
  title: 'Trace a goal through Agent work and artifact review',
  goal: 'Task goal: compare device handoff approaches and produce a testable implementation plan.',
  acceptance:
    'Acceptance: cite evidence, preserve unknowns, and expose a concrete next task.',
  files: [
    'README.md',
    'docs/research plan with a long localized filename 研发多端交接方案.md',
  ],
  created_at: '2026-11-20T02:00:00Z',
}
const pendingTask = {
  ...task,
  id: 'pending-task',
  title: 'Prepare an independent local research task',
  goal: 'Pending goal: inspect explicit research sources without invoking a model until consent.',
  acceptance:
    'Pending acceptance: the resource preview must use the exact Task.',
  files: ['pending.md'],
}
const history = Array.from({ length: 23 }, (_, index) => ({
  id: `goal-run-${String(22 - index).padStart(3, '0')}`,
  task_id: task.id,
  status: index === 0 ? 'succeeded' : index % 2 ? 'failed' : 'canceled',
  created_at: `2026-11-20T03:${String(22 - index).padStart(2, '0')}:00Z`,
}))
const model = {
  id: 'fixture-model',
  kind: 'chat_completions',
  name: 'Fixture model',
  endpoint: 'http://127.0.0.1:11434/v1',
  model: 'fixture-read-only',
  key_env: '',
  key_available: false,
}
const agents = [
  ['coordinator', 'Planning from explicit sources'],
  ['researcher', 'Research device handoff contracts'],
  ['reviewer', 'Synthesize a verifiable next step'],
].map(([role, title], index) => ({
  id: `goal-agent-${index}`,
  role,
  title,
  objective: `${title}: synthetic persisted objective`,
  status: 'succeeded',
  output: `Persisted ${role} output`,
  model_id: model.id,
}))
const calls = agents.map((agent, index) => ({
  id: `goal-call-${index}`,
  agent_id: agent.id,
  requested_model: model.model,
  status: 'succeeded',
  attempt: 1,
  duration_ms: 100 + index,
  input_tokens: 21 + index,
  output_tokens: 9 + index,
  error_detail: {},
}))
const report = {
  synthetic: true,
  source:
    'Intercepted Task/Project detail and Run facts through production Task workspace',
  limits: [
    'Synthetic persisted facts do not prove actual database or Provider execution.',
    'Chrome viewports and keyboard events do not certify physical devices or IMEs.',
    'Fixture context previews and artifact decisions occur only after explicit scripted user actions.',
  ],
  checks: [],
  requests: [],
  writes: [],
  unexpected: [],
  externalRequests: [],
  errors: [],
  screenshots: [],
  geometry: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
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
    const tr = (zh, en) => (locale === 'zh' ? zh : en)
    let taskCapability = true,
      projectCapability = true,
      authenticated = true
    let taskStatus = 0,
      projectStatus = 0,
      runStatus = 0,
      malformedTask = false
    let wrongRun = false,
      artifactDecision = 'pending'
    let heldTask, releasedTask
    let holdTaskId = '',
      holdNext = false
    let createdTask
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 844 : 1000 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript(
      ({ locale, style, mode }) => {
        localStorage.setItem('mybot.locale', locale)
        localStorage.setItem('mybot.style', style)
        localStorage.setItem('mybot.mode', mode)
      },
      { locale, style, mode },
    )
    const contextRequests = []
    const releases = []
    const allTasks = () => [
      task,
      pendingTask,
      ...(createdTask ? [createdTask] : []),
    ]
    const taskOf = (id) => allTasks().find((item) => item.id === id)
    function taskDetail(id, requestedPage = 1, pageSize = 20) {
      const source = taskOf(id)
      assert.ok(source, `Known fixture Task ${id}`)
      const runs = id === task.id ? history : []
      const totalPages = Math.max(1, Math.ceil(runs.length / pageSize))
      const page = Math.min(requestedPage, totalPages)
      return {
        schema_version: 1,
        unit: 'task_detail',
        item: {
          task: source,
          project: { id: project.id, name: project.name },
          latest_run: runs[0] ?? null,
          state_category: runs.length ? 'completed' : 'pending',
          attempts: runs.length,
        },
        history: {
          unit: 'runs',
          items: runs.slice((page - 1) * pageSize, page * pageSize),
          total: runs.length,
          requested_page: requestedPage,
          page,
          page_size: pageSize,
          total_pages: totalPages,
          has_more: page < totalPages,
          order: 'created-desc-source-v1',
        },
      }
    }
    function runDetail(id) {
      const run = history.find((item) => item.id === id) ?? history[0]
      return {
        run: {
          ...run,
          id,
          task_id: wrongRun ? pendingTask.id : task.id,
          config: { max_calls: 4 },
          context: { evidence: [{ path: 'README.md', bytes: 120 }] },
        },
        task: wrongRun ? pendingTask : task,
        project,
        agents,
        calls,
        artifacts: [
          {
            id: 'goal-artifact',
            agent_id: agents[2].id,
            title: 'Device handoff implementation plan',
            kind: 'report',
            content:
              '# Research outcome\n\nEvidence-backed next step: implement a local control lease.',
            decision: artifactDecision,
            created_at: '2026-11-20T04:00:00Z',
          },
        ],
        events: [
          {
            id: 'goal-event',
            seq: 1,
            kind: 'run.succeeded',
            actor: 'worker',
            created_at: '2026-11-20T04:00:00Z',
            payload: {},
          },
        ],
        retry_runs: [],
        harness: {
          parallel_limit: 2,
          stages: ['planning', 'research', 'synthesis'].map((key, index) => ({
            key,
            title: key,
            status: 'succeeded',
            agent_count: 1,
            call_count: 1,
            artifact_count: index === 2 ? 1 : 0,
          })),
        },
      }
    }
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin) {
        report.externalRequests.push({
          name,
          origin: url.origin,
          path: url.pathname,
        })
        return route.abort()
      }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      const logged = {
        name,
        path: url.pathname,
        search: url.search,
        method: request.method(),
      }
      report.requests.push(logged)
      contextRequests.push(logged)
      if (request.method() !== 'GET') {
        const body = request.postDataJSON()
        report.writes.push({ ...logged, body })
        if (/^\/api\/tasks\/[^/]+\/preview$/.test(url.pathname)) {
          const id = decodeURIComponent(url.pathname.split('/')[3])
          const source = taskOf(id)
          assert.ok(source)
          return route.fulfill({
            json: {
              context_hash: 'a'.repeat(64),
              goal: source.goal,
              acceptance: source.acceptance,
              notes: project.notes,
              text: `Snapshot for ${id}\n${source.goal}`,
              bytes: 120,
              evidence: source.files.map((path) => ({ path, bytes: 40 })),
            },
          })
        }
        if (url.pathname === '/api/tasks') {
          createdTask = {
            id: 'created-goal-task',
            project_id: project.id,
            title: body.title,
            goal: body.goal,
            acceptance: body.acceptance,
            files: body.files,
            created_at: '2026-11-20T05:00:00Z',
          }
          return route.fulfill({ json: createdTask })
        }
        if (url.pathname === '/api/artifacts/goal-artifact/decision') {
          assert.equal(body.decision, 'accepted')
          artifactDecision = 'accepted'
          return route.fulfill({
            json: { id: 'goal-artifact', decision: 'accepted' },
          })
        }
        report.unexpected.push(logged)
        return route.fulfill({
          status: 405,
          json: { detail: 'No execution permitted' },
        })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          json: { authenticated, required: !authenticated },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({
          json: {
            projects: [
              {
                ...project,
                goal: projectCapability ? 'POISON PROJECT GOAL' : project.goal,
              },
            ],
            tasks: allTasks().map((item) => ({
              ...item,
              goal: taskCapability ? 'POISON BOOTSTRAP TASK GOAL' : item.goal,
            })),
            runs: history,
            models: [model],
            backends: [],
            workspace: '/synthetic/task-workspace',
            default_model_id: model.id,
            local_harnesses: [],
            capabilities: {
              backend_sync: false,
              task_detail: taskCapability,
              project_detail: projectCapability,
            },
          },
        })
      if (url.pathname === `/api/projects/${project.id}/detail`) {
        if (projectStatus)
          return route.fulfill({
            status: projectStatus,
            json: {
              detail: {
                code:
                  projectStatus === 404
                    ? 'project_detail_unavailable'
                    : 'synthetic_project_error',
              },
            },
          })
        return route.fulfill({
          json: {
            schema_version: 1,
            unit: 'project_detail',
            project,
            task_count: allTasks().length,
            run_count: history.length,
          },
        })
      }
      if (/^\/api\/tasks\/[^/]+\/detail$/.test(url.pathname)) {
        const id = decodeURIComponent(url.pathname.split('/')[3])
        if (holdNext && id === holdTaskId) {
          holdNext = false
          heldTask = true
          await new Promise((resolve) => {
            releasedTask = resolve
            releases.push(resolve)
          })
        }
        if (taskStatus) {
          if (taskStatus === 401) authenticated = false
          return route.fulfill({
            status: taskStatus,
            json: {
              detail: {
                code:
                  taskStatus === 404
                    ? 'task_detail_unavailable'
                    : 'synthetic_task_error',
              },
            },
          })
        }
        if (malformedTask) return route.fulfill({ json: { item: {} } })
        if (!taskOf(id))
          return route.fulfill({
            status: 404,
            json: {
              detail: { code: 'task_detail_unavailable' },
            },
          })
        return route.fulfill({
          json: taskDetail(
            id,
            Number(url.searchParams.get('page') ?? 1),
            Number(url.searchParams.get('page_size') ?? 20),
          ),
        })
      }
      if (/^\/api\/runs\/[^/]+$/.test(url.pathname))
        if (runStatus)
          return route.fulfill({
            status: runStatus,
            json: { detail: 'Synthetic Run read forbidden' },
          })
      if (/^\/api\/runs\/[^/]+$/.test(url.pathname))
        return route.fulfill({
          json: runDetail(decodeURIComponent(url.pathname.split('/')[3])),
        })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 20, has_more: false },
        })
      report.unexpected.push(logged)
      return route.fulfill({
        status: 404,
        json: { detail: 'Unexpected fixture route' },
      })
    })
    const page = await context.newPage()
    failurePage = page
    page.on('pageerror', (error) =>
      report.errors.push({ name, message: error.message }),
    )
    const root = page.getByTestId('task-workspace')
    const detailReads = () =>
      contextRequests.filter((item) =>
        /^\/api\/tasks\/[^/]+\/detail$/.test(item.path),
      )
    const runReads = () =>
      contextRequests.filter((item) => /^\/api\/runs\/[^/]+$/.test(item.path))
    const previewWrites = () =>
      report.writes.filter(
        (item) => item.name === name && item.path.endsWith('/preview'),
      )
    const taskUrl = (id = task.id, tab, runId) => {
      const params = new URLSearchParams()
      if (tab && tab !== 'goal') params.set('taskTab', tab)
      if (runId) params.set('taskRun', runId)
      return `${base}#task/${encodeURIComponent(id)}${params.size ? `?${params}` : ''}`
    }
    function record(message) {
      report.checks.push(`${name}: ${message}`)
      console.log(`PASS ${name}: ${message}`)
    }
    async function shot(label) {
      await page.screenshot({
        path: resolve(out, `${name}-${label}.png`),
        fullPage: true,
      })
      report.screenshots.push(`${name}-${label}.png`)
    }
    async function goalReady(source = task) {
      await root
        .getByRole('heading', { name: source.title, exact: true })
        .waitFor()
      await page
        .getByTestId('task-goal')
        .getByText(source.goal, { exact: true })
        .waitFor()
      await page
        .getByTestId('project-goal')
        .getByText(project.goal, { exact: true })
        .waitFor()
    }
    try {
      await page.goto(taskUrl())
      await goalReady()
      assert.equal(
        await root
          .getByText('POISON BOOTSTRAP TASK GOAL', { exact: true })
          .count(),
        0,
      )
      assert.equal(
        await root.getByText('POISON PROJECT GOAL', { exact: true }).count(),
        0,
      )
      assert.equal(
        await root.getByText(task.acceptance, { exact: true }).count(),
        1,
      )
      for (const file of task.files)
        assert.equal(await root.getByText(file, { exact: true }).count(), 1)
      assert.equal(
        await root
          .getByTestId('task-history')
          .locator('.wb-task-history-row')
          .count(),
        20,
      )
      assert.equal(runReads().length, 0)
      assert.equal(previewWrites().length, 0)
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="task-workspace"]')
        const style = getComputedStyle(root)
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          color: style.color,
          background: style.backgroundColor,
          font: style.fontFamily,
          projectTop: root
            .querySelector('[data-testid="project-goal"]')
            .getBoundingClientRect().top,
          goalTop: root
            .querySelector('[data-testid="task-goal"]')
            .getBoundingClientRect().top,
          height: innerHeight,
        }
      })
      report.geometry.push({ name, width, style, mode, ...geometry })
      assert.ok(geometry.overflow <= 1, JSON.stringify(geometry))
      assert.ok(
        geometry.projectTop < geometry.height &&
          geometry.goalTop < geometry.height,
      )
      await shot('goals')
      record(
        'the first viewport shows distinct real Project/Task goals, acceptance/files and20 bounded history rows, with no implicit Run or preview request',
      )
      if (themeOnly) {
        const before = detailReads().length
        await page
          .getByRole('radio', { name: 'Agent work', exact: true })
          .click()
        await root.locator('.wb-workflow').waitFor()
        await page
          .getByRole('radio', { name: 'Goal & acceptance', exact: true })
          .click()
        await goalReady()
        assert.equal(detailReads().length, before)
        record(
          'appearance uses one Task tree and changing presentation preserves Task detail without refetch',
        )
        continue
      }
      await root.locator('[data-task-history-page="next"]').click()
      await root
        .getByTestId('task-history')
        .getByText('21-23 / 23', { exact: true })
        .waitFor()
      assert.equal(await root.locator('.wb-task-history-row').count(), 3)
      await page.waitForFunction(() =>
        document.activeElement?.matches('[data-task-history-page="previous"]'),
      )
      const previous = root.locator('[data-task-history-page="previous"]')
      await previous.click()
      await root
        .getByTestId('task-history')
        .getByText('1-20 / 23', { exact: true })
        .waitFor()
      record(
        'history pages20/3 retain exact ordered Run identities and restore an available pager focus',
      )

      await root
        .getByRole('button', {
          name: tr('查看 Agent 执行', 'View Agent work'),
          exact: true,
        })
        .click()
      await root.locator('.wb-workflow').waitFor()
      assert.ok(
        new URLSearchParams(page.url().split('?')[1]).get('taskRun') ===
          history[0].id,
      )
      await root
        .getByRole('heading', { name: agents[0].title, exact: true })
        .waitFor()
      assert.equal(await root.locator('.wb-agent').count(), 3)
      await root
        .getByRole('button', { name: tr('工作图', 'Work graph'), exact: true })
        .click()
      await root
        .getByRole('region', {
          name: tr('运行工作图', 'Run work graph'),
          exact: true,
        })
        .waitFor()
      await root
        .getByRole('button', { name: tr('放大工作图', 'Zoom in'), exact: true })
        .click()
      await root.getByText('110%', { exact: true }).waitFor()
      await shot('agent-work')
      record(
        'Agent work reuses persisted stages, three real Agent records and the existing interactive read-only work graph',
      )

      await root
        .getByRole('radio', {
          name: tr('成果审查', 'Artifact review'),
          exact: true,
        })
        .click()
      await root
        .getByRole('heading', {
          name: 'Device handoff implementation plan',
          exact: true,
        })
        .waitFor()
      await root
        .getByText(
          'Evidence-backed next step: implement a local control lease.',
          { exact: true },
        )
        .waitFor()
      if (name === 'desktop') {
        await root.getByRole('button', { name: 'Accept', exact: true }).click()
        await page.waitForFunction(
          () =>
            document
              .querySelector('.wb-artifact-actions button')
              ?.getAttribute('aria-disabled') === 'true' ||
            document.querySelector('.wb-artifact-actions button')?.disabled ===
              true,
        )
        assert.equal(artifactDecision, 'accepted')
        const writes = report.writes.filter(
          (item) =>
            item.name === name &&
            item.path === '/api/artifacts/goal-artifact/decision',
        )
        assert.equal(writes.length, 1)
      }
      await shot('artifact-review')
      record(
        'artifact review remains in Task context and uses the existing exact artifact facts and decision control',
      )
      await page.reload()
      await root
        .getByRole('heading', {
          name: 'Device handoff implementation plan',
          exact: true,
        })
        .waitFor()
      await page.goBack()
      record(
        'the selected Task view and exact Run survive URL reload and history navigation',
      )

      await page.goto(taskUrl(pendingTask.id, 'work'))
      await root
        .getByRole('heading', {
          name: tr('尚未开始 Agent 执行', 'Agent work has not started'),
          exact: true,
        })
        .waitFor()
      assert.equal(
        runReads().filter((item) => item.path.endsWith('/undefined')).length,
        0,
      )
      const beforePreview = previewWrites().length
      await root
        .getByRole('button', {
          name: tr('安排执行', 'Arrange execution'),
          exact: true,
        })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await dialog.waitFor()
      await dialog
        .getByText(pendingTask.goal, { exact: false })
        .first()
        .waitFor()
      assert.equal(previewWrites().length, beforePreview + 1)
      assert.equal(
        previewWrites().at(-1).path,
        `/api/tasks/${pendingTask.id}/preview`,
      )
      assert.equal(
        report.writes.some(
          (item) => item.name === name && item.path.endsWith('/runs'),
        ),
        false,
      )
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      record(
        'a pending Task has a real no-Run state; explicit Arrange previews that exact Task without executing a model',
      )

      await page.goto(taskUrl(task.id, 'bad-tab'))
      await root.getByRole('alert').waitFor()
      assert.equal(await root.locator('.wb-workflow').count(), 0)
      await root
        .getByRole('button', {
          name: tr('清除任务视图', 'Clear task view'),
          exact: true,
        })
        .click()
      await goalReady()
      record(
        'invalid Task view is explicit and Clear returns to the same Task goal without execution',
      )
      wrongRun = true
      await page.goto(taskUrl(task.id, 'work', history[0].id))
      await root
        .getByText(
          /run_task_mismatch|运行.*任务|different task|does not belong/i,
        )
        .first()
        .waitFor()
      assert.equal(await root.locator('.wb-workflow').count(), 0)
      assert.equal(
        await root
          .getByRole('button', { name: tr('接受方案', 'Accept'), exact: true })
          .count(),
        0,
      )
      wrongRun = false
      record(
        'a Run belonging to another Task fails before stages, artifacts or domain actions are exposed',
      )

      await page.reload()
      await root.locator('.wb-workflow').waitFor()
      runStatus = 403
      await root
        .getByRole('button', {
          name: tr('刷新运行', 'Refresh run'),
          exact: true,
        })
        .click()
      await root
        .getByRole('button', {
          name: tr('重新读取', 'Retry loading'),
          exact: true,
        })
        .waitFor()
      assert.equal(await root.locator('.wb-workflow').count(), 0)
      assert.equal(await root.locator('.wb-agent').count(), 0)
      assert.equal(await root.locator('.wb-artifact-actions').count(), 0)
      runStatus = 0
      record(
        'a forbidden Run refresh removes retained Agent, artifact and control projections',
      )

      projectStatus = 403
      await page.goto(taskUrl())
      await page.reload()
      await root
        .getByRole('button', {
          name: tr('重试项目资料', 'Retry project details'),
          exact: true,
        })
        .waitFor()
      assert.equal(
        await root.getByText(project.goal, { exact: true }).count(),
        0,
      )
      assert.equal(
        await root
          .getByRole('button', {
            name: tr('安排执行', 'Arrange execution'),
            exact: true,
          })
          .getAttribute('aria-disabled'),
        'true',
      )
      projectStatus = 0
      await root
        .getByRole('button', {
          name: tr('重试项目资料', 'Retry project details'),
          exact: true,
        })
        .click()
      await goalReady()
      record(
        'Project read failure cannot manufacture a goal or enable preparation; explicit read Retry restores it',
      )

      for (const [status, malformed] of [
        [403, false],
        [404, false],
        [0, true],
      ]) {
        taskStatus = status
        malformedTask = malformed
        await page.reload()
        await root
          .getByRole('button', {
            name: tr('重试读取任务', 'Retry task'),
            exact: true,
          })
          .waitFor()
        assert.equal(await root.getByTestId('task-goal').count(), 0)
        assert.equal(await root.locator('.wb-workflow').count(), 0)
        taskStatus = 0
        malformedTask = false
        const before = detailReads().length
        await root
          .getByRole('button', {
            name: tr('重试读取任务', 'Retry task'),
            exact: true,
          })
          .click()
        await goalReady()
        assert.equal(detailReads().length, before + 1)
      }
      record(
        'advertised403/404/malformed Task reads hide stale content without Bootstrap fallback; explicit Retry sends one GET',
      )

      holdTaskId = task.id
      holdNext = true
      heldTask = false
      await root
        .getByRole('button', {
          name: tr('刷新任务', 'Refresh task'),
          exact: true,
        })
        .click()
      await page.waitForTimeout(60)
      assert.equal(heldTask, true)
      const busyArrange = root.getByRole('button', {
        name: tr('安排执行', 'Arrange execution'),
        exact: true,
      })
      assert.equal(await busyArrange.getAttribute('aria-disabled'), 'true')
      await page.goto(taskUrl(pendingTask.id))
      await goalReady(pendingTask)
      releasedTask?.()
      await page.waitForTimeout(100)
      assert.equal(
        await root
          .getByRole('heading', { name: task.title, exact: true })
          .count(),
        0,
      )
      holdTaskId = ''
      record(
        'busy retained Task snapshots block preparation and a canceled old response cannot replace a newer Task',
      )

      if (name === 'desktop') {
        await page
          .getByRole('button', { name: 'New task', exact: true })
          .click()
        const form = page.getByRole('dialog')
        await form.waitFor()
        await form
          .getByRole('textbox', { name: /^Task title/ })
          .fill('Created Task stays in its working context')
        await form
          .getByRole('textbox', { name: /^Objective/ })
          .fill(
            'A newly saved task must land on goals without automatically reading context.',
          )
        await form
          .getByRole('textbox', { name: 'Acceptance criteria', exact: true })
          .fill('No context preview occurs until Arrange execution.')
        const before = previewWrites().length
        await form.getByRole('button', { name: /Save task/i }).click()
        await page.waitForURL(/#task\/created-goal-task(?:\?|$)/)
        await goalReady(createdTask)
        assert.ok(page.url().includes('#task/created-goal-task'))
        assert.equal(previewWrites().length, before)
        record(
          'saving a Task lands directly in its working context and does not automatically preview or start it',
        )
      }
      taskCapability = false
      projectCapability = false
      await page.goto(taskUrl())
      await page.reload()
      const beforeLegacy = detailReads().length
      await goalReady()
      assert.equal(detailReads().length, beforeLegacy)
      record(
        'missing remote capabilities retain real legacy Task/Project objects without requesting unsupported detail routes',
      )

      taskCapability = true
      projectCapability = true
      taskStatus = 401
      await page.reload()
      await page
        .getByRole('heading', {
          name: tr('登录工作空间', 'Sign in to workspace'),
          exact: true,
        })
        .waitFor()
      assert.equal(await page.getByTestId('task-goal').count(), 0)
      record(
        '401 removes private Task content and returns to sign-in without replay',
      )
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      )
      await shot('signed-out')
    } catch (error) {
      report.failureName = name
      await page
        .screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
        .catch(() => {})
      throw error
    } finally {
      for (const release of releases) release()
      await context.close()
    }
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.externalRequests, [])
  assert.deepEqual(report.unexpected, [])
  assert.equal(
    report.writes.some((item) => /\/runs$|\/test$|\/check$/.test(item.path)),
    false,
  )
} catch (error) {
  report.failure = { message: error.message, stack: error.stack }
  await failurePage
    ?.screenshot({ path: resolve(out, 'failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await writeFile(
    resolve(out, 'verification.json'),
    JSON.stringify(report, null, 2),
  )
  await browser.close()
}
