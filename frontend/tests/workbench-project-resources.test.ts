import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  fetchProjectDetail,
  fetchProjectQuery,
  parseProjectDetail,
  parseProjectQuery,
  prepareProjectDetailRequest,
  prepareProjectQueryRequest,
  ProjectDetailResponseError,
  ProjectQueryResponseError,
  ProjectResourceInputError,
} from '../src/workbench/project-resources'

const detail = {
  schema_version: 1,
  unit: 'project_detail',
  project: {
    id: 'alpha',
    name: 'Alpha',
    goal: 'Goal',
    directory: 'src',
    notes: 'Private notes',
  },
  task_count: 2,
  run_count: 4,
}
const item = (id: string) => ({
  project: { id, name: id, goal: id === 'alpha' ? 'Goal' : '', directory: '.' },
  task_count: id === 'empty' ? 0 : 1,
  run_count: id === 'empty' ? 0 : 2,
})
const query = {
  schema_version: 1,
  unit: 'project_query',
  query: '',
  requested_page: 1,
  page: 1,
  page_size: 20,
  total: 2,
  total_pages: 1,
  has_more: false,
  order: 'projects-created-v1',
  items: [item('alpha'), item('empty')],
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())
const clone = <T>(value: T): T => structuredClone(value)

describe('project resource requests', () => {
  it('prepares exact detail path and bounded query parameters', () => {
    expect(prepareProjectDetailRequest('alpha').path).toBe(
      '/projects/alpha/detail',
    )
    const prepared = prepareProjectQueryRequest({
      query: '  alpha ',
      page: 3,
      pageSize: 50,
    })
    expect(prepared.query).toBe('alpha')
    expect(prepared.path).toContain('q=alpha&page=3&page_size=50')
  })

  it.each(['', ' alpha', 'alpha ', 'a'.repeat(101), '\ud800'])(
    'rejects invalid detail identifiers %j before HTTP',
    (identifier) => {
      expect(() => prepareProjectDetailRequest(identifier)).toThrow(
        ProjectResourceInputError,
      )
    },
  )
  it('encodes route-special IDs and preserves BOM rather than JS-trimming it', () => {
    expect(prepareProjectDetailRequest('a?b#c').path).toBe(
      '/projects/a%3Fb%23c/detail',
    )
    expect(
      prepareProjectQueryRequest({
        query: '\ufeffa\ufeff',
        page: 1,
        pageSize: 20,
      }).query,
    ).toBe('\ufeffa\ufeff')
  })
  it.each([
    { query: 4 },
    { query: '\ud800' },
    { query: 'a'.repeat(2001) },
    { page: 0 },
    { page: 1.5 },
    { page: 1_000_001 },
    { page: true },
    { pageSize: 21 },
    { pageSize: '20' },
    { extra: true },
  ])('rejects invalid query input %j', (patch) => {
    expect(() =>
      prepareProjectQueryRequest({
        query: '',
        page: 1,
        pageSize: 20,
        ...patch,
      } as never),
    ).toThrow(ProjectResourceInputError)
  })
  it('parses full detail while retaining private notes only in detail', () => {
    const value = parseProjectDetail(detail, 'alpha')
    expect(value.project.notes).toBe('Private notes')
    expect(() =>
      parseProjectDetail(
        { ...detail, project: { ...detail.project, id: 'beta' } },
        'alpha',
      ),
    ).toThrow(ProjectDetailResponseError)
  })
  it.each([
    { schema_version: 2 },
    { unit: 'projects' },
    { task_count: -1 },
    { task_count: 1.5 },
    { run_count: Number.MAX_SAFE_INTEGER + 1 },
    { run_count: '4' },
    { extra: true },
    { project: { ...detail.project, notes: undefined } },
    { project: { ...detail.project, notes: '\ud800' } },
    { project: { ...detail.project, name: '' } },
    { project: { ...detail.project, name: 'a'.repeat(101) } },
    { project: { ...detail.project, id: ' alpha' } },
  ])('rejects malformed detail response %j', (patch) => {
    expect(() => parseProjectDetail({ ...detail, ...patch })).toThrow(
      ProjectDetailResponseError,
    )
  })
  it.each([
    { unit: 'projects' },
    { schema_version: 2 },
    { order: 'random' },
    { total: -1 },
    { total: 3 },
    { total_pages: 2 },
    { page: 2 },
    { requested_page: 0 },
    { has_more: true },
    { page_size: 21 },
    { extra: true },
    { query: ' padded ' },
    { query: '\ud800' },
    { items: [item('alpha')] },
    { items: [{ ...item('alpha'), task_count: -1 }, item('empty')] },
    { items: [{ ...item('alpha'), task_count: 0 }, item('empty')] },
    {
      items: [
        {
          ...item('alpha'),
          project: { ...item('alpha').project, notes: 'PRIVATE' },
        },
        item('empty'),
      ],
    },
    {
      items: [
        {
          ...item('alpha'),
          project: { ...item('alpha').project, name: '' },
        },
        item('empty'),
      ],
    },
    {
      items: [
        {
          ...item('alpha'),
          project: { ...item('alpha').project, goal: '\ud800' },
        },
        item('empty'),
      ],
    },
  ])('rejects malformed query response %j', (patch) => {
    expect(() => parseProjectQuery({ ...query, ...patch })).toThrow(
      ProjectQueryResponseError,
    )
  })

  it('rejects detail count contradiction and query duplicate IDs', () => {
    expect(() =>
      parseProjectDetail({ ...detail, task_count: 0, run_count: 1 }),
    ).toThrow(ProjectDetailResponseError)
    expect(() =>
      parseProjectQuery({ ...query, items: [item('alpha'), item('alpha')] }),
    ).toThrow(ProjectQueryResponseError)
  })
  it('accepts clamped/empty pages and preserves authoritative server order and Unicode matches', () => {
    const empty = { ...query, requested_page: 100, total: 0, items: [] }
    expect(parseProjectQuery(empty).page).toBe(1)
    const unicode = {
      ...query,
      query: 'not contained',
      items: [item('zeta'), item('alpha')],
    }
    expect(
      parseProjectQuery(unicode).items.map((row) => row.project.id),
    ).toEqual(['zeta', 'alpha'])
  })
  it('binds query, requested page and capacity to the exact sent request', () => {
    for (const request of [
      { query: 'alpha', page: 1, pageSize: 20 },
      { query: '', page: 2, pageSize: 20 },
      { query: '', page: 1, pageSize: 50 },
    ] as const) {
      expect(() => parseProjectQuery(query, request)).toThrow(
        ProjectQueryResponseError,
      )
    }
  })
  it('copies output data and binds fetch parsing to a request snapshot', async () => {
    const input = { query: '', page: 1, pageSize: 20 as const }
    let complete: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve
          }),
      ),
    )
    const pending = fetchProjectQuery(input)
    input.query = 'changed'
    input.page = 2
    complete!(response(clone(query)))
    const result = await pending
    expect(result.query).toBe('')
    result.items[0].project.name = 'mutated'
    expect(query.items[0].project.name).toBe('alpha')
  })
  it('rejects error envelopes even when HTTP is successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ detail: { code: 'failure' } })),
    )
    await expect(fetchProjectDetail('alpha')).rejects.toBeInstanceOf(
      ProjectDetailResponseError,
    )
    await expect(
      fetchProjectQuery({ query: '', page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ProjectQueryResponseError)
  })

  it('validates page arithmetic and keeps query summaries without notes', () => {
    const value = parseProjectQuery(query, {
      query: '',
      page: 1,
      pageSize: 20,
    })
    expect(value.items[0].project).toEqual({
      id: 'alpha',
      name: 'alpha',
      goal: 'Goal',
      directory: '.',
    })
    expect(value.items[0].project).not.toHaveProperty('notes')
  })

  it('admits actual GET detail and query responses', async () => {
    const responses = [response(detail), response(query)]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responses.shift()!),
    )
    expect((await fetchProjectDetail('alpha')).project.name).toBe('Alpha')
    expect(
      (await fetchProjectQuery({ query: '', page: 1, pageSize: 20 })).items,
    ).toHaveLength(2)
  })

  it('preserves structured API errors and aborts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ detail: { code: 'project_detail_unavailable' } }, 404),
      ),
    )
    await expect(fetchProjectDetail('missing')).rejects.toBeInstanceOf(ApiError)
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_path, options) => {
        expect(options.signal).toBe(controller.signal)
        throw new DOMException('canceled', 'AbortError')
      }),
    )
    await expect(
      fetchProjectDetail('alpha', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
