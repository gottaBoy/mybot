export const runSortKeys = [
  'id',
  'title',
  'projectName',
  'status',
  'created_at',
] as const

export type RunSortRule = {
  sortKey: (typeof runSortKeys)[number]
  direction: 'ascending' | 'descending'
}

export function parseRunSort(value: unknown): RunSortRule[] | undefined {
  if (!Array.isArray(value) || value.length > 1) return undefined
  const result: RunSortRule[] = []
  for (const rule of value) {
    if (
      !rule ||
      typeof rule !== 'object' ||
      Array.isArray(rule) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(rule)) ||
      Reflect.ownKeys(rule).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(rule, 'sortKey') ||
      !Object.prototype.hasOwnProperty.call(rule, 'direction') ||
      !runSortKeys.includes(rule.sortKey) ||
      !['ascending', 'descending'].includes(rule.direction)
    )
      return undefined
    result.push({ sortKey: rule.sortKey, direction: rule.direction })
  }
  return result
}

export function runOrderSort(
  value: string | undefined,
): RunSortRule[] | undefined {
  if (value === undefined) return []
  if (
    typeof value !== 'string' ||
    !/^(id|title|projectName|status|created_at):(ascending|descending)$/.test(
      value,
    )
  )
    return undefined
  const [sortKey, direction] = value.split(':')
  return parseRunSort([{ sortKey, direction }])
}
