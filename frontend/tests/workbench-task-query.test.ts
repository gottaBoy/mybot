import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import { readFileSync } from 'node:fs'
import { compareTaskQueryText } from './fixtures/task-query-order'
import {
  fetchTaskQueryPage,
  parseTaskQueryPage,
  prepareTaskQueryRequest,
  TaskQueryInputError,
  TaskQueryResponseError,
  type ServerTaskQueryRequest,
} from '../src/workbench/task-query'

const response = {
  schema_version: 1,
  unit: 'tasks',
  items: [
    {
      task: {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Release 2',
        goal: 'Goal',
        acceptance: 'Acceptance',
        files: ['README.md'],
        created_at: '2026-11-16T00:00:00Z',
      },
      project: { id: 'project-1', name: 'Project 1' },
      latest_run: {
        id: 'run-1',
        task_id: 'task-1',
        status: 'succeeded',
        created_at: '2026-11-16T01:00:00Z',
      },
      state_category: 'completed',
      attempts: 2,
    },
  ],
  total: 21,
  requested_page: 2,
  page: 2,
  page_size: 20,
  total_pages: 2,
  has_more: false,
  query: {
    text: 'release',
    projects: ['project-1'],
    states: ['completed'],
    jql: '',
    mode: 'basic',
  },
  sorts: [{ sortKey: 'title', direction: 'descending' }],
  scope_project_id: 'project-1',
  sort_semantics: 'unicode-natural-v1',
}

afterEach(() => vi.unstubAllGlobals())

function request(): ServerTaskQueryRequest {
  return {
    query: {
      text: 'release',
      projects: ['project-1'],
      states: ['completed'],
      jql: '',
      mode: 'basic',
    },
    sorts: [{ sortKey: 'title', direction: 'descending' }],
    scopeProjectId: 'project-1',
    page: 2,
    pageSize: 20,
  }
}

describe('server task query client', () => {
  it('parses bounded task projections without inventing task or Run fields', () => {
    const page = parseTaskQueryPage(response)
    expect(page.total).toBe(21)
    expect(page.items[0]).toMatchObject({
      id: 'task-1',
      projectName: 'Project 1',
      column: 'completed',
      attempts: 2,
    })
    expect(page.items[0].task.goal).toBe('Goal')
    expect(page.items[0].run?.id).toBe('run-1')
  })

  it.each([
    { ...response, extra: true },
    { ...response, items: [{ ...response.items[0], attempts: -1 }] },
    { ...response, item: response.items[0] },
    { ...response, scope_project_id: 1 },
    { ...response, sort_semantics: '' },
  ])('rejects malformed page envelopes %j', (value) => {
    expect(() => parseTaskQueryPage(value)).toThrow(TaskQueryResponseError)
  })

  it('rejects cross-object task/project and run identities', () => {
    expect(() =>
      parseTaskQueryPage({
        ...response,
        items: [
          {
            ...response.items[0],
            project: { id: 'other-project', name: 'Other' },
          },
        ],
      }),
    ).toThrow(TaskQueryResponseError)
    expect(() =>
      parseTaskQueryPage({
        ...response,
        items: [
          {
            ...response.items[0],
            latest_run: { ...response.items[0].latest_run, task_id: 'other' },
          },
        ],
      }),
    ).toThrow(TaskQueryResponseError)
  })

  it.each([
    { total_pages: 3 },
    { has_more: true },
    { page: 1 },
    { page_size: '20' },
    { total: 22 },
    { items: [] },
    { sort_semantics: 'unknown-v2' },
    { sorts: [{ sortKey: 'bogus', direction: 'ascending' }] },
    {
      sorts: [
        { sortKey: 'title', direction: 'ascending' },
        { sortKey: 'title', direction: 'descending' },
      ],
    },
    { query: { ...response.query, projects: ['another-project'] } },
    {
      items: [
        {
          ...response.items[0],
          state_category: 'attention',
        },
      ],
    },
    {
      items: [
        {
          ...response.items[0],
          attempts: 0,
        },
      ],
    },
  ])('rejects contradictory pagination, state or ordering %j', (patch) => {
    expect(() => parseTaskQueryPage({ ...response, ...patch })).toThrow(
      TaskQueryResponseError,
    )
  })

  it('binds responses to the exact committed request rather than any valid envelope', () => {
    expect(() =>
      parseTaskQueryPage(response, {
        query: {
          text: 'different',
          projects: ['project-1'],
          states: ['completed'],
          jql: '',
          mode: 'basic',
        },
        sorts: [{ sortKey: 'title', direction: 'descending' }],
        scopeProjectId: 'project-1',
        page: 2,
        pageSize: 20,
      }),
    ).toThrow(TaskQueryResponseError)
  })

  it('binds JQL effective ordering rather than the overridden explicit sorts', () => {
    const value = {
      ...response,
      query: {
        ...response.query,
        jql: 'ORDER BY CREATED ASC',
        mode: 'jql' as const,
      },
      sorts: [{ sortKey: 'created_at', direction: 'ascending' }],
    }
    const expected = {
      ...request(),
      query: { ...value.query, jql: ' order  by created asc ' },
    }
    expect(parseTaskQueryPage(value, expected).sorts).toEqual(value.sorts)
    expect(() =>
      parseTaskQueryPage({ ...value, sorts: response.sorts }, expected),
    ).toThrow(TaskQueryResponseError)
  })

  it.each([
    { page: 0 },
    { page: 1.5 },
    { page: Number.NaN },
    { page: 90071992547410 },
    { pageSize: 21 },
    { pageSize: true },
    { scopeProjectId: '\u0085project-1' },
    { query: { ...response.query, text: '\ud800' } },
    { query: { ...response.query, jql: '\ud800' } },
    { query: { ...response.query, projects: ['project-1', 'project-1'] } },
    { query: { ...response.query, states: ['completed', 'completed'] } },
    { query: { ...response.query, mode: 'unknown' } },
  ])(
    'rejects malformed request candidates before making an HTTP call %j',
    async (patch) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      await expect(
        fetchTaskQueryPage({
          ...request(),
          ...patch,
        } as ServerTaskQueryRequest),
      ).rejects.toBeInstanceOf(TaskQueryInputError)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['\u0085', '\u001c', '\u001d', '\u001e', '\u001f'])(
    'uses Python whitespace semantics for text and JQL %j',
    (space) => {
      const value = request()
      value.query.text = `${space}release${space}`
      value.query.jql = `${space}order${space}by${space}summary${space}desc${space}`
      const prepared = prepareTaskQueryRequest(value)
      expect(prepared.query.text).toBe('release')
      expect(prepared.query.jql).toBe('ORDER BY SUMMARY DESC')
      expect(prepared.sorts).toEqual([
        { sortKey: 'title', direction: 'descending' },
      ])
    },
  )

  it('preserves a BOM as a literal text character instead of trimming it', () => {
    const value = request()
    value.query.text = '\ufeffrelease\ufeff'
    expect(prepareTaskQueryRequest(value).query.text).toBe(
      '\ufeffrelease\ufeff',
    )
    value.query.jql = '\ufeffORDER BY SUMMARY DESC'
    expect(() => prepareTaskQueryRequest(value)).toThrow(TaskQueryInputError)
  })

  it('canonicalizes project IDs by Unicode code points, not UTF-16 units', () => {
    const value = { ...request(), scopeProjectId: undefined }
    value.query.projects = ['\u{10000}', '\ue000', '\ufeffproject']
    expect(prepareTaskQueryRequest(value).query.projects).toEqual([
      '\ue000',
      '\ufeffproject',
      '\u{10000}',
    ])
  })

  it.each(['\u0085project', 'project\u001c'])(
    'rejects Python-whitespace-padded project IDs %j',
    (project) => {
      const value = { ...request(), scopeProjectId: undefined }
      value.query.projects = [project]
      expect(() => prepareTaskQueryRequest(value)).toThrow(TaskQueryInputError)
    },
  )

  it('rejects duplicated latest Run identities across different tasks', () => {
    const first = response.items[0]
    const second = {
      ...first,
      task: { ...first.task, id: 'task-2' },
      latest_run: { ...first.latest_run, task_id: 'task-2' },
    }
    expect(() =>
      parseTaskQueryPage({
        ...response,
        items: [first, second],
        total: 2,
        requested_page: 1,
        page: 1,
        total_pages: 1,
      }),
    ).toThrow(TaskQueryResponseError)
  })

  it('rejects conflicting project names within the same response snapshot', () => {
    const first = response.items[0]
    const second = {
      ...first,
      task: { ...first.task, id: 'task-2' },
      project: { ...first.project, name: 'Different project identity' },
      latest_run: { ...first.latest_run, id: 'run-2', task_id: 'task-2' },
    }
    expect(() =>
      parseTaskQueryPage({
        ...response,
        items: [first, second],
        total: 2,
        requested_page: 1,
        page: 1,
        total_pages: 1,
      }),
    ).toThrow(TaskQueryResponseError)
  })

  it.each([
    { task: { ...response.items[0].task, title: '\ud800' } },
    { task: { ...response.items[0].task, goal: '\ud800' } },
    { task: { ...response.items[0].task, acceptance: '\ud800' } },
    { task: { ...response.items[0].task, files: ['\ud800'] } },
    { project: { ...response.items[0].project, name: '\ud800' } },
    {
      latest_run: {
        ...response.items[0].latest_run,
        status: '\ud800',
      },
      state_category: 'other',
    },
  ])('rejects unpaired surrogate text in task projections %j', (patch) => {
    expect(() =>
      parseTaskQueryPage({
        ...response,
        query: { ...response.query, text: '', states: [] },
        items: [{ ...response.items[0], ...patch }],
      }),
    ).toThrow(TaskQueryResponseError)
  })

  it('accepts unknown well-formed statuses only as other, never as pending', () => {
    const value = {
      ...response,
      query: { ...response.query, states: ['other'] },
      items: [
        {
          ...response.items[0],
          latest_run: {
            ...response.items[0].latest_run,
            status: 'future_provider_state',
          },
          state_category: 'other',
        },
      ],
    }
    expect(parseTaskQueryPage(value).items[0].column).toBe('other')
    value.items[0].state_category = 'pending'
    expect(() => parseTaskQueryPage(value)).toThrow(TaskQueryResponseError)
  })

  it('accepts an explicitly clamped empty page without inventing zero pages', () => {
    const value = {
      ...response,
      items: [],
      total: 0,
      requested_page: 90071992547409,
      page: 1,
      total_pages: 1,
    }
    expect(parseTaskQueryPage(value).page).toBe(1)
    expect(() => parseTaskQueryPage({ ...value, total_pages: 0 })).toThrow(
      TaskQueryResponseError,
    )
  })

  it('preserves server order and matching when runtime Unicode versions differ', () => {
    const first = structuredClone(response.items[0])
    first.task.id = 'task-first'
    first.task.title = '\u0264 z'
    first.latest_run.task_id = first.task.id
    const second = structuredClone(first)
    second.task.id = 'task-second'
    second.task.title = '\ua7cb a'
    second.latest_run.id = 'run-second'
    second.latest_run.task_id = second.task.id
    const value = {
      ...response,
      items: [first, second],
      query: { ...response.query, text: '' },
      total: 2,
      requested_page: 1,
      page: 1,
      total_pages: 1,
      sorts: [{ sortKey: 'title', direction: 'ascending' }],
    }
    // The server owns search and whole-result ordering. A browser's newer
    // lowercase table must not re-filter or re-sort its bounded response.
    const page = parseTaskQueryPage(value, {
      ...request(),
      query: value.query as ServerTaskQueryRequest['query'],
      sorts: [{ sortKey: 'title', direction: 'ascending' }],
      page: 1,
    })
    expect(page.items.map((item) => item.id)).toEqual([
      'task-first',
      'task-second',
    ])
  })

  it('rejects malformed sort DTOs even when properties are inherited or hidden', () => {
    const inherited = Object.create({
      sortKey: 'title',
      direction: 'descending',
    })
    Object.defineProperties(inherited, {
      sortKey: { value: 'title', enumerable: true },
      direction: { value: 'descending', enumerable: true },
    })
    const hidden = {
      sortKey: 'title',
      direction: 'descending',
      [Symbol('unexpected')]: true,
    }
    for (const rule of [inherited, hidden]) {
      expect(() => parseTaskQueryPage({ ...response, sorts: [rule] })).toThrow(
        TaskQueryResponseError,
      )
      expect(() =>
        prepareTaskQueryRequest({ ...request(), sorts: [rule] }),
      ).toThrow(TaskQueryInputError)
    }
  })

  const collationCases = JSON.parse(
    readFileSync(
      new URL('../../tests/fixtures/task-query-order.json', import.meta.url),
      'utf8',
    ),
  ) as Array<[string, string, number]>
  it.each(collationCases)(
    'matches the inspected Python natural-order example for %j and %j',
    (left, right, expected) => {
      expect(compareTaskQueryText(left, right)).toBe(expected)
    },
  )

  it('serializes query, sort, page and fixed scope through the API boundary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetch)
    await fetchTaskQueryPage({
      query: {
        text: 'release',
        projects: ['project-1'],
        states: ['completed'],
        jql: '',
        mode: 'basic',
      },
      sorts: [{ sortKey: 'title', direction: 'descending' }],
      scopeProjectId: 'project-1',
      page: 2,
      pageSize: 20,
    })
    const url = new URL(fetch.mock.calls[0][0], 'http://localhost')
    expect(url.pathname).toBe('/api/tasks/query')
    expect(url.searchParams.get('scope_project_id')).toBe('project-1')
    expect(JSON.parse(url.searchParams.get('query')!).text).toBe('release')
    expect(JSON.parse(url.searchParams.get('sorts')!)).toEqual([
      { sortKey: 'title', direction: 'descending' },
    ])
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.get('page_size')).toBe('20')
  })

  it('binds an awaited response to the sent request snapshot, not mutable caller state', async () => {
    let resolve!: (value: Response) => void
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const value = request()
    const pending = fetchTaskQueryPage(value)
    value.query.text = 'changed after send'
    value.query.projects[0] = 'changed-project'
    value.query.states[0] = 'other'
    value.sorts[0].sortKey = 'id'
    value.page = 1
    resolve(new Response(JSON.stringify(response), { status: 200 }))
    await expect(pending).resolves.toMatchObject({
      requested_page: 2,
      query: response.query,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not accept a different awaited response just because caller state changed to match it', async () => {
    let resolve!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((done) => {
            resolve = done
          }),
      ),
    )
    const value = request()
    const pending = fetchTaskQueryPage(value)
    value.query.text = 'different'
    resolve(
      new Response(
        JSON.stringify({
          ...response,
          query: { ...response.query, text: 'different' },
        }),
        { status: 200 },
      ),
    )
    await expect(pending).rejects.toBeInstanceOf(TaskQueryResponseError)
  })

  it('preserves abort and provider/API error boundaries without a retry', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetch = vi.fn().mockRejectedValue(abort)
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchTaskQueryPage({
        query: { text: '', projects: [], states: [], jql: '', mode: 'basic' },
        sorts: [],
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBe(abort)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: { code: 'task_query_invalid' } }),
          {
            status: 422,
          },
        ),
      ),
    )
    await expect(
      fetchTaskQueryPage({
        query: { text: '', projects: [], states: [], jql: '', mode: 'basic' },
        sorts: [],
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
