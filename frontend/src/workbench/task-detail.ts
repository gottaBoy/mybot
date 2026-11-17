import { api, type Run } from './api'
import type { WorkItem } from './projections'
import {
  isTaskReadIdentifier,
  maxTaskQueryPage,
  parseTaskQueryItem,
  parseTaskQueryRun,
} from './task-query'

export const taskDetailHistoryOrder = 'created-desc-source-v1'
export type TaskDetailRequest = {
  taskId: string
  scopeProjectId?: string
  page: number
  pageSize: number
}
export type TaskDetail = {
  schema_version: 1
  unit: 'task_detail'
  item: WorkItem
  history: {
    unit: 'runs'
    items: Run[]
    total: number
    requested_page: number
    page: number
    page_size: 20 | 50 | 100
    total_pages: number
    has_more: boolean
    order: typeof taskDetailHistoryOrder
  }
}
export class TaskDetailInputError extends Error {
  constructor() {
    super('task_detail_input_invalid')
  }
}
export class TaskDetailResponseError extends Error {
  constructor() {
    super('task_detail_response_invalid')
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
const integer = (value: unknown, minimum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum

export function prepareTaskDetailRequest(value: TaskDetailRequest) {
  try {
    if (
      !exactObject(value, [
        'taskId',
        'page',
        'pageSize',
        ...(Object.prototype.hasOwnProperty.call(value, 'scopeProjectId')
          ? ['scopeProjectId']
          : []),
      ]) ||
      !isTaskReadIdentifier(value.taskId) ||
      !integer(value.page, 1) ||
      value.page > maxTaskQueryPage ||
      ![20, 50, 100].includes(value.pageSize as number) ||
      (value.scopeProjectId !== undefined &&
        !isTaskReadIdentifier(value.scopeProjectId))
    )
      throw new TaskDetailInputError()
    const params = new URLSearchParams({
      page: String(value.page),
      page_size: String(value.pageSize),
    })
    if (value.scopeProjectId !== undefined)
      params.set('scope_project_id', value.scopeProjectId as string)
    return {
      path: `/tasks/${encodeURIComponent(value.taskId)}/detail?${params}`,
      taskId: value.taskId,
      scopeProjectId: value.scopeProjectId as string | undefined,
      page: value.page,
      pageSize: value.pageSize as 20 | 50 | 100,
    }
  } catch {
    throw new TaskDetailInputError()
  }
}
export function parseTaskDetail(
  value: unknown,
  expected?: TaskDetailRequest,
): TaskDetail {
  try {
    if (
      !exactObject(value, ['schema_version', 'unit', 'item', 'history']) ||
      value.schema_version !== 1 ||
      value.unit !== 'task_detail' ||
      !exactObject(value.history, [
        'unit',
        'items',
        'total',
        'requested_page',
        'page',
        'page_size',
        'total_pages',
        'has_more',
        'order',
      ])
    )
      throw new TaskDetailResponseError()
    const item = parseTaskQueryItem(value.item)
    const history = value.history
    if (
      history.unit !== 'runs' ||
      history.order !== taskDetailHistoryOrder ||
      !Array.isArray(history.items) ||
      !integer(history.total, 0) ||
      item.attempts !== history.total ||
      !integer(history.requested_page, 1) ||
      history.requested_page > maxTaskQueryPage ||
      !integer(history.page, 1) ||
      ![20, 50, 100].includes(history.page_size as number) ||
      !integer(history.total_pages, 1) ||
      typeof history.has_more !== 'boolean'
    )
      throw new TaskDetailResponseError()
    const pageSize = history.page_size as 20 | 50 | 100
    const totalPages = Math.max(1, Math.ceil(history.total / pageSize))
    const page = Math.min(history.requested_page, totalPages)
    const length = Math.min(
      pageSize,
      Math.max(0, history.total - (page - 1) * pageSize),
    )
    if (
      history.total_pages !== totalPages ||
      history.page !== page ||
      history.has_more !== page < totalPages ||
      history.items.length !== length
    )
      throw new TaskDetailResponseError()
    if (expected) {
      const sent = prepareTaskDetailRequest(expected)
      if (
        item.id !== sent.taskId ||
        (sent.scopeProjectId !== undefined &&
          item.task.project_id !== sent.scopeProjectId) ||
        history.requested_page !== sent.page ||
        pageSize !== sent.pageSize
      )
        throw new TaskDetailResponseError()
    }
    const items = history.items.map((value) => {
      const run = parseTaskQueryRun(value, item.id)
      if (!run) throw new TaskDetailResponseError()
      return run
    })
    if (
      new Set(items.map((run) => run.id)).size !== items.length ||
      (page === 1 &&
        (item.run
          ? !items[0] ||
            items[0].id !== item.run.id ||
            items[0].task_id !== item.run.task_id ||
            items[0].status !== item.run.status ||
            items[0].created_at !== item.run.created_at
          : items.length !== 0)) ||
      (page > 1 && items.some((run) => run.id === item.run?.id))
    )
      throw new TaskDetailResponseError()
    return {
      schema_version: 1,
      unit: 'task_detail',
      item,
      history: {
        unit: 'runs',
        items,
        total: history.total,
        requested_page: history.requested_page,
        page,
        page_size: pageSize,
        total_pages: totalPages,
        has_more: history.has_more,
        order: taskDetailHistoryOrder,
      },
    }
  } catch {
    throw new TaskDetailResponseError()
  }
}
export async function fetchTaskDetail(
  value: TaskDetailRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareTaskDetailRequest(value)
  const expected: TaskDetailRequest = {
    taskId: prepared.taskId,
    scopeProjectId: prepared.scopeProjectId,
    page: prepared.page,
    pageSize: prepared.pageSize,
  }
  return parseTaskDetail(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
