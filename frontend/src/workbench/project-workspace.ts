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
): Partial<ListLocation> {
  return projectId
    ? {
        ...patch,
        project: projectId,
        projects: undefined,
      }
    : patch
}
