export const taskColumnKeys = [
  'id',
  'title',
  'projectName',
  'status',
  'updated',
  'attempts',
  'created_at',
] as const
export type TaskColumnKey = (typeof taskColumnKeys)[number]
export const defaultTaskColumns: TaskColumnKey[] = [
  'id',
  'title',
  'projectName',
  'status',
  'updated',
  'attempts',
]
export const taskColumnsPreferenceKey = 'mybot.task-columns.v1'
export const taskColumnOrderPreferenceKey = 'mybot.task-column-order.v1'
export const defaultTaskColumnOrder: TaskColumnKey[] = [...taskColumnKeys]

export function normalizeTaskColumns(value: unknown): TaskColumnKey[] {
  if (!Array.isArray(value)) return [...defaultTaskColumns]
  const keys = new Set(
    value.filter(
      (key): key is TaskColumnKey =>
        typeof key === 'string' &&
        taskColumnKeys.includes(key as TaskColumnKey),
    ),
  )
  keys.add('title')
  return taskColumnKeys.filter((key) => keys.has(key))
}

export function readTaskColumns(): TaskColumnKey[] {
  try {
    const saved = localStorage.getItem(taskColumnsPreferenceKey)
    return saved === null
      ? [...defaultTaskColumns]
      : normalizeTaskColumns(JSON.parse(saved))
  } catch {
    return [...defaultTaskColumns]
  }
}

export function normalizeTaskColumnOrder(value: unknown): TaskColumnKey[] {
  if (
    !Array.isArray(value) ||
    value.length !== taskColumnKeys.length ||
    new Set(value).size !== taskColumnKeys.length ||
    value.some(
      (key) =>
        typeof key !== 'string' ||
        !taskColumnKeys.includes(key as TaskColumnKey),
    )
  )
    return [...defaultTaskColumnOrder]
  return [...value] as TaskColumnKey[]
}

export function readTaskColumnOrder(): TaskColumnKey[] {
  try {
    const saved = localStorage.getItem(taskColumnOrderPreferenceKey)
    return saved === null
      ? [...defaultTaskColumnOrder]
      : normalizeTaskColumnOrder(JSON.parse(saved))
  } catch {
    return [...defaultTaskColumnOrder]
  }
}

export function moveTaskColumn(
  order: readonly TaskColumnKey[],
  key: TaskColumnKey,
  direction: -1 | 1,
): TaskColumnKey[] {
  const next = normalizeTaskColumnOrder(order)
  const index = next.indexOf(key)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
