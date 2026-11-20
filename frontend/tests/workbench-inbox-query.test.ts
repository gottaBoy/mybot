import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  fetchInboxPage,
  InboxQueryInputError,
  parseInboxType,
  prepareInboxRequest,
  type InboxQueryRequest,
} from '../src/workbench/inbox-query'
import {
  listLocationHref,
  readListLocation,
  supportedListQuery,
} from '../src/workbench/list-location'
import { TaskQueryResponseError } from '../src/workbench/task-query'

const request = (): InboxQueryRequest => ({
  query: '',
  type: 'all',
  page: 1,
  pageSize: 20,
})
const item = {
  task: {
    id: 'inbox-task',
    project_id: 'inbox-project',
    title: 'Inbox task',
    goal: 'Actual goal',
    acceptance: 'Explicit acceptance',
    files: ['README.md'],
    created_at: '2026-11-20T00:00:00Z',
  },
  project: { id: 'inbox-project', name: 'Inbox project' },
  latest_run: {
    id: 'inbox-run',
    task_id: 'inbox-task',
    status: 'failed',
    created_at: '2026-11-20T01:00:00Z',
  },
  attempts: 2,
  state_category: 'attention',
}
function response() {
  return {
    schema_version: 1,
    unit: 'tasks',
    items: [structuredClone(item)],
    total: 1,
    requested_page: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    has_more: false,
    query: prepareInboxRequest(request()).query,
    sorts: [],
    scope_project_id: null,
    sort_semantics: 'unicode-natural-v1',
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('bounded Inbox adapter', () => {
  it.each([
    [undefined, 'all'],
    ['all', 'all'],
    ['pending', 'pending'],
    ['attention', 'attention'],
    ['', undefined],
    ['active', undefined],
    ['completed', undefined],
    ['ALL', undefined],
    [' all', undefined],
    ['attention ', undefined],
  ])(
    'parses Inbox type %j without broadening unknown scope',
    (raw, expected) => {
      expect(parseInboxType(raw)).toBe(expected)
    },
  )
  it('uses a finite Task-latest request independent of other workspace controls', () => {
    expect(prepareInboxRequest(request())).toEqual({
      query: {
        text: '',
        projects: [],
        states: ['pending', 'attention'],
        jql: '',
        mode: 'basic',
      },
      sorts: [],
      page: 1,
      pageSize: 20,
    })
    for (const type of ['pending', 'attention'] as const) {
      expect(prepareInboxRequest({ ...request(), type }).query.states).toEqual([
        type,
      ])
    }
  })
  it('normalizes text through the shared Python-whitespace contract and copies candidates', () => {
    const candidate = {
      ...request(),
      query: '\u0085release\u0085',
      page: 3,
      pageSize: 100,
    }
    const prepared = prepareInboxRequest(candidate)
    expect(prepared.query.text).toBe('release')
    expect(prepared.page).toBe(3)
    expect(prepared.pageSize).toBe(100)
    candidate.query = 'changed'
    expect(prepared.query.text).toBe('release')
  })
  it.each([
    { type: undefined },
    { type: 'active' },
    { type: true },
    { query: null },
    { query: '\ud800' },
    { query: 'x'.repeat(2001) },
    { page: 0 },
    { page: 1.5 },
    { page: true },
    { page: 90071992547410 },
    { pageSize: 25 },
    { pageSize: '20' },
    { scopeProjectId: 'forged' },
    { projects: ['forged'] },
    { sorts: [] },
    { jql: 'ORDER BY SUMMARY ASC' },
  ])('rejects invalid or expanded adapter candidate %j', (patch) => {
    expect(() =>
      prepareInboxRequest({
        ...request(),
        ...patch,
      } as InboxQueryRequest),
    ).toThrow(InboxQueryInputError)
  })
  it('fetches one existing GET with the finite copied request and AbortSignal', async () => {
    const wire = response()
    const controller = new AbortController()
    const fetcher = vi.fn(async () => new Response(JSON.stringify(wire)))
    vi.stubGlobal('fetch', fetcher)
    const result = await fetchInboxPage(request(), controller.signal)
    const [path, options] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    const url = new URL(path, 'http://localhost')
    expect(url.pathname).toBe('/api/tasks/query')
    expect(JSON.parse(url.searchParams.get('query')!)).toEqual(wire.query)
    expect(url.searchParams.get('sorts')).toBe('[]')
    expect(url.searchParams.has('scope_project_id')).toBe(false)
    expect(options.signal).toBe(controller.signal)
    expect(options.method).toBeUndefined()
    expect(result.items[0].task).toEqual(item.task)
    expect(result.items[0].run?.id).toBe(item.latest_run.id)
    expect(result.items[0].attempts).toBe(2)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('preserves server-authoritative text matches and supplied order', async () => {
    const wire = response()
    wire.query.text = 'server authority'
    wire.items.push({
      ...structuredClone(item),
      task: { ...item.task, id: 'second-task', title: 'A sorts first locally' },
      latest_run: {
        ...item.latest_run,
        id: 'second-run',
        task_id: 'second-task',
      },
    })
    wire.total = 2
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(wire))),
    )
    const result = await fetchInboxPage({
      ...request(),
      query: wire.query.text,
    })
    expect(result.items.map((value) => value.id)).toEqual([
      'inbox-task',
      'second-task',
    ])
  })
  it.each(['query', 'state', 'sort', 'scope', 'page', 'envelope'])(
    'retains strict shared response binding for %s mismatch',
    async (kind) => {
      const wire = response()
      if (kind === 'query') wire.query.text = 'another query'
      if (kind === 'state') {
        wire.items[0].latest_run.status = 'succeeded'
        wire.items[0].state_category = 'completed'
      }
      if (kind === 'sort')
        wire.sorts = [{ sortKey: 'title', direction: 'ascending' }] as never
      if (kind === 'scope') wire.scope_project_id = 'inbox-project' as never
      if (kind === 'page') wire.requested_page = 2
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify(
                kind === 'envelope' ? { detail: 'failure' } : wire,
              ),
            ),
        ),
      )
      await expect(fetchInboxPage(request())).rejects.toBeInstanceOf(
        TaskQueryResponseError,
      )
    },
  )
  it('does not retry a read error or convert it to empty records', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'forbidden' }), { status: 403 }),
    )
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchInboxPage(request())).rejects.toMatchObject({
      status: 403,
    } satisfies Partial<ApiError>)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('Inbox URL scope', () => {
  it('keeps Inbox scope raw and independent of shared Task/Run/Board parameters', () => {
    const state = readListLocation(
      'http://localhost/#inbox?inboxType=pending&q=needle&filter=active&project=other&jql=anything&order=title:ascending&runOrder=status:descending&page=2&pageSize=50',
    )
    expect(state).toMatchObject({
      inboxType: 'pending',
      query: 'needle',
      page: 2,
      pageSize: 50,
      filter: 'active',
      project: 'other',
      jql: 'anything',
    })
    const adapted = prepareInboxRequest({
      query: state.query ?? '',
      type: parseInboxType(state.inboxType)!,
      page: state.page!,
      pageSize: state.pageSize!,
    })
    expect(adapted.query).toEqual({
      text: 'needle',
      projects: [],
      states: ['pending'],
      jql: '',
      mode: 'basic',
    })
    expect(adapted.sorts).toEqual([])
    expect(adapted).not.toHaveProperty('scopeProjectId')
  })
  it.each(['', 'active', 'Pending', ' all', 'attention '])(
    'preserves invalid Inbox type %j until explicit removal',
    (raw) => {
      const href = `http://localhost/#inbox?inboxType=${encodeURIComponent(raw)}&q=needle`
      const state = readListLocation(href)
      expect(state).toMatchObject({ inboxType: raw, inboxTypeInvalid: true })
      const next = listLocationHref(href, { page: 2 })
      expect(readListLocation(`http://localhost${next}`).inboxType).toBe(raw)
      const cleared = listLocationHref(`http://localhost${next}`, {
        inboxType: undefined,
        query: undefined,
        page: 1,
      })
      const admitted = readListLocation(`http://localhost${cleared}`)
      expect(admitted).not.toHaveProperty('inboxType')
      expect(admitted).not.toHaveProperty('inboxTypeInvalid')
      expect(parseInboxType(admitted.inboxType)).toBe('all')
      expect(supportedListQuery(state)).toEqual({ sort: undefined })
    },
  )
  it('atomically commits a type/page patch without discarding committed search text', () => {
    const next = listLocationHref(
      'http://localhost/?inboxType=attention#inbox?q=committed&page=3&pageSize=50&inboxType=pending',
      { inboxType: 'all', page: 1 },
    )
    const url = new URL(next, 'http://localhost')
    expect(url.searchParams.has('inboxType')).toBe(false)
    expect(readListLocation(url.href)).toMatchObject({
      inboxType: 'all',
      query: 'committed',
      page: 1,
      pageSize: 50,
    })
  })
})
