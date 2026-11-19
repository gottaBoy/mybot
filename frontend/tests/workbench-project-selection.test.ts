import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  ProjectReferenceInputError,
  ProjectReferenceResponseError,
  type ProjectReferences,
} from '../src/workbench/project-references'
import {
  ProjectSelectionChangedError,
  ProjectSelectionUnavailableError,
  validateProjectSelection,
} from '../src/workbench/project-selection'
import { savedViewValidationMessage } from '../src/workbench/SavedViewsMenu'

const item = (id: string) => ({
  project: { id, name: `Project ${id}` },
  task_count: 1,
  run_count: 2,
})
function directory(): ProjectReferences {
  return {
    schema_version: 1,
    unit: 'project_references',
    query: '',
    requested_page: 1,
    page: 1,
    page_size: 20,
    total: 21,
    total_pages: 2,
    has_more: true,
    order: 'projects-created-v1',
    selected_ids: ['offpage'],
    selected: [item('offpage')],
    missing_ids: [],
    totals: { projects: 21, tasks: 21, runs: 42 },
    items: Array.from({ length: 20 }, (_, index) => item(`page-${index}`)),
  }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status })
const english = (_zh: string, en: string) => en
const chinese = (zh: string, _en: string) => zh

afterEach(() => vi.unstubAllGlobals())

describe('project selection admission', () => {
  it('uses selected hydration outside the bounded page and only sends one GET', async () => {
    const value = directory()
    const request = vi.fn().mockResolvedValue(response(value))
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    expect(
      await validateProjectSelection(['offpage'], controller.signal),
    ).toEqual([item('offpage')])
    expect(request).toHaveBeenCalledTimes(1)
    const [path, options] = request.mock.calls[0]
    const url = new URL(path, 'http://localhost')
    expect(url.pathname).toBe('/api/project-references')
    expect(url.searchParams.get('selected')).toBe('["offpage"]')
    expect(url.searchParams.get('page_size')).toBe('20')
    expect(options.signal).toBe(controller.signal)
    expect(options.method).toBeUndefined()
  })

  it('keeps the exact copied ID snapshot when the caller mutates its candidate', async () => {
    const value = directory()
    value.selected_ids = ['alpha', 'offpage']
    value.selected = [item('alpha'), item('offpage')]
    value.totals = { projects: 22, tasks: 22, runs: 44 }
    const ids = ['offpage', 'alpha']
    let finish!: (value: Response) => void
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    vi.stubGlobal('fetch', request)
    const result = validateProjectSelection(ids)
    ids.splice(0, ids.length, 'replacement')
    finish(response({ ...value, total: 22 }))
    expect((await result).map((entry) => entry.project.id)).toEqual([
      'alpha',
      'offpage',
    ])
    const url = new URL(request.mock.calls[0][0], 'http://localhost')
    expect(url.searchParams.get('selected')).toBe('["alpha","offpage"]')
  })

  it('returns an empty selection without fetching a directory', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    expect(await validateProjectSelection([])).toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    ['duplicate', ['offpage', 'offpage']],
    ['whitespace', [' offpage']],
    ['empty ID', ['']],
    ['oversize', ['x'.repeat(101)]],
    ['too many', Array.from({ length: 101 }, (_, index) => `id-${index}`)],
    ['lone surrogate', ['\ud800']],
  ])('rejects %s before any request', async (_name, ids) => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(validateProjectSelection(ids)).rejects.toBeInstanceOf(
      ProjectReferenceInputError,
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('treats only an explicit missing partition as confirmed unavailable', async () => {
    const value = directory()
    value.selected_ids = ['gone', 'offpage']
    value.missing_ids = ['gone']
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)))
    const result = validateProjectSelection(['offpage', 'gone'])
    await expect(result).rejects.toBeInstanceOf(
      ProjectSelectionUnavailableError,
    )
    await expect(result).rejects.toMatchObject({ missingIds: ['gone'] })
  })

  it('copies confirmed missing IDs into its error', () => {
    const ids = ['gone']
    const error = new ProjectSelectionUnavailableError(ids)
    ids[0] = 'changed'
    expect(error.missingIds).toEqual(['gone'])
  })

  it.each([403, 404, 503])(
    'keeps HTTP %s distinct from missing references',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ detail: 'failure' }, status)),
      )
      const result = validateProjectSelection(['offpage'])
      await expect(result).rejects.toBeInstanceOf(ApiError)
      await expect(result).rejects.toMatchObject({ status })
    },
  )

  it('rejects a successful HTTP error envelope instead of admitting its IDs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ detail: { code: 'failure' } })),
    )
    await expect(validateProjectSelection(['offpage'])).rejects.toBeInstanceOf(
      ProjectReferenceResponseError,
    )
  })

  it('rejects a different selected request snapshot', async () => {
    const value = directory()
    value.selected_ids = ['other']
    value.selected = [item('other')]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(value)))
    await expect(validateProjectSelection(['offpage'])).rejects.toBeInstanceOf(
      ProjectReferenceResponseError,
    )
  })

  it('does not send an already aborted request, including empty selection', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    controller.abort()
    await expect(
      validateProjectSelection(['offpage'], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      validateProjectSelection([], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(request).not.toHaveBeenCalled()
  })

  it('discards a late response even when fetch ignores the abort signal', async () => {
    let finish!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          }),
      ),
    )
    const controller = new AbortController()
    const result = validateProjectSelection(['offpage'], controller.signal)
    controller.abort()
    finish(response(directory()))
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('saved-view project validation feedback', () => {
  it.each([
    [
      new ProjectSelectionUnavailableError(['private-id']),
      'A project referenced by the view is unavailable. Your query and drafts are kept.',
    ],
    [
      new ProjectSelectionChangedError(),
      'The query or draft changed during validation. Load the view again.',
    ],
    [new ApiError(401, 'private'), 'Your session expired.'],
    [
      new ApiError(403, 'private'),
      'Project reference access is forbidden. The view was not loaded.',
    ],
    [
      new ApiError(404, 'private'),
      'Project references are unavailable. The view was not loaded.',
    ],
    [
      new ProjectReferenceResponseError(),
      'Project references could not be validated. Your query and drafts are kept.',
    ],
  ])('preserves an explicit non-success outcome for %s', (error, expected) => {
    expect(savedViewValidationMessage(error, english)).toBe(expected)
    expect(savedViewValidationMessage(error, english)).not.toContain('private')
  })

  it('localizes candidate invalidation without exposing arbitrary errors', () => {
    expect(
      savedViewValidationMessage(new ProjectSelectionChangedError(), chinese),
    ).toBe('校验期间查询或草稿已变更，请重新加载视图。')
    expect(
      savedViewValidationMessage(new Error('secret payload'), english),
    ).toBe(
      'Project references could not be validated. Your query and drafts are kept.',
    )
  })
})
