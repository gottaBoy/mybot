import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
} from '../src/workbench/task-workspace-location'
import {
  readLegacyTaskWorkspace,
  useTaskWorkspace,
} from '../src/workbench/useTaskWorkspace'

function bootstrap(): Bootstrap {
  return {
    workspace: '/task-workspace',
    projects: [
      {
        id: 'project-a',
        name: 'Project A',
        goal: 'Project goal',
        directory: '.',
        notes: 'Notes',
      },
    ],
    tasks: [
      {
        id: 'task-a',
        project_id: 'project-a',
        title: 'Task A',
        goal: 'Task goal',
        acceptance: 'Acceptance',
        files: ['README.md'],
        created_at: '2026-11-21T00:00:00Z',
      },
      {
        id: 'task-b',
        project_id: 'project-a',
        title: 'Task B',
        goal: 'Pending goal',
        acceptance: '',
        files: [],
        created_at: '2026-11-21T00:01:00Z',
      },
    ],
    runs: Array.from({ length: 45 }, (_, index) => ({
      id: `run-${index}`,
      task_id: 'task-a',
      status: index === 44 ? 'succeeded' : 'failed',
      created_at: `2026-11-21T01:${String(index).padStart(2, '0')}:00Z`,
      error: 'Private old error',
    })).reverse(),
    models: [],
    backends: [],
    local_harnesses: [],
    default_model_id: '',
    capabilities: { backend_sync: false },
  }
}

function readHook(
  data: Bootstrap,
  options: { taskId?: string; page?: number; enabled?: boolean } = {},
) {
  let result: ReturnType<typeof useTaskWorkspace> | undefined
  function Probe() {
    result = useTaskWorkspace({
      data,
      taskId: options.taskId ?? 'task-a',
      page: options.page ?? 1,
      enabled: options.enabled,
      refreshRevision: 0,
    })
    return createElement('div')
  }
  renderToStaticMarkup(createElement(Probe))
  return result!
}

afterEach(() => vi.unstubAllGlobals())

describe('Task workspace URL contract', () => {
  it('has a stable goal route without unnecessary query fields', () => {
    expect(taskWorkspaceHref('task-a')).toBe('#task/task-a')
    expect(taskWorkspaceHref('task-a', { tab: 'goal' })).toBe('#task/task-a')
    expect(readTaskWorkspaceLocation('http://localhost/#task/task-a')).toEqual({
      tab: 'goal',
    })
  })
  it.each(['goal', 'work', 'review'] as const)(
    'round-trips tab %s and an exact Run identifier',
    (tab) => {
      const href = taskWorkspaceHref('研发任务/a b?#', {
        tab,
        runId: 'run/中文 ?#&',
      })
      expect(
        href.startsWith(
          '#task/%E7%A0%94%E5%8F%91%E4%BB%BB%E5%8A%A1%2Fa%20b%3F%23',
        ),
      ).toBe(true)
      expect(readTaskWorkspaceLocation(`http://localhost/${href}`)).toEqual({
        tab,
        runId: 'run/中文 ?#&',
      })
    },
  )
  it.each(['', ' Task', 'Task ', '\ud800', 'x'.repeat(101)])(
    'rejects invalid task identifier %j',
    (id) => {
      expect(() => taskWorkspaceHref(id)).toThrow(
        'task_workspace_location_invalid',
      )
    },
  )
  it.each(['', ' run', 'run ', '\ud800', 'x'.repeat(101)])(
    'rejects invalid Run identifier %j',
    (runId) => {
      expect(() => taskWorkspaceHref('task-a', { runId })).toThrow()
    },
  )
  it('rejects a forged tab instead of silently navigating to another view', () => {
    expect(() =>
      taskWorkspaceHref('task-a', { tab: 'graph' as 'goal' }),
    ).toThrow()
  })
  it.each([
    'taskTab=',
    'taskTab=unknown',
    'taskTab=WORK',
    'taskTab=%20work',
    'taskTab=work&taskTab=review',
    'taskTab=work&%74askTab=work',
    'taskTab=%ED%A0%80',
    'taskTab=%',
  ])(
    'fails closed for invalid tab query %s without rewriting its source',
    (query) => {
      const href = `http://localhost/#task/task-a?${query}`
      expect(readTaskWorkspaceLocation(href)).toEqual({
        tab: 'goal',
        error: 'tab_invalid',
      })
      expect(href.endsWith(query)).toBe(true)
    },
  )
  it.each([
    'taskRun=',
    'taskRun=%20run',
    'taskRun=run%20',
    `taskRun=${'x'.repeat(101)}`,
    'taskRun=run&taskRun=other',
    'taskRun=run&task%52un=run',
    'taskRun=%ED%A0%80',
    'taskRun=%',
  ])('fails closed for invalid Run query %s', (query) => {
    expect(
      readTaskWorkspaceLocation(
        `http://localhost/#task/task-a?taskTab=review&${query}`,
      ),
    ).toEqual({
      tab: 'review',
      error: 'run_invalid',
    })
  })
  it('keeps unrelated query settings out of task view interpretation', () => {
    expect(
      readTaskWorkspaceLocation(
        'http://localhost/?taskTab=review#task/task-a?taskTab=work&view=board&page=99&jql=assignee%3Dme&mode=jql',
      ),
    ).toEqual({ tab: 'work' })
  })
})

describe('legacy Task workspace projection', () => {
  it('uses the real full Task and latest successful Run without interpreting history as current failure', () => {
    const data = bootstrap()
    const detail = readLegacyTaskWorkspace(data, 'task-a', 1)
    expect(detail.item.task).toEqual(data.tasks[0])
    expect(detail.item.projectName).toBe('Project A')
    expect(detail.item.run?.id).toBe('run-44')
    expect(detail.item.column).toBe('completed')
    expect(detail.item.attempts).toBe(45)
    expect(detail.history.total).toBe(45)
    expect(detail.history.items).toHaveLength(20)
    expect(detail.history.items.map((run) => run.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `run-${44 - index}`),
    )
    expect(detail.history.items[0]).not.toHaveProperty('error')
    expect(detail.item.run).not.toHaveProperty('error')
  })
  it('returns a genuine pending Task with a known empty history', () => {
    const detail = readLegacyTaskWorkspace(bootstrap(), 'task-b', 1)
    expect(detail.item.column).toBe('pending')
    expect(detail.item.run).toBeUndefined()
    expect(detail.history).toMatchObject({
      total: 0,
      page: 1,
      total_pages: 1,
      has_more: false,
      items: [],
    })
  })
  it('pages and clamps history independently from Task data', () => {
    const detail = readLegacyTaskWorkspace(bootstrap(), 'task-a', 99)
    expect(detail.history).toMatchObject({
      total: 45,
      requested_page: 99,
      page: 3,
      total_pages: 3,
      has_more: false,
    })
    expect(detail.history.items.map((run) => run.id)).toEqual([
      'run-4',
      'run-3',
      'run-2',
      'run-1',
      'run-0',
    ])
    expect(detail.item.run?.id).toBe('run-44')
  })
  it('preserves original source order for equal creation times', () => {
    const data = bootstrap()
    data.runs = data.runs.slice(0, 3).map((run) => ({
      ...run,
      created_at: '2026-11-21T01:00:00Z',
    }))
    const detail = readLegacyTaskWorkspace(data, 'task-a', 1)
    expect(detail.item.run?.id).toBe(data.runs[0].id)
    expect(detail.history.items.map((run) => run.id)).toEqual(
      data.runs.map((run) => run.id),
    )
  })
  it('excludes other Tasks and orphan Runs from this history', () => {
    const data = bootstrap()
    data.runs.unshift({
      id: 'unrelated',
      task_id: 'missing-task',
      status: 'running',
      created_at: '2026-11-22T00:00:00Z',
    })
    const detail = readLegacyTaskWorkspace(data, 'task-a', 1)
    expect(detail.history.total).toBe(45)
    expect(detail.history.items.some((run) => run.id === 'unrelated')).toBe(
      false,
    )
  })
  it('copies mutable Task/file/Run values without changing the Bootstrap snapshot', () => {
    const data = bootstrap()
    const before = structuredClone(data)
    const detail = readLegacyTaskWorkspace(data, 'task-a', 1)
    detail.item.task.files.push('changed')
    detail.item.task.goal = 'changed'
    detail.item.run!.status = 'changed'
    detail.history.items[0].status = 'changed'
    expect(data).toEqual(before)
  })
  it('requires a real matching Project and never manufactures one from a name', () => {
    const data = bootstrap()
    data.projects = []
    expect(() => readLegacyTaskWorkspace(data, 'task-a', 1)).toThrow(
      'task_workspace_missing',
    )
  })
  it('reports a missing Task instead of selecting the first available Task', () => {
    expect(() => readLegacyTaskWorkspace(bootstrap(), 'missing', 1)).toThrow(
      'task_workspace_missing',
    )
  })
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER])(
    'rejects invalid history page %s',
    (page) => {
      expect(() =>
        readLegacyTaskWorkspace(bootstrap(), 'task-a', page),
      ).toThrow()
    },
  )
})

describe('Task workspace hook admission', () => {
  it('returns a local full snapshot when the capability is absent, without any fetch', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const result = readHook(bootstrap())
    expect(result.remote).toBe(false)
    expect(result.busy).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.value?.item.id).toBe('task-a')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps false capability on the same real legacy path', () => {
    const data = bootstrap()
    data.capabilities.task_detail = false
    expect(readHook(data).value?.item.id).toBe('task-a')
  })
  it('does not expose Bootstrap fallback during an advertised initial detail read', () => {
    const data = bootstrap()
    data.capabilities.task_detail = true
    const result = readHook(data)
    expect(result.remote).toBe(true)
    expect(result.value).toBeUndefined()
    expect(result.busy).toBe(true)
    expect(result.error).toBeUndefined()
  })
  it('leaves unavailable legacy objects explicitly missing', () => {
    const result = readHook(bootstrap(), { taskId: 'missing' })
    expect(result.value).toBeUndefined()
    expect(result.error).toBe('missing')
    expect(result.busy).toBe(false)
  })
  it.each([true, false])(
    'invalid ID/page is an error without an indefinite loading state (cap=%s)',
    (remote) => {
      const data = bootstrap()
      data.capabilities.task_detail = remote
      for (const options of [
        { taskId: '' },
        { taskId: ' task-a' },
        { page: 0 },
      ]) {
        const result = readHook(data, options)
        expect(result.value).toBeUndefined()
        expect(result.error).toBe('invalid')
        expect(result.busy).toBe(false)
      }
    },
  )
  it.each([true, false])(
    'disabling the consumer hides private snapshots and errors (cap=%s)',
    (remote) => {
      const data = bootstrap()
      data.capabilities.task_detail = remote
      const result = readHook(data, { taskId: 'missing', enabled: false })
      expect(result.value).toBeUndefined()
      expect(result.error).toBeUndefined()
      expect(result.busy).toBe(false)
    },
  )
})
