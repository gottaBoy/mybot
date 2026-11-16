import { describe, expect, it } from 'vitest'
import {
  basicQueryPatch,
  basicQueryPending,
  type BasicQueryDraft,
} from '../src/workbench/basic-query'
import {
  listLocationHref,
  readListLocation,
} from '../src/workbench/list-location'

const empty: BasicQueryDraft = { query: '', project: 'all', filter: 'all' }

describe('basic query candidate', () => {
  it('submits only the three supported fields and resets pagination in one patch', () => {
    const draft: BasicQueryDraft = {
      query: '  中文 Agent  ',
      project: 'project-b',
      filter: 'attention',
    }
    expect(basicQueryPatch(draft)).toEqual({
      query: '中文 Agent',
      project: 'project-b',
      filter: 'attention',
      page: 1,
    })
    expect(draft.query).toBe('  中文 Agent  ')
  })
  it('removes empty text and all-selection defaults without introducing domain fields', () => {
    expect(basicQueryPatch({ ...empty, query: '   ' })).toEqual({
      query: undefined,
      project: undefined,
      filter: undefined,
      page: 1,
    })
  })
  it.each(['all', 'active', 'attention', 'completed'] as const)(
    'keeps the supported %s status category',
    (filter) => {
      expect(basicQueryPatch({ ...empty, filter }).filter).toBe(
        filter === 'all' ? undefined : filter,
      )
    },
  )
  it('rejects an unsupported category rather than turning it into all results', () => {
    expect(() =>
      basicQueryPatch({ ...empty, filter: 'failed' as never }),
    ).toThrow('basic_query_filter_invalid')
  })
  it.each(['project-b', 'all', ''])(
    'keeps a fixed route project above the %j draft selection',
    (project) => {
      expect(basicQueryPatch({ ...empty, project }, 'project-a').project).toBe(
        'project-a',
      )
    },
  )
  it('updates a shared URL once while preserving presentation and unrelated parameters', () => {
    const before =
      'http://localhost/?source=shared#workbench?view=list&mode=basic&page=3&pageSize=50&order=title:ascending&local=kept'
    const href = listLocationHref(
      before,
      basicQueryPatch({
        query: 'release',
        project: 'project-b',
        filter: 'completed',
      }),
    )
    expect(readListLocation(`http://localhost${href}`)).toMatchObject({
      query: 'release',
      project: 'project-b',
      filter: 'completed',
      page: 1,
      pageSize: 50,
      order: 'title:ascending',
      view: 'list',
      mode: 'basic',
    })
    expect(href).toContain('source=shared')
    expect(href).toContain('local=kept')
  })
  it('clears the three committed criteria through the same atomic patch', () => {
    const href = listLocationHref(
      'http://localhost/#workbench?q=old&project=project-a&filter=active&page=4',
      basicQueryPatch(empty),
    )
    const state = readListLocation(`http://localhost${href}`)
    expect(state).not.toHaveProperty('query')
    expect(state).not.toHaveProperty('project')
    expect(state).not.toHaveProperty('filter')
    expect(state.page).toBe(1)
  })
})

describe('basic query pending indication', () => {
  it.each([
    { ...empty, query: 'draft' },
    { ...empty, query: ' ' },
    { ...empty, project: 'project-b' },
    { ...empty, filter: 'attention' as const },
  ])(
    'detects an unsubmitted %j draft without changing the baseline',
    (draft) => {
      expect(basicQueryPending(draft, empty)).toBe(true)
      expect(empty).toEqual({ query: '', project: 'all', filter: 'all' })
    },
  )
  it('has no pending changes for the exact committed criteria', () => {
    expect(basicQueryPending(empty, { ...empty })).toBe(false)
  })
  it('ignores a non-editable project draft only inside a fixed route scope', () => {
    const draft = { ...empty, project: 'project-b' }
    expect(basicQueryPending(draft, empty, 'project-a')).toBe(false)
    expect(
      basicQueryPending({ ...draft, query: 'dirty' }, empty, 'project-a'),
    ).toBe(true)
  })
})
