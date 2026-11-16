import type { Bootstrap, Run, Task } from './api'
import type { WorkItem } from './projections'
import { activeStatuses, attentionStatuses, type Copy } from './state'

export type QueryStateCategory =
  'pending' | 'active' | 'attention' | 'completed' | 'other'

export type QueryConditions = {
  projects: string[]
  states: QueryStateCategory[]
}

export type QueryConditionsResult = {
  conditions: QueryConditions
  error?: 'conditions_invalid'
}

export const queryStateCategories: readonly QueryStateCategory[] = [
  'pending',
  'active',
  'attention',
  'completed',
  'other',
]

function invalidConditions(): QueryConditionsResult {
  // The error is authoritative; callers must not apply this placeholder.
  return {
    conditions: { projects: [], states: [] },
    error: 'conditions_invalid',
  }
}

function projectIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    [...value].length <= 100 &&
    value.trim() === value
  )
}

function stateCategory(value: unknown): value is QueryStateCategory {
  return (
    typeof value === 'string' &&
    queryStateCategories.includes(value as QueryStateCategory)
  )
}

export function normalizeQueryConditions(
  value: unknown,
): QueryConditionsResult {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return invalidConditions()
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null)
      return invalidConditions()
    const keys = Reflect.ownKeys(value)
    if (
      keys.length !== 2 ||
      !keys.includes('projects') ||
      !keys.includes('states')
    )
      return invalidConditions()
    const record = value as Record<string, unknown>
    const projects = record.projects
    const states = record.states
    if (
      !Array.isArray(projects) ||
      projects.length > 100 ||
      !Array.isArray(states) ||
      states.length > queryStateCategories.length
    )
      return invalidConditions()
    for (const project of projects)
      if (!projectIdentifier(project)) return invalidConditions()
    for (const state of states)
      if (!stateCategory(state)) return invalidConditions()
    if (
      new Set(projects).size !== projects.length ||
      new Set(states).size !== states.length
    )
      return invalidConditions()
    return {
      conditions: {
        projects: [...projects].sort(),
        states: queryStateCategories.filter((state) => states.includes(state)),
      },
    }
  } catch {
    return invalidConditions()
  }
}

export function parseQueryConditions(
  projects: string | null,
  states: string | null,
): QueryConditionsResult {
  try {
    return normalizeQueryConditions({
      projects: projects === null ? [] : JSON.parse(projects),
      states: states === null ? [] : JSON.parse(states),
    })
  } catch {
    return invalidConditions()
  }
}

export function queryConditionsEqual(
  a: QueryConditions,
  b: QueryConditions,
): boolean {
  const left = normalizeQueryConditions(a)
  const right = normalizeQueryConditions(b)
  return (
    !left.error &&
    !right.error &&
    left.conditions.projects.length === right.conditions.projects.length &&
    left.conditions.projects.every(
      (project, index) => project === right.conditions.projects[index],
    ) &&
    left.conditions.states.length === right.conditions.states.length &&
    left.conditions.states.every(
      (state, index) => state === right.conditions.states[index],
    )
  )
}

function matchesProject(
  projectId: string | undefined,
  conditions: QueryConditions,
  fixedProjectId?: string,
) {
  if (fixedProjectId !== undefined)
    return projectIdentifier(fixedProjectId) && projectId === fixedProjectId
  return (
    conditions.projects.length === 0 ||
    (projectId !== undefined && conditions.projects.includes(projectId))
  )
}

export function queryRunState(
  run: Pick<Run, 'status'> | undefined,
): QueryStateCategory {
  if (!run) return 'pending'
  if (activeStatuses.has(run.status)) return 'active'
  if (attentionStatuses.has(run.status)) return 'attention'
  return run.status === 'succeeded' ? 'completed' : 'other'
}

export function matchesTaskConditions(
  item: WorkItem,
  conditions: QueryConditions,
  fixedProjectId?: string,
): boolean {
  const normalized = normalizeQueryConditions(conditions)
  return (
    !normalized.error &&
    stateCategory(item.column) &&
    matchesProject(
      item.task.project_id,
      normalized.conditions,
      fixedProjectId,
    ) &&
    (normalized.conditions.states.length === 0 ||
      normalized.conditions.states.includes(item.column))
  )
}

export function matchesRunConditions(
  run: Run,
  task: Task | undefined,
  conditions: QueryConditions,
  fixedProjectId?: string,
): boolean {
  const normalized = normalizeQueryConditions(conditions)
  return (
    !normalized.error &&
    (!task || task.id === run.task_id) &&
    matchesProject(task?.project_id, normalized.conditions, fixedProjectId) &&
    (normalized.conditions.states.length === 0 ||
      normalized.conditions.states.includes(queryRunState(run)))
  )
}

export type QueryFieldOption = { value: string; label: string }
export type QueryFieldDefinition = {
  id: keyof QueryConditions
  label: string
  options: QueryFieldOption[]
  units: { tasks: string; runs: string }
  description?: string
}

export function buildQueryFieldDirectory(
  data: Pick<Bootstrap, 'projects'>,
  t: Copy,
): QueryFieldDefinition[] {
  const projects = new Map<string, QueryFieldOption>()
  for (const project of data.projects) {
    if (projectIdentifier(project.id) && !projects.has(project.id))
      projects.set(project.id, {
        value: project.id,
        label: project.name || project.id,
      })
  }
  const units = {
    tasks: t('任务', 'tasks'),
    runs: t('运行记录', 'run records'),
  }
  return [
    {
      id: 'projects',
      label: t('项目', 'Projects'),
      options: [...projects.values()],
      units: { ...units },
    },
    {
      id: 'states',
      label: t('状态分类', 'State categories'),
      options: [
        { value: 'pending', label: t('未运行', 'Not started') },
        { value: 'active', label: t('运行中', 'Active') },
        { value: 'attention', label: t('需要处理', 'Needs attention') },
        { value: 'completed', label: t('已完成', 'Completed') },
        { value: 'other', label: t('已取消 / 其他', 'Canceled / other') },
      ],
      units: { ...units },
      description: t(
        '任务按最近运行分类，历史模式逐条运行分类；“未运行”仅指没有运行的任务。',
        'Tasks use their latest run; Run history classifies each record. "Not started" applies only to tasks without a run.',
      ),
    },
  ]
}
