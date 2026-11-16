import { taskColumnKeys, type TaskColumnKey } from './task-table-config'

export type TaskSortRule = {
  sortKey: TaskColumnKey
  direction: 'ascending' | 'descending'
}

export function parseTaskSort(value: unknown): TaskSortRule[] | undefined {
  if (!Array.isArray(value) || value.length > 3) return undefined
  const keys = new Set<TaskColumnKey>()
  const parsed: TaskSortRule[] = []
  for (const rule of value) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule) ||
      Object.keys(rule).length !== 2 ||
      typeof rule.sortKey !== 'string' ||
      !taskColumnKeys.includes(rule.sortKey as TaskColumnKey) ||
      !['ascending', 'descending'].includes(rule.direction) ||
      keys.has(rule.sortKey)
    )
      return undefined
    keys.add(rule.sortKey)
    parsed.push({ sortKey: rule.sortKey, direction: rule.direction })
  }
  return parsed
}
