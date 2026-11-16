import type { Bootstrap, Run, Task } from './api'
import { activeStatuses, attentionStatuses, type Filter } from './state'

export type BoardColumn =
  'pending' | 'active' | 'attention' | 'completed' | 'other'
export type WorkItem = {
  id: string
  task: Task
  projectName: string
  run?: Run
  column: BoardColumn
  attempts: number
}
export function taskItems(data: Bootstrap): WorkItem[] {
  const latest = new Map<string, Run>()
  const attempts = new Map<string, number>()
  for (const run of data.runs) {
    attempts.set(run.task_id, (attempts.get(run.task_id) ?? 0) + 1)
    const previous = latest.get(run.task_id)
    if (!previous || run.created_at > previous.created_at)
      latest.set(run.task_id, run)
  }
  return data.tasks.map((task) => {
    const run = latest.get(task.id)
    const column: BoardColumn = !run
      ? 'pending'
      : activeStatuses.has(run.status)
        ? 'active'
        : attentionStatuses.has(run.status)
          ? 'attention'
          : run.status === 'succeeded'
            ? 'completed'
            : 'other'
    return {
      id: task.id,
      task,
      run,
      column,
      attempts: attempts.get(task.id) ?? 0,
      projectName:
        data.projects.find((project) => project.id === task.project_id)?.name ??
        '',
    }
  })
}
export function filteredItems(data: Bootstrap, query = '', projectId?: string) {
  const term = query.trim().toLocaleLowerCase()
  return taskItems(data).filter(
    (item) =>
      (!projectId || item.task.project_id === projectId) &&
      (!term ||
        `${item.task.id} ${item.task.title} ${item.projectName} ${item.run?.id ?? ''}`
          .toLocaleLowerCase()
          .includes(term)),
  )
}
export function filterTaskItems(
  data: Bootstrap,
  query: string,
  filter: Filter,
  projectId?: string,
): WorkItem[] {
  return filteredItems(data, query, projectId).filter(
    (item) => filter === 'all' || item.column === filter,
  )
}
export function projectProgress(data: Bootstrap) {
  const items = taskItems(data)
  return data.projects.map((project) => {
    const tasks = items.filter((item) => item.task.project_id === project.id)
    return {
      project,
      total: tasks.length,
      complete: tasks.filter((item) => item.column === 'completed').length,
      active: tasks.filter((item) => item.column === 'active').length,
      attention: tasks.filter((item) => item.column === 'attention').length,
    }
  })
}
export type WorkTreeRow = {
  id: string
  title: string
  kind: 'project' | 'task' | 'run'
  status: string
  href: string
  children?: WorkTreeRow[]
  count: number
}
export function workTree(data: Bootstrap, query: string): WorkTreeRow[] {
  const term = query.trim().toLocaleLowerCase()
  const projects: WorkTreeRow[] = data.projects.map((project) => ({
    id: `project:${project.id}`,
    title: project.name,
    kind: 'project',
    status: '',
    href: `#project/${project.id}`,
    count: data.tasks.filter((task) => task.project_id === project.id).length,
    children: data.tasks
      .filter((task) => task.project_id === project.id)
      .map((task) => ({
        id: `task:${task.id}`,
        title: task.title,
        kind: 'task',
        status: '',
        href: `#project/${project.id}`,
        count: data.runs.filter((run) => run.task_id === task.id).length,
        children: data.runs
          .filter((run) => run.task_id === task.id)
          .map((run) => ({
            id: `run:${run.id}`,
            title: run.id.slice(0, 8),
            kind: 'run',
            status: run.status,
            href: `#run/${run.id}`,
            count: 0,
          })),
      })),
  }))
  function prune(rows: WorkTreeRow[]): WorkTreeRow[] {
    return rows.flatMap((row) => {
      if (
        row.title.toLocaleLowerCase().includes(term) ||
        row.id.toLocaleLowerCase().includes(term)
      )
        return [row]
      const children = row.children ? prune(row.children) : []
      return children.length ? [{ ...row, children }] : []
    })
  }
  return term ? prune(projects) : projects
}
export function treeBranchIds(rows: WorkTreeRow[]): string[] {
  return rows.flatMap((row) =>
    row.children?.length ? [row.id, ...treeBranchIds(row.children)] : [],
  )
}
