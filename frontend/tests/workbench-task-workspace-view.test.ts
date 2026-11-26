import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap, Task } from '../src/workbench/api'
import type { TaskDetail } from '../src/workbench/task-detail'
import { TaskWorkspace } from '../src/workbench/TaskWorkspace'

const mocks = vi.hoisted(() => ({
  buttons: [] as Record<string, any>[],
  segments: [] as Record<string, any>[],
  reads: [] as Record<string, any>[],
  projects: [] as Record<string, any>[],
  runs: [] as Record<string, any>[],
  read: {} as Record<string, any>,
  project: {} as Record<string, any>,
  turns: {} as Record<string, any>,
  location: {} as Record<string, any>,
  paging: undefined as Record<string, any> | undefined,
  updates: [] as unknown[],
  push: vi.fn(() => true),
  admission: undefined as { current: Record<string, any> } | undefined,
  compact: false,
}))
vi.mock('../src/components/ui/useViewport', () => ({
  useCompactTaskList: () => mocks.compact,
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => [
      initial &&
      typeof initial === 'object' &&
      'taskId' in initial &&
      'page' in initial
        ? (mocks.paging ?? initial)
        : typeof initial === 'function'
          ? initial()
          : initial,
      (next: unknown) => mocks.updates.push(next),
    ],
    useRef: (initial: unknown) => {
      if (initial && typeof initial === 'object' && 'prepare' in initial) {
        mocks.admission ??= { current: initial as Record<string, any> }
        return mocks.admission
      }
      return actual.useRef(initial)
    },
    lazy: () => (props: Record<string, any>) => {
      mocks.runs.push(props)
      return createElement('div', { 'data-run-workspace': props.runId })
    },
  }
})
vi.mock('../src/components/ui', () => ({
  AppButton: (props: Record<string, any>) => {
    mocks.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      {
        href: props.href,
        'aria-label': props.label,
        'aria-disabled': props.href ? props.disabled : undefined,
        disabled: props.href ? undefined : props.disabled,
        className: props.className,
        'data-task-history-page': props['data-task-history-page'],
      },
      props.children as ReactNode,
      props.endContent as ReactNode,
    )
  },
  AppSegments: (props: Record<string, any>) => {
    mocks.segments.push(props)
    return createElement(
      'div',
      { 'aria-label': props.label },
      props.options.map((option: Record<string, string>) =>
        createElement('span', { key: option.value }, option.label),
      ),
    )
  },
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppLoading: ({ label }: { label: string }) =>
    createElement('p', { role: 'status' }, label),
  AppTextArea: (props: Record<string, any>) =>
    createElement('textarea', {
      'aria-label': props.label,
      value: props.value,
      readOnly: true,
    }),
}))
vi.mock('../src/components/ui/DraftGuard', () => ({
  AppDraftGuard: () => null,
}))
vi.mock('../src/workbench/useTaskTurns', () => ({
  useTaskTurns: () => mocks.turns,
}))
vi.mock('../src/workbench/useTaskWorkspace', () => ({
  useTaskWorkspace: (args: Record<string, any>) => {
    mocks.reads.push(args)
    return mocks.read
  },
}))
vi.mock('../src/workbench/useProjectDetail', () => ({
  useProjectDetail: (args: Record<string, any>) => {
    mocks.projects.push(args)
    return mocks.project
  },
}))
vi.mock('../src/workbench/task-workspace-location', () => ({
  readTaskWorkspaceLocation: () => mocks.location,
  taskWorkspaceHref: (
    id: string,
    options: { tab?: string; runId?: string } = {},
  ) => {
    const params = new URLSearchParams()
    if (options.tab) params.set('taskTab', options.tab)
    if (options.runId) params.set('taskRun', options.runId)
    return `#task/${encodeURIComponent(id)}${params.size ? `?${params}` : ''}`
  },
}))
vi.mock('../src/workbench/navigation-guard', () => ({
  pushWorkbenchNavigation: (...args: unknown[]) => mocks.push(...args),
}))

const t = (_zh: string, en: string) => en
const task: Task = {
  id: 'exact-task',
  project_id: 'exact-project',
  title: 'Task workspace acceptance',
  goal: 'Task goal from exact task snapshot',
  acceptance: 'Exact acceptance, not a project summary',
  files: ['src/allowed.ts', 'docs/long-file-name.md'],
  created_at: '2026-11-21T00:00:00Z',
}
const project = {
  id: task.project_id,
  name: 'Exact full project',
  goal: 'Project goal read from complete project resource',
  directory: '.',
  notes: 'Notes are not a goal',
}
const data = {
  workspace: '/synthetic/task-workspace',
  projects: [
    {
      ...project,
      goal: 'Poison Bootstrap project goal',
      name: 'Poison Bootstrap project',
    },
  ],
  tasks: [{ ...task, goal: 'Poison Bootstrap task goal' }],
  runs: [],
  models: [{ id: 'model-existing' }],
  capabilities: { task_detail: true, project_detail: true },
} as unknown as Bootstrap

function detail(withRun = true, page = 1): TaskDetail {
  const latest = {
    id: 'latest-run',
    task_id: task.id,
    status: 'succeeded',
    created_at: '2026-11-21T01:00:00Z',
  }
  return {
    schema_version: 1,
    unit: 'task_detail',
    item: {
      id: task.id,
      task: { ...task, files: [...task.files] },
      projectName: project.name,
      run: withRun ? latest : undefined,
      column: withRun ? 'completed' : 'pending',
      attempts: withRun ? 23 : 0,
    },
    history: {
      unit: 'runs',
      items: withRun
        ? [
            page === 1
              ? latest
              : {
                  ...latest,
                  id: 'old-failed-run',
                  status: 'failed',
                  created_at: '2026-11-20T00:00:00Z',
                },
          ]
        : [],
      total: withRun ? 23 : 0,
      requested_page: page,
      page,
      page_size: 20,
      total_pages: withRun ? 2 : 1,
      has_more: withRun && page === 1,
      order: 'created-desc-source-v1',
    },
  }
}
function render(overrides: Partial<Parameters<typeof TaskWorkspace>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(TaskWorkspace, {
      taskId: task.id,
      data,
      refreshRevision: 7,
      t,
      locale: 'en',
      legacyUrl: '/classic',
      onPrepare: vi.fn(),
      ...overrides,
    }),
  )
}
const button = (name: string) =>
  mocks.buttons.find((candidate) => candidate.label === name)!

beforeEach(() => {
  mocks.buttons = []
  mocks.segments = []
  mocks.reads = []
  mocks.projects = []
  mocks.runs = []
  mocks.paging = undefined
  mocks.updates = []
  mocks.admission = undefined
  mocks.compact = false
  mocks.location = { tab: 'goal' }
  mocks.push.mockReset()
  mocks.push.mockReturnValue(true)
  mocks.read = {
    remote: true,
    value: detail(),
    busy: false,
    error: undefined,
    retry: vi.fn(),
  }
  mocks.project = {
    remote: true,
    value: { project },
    busy: false,
    error: undefined,
    retry: vi.fn(),
  }
  mocks.turns = {
    remote: false,
    value: undefined,
    busy: false,
    error: undefined,
    retry: vi.fn(),
  }
})

describe('Task workspace composition', () => {
  it.each([undefined, false, true])(
    'passes only explicit pytest capability to the implementation dialog: %j',
    (coding_pytest) => {
      mocks.location = {
        tab: 'goal',
        codingRequestId: 'original-coding-request',
      }
      render({
        data: {
          ...data,
          capabilities: {
            ...data.capabilities,
            isolated_coding: true,
            coding_pytest,
          },
        },
      })
      expect(
        mocks.runs.find((props) => 'pytestEnabled' in props)?.pytestEnabled,
      ).toBe(coding_pytest === true)
    },
  )
  it('uses named icon-only Task tabs on narrow screens and keeps all four destinations', () => {
    mocks.compact = true
    render()
    expect(mocks.segments[0].iconOnly).toBe(true)
    expect(
      mocks.segments[0].options.map((option: Record<string, any>) => [
        option.value,
        option.label,
        Boolean(option.icon),
      ]),
    ).toEqual([
      ['goal', 'Goal & acceptance', true],
      ['conversation', 'Conversation', true],
      ['work', 'Agent work', true],
      ['review', 'Artifact review', true],
    ])
  })
  it('shows exact project/task goals and acceptance as distinct sections without Bootstrap content', () => {
    const html = render()
    expect(html).toContain('data-testid="task-workspace"')
    expect(html).toContain('data-testid="project-goal"')
    expect(html).toContain('data-testid="task-goal"')
    expect(html).toContain(project.goal)
    expect(html).toContain(task.goal)
    expect(html).toContain(task.acceptance)
    expect(html).toContain('src/allowed.ts')
    expect(html).not.toContain('Poison Bootstrap')
    expect(html).not.toContain(project.notes)
    expect(html.indexOf('data-testid="project-goal"')).toBeLessThan(
      html.indexOf('data-testid="task-goal"'),
    )
    expect(mocks.reads[0]).toMatchObject({
      taskId: task.id,
      refreshRevision: 7,
      page: 1,
    })
    expect(mocks.projects[0]).toMatchObject({
      projectId: task.project_id,
      enabled: true,
    })
  })

  it('renders Task-latest success independently of an older failed history item', () => {
    mocks.read.value = detail(true, 2)
    mocks.paging = { taskId: task.id, page: 2 }
    const html = render()
    expect(html).toContain('latest-run')
    expect(html).toContain('old-failed-run')
    expect(html).toContain('Completed')
    expect(html).toContain('Failed')
    expect(html).toContain('21-23')
    expect(html).toContain('/ 23')
    expect(button('Next task history').disabled).toBe(true)
    expect(button('Previous task history').disabled).toBe(false)
  })

  it('prepares only the exact admitted Task on explicit click', () => {
    const onPrepare = vi.fn()
    render({ onPrepare })
    expect(onPrepare).not.toHaveBeenCalled()
    button('Arrange execution').onClick()
    expect(onPrepare).toHaveBeenCalledOnce()
    expect(onPrepare).toHaveBeenCalledWith(mocks.read.value.item.task)
    expect(onPrepare.mock.calls[0][0].files).toEqual(task.files)
  })

  it('blocks a retained Arrange handler after same-task data becomes busy', () => {
    const onPrepare = vi.fn()
    render({ onPrepare })
    const previous = button('Arrange execution').onClick
    mocks.read = { ...mocks.read, busy: true }
    render({ onPrepare })
    previous()
    expect(onPrepare).not.toHaveBeenCalled()
    expect(mocks.buttons.at(-1)).toBeDefined()
    expect(
      mocks.buttons.filter((p) => p.label === 'Arrange execution').at(-1)
        ?.disabled,
    ).toBe(true)
  })

  it('blocks a retained Arrange handler after the admitted Task snapshot changes', () => {
    const onPrepare = vi.fn()
    render({ onPrepare })
    const previous = button('Arrange execution').onClick
    mocks.read = {
      ...mocks.read,
      value: {
        ...detail(),
        item: {
          ...detail().item,
          task: { ...task, goal: 'New exact goal' },
        },
      },
    }
    render({ onPrepare })
    previous()
    expect(onPrepare).not.toHaveBeenCalled()
  })

  it('reports missing models and provides a real model configuration link', () => {
    const html = render({ data: { ...data, models: [] } })
    expect(html).toContain('No model configured')
    expect(button('Configure models').href).toBe('#models')
    expect(button('Arrange execution').disabled).toBe(true)
  })

  it('keeps project read failure separate and never substitutes the Bootstrap goal', () => {
    mocks.project = {
      ...mocks.project,
      value: undefined,
      error: 'forbidden',
    }
    const html = render()
    expect(html).toContain('Project details access is forbidden.')
    expect(html).not.toContain('Poison Bootstrap project goal')
    expect(html).toContain(task.goal)
    expect(button('Arrange execution').disabled).toBe(true)
    button('Retry project details').onClick()
    expect(mocks.project.retry).toHaveBeenCalledOnce()
  })

  it('uses a real legacy Project only when its detail capability is absent', () => {
    mocks.project = {
      remote: false,
      value: undefined,
      busy: false,
      retry: vi.fn(),
    }
    const legacy = {
      ...data,
      capabilities: { ...data.capabilities, project_detail: false },
      projects: [project],
    }
    expect(render({ data: legacy })).toContain(project.goal)
    expect(mocks.projects[0].projectId).toBe(task.project_id)
  })

  it('does not create a missing legacy Project from a reference name', () => {
    mocks.project = {
      remote: false,
      value: undefined,
      busy: false,
      retry: vi.fn(),
    }
    const html = render({ data: { ...data, projects: [] } })
    expect(html).toContain('The project goal could not be read.')
    expect(button('Arrange execution').disabled).toBe(true)
  })

  it.each(['forbidden', 'missing', 'unavailable', 'timeout', 'invalid'])(
    'hides all task business content and Run workspace after %s task error',
    (error) => {
      mocks.read = { ...mocks.read, value: undefined, error }
      mocks.location = { tab: 'work', runId: 'latest-run' }
      const html = render()
      expect(html).toContain('Task unavailable')
      expect(html).not.toContain(task.goal)
      expect(mocks.runs).toEqual([])
      expect(button('Arrange execution')).toBeUndefined()
      button('Retry task').onClick()
      expect(mocks.read.retry).toHaveBeenCalledOnce()
      expect(mocks.projects[0].enabled).toBe(false)
    },
  )

  it('shows initial loading without inventing a task or an execution surface', () => {
    mocks.read = { ...mocks.read, value: undefined, busy: true }
    const html = render()
    expect(html).toContain('Loading task')
    expect(html).not.toContain(task.title)
    expect(mocks.runs).toEqual([])
  })

  it('navigates latest work and review to exact task/run identities', () => {
    render()
    button('View Agent work').onClick()
    expect(mocks.push).toHaveBeenLastCalledWith(
      '#task/exact-task?taskTab=work&taskRun=latest-run',
    )
    button('Review artifacts').onClick()
    expect(mocks.push).toHaveBeenLastCalledWith(
      '#task/exact-task?taskTab=review&taskRun=latest-run',
    )
    button('View run latest-run').onClick()
    expect(mocks.push).toHaveBeenLastCalledWith(
      '#task/exact-task?taskTab=work&taskRun=latest-run',
    )
  })

  it('preserves explicit selected Run while changing the task view', () => {
    mocks.location = { tab: 'goal', runId: 'historic-run' }
    render()
    mocks.segments[0].onChange('review')
    expect(mocks.push).toHaveBeenLastCalledWith(
      '#task/exact-task?taskTab=review&taskRun=historic-run',
    )
  })

  it.each([
    ['work', 'work'],
    ['review', 'artifacts'],
  ])(
    'reuses the exact Run workspace for %s with expected task binding',
    (tab, initialTab) => {
      mocks.location = { tab, runId: 'historical-exact-run' }
      const html = render()
      expect(mocks.runs).toHaveLength(1)
      expect(mocks.runs[0]).toMatchObject({
        runId: 'historical-exact-run',
        expectedTaskId: task.id,
        embedded: true,
        initialTab,
        locale: 'en',
      })
      expect(html).not.toContain(task.acceptance)
      expect(button('Open standalone run').href).toBe(
        '#run/historical-exact-run',
      )
    },
  )

  it('keeps the retained embedded execution inert during task refresh', () => {
    mocks.location = { tab: 'work' }
    mocks.read = { ...mocks.read, busy: true }
    expect(render()).toContain('inert=""')
    expect(mocks.runs[0].runId).toBe('latest-run')
  })

  it('uses no-run views without fetching a Run or inventing a graph', () => {
    mocks.location = { tab: 'work' }
    mocks.read = { ...mocks.read, value: detail(false) }
    const onPrepare = vi.fn()
    const html = render({ onPrepare })
    expect(html).toContain('Agent work has not started')
    expect(mocks.runs).toEqual([])
    const action = mocks.buttons
      .filter((p) => p.label === 'Arrange execution')
      .at(-1)!
    action.onClick()
    expect(onPrepare).toHaveBeenCalledWith(mocks.read.value.item.task)
  })

  it('fails closed on invalid task view parameters and clears only through admitted navigation', () => {
    mocks.location = { tab: 'goal', error: 'tab_invalid' }
    const html = render()
    expect(html).toContain('The task view or run identifier is invalid.')
    expect(html).not.toContain('data-testid="task-goal"')
    expect(mocks.runs).toEqual([])
    expect(button('Arrange execution').disabled).toBe(true)
    button('Clear task view').onClick()
    expect(mocks.push).toHaveBeenCalledWith('#task/exact-task')
  })

  it('changes history locally and bounds previous/next against the admitted page', () => {
    vi.stubGlobal('document', { activeElement: null })
    try {
      render()
      button('Next task history').onClick()
      expect(mocks.updates).toEqual([{ taskId: task.id, page: 2 }])
      expect(mocks.push).not.toHaveBeenCalled()
      button('Previous task history').onClick()
      expect(mocks.updates).toHaveLength(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resets the history page when Task identity changes', () => {
    mocks.paging = { taskId: 'previous-task', page: 4 }
    render()
    expect(mocks.reads[0].page).toBe(1)
  })
})
