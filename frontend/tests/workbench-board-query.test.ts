import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTaskBoardPage,
  parseTaskBoardPage,
  prepareTaskBoardRequest,
  TaskBoardInputError,
  TaskBoardResponseError,
  type TaskBoardRequest,
} from '../src/workbench/board-query'
import { defaultBoardPages } from '../src/workbench/board-pages'
import { queryStateCategories } from '../src/workbench/query-conditions'
import { maxTaskQueryPage } from '../src/workbench/task-query'

const query = {
  text: '',
  projects: [],
  states: [],
  jql: '',
  mode: 'basic' as const,
}
const statuses = [null, 'running', 'failed', 'succeeded', 'future_status']
function item(index: number, suffix = '') {
  const state = queryStateCategories[index]
  const id = `task-${state}${suffix}`
  return {
    task: {
      id,
      project_id: 'project-1',
      title: `Title ${state}${suffix}`,
      goal: `Goal ${state}`,
      acceptance: 'Inspect exact persisted fields',
      files: ['README.md'],
      created_at: '2026-11-20T00:00:00Z',
    },
    project: { id: 'project-1', name: 'Project 1' },
    latest_run: statuses[index]
      ? {
          id: `run-${state}${suffix}`,
          task_id: id,
          status: statuses[index],
          created_at: '2026-11-20T01:00:00Z',
        }
      : null,
    state_category: state,
    attempts: statuses[index] ? 3 : 0,
  }
}
function board() {
  return {
    schema_version: 1,
    unit: 'task_board',
    query: structuredClone(query),
    scope_project_id: null as string | null,
    order: 'tasks-created-v1',
    column_size: 20,
    total: 5,
    columns: queryStateCategories.map((state, index) => ({
      state_category: state,
      total: 1,
      requested_page: 1,
      page: 1,
      total_pages: 1,
      has_more: false,
      items: [item(index)],
    })),
  }
}
function request(): TaskBoardRequest {
  return { query: structuredClone(query), pages: defaultBoardPages() }
}
afterEach(() => vi.unstubAllGlobals())

describe('bounded Task board contract', () => {
  it('prepares one read for all five independently paged columns', () => {
    const prepared = prepareTaskBoardRequest({
      ...request(),
      pages: { ...defaultBoardPages(), completed: 3 },
    })
    const url = new URL(prepared.path, 'http://localhost')
    expect(url.pathname).toBe('/tasks/board')
    expect([...url.searchParams.keys()]).toEqual(['query', 'pages'])
    expect(JSON.parse(url.searchParams.get('pages')!)).toEqual({
      pending: 1,
      active: 1,
      attention: 1,
      completed: 3,
      other: 1,
    })
  })
  it.each([
    { pages: {} },
    { pages: { ...defaultBoardPages(), pending: true } },
    { pages: { ...defaultBoardPages(), active: maxTaskQueryPage + 1 } },
    { pages: { ...defaultBoardPages(), extra: 1 } },
    { query: { ...query, jql: 'ORDER BY CREATED DESC' } },
    { query: { ...query, jql: 'assignee = currentUser()' } },
    { query: { ...query, text: '\ud800' } },
    { query: { ...query, states: ['failed'] } },
    { query: { ...query, states: ['active', 'active'] } },
    { query: { ...query, projects: ['p', 'p'] } },
    { query: { ...query, mode: 'natural' } },
    { scopeProjectId: ' project-1' },
    { extra: true },
    { sorts: [] },
    { page: 1 },
    { pageSize: 100 },
  ])('rejects malformed requests and unrelated table controls %j', (patch) => {
    expect(() =>
      prepareTaskBoardRequest({ ...request(), ...patch } as TaskBoardRequest),
    ).toThrow(TaskBoardInputError)
  })
  it('canonicalizes whitespace, code-point IDs, states and fixed scope', () => {
    const prepared = prepareTaskBoardRequest({
      ...request(),
      query: {
        ...query,
        text: '\u001cquery\u0085',
        states: ['other', 'active'],
        projects: ['\u{10000}', '\ue000'],
      },
    })
    expect(prepared.query).toEqual({
      ...query,
      text: 'query',
      states: ['active', 'other'],
      projects: ['\ue000', '\u{10000}'],
    })
    const scoped = prepareTaskBoardRequest({
      ...request(),
      query: { ...query, projects: ['off-scope'] },
      scopeProjectId: 'project-1',
    })
    expect(scoped.query.projects).toEqual(['project-1'])
    expect(scoped.scope).toBe('project-1')
  })
  it('preserves full card Tasks and Task-latest state without inventing history', () => {
    const value = parseTaskBoardPage(board(), request())
    expect(value.total).toBe(5)
    expect(value.columns[0].items[0]).toMatchObject({
      id: 'task-pending',
      task: {
        goal: 'Goal pending',
        acceptance: 'Inspect exact persisted fields',
        files: ['README.md'],
      },
      column: 'pending',
      attempts: 0,
      run: undefined,
    })
    expect(value.columns[3].items[0].run?.status).toBe('succeeded')
    expect(value.columns[3].items[0].attempts).toBe(3)
    expect(value.columns[4].items[0].column).toBe('other')
  })
  it.each([
    { schema_version: 2 },
    { unit: 'tasks' },
    { order: 'Intl.Collator' },
    { column_size: 50 },
    { total: 0 },
    { total: true },
    { total: 5.5 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { columns: [] },
    { columns: null },
    { scope_project_id: ' project-1' },
    { scope_project_id: undefined },
    { scope_project_id: 123 },
    { query: { ...query, text: ' untrimmed ' } },
    { query: { ...query, jql: 'ORDER BY SUMMARY ASC' } },
    { query: { ...query, extra: true } },
    { extra: true },
  ])('rejects malformed or unbound metadata %j', (patch) => {
    expect(() => parseTaskBoardPage({ ...board(), ...patch })).toThrow(
      TaskBoardResponseError,
    )
  })
  it.each([
    { state_category: 'failed' },
    { total: -1 },
    { total: 1.5 },
    { total: '1' },
    { requested_page: 0 },
    { requested_page: maxTaskQueryPage + 1 },
    { requested_page: true },
    { page: 2 },
    { page: 0 },
    { total_pages: 2 },
    { has_more: true },
    { items: [] },
    { items: null },
    { extra: true },
  ])('rejects inconsistent column metadata %j', (patch) => {
    const raw = board()
    Object.assign(raw.columns[0], patch)
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('requires all five canonical columns exactly once', () => {
    const raw = board()
    ;[raw.columns[0], raw.columns[1]] = [raw.columns[1], raw.columns[0]]
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
    raw.columns[1] = raw.columns[0]
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('accepts zero excluded states and does not fill them with local cards', () => {
    const raw = board()
    raw.query.states = ['completed'] as never[]
    raw.total = 1
    for (const column of raw.columns)
      if (column.state_category !== 'completed') {
        column.total = 0
        column.items = []
      }
    const parsed = parseTaskBoardPage(raw)
    expect(parsed.columns.map((column) => column.items.length)).toEqual([
      0, 0, 0, 1, 0,
    ])
    raw.columns[0].total = 1
    raw.columns[0].items = [item(0)]
    raw.total = 2
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('binds every requested column page while retaining server-clamped pages', () => {
    const raw = board()
    raw.columns[3].requested_page = 99
    const sent = request()
    sent.pages.completed = 99
    const value = parseTaskBoardPage(raw, sent)
    expect(value.columns[3].requested_page).toBe(99)
    expect(value.columns[3].page).toBe(1)
    expect(() => parseTaskBoardPage(raw, request())).toThrow(
      TaskBoardResponseError,
    )
  })
  it('preserves admitted server order and authoritative text matches', () => {
    const raw = board()
    raw.query.text = 'server-authoritative-match'
    raw.columns[0].total = 2
    raw.columns[0].items = [item(0, '-10'), item(0, '-2')]
    raw.total = 6
    expect(
      parseTaskBoardPage(raw).columns[0].items.map((record) => record.id),
    ).toEqual(['task-pending-10', 'task-pending-2'])
  })
  it('rejects duplicate tasks and Runs even across distinct columns', () => {
    const raw = board()
    raw.columns[0].items[0].task.id = raw.columns[1].items[0].task.id
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
    const other = board()
    other.columns[2].items[0].latest_run!.id =
      other.columns[1].items[0].latest_run!.id
    expect(() => parseTaskBoardPage(other)).toThrow(TaskBoardResponseError)
  })
  it('rejects inconsistent project references, state classification and Task fields', () => {
    const name = board()
    name.columns[2].items[0].project.name = 'Contradicting project'
    expect(() => parseTaskBoardPage(name)).toThrow(TaskBoardResponseError)
    const state = board()
    state.columns[2].items[0].latest_run!.status = 'succeeded'
    expect(() => parseTaskBoardPage(state)).toThrow(TaskBoardResponseError)
    const project = board()
    project.columns[2].items[0].task.project_id = 'wrong'
    expect(() => parseTaskBoardPage(project)).toThrow(TaskBoardResponseError)
    const task = board()
    delete (
      task.columns[0].items[0].task as Partial<
        (typeof task.columns)[number]['items'][number]['task']
      >
    ).files
    expect(() => parseTaskBoardPage(task)).toThrow(TaskBoardResponseError)
  })
  it('rejects a valid row outside the exact selected project scope', () => {
    const raw = board()
    raw.query.projects = ['different'] as never[]
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('checks total sum overflow independently of each safe column total', () => {
    const raw = board()
    raw.columns[0].total = Number.MAX_SAFE_INTEGER
    raw.columns[0].total_pages = Math.ceil(Number.MAX_SAFE_INTEGER / 20)
    raw.columns[0].has_more = true
    raw.columns[0].items = Array.from({ length: 20 }, (_, i) =>
      item(0, `-${i}`),
    )
    raw.total = Number.MAX_SAFE_INTEGER
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('admits precisely20 cards per nonfinal column and exact partial last pages', () => {
    const raw = board()
    raw.columns[0].total = 45
    raw.columns[0].total_pages = 3
    raw.columns[0].has_more = true
    raw.columns[0].items = Array.from({ length: 20 }, (_, i) =>
      item(0, `-${i}`),
    )
    raw.total = 49
    expect(parseTaskBoardPage(raw).columns[0].items).toHaveLength(20)
    raw.columns[0].requested_page = 3
    raw.columns[0].page = 3
    raw.columns[0].has_more = false
    raw.columns[0].items = Array.from({ length: 5 }, (_, i) => item(0, `-${i}`))
    expect(parseTaskBoardPage(raw).columns[0].items).toHaveLength(5)
    raw.columns[0].items.pop()
    expect(() => parseTaskBoardPage(raw)).toThrow(TaskBoardResponseError)
  })
  it('copies parsed card fields and permits JSON property-order variation', () => {
    const raw = board()
    raw.query = {
      mode: 'basic',
      states: [],
      projects: [],
      jql: '',
      text: '',
    }
    const value = parseTaskBoardPage(raw)
    value.columns[0].items[0].task.files.push('later.md')
    value.columns[1].items[0].run!.status = 'changed'
    expect(raw.columns[0].items[0].task.files).toEqual(['README.md'])
    expect(raw.columns[1].items[0].latest_run!.status).toBe('running')
  })
  it('copies the exact sent query and pages before awaiting a response', async () => {
    let finish!: (response: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const sent = request()
    const pending = fetchTaskBoardPage(sent)
    sent.pages.active = 7
    sent.query.text = 'later'
    sent.query.projects.push('new')
    finish(new Response(JSON.stringify(board())))
    expect((await pending).query).toEqual(query)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('retains HTTP errors and rejects success-shaped malformed envelopes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('{"detail":"forbidden"}', { status: 403 }),
      ),
    )
    await expect(fetchTaskBoardPage(request())).rejects.toMatchObject({
      status: 403,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"error"}')),
    )
    await expect(fetchTaskBoardPage(request())).rejects.toBeInstanceOf(
      TaskBoardResponseError,
    )
  })
  it('forwards cancellation without retrying or synthesizing a board', async () => {
    const controller = new AbortController()
    const aborted = new DOMException('aborted', 'AbortError')
    const fetchMock = vi.fn(async (_url, options: RequestInit) => {
      expect(options.signal).toBe(controller.signal)
      throw aborted
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchTaskBoardPage(request(), controller.signal)).rejects.toBe(
      aborted,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
