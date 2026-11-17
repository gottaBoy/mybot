import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  fetchWorkspaceCounts,
  fetchWorkspaceSearch,
  parseWorkspaceCounts,
  parseWorkspaceSearch,
  prepareWorkspaceCountsRequest,
  prepareWorkspaceSearchRequest,
  WorkspaceReadInputError,
  WorkspaceReadResponseError,
  type WorkspaceCountsRequest,
  type WorkspaceSearchRequest,
} from '../src/workbench/workspace-reads'

const counts = {
  schema_version: 1,
  unit: 'workspace_counts',
  projects: ['project-1'],
  scope_project_id: 'project-1',
  task_counts: {
    all: 6,
    pending: 1,
    active: 1,
    attention: 1,
    completed: 1,
    other: 2,
  },
  run_counts: {
    all: 45,
    active: 1,
    attention: 41,
    completed: 1,
    other: 2,
  },
}
const project = { id: 'project-1', name: 'Research 研发' }
const task = {
  id: 'task-1',
  project_id: project.id,
  title: 'Release 2',
}
const run = {
  id: 'run-1',
  task_id: task.id,
  status: 'succeeded',
  created_at: '2026-11-17T00:00:00Z',
}
const search = {
  schema_version: 1,
  unit: 'workspace_search',
  query: 'release',
  limit: 20,
  total: 3,
  has_more: false,
  scope_project_id: project.id,
  order: 'projects-tasks-runs-created-v1',
  items: [
    { kind: 'project', project },
    { kind: 'task', task, project },
    { kind: 'run', run, task, project },
  ],
}
const countRequest = (): WorkspaceCountsRequest => ({
  projects: ['project-1'],
  scopeProjectId: 'project-1',
})
const searchRequest = (): WorkspaceSearchRequest => ({
  query: 'release',
  limit: 20,
  scopeProjectId: 'project-1',
})
const clone = <T>(value: T): T => structuredClone(value)
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('workspace counts client', () => {
  it('preserves task-latest and all-Run denominators independently', () => {
    const result = parseWorkspaceCounts(counts, countRequest())
    expect(result.task_counts).toEqual(counts.task_counts)
    expect(result.run_counts).toEqual(counts.run_counts)
    expect(result.run_counts.attention).toBe(41)
    expect(result.task_counts.attention).toBe(1)
    expect(result.projects).not.toBe(counts.projects)
    expect(result.task_counts).not.toBe(counts.task_counts)
  })

  it('admits known zero without converting an error or missing value to zero', () => {
    const value = clone(counts)
    for (const key of Object.keys(value.task_counts))
      value.task_counts[key as keyof typeof value.task_counts] = 0
    for (const key of Object.keys(value.run_counts))
      value.run_counts[key as keyof typeof value.run_counts] = 0
    expect(parseWorkspaceCounts(value).task_counts.all).toBe(0)
    expect(() => parseWorkspaceCounts({ detail: 'unavailable' })).toThrow(
      WorkspaceReadResponseError,
    )
  })

  it('canonicalizes project IDs by code points while fixed scope wins over valid conflicts', () => {
    const canonical = prepareWorkspaceCountsRequest({
      projects: ['\u{10000}', '\ue000', '\ufeffproject'],
    })
    expect(canonical.effectiveProjects).toEqual([
      '\ue000',
      '\ufeffproject',
      '\u{10000}',
    ])
    const prepared = prepareWorkspaceCountsRequest({
      projects: ['project-2', 'project-1'],
      scopeProjectId: 'project-3',
    })
    const url = new URL(prepared.path, 'http://localhost')
    expect(JSON.parse(url.searchParams.get('projects')!)).toEqual([
      'project-1',
      'project-2',
    ])
    expect(prepared.effectiveProjects).toEqual(['project-3'])
    expect(url.searchParams.get('scope_project_id')).toBe('project-3')
  })

  it.each([
    { extra: true },
    { schema_version: 2 },
    { unit: 'tasks' },
    { scope_project_id: undefined },
    { scope_project_id: ' project-1' },
    { projects: ['project-1', 'project-1'] },
    { projects: ['project-2'] },
    { projects: [] },
    { task_counts: null },
    { task_counts: { ...counts.task_counts, pending: undefined } },
    { task_counts: { ...counts.task_counts, all: 7 } },
    { task_counts: { ...counts.task_counts, active: -1 } },
    { task_counts: { ...counts.task_counts, other: '2' } },
    { task_counts: { ...counts.task_counts, active: 1.5 } },
    { task_counts: { ...counts.task_counts, active: true } },
    { task_counts: { ...counts.task_counts, active: Number.NaN } },
    {
      task_counts: { ...counts.task_counts, all: Number.MAX_SAFE_INTEGER + 1 },
    },
    { run_counts: { ...counts.run_counts, pending: 0 } },
    { run_counts: { ...counts.run_counts, all: 44 } },
    { run_counts: { ...counts.run_counts, active: Infinity } },
  ])('rejects malformed or contradictory count metadata %j', (patch) => {
    expect(() => parseWorkspaceCounts({ ...counts, ...patch })).toThrow(
      WorkspaceReadResponseError,
    )
  })

  it('rejects noncanonical project ordering even without an expected request', () => {
    expect(() =>
      parseWorkspaceCounts({
        ...counts,
        projects: ['project-2', 'project-1'],
        scope_project_id: null,
      }),
    ).toThrow(WorkspaceReadResponseError)
  })

  it('requires count scope and projects to match the exact effective request', () => {
    expect(() =>
      parseWorkspaceCounts(counts, {
        projects: ['project-1'],
      }),
    ).toThrow(WorkspaceReadResponseError)
    expect(() =>
      parseWorkspaceCounts(counts, {
        projects: ['project-1'],
        scopeProjectId: 'project-2',
      }),
    ).toThrow(WorkspaceReadResponseError)
    expect(
      parseWorkspaceCounts(counts, {
        projects: ['missing-project'],
        scopeProjectId: 'project-1',
      }).projects,
    ).toEqual(['project-1'])
  })

  it.each([
    {},
    { projects: 'project-1' },
    { projects: ['project-1', 'project-1'] },
    { projects: ['project-1', 'project-1'], scopeProjectId: 'project-2' },
    { projects: ['\ud800'] },
    { projects: ['\u0085project'] },
    { projects: ['project\u001c'] },
    { projects: ['x'.repeat(101)] },
    { projects: Array.from({ length: 101 }, (_, index) => `project-${index}`) },
    { projects: [], scopeProjectId: null },
    { projects: [], scopeProjectId: '' },
    { projects: [], extra: true },
  ])(
    'rejects invalid count input without a network request %j',
    async (value) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      await expect(
        fetchWorkspaceCounts(value as WorkspaceCountsRequest),
      ).rejects.toBeInstanceOf(WorkspaceReadInputError)
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('binds a response to the sent count snapshot, not the mutable caller', async () => {
    let settle!: (value: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          settle = done
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const value = countRequest()
    const controller = new AbortController()
    const pending = fetchWorkspaceCounts(value, controller.signal)
    value.projects[0] = 'changed'
    value.scopeProjectId = 'changed'
    settle(response(counts))
    await expect(pending).resolves.toEqual(counts)
    const url = new URL(fetch.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/workspace/counts')
    expect(url.searchParams.get('scope_project_id')).toBe('project-1')
    expect(fetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
  })
})

describe('workspace search client', () => {
  it('parses exact tagged minimal references without inventing task or project details', () => {
    const result = parseWorkspaceSearch(search, searchRequest())
    expect(result).toEqual(search)
    expect(result.items).not.toBe(search.items)
    expect(Object.keys(result.items[1])).toEqual(['kind', 'task', 'project'])
    expect(result.items[1].project).toEqual(project)
    expect('goal' in result.items[1].project).toBe(false)
  })

  it('accepts an unscoped search with no projects request field', () => {
    const prepared = prepareWorkspaceSearchRequest({ query: '', limit: 20 })
    const url = new URL(prepared.path, 'http://localhost')
    expect(url.pathname).toBe('/workspace/search')
    expect([...url.searchParams.keys()]).toEqual(['q', 'limit'])
    expect(url.searchParams.get('q')).toBe('')
    expect(
      parseWorkspaceSearch(
        { ...search, scope_project_id: null },
        { query: 'release', limit: 20 },
      ).scope_project_id,
    ).toBeNull()
  })

  it.each(['\u0085', '\u001c', '\u001d', '\u001e', '\u001f'])(
    'uses Python whitespace normalization for queries %j',
    (space) => {
      const prepared = prepareWorkspaceSearchRequest({
        query: `${space}release${space}`,
        limit: 20,
      })
      expect(prepared.query).toBe('release')
      expect(
        parseWorkspaceSearch(search, {
          ...searchRequest(),
          query: `${space}release${space}`,
        }).query,
      ).toBe('release')
    },
  )

  it('preserves literal BOM, astral text and the server order without browser filtering', () => {
    const query = '\ufeff\ua7cb𐀀\ufeff'
    const value = {
      ...search,
      query,
      items: [...search.items].reverse(),
    }
    expect(
      parseWorkspaceSearch(value, { ...searchRequest(), query }).items,
    ).toEqual(value.items)
    expect(prepareWorkspaceSearchRequest({ query, limit: 20 }).query).toBe(
      query,
    )
  })

  it('keeps unique kinds separate even when their identifiers have the same spelling', () => {
    const value = clone(search)
    value.items = [
      { kind: 'project', project },
      {
        kind: 'task',
        task: { ...task, id: project.id },
        project,
      },
      {
        kind: 'run',
        run: { ...run, id: project.id, task_id: project.id },
        task: { ...task, id: project.id },
        project,
      },
    ]
    expect(parseWorkspaceSearch(value).items).toHaveLength(3)
  })

  it('validates bounded result totals without requiring all matches to be transferred', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      kind: 'task',
      task: { ...task, id: `task-${index}` },
      project,
    }))
    const value = { ...search, total: 57, has_more: true, items }
    expect(parseWorkspaceSearch(value).items).toHaveLength(20)
    expect(() => parseWorkspaceSearch({ ...value, has_more: false })).toThrow(
      WorkspaceReadResponseError,
    )
    expect(() =>
      parseWorkspaceSearch({ ...value, items: items.slice(0, 19) }),
    ).toThrow(WorkspaceReadResponseError)
    const fifty = {
      ...value,
      limit: 50,
      items: Array.from({ length: 50 }, (_, index) => ({
        kind: 'task',
        task: { ...task, id: `task-${index}` },
        project,
      })),
    }
    expect(parseWorkspaceSearch(fifty).items).toHaveLength(50)
  })

  it('accepts true empty results only with matching zero and has-more metadata', () => {
    const value = { ...search, total: 0, items: [] }
    expect(parseWorkspaceSearch(value).total).toBe(0)
    expect(() => parseWorkspaceSearch({ ...value, has_more: true })).toThrow(
      WorkspaceReadResponseError,
    )
  })

  it.each([
    { extra: true },
    { schema_version: 0 },
    { unit: 'workspace_counts' },
    { query: ' release' },
    { query: 'x'.repeat(2001) },
    { query: '\ud800' },
    { query: '\udfff' },
    { limit: 21 },
    { limit: true },
    { total: 4 },
    { total: -1 },
    { total: 1.5 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { total: '3' },
    { has_more: true },
    { has_more: 0 },
    { scope_project_id: '' },
    { scope_project_id: undefined },
    { scope_project_id: 'other-project' },
    { order: 'unknown' },
    { items: null },
    { items: [search.items[0], search.items[0], search.items[2]] },
  ])('rejects malformed search response metadata %j', (patch) => {
    expect(() => parseWorkspaceSearch({ ...search, ...patch })).toThrow(
      WorkspaceReadResponseError,
    )
  })

  it.each([
    { ...search.items[0], extra: true },
    { ...search.items[0], kind: 'unknown' },
    { ...search.items[0], project: { ...project, goal: 'private' } },
    { ...search.items[0], project: { ...project, id: ' project-1' } },
    { ...search.items[0], project: { ...project, name: '\ud800' } },
    { ...search.items[1], task: { ...task, goal: 'private' } },
    { ...search.items[1], task: { ...task, title: '\udfff' } },
    { ...search.items[1], task: { ...task, project_id: 'other' } },
    { ...search.items[2], run: { ...run, task_id: 'other-task' } },
    { ...search.items[2], run: { ...run, created_at: 'unknown' } },
    { ...search.items[2], run: { ...run, context: 'private' } },
    { ...search.items[2], run: null },
  ])('rejects malformed minimal references %j', (item) => {
    expect(() =>
      parseWorkspaceSearch({ ...search, total: 1, items: [item] }),
    ).toThrow(WorkspaceReadResponseError)
  })

  it('rejects conflicting project and task references within one snapshot', () => {
    const conflictingProject = clone(search)
    conflictingProject.items[1].project = {
      ...conflictingProject.items[1].project,
      name: 'Different project',
    }
    expect(() => parseWorkspaceSearch(conflictingProject)).toThrow(
      WorkspaceReadResponseError,
    )
    const conflictingTitle = clone(search)
    conflictingTitle.items[2].task = {
      ...conflictingTitle.items[2].task!,
      title: 'Different task',
    }
    expect(() => parseWorkspaceSearch(conflictingTitle)).toThrow(
      WorkspaceReadResponseError,
    )
    const conflictingTaskProject = clone(search)
    conflictingTaskProject.items[2].task!.project_id = 'project-2'
    conflictingTaskProject.items[2].project = {
      id: 'project-2',
      name: 'Project 2',
    }
    conflictingTaskProject.scope_project_id = null as unknown as string
    expect(() => parseWorkspaceSearch(conflictingTaskProject)).toThrow(
      WorkspaceReadResponseError,
    )
  })

  it('requires exact query, scope and capacity agreement with the sent request', () => {
    for (const patch of [
      { query: 'different' },
      { limit: 50 as const },
      { scopeProjectId: 'other-project' },
      { scopeProjectId: undefined },
    ])
      expect(() =>
        parseWorkspaceSearch(search, { ...searchRequest(), ...patch }),
      ).toThrow(WorkspaceReadResponseError)
  })

  it('accepts unknown well-formed Run statuses as source facts', () => {
    const value = clone(search)
    value.items[2].run!.status = 'future_provider_status'
    expect(parseWorkspaceSearch(value).items[2]).toMatchObject({
      run: { status: 'future_provider_status' },
    })
  })

  it.each([
    {},
    { query: true, limit: 20 },
    { query: '', limit: 21 },
    { query: '', limit: '20' },
    { query: '', limit: true },
    { query: '\ud800', limit: 20 },
    { query: '\udfff', limit: 20 },
    { query: 'tail\ud800', limit: 20 },
    { query: 'x'.repeat(2001), limit: 20 },
    { query: '', limit: 20, scopeProjectId: null },
    { query: '', limit: 20, scopeProjectId: '\u0085project' },
    { query: '', limit: 20, scopeProjectId: 'x'.repeat(101) },
    { query: '', limit: 20, projects: [] },
    { query: '', limit: 20, extra: true },
  ])('rejects invalid search input before HTTP %j', async (value) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchWorkspaceSearch(value as WorkspaceSearchRequest),
    ).rejects.toBeInstanceOf(WorkspaceReadInputError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('binds search to its sent snapshot and forwards an AbortSignal', async () => {
    let settle!: (value: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          settle = done
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const value = searchRequest()
    const controller = new AbortController()
    const pending = fetchWorkspaceSearch(value, controller.signal)
    value.query = 'changed after send'
    value.limit = 50
    value.scopeProjectId = 'different'
    settle(response(search))
    await expect(pending).resolves.toEqual(search)
    const url = new URL(fetch.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/workspace/search')
    expect(url.searchParams.get('q')).toBe('release')
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('scope_project_id')).toBe('project-1')
    expect(fetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
  })

  it('rejects a caller-mutated response binding rather than accepting the new criteria', async () => {
    let settle!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            settle = done
          }),
      ),
    )
    const value = searchRequest()
    const pending = fetchWorkspaceSearch(value)
    value.query = 'changed'
    settle(response({ ...search, query: 'changed' }))
    await expect(pending).rejects.toBeInstanceOf(WorkspaceReadResponseError)
  })

  it('preserves Abort and HTTP errors without automatic retries', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetch = vi.fn().mockRejectedValue(abort)
    vi.stubGlobal('fetch', fetch)
    await expect(fetchWorkspaceSearch(searchRequest())).rejects.toBe(abort)
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockReset().mockResolvedValue(response({ detail: 'Forbidden' }, 403))
    await expect(fetchWorkspaceSearch(searchRequest())).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a 2xx error envelope instead of manufacturing zero results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: 'Search failed' })),
    )
    await expect(fetchWorkspaceSearch(searchRequest())).rejects.toBeInstanceOf(
      WorkspaceReadResponseError,
    )
  })
})
