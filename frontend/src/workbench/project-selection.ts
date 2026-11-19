import {
  fetchProjectReferences,
  prepareProjectReferencesRequest,
  type ProjectReferenceItem,
} from './project-references'

export class ProjectSelectionUnavailableError extends Error {
  readonly missingIds: string[]

  constructor(missingIds: string[]) {
    super('project_selection_unavailable')
    this.missingIds = [...missingIds]
  }
}

export class ProjectSelectionChangedError extends Error {
  constructor() {
    super('project_selection_candidate_changed')
  }
}

export async function validateProjectSelection(
  ids: string[],
  signal?: AbortSignal,
): Promise<ProjectReferenceItem[]> {
  const prepared = prepareProjectReferencesRequest({
    query: '',
    page: 1,
    pageSize: 20,
    selectedIds: ids,
  })
  signal?.throwIfAborted()
  if (!prepared.selectedIds.length) return []
  const value = await fetchProjectReferences(
    {
      query: '',
      page: 1,
      pageSize: 20,
      selectedIds: [...prepared.selectedIds],
    },
    signal,
  )
  signal?.throwIfAborted()
  if (value.missing_ids.length)
    throw new ProjectSelectionUnavailableError(value.missing_ids)
  return value.selected
}
