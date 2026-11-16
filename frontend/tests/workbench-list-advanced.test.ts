import { describe, expect, it } from 'vitest'
import {
  listLocationHref,
  readListLocation,
  supportedListQuery,
  type ListLocation,
} from '../src/workbench/list-location'
import {
  committedQueryConditions,
  querySelectionPatch,
} from '../src/workbench/query-selection'
import { projectWorkspaceLocation } from '../src/workbench/project-workspace'
import type {
  QueryConditions,
  QueryStateCategory,
} from '../src/workbench/query-conditions'
import type { TaskSortRule } from '../src/workbench/task-sort'

const all: QueryConditions = { projects: [], states: [] }
const twoSorts: TaskSortRule[] = [
  { sortKey: 'status', direction: 'ascending' },
  { sortKey: 'title', direction: 'descending' },
]
function url(
  inner: Record<string, string>,
  outer: Record<string, string> = {},
  hash = 'workbench',
) {
  const search = new URLSearchParams(outer).toString()
  const query = new URLSearchParams(inner).toString()
  return `http://localhost/${search ? `?${search}` : ''}#${hash}${query ? `?${query}` : ''}`
}
function innerParams(href: string) {
  const hash = new URL(href, 'http://localhost').hash
  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
}
function roundTrip(href: string, patch: Partial<ListLocation>) {
  const next = listLocationHref(href, patch)
  return {
    href: next,
    params: innerParams(next),
    state: readListLocation(`http://localhost${next}`),
  }
}

describe('advanced conditions and legacy URL compatibility', () => {
  it('keeps the existing default shape without adding absent advanced parameters', () => {
    expect(readListLocation(url({}))).toEqual({
      jql: '',
      mode: 'basic',
      view: undefined,
      groupBy: '',
      group: 'none',
    })
  })

  it('serializes multiple projects and states as canonical JSON, not comma lists', () => {
    const candidate: QueryConditions = {
      projects: ['project-b', 'project-a'],
      states: ['other', 'active'],
    }
    const result = roundTrip(
      url(
        { project: 'old', filter: 'attention', page: '3', local: 'kept' },
        { source: 'shared' },
      ),
      querySelectionPatch('  release  ', candidate),
    )
    expect(result.params.get('projects')).toBe('["project-a","project-b"]')
    expect(result.params.get('states')).toBe('["active","other"]')
    expect(result.params.has('project')).toBe(false)
    expect(result.params.has('filter')).toBe(false)
    expect(result.state).toMatchObject({
      query: 'release',
      projects: ['project-a', 'project-b'],
      states: ['active', 'other'],
      page: 1,
    })
    expect(committedQueryConditions(result.state)).toEqual({
      conditions: {
        projects: ['project-a', 'project-b'],
        states: ['active', 'other'],
      },
    })
    expect(
      new URL(result.href, 'http://localhost').searchParams.get('source'),
    ).toBe('shared')
    expect(result.params.get('local')).toBe('kept')
    expect(candidate.projects).toEqual(['project-b', 'project-a'])
  })

  it.each(['active', 'attention', 'completed'] as const)(
    'returns a single common %s state and project to legacy keys',
    (state) => {
      const patch = querySelectionPatch('release', {
        projects: ['project-a'],
        states: [state],
      })
      expect(patch).toMatchObject({
        query: 'release',
        project: 'project-a',
        filter: state,
        projects: undefined,
        states: undefined,
        page: 1,
      })
      const result = roundTrip(
        url({ projects: '["old-a","old-b"]', states: '["pending","other"]' }),
        patch,
      )
      expect(result.params.get('project')).toBe('project-a')
      expect(result.params.get('filter')).toBe(state)
      expect(result.params.has('projects')).toBe(false)
      expect(result.params.has('states')).toBe(false)
      expect(committedQueryConditions(result.state).conditions).toEqual({
        projects: ['project-a'],
        states: [state],
      })
    },
  )

  it.each(['pending', 'other'] as const)(
    'retains the single %s state as JSON instead of inventing a legacy filter',
    (state) => {
      const result = roundTrip(
        url({ project: 'old-project', filter: 'active' }),
        querySelectionPatch('', { projects: ['project-a'], states: [state] }),
      )
      expect(result.params.get('project')).toBe('project-a')
      expect(result.params.has('projects')).toBe(false)
      expect(result.params.get('states')).toBe(JSON.stringify([state]))
      expect(result.params.has('filter')).toBe(false)
      expect(result.state.states).toEqual([state])
      expect(committedQueryConditions(result.state).conditions.states).toEqual([
        state,
      ])
    },
  )

  it('supports multiple projects with a legacy single state', () => {
    const result = roundTrip(
      url({}),
      querySelectionPatch('', { projects: ['b', 'a'], states: ['attention'] }),
    )
    expect(result.params.get('projects')).toBe('["a","b"]')
    expect(result.params.get('filter')).toBe('attention')
    expect(result.params.has('project')).toBe(false)
    expect(result.params.has('states')).toBe(false)
    expect(committedQueryConditions(result.state).conditions).toEqual({
      projects: ['a', 'b'],
      states: ['attention'],
    })
  })

  it('supports a legacy single project with multiple JSON states', () => {
    const result = roundTrip(
      url({}),
      querySelectionPatch('', {
        projects: ['a'],
        states: ['completed', 'active'],
      }),
    )
    expect(result.params.get('project')).toBe('a')
    expect(result.params.get('states')).toBe('["active","completed"]')
    expect(result.params.has('projects')).toBe(false)
    expect(result.params.has('filter')).toBe(false)
  })

  it('lets explicit empty JSON arrays override old project and filter values', () => {
    const state = readListLocation(
      url({
        project: 'legacy-project',
        filter: 'attention',
        projects: '[]',
        states: '[]',
      }),
    )
    expect(state).toMatchObject({
      project: 'legacy-project',
      filter: 'attention',
      projects: [],
      states: [],
    })
    expect(committedQueryConditions(state)).toEqual({ conditions: all })
  })

  it('lets nonempty JSON conditions override legacy single values', () => {
    const state = readListLocation(
      url({
        project: 'legacy-project',
        filter: 'attention',
        projects: '["new-project"]',
        states: '["pending"]',
      }),
    )
    expect(committedQueryConditions(state)).toEqual({
      conditions: { projects: ['new-project'], states: ['pending'] },
    })
    const result = roundTrip(
      url({ projects: '["new-project"]', states: '["active"]' }),
      querySelectionPatch('', {
        projects: ['new-project'],
        states: ['active'],
      }),
    )
    expect(result.params.get('project')).toBe('new-project')
    expect(result.params.get('filter')).toBe('active')
    expect(result.params.has('projects')).toBe(false)
    expect(result.params.has('states')).toBe(false)
  })

  it('clears advanced and legacy conditions together while retaining presentation state', () => {
    const result = roundTrip(
      url({
        q: 'old',
        project: 'old-project',
        filter: 'active',
        projects: '["a","b"]',
        states: '["pending","other"]',
        page: '8',
        pageSize: '50',
        view: 'board',
        order: 'title:ascending',
        sorts: JSON.stringify(twoSorts),
      }),
      querySelectionPatch(' ', all),
    )
    for (const key of ['q', 'project', 'projects', 'filter', 'states'])
      expect(result.params.has(key)).toBe(false)
    expect(committedQueryConditions(result.state)).toEqual({ conditions: all })
    expect(result.state).toMatchObject({
      page: 1,
      pageSize: 50,
      view: 'board',
      order: 'title:ascending',
      sorts: twoSorts,
    })
  })

  it('rejects an invalid candidate patch rather than serializing partial or fabricated fields', () => {
    expect(() =>
      querySelectionPatch('', {
        projects: ['a', 'a'],
        states: [],
      }),
    ).toThrow('conditions_invalid')
    expect(() =>
      querySelectionPatch('', {
        projects: [],
        states: ['assignee'] as unknown as QueryStateCategory[],
      }),
    ).toThrow('conditions_invalid')
    expect(() =>
      querySelectionPatch('', {
        projects: [],
        states: [],
        assignee: 'currentUser()',
      } as unknown as QueryConditions),
    ).toThrow('conditions_invalid')
  })

  it('keeps a well-formed unknown project for the product availability gate, not fake parser support', () => {
    const state = readListLocation(url({ projects: '["not-in-bootstrap"]' }))
    expect(state.conditionsInvalid).toBeUndefined()
    expect(committedQueryConditions(state)).toEqual({
      conditions: { projects: ['not-in-bootstrap'], states: [] },
    })
    // Bootstrap availability is checked by FocusedWorkbench, not URL syntax.
    expect(supportedListQuery(state)).toEqual({ sort: undefined })
  })
})

describe('invalid condition candidates survive URL changes and fail closed', () => {
  it.each([
    ['projects', '['],
    ['projects', 'null'],
    ['projects', '{}'],
    ['projects', '["a","a"]'],
    ['projects', '[" padded"]'],
    ['projects', '[""]'],
    ['states', '['],
    ['states', 'null'],
    ['states', '"active"'],
    ['states', '["all"]'],
    ['states', '["active","active"]'],
    ['states', '["completed "]'],
  ])(
    'preserves invalid %s=%j and rejects the entire query after a view change',
    (field, raw) => {
      const href = url(
        {
          project: 'legacy-project',
          filter: 'completed',
          jql: 'ORDER BY summary ASC',
          [field]: raw,
          local: 'kept',
        },
        { source: 'shared' },
      )
      const original = readListLocation(href)
      expect(original.conditionsInvalid).toBe(true)
      expect(committedQueryConditions(original).error).toBe(
        'conditions_invalid',
      )
      expect(supportedListQuery(original)).toEqual({
        error: 'conditions_invalid',
      })
      const result = roundTrip(href, { view: 'board', page: 1 })
      expect(result.params.get(field)).toBe(raw)
      expect(result.params.get('local')).toBe('kept')
      expect(result.state.conditionsInvalid).toBe(true)
      expect(supportedListQuery(result.state)).toEqual({
        error: 'conditions_invalid',
      })
      expect(supportedListQuery(result.state)).not.toHaveProperty('sort')
    },
  )

  it('does not partially apply valid states when the project array is invalid', () => {
    const state = readListLocation(
      url({
        projects: '["a","a"]',
        states: '["active"]',
        filter: 'completed',
      }),
    )
    expect(state.conditionsInvalid).toBe(true)
    expect(state).not.toHaveProperty('projects')
    expect(state).not.toHaveProperty('states')
    expect(committedQueryConditions(state).error).toBe('conditions_invalid')
  })

  it('distinguishes strict JSON project values from trimmed legacy project compatibility', () => {
    expect(readListLocation(url({ project: ' a ' })).project).toBe('a')
    expect(
      readListLocation(url({ projects: '[" a "]' })).conditionsInvalid,
    ).toBe(true)
  })
})

describe('advanced sort URL compatibility', () => {
  it('round-trips ordered multi-sort JSON independently of an old order parameter', () => {
    const result = roundTrip(url({ order: 'id:ascending', pageSize: '100' }), {
      sorts: twoSorts,
      page: 2,
    })
    expect(result.params.get('sorts')).toBe(JSON.stringify(twoSorts))
    expect(result.state.sorts).toEqual(twoSorts)
    expect(result.state.order).toBe('id:ascending')
    expect(result.state.page).toBe(2)
    expect(result.state.pageSize).toBe(100)
    expect(result.state.sortsInvalid).toBeUndefined()
    expect(supportedListQuery(result.state)).toEqual({ sort: undefined })
  })

  it('retains explicit empty sorts so FocusedWorkbench can override a legacy order without reviving it', () => {
    const state = readListLocation(
      url({ order: 'title:descending', sorts: '[]' }),
    )
    expect(Object.hasOwn(state, 'sorts')).toBe(true)
    expect(state.sorts).toEqual([])
    expect(state.order).toBe('title:descending')
    // FocusedWorkbench consumes the present array with nullish precedence.
    expect(state.sortsInvalid).toBeUndefined()
  })

  it('does not manufacture an advanced array for legacy-only URLs', () => {
    const state = readListLocation(url({ order: 'created_at:descending' }))
    expect(state.order).toBe('created_at:descending')
    expect(state).not.toHaveProperty('sorts')
    expect(state).not.toHaveProperty('sortsInvalid')
  })

  it.each([
    '[',
    'null',
    '{}',
    '"title:ascending"',
    '[{}]',
    '[{"sortKey":"title","direction":"asc"}]',
    '[{"sortKey":"title","direction":"ascending","extra":true}]',
    '[{"sortKey":"assignee","direction":"ascending"}]',
    '[{"sortKey":"title","direction":"ascending"},{"sortKey":"title","direction":"descending"}]',
    '[{"sortKey":"id","direction":"ascending"},{"sortKey":"title","direction":"ascending"},{"sortKey":"status","direction":"ascending"},{"sortKey":"attempts","direction":"descending"}]',
  ])(
    'preserves malformed sorts=%j and refuses legacy-order or JQL fallback',
    (raw) => {
      const href = url({
        sorts: raw,
        order: 'title:ascending',
        jql: 'ORDER BY created DESC',
      })
      const state = readListLocation(href)
      expect(state.sortsInvalid).toBe(true)
      expect(state).not.toHaveProperty('sorts')
      expect(supportedListQuery(state)).toEqual({ error: 'sort_invalid' })
      const result = roundTrip(href, { view: 'list', page: 1 })
      expect(result.params.get('sorts')).toBe(raw)
      expect(result.state.sortsInvalid).toBe(true)
      expect(supportedListQuery(result.state)).toEqual({
        error: 'sort_invalid',
      })
      expect(supportedListQuery(result.state)).not.toHaveProperty('sort')
    },
  )

  it('serializes an invalid typed sort patch as a visible invalid candidate rather than dropping it', () => {
    const sorts = [
      { sortKey: 'assignee', direction: 'ascending' },
    ] as unknown as TaskSortRule[]
    const result = roundTrip(url({ order: 'title:ascending' }), { sorts })
    expect(result.params.get('sorts')).toBe(JSON.stringify(sorts))
    expect(result.state.sortsInvalid).toBe(true)
    expect(supportedListQuery(result.state)).toEqual({ error: 'sort_invalid' })
  })

  it('continues to honor supported JQL ordering when all candidates are valid', () => {
    const state = readListLocation(
      url({
        sorts: JSON.stringify(twoSorts),
        order: 'id:descending',
        jql: 'ORDER BY summary ASC',
      }),
    )
    expect(supportedListQuery(state)).toEqual({
      sort: { key: 'title', descending: false },
    })
  })

  it('gives invalid conditions priority over invalid sort or unsupported grouping', () => {
    const state = readListLocation(
      url({
        projects: 'null',
        sorts: 'null',
        groupBy: 'assignee',
      }),
    )
    expect(state.conditionsInvalid).toBe(true)
    expect(state.sortsInvalid).toBe(true)
    expect(supportedListQuery(state)).toEqual({ error: 'conditions_invalid' })
  })
})

describe('advanced parameter precedence, clearing and fixed scope', () => {
  it('uses hash JSON conditions and sort rules above outer parameters', () => {
    const state = readListLocation(
      url(
        {
          projects: '["b","a"]',
          states: '["other","pending"]',
          sorts: JSON.stringify(twoSorts),
        },
        {
          projects: '["outer"]',
          states: '["active"]',
          sorts: '[{"sortKey":"id","direction":"ascending"}]',
        },
      ),
    )
    expect(state.projects).toEqual(['a', 'b'])
    expect(state.states).toEqual(['pending', 'other'])
    expect(state.sorts).toEqual(twoSorts)
  })

  it.each(['projects', 'states', 'sorts'] as const)(
    'does not fall back to a valid outer %s when the hash candidate is invalid',
    (field) => {
      const valid =
        field === 'projects'
          ? '["outer"]'
          : field === 'states'
            ? '["active"]'
            : '[{"sortKey":"id","direction":"ascending"}]'
      const result = roundTrip(url({ [field]: '{' }, { [field]: valid }), {
        view: 'board',
      })
      expect(result.params.get(field)).toBe('{')
      const outer = new URL(result.href, 'http://localhost').searchParams
      expect(outer.has(field)).toBe(false)
      expect(supportedListQuery(result.state)).toEqual({
        error: field === 'sorts' ? 'sort_invalid' : 'conditions_invalid',
      })
    },
  )

  it('uses explicit empty hash arrays above nonempty outer arrays', () => {
    const state = readListLocation(
      url(
        {
          projects: '[]',
          states: '[]',
          sorts: '[]',
        },
        {
          projects: '["outer"]',
          states: '["active"]',
          sorts: JSON.stringify(twoSorts),
        },
      ),
    )
    expect(state.projects).toEqual([])
    expect(state.states).toEqual([])
    expect(state.sorts).toEqual([])
  })

  it('clears both advanced candidates and legacy aliases explicitly and removes error flags', () => {
    const result = roundTrip(
      url(
        {
          query: 'legacy query',
          project: 'legacy-project',
          projects: '{',
          filter: 'completed',
          states: '["unsupported"]',
          order: 'title:ascending',
          sorts: '{',
          local: 'kept',
        },
        { source: 'shared' },
      ),
      {
        ...querySelectionPatch('', all),
        order: undefined,
        sorts: undefined,
      },
    )
    for (const key of [
      'q',
      'query',
      'project',
      'projects',
      'filter',
      'states',
      'order',
      'sorts',
    ])
      expect(result.params.has(key)).toBe(false)
    expect(result.state).not.toHaveProperty('conditionsInvalid')
    expect(result.state).not.toHaveProperty('sortsInvalid')
    expect(committedQueryConditions(result.state)).toEqual({ conditions: all })
    expect(supportedListQuery(result.state)).toEqual({ sort: undefined })
    expect(result.params.get('local')).toBe('kept')
    expect(
      new URL(result.href, 'http://localhost').searchParams.get('source'),
    ).toBe('shared')
  })

  it('does not serialize internal invalid flags as owned URL parameters', () => {
    const result = roundTrip(url({}), {
      conditionsInvalid: true,
      sortsInvalid: true,
      view: 'list',
    })
    expect(result.params.has('conditionsInvalid')).toBe(false)
    expect(result.params.has('sortsInvalid')).toBe(false)
    expect(result.state).not.toHaveProperty('conditionsInvalid')
    expect(result.state).not.toHaveProperty('sortsInvalid')
  })

  it('locks query selection to a fixed route project and removes multi-project candidates', () => {
    const patch = querySelectionPatch(
      'release',
      {
        projects: ['project-b', 'project-c'],
        states: ['completed', 'pending'],
      },
      'project-a',
    )
    expect(patch.project).toBe('project-a')
    expect(patch.projects).toBeUndefined()
    const result = roundTrip(
      url(
        { project: 'project-b', projects: '["project-b","project-c"]' },
        {},
        'project/project-a',
      ),
      patch,
    )
    expect(result.params.get('project')).toBe('project-a')
    expect(result.params.has('projects')).toBe(false)
    expect(committedQueryConditions(result.state, 'project-a')).toEqual({
      conditions: { projects: ['project-a'], states: ['pending', 'completed'] },
    })
  })

  it('canonicalizes a presentation patch to its fixed project without losing states or sort priority', () => {
    const href = url(
      {
        projects: '["project-b","project-c"]',
        states: '["other","active"]',
        sorts: JSON.stringify(twoSorts),
        q: 'release',
        page: '2',
        pageSize: '50',
      },
      { source: 'shared' },
      'project/project-a',
    )
    const patch = projectWorkspaceLocation(
      { view: 'board', page: 1 },
      'project-a',
    )
    expect(patch).toEqual({
      view: 'board',
      page: 1,
      project: 'project-a',
      projects: undefined,
    })
    const result = roundTrip(href, patch)
    expect(result.params.has('projects')).toBe(false)
    expect(result.state).toMatchObject({
      query: 'release',
      project: 'project-a',
      states: ['active', 'other'],
      sorts: twoSorts,
      pageSize: 50,
      page: 1,
      view: 'board',
    })
  })

  it('still rejects invalid state candidates inside a fixed project instead of broadening results', () => {
    const state = readListLocation(url({ states: '["active","active"]' }))
    expect(committedQueryConditions(state, 'project-a').error).toBe(
      'conditions_invalid',
    )
    expect(supportedListQuery(state)).toEqual({ error: 'conditions_invalid' })
  })

  it('does not mutate multi-value patches or arrays while canonicalizing URLs', () => {
    const conditions: QueryConditions = {
      projects: ['b', 'a'],
      states: ['other', 'pending'],
    }
    const sorts = structuredClone(twoSorts)
    const before = structuredClone({ conditions, sorts })
    Object.freeze(conditions.projects)
    Object.freeze(conditions.states)
    Object.freeze(conditions)
    sorts.forEach(Object.freeze)
    Object.freeze(sorts)
    const patch = { ...querySelectionPatch('release', conditions), sorts }
    Object.freeze(patch)
    const result = roundTrip(
      url({}),
      projectWorkspaceLocation(patch, 'fixed-project'),
    )
    expect(result.state.project).toBe('fixed-project')
    expect(result.state.sorts).toEqual(twoSorts)
    expect({ conditions, sorts }).toEqual(before)
  })
})
