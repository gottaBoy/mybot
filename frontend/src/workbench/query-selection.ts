import type { ListLocation } from './list-location'
import {
  normalizeQueryConditions,
  type QueryConditions,
} from './query-conditions'
import { basicQueryPatch } from './basic-query'
import type { Filter } from './state'

export function committedQueryConditions(
  state: ListLocation,
  fixedProjectId?: string,
) {
  const result = normalizeQueryConditions({
    projects:
      state.projects ??
      (state.project && state.project !== 'all' ? [state.project] : []),
    states:
      state.states ??
      (state.filter && state.filter !== 'all' ? [state.filter] : []),
  })
  if (state.conditionsInvalid || result.error)
    return { ...result, error: 'conditions_invalid' as const }
  return fixedProjectId
    ? {
        conditions: { ...result.conditions, projects: [fixedProjectId] },
      }
    : result
}

export function querySelectionPatch(
  query: string,
  candidate: QueryConditions,
  fixedProjectId?: string,
): Partial<ListLocation> {
  const result = normalizeQueryConditions(candidate)
  if (result.error) throw new Error(result.error)
  const { projects, states } = result.conditions
  const legacyState =
    states.length === 1 &&
    ['active', 'attention', 'completed'].includes(states[0])
      ? (states[0] as Filter)
      : 'all'
  return {
    ...basicQueryPatch(
      {
        query,
        project: projects.length === 1 ? projects[0] : 'all',
        filter: legacyState,
      },
      fixedProjectId,
    ),
    projects: fixedProjectId || projects.length < 2 ? undefined : [...projects],
    states: states.length && legacyState === 'all' ? [...states] : undefined,
  }
}
