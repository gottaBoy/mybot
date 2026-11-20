import { api, type Project, type Run, type Task } from './api'
import { queryRunState, type QueryStateCategory } from './query-conditions'
import { parseRunSort, type RunSortRule } from './run-sort'
import {
  isTaskReadIdentifier,
  maxTaskQueryPage,
  parseTaskQueryRun,
  prepareTaskQueryRequest,
  type ServerTaskQuery,
} from './task-query'

export const runQuerySortSemantics = 'unicode-natural-v1'
export type RunQueryItem = {
  run: Pick<Run, 'id' | 'task_id' | 'status' | 'created_at'>
  task: Pick<Task, 'id' | 'project_id' | 'title'>
  project: Pick<Project, 'id' | 'name'>
  state_category: Exclude<QueryStateCategory, 'pending'>
}
export type RunQueryRequest = {
  query: ServerTaskQuery
  sorts: RunSortRule[]
  scopeProjectId?: string
  page: number
  pageSize: number
}
export type RunQueryPage = {
  schema_version: 1
  unit: 'runs'
  items: RunQueryItem[]
  total: number
  requested_page: number
  page: number
  page_size: 20 | 50 | 100
  total_pages: number
  has_more: boolean
  query: ServerTaskQuery
  sorts: RunSortRule[]
  scope_project_id: string | null
  sort_semantics: typeof runQuerySortSemantics
}
export class RunQueryInputError extends Error {
  constructor() {
    super('run_query_input_invalid')
  }
}
export class RunQueryResponseError extends Error {
  constructor() {
    super('run_query_response_invalid')
  }
}
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
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
const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' &&
  [...value].length > 0 &&
  [...value].length <= maximum &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))

export function prepareRunQueryRequest(value: RunQueryRequest) {
  try {
    const withScope = Object.prototype.hasOwnProperty.call(
      value,
      'scopeProjectId',
    )
    if (
      !exactObject(value, [
        'query',
        'sorts',
        'page',
        'pageSize',
        ...(withScope ? ['scopeProjectId'] : []),
      ]) ||
      parseRunSort(value.sorts) === undefined
    )
      throw new RunQueryInputError()
    const prepared = prepareTaskQueryRequest(value)
    const sorts = parseRunSort(prepared.sorts)
    if (!sorts) throw new RunQueryInputError()
    return {
      ...prepared,
      path: prepared.path.replace('/tasks/query?', '/runs/query?'),
      sorts,
    }
  } catch {
    throw new RunQueryInputError()
  }
}

function parseRunQueryItem(value: unknown): RunQueryItem {
  if (
    !exactObject(value, ['run', 'task', 'project', 'state_category']) ||
    !exactObject(value.task, ['id', 'project_id', 'title']) ||
    !exactObject(value.project, ['id', 'name']) ||
    !isTaskReadIdentifier(value.task.id) ||
    !isTaskReadIdentifier(value.task.project_id) ||
    !text(value.task.title, 160) ||
    !isTaskReadIdentifier(value.project.id) ||
    !text(value.project.name, 100) ||
    value.task.project_id !== value.project.id
  )
    throw new RunQueryResponseError()
  const run = parseTaskQueryRun(value.run, value.task.id)
  if (
    !run ||
    value.state_category !== queryRunState(run) ||
    value.state_category === 'pending'
  )
    throw new RunQueryResponseError()
  return {
    run: {
      id: run.id,
      task_id: run.task_id,
      status: run.status,
      created_at: run.created_at,
    },
    task: {
      id: value.task.id,
      project_id: value.task.project_id,
      title: value.task.title,
    },
    project: { id: value.project.id, name: value.project.name },
    state_category: value.state_category as RunQueryItem['state_category'],
  }
}

export function parseRunQueryPage(
  value: unknown,
  expected?: RunQueryRequest,
): RunQueryPage {
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
      value.unit !== 'runs' ||
      value.sort_semantics !== runQuerySortSemantics ||
      !integer(value.total) ||
      !integer(value.requested_page, 1) ||
      value.requested_page > maxTaskQueryPage ||
      !integer(value.page, 1) ||
      !integer(value.page_size, 1) ||
      ![20, 50, 100].includes(value.page_size) ||
      !integer(value.total_pages, 1) ||
      typeof value.has_more !== 'boolean' ||
      !Array.isArray(value.items) ||
      (value.scope_project_id !== null &&
        !isTaskReadIdentifier(value.scope_project_id))
    )
      throw new RunQueryResponseError()
    const normalized = prepareRunQueryRequest({
      query: value.query as ServerTaskQuery,
      sorts: value.sorts as RunSortRule[],
      page: value.requested_page,
      pageSize: value.page_size,
      ...(value.scope_project_id === null
        ? {}
        : { scopeProjectId: value.scope_project_id }),
    })
    const rawQuery = value.query as ServerTaskQuery
    const rawSorts = parseRunSort(value.sorts)
    if (
      normalized.query.text !== rawQuery.text ||
      normalized.query.jql !== rawQuery.jql ||
      normalized.query.mode !== rawQuery.mode ||
      JSON.stringify(normalized.query.projects) !==
        JSON.stringify(rawQuery.projects) ||
      JSON.stringify(normalized.query.states) !==
        JSON.stringify(rawQuery.states) ||
      JSON.stringify(normalized.sorts) !== JSON.stringify(rawSorts)
    )
      throw new RunQueryResponseError()
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
      throw new RunQueryResponseError()
    if (expected) {
      const sent = prepareRunQueryRequest(expected)
      if (
        JSON.stringify(normalized.query) !== JSON.stringify(sent.query) ||
        JSON.stringify(normalized.sorts) !== JSON.stringify(sent.sorts) ||
        value.scope_project_id !== sent.scope ||
        value.requested_page !== sent.page ||
        value.page_size !== sent.pageSize
      )
        throw new RunQueryResponseError()
    }
    const runIds = new Set<string>()
    const tasks = new Map<string, string>()
    const projects = new Map<string, string>()
    const items = value.items.map((record) => {
      const item = parseRunQueryItem(record)
      const taskIdentity = JSON.stringify(item.task)
      if (
        runIds.has(item.run.id) ||
        (tasks.has(item.task.id) && tasks.get(item.task.id) !== taskIdentity) ||
        (projects.has(item.project.id) &&
          projects.get(item.project.id) !== item.project.name) ||
        (normalized.query.projects.length &&
          !normalized.query.projects.includes(item.project.id)) ||
        (normalized.query.states.length &&
          !normalized.query.states.includes(item.state_category))
      )
        throw new RunQueryResponseError()
      runIds.add(item.run.id)
      tasks.set(item.task.id, taskIdentity)
      projects.set(item.project.id, item.project.name)
      return item
    })
    return {
      schema_version: 1,
      unit: 'runs',
      items,
      total: value.total,
      requested_page: value.requested_page,
      page,
      page_size: value.page_size as RunQueryPage['page_size'],
      total_pages: totalPages,
      has_more: value.has_more,
      query: normalized.query,
      sorts: normalized.sorts,
      scope_project_id: value.scope_project_id,
      sort_semantics: runQuerySortSemantics,
    }
  } catch {
    throw new RunQueryResponseError()
  }
}

export async function fetchRunQueryPage(
  request: RunQueryRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareRunQueryRequest(request)
  const expected: RunQueryRequest = {
    query: prepared.query,
    sorts: prepared.sorts,
    page: prepared.page,
    pageSize: prepared.pageSize,
    ...(prepared.scope === null ? {} : { scopeProjectId: prepared.scope }),
  }
  return parseRunQueryPage(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
