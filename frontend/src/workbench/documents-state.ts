import type { Bootstrap, Project } from './api'

export type DocumentSelection = {
  projectId: string
  chosenTask: string | null
  // A project fallback must not activate a task moved to another project.
  chosenTaskProjectId?: string
  query: string
}

export function selectDocumentProject(projectId: string): DocumentSelection {
  return { projectId, chosenTask: null, query: '' }
}

export function reconcileDocumentSelection(
  projects: readonly Project[],
  selection: DocumentSelection,
): DocumentSelection {
  if (projects.some((project) => project.id === selection.projectId))
    return selection
  const firstProject = projects[0]
  if (!firstProject) return selection
  return {
    ...selection,
    projectId: firstProject.id,
    ...(selection.chosenTask === null
      ? {}
      : {
          chosenTaskProjectId:
            selection.chosenTaskProjectId ?? selection.projectId,
        }),
  }
}

export function projectDocumentView(
  data: Pick<Bootstrap, 'projects' | 'tasks'>,
  requested: DocumentSelection,
) {
  const selection = reconcileDocumentSelection(data.projects, requested)
  const project = data.projects.find((item) => item.id === selection.projectId)
  const projectTasks = project
    ? data.tasks.filter((task) => task.project_id === project.id)
    : []
  const term = selection.query.trim().toLocaleLowerCase()
  const navigationTasks = projectTasks.filter(
    (task) =>
      !term ||
      `${task.title} ${task.acceptance}`.toLocaleLowerCase().includes(term),
  )
  const taskProjectId = selection.chosenTaskProjectId ?? selection.projectId
  const current =
    taskProjectId === project?.id
      ? projectTasks.find((task) => task.id === selection.chosenTask)
      : undefined
  const content =
    selection.chosenTask === null
      ? ('notes' as const)
      : current
        ? ('task' as const)
        : ('unavailable' as const)
  return {
    selection,
    project,
    projectTasks,
    navigationTasks,
    current,
    content,
  }
}
