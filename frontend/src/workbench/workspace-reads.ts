import { api, type Run, type Task, type Project } from './api'
import {
  isTaskReadIdentifier,
  stripQueryWhitespace,
  parseTaskQueryRun,
} from './task-query'

export type WorkspaceReadRequest = {
  projects: string[]
  scopeProjectId?: string
}
export type WorkspaceCountsRequest = WorkspaceReadRequest
export type WorkspaceCounts = {
  schema_version: 1
  unit: 'workspace_counts'
  projects: string[]
  scope_project_id: string | null
  task_counts: Record<
    'all' | 'pending' | 'active' | 'attention' | 'completed' | 'other',
    number
  >
  run_counts: Record<
    'all' | 'active' | 'attention' | 'completed' | 'other',
    number
  >
}
export type WorkspaceSearchRequest = {
  query: string
  limit: 20 | 50
  scopeProjectId?: string
}
export type WorkspaceSearchItem =
  | { kind: 'project'; project: Pick<Project, 'id' | 'name'> }
  | {
      kind: 'task'
      task: Pick<Task, 'id' | 'project_id' | 'title'>
      project: Pick<Project, 'id' | 'name'>
    }
  | {
      kind: 'run'
      run: Pick<Run, 'id' | 'task_id' | 'status' | 'created_at'>
      task: Pick<Task, 'id' | 'project_id' | 'title'>
      project: Pick<Project, 'id' | 'name'>
    }
export type WorkspaceSearchResults = {
  schema_version: 1
  unit: 'workspace_search'
  query: string
  limit: 20 | 50
  total: number
  has_more: boolean
  scope_project_id: string | null
  order: 'projects-tasks-runs-created-v1'
  items: WorkspaceSearchItem[]
}

export class WorkspaceReadInputError extends Error {
  constructor() {
    super('workspace_read_input_invalid')
  }
}
export class WorkspaceReadResponseError extends Error {
  constructor() {
    super('workspace_read_response_invalid')
  }
}

const maxProjects = 100
const searchOrder = 'projects-tasks-runs-created-v1' as const
const countTaskKeys = [
  'all',
  'pending',
  'active',
  'attention',
  'completed',
  'other',
] as const
const countRunKeys = [
  'all',
  'active',
  'attention',
  'completed',
  'other',
] as const
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const wellFormed = (value: string) =>
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
function exactObject(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}
function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (item) => item.codePointAt(0)!)
  const b = Array.from(right, (item) => item.codePointAt(0)!)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return Math.sign(a.length - b.length)
}
function projectIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maxProjects ||
    !value.every(isTaskReadIdentifier) ||
    new Set(value).size !== value.length
  )
    throw new WorkspaceReadInputError()
  return [...value].sort(codePointCompare)
}
function prepareScope(value: unknown) {
  if (value !== undefined && !isTaskReadIdentifier(value))
    throw new WorkspaceReadInputError()
  return value as string | undefined
}
function prepareBase(value: WorkspaceReadRequest) {
  if (
    !exactObject(
      value,
      Object.prototype.hasOwnProperty.call(value, 'scopeProjectId')
        ? ['projects', 'scopeProjectId']
        : ['projects'],
    )
  )
    throw new WorkspaceReadInputError()
  const projects = projectIds(value.projects)
  const scopeProjectId = prepareScope(value.scopeProjectId)
  return {
    projects,
    scopeProjectId,
    effectiveProjects: scopeProjectId ? [scopeProjectId] : projects,
  }
}
function countRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, number> {
  if (!exactObject(value, [...keys])) throw new WorkspaceReadResponseError()
  const result: Record<string, number> = {}
  for (const key of keys) {
    if (!integer(value[key])) throw new WorkspaceReadResponseError()
    result[key] = value[key]
  }
  const total = result.all
  const classified = keys
    .filter((key) => key !== 'all')
    .reduce((sum, key) => sum + result[key], 0)
  if (!Number.isSafeInteger(classified) || classified !== total)
    throw new WorkspaceReadResponseError()
  return result
}
function expectedScope(value: string | undefined) {
  return value ?? null
}
export function prepareWorkspaceCountsRequest(value: WorkspaceCountsRequest) {
  try {
    const prepared = prepareBase(value)
    const params = new URLSearchParams({
      projects: JSON.stringify(prepared.projects),
    })
    if (prepared.scopeProjectId)
      params.set('scope_project_id', prepared.scopeProjectId)
    return {
      path: `/workspace/counts?${params}`,
      ...prepared,
    }
  } catch {
    throw new WorkspaceReadInputError()
  }
}
export function parseWorkspaceCounts(
  value: unknown,
  expected?: WorkspaceCountsRequest,
): WorkspaceCounts {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'projects',
        'scope_project_id',
        'task_counts',
        'run_counts',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'workspace_counts' ||
      !Array.isArray(value.projects) ||
      (value.scope_project_id !== null &&
        !isTaskReadIdentifier(value.scope_project_id))
    )
      throw new WorkspaceReadResponseError()
    const projects = projectIds(value.projects)
    if (
      JSON.stringify(projects) !== JSON.stringify(value.projects) ||
      (value.scope_project_id !== null &&
        JSON.stringify(projects) !== JSON.stringify([value.scope_project_id]))
    )
      throw new WorkspaceReadResponseError()
    const task_counts = countRecord(value.task_counts, countTaskKeys)
    const run_counts = countRecord(value.run_counts, countRunKeys)
    if (expected) {
      const sent = prepareWorkspaceCountsRequest(expected)
      if (
        JSON.stringify(projects) !== JSON.stringify(sent.effectiveProjects) ||
        value.scope_project_id !== expectedScope(sent.scopeProjectId)
      )
        throw new WorkspaceReadResponseError()
    }
    return {
      schema_version: 1,
      unit: 'workspace_counts',
      projects,
      scope_project_id: value.scope_project_id,
      task_counts: task_counts as WorkspaceCounts['task_counts'],
      run_counts: run_counts as WorkspaceCounts['run_counts'],
    }
  } catch {
    throw new WorkspaceReadResponseError()
  }
}
export async function fetchWorkspaceCounts(
  value: WorkspaceCountsRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareWorkspaceCountsRequest(value)
  const expected = {
    projects: [...prepared.projects],
    ...(prepared.scopeProjectId
      ? { scopeProjectId: prepared.scopeProjectId }
      : {}),
  }
  return parseWorkspaceCounts(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}

function itemKey(item: WorkspaceSearchItem) {
  return `${item.kind}:${item.kind === 'project' ? item.project.id : item.kind === 'task' ? item.task.id : item.run.id}`
}
function parseProject(value: unknown): Pick<Project, 'id' | 'name'> {
  if (
    !exactObject(value, ['id', 'name']) ||
    !isTaskReadIdentifier(value.id) ||
    typeof value.name !== 'string' ||
    !wellFormed(value.name)
  )
    throw new WorkspaceReadResponseError()
  return { id: value.id, name: value.name }
}
function parseTask(value: unknown): Pick<Task, 'id' | 'project_id' | 'title'> {
  if (
    !exactObject(value, ['id', 'project_id', 'title']) ||
    !isTaskReadIdentifier(value.id) ||
    !isTaskReadIdentifier(value.project_id) ||
    typeof value.title !== 'string' ||
    !wellFormed(value.title)
  )
    throw new WorkspaceReadResponseError()
  return { id: value.id, project_id: value.project_id, title: value.title }
}
function parseRun(
  value: unknown,
  taskId: string,
): Pick<Run, 'id' | 'task_id' | 'status' | 'created_at'> {
  const run = parseTaskQueryRun(value, taskId)
  if (!run) throw new WorkspaceReadResponseError()
  return run
}
export function prepareWorkspaceSearchRequest(value: WorkspaceSearchRequest) {
  try {
    if (
      !exactObject(
        value,
        Object.prototype.hasOwnProperty.call(value, 'scopeProjectId')
          ? ['scopeProjectId', 'query', 'limit']
          : ['query', 'limit'],
      ) ||
      typeof value.query !== 'string' ||
      [...value.query].length > 2000 ||
      !wellFormed(value.query) ||
      ![20, 50].includes(value.limit)
    )
      throw new WorkspaceReadInputError()
    const scopeProjectId = prepareScope(value.scopeProjectId)
    const query = stripQueryWhitespace(value.query)
    const params = new URLSearchParams({
      q: query,
      limit: String(value.limit),
    })
    if (scopeProjectId) params.set('scope_project_id', scopeProjectId)
    return {
      path: `/workspace/search?${params}`,
      scopeProjectId,
      query,
      limit: value.limit as 20 | 50,
    }
  } catch {
    throw new WorkspaceReadInputError()
  }
}
export function parseWorkspaceSearch(
  value: unknown,
  expected?: WorkspaceSearchRequest,
): WorkspaceSearchResults {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'query',
        'limit',
        'total',
        'has_more',
        'scope_project_id',
        'order',
        'items',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'workspace_search' ||
      typeof value.query !== 'string' ||
      [...value.query].length > 2000 ||
      !wellFormed(value.query) ||
      !integer(value.total) ||
      typeof value.has_more !== 'boolean' ||
      (value.scope_project_id !== null &&
        !isTaskReadIdentifier(value.scope_project_id)) ||
      value.order !== searchOrder ||
      !Array.isArray(value.items) ||
      ![20, 50].includes(value.limit as number)
    )
      throw new WorkspaceReadResponseError()
    const limit = value.limit as 20 | 50
    const query = stripQueryWhitespace(value.query)
    const expectedLength = Math.min(value.total, limit)
    if (
      value.query !== query ||
      value.items.length !== expectedLength ||
      value.has_more !== value.total > limit
    )
      throw new WorkspaceReadResponseError()
    const items: WorkspaceSearchItem[] = []
    const projectNames = new Map<string, string>()
    const taskReferences = new Map<string, string>()
    const seen = new Set<string>()
    for (const record of value.items) {
      if (
        !record ||
        typeof record !== 'object' ||
        Array.isArray(record) ||
        typeof record.kind !== 'string'
      )
        throw new WorkspaceReadResponseError()
      let item: WorkspaceSearchItem
      if (record.kind === 'project') {
        if (!exactObject(record, ['kind', 'project']))
          throw new WorkspaceReadResponseError()
        const project = parseProject(record.project)
        item = { kind: 'project', project }
      } else if (record.kind === 'task') {
        if (!exactObject(record, ['kind', 'task', 'project']))
          throw new WorkspaceReadResponseError()
        const task = parseTask(record.task)
        const project = parseProject(record.project)
        if (task.project_id !== project.id)
          throw new WorkspaceReadResponseError()
        item = { kind: 'task', task, project }
      } else if (record.kind === 'run') {
        if (!exactObject(record, ['kind', 'run', 'task', 'project']))
          throw new WorkspaceReadResponseError()
        const task = parseTask(record.task)
        const project = parseProject(record.project)
        const run = parseRun(record.run, task.id)
        if (task.project_id !== project.id)
          throw new WorkspaceReadResponseError()
        item = { kind: 'run', run, task, project }
      } else {
        throw new WorkspaceReadResponseError()
      }
      const key = itemKey(item)
      if (seen.has(key)) throw new WorkspaceReadResponseError()
      seen.add(key)
      const project = item.project
      if (
        (value.scope_project_id !== null &&
          item.project.id !== value.scope_project_id) ||
        (projectNames.has(project.id) &&
          projectNames.get(project.id) !== project.name)
      )
        throw new WorkspaceReadResponseError()
      projectNames.set(project.id, project.name)
      if (item.kind !== 'project') {
        const reference = JSON.stringify([
          item.task.project_id,
          item.task.title,
        ])
        if (
          taskReferences.has(item.task.id) &&
          taskReferences.get(item.task.id) !== reference
        )
          throw new WorkspaceReadResponseError()
        taskReferences.set(item.task.id, reference)
      }
      items.push(item)
    }
    if (expected) {
      const sent = prepareWorkspaceSearchRequest(expected)
      if (
        query !== sent.query ||
        limit !== sent.limit ||
        value.scope_project_id !== expectedScope(sent.scopeProjectId)
      )
        throw new WorkspaceReadResponseError()
    }
    return {
      schema_version: 1,
      unit: 'workspace_search',
      query,
      limit,
      total: value.total,
      has_more: value.has_more,
      scope_project_id: value.scope_project_id,
      order: searchOrder,
      items,
    }
  } catch {
    throw new WorkspaceReadResponseError()
  }
}
export async function fetchWorkspaceSearch(
  value: WorkspaceSearchRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareWorkspaceSearchRequest(value)
  const expected = {
    query: prepared.query,
    limit: prepared.limit,
    ...(prepared.scopeProjectId
      ? { scopeProjectId: prepared.scopeProjectId }
      : {}),
  }
  return parseWorkspaceSearch(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
