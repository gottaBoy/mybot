import type { ListLocation } from './list-location'
import type { Filter } from './state'

export type BasicQueryDraft = {
  query: string
  project: string
  filter: Filter
}

export function basicQueryPatch(
  draft: BasicQueryDraft,
  fixedProjectId?: string,
): Partial<ListLocation> {
  if (!['all', 'active', 'attention', 'completed'].includes(draft.filter))
    throw new Error('basic_query_filter_invalid')
  const project = fixedProjectId ?? draft.project.trim()
  return {
    query: draft.query.trim() || undefined,
    filter: draft.filter === 'all' ? undefined : draft.filter,
    project: project === 'all' || !project ? undefined : project,
    page: 1,
  }
}

export function basicQueryPending(
  draft: BasicQueryDraft,
  committed: BasicQueryDraft,
  fixedProjectId?: string,
) {
  return (
    draft.query !== committed.query ||
    draft.filter !== committed.filter ||
    (!fixedProjectId && draft.project !== committed.project)
  )
}
