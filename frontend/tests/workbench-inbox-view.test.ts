import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type { WorkItem } from '../src/workbench/projections'
import type { ServerTaskQueryPage } from '../src/workbench/task-query'
import type { ListLocation } from '../src/workbench/list-location'
import { prepareInboxRequest } from '../src/workbench/inbox-query'
import { WorkInbox } from '../src/workbench/WorkspacePages'

const mocks = vi.hoisted(() => ({
  buttons: [] as Record<string, any>[],
  inputs: [] as Record<string, any>[],
  segments: [] as Record<string, any>[],
  selects: [] as Record<string, any>[],
  queryArgs: [] as Record<string, any>[],
  detailArgs: [] as Record<string, any>[],
  compact: false,
  list: {} as Record<string, any>,
  detail: {} as Record<string, any>,
  states: new Map<number, unknown>(),
  stateIndex: 0,
  updates: [] as Array<[number, unknown]>,
  admission: undefined as { current: Record<string, any> } | undefined,
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateIndex++
      const value = mocks.states.has(index) ? mocks.states.get(index) : initial
      return [value, (next: unknown) => mocks.updates.push([index, next])]
    },
    useRef: (initial: unknown) => {
      if (
        initial &&
        typeof initial === 'object' &&
        'list' in initial &&
        'detail' in initial
      ) {
        mocks.admission ??= { current: initial as Record<string, any> }
        return mocks.admission
      }
      return actual.useRef(initial)
    },
  }
})
vi.mock('../src/components/ui', () => ({
  AppButton: (props: Record<string, any>) => {
    mocks.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      {
        'aria-label': props.label,
        className: props.className,
        href: props.href,
        disabled: props.href ? undefined : props.disabled,
        'aria-disabled': props.href ? props.disabled : undefined,
        'data-inbox-task': props['data-inbox-task'],
        'data-inbox-page': props['data-inbox-page'],
      },
      props.children as ReactNode,
    )
  },
  AppInput: (props: Record<string, any>) => {
    mocks.inputs.push(props)
    return createElement('input', {
      'aria-label': props.label,
      value: props.value,
      readOnly: true,
    })
  },
  AppSegments: (props: Record<string, any>) => {
    mocks.segments.push(props)
    return createElement('div', { 'aria-label': props.label })
  },
  AppSelect: (props: Record<string, any>) => {
    mocks.selects.push(props)
    return createElement('select', { 'aria-label': props.label })
  },
  AppDialog: (props: Record<string, any>) =>
    createElement(
      'div',
      { role: 'dialog', 'aria-label': props.title },
      props.children,
    ),
  AppLoading: ({ label }: { label: string }) =>
    createElement('p', { role: 'status' }, label),
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppProgress: () => null,
}))
vi.mock('../src/components/ui/DataTable', () => ({ AppTreeTable: () => null }))
vi.mock('../src/components/ui/useViewport', () => ({
  useCompactTaskList: () => mocks.compact,
}))
vi.mock('../src/workbench/useInboxQuery', () => ({
  useInboxQuery: (args: Record<string, any>) => {
    mocks.queryArgs.push(args)
    return mocks.list
  },
}))
vi.mock('../src/workbench/useInboxDetail', () => ({
  useInboxDetail: (args: Record<string, any>) => {
    mocks.detailArgs.push(args)
    return args.enabled
      ? mocks.detail
      : { ...mocks.detail, value: undefined, busy: false, error: undefined }
  },
}))

const t = (_zh: string, en: string) => en
const location: ListLocation = {
  query: 'authoritative match',
  mode: 'basic',
  jql: '',
  group: 'none',
  groupBy: '',
  page: 1,
  pageSize: 20,
}
const data = {
  workspace: '/synthetic/inbox-view',
  projects: [{ id: 'poison-project', name: 'Poison project' }],
  tasks: [
    {
      id: 'poison-task',
      project_id: 'poison-project',
      title: 'Poison Bootstrap task',
      goal: 'Poison goal',
      acceptance: 'Poison acceptance',
      files: [],
    },
  ],
  runs: [],
  capabilities: { task_query: true, task_detail: true },
} as unknown as Bootstrap
function item(id = 'remote-task', state = 'attention'): WorkItem {
  const run =
    state === 'pending'
      ? undefined
      : {
          id: `exact-run-${id}`,
          task_id: id,
          status: state === 'completed' ? 'succeeded' : 'failed',
          created_at: '2026-11-20T01:00:00Z',
        }
  return {
    id,
    task: {
      id,
      project_id: 'remote-project',
      title: `Server ${id}`,
      goal: `Server goal ${id}`,
      acceptance: 'Actual acceptance',
      files: ['exact-file.md'],
      created_at: '2026-11-20T00:00:00Z',
    },
    projectName: 'Server project',
    run,
    column: state as WorkItem['column'],
    attempts: run ? 3 : 0,
  }
}
function page(
  items = [item()],
  total = 45,
  currentPage = 1,
): ServerTaskQueryPage {
  return {
    schema_version: 1,
    unit: 'tasks',
    items,
    total,
    requested_page: currentPage,
    page: currentPage,
    page_size: 20,
    total_pages: Math.max(1, Math.ceil(total / 20)),
    has_more: currentPage < Math.ceil(total / 20),
    query: {
      text: location.query!,
      projects: [],
      states: ['pending', 'attention'],
      mode: 'basic',
      jql: '',
    },
    sorts: [],
    scope_project_id: null,
    sort_semantics: 'unicode-natural-v1',
  }
}
function key(loc = location) {
  return JSON.stringify([
    data.workspace,
    prepareInboxRequest({
      query: loc.query ?? '',
      type: 'all',
      page: loc.page ?? 1,
      pageSize: loc.pageSize ?? 20,
    }),
  ])
}
function render(overrides: Partial<Parameters<typeof WorkInbox>[0]> = {}) {
  mocks.stateIndex = 0
  const props = {
    data,
    t,
    location,
    refreshRevision: 0,
    onPrepare: vi.fn(),
    onNewTask: vi.fn(),
    onLocationChange: vi.fn(),
    ...overrides,
  }
  const html = renderToStaticMarkup(createElement(WorkInbox, props))
  return { html, props }
}
function button(label: string) {
  return mocks.buttons.findLast((button) => button.label === label)!
}
beforeEach(() => {
  mocks.buttons = []
  mocks.inputs = []
  mocks.segments = []
  mocks.selects = []
  mocks.queryArgs = []
  mocks.detailArgs = []
  mocks.states.clear()
  mocks.stateIndex = 0
  mocks.updates = []
  mocks.compact = false
  mocks.admission = undefined
  mocks.list = {
    remote: true,
    value: page(),
    busy: false,
    error: undefined,
    retry: vi.fn(),
  }
  mocks.detail = {
    remote: true,
    value: item(),
    busy: false,
    error: undefined,
    retry: vi.fn(),
  }
  vi.stubGlobal('document', {
    activeElement: null,
    body: {},
    querySelector: () => null,
  })
  vi.stubGlobal('requestAnimationFrame', vi.fn())
})

describe('bounded Inbox presentation', () => {
  it('uses authoritative server row order/counts and fresh selected details without Bootstrap supplementation', () => {
    mocks.list.value = page([item('zulu'), item('alpha')])
    mocks.detail.value = item('zulu')
    const { html } = render()
    expect(html.indexOf('Server zulu')).toBeLessThan(
      html.indexOf('Server alpha'),
    )
    expect(html).toContain('45 items')
    expect(html).toContain('1-20')
    expect(html).toContain('Actual acceptance')
    expect(html).toContain('exact-file.md')
    expect(html).not.toContain('Poison')
    expect(mocks.detailArgs.at(-1)?.item.id).toBe('zulu')
    expect(button('Open run').href).toBe('#run/exact-run-zulu')
    expect(button('Open project').href).toBe('#project/remote-project')
  })

  it('keeps raw input edits local, submits normalized search once and scopes without committing its pending text', () => {
    mocks.states.set(1, '  draft candidate  ')
    const { props } = render()
    expect(mocks.queryArgs.at(-1)?.request.query).toBe(location.query)
    expect(props.onLocationChange).not.toHaveBeenCalled()
    mocks.segments[0].onChange('pending')
    expect(props.onLocationChange).toHaveBeenLastCalledWith({
      inboxType: 'pending',
      page: 1,
    })
    expect(mocks.updates).toEqual([])
    button('Search').onClick()
    expect(props.onLocationChange).toHaveBeenLastCalledWith({
      query: 'draft candidate',
      page: 1,
    })
  })

  it('does not discard a draft if the shared navigation guard refuses Search or Clear', () => {
    mocks.states.set(1, 'dirty')
    const blocked = vi.fn(() => false)
    render({ onLocationChange: blocked })
    button('Search').onClick()
    button('Clear inbox').onClick()
    expect(blocked).toHaveBeenCalledTimes(2)
    expect(mocks.updates).toEqual([])
  })

  it('fails closed for invalid Inbox types and clears unsupported query conditions atomically', () => {
    const { html, props } = render({
      location: {
        ...location,
        inboxType: 'unknown',
        jql: 'assignee = currentUser()',
      },
    })
    expect(html).toContain('Invalid inbox type.')
    expect(html).not.toContain('Server remote-task')
    expect(mocks.queryArgs.at(-1)?.enabled).toBe(false)
    expect(mocks.detailArgs.at(-1)?.enabled).toBe(false)
    button('Clear inbox').onClick()
    expect(props.onLocationChange).toHaveBeenCalledWith(
      expect.objectContaining({
        query: undefined,
        inboxType: undefined,
        page: 1,
        jql: '',
        project: undefined,
        projects: undefined,
        states: undefined,
        filter: undefined,
        groupBy: '',
        group: 'none',
      }),
    )
  })

  it.each([
    { jql: 'ORDER BY CREATED DESC' },
    { project: 'project-a' },
    { projects: ['project-a'] },
    { states: ['completed' as const] },
    { filter: 'active' as const },
    { groupBy: 'project' },
    { conditionsInvalid: true as const },
  ])(
    'blocks unsupported Inbox query fields %j rather than returning all rows',
    (unsupported) => {
      const { html } = render({ location: { ...location, ...unsupported } })
      expect(html).toContain('These query conditions are not supported')
      expect(html).not.toContain('Server remote-task')
      expect(mocks.queryArgs.at(-1)?.enabled).toBe(false)
    },
  )

  it('offers exact server page/capacity commands and blocks invalid capacity candidates', () => {
    const { props } = render()
    expect(button('Previous inbox page').disabled).toBe(true)
    expect(button('Next inbox page').disabled).toBe(false)
    button('Next inbox page').onClick()
    expect(props.onLocationChange).toHaveBeenLastCalledWith({ page: 2 })
    mocks.selects[0].onChange('50')
    expect(props.onLocationChange).toHaveBeenLastCalledWith({
      pageSize: 50,
      page: 1,
    })
    const count = vi.mocked(props.onLocationChange).mock.calls.length
    mocks.selects[0].onChange('30')
    expect(vi.mocked(props.onLocationChange).mock.calls).toHaveLength(count)
  })

  it('hides rows after a list failure, reports unknown count and offers read-only retry', () => {
    mocks.list = { ...mocks.list, value: undefined, error: 'forbidden' }
    const { html } = render()
    expect(html).toContain('Inbox access is forbidden.')
    expect(html).toContain('- items')
    expect(html).not.toContain('Server remote-task')
    expect(mocks.detailArgs.at(-1)?.enabled).toBe(false)
    button('Retry inbox').onClick()
    expect(mocks.list.retry).toHaveBeenCalledOnce()
  })

  it('never falls back to list fields when advertised detail fails', () => {
    mocks.detail = { ...mocks.detail, value: undefined, error: 'unavailable' }
    const { html } = render()
    expect(html).toContain('Task details are unavailable or removed.')
    expect(html).not.toContain('Actual acceptance')
    expect(button('Review & run')).toBeUndefined()
    expect(button('Open run')).toBeUndefined()
    button('Retry inbox details').onClick()
    expect(mocks.detail.retry).toHaveBeenCalledOnce()
  })

  it('uses admitted list DTO as a snapshot when detail capability is absent', () => {
    mocks.detail.remote = false
    const { html } = render({
      data: {
        ...data,
        capabilities: { ...data.capabilities, task_detail: false },
      },
    })
    expect(html).toContain('Actual acceptance')
    expect(button('Open run').href).toBe('#run/exact-run-remote-task')
  })

  it('removes actions when fresh details leave the Inbox type and offers only a refresh', () => {
    mocks.detail.value = item('remote-task', 'completed')
    const { html } = render()
    expect(html).toContain('Selected task is no longer in this inbox')
    expect(button('Open run')).toBeUndefined()
    button('Refresh inbox').onClick()
    expect(mocks.list.retry).toHaveBeenCalledOnce()
  })

  it('passes the exact fresh Task to Review rather than the stale list Task', () => {
    mocks.list.value = page([item('remote-task', 'pending')])
    const fresh = item('remote-task', 'pending')
    fresh.task.acceptance = 'Fresh acceptance'
    fresh.task.files = ['fresh-explicit.md']
    mocks.detail.value = fresh
    const { props } = render()
    button('Review & run').onClick()
    expect(props.onPrepare).toHaveBeenCalledExactlyOnceWith(fresh.task)
  })

  it('blocks current and retained action handlers while busy and after the selected snapshot changes', () => {
    mocks.list.value = page([item('remote-task', 'pending')])
    mocks.detail.value = item('remote-task', 'pending')
    const { props } = render()
    const oldReview = button('Review & run')
    const oldRow = button('Server remote-task')
    const oldNext = button('Next inbox page')
    mocks.list.busy = true
    render()
    oldReview.onClick()
    oldRow.onClick({ currentTarget: {} })
    oldNext.onClick()
    expect(props.onPrepare).not.toHaveBeenCalled()
    expect(props.onLocationChange).not.toHaveBeenCalled()
    expect(mocks.updates).toEqual([])
    mocks.list.busy = false
    mocks.detail.value = { ...item('remote-task', 'pending'), attempts: 1 }
    render()
    oldReview.onClick()
    expect(props.onPrepare).not.toHaveBeenCalled()
  })

  it('preserves an explicit removed selection as unavailable instead of choosing another task', () => {
    mocks.states.set(3, { key: key(), id: 'removed-task' })
    const { html } = render()
    expect(html).toContain('Selected task is no longer in these results')
    expect(html).not.toContain('Actual acceptance')
    expect(mocks.detailArgs.at(-1)?.enabled).toBe(false)
  })

  it('does not request mobile details until an explicit row opens the one dialog', () => {
    mocks.compact = true
    let result = render()
    expect(mocks.detailArgs.at(-1)?.enabled).toBe(false)
    expect(result.html).not.toContain('role="dialog"')
    mocks.states.set(3, { key: key(), id: 'remote-task' })
    mocks.states.set(4, true)
    result = render()
    expect(mocks.detailArgs.at(-1)?.enabled).toBe(true)
    expect(result.html.match(/role="dialog"/g)).toHaveLength(1)
    expect(result.html).not.toContain('class="wb-inbox-detail"')
  })

  it('keeps the original local projection when task_query is unavailable', () => {
    mocks.list.remote = false
    const local = {
      ...data,
      capabilities: { task_query: false, task_detail: false },
    }
    const { html } = render({ data: local })
    expect(html).toContain('Poison Bootstrap task')
    expect(html).not.toContain('Server remote-task')
    expect(html).not.toContain('inbox-range')
    expect(button('Search')).toBeUndefined()
    expect(button('Review & run')).toBeDefined()
  })
})
