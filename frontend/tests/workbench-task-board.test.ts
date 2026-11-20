import {
  createElement,
  isValidElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type {
  TaskBoardColumn,
  TaskBoardPage,
} from '../src/workbench/board-query'
import type { BoardColumn, WorkItem } from '../src/workbench/projections'
import { TaskBoard, type TaskBoardRemote } from '../src/workbench/RunViews'

const mocks = vi.hoisted(() => ({
  buttons: [] as Record<string, unknown>[],
  cards: [] as Record<string, unknown>[],
  admission: undefined as { current: boolean } | undefined,
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useRef: (initial: unknown) => {
      if (typeof initial === 'boolean') {
        mocks.admission ??= { current: initial }
        return mocks.admission
      }
      return actual.useRef(initial)
    },
  }
})
vi.mock('../src/components/ui', () => ({
  AppButton: (props: Record<string, unknown>) => {
    mocks.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      {
        'aria-label': props.label,
        'data-board-page': props['data-board-page'],
        href: props.href,
        disabled: props.href ? undefined : props.disabled,
        'aria-disabled': props.href ? props.disabled : undefined,
      },
      props.children as ReactNode,
    )
  },
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppCard: (props: Record<string, unknown>) => {
    mocks.cards.push(props)
    return createElement(
      'article',
      {
        className: props.className,
        'data-board-task': props['data-board-task'],
      },
      props.children as ReactNode,
    )
  },
  AppCheckbox: () => null,
  AppDialog: () => null,
  AppSelect: () => null,
}))
vi.mock('../src/components/ui/DataTable', () => ({
  AppDataTable: () => null,
}))
vi.mock('../src/components/ui/DensityContext', () => ({
  useAppDensity: () => 'comfortable',
}))

const states: BoardColumn[] = [
  'pending',
  'active',
  'attention',
  'completed',
  'other',
]
const data = {
  projects: [{ id: 'project-1', name: 'Poison Bootstrap project' }],
  tasks: [
    {
      id: 'task-bootstrap',
      project_id: 'project-1',
      title: 'Poison Bootstrap task',
      goal: 'Bootstrap goal',
      acceptance: 'Bootstrap acceptance',
      files: ['bootstrap.md'],
      created_at: '2026-11-20T00:00:00Z',
    },
  ],
  runs: [],
} as unknown as Bootstrap
const t = (_zh: string, en: string) => en
const labels = {
  pending: 'Not started',
  active: 'Active',
  attention: 'Attention',
  completed: 'Executed',
  other: 'Canceled / other',
}
function item(state: BoardColumn, index: number): WorkItem {
  const id = `task-${state}-${index}`
  const run =
    state === 'pending'
      ? undefined
      : {
          id: `exact-run-${state}-${index}`,
          task_id: id,
          status:
            state === 'active'
              ? 'running'
              : state === 'attention'
                ? 'failed'
                : state === 'completed'
                  ? 'succeeded'
                  : 'canceled',
          created_at: '2026-11-20T01:00:00Z',
        }
  return {
    id,
    task: {
      id,
      project_id: 'project-1',
      title: `Authoritative ${state} task ${index}`,
      goal: `Exact server goal ${state} ${index}`,
      acceptance: `Acceptance ${state} ${index}`,
      files: [`server-${index}.md`],
      created_at: '2026-11-20T00:00:00Z',
    },
    projectName: 'Authoritative project',
    run,
    attempts: run ? 3 : 0,
    column: state,
  }
}
function column(
  state: BoardColumn,
  total = 0,
  requestedPage = 1,
): TaskBoardColumn {
  const totalPages = Math.max(1, Math.ceil(total / 20))
  const page = Math.min(requestedPage, totalPages)
  const length = Math.min(20, Math.max(0, total - (page - 1) * 20))
  return {
    state_category: state,
    total,
    requested_page: requestedPage,
    page,
    total_pages: totalPages,
    has_more: page < totalPages,
    items: Array.from({ length }, (_, index) =>
      item(state, (page - 1) * 20 + index + 1),
    ),
  }
}
function makePage(
  columns = [
    column('pending', 45),
    column('active', 1),
    column('attention', 1),
    column('completed', 2),
    column('other'),
  ],
  selected: BoardColumn[] = [],
): TaskBoardPage {
  return {
    schema_version: 1,
    unit: 'task_board',
    query: {
      text: '',
      projects: [],
      states: selected,
      jql: '',
      mode: 'basic',
    },
    scope_project_id: null,
    order: 'tasks-created-v1',
    column_size: 20,
    total: columns.reduce((sum, page) => sum + page.total, 0),
    columns,
  }
}
function renderRemote(overrides: Partial<TaskBoardRemote> = {}) {
  const remote: TaskBoardRemote = {
    page: makePage(),
    busy: false,
    onPageChange: vi.fn(),
    ...overrides,
  }
  const onPrepare = vi.fn()
  const html = renderToStaticMarkup(
    createElement(TaskBoard, {
      data,
      t,
      query: 'not a local match',
      filter: 'all',
      onPrepare,
      remote,
    }),
  )
  return { html, remote, onPrepare }
}
function button(label: string) {
  return mocks.buttons.find((props) => props.label === label)!
}
function pager(state: BoardColumn, direction: 'Previous' | 'Next') {
  return button(`${labels[state]}: ${direction} task page`)
}
function activate(props: Record<string, unknown>) {
  ;(props.onClick as () => void)()
}
function findElement(
  value: ReactNode,
  matches: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) {
    for (const child of value) {
      const result = findElement(child, matches)
      if (result) return result
    }
    return
  }
  if (!isValidElement<Record<string, unknown>>(value)) return
  if (matches(value)) return value
  return findElement(value.props.children as ReactNode, matches)
}
function titleAnchor(state: BoardColumn) {
  const card = mocks.cards.find((props) =>
    String(props['data-board-task']).startsWith(`task-${state}-`),
  )!
  return findElement(
    card.children as ReactNode,
    (element) => element.type === 'a',
  )! as ReactElement<{
    href: string
    tabIndex?: number
    'aria-disabled'?: boolean
    onClick: (event: MouseEvent<HTMLAnchorElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void
  }>
}

describe('bounded Task board presentation', () => {
  beforeEach(() => {
    mocks.buttons.length = 0
    mocks.cards.length = 0
    mocks.admission = undefined
  })

  it('renders exact remote cards and full column totals without Bootstrap or local filtering', () => {
    const page = makePage()
    page.query.text = 'server authority without a browser text match'
    page.columns[3].items.reverse()
    const { html } = renderRemote({ page })
    expect(html).toContain('data-testid="task-board"')
    expect(html).toContain('data-board-state="pending"')
    expect(html).toContain('1-20 / 45')
    expect(html).toContain('1 / 3')
    expect(html).toContain('Exact server goal pending 1')
    expect(html).toContain('Authoritative project')
    expect(html).not.toContain('Poison Bootstrap')
    expect(html).not.toContain('Bootstrap goal')
    expect(mocks.cards).toHaveLength(24)
    expect(
      mocks.cards
        .filter((props) =>
          String(props['data-board-task']).startsWith('task-completed'),
        )
        .map((props) => props['data-board-task']),
    ).toEqual(['task-completed-2', 'task-completed-1'])
    expect(html.match(/<footer/g)).toHaveLength(4)
    expect(html).not.toContain('data-board-state="other"')
  })

  it('pages only the chosen column with real boundaries and no capacity selector', () => {
    const page = makePage([
      column('pending', 45, 2),
      column('active', 22),
      column('attention'),
      column('completed'),
      column('other'),
    ])
    const { html, remote } = renderRemote({ page })
    activate(pager('pending', 'Previous'))
    activate(pager('pending', 'Next'))
    activate(pager('active', 'Next'))
    activate(pager('active', 'Previous'))
    expect(remote.onPageChange).toHaveBeenNthCalledWith(1, 'pending', 1)
    expect(remote.onPageChange).toHaveBeenNthCalledWith(2, 'pending', 3)
    expect(remote.onPageChange).toHaveBeenNthCalledWith(3, 'active', 2)
    expect(remote.onPageChange).toHaveBeenCalledTimes(3)
    expect(pager('active', 'Previous').disabled).toBe(true)
    expect(html).toContain('21-40 / 45')
    expect(html).not.toContain('<select')
  })

  it('uses the clamped column page and blocks a last-page retained Next handler', () => {
    const page = makePage(
      states.map((state) => column(state, state === 'pending' ? 45 : 0, 99)),
    )
    const { html, remote } = renderRemote({ page })
    expect(html).toContain('41-45 / 45')
    expect(html).toContain('3 / 3')
    expect(pager('pending', 'Next').disabled).toBe(true)
    activate(pager('pending', 'Next'))
    expect(remote.onPageChange).not.toHaveBeenCalled()
    activate(pager('pending', 'Previous'))
    expect(remote.onPageChange).toHaveBeenCalledWith('pending', 2)
  })

  it('passes the exact admitted full Task to Review and preserves exact Run links', () => {
    const page = makePage()
    const task = page.columns[0].items[0].task
    const { onPrepare, remote } = renderRemote({ page })
    activate(button('Review & run'))
    expect(onPrepare).toHaveBeenCalledOnce()
    expect(onPrepare).toHaveBeenCalledWith(task)
    expect(onPrepare.mock.calls[0][0]).toBe(task)
    expect(onPrepare.mock.calls[0][0]).toMatchObject({
      acceptance: 'Acceptance pending 1',
      files: ['server-1.md'],
    })
    expect(titleAnchor('active').props.href).toBe('#run/exact-run-active-1')
    expect(button('Open run').href).toBe('#run/exact-run-active-1')
    expect(remote.onPageChange).not.toHaveBeenCalled()
  })

  it('retains busy cards while blocking pager, Review, and title activation', () => {
    const { html, remote, onPrepare } = renderRemote({ busy: true })
    expect(html).toContain('aria-busy="true"')
    expect(mocks.cards).toHaveLength(24)
    expect(button('Review & run').disabled).toBe(true)
    expect(button('Open run').disabled).toBe(true)
    expect(pager('pending', 'Next').disabled).toBe(true)
    activate(button('Review & run'))
    activate(pager('pending', 'Next'))
    const anchor = titleAnchor('active')
    expect(anchor.props).toMatchObject({
      'aria-disabled': true,
      tabIndex: -1,
    })
    const click = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent<HTMLAnchorElement>
    const enter = {
      key: 'Enter',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent<HTMLAnchorElement>
    anchor.props.onClick(click)
    anchor.props.onKeyDown(enter)
    expect(click.preventDefault).toHaveBeenCalledOnce()
    expect(enter.preventDefault).toHaveBeenCalledOnce()
    expect(onPrepare).not.toHaveBeenCalled()
    expect(remote.onPageChange).not.toHaveBeenCalled()
  })

  it('revokes already retained ready handlers when a same-key refresh becomes busy', () => {
    const ready = renderRemote()
    const review = button('Review & run')
    const next = pager('pending', 'Next')
    const anchor = titleAnchor('active')
    renderRemote({ busy: true })
    activate(review)
    activate(next)
    const click = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent<HTMLAnchorElement>
    anchor.props.onClick(click)
    expect(click.preventDefault).toHaveBeenCalledOnce()
    expect(ready.onPrepare).not.toHaveBeenCalled()
    expect(ready.remote.onPageChange).not.toHaveBeenCalled()
  })

  it('shows selected states including an explicitly selected empty other column', () => {
    const page = makePage(
      states.map((state) => column(state)),
      ['other'],
    )
    const { html } = renderRemote({ page })
    expect(html).toContain('data-board-state="other"')
    expect(html).not.toContain('data-board-state="pending"')
    expect(html).toContain('0-0 / 0')
    expect(html).toContain('No tasks')
    expect(html.match(/<footer/g)).toHaveLength(1)
    expect(mocks.cards).toHaveLength(0)
    expect(pager('other', 'Previous').disabled).toBe(true)
    expect(pager('other', 'Next').disabled).toBe(true)
  })

  it('shows the other column when its server total is nonzero and uses only its admitted cards', () => {
    const page = makePage(
      states.map((state) => column(state, state === 'other' ? 45 : 0, 3)),
    )
    const { html } = renderRemote({ page })
    expect(html).toContain('data-board-state="other"')
    expect(html).toContain('41-45 / 45')
    expect(mocks.cards).toHaveLength(5)
    expect(mocks.cards[0]['data-board-task']).toBe('task-other-41')
    expect(html.match(/<footer/g)).toHaveLength(5)
  })

  it('renders a genuine empty board as four empty task columns without fake cards', () => {
    const { html } = renderRemote({
      page: makePage(states.map((state) => column(state))),
    })
    expect(mocks.cards).toEqual([])
    expect(html.match(/0-0 \/ 0/g)).toHaveLength(4)
    expect(html.match(/No tasks/g)).toHaveLength(4)
    expect(html).not.toContain('Poison Bootstrap')
  })

  it('keeps the legacy board local with its original Task action and no server footer', () => {
    const onPrepare = vi.fn()
    const html = renderToStaticMarkup(
      createElement(TaskBoard, {
        data,
        t,
        query: '',
        filter: 'all',
        onPrepare,
      }),
    )
    expect(html).toContain('Poison Bootstrap task')
    expect(html).toContain('Bootstrap goal')
    expect(html).not.toContain('wb-task-board-pagination')
    expect(html).not.toContain('<footer')
    activate(button('Review & run'))
    expect(onPrepare).toHaveBeenCalledWith(data.tasks[0])
    expect(mocks.cards).toHaveLength(1)
  })
})
