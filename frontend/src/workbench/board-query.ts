import { api } from './api'
import {
  defaultBoardPages,
  parseBoardPages,
  type BoardPages,
} from './board-pages'
import {
  queryStateCategories,
  type QueryStateCategory,
} from './query-conditions'
import type { WorkItem } from './projections'
import {
  maxTaskQueryPage,
  parseTaskQueryItem,
  prepareTaskQueryRequest,
  type ServerTaskQuery,
} from './task-query'

export const taskBoardOrder = 'tasks-created-v1'
export const taskBoardColumnSize = 20
export type TaskBoardRequest = {
  query: ServerTaskQuery
  pages: BoardPages
  scopeProjectId?: string
}
export type TaskBoardColumn = {
  state_category: QueryStateCategory
  total: number
  requested_page: number
  page: number
  total_pages: number
  has_more: boolean
  items: WorkItem[]
}
export type TaskBoardPage = {
  schema_version: 1
  unit: 'task_board'
  query: ServerTaskQuery
  scope_project_id: string | null
  order: typeof taskBoardOrder
  column_size: typeof taskBoardColumnSize
  total: number
  columns: TaskBoardColumn[]
}
export class TaskBoardInputError extends Error {
  constructor() {
    super('task_board_input_invalid')
  }
}
export class TaskBoardResponseError extends Error {
  constructor() {
    super('task_board_response_invalid')
  }
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
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum

export function prepareTaskBoardRequest(value: TaskBoardRequest) {
  try {
    const scoped = Object.prototype.hasOwnProperty.call(value, 'scopeProjectId')
    if (
      !exactObject(value, [
        'query',
        'pages',
        ...(scoped ? ['scopeProjectId'] : []),
      ])
    )
      throw new TaskBoardInputError()
    const pages = parseBoardPages(value.pages)
    if (!pages) throw new TaskBoardInputError()
    const prepared = prepareTaskQueryRequest({
      query: value.query,
      sorts: [],
      page: 1,
      pageSize: taskBoardColumnSize,
      ...(scoped ? { scopeProjectId: value.scopeProjectId } : {}),
    })
    if (prepared.query.jql) throw new TaskBoardInputError()
    const params = new URLSearchParams({
      query: JSON.stringify(prepared.query),
      pages: JSON.stringify(pages),
    })
    if (prepared.scope !== null) params.set('scope_project_id', prepared.scope)
    return {
      path: `/tasks/board?${params}`,
      query: prepared.query,
      pages,
      scope: prepared.scope,
    }
  } catch {
    throw new TaskBoardInputError()
  }
}

export function parseTaskBoardPage(
  value: unknown,
  expected?: TaskBoardRequest,
): TaskBoardPage {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'query',
        'scope_project_id',
        'order',
        'column_size',
        'total',
        'columns',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'task_board' ||
      value.order !== taskBoardOrder ||
      value.column_size !== taskBoardColumnSize ||
      !integer(value.total) ||
      !Array.isArray(value.columns) ||
      value.columns.length !== queryStateCategories.length ||
      (value.scope_project_id !== null &&
        typeof value.scope_project_id !== 'string')
    )
      throw new TaskBoardResponseError()
    const pages = defaultBoardPages()
    for (const [index, column] of value.columns.entries()) {
      const state = queryStateCategories[index]
      if (
        !exactObject(column, [
          'state_category',
          'total',
          'requested_page',
          'page',
          'total_pages',
          'has_more',
          'items',
        ]) ||
        column.state_category !== state ||
        !integer(column.total) ||
        !integer(column.requested_page, 1) ||
        column.requested_page > maxTaskQueryPage ||
        !integer(column.page, 1) ||
        !integer(column.total_pages, 1) ||
        typeof column.has_more !== 'boolean' ||
        !Array.isArray(column.items)
      )
        throw new TaskBoardResponseError()
      pages[state] = column.requested_page
    }
    const canonical = prepareTaskBoardRequest({
      query: value.query as ServerTaskQuery,
      pages,
      ...(value.scope_project_id === null
        ? {}
        : { scopeProjectId: value.scope_project_id }),
    })
    const rawQuery = value.query as ServerTaskQuery
    if (
      rawQuery.text !== canonical.query.text ||
      rawQuery.jql !== canonical.query.jql ||
      rawQuery.mode !== canonical.query.mode ||
      JSON.stringify(rawQuery.projects) !==
        JSON.stringify(canonical.query.projects) ||
      JSON.stringify(rawQuery.states) !== JSON.stringify(canonical.query.states)
    )
      throw new TaskBoardResponseError()
    if (expected) {
      const sent = prepareTaskBoardRequest(expected)
      if (
        JSON.stringify(canonical.query) !== JSON.stringify(sent.query) ||
        JSON.stringify(pages) !== JSON.stringify(sent.pages) ||
        value.scope_project_id !== sent.scope
      )
        throw new TaskBoardResponseError()
    }
    const taskIds = new Set<string>()
    const runIds = new Set<string>()
    const projectNames = new Map<string, string>()
    let total = 0
    const columns: TaskBoardColumn[] = value.columns.map((column, index) => {
      const state = queryStateCategories[index]
      const totalPages = Math.max(
        1,
        Math.ceil(column.total / taskBoardColumnSize),
      )
      const page = Math.min(column.requested_page, totalPages)
      const length = Math.min(
        taskBoardColumnSize,
        Math.max(0, column.total - (page - 1) * taskBoardColumnSize),
      )
      if (
        column.total_pages !== totalPages ||
        column.page !== page ||
        column.has_more !== page < totalPages ||
        column.items.length !== length ||
        (canonical.query.states.length &&
          !canonical.query.states.includes(state) &&
          column.total !== 0)
      )
        throw new TaskBoardResponseError()
      total += column.total
      if (!Number.isSafeInteger(total)) throw new TaskBoardResponseError()
      const items: WorkItem[] = column.items.map((record: unknown) => {
        const item = parseTaskQueryItem(record)
        if (
          item.column !== state ||
          taskIds.has(item.id) ||
          (item.run && runIds.has(item.run.id)) ||
          (canonical.query.projects.length &&
            !canonical.query.projects.includes(item.task.project_id)) ||
          (projectNames.has(item.task.project_id) &&
            projectNames.get(item.task.project_id) !== item.projectName)
        )
          throw new TaskBoardResponseError()
        taskIds.add(item.id)
        if (item.run) runIds.add(item.run.id)
        projectNames.set(item.task.project_id, item.projectName)
        return item
      })
      return {
        state_category: state,
        total: column.total,
        requested_page: column.requested_page,
        page,
        total_pages: totalPages,
        has_more: page < totalPages,
        items,
      }
    })
    if (value.total !== total) throw new TaskBoardResponseError()
    return {
      schema_version: 1,
      unit: 'task_board',
      query: canonical.query,
      scope_project_id: canonical.scope,
      order: taskBoardOrder,
      column_size: taskBoardColumnSize,
      total,
      columns,
    }
  } catch {
    throw new TaskBoardResponseError()
  }
}

export async function fetchTaskBoardPage(
  request: TaskBoardRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareTaskBoardRequest(request)
  const expected: TaskBoardRequest = {
    query: prepared.query,
    pages: prepared.pages,
    ...(prepared.scope === null ? {} : { scopeProjectId: prepared.scope }),
  }
  return parseTaskBoardPage(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
