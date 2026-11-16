import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

assert.equal(process.env.MYBOT_BROWSER_SYNTHETIC, '1')
const base = process.env.MYBOT_FRONTEND_URL ?? 'http://127.0.0.1:5173/'
const origin = new URL(base).origin
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname))
const phase = process.env.LAYOUT_PHASE ?? 'after'
assert.ok(['before', 'after'].includes(phase))
const out = resolve(
  process.env.WORKBENCH_EVIDENCE_DIR ?? '/tmp/mybot-visible-layout',
  phase,
)
const { chromium } = await import(
  pathToFileURL(
    resolve(
      process.env.PLAYWRIGHT_MODULE ??
        '/tmp/mybot-design-tools.VtVbIr/node_modules/playwright/index.mjs',
    ),
  ).href
)
const projects = [
  {
    id: 'device',
    name: '多端协作',
    goal: 'Research device handoff',
    directory: '.',
    notes: 'Synthetic fixture',
  },
  {
    id: 'workflow',
    name: 'Agent 工作流',
    goal: 'Research orchestration',
    directory: '.',
    notes: 'Synthetic fixture',
  },
  {
    id: 'connectors',
    name: '应用连接器',
    goal: 'Research integrations',
    directory: '.',
    notes: 'Synthetic fixture',
  },
]
const titles = [
  '梳理多端会话与任务接力的状态边界',
  '设计 Agent 工作流的资源分配与重试策略',
  '核对飞书、钉钉与邮箱连接器的授权范围',
  '对比本地 Harness 的事件流与失败恢复',
  '完善中英文工作台与触控布局',
  '整理只读研究成果的来源与验收要求',
]
const tasks = Array.from({ length: 32 }, (_, index) => ({
  id: `task-${String(index + 1).padStart(3, '0')}`,
  project_id: projects[index % projects.length].id,
  title: titles[index % titles.length],
  goal: '分析本地设备和共享设备的权限、任务状态与上下文同步边界。保留来源记录，区分方案与已验证能力。',
  acceptance: '输出状态流转与权限矩阵；明确断线、取消和结果未知时的处理方式。',
  files:
    index % 2 ? [] : ['docs/DEVICE_HANDOFF.md', 'docs/HARNESS_CONTRACT.md'],
  created_at: new Date(Date.UTC(2026, 10, 15, 1, index)).toISOString(),
}))
const statuses = [
  'succeeded',
  'running',
  'failed',
  undefined,
  'paused',
  'succeeded',
]
const runs = tasks.flatMap((task, index) =>
  statuses[index % 6]
    ? [
        {
          id: `run-${String(index + 1).padStart(3, '0')}`,
          task_id: task.id,
          status: statuses[index % 6],
          created_at: new Date(Date.UTC(2026, 10, 15, 2, index)).toISOString(),
        },
      ]
    : [],
)
const bootstrap = {
  projects,
  tasks,
  runs,
  models: [],
  backends: [],
  workspace: '/synthetic/visible-layout',
  default_model_id: '',
  local_harnesses: [],
  capabilities: { backend_sync: false },
}
const report = {
  phase,
  base,
  synthetic: true,
  checks: [],
  screenshots: [],
  geometry: [],
  errors: [],
  writes: [],
  unexpectedApi: [],
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
})
await mkdir(out, { recursive: true })
const cases = [
  {
    name: 'desktop',
    width: 1440,
    height: 1000,
    locale: 'zh',
    style: 'neutral',
    mode: 'light',
    density: 'comfortable',
  },
  {
    name: 'tablet',
    width: 1024,
    height: 900,
    locale: 'zh',
    style: 'neutral',
    mode: 'light',
    density: 'comfortable',
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    locale: 'zh',
    style: 'neutral',
    mode: 'light',
    density: 'comfortable',
  },
  ...(phase === 'after'
    ? [
        {
          name: 'zira-dark',
          width: 1440,
          height: 1000,
          locale: 'en',
          style: 'zira',
          mode: 'dark',
          density: 'compact',
        },
        {
          name: 'gothic-touch',
          width: 1280,
          height: 900,
          locale: 'en',
          style: 'gothic',
          mode: 'light',
          density: 'touch',
        },
        {
          name: 'mobile-dark',
          width: 360,
          height: 800,
          locale: 'en',
          style: 'neutral',
          mode: 'dark',
          density: 'touch',
        },
      ]
    : []),
]
try {
  for (const item of cases) {
    const context = await browser.newContext({
      viewport: { width: item.width, height: item.height },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    await context.addInitScript((preferences) => {
      for (const key of ['locale', 'style', 'mode', 'density'])
        localStorage.setItem(`mybot.${key}`, preferences[key])
    }, item)
    await context.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.protocol.startsWith('http') && url.origin !== origin)
        return route.abort()
      if (!url.pathname.startsWith('/api/')) return route.continue()
      if (request.method() !== 'GET') {
        report.writes.push({ path: url.pathname, method: request.method() })
        return route.fulfill({
          status: 405,
          json: { detail: 'Read-only visual fixture' },
        })
      }
      if (url.pathname === '/api/auth/state')
        return route.fulfill({
          status: 200,
          json: { authenticated: true, required: false },
        })
      if (url.pathname === '/api/bootstrap')
        return route.fulfill({ status: 200, json: bootstrap })
      if (url.pathname === '/api/saved-views')
        return route.fulfill({
          status: 404,
          json: { detail: 'Not enabled in this fixture' },
        })
      report.unexpectedApi.push(url.pathname)
      return route.fulfill({
        status: 404,
        json: { detail: 'Not an allowed synthetic read' },
      })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) =>
      report.errors.push({ case: item.name, message: error.message }),
    )
    await page.goto(`${base}#workbench`)
    const zh = item.locale === 'zh'
    const query = page.locator('.wf-querybar-primary')
    const search = query.getByRole('searchbox', {
      name: zh ? '搜索' : 'Search',
      exact: true,
    })
    await search.waitFor()
    await page
      .locator(
        '.wf-desktop-table .wf-title-button, .wf-mobile-list .wf-title-button',
      )
      .first()
      .waitFor({ state: 'attached' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    async function snapshot(suffix = '') {
      const name = `${item.name}${suffix}.png`
      await page.screenshot({ path: resolve(out, name), fullPage: true })
      report.screenshots.push(name)
    }
    async function geometry(label) {
      const result = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector)
          if (!element) return null
          const rect = element.getBoundingClientRect()
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        }
        return {
          document: document.documentElement.scrollWidth,
          viewport: innerWidth,
          search: box('.wf-search-input'),
          query: box('.wf-querybar-primary'),
          tools: box('.wf-table-tools'),
          view: box('.wf-result-view'),
          resultsToolbar: box('.wf-results-toolbar'),
          inspector: box('.wf-inspector'),
          results: box('.wf-results'),
        }
      })
      report.geometry.push({ case: item.name, label, ...result })
      assert.ok(
        result.document <= result.viewport + 1,
        `${item.name}: document overflow`,
      )
      if (phase === 'after') {
        assert.ok(
          result.resultsToolbar,
          'Views have a separate results toolbar',
        )
        assert.ok(
          result.view.y >= result.query.y + result.query.height,
          'View switch is outside the query row',
        )
        if (result.tools) {
          assert.ok(
            Math.abs(result.tools.y - result.view.y) <= 12,
            'Columns sits with result view controls',
          )
          assert.ok(
            result.tools.x > result.view.x,
            'Columns is at the upper right',
          )
          assert.ok(
            result.tools.x + result.tools.width <=
              result.results.x + result.results.width,
            'Columns belongs to the table, not the inspector',
          )
        }
        assert.ok(
          result.search.width >= (item.width >= 1000 ? 280 : 120),
          `${item.name}: search has useful width (${result.search.width})`,
        )
      }
      report.checks.push(
        `${item.name}: ${label} geometry and no document overflow`,
      )
    }
    await snapshot()
    await geometry('default')
    const taskTrigger = page
      .locator(
        item.width <= 650
          ? '.wf-mobile-list .wf-title-button'
          : '.wf-desktop-table .wf-title-button',
      )
      .first()
    await taskTrigger.click()
    await page.locator('.wf-task-inspector h2').waitFor()
    await snapshot('-inspector')
    await geometry('inspector')
    if (phase === 'after') {
      await page.keyboard.press('Escape')
      await page.locator('.wf-task-inspector').waitFor({ state: 'hidden' })
      await search.fill('触控布局')
      assert.equal(
        await page.locator('.wf-result-count').innerText(),
        zh ? '32 项任务' : '32 tasks',
      )
      await search.press('Enter')
      await page.waitForFunction(() => location.hash.includes('q='))
      assert.equal(
        await page.locator('.wf-result-count').innerText(),
        zh ? '5 项任务' : '5 tasks',
      )
      report.checks.push(`${item.name}: draft search commits only on Enter`)
      await query
        .getByRole('button', {
          name: zh ? '清除筛选' : 'Clear filters',
          exact: true,
        })
        .click()
      await page.waitForFunction(() => !location.hash.includes('q='))
      if (item.width <= 650) {
        await search.fill('保留未提交草稿')
        const mode = query.getByRole('combobox', {
          name: /^查询模式|^Query mode/,
        })
        await mode.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('option', { name: 'JQL', exact: true }).click()
        const jql = query.getByRole('textbox', {
          name: zh ? 'JQL 查询' : 'JQL query',
          exact: true,
        })
        await jql.fill('ORDER BY created DESC')
        await mode.click()
        await page
          .getByRole('option', { name: zh ? '基本' : 'Basic', exact: true })
          .click()
        assert.equal(await search.inputValue(), '保留未提交草稿')
        assert.equal(
          await page.locator('.wf-result-count').innerText(),
          zh ? '32 项任务' : '32 tasks',
        )
        await query
          .getByRole('button', {
            name: zh ? '清除筛选' : 'Clear filters',
            exact: true,
          })
          .click()
        report.checks.push(
          `${item.name}: adaptive query-mode selector is keyboard operable and preserves drafts`,
        )
      }
      await page
        .getByRole('radio', { name: zh ? '看板' : 'Board', exact: true })
        .click()
      await page.locator('.wb-board-scroll').waitFor()
      await snapshot('-board')
      await page
        .getByRole('radio', { name: zh ? '任务列表' : 'Tasks', exact: true })
        .click()
      await page.locator('.wf-list-body').waitFor()
      report.checks.push(`${item.name}: view switch preserves working results`)
    }
    await context.close()
  }
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.writes, [])
  assert.deepEqual(report.unexpectedApi, [])
} finally {
  await writeFile(
    resolve(out, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  await browser.close()
}
console.log(
  JSON.stringify({
    phase,
    checks: report.checks.length,
    screenshots: report.screenshots.length,
    out,
  }),
)
