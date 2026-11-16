import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import {
  changeHierarchyExpansion,
  hierarchyExpandedIds,
  initialHierarchyExpansion,
  pruneHierarchyExpansion,
  type HierarchyExpansionState,
} from '../src/workbench/hierarchy-state'
import { workTree } from '../src/workbench/projections'

const data = {
  projects: [
    { id: 'one', name: 'Alpha project' },
    { id: 'two', name: 'Beta project' },
    { id: 'empty', name: 'Empty project' },
  ],
  tasks: [
    { id: 'alpha', project_id: 'one', title: 'Alpha task' },
    { id: 'beta', project_id: 'two', title: 'Beta task' },
  ],
  runs: [
    { id: 'run-alpha', task_id: 'alpha', status: 'succeeded' },
    { id: 'run-beta', task_id: 'beta', status: 'failed' },
  ],
} as Bootstrap
const allRows = workTree(data, '')

afterEach(() => vi.restoreAllMocks())

describe('controlled hierarchy expansion', () => {
  it('initially expands only project branches, not leaves or task descendants', () => {
    const state = initialHierarchyExpansion(allRows)
    expect([...state.userExpandedIds]).toEqual(['project:one', 'project:two'])
    expect(state.search).toBeUndefined()
  })

  it('keeps user expansions through search auto-expansion, search toggles and clearing', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const initial = initialHierarchyExpansion(allRows)
    const user = changeHierarchyExpansion(
      initial,
      new Set(['project:one', 'task:alpha']),
      allRows,
      '',
    )
    const matches = workTree(data, 'run-beta')
    expect([...hierarchyExpandedIds(user, matches, 'run-beta')]).toEqual([
      'project:two',
      'task:beta',
    ])
    const collapsedSearch = changeHierarchyExpansion(
      user,
      new Set(['project:two']),
      matches,
      'run-beta',
    )
    expect(collapsedSearch.userExpandedIds).toBe(user.userExpandedIds)
    expect([
      ...hierarchyExpandedIds(collapsedSearch, matches, 'run-beta'),
    ]).toEqual(['project:two'])
    expect([...hierarchyExpandedIds(collapsedSearch, allRows, '')]).toEqual([
      'project:one',
      'task:alpha',
    ])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('auto-expands a different search without reusing the prior search collapse', () => {
    const state = changeHierarchyExpansion(
      initialHierarchyExpansion(allRows),
      new Set(),
      workTree(data, 'run-alpha'),
      'run-alpha',
    )
    expect([
      ...hierarchyExpandedIds(state, workTree(data, 'run-beta'), 'run-beta'),
    ]).toEqual(['project:two', 'task:beta'])
    expect([
      ...hierarchyExpandedIds(
        state,
        workTree(data, 'RUN-ALPHA'),
        ' RUN-ALPHA ',
      ),
    ]).toEqual([])
  })

  it('updates only the normal collection when toggling outside a search', () => {
    const searching = changeHierarchyExpansion(
      initialHierarchyExpansion(allRows),
      new Set(['project:two']),
      workTree(data, 'run-beta'),
      'run-beta',
    )
    const normal = changeHierarchyExpansion(
      searching,
      new Set(['project:one', 'task:alpha']),
      allRows,
      '',
    )
    expect(normal.search).toBe(searching.search)
    expect([...normal.userExpandedIds]).toEqual(['project:one', 'task:alpha'])
  })

  it('prunes unknown IDs, leaves and removed branches without expanding new nodes', () => {
    const state: HierarchyExpansionState = {
      userExpandedIds: new Set([
        'project:one',
        'task:alpha',
        'project:empty',
        'run:run-alpha',
        'project:missing',
      ]),
      search: {
        query: 'beta',
        expandedIds: new Set(['project:two', 'task:beta', 'run:run-beta']),
      },
    }
    const nextData = {
      ...data,
      runs: data.runs.filter((run) => run.id !== 'run-alpha'),
      projects: [...data.projects, { id: 'new', name: 'New project' }],
      tasks: [
        ...data.tasks,
        { id: 'new-task', project_id: 'new', title: 'New task' },
      ],
    } as Bootstrap
    const pruned = pruneHierarchyExpansion(state, workTree(nextData, ''))
    expect([...pruned.userExpandedIds]).toEqual(['project:one'])
    expect([...pruned.search!.expandedIds]).toEqual([
      'project:two',
      'task:beta',
    ])
    expect(pruned.userExpandedIds.has('project:new')).toBe(false)
    expect(state.userExpandedIds.has('task:alpha')).toBe(true)
    expect(pruneHierarchyExpansion(pruned, workTree(nextData, ''))).toBe(pruned)
  })
})
