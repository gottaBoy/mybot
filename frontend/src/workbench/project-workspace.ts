import type { Project } from './api'
import type { ListLocation } from './list-location'

export function workbenchProjectScope(
  projectFilter: string,
  contextProject?: Pick<Project, 'id'>,
): string | undefined {
  return (
    contextProject?.id ?? (projectFilter === 'all' ? undefined : projectFilter)
  )
}

export function projectWorkspaceLocation(
  patch: Partial<ListLocation>,
  projectId?: string,
  boardPages?: string,
): Partial<ListLocation> {
  const preserveBoardPages =
    boardPages !== undefined &&
    ![
      'query',
      'filter',
      'project',
      'projects',
      'states',
      'jql',
      'boardPages',
    ].some((key) => Object.prototype.hasOwnProperty.call(patch, key))
  return projectId
    ? {
        ...patch,
        project: projectId,
        projects: undefined,
        ...(preserveBoardPages ? { boardPages } : {}),
      }
    : patch
}
