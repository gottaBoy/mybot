import { api } from './api'
import type { Run, Task } from './api'
import { queryRunState, queryStateCategories } from './query-conditions'
import type { QueryStateCategory } from './query-conditions'
import { parseTaskSort, type TaskSortRule } from './task-sort'
import type { WorkItem } from './projections'

export const taskQuerySortSemantics = 'unicode-natural-v1'

export type ServerTaskQuery = {
  text: string
  projects: string[]
  states: QueryStateCategory[]
  jql: string
  mode: 'basic' | 'jql'
}
export type ServerTaskQueryRequest = {
  query: ServerTaskQuery
  sorts: TaskSortRule[]
  scopeProjectId?: string
  page: number
  pageSize: number
}
export type ServerTaskQueryPage = {
  schema_version: 1
  unit: 'tasks'
  items: WorkItem[]
  total: number
  requested_page: number
  page: number
  page_size: 20 | 50 | 100
  total_pages: number
  has_more: boolean
  query: ServerTaskQuery
  sorts: TaskSortRule[]
  scope_project_id: string | null
  sort_semantics: typeof taskQuerySortSemantics
}
export class TaskQueryResponseError extends Error {
  constructor() {
    super('task_query_response_invalid')
  }
}
export class TaskQueryInputError extends Error {
  constructor() {
    super('task_query_input_invalid')
  }
}
export const maxTaskQueryPage = 90071992547409
const sortQueries = new Set([
  '',
  'ORDER BY CREATED ASC',
  'ORDER BY CREATED DESC',
  'ORDER BY SUMMARY ASC',
  'ORDER BY SUMMARY DESC',
])
// Python str.strip/split include these separators, but not ECMAScript's BOM.
const queryWhitespace =
  /[\u0009-\u000D\u001C-\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/u
function stripQueryWhitespace(value: string) {
  let start = 0
  let end = value.length
  while (start < end && queryWhitespace.test(value[start])) start++
  while (end > start && queryWhitespace.test(value[end - 1])) end--
  return value.slice(start, end)
}
function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (character) => character.codePointAt(0)!)
  const b = Array.from(right, (character) => character.codePointAt(0)!)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return Math.sign(a.length - b.length)
}
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
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  stripQueryWhitespace(value) === value &&
  [...value].length > 0 &&
  [...value].length <= 100 &&
  wellFormed(value)
export { identifier as isTaskReadIdentifier }
const integer = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.includes('T') &&
  Number.isFinite(Date.parse(value))
function wellFormed(value: string) {
  return !/[\uD800-\uDFFF]/u.test(
    value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''),
  )
}
const text = (value: unknown): value is string =>
  typeof value === 'string' && wellFormed(value)
function parseQuery(value: unknown): ServerTaskQuery {
  if (
    !exactObject(value, ['text', 'projects', 'states', 'jql', 'mode']) ||
    typeof value.text !== 'string' ||
    [...value.text].length > 2000 ||
    !wellFormed(value.text) ||
    typeof value.jql !== 'string' ||
    [...value.jql].length > 2000 ||
    !wellFormed(value.jql) ||
    !Array.isArray(value.projects) ||
    value.projects.length > 100 ||
    !value.projects.every(identifier) ||
    new Set(value.projects).size !== value.projects.length ||
    !Array.isArray(value.states) ||
    value.states.length > queryStateCategories.length ||
    !value.states.every(
      (state) =>
        typeof state === 'string' &&
        queryStateCategories.includes(state as QueryStateCategory),
    ) ||
    new Set(value.states).size !== value.states.length ||
    (value.mode !== 'basic' && value.mode !== 'jql')
  )
    throw new TaskQueryResponseError()
  const jql = value.jql
    .split(queryWhitespace)
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
  if (!sortQueries.has(jql)) throw new TaskQueryResponseError()
  const states = value.states
  return {
    text: stripQueryWhitespace(value.text),
    projects: [...value.projects].sort(codePointCompare),
    states: queryStateCategories.filter((state) => states.includes(state)),
    jql,
    mode: value.mode,
  }
}
function effectiveSorts(
  query: ServerTaskQuery,
  sorts: TaskSortRule[],
): TaskSortRule[] {
  if (!query.jql) return sorts
  const [, , field, direction] = query.jql.split(' ')
  return [
    {
      sortKey: field === 'CREATED' ? 'created_at' : 'title',
      direction: direction === 'ASC' ? 'ascending' : 'descending',
    },
  ]
}
function parseSorts(value: unknown) {
  const sorts = parseTaskSort(value)
  return sorts !== undefined &&
    (value as unknown[]).every((rule) =>
      exactObject(rule, ['sortKey', 'direction']),
    )
    ? sorts
    : undefined
}
export function prepareTaskQueryRequest(value: ServerTaskQueryRequest) {
  try {
    const query = parseQuery(value.query)
    const sorts = parseSorts(value.sorts)
    if (
      sorts === undefined ||
      !integer(value.page, 1) ||
      value.page > maxTaskQueryPage ||
      ![20, 50, 100].includes(value.pageSize) ||
      (value.scopeProjectId !== undefined && !identifier(value.scopeProjectId))
    )
      throw new TaskQueryInputError()
    if (value.scopeProjectId !== undefined)
      query.projects = [value.scopeProjectId]
    const effective = effectiveSorts(query, sorts)
    const params = new URLSearchParams({
      query: JSON.stringify(query),
      sorts: JSON.stringify(sorts),
      page: String(value.page),
      page_size: String(value.pageSize),
    })
    if (value.scopeProjectId !== undefined)
      params.set('scope_project_id', value.scopeProjectId)
    return {
      path: `/tasks/query?${params}`,
      query,
      sorts: effective,
      page: value.page,
      pageSize: value.pageSize,
      scope: value.scopeProjectId ?? null,
    }
  } catch {
    throw new TaskQueryInputError()
  }
}
function parseTask(value: unknown): Task {
  if (
    !exactObject(value, [
      'id',
      'project_id',
      'title',
      'goal',
      'acceptance',
      'files',
      'created_at',
    ]) ||
    !identifier(value.id) ||
    !identifier(value.project_id) ||
    !text(value.title) ||
    !text(value.goal) ||
    !text(value.acceptance) ||
    !timestamp(value.created_at) ||
    !Array.isArray(value.files) ||
    !value.files.every(text)
  )
    throw new TaskQueryResponseError()
  return {
    id: value.id,
    project_id: value.project_id,
    title: value.title,
    goal: value.goal,
    acceptance: value.acceptance,
    files: [...value.files],
    created_at: value.created_at,
  }
}
export function parseTaskQueryRun(
  value: unknown,
  taskId: string,
): Run | undefined {
  if (value === null) return undefined
  if (
    !exactObject(value, ['id', 'task_id', 'status', 'created_at']) ||
    !identifier(value.id) ||
    value.task_id !== taskId ||
    !text(value.status) ||
    !value.status ||
    !timestamp(value.created_at)
  )
    throw new TaskQueryResponseError()
  return {
    id: value.id,
    task_id: taskId,
    status: value.status,
    created_at: value.created_at,
  }
}
export function parseTaskQueryItem(value: unknown): WorkItem {
  if (
    !exactObject(value, [
      'task',
      'project',
      'latest_run',
      'state_category',
      'attempts',
    ]) ||
    !exactObject(value.project, ['id', 'name']) ||
    !identifier(value.project.id) ||
    !text(value.project.name) ||
    !integer(value.attempts, 0)
  )
    throw new TaskQueryResponseError()
  const task = parseTask(value.task)
  const run = parseTaskQueryRun(value.latest_run, task.id)
  const column = queryRunState(run)
  if (
    task.project_id !== value.project.id ||
    value.state_category !== column ||
    (run ? value.attempts < 1 : value.attempts !== 0)
  )
    throw new TaskQueryResponseError()
  return {
    id: task.id,
    task,
    projectName: value.project.name,
    run,
    column,
    attempts: value.attempts,
  }
}
export function parseTaskQueryPage(
  value: unknown,
  expected?: ServerTaskQueryRequest,
): ServerTaskQueryPage {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'items',
        'total',
        'requested_page',
        'page',
        'page_size',
        'total_pages',
        'has_more',
        'query',
        'sorts',
        'scope_project_id',
        'sort_semantics',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'tasks' ||
      !Array.isArray(value.items) ||
      !integer(value.total, 0) ||
      !integer(value.requested_page, 1) ||
      value.requested_page > maxTaskQueryPage ||
      !integer(value.page, 1) ||
      !integer(value.page_size, 1) ||
      ![20, 50, 100].includes(value.page_size) ||
      !integer(value.total_pages, 1) ||
      typeof value.has_more !== 'boolean' ||
      (value.scope_project_id !== null &&
        !identifier(value.scope_project_id)) ||
      value.sort_semantics !== taskQuerySortSemantics
    )
      throw new TaskQueryResponseError()
    const query = parseQuery(value.query)
    const sorts = parseSorts(value.sorts)
    if (
      sorts === undefined ||
      JSON.stringify(sorts) !== JSON.stringify(effectiveSorts(query, sorts)) ||
      (value.scope_project_id !== null &&
        JSON.stringify(query.projects) !==
          JSON.stringify([value.scope_project_id]))
    )
      throw new TaskQueryResponseError()
    const totalPages = Math.max(1, Math.ceil(value.total / value.page_size))
    const page = Math.min(value.requested_page, totalPages)
    const length = Math.min(
      value.page_size,
      Math.max(0, value.total - (page - 1) * value.page_size),
    )
    if (
      value.total_pages !== totalPages ||
      value.page !== page ||
      value.has_more !== page < totalPages ||
      value.items.length !== length
    )
      throw new TaskQueryResponseError()
    if (expected) {
      const canonical = prepareTaskQueryRequest(expected)
      if (
        JSON.stringify(query) !== JSON.stringify(canonical.query) ||
        JSON.stringify(sorts) !== JSON.stringify(canonical.sorts) ||
        value.scope_project_id !== canonical.scope ||
        value.page_size !== canonical.pageSize ||
        value.requested_page !== canonical.page
      )
        throw new TaskQueryResponseError()
    }
    const runIds = new Set<string>()
    const projectNames = new Map<string, string>()
    const items: WorkItem[] = value.items.map((record) => {
      const item = parseTaskQueryItem(record)
      const { task, run, column, projectName } = item
      if (
        (query.projects.length && !query.projects.includes(task.project_id)) ||
        (query.states.length && !query.states.includes(column)) ||
        (run && runIds.has(run.id)) ||
        (projectNames.has(task.project_id) &&
          projectNames.get(task.project_id) !== projectName)
      )
        throw new TaskQueryResponseError()
      if (run) runIds.add(run.id)
      projectNames.set(task.project_id, projectName)
      return item
    })
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new TaskQueryResponseError()
    return {
      schema_version: 1,
      unit: 'tasks',
      items,
      total: value.total,
      requested_page: value.requested_page,
      page,
      page_size: value.page_size as 20 | 50 | 100,
      total_pages: totalPages,
      has_more: value.has_more,
      query,
      sorts,
      scope_project_id: value.scope_project_id,
      sort_semantics: taskQuerySortSemantics,
    }
  } catch {
    throw new TaskQueryResponseError()
  }
}
export async function fetchTaskQueryPage(
  value: ServerTaskQueryRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareTaskQueryRequest(value)
  const expected: ServerTaskQueryRequest = {
    query: prepared.query,
    sorts: prepared.sorts,
    ...(prepared.scope === null ? {} : { scopeProjectId: prepared.scope }),
    page: prepared.page,
    pageSize: prepared.pageSize,
  }
  return parseTaskQueryPage(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
