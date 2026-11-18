import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  fetchProjectReferences,
  parseProjectReferences,
  prepareProjectReferencesRequest,
  ProjectReferenceInputError,
  ProjectReferenceResponseError,
  type ProjectReferenceItem,
  type ProjectReferences,
  type ProjectReferencesRequest,
} from '../src/workbench/project-references'

const item = (
  id: string,
  task_count = 0,
  run_count = 0,
): ProjectReferenceItem => ({
  project: { id, name: `Research ${id}` },
  task_count,
  run_count,
})
function directory(): ProjectReferences {
  return {
    schema_version: 1,
    unit: 'project_references',
    query: '',
    requested_page: 1,
    page: 1,
    page_size: 20,
    total: 3,
    total_pages: 1,
    has_more: false,
    order: 'projects-created-v1',
    selected_ids: ['alpha', 'gone'],
    selected: [item('alpha', 2, 7)],
    missing_ids: ['gone'],
    totals: { projects: 3, tasks: 5, runs: 10 },
    items: [item('alpha', 2, 7), item('beta', 3, 3), item('empty')],
  }
}
const request = (): ProjectReferencesRequest => ({
  query: '',
  page: 1,
  pageSize: 20,
  selectedIds: ['gone', 'alpha'],
})
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

afterEach(() => vi.unstubAllGlobals())

describe('project reference request', () => {
  it('uses a bounded path with normalized search and canonical copied IDs', () => {
    const input = request()
    input.query = '\u0085\u001c  research \u001f'
    input.page = 3
    input.pageSize = 50
    const prepared = prepareProjectReferencesRequest(input)
    const url = new URL(prepared.path, 'http://localhost')
    expect(url.pathname).toBe('/project-references')
    expect([...url.searchParams.keys()]).toEqual([
      'q',
      'page',
      'page_size',
      'selected',
    ])
    expect(url.searchParams.get('q')).toBe('research')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('page_size')).toBe('50')
    expect(JSON.parse(url.searchParams.get('selected')!)).toEqual([
      'alpha',
      'gone',
    ])
    expect(prepared.selectedIds).not.toBe(input.selectedIds)
    expect(input.selectedIds).toEqual(['gone', 'alpha'])
  })

  it('sorts selected IDs by code points rather than UTF-16 units or locale', () => {
    const prepared = prepareProjectReferencesRequest({
      ...request(),
      selectedIds: ['\u{10000}', '\ue000', '\ufeffproject'],
    })
    expect(prepared.selectedIds).toEqual([
      '\ue000',
      '\ufeffproject',
      '\u{10000}',
    ])
  })

  it('keeps BOM as query content and accepts the full Unicode code-point limit', () => {
    const prepared = prepareProjectReferencesRequest({
      ...request(),
      query: `\ufeff${'\u{1f680}'.repeat(1998)}\ufeff`,
      page: 1_000_000,
      pageSize: 100,
      selectedIds: Array.from(
        { length: 100 },
        (_, index) => `project-${index}`,
      ),
    })
    expect([...prepared.query]).toHaveLength(2000)
    expect(prepared.query.startsWith('\ufeff')).toBe(true)
    expect(prepared.page).toBe(1_000_000)
    expect(prepared.selectedIds).toHaveLength(100)
  })

  it.each([
    {},
    { query: null },
    { query: true },
    { query: 10 },
    { query: '\ud800' },
    { query: 'bad\udfff' },
    { query: 'x'.repeat(2001) },
    { query: ' '.repeat(2001) },
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: '1' },
    { page: true },
    { page: Number.NaN },
    { page: Infinity },
    { page: 1_000_001 },
    { pageSize: 10 },
    { pageSize: '20' },
    { pageSize: true },
    { selectedIds: null },
    { selectedIds: 'alpha' },
    { selectedIds: ['alpha', 'alpha'] },
    { selectedIds: [''] },
    { selectedIds: [null] },
    { selectedIds: ['\ud800'] },
    { selectedIds: ['\u0085alpha'] },
    { selectedIds: ['alpha\u001c'] },
    { selectedIds: ['x'.repeat(101)] },
    {
      selectedIds: Array.from(
        { length: 101 },
        (_, index) => `project-${index}`,
      ),
    },
    { extra: true },
  ])('rejects invalid input without sending HTTP %j', async (patch) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const input = Object.keys(patch).length ? { ...request(), ...patch } : patch
    await expect(
      fetchProjectReferences(input as ProjectReferencesRequest),
    ).rejects.toBeInstanceOf(ProjectReferenceInputError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects missing request properties and non-plain objects', () => {
    for (const key of ['query', 'page', 'pageSize', 'selectedIds']) {
      const value = request() as unknown as Record<string, unknown>
      delete value[key]
      expect(() =>
        prepareProjectReferencesRequest(
          value as unknown as ProjectReferencesRequest,
        ),
      ).toThrow(ProjectReferenceInputError)
    }
    const inherited = Object.assign(Object.create({ foreign: true }), request())
    expect(() => prepareProjectReferencesRequest(inherited)).toThrow(
      ProjectReferenceInputError,
    )
  })
})

describe('project reference response', () => {
  it('keeps minimal references and independent task/all-Run counts', () => {
    const value = directory()
    const parsed = parseProjectReferences(value, request())
    expect(parsed).toEqual(value)
    expect(parsed).not.toBe(value)
    expect(parsed.items).not.toBe(value.items)
    expect(parsed.items[0].project).not.toBe(value.items[0].project)
    expect(parsed.totals).not.toBe(value.totals)
    expect(parsed.selected_ids).not.toBe(value.selected_ids)
    expect(parsed.selected[0].run_count).toBe(7)
    expect(parsed.selected[0].task_count).toBe(2)
    expect(Object.keys(parsed.items[0].project)).toEqual(['id', 'name'])
  })

  it('hydrates selected projects independently of page and search without sorting server rows', () => {
    const value = directory()
    value.query = 'server-owned Unicode match'
    value.total = 1
    value.items = [item('beta', 3, 3)]
    const parsed = parseProjectReferences(value, {
      ...request(),
      query: value.query,
    })
    expect(parsed.items.map((entry) => entry.project.id)).toEqual(['beta'])
    expect(parsed.selected.map((entry) => entry.project.id)).toEqual(['alpha'])
    expect(parsed.missing_ids).toEqual(['gone'])
    value.query = ''
    value.total = 3
    value.items = [item('empty'), item('beta', 3, 3), item('alpha', 2, 7)]
    expect(
      parseProjectReferences(value).items.map((entry) => entry.project.id),
    ).toEqual(['empty', 'beta', 'alpha'])
  })

  it('accepts no matches with real selected references and global totals retained', () => {
    const value = directory()
    value.query = 'no-matches'
    value.total = 0
    value.items = []
    expect(parseProjectReferences(value)).toMatchObject({
      total: 0,
      page: 1,
      selected: [item('alpha', 2, 7)],
      totals: { projects: 3, tasks: 5, runs: 10 },
    })
  })

  it('accepts a genuinely empty workspace without inventing a selected project', () => {
    const value = directory()
    value.total = 0
    value.totals = { projects: 0, tasks: 0, runs: 0 }
    value.items = []
    value.selected = []
    value.missing_ids = ['alpha', 'gone']
    expect(parseProjectReferences(value, request())).toEqual(value)
  })

  it.each([20, 50, 100] as const)(
    'uses real pagination and clamps requests for size %i',
    (pageSize) => {
      const value = directory()
      value.page_size = pageSize
      value.total = pageSize * 2 + 5
      value.total_pages = 3
      value.totals.projects = value.total
      value.requested_page = 100
      value.page = 3
      value.items = Array.from({ length: 5 }, (_, index) =>
        item(`last-${index}`),
      )
      expect(
        parseProjectReferences(value, {
          ...request(),
          page: 100,
          pageSize,
        }),
      ).toMatchObject({ requested_page: 100, page: 3, total_pages: 3 })
      value.requested_page = 2
      value.page = 2
      value.has_more = true
      value.items = Array.from({ length: pageSize }, (_, index) =>
        item(`middle-${index}`),
      )
      expect(parseProjectReferences(value).items).toHaveLength(pageSize)
    },
  )

  it('does not double-count a project appearing in both selected and page records', () => {
    const value = directory()
    value.selected_ids = ['alpha', 'beta', 'empty', 'gone']
    value.selected = [...value.items]
    expect(parseProjectReferences(value)).toEqual(value)
  })

  it('bounds sums over distinct known projects without summing overlapping sets twice', () => {
    const value = directory()
    value.query = 'subset'
    value.total = 1
    value.items = [item('beta', 4, 4)]
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
    value.items = [item('beta', 1, 4)]
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
    value.items = [item('beta', 1, 1)]
    expect(parseProjectReferences(value).items[0].task_count).toBe(1)
  })

  it('requires aggregate equality when every workspace project is represented', () => {
    const value = directory()
    value.totals.tasks = 6
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
    value.totals.tasks = 5
    value.totals.runs = 11
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
  })

  it.each([
    { extra: true },
    { detail: 'error' },
    { schema_version: 2 },
    { unit: 'project' },
    { order: 'locale-order' },
    { query: ' untrimmed' },
    { query: '\ud800' },
    { query: 'x'.repeat(2001) },
    { requested_page: 0 },
    { requested_page: 1_000_001 },
    { requested_page: '1' },
    { requested_page: true },
    { page: 0 },
    { page: 2 },
    { page_size: 25 },
    { page_size: '20' },
    { total: -1 },
    { total: 3.5 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { total: Number.NaN },
    { total: Infinity },
    { total: '3' },
    { total: true },
    { total: 2 },
    { total: 4 },
    { total_pages: 0 },
    { total_pages: 2 },
    { has_more: true },
    { has_more: 0 },
    { selected_ids: ['gone', 'alpha'] },
    { selected_ids: ['alpha', 'alpha', 'gone'] },
    { selected_ids: ['alpha'] },
    { selected_ids: 'alpha' },
    { selected_ids: [' alpha', 'gone'] },
    { selected_ids: ['\ud800', 'gone'] },
    { selected: [] },
    { selected: [item('beta', 3, 3)] },
    { selected: [item('alpha', 2, 7), item('alpha', 2, 7)] },
    { selected: null },
    { missing_ids: [] },
    { missing_ids: ['alpha', 'gone'] },
    { missing_ids: ['gone', 'gone'] },
    { missing_ids: ['unknown'] },
    { missing_ids: null },
    { totals: null },
    { totals: { projects: 3, tasks: 5 } },
    { totals: { projects: 3, tasks: 5, runs: 10, extra: true } },
    { totals: { projects: 0, tasks: 5, runs: 10 } },
    { totals: { projects: 3, tasks: 0, runs: 10 } },
    { totals: { projects: 3, tasks: -1, runs: 10 } },
    { totals: { projects: 3, tasks: 5, runs: Number.NaN } },
    { items: [] },
    { items: [item('alpha', 2, 7), item('beta', 3, 3)] },
    { items: [item('alpha', 2, 7), item('beta', 3, 3), item('alpha', 2, 7)] },
    { items: [item('alpha', 2, 7), item('beta', 3, 3), item('gone')] },
    { items: null },
  ])('rejects malformed or inconsistent directory metadata %j', (patch) => {
    expect(() => parseProjectReferences({ ...directory(), ...patch })).toThrow(
      ProjectReferenceResponseError,
    )
  })

  it.each([
    { task_count: -1 },
    { task_count: 6 },
    { task_count: true },
    { task_count: 1.5 },
    { task_count: '2' },
    { task_count: Number.MAX_SAFE_INTEGER + 1 },
    { task_count: 0, run_count: 1 },
    { run_count: 11 },
    { run_count: Infinity },
    { run_count: null },
    { extra: true },
    { project: { id: 'alpha', name: '\ud800' } },
    { project: { id: ' alpha', name: 'name' } },
    { project: { id: 'alpha', name: 1 } },
    { project: { id: 'alpha', name: 'name', notes: 'private' } },
    { project: null },
  ])('rejects malformed minimal records %j', (patch) => {
    for (const field of ['items', 'selected'] as const) {
      const value = directory()
      value[field][0] = {
        ...value[field][0],
        ...patch,
      } as ProjectReferenceItem
      expect(() => parseProjectReferences(value)).toThrow(
        ProjectReferenceResponseError,
      )
    }
  })

  it.each([
    { project: { id: 'alpha', name: 'other snapshot' } },
    { task_count: 1 },
    { run_count: 6 },
  ])('requires page and selected overlap to agree %j', (patch) => {
    const value = directory()
    value.selected[0] = { ...value.selected[0], ...patch }
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
  })

  it('requires selected hydration and missing IDs to be canonical partitions', () => {
    const value = directory()
    value.selected_ids = ['alpha', 'beta', 'empty', 'gone']
    value.selected = [item('beta', 3, 3), item('alpha', 2, 7), item('empty')]
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
    value.selected = [...value.items]
    value.selected_ids.push('later')
    value.missing_ids = ['later', 'gone']
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
  })

  it('binds response query, requested page, page size and selected IDs to the exact request', () => {
    for (const patch of [
      { query: 'changed' },
      { page: 2 },
      { pageSize: 50 as const },
      { selectedIds: ['alpha'] },
      { selectedIds: [] },
    ])
      expect(() =>
        parseProjectReferences(directory(), { ...request(), ...patch }),
      ).toThrow(ProjectReferenceResponseError)
  })

  it('checks canonical Unicode IDs while preserving server-owned names and row order', () => {
    const value = directory()
    value.items = [item('\u{10000}'), item('\ue000'), item('\ufeffproject')]
    value.selected_ids = ['\ue000', '\ufeffproject', '\u{10000}']
    value.selected = [value.items[1], value.items[2], value.items[0]]
    value.missing_ids = []
    value.totals = { projects: 3, tasks: 0, runs: 0 }
    const result = parseProjectReferences(value, {
      ...request(),
      selectedIds: ['\u{10000}', '\ufeffproject', '\ue000'],
    })
    expect(result.items[0].project.id).toBe('\u{10000}')
    expect(result.selected[0].project.id).toBe('\ue000')
  })

  it('rejects a missing field, symbol metadata or inherited response object', () => {
    for (const key of Object.keys(directory())) {
      const value = directory() as unknown as Record<string, unknown>
      delete value[key]
      expect(() => parseProjectReferences(value)).toThrow(
        ProjectReferenceResponseError,
      )
    }
    const value = directory()
    Object.defineProperty(value, Symbol('extra'), { value: true })
    expect(() => parseProjectReferences(value)).toThrow(
      ProjectReferenceResponseError,
    )
    expect(() =>
      parseProjectReferences(
        Object.assign(Object.create({ fake: true }), directory()),
      ),
    ).toThrow(ProjectReferenceResponseError)
  })
})

describe('project reference HTTP client', () => {
  it('binds admission to a copied sent request and forwards cancellation', async () => {
    let settle!: (value: Response) => void
    const fetch = vi.fn(
      () =>
        new Promise<Response>((done) => {
          settle = done
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const value = request()
    const controller = new AbortController()
    const pending = fetchProjectReferences(value, controller.signal)
    value.query = 'changed'
    value.page = 2
    value.pageSize = 50
    value.selectedIds.splice(0, 2, 'other')
    settle(response(directory()))
    await expect(pending).resolves.toEqual(directory())
    const url = new URL(fetch.mock.calls[0][0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/project-references')
    expect(url.searchParams.get('q')).toBe('')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('page_size')).toBe('20')
    expect(JSON.parse(url.searchParams.get('selected')!)).toEqual([
      'alpha',
      'gone',
    ])
    expect(fetch.mock.calls[0][1]).toMatchObject({ signal: controller.signal })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects response binding to later caller edits', async () => {
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
    const value = request()
    const pending = fetchProjectReferences(value)
    value.query = 'later'
    settle(response({ ...directory(), query: 'later' }))
    await expect(pending).rejects.toBeInstanceOf(ProjectReferenceResponseError)
  })

  it('preserves Abort and HTTP errors with exactly one GET', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const fetch = vi.fn().mockRejectedValue(abort)
    vi.stubGlobal('fetch', fetch)
    await expect(fetchProjectReferences(request())).rejects.toBe(abort)
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockReset().mockResolvedValue(response({ detail: 'Forbidden' }, 403))
    await expect(fetchProjectReferences(request())).rejects.toBeInstanceOf(
      ApiError,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a 2xx error envelope rather than manufacturing an empty directory', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: 'Directory unavailable' })),
    )
    await expect(fetchProjectReferences(request())).rejects.toBeInstanceOf(
      ProjectReferenceResponseError,
    )
  })

  it('dispatches auth cleanup before an invalid 401 body can fail JSON parsing', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    const fetch = vi.fn().mockResolvedValue(
      new Response('<html>Unauthorized</html>', {
        status: 401,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    await expect(fetchProjectReferences(request())).rejects.toBeInstanceOf(
      SyntaxError,
    )
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0][0].type).toBe('mybot:unauthorized')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
