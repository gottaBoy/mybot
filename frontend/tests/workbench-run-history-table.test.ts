import {
  createElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppColumn, AppTableSort } from '../src/components/ui/DataTable'
import type { Bootstrap, Run } from '../src/workbench/api'
import type { RunQueryPage } from '../src/workbench/run-query'
import {
  RunsTable,
  type RunHistoryRemote,
  type RunTablePreferences,
} from '../src/workbench/RunViews'

type TableRow = {
  id: string
  title: string
  project: string
  projectName: string
  status: string
  created_at: string
}
type TableCapture = {
  rows: TableRow[]
  columns: AppColumn<TableRow>[]
  serverSorted: boolean
  compact?: boolean
  totalRows?: number
  rowStart?: number
  sorting?: {
    sort: AppTableSort
    onSortChange: (sort: AppTableSort) => void
  }
}
const mocks = vi.hoisted(() => ({
  tables: [] as TableCapture[],
  buttons: [] as Record<string, unknown>[],
  selects: [] as Record<string, unknown>[],
  checkboxes: [] as Record<string, unknown>[],
  settingsOpen: false,
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) =>
      actual.useState<unknown>(
        mocks.settingsOpen && initial === false ? true : initial,
      ),
  }
})
vi.mock('../src/components/ui', () => ({
  AppButton: (props: Record<string, unknown>) => {
    mocks.buttons.push(props)
    return createElement(
      'button',
      {
        'aria-label': props.label,
        disabled: props.disabled,
        'data-run-history-page': props['data-run-history-page'],
      },
      props.children as ReactNode,
    )
  },
  AppSelect: (props: Record<string, unknown>) => {
    mocks.selects.push(props)
    return createElement(
      'select',
      {
        'aria-label': props.label,
        disabled: props.disabled,
        defaultValue: props.value,
      },
      (
        props.options as Array<{
          value: string
          label: string
        }>
      ).map((option) =>
        createElement(
          'option',
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
    )
  },
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppCard: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
  AppCheckbox: (props: Record<string, unknown>) => {
    mocks.checkboxes.push(props)
    return createElement('input', {
      type: 'checkbox',
      'aria-label': props.label,
      defaultChecked: props.value,
    })
  },
  AppDialog: ({ children }: { children: ReactNode }) =>
    createElement('div', null, children),
}))
vi.mock('../src/components/ui/DataTable', () => ({
  AppDataTable: (props: TableCapture & { empty: ReactNode }) => {
    mocks.tables.push(props)
    return createElement(
      'table',
      null,
      createElement(
        'tbody',
        null,
        props.rows.map((row) =>
          createElement(
            'tr',
            { key: row.id },
            props.columns.map((column) =>
              createElement(
                'td',
                { key: column.key },
                column.render
                  ? column.render(row)
                  : String(row[column.key as keyof TableRow]),
              ),
            ),
          ),
        ),
      ),
      !props.rows.length
        ? createElement(
            'tfoot',
            null,
            createElement('tr', null, createElement('td', null, props.empty)),
          )
        : null,
    )
  },
}))
vi.mock('../src/components/ui/DensityContext', () => ({
  useAppDensity: () => 'comfortable',
}))

const data = {
  projects: [{ id: 'project-remote', name: 'Stale Bootstrap project' }],
  tasks: [
    {
      id: 'task-remote-21',
      project_id: 'project-remote',
      title: 'Stale Bootstrap task',
    },
  ],
  runs: [],
} as unknown as Bootstrap

function makePage(overrides: Partial<RunQueryPage> = {}): RunQueryPage {
  const total = overrides.total ?? 45
  const page = overrides.page ?? 2
  const pageSize = overrides.page_size ?? 20
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const length = Math.min(pageSize, Math.max(0, total - (page - 1) * pageSize))
  return {
    schema_version: 1,
    unit: 'runs',
    total,
    requested_page: page,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    has_more: page < totalPages,
    query: { text: '', projects: [], states: [], jql: '', mode: 'basic' },
    sorts: [{ sortKey: 'title', direction: 'ascending' }],
    scope_project_id: null,
    sort_semantics: 'unicode-natural-v1',
    items: Array.from({ length }, (_, index) => {
      const number = (page - 1) * pageSize + index + 1
      return {
        run: {
          id: `run-remote-${number}`,
          task_id: `task-remote-${number}`,
          status: 'succeeded',
          created_at: '2026-11-19T12:00:00Z',
        },
        task: {
          id: `task-remote-${number}`,
          project_id: 'project-remote',
          title: `Server task ${number}`,
        },
        project: { id: 'project-remote', name: 'Server project' },
        state_category: 'completed',
      }
    }),
    ...overrides,
  }
}
function renderRemote(
  overrides: Partial<RunHistoryRemote> = {},
  preferences?: {
    value: RunTablePreferences
    onChange: (value: RunTablePreferences) => void
  },
) {
  const remote: RunHistoryRemote = {
    page: makePage(),
    busy: false,
    onSortChange: vi.fn(),
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...overrides,
  }
  const html = renderToStaticMarkup(
    createElement(RunsTable, {
      data,
      runs: [],
      t: (_zh: string, en: string) => en,
      locale: 'en',
      remote,
      preferences,
    }),
  )
  return { html, remote, table: mocks.tables.at(-1)! }
}
function button(label: string) {
  return mocks.buttons.find((props) => props.label === label)!
}
function activate(props: Record<string, unknown>) {
  ;(props.onClick as () => void)()
}
function link(table: TableCapture) {
  return table.columns.find((column) => column.key === 'title')!.render!(
    table.rows[0],
  ) as ReactElement<{
    href: string
    tabIndex?: number
    'aria-disabled'?: boolean
    onClick: (event: MouseEvent<HTMLAnchorElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void
  }>
}

describe('bounded Run-history table', () => {
  beforeEach(() => {
    mocks.tables.length = 0
    mocks.buttons.length = 0
    mocks.selects.length = 0
    mocks.checkboxes.length = 0
    mocks.settingsOpen = false
  })

  it('uses authoritative page rows, order and global totals without Bootstrap hydration', () => {
    const page = makePage()
    const { html, table } = renderRemote({ page })
    expect(table.rows.map((row) => row.id)).toEqual(
      page.items.map((item) => item.run.id),
    )
    expect(table.rows[0]).toMatchObject({
      title: 'Server task 21',
      projectName: 'Server project',
    })
    expect(table).toMatchObject({
      serverSorted: true,
      totalRows: 45,
      rowStart: 21,
      sorting: { sort: page.sorts },
    })
    expect(table.columns.map((column) => column.key)).toEqual([
      'title',
      'projectName',
      'status',
      'id',
      'created_at',
    ])
    expect(html).toContain('45 runs')
    expect(html).toContain('21-40 / 45')
    expect(html).toContain('2 / 3')
    expect(html).not.toContain('Stale Bootstrap')
    expect(html).toContain('data-testid="run-history-range"')
  })

  it('admits one supported server sort or a clear and blocks Task-only keys', () => {
    const { remote, table } = renderRemote()
    table.sorting!.onSortChange([
      { sortKey: 'title', direction: 'ascending' },
      { sortKey: 'projectName', direction: 'descending' },
    ])
    expect(remote.onSortChange).toHaveBeenLastCalledWith([
      { sortKey: 'projectName', direction: 'descending' },
    ])
    table.sorting!.onSortChange([])
    expect(remote.onSortChange).toHaveBeenLastCalledWith([])
    table.sorting!.onSortChange([
      { sortKey: 'attempts', direction: 'ascending' },
    ])
    table.sorting!.onSortChange([
      { sortKey: 'title', direction: 'sideways' },
    ] as unknown as AppTableSort)
    expect(remote.onSortChange).toHaveBeenCalledTimes(2)
  })

  it('honors the effective JQL sort while locking only header sort changes', () => {
    const { remote, table } = renderRemote({
      page: makePage({
        sorts: [{ sortKey: 'created_at', direction: 'descending' }],
      }),
      sortLocked: true,
    })
    expect(table.sorting!.sort).toEqual([
      { sortKey: 'created_at', direction: 'descending' },
    ])
    expect(table.columns.every((column) => column.sortable === false)).toBe(
      true,
    )
    table.sorting!.onSortChange([])
    expect(remote.onSortChange).not.toHaveBeenCalled()
    activate(button('Next run page'))
    expect(remote.onPageChange).toHaveBeenCalledWith(3)
  })

  it('keeps old rows visible during refresh but blocks their links and controls', () => {
    const { html, remote, table } = renderRemote({ busy: true })
    expect(table.rows).toHaveLength(20)
    expect(html).toContain('Server task 21')
    expect(html).toContain('aria-busy="true"')
    const anchor = link(table)
    expect(anchor.props).toMatchObject({
      href: '#run/run-remote-21',
      tabIndex: -1,
      'aria-disabled': true,
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
    expect(click.preventDefault).toHaveBeenCalled()
    expect(enter.preventDefault).toHaveBeenCalled()
    expect(button('Previous run page').disabled).toBe(true)
    expect(button('Next run page').disabled).toBe(true)
    expect(mocks.selects[0].disabled).toBe(true)
    activate(button('Next run page'))
    table.sorting!.onSortChange([])
    ;(mocks.selects[0].onChange as (value: string) => void)('50')
    expect(remote.onPageChange).not.toHaveBeenCalled()
    expect(remote.onSortChange).not.toHaveBeenCalled()
    expect(remote.onPageSizeChange).not.toHaveBeenCalled()
  })

  it('provides one bounded pager and admits only supported page capacities', () => {
    const { html, remote } = renderRemote()
    expect(html.match(/<footer/g)).toHaveLength(1)
    expect(button('Previous run page').disabled).toBe(false)
    expect(button('Next run page').disabled).toBe(false)
    activate(button('Previous run page'))
    activate(button('Next run page'))
    expect(remote.onPageChange).toHaveBeenNthCalledWith(1, 1)
    expect(remote.onPageChange).toHaveBeenNthCalledWith(2, 3)
    const onSizeChange = mocks.selects[0].onChange as (value: string) => void
    onSizeChange('50')
    onSizeChange('100')
    onSizeChange('20')
    onSizeChange('0')
    onSizeChange('25')
    expect(remote.onPageSizeChange).toHaveBeenCalledTimes(3)
    expect(remote.onPageSizeChange).toHaveBeenNthCalledWith(1, 50)
    expect(remote.onPageSizeChange).toHaveBeenNthCalledWith(2, 100)
    expect(remote.onPageSizeChange).toHaveBeenNthCalledWith(3, 20)
  })

  it('blocks paging beyond the first and last pages even through retained handlers', () => {
    const first = renderRemote({
      page: makePage({ page: 1, requested_page: 1 }),
    })
    expect(button('Previous run page').disabled).toBe(true)
    activate(button('Previous run page'))
    expect(first.remote.onPageChange).not.toHaveBeenCalled()
    mocks.buttons.length = 0
    const last = renderRemote({
      page: makePage({ page: 3, requested_page: 3 }),
    })
    expect(button('Next run page').disabled).toBe(true)
    activate(button('Next run page'))
    expect(last.remote.onPageChange).not.toHaveBeenCalled()
    expect(last.html).toContain('41-45 / 45')
  })

  it('renders a true empty Run result with zero range and no synthesized rows', () => {
    const { html, table } = renderRemote({
      page: makePage({ total: 0, page: 1, requested_page: 1 }),
    })
    expect(table.rows).toEqual([])
    expect(table.totalRows).toBe(0)
    expect(html).toContain('0 runs')
    expect(html).toContain('0-0 / 0')
    expect(html).toContain('No matching runs')
    expect(html).not.toContain('Server task')
  })

  it('retains controlled column and compact preferences across remounted server pages', () => {
    const preferences = {
      value: {
        visible: { project: false, id: true, created_at: false },
        compact: true,
      },
      onChange: vi.fn(),
    }
    const first = renderRemote(
      { page: makePage({ page: 1, requested_page: 1 }) },
      preferences,
    )
    const second = renderRemote({ page: makePage() }, preferences)
    for (const { table } of [first, second]) {
      expect(table.compact).toBe(true)
      expect(table.columns.map((column) => column.key)).toEqual([
        'title',
        'status',
        'id',
      ])
    }
    expect(preferences.onChange).not.toHaveBeenCalled()
  })

  it('sends exact controlled preference updates without changing query controls', () => {
    mocks.settingsOpen = true
    const preferences = {
      value: {
        visible: { project: false, id: true, created_at: false },
        compact: undefined,
      },
      onChange: vi.fn(),
    }
    const { remote } = renderRemote({}, preferences)
    const checkbox = (label: string) =>
      mocks.checkboxes.find((props) => props.label === label)!
    expect(checkbox('Compact rows').value).toBe(false)
    expect(checkbox('Project column').value).toBe(false)
    ;(checkbox('Project column').onChange as (value: boolean) => void)(true)
    expect(preferences.onChange).toHaveBeenLastCalledWith({
      visible: { project: true, id: true, created_at: false },
      compact: undefined,
    })
    ;(checkbox('Compact rows').onChange as (value: boolean) => void)(true)
    expect(preferences.onChange).toHaveBeenLastCalledWith({
      visible: { project: false, id: true, created_at: false },
      compact: true,
    })
    expect(remote.onPageChange).not.toHaveBeenCalled()
    expect(remote.onPageSizeChange).not.toHaveBeenCalled()
    expect(remote.onSortChange).not.toHaveBeenCalled()
  })

  it('preserves the local legacy table without remote pagination or sort semantics', () => {
    const run = {
      id: 'run-legacy',
      task_id: 'task-remote-21',
      status: 'failed',
      created_at: '2026-11-19T12:00:00Z',
    } as Run
    const html = renderToStaticMarkup(
      createElement(RunsTable, {
        data,
        runs: [run],
        t: (_zh: string, en: string) => en,
        locale: 'en',
      }),
    )
    const table = mocks.tables.at(-1)!
    expect(table.rows[0]).toMatchObject({
      title: 'Stale Bootstrap task',
      project: 'Stale Bootstrap project',
    })
    expect(table.serverSorted).toBe(false)
    expect(table.sorting).toBeUndefined()
    expect(table.totalRows).toBeUndefined()
    expect(table.columns.map((column) => column.key)).toContain('project')
    expect(html).toContain('1 runs')
    expect(html).not.toContain('run-history-range')
    expect(html).not.toContain('<footer')
    expect(mocks.selects).toEqual([])
  })
})
