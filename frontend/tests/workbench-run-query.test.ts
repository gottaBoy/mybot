import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchRunQueryPage,
  parseRunQueryPage,
  prepareRunQueryRequest,
  RunQueryInputError,
  RunQueryResponseError,
  type RunQueryRequest,
} from '../src/workbench/run-query'
import { readListLocation } from '../src/workbench/list-location'

const query = {
  text: '',
  projects: [],
  states: [],
  jql: '',
  mode: 'basic' as const,
}
const item = {
  run: {
    id: 'run-1',
    task_id: 'task-1',
    status: 'failed',
    created_at: '2026-11-20T00:00:00Z',
  },
  task: { id: 'task-1', project_id: 'project-1', title: 'Task 1' },
  project: { id: 'project-1', name: 'Project 1' },
  state_category: 'attention',
}
const page = {
  schema_version: 1,
  unit: 'runs',
  items: [item],
  total: 1,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  query,
  sorts: [],
  scope_project_id: null,
  sort_semantics: 'unicode-natural-v1',
}
afterEach(() => vi.unstubAllGlobals())
const request = (): RunQueryRequest => ({
  query: structuredClone(query),
  sorts: [],
  page: 1,
  pageSize: 20,
})
const clone = <T>(value: T): T => structuredClone(value)
describe('run query contract', () => {
  it('prepares the bounded endpoint and preserves all historical rows', () => {
    const prepared = prepareRunQueryRequest({
      query,
      sorts: [],
      page: 1,
      pageSize: 20,
    })
    expect(prepared.path).toContain('/runs/query?')
    expect(
      parseRunQueryPage(page, { query, sorts: [], page: 1, pageSize: 20 })
        .items,
    ).toHaveLength(1)
  })
  it('rejects pending category, duplicate rows and invalid run sort', () => {
    expect(() =>
      parseRunQueryPage({
        ...page,
        items: [{ ...item, state_category: 'pending' }],
      }),
    ).toThrow()
    expect(() => parseRunQueryPage({ ...page, items: [item, item] })).toThrow()
    expect(() =>
      prepareRunQueryRequest({
        query,
        sorts: [{ sortKey: 'attempts' as never, direction: 'ascending' }],
        page: 1,
        pageSize: 20,
      }),
    ).toThrow()
  })
  it('binds fetch response to the exact sent request and preserves server order', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(page))),
    )
    const value = await fetchRunQueryPage({
      query,
      sorts: [],
      page: 1,
      pageSize: 20,
    })
    expect(value.items[0].run.id).toBe('run-1')
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      '/runs/query?',
    )
  })
  it('keeps malformed runOrder explicit and blocks only the run candidate', () => {
    expect(
      readListLocation(
        'http://localhost/#workbench?runOrder=updated:ascending',
      ),
    ).toMatchObject({ runOrderInvalid: true, runOrder: 'updated:ascending' })
  })
  it.each([
    { schema_version: 2 },
    { unit: 'tasks' },
    { extra: true },
    { items: null },
    { total: -1 },
    { total: 1.5 },
    { total: '1' },
    { total: true },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { requested_page: 0 },
    { requested_page: 90071992547410 },
    { page: 0 },
    { page: 2 },
    { page_size: 21 },
    { total_pages: 2 },
    { has_more: true },
    { sort_semantics: 'Intl.Collator' },
    { scope_project_id: ' project-1' },
    { scope_project_id: undefined },
    { sorts: [{ sortKey: 'attempts', direction: 'ascending' }] },
  ])('rejects malformed metadata %j', (patch) => {
    expect(() => parseRunQueryPage({ ...page, ...patch })).toThrow(
      RunQueryResponseError,
    )
  })
  it.each([
    { run: null },
    { run: { ...item.run, task_id: 'wrong' } },
    { run: { ...item.run, created_at: 'invalid' } },
    { run: { ...item.run, status: '' } },
    { run: { ...item.run, error: 'private error' } },
    { task: { ...item.task, project_id: 'wrong' } },
    { task: { ...item.task, goal: 'private goal' } },
    { task: { ...item.task, title: '\ud800' } },
    { task: { ...item.task, title: 'x'.repeat(161) } },
    { project: { ...item.project, notes: 'private notes' } },
    { project: { ...item.project, id: ' project-1' } },
    { project: { ...item.project, name: '' } },
    { state_category: 'completed' },
    { extra: 'private field' },
  ])('rejects malformed or conflicting row %j', (patch) => {
    expect(() =>
      parseRunQueryPage({ ...page, items: [{ ...item, ...patch }] }),
    ).toThrow(RunQueryResponseError)
  })
  it.each([
    { page: 0 },
    { page: 1.1 },
    { pageSize: 21 },
    { pageSize: true },
    { scopeProjectId: ' project-1' },
    { extra: true },
    { query: { ...query, text: '\ud800' } },
    { query: { ...query, projects: ['project-1', 'project-1'] } },
    { query: { ...query, states: ['failed'] } },
    { query: { ...query, jql: 'assignee = currentUser()' } },
    { query: { ...query, mode: 'natural' } },
  ])('rejects invalid request %j', (patch) => {
    expect(() =>
      prepareRunQueryRequest({ ...request(), ...patch } as RunQueryRequest),
    ).toThrow(RunQueryInputError)
  })
  it('canonicalizes project IDs by code points, Python whitespace and fixed scope', () => {
    const prepared = prepareRunQueryRequest({
      ...request(),
      query: {
        ...query,
        text: '\u001cExact\u0085',
        projects: ['\u{10000}', '\ue000'],
      },
    })
    expect(prepared.query.text).toBe('Exact')
    expect(prepared.query.projects).toEqual(['\ue000', '\u{10000}'])
    const scoped = prepareRunQueryRequest({
      ...request(),
      query: { ...query, projects: ['missing', 'other'] },
      scopeProjectId: 'project-1',
    })
    expect(scoped.query.projects).toEqual(['project-1'])
    expect(scoped.scope).toBe('project-1')
  })
  it('uses JQL effective sorting but rejects an invalid overridden explicit rule', () => {
    const sent = {
      ...request(),
      query: { ...query, jql: ' order by created asc ' },
      sorts: [
        { sortKey: 'title', direction: 'descending' },
      ] as RunQueryRequest['sorts'],
    }
    expect(prepareRunQueryRequest(sent).sorts).toEqual([
      { sortKey: 'created_at', direction: 'ascending' },
    ])
    expect(
      parseRunQueryPage(
        {
          ...page,
          query: { ...query, jql: 'ORDER BY CREATED ASC' },
          sorts: [{ sortKey: 'created_at', direction: 'ascending' }],
        },
        sent,
      ).sorts,
    ).toEqual([{ sortKey: 'created_at', direction: 'ascending' }])
    expect(() =>
      prepareRunQueryRequest({
        ...sent,
        sorts: [{ sortKey: 'attempts' as never, direction: 'ascending' }],
      }),
    ).toThrow(RunQueryInputError)
  })
  it('admits zero Runs for the pending-task filter without substituting tasks', () => {
    const pendingQuery = { ...query, states: ['pending'] }
    expect(
      parseRunQueryPage({
        ...page,
        query: pendingQuery,
        items: [],
        total: 0,
      }).items,
    ).toEqual([])
    expect(() => parseRunQueryPage({ ...page, query: pendingQuery })).toThrow(
      RunQueryResponseError,
    )
  })
  it('accepts clamped pages without rewriting requested page identity', () => {
    const value = parseRunQueryPage(
      { ...page, requested_page: 999 },
      {
        ...request(),
        page: 999,
      },
    )
    expect(value.requested_page).toBe(999)
    expect(value.page).toBe(1)
    expect(() =>
      parseRunQueryPage({ ...page, requested_page: 999 }, request()),
    ).toThrow(RunQueryResponseError)
  })
  it('allows several historical Runs of one task while enforcing its reference identity', () => {
    const second = clone(item)
    second.run.id = 'run-2'
    second.run.status = 'succeeded'
    second.state_category = 'completed'
    expect(
      parseRunQueryPage({ ...page, total: 2, items: [item, second] }).items,
    ).toHaveLength(2)
    second.task.title = 'Different task title'
    expect(() =>
      parseRunQueryPage({ ...page, total: 2, items: [item, second] }),
    ).toThrow(RunQueryResponseError)
  })
  it('rejects duplicate Run IDs even when response length agrees', () => {
    expect(() =>
      parseRunQueryPage({ ...page, total: 2, items: [item, item] }),
    ).toThrow(RunQueryResponseError)
  })
  it('treats unrecognized Run statuses as other rather than pending', () => {
    expect(
      parseRunQueryPage({
        ...page,
        items: [
          {
            ...item,
            run: { ...item.run, status: 'future_status' },
            state_category: 'other',
          },
        ],
      }).items[0].state_category,
    ).toBe('other')
  })
  it('preserves server order and Unicode matches instead of applying browser filtering', () => {
    const second = clone(item)
    second.run.id = 'run-10'
    const value = parseRunQueryPage({
      ...page,
      query: { ...query, text: 'not-a-browser-match' },
      total: 2,
      items: [second, item],
    })
    expect(value.items.map((record) => record.run.id)).toEqual([
      'run-10',
      'run-1',
    ])
  })
  it('accepts JSON property ordering while rejecting noncanonical query values', () => {
    expect(
      parseRunQueryPage({
        ...page,
        query: { mode: 'basic', jql: '', states: [], projects: [], text: '' },
      }).query,
    ).toEqual(query)
    expect(() =>
      parseRunQueryPage({ ...page, query: { ...query, text: ' untrimmed ' } }),
    ).toThrow(RunQueryResponseError)
  })
  it('copies response records so caller changes do not mutate the source', () => {
    const raw = clone(page)
    const value = parseRunQueryPage(raw)
    value.items[0].task.title = 'Changed'
    value.items[0].run.id = 'Changed'
    expect(raw.items[0].task.title).toBe('Task 1')
    expect(raw.items[0].run.id).toBe('run-1')
  })
  it('copies sent request bindings before waiting for a response', async () => {
    let finish!: (value: Response) => void
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
    const pending = fetchRunQueryPage(sent)
    sent.query.projects.push('later-project')
    sent.query.text = 'later text'
    sent.sorts.push({ sortKey: 'status', direction: 'ascending' })
    finish(new Response(JSON.stringify(page)))
    expect((await pending).query).toEqual(query)
  })
  it('retains structured HTTP errors instead of accepting a success-shaped fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: { code: 'run_query_project_unavailable' },
            }),
            { status: 422 },
          ),
      ),
    )
    await expect(fetchRunQueryPage(request())).rejects.toMatchObject({
      status: 422,
      details: { code: 'run_query_project_unavailable' },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'failure' }))),
    )
    await expect(fetchRunQueryPage(request())).rejects.toBeInstanceOf(
      RunQueryResponseError,
    )
  })
  it('forwards the AbortSignal and does not convert cancellation into rows', async () => {
    const controller = new AbortController()
    const aborted = new DOMException('aborted', 'AbortError')
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      expect(options.signal).toBe(controller.signal)
      throw aborted
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchRunQueryPage(request(), controller.signal)).rejects.toBe(
      aborted,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
