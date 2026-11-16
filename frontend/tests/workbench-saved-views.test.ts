import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  normalizeSavedViewName,
  parseSavedView,
  parseSavedViewPage,
  readSavedView,
  savedViewErrorCode,
  savedViewMutationUnknown,
  savedViewScopeKey,
  SavedViewInputError,
  SavedViewResponseError,
  updateSavedView,
  type SavedView,
  type SavedViewDefinition,
  type SavedViewScope,
} from '../src/workbench/saved-views'

const id = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const scope: SavedViewScope = { scope_type: 'workspace', project_id: null }
const definition: SavedViewDefinition = {
  schema_version: 1,
  query: {
    text: 'committed',
    projects: [],
    states: [],
    jql: '',
    mode: 'basic',
  },
  table: {
    page_size: 20,
    sorts: [{ sortKey: 'title', direction: 'ascending' }],
    columns: ['id', 'title'],
    column_order: [
      'id',
      'title',
      'projectName',
      'status',
      'updated',
      'attempts',
      'created_at',
    ],
  },
}
function record(patch: Partial<SavedView> = {}): SavedView {
  return {
    id,
    name: 'Research',
    ...scope,
    definition: structuredClone(definition),
    revision: 1,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    ...patch,
  } as SavedView
}
function respond(value: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(value), { status }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}
afterEach(() => vi.unstubAllGlobals())

describe('saved-view resource boundary', () => {
  it('validates a private workspace record without inventing user ownership', () => {
    const value = record()
    expect(parseSavedView(value, scope, id)).toEqual(value)
    expect(savedViewScopeKey(scope)).toBe('["workspace",null]')
  })

  it('validates project scope against its fixed definition', () => {
    const projectScope = { scope_type: 'project', project_id: 'alpha' } as const
    const value = record({
      ...projectScope,
      definition: {
        ...definition,
        query: { ...definition.query, projects: ['alpha'] },
      },
    })
    expect(parseSavedView(value, projectScope).project_id).toBe('alpha')
    expect(() => parseSavedView(value, scope)).toThrow(SavedViewResponseError)
    expect(() => parseSavedView(record({ ...projectScope }))).toThrow(
      SavedViewResponseError,
    )
  })

  it.each([
    { id: 'not-a-resource-id' },
    { name: '' },
    { name: ' untrimmed ' },
    { name: 'x'.repeat(101) },
    { revision: 0 },
    { revision: 1.5 },
    { revision: '1' },
    { revision: true },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { project_id: 'alpha' },
    { scope_type: 'team' },
    { created_at: 'not-a-time' },
    { updated_at: null },
    { extra: 'not part of the contract' },
    { definition: { ...definition, schema_version: 2 } },
  ])('rejects a malformed or contradictory record %j', (patch) => {
    expect(() => parseSavedView({ ...record(), ...patch })).toThrow(
      SavedViewResponseError,
    )
  })

  it('rejects an unexpected resource identity and throwing accessors', () => {
    expect(() => parseSavedView(record(), scope, otherId)).toThrow(
      SavedViewResponseError,
    )
    const value = record()
    Object.defineProperty(value, 'name', {
      get() {
        throw new Error('untrusted')
      },
    })
    expect(() => parseSavedView(value)).toThrow(SavedViewResponseError)
  })

  it('uses Unicode code points for trimmed names', () => {
    expect(normalizeSavedViewName(` ${'😀'.repeat(100)} `)).toBe(
      '😀'.repeat(100),
    )
    expect(() => normalizeSavedViewName('😀'.repeat(101))).toThrow(
      'saved_view_name_invalid',
    )
    expect(() => normalizeSavedViewName(' \n ')).toThrow(
      'saved_view_name_invalid',
    )
  })

  it('retains UUID literal identity including supported hex format', () => {
    const hex = 'ABCDEF1234567890ABCDEF1234567890'
    expect(parseSavedView(record({ id: hex })).id).toBe(hex)
  })

  it('validates paginated denominators without treating a window as all records', () => {
    const page = {
      items: [record()],
      total: 2,
      offset: 0,
      limit: 1,
      has_more: true,
    }
    expect(parseSavedViewPage(page, scope, { offset: 0, limit: 1 })).toEqual(
      page,
    )
    expect(
      parseSavedViewPage(
        {
          items: [],
          total: 1,
          offset: 5,
          limit: 20,
          has_more: false,
        },
        scope,
      ).items,
    ).toEqual([])
  })

  it.each([
    { total: -1 },
    { offset: -1 },
    { limit: 101 },
    { total: '1' },
    { has_more: true },
    { items: [record(), record()] },
    {
      items: [
        record({ id: otherId, scope_type: 'project', project_id: 'alpha' }),
      ],
    },
    { extra: true },
  ])('rejects invalid pagination or cross-scope results %j', (patch) => {
    expect(() =>
      parseSavedViewPage(
        {
          items: [record()],
          total: 1,
          offset: 0,
          limit: 20,
          has_more: false,
          ...patch,
        },
        scope,
      ),
    ).toThrow(SavedViewResponseError)
  })

  it('rejects a page that changes the requested window or cannot make progress', () => {
    expect(() =>
      parseSavedViewPage(
        {
          items: [record()],
          total: 1,
          offset: 0,
          limit: 20,
          has_more: false,
        },
        scope,
        { offset: 1, limit: 20 },
      ),
    ).toThrow(SavedViewResponseError)
    expect(() =>
      parseSavedViewPage(
        {
          items: [],
          total: 1,
          offset: 0,
          limit: 20,
          has_more: true,
        },
        scope,
      ),
    ).toThrow(SavedViewResponseError)
  })
})

describe('saved-view API client', () => {
  it('reads only an explicit scoped page with same-origin API behavior', async () => {
    const fetch = respond({
      items: [record()],
      total: 1,
      offset: 0,
      limit: 20,
      has_more: false,
    })
    expect((await listSavedViews(scope)).items[0].id).toBe(id)
    expect(fetch).toHaveBeenCalledWith(
      '/api/saved-views?scope_type=workspace&offset=0&limit=20',
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
        headers: expect.objectContaining({ 'X-Workbench-Request': '1' }),
      }),
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('includes the project only for an explicitly scoped project read', async () => {
    const fetch = respond({
      items: [],
      total: 0,
      offset: 20,
      limit: 20,
      has_more: false,
    })
    await listSavedViews(
      { scope_type: 'project', project_id: 'alpha & beta' },
      { offset: 20 },
    )
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/saved-views?scope_type=project&offset=20&limit=20&project_id=alpha+%26+beta',
    )
  })

  it('preserves cancellation instead of turning it into an empty page', async () => {
    const controller = new AbortController()
    const error = new DOMException('Aborted', 'AbortError')
    const fetch = vi.fn().mockRejectedValue(error)
    vi.stubGlobal('fetch', fetch)
    await expect(
      listSavedViews(scope, { signal: controller.signal }),
    ).rejects.toBe(error)
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('requires exact scope and ID for a detail read', async () => {
    const fetch = respond(record())
    expect(await readSavedView(id, scope)).toEqual(record())
    expect(fetch.mock.calls[0][0]).toBe(`/api/saved-views/${id}`)
    respond(record({ id: otherId }))
    await expect(readSavedView(id, scope)).rejects.toBeInstanceOf(
      SavedViewResponseError,
    )
  })

  it('creates with the supplied stable ID and an exact validated revision-one response', async () => {
    const fetch = respond(record(), 201)
    expect(
      await createSavedView({ id, name: ' Research ', scope, definition }),
    ).toEqual(record())
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      id,
      name: 'Research',
      definition,
      ...scope,
    })
    expect(fetch.mock.calls[0][1].method).toBe('POST')
  })

  it('updates using the original expected revision and no scope mutation', async () => {
    const fetch = respond(record({ name: 'Updated', revision: 2 }))
    expect(
      (await updateSavedView(record(), { name: 'Updated', definition }))
        .revision,
    ).toBe(2)
    expect(fetch.mock.calls[0][1].method).toBe('PUT')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      name: 'Updated',
      definition,
      expected_revision: 1,
    })
  })

  it('validates deletion against the exact revision and ID', async () => {
    const receipt = {
      id,
      deleted: true,
      revision: 2,
      deleted_at: '2026-11-15T01:00:00Z',
    }
    const fetch = respond(receipt)
    expect(await deleteSavedView(record())).toEqual(receipt)
    expect(fetch.mock.calls[0][0]).toBe(`/api/saved-views/${id}/delete`)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      expected_revision: 1,
    })
    respond({ ...receipt, revision: 1 })
    await expect(deleteSavedView(record())).rejects.toBeInstanceOf(
      SavedViewResponseError,
    )
  })

  it.each([
    record({ revision: 2 }),
    record({ name: 'Different payload' }),
    record({ id: otherId }),
    record({
      definition: {
        ...definition,
        query: { ...definition.query, text: 'changed' },
      },
    }),
  ])(
    'does not treat an unrelated current record as a create receipt',
    async (response) => {
      respond(response)
      await expect(
        createSavedView({ id, name: 'Research', scope, definition }),
      ).rejects.toBeInstanceOf(SavedViewResponseError)
    },
  )

  it('does not retry a lost create response or generate a replacement ID', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Lost response'))
    vi.stubGlobal('fetch', fetch)
    await expect(
      createSavedView({ id, name: 'Research', scope, definition }),
    ).rejects.toMatchObject({ status: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body).id).toBe(id)
  })

  it('exposes 409 codes and preserves the caller revision without automatic reads or writes', async () => {
    const fetch = respond(
      { detail: { code: 'saved_view_revision_conflict', current_revision: 4 } },
      409,
    )
    let error
    try {
      await updateSavedView(record(), { name: 'Mine', definition })
    } catch (caught) {
      error = caught
    }
    expect(savedViewErrorCode(error)).toBe('saved_view_revision_conflict')
    expect(savedViewMutationUnknown(error)).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body).expected_revision).toBe(1)
  })

  it('does not turn a missing or unsupported endpoint into a successful empty directory', async () => {
    respond({ detail: { code: 'saved_view_not_found' } }, 404)
    await expect(listSavedViews(scope)).rejects.toMatchObject({ status: 404 })
  })

  it('broadcasts 401 so the component can clear private projections', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    respond({ detail: 'Authentication required' }, 401)
    await expect(listSavedViews(scope)).rejects.toMatchObject({ status: 401 })
    expect(dispatchEvent.mock.calls[0][0].type).toBe('mybot:unauthorized')
  })

  it.each([0, 500, 502, 503])(
    'marks HTTP %s mutation outcomes unknown',
    (status) => {
      expect(savedViewMutationUnknown(new ApiError(status, 'failed'))).toBe(
        true,
      )
    },
  )
  it.each([400, 401, 403, 404, 409, 422])(
    'does not call an explicit HTTP %s rejection unknown',
    (status) => {
      expect(savedViewMutationUnknown(new ApiError(status, 'rejected'))).toBe(
        false,
      )
    },
  )
  it('marks unparseable successful responses unknown without accepting a fake receipt', () => {
    expect(savedViewMutationUnknown(new SavedViewResponseError())).toBe(true)
    expect(
      savedViewErrorCode(new ApiError(409, '[object Object]', { code: 42 })),
    ).toBeUndefined()
  })

  it('does not call a rejected local input an unknown server mutation', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(createSavedView({
      id, name: 'Research', scope: { scope_type: 'project', project_id: 'alpha' },
      definition,
    })).rejects.toBeInstanceOf(SavedViewInputError)
    expect(fetch).not.toHaveBeenCalled()
    expect(savedViewMutationUnknown(new SavedViewInputError('saved_view_scope_invalid'))).toBe(false)
  })
})
