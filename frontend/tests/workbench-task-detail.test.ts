import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  fetchTaskDetail,
  parseTaskDetail,
  prepareTaskDetailRequest,
  TaskDetailInputError,
  TaskDetailResponseError,
  type TaskDetailRequest,
} from '../src/workbench/task-detail'

type MinimalRun = {
  id: string
  task_id: string
  status: string
  created_at: string
}
function response(requestedPage = 1, total = 23, pageSize = 20) {
  const all: MinimalRun[] = Array.from({ length: total }, (_, index) => ({
    id: `run-${String(index + 1).padStart(3, '0')}`,
    task_id: 'task-1',
    status: index === 0 ? 'succeeded' : 'failed',
    created_at: new Date(
      Date.UTC(2026, 10, 17, 0, total - index),
    ).toISOString(),
  }))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'task_detail',
    item: {
      task: {
        id: 'task-1',
        project_id: 'project-1',
        title: '研究分页历史',
        goal: 'Research the task history',
        acceptance: '',
        files: ['README.md'],
        created_at: '2026-11-16T00:00:00Z',
      },
      project: { id: 'project-1', name: 'Project 1' },
      latest_run: (all[0] ?? null) as MinimalRun | null,
      state_category: total ? 'completed' : 'pending',
      attempts: total,
    },
    history: {
      unit: 'runs',
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total,
      requested_page: requestedPage,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      has_more: page < totalPages,
      order: 'created-desc-source-v1',
    },
  }
}
function request(page = 1): TaskDetailRequest {
  return {
    taskId: 'task-1',
    scopeProjectId: 'project-1',
    page,
    pageSize: 20,
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('bounded task detail client', () => {
  it('maps one task and one bounded history page without fabricating Project or Run fields', () => {
    const detail = parseTaskDetail(response(), request())
    expect(detail.item).toMatchObject({
      id: 'task-1',
      projectName: 'Project 1',
      attempts: 23,
      column: 'completed',
      run: { id: 'run-001', status: 'succeeded' },
    })
    expect(detail.history.items).toHaveLength(20)
    expect(detail.history.items[0]).toEqual(detail.item.run)
    expect(Object.keys(detail.history.items[0]).sort()).toEqual([
      'created_at',
      'id',
      'status',
      'task_id',
    ])
    expect(detail.item).not.toHaveProperty('project')
    expect(detail.history).toMatchObject({
      total: 23,
      total_pages: 2,
      has_more: true,
    })
  })

  it('preserves page two order and the explicit requested page after clamping', () => {
    const detail = parseTaskDetail(response(99), request(99))
    expect(detail.history).toMatchObject({
      requested_page: 99,
      page: 2,
      total_pages: 2,
      has_more: false,
    })
    expect(detail.history.items.map((run) => run.id)).toEqual([
      'run-021',
      'run-022',
      'run-023',
    ])
  })

  it('accepts an explicit empty history without inventing a latest Run', () => {
    const detail = parseTaskDetail(response(90071992547409, 0), {
      ...request(),
      page: 90071992547409,
    })
    expect(detail.item.column).toBe('pending')
    expect(detail.item.run).toBeUndefined()
    expect(detail.history).toMatchObject({
      total: 0,
      requested_page: 90071992547409,
      page: 1,
      total_pages: 1,
      has_more: false,
      items: [],
    })
  })

  it.each([20, 50, 100])('accepts finite page capacity %i', (pageSize) => {
    const detail = parseTaskDetail(response(1, 101, pageSize), {
      ...request(),
      pageSize,
    })
    expect(detail.history.items).toHaveLength(pageSize)
    expect(detail.history.page_size).toBe(pageSize)
  })

  it.each([
    { schema_version: 2 },
    { unit: 'tasks' },
    { extra: true },
    { item: {} },
    { history: [] },
    { detail: 'provider failed' },
  ])('rejects malformed success envelopes %j', (patch) => {
    expect(() => parseTaskDetail({ ...response(), ...patch })).toThrow(
      TaskDetailResponseError,
    )
  })

  it.each([
    { unit: 'tasks' },
    { order: 'unknown-v2' },
    { total: 22 },
    { requested_page: 0 },
    { requested_page: 90071992547410 },
    { requested_page: true },
    { page: 2 },
    { page_size: '20' },
    { page_size: 21 },
    { total_pages: 3 },
    { has_more: false },
    { items: [] },
    { extra: true },
  ])('rejects contradictory history metadata %j', (patch) => {
    const value = response()
    expect(() =>
      parseTaskDetail({
        ...value,
        history: { ...value.history, ...patch },
      }),
    ).toThrow(TaskDetailResponseError)
  })

  it.each([
    { taskId: 'another-task' },
    { scopeProjectId: 'another-project' },
    { page: 2 },
    { pageSize: 50 },
  ])('binds the response to the sent criteria %j', (patch) => {
    expect(() =>
      parseTaskDetail(response(), { ...request(), ...patch }),
    ).toThrow(TaskDetailResponseError)
  })

  it('allows workspace detail reads without inventing a fixed project', () => {
    const prepared = prepareTaskDetailRequest({
      taskId: 'task-1',
      page: 1,
      pageSize: 20,
    })
    expect(
      new URL(prepared.path, 'http://local').searchParams.has(
        'scope_project_id',
      ),
    ).toBe(false)
    expect(
      parseTaskDetail(response(), {
        taskId: 'task-1',
        page: 1,
        pageSize: 20,
      }).item.task.project_id,
    ).toBe('project-1')
  })

  it.each([
    { id: 'another-run' },
    { task_id: 'another-task' },
    { status: 'failed' },
    { created_at: '2026-11-16T00:00:00Z' },
  ])('rejects a first-page head contradicting latest Run %j', (patch) => {
    const value = response()
    value.history.items[0] = { ...value.history.items[0], ...patch }
    expect(() => parseTaskDetail(value)).toThrow(TaskDetailResponseError)
  })

  it('rejects a latest Run repeated on a later page', () => {
    const value = response(2)
    value.history.items[0] = value.item.latest_run!
    expect(() => parseTaskDetail(value)).toThrow(TaskDetailResponseError)
  })

  it('rejects duplicate or foreign history Run identities', () => {
    const duplicate = response()
    duplicate.history.items[1] = duplicate.history.items[0]
    expect(() => parseTaskDetail(duplicate)).toThrow(TaskDetailResponseError)
    const foreign = response()
    foreign.history.items[1].task_id = 'another-task'
    expect(() => parseTaskDetail(foreign)).toThrow(TaskDetailResponseError)
  })

  it.each([
    null,
    {},
    { id: 'run', task_id: 'task-1', status: 'failed' },
    {
      id: 'run',
      task_id: 'task-1',
      status: 'failed',
      created_at: '2026-11-17T00:00:00Z',
      context: 'PRIVATE',
    },
    {
      id: 'run',
      task_id: 'task-1',
      status: '\ud800',
      created_at: '2026-11-17T00:00:00Z',
    },
  ])('rejects invalid or nonminimal history Run %j', (run) => {
    const value = response()
    expect(() =>
      parseTaskDetail({
        ...value,
        history: {
          ...value.history,
          items: [value.history.items[0], run, ...value.history.items.slice(2)],
        },
      }),
    ).toThrow(TaskDetailResponseError)
  })

  it('uses the shared latest-state contract and accepts future statuses only as other', () => {
    const value = response()
    value.item.latest_run!.status = 'future_state'
    value.item.state_category = 'other'
    expect(parseTaskDetail(value).item.column).toBe('other')
    value.item.state_category = 'pending'
    expect(() => parseTaskDetail(value)).toThrow(TaskDetailResponseError)
  })

  it('does not recompute Unicode text matching or reorder server history', () => {
    const value = response()
    value.item.task.title = '\ua7cb a and \u0264 z'
    const tail = value.history.items.slice(1).reverse()
    value.history.items = [value.history.items[0], ...tail]
    const detail = parseTaskDetail(value)
    expect(detail.item.task.title).toBe(value.item.task.title)
    expect(detail.history.items.map((run) => run.id)).toEqual(
      value.history.items.map((run) => run.id),
    )
  })

  it('returns isolated copies instead of retaining mutable response arrays', () => {
    const value = response()
    const detail = parseTaskDetail(value)
    value.item.task.files[0] = 'changed'
    value.history.items[0].status = 'changed'
    expect(detail.item.task.files).toEqual(['README.md'])
    expect(detail.history.items[0].status).toBe('succeeded')
  })

  it.each([
    { taskId: '' },
    { taskId: ' task-1' },
    { taskId: '\u0085task-1' },
    { taskId: 'task-1\u001c' },
    { taskId: '\ud800' },
    { taskId: 'x'.repeat(101) },
    { scopeProjectId: ' project-1' },
    { scopeProjectId: '\udfff' },
    { scopeProjectId: null },
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: Infinity },
    { page: 90071992547410 },
    { pageSize: '20' },
    { pageSize: 10 },
    { pageSize: true },
    { extra: true },
  ])('rejects invalid request input before HTTP %j', async (patch) => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchTaskDetail({
        ...request(),
        ...patch,
      } as TaskDetailRequest),
    ).rejects.toBeInstanceOf(TaskDetailInputError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('supports valid astral IDs and preserves literal BOM identifier characters', () => {
    const value = {
      ...request(),
      taskId: '\ufefftask-\u{10000}',
      scopeProjectId: '\ufeffproject-\u{10000}',
    }
    const prepared = prepareTaskDetailRequest(value)
    const url = new URL(prepared.path, 'http://local')
    expect(decodeURIComponent(url.pathname)).toBe(
      '/tasks/\ufefftask-\u{10000}/detail',
    )
    expect(url.searchParams.get('scope_project_id')).toBe(value.scopeProjectId)
    expect(() =>
      prepareTaskDetailRequest({
        ...value,
        taskId: '\u{10000}'.repeat(100),
      }),
    ).not.toThrow()
  })

  it('serializes a fixed-scope GET and passes its abort signal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(response(2)), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    await fetchTaskDetail(request(2), controller.signal)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [path, options] = fetch.mock.calls[0]
    const url = new URL(path, 'http://local')
    expect(url.pathname).toBe('/api/tasks/task-1/detail')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2',
      page_size: '20',
      scope_project_id: 'project-1',
    })
    expect(options.signal).toBe(controller.signal)
    expect(options.method).toBeUndefined()
  })

  it('binds an awaited response to the request sent before caller mutation', async () => {
    let resolve!: (value: Response) => void
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((done) => {
          resolve = done
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const value = request()
    const pending = fetchTaskDetail(value)
    value.taskId = 'changed-task'
    value.scopeProjectId = 'changed-project'
    value.page = 2
    value.pageSize = 50
    resolve(new Response(JSON.stringify(response()), { status: 200 }))
    await expect(pending).resolves.toMatchObject({
      item: { id: 'task-1' },
      history: { requested_page: 1, page_size: 20 },
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a response for later caller values rather than rebinding after await', async () => {
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
    const pending = fetchTaskDetail(value)
    value.page = 2
    resolve(new Response(JSON.stringify(response(2)), { status: 200 }))
    await expect(pending).rejects.toBeInstanceOf(TaskDetailResponseError)
  })

  it.each([403, 404, 422, 503])(
    'preserves HTTP %i as an API failure without automatic retry',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: { code: 'task_detail_unavailable' } }),
            { status },
          ),
        )
      vi.stubGlobal('fetch', fetch)
      await expect(fetchTaskDetail(request())).rejects.toMatchObject({
        status,
      })
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('preserves cancellation instead of treating it as empty history', async () => {
    const reason = new DOMException('Canceled', 'AbortError')
    const fetch = vi.fn().mockRejectedValue(reason)
    vi.stubGlobal('fetch', fetch)
    await expect(fetchTaskDetail(request())).rejects.toBe(reason)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed 2xx without a fallback, retry or success-shaped empty object', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(fetchTaskDetail(request())).rejects.toBeInstanceOf(
      TaskDetailResponseError,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves network failure as an API error rather than an empty result', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchTaskDetail(request())).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
