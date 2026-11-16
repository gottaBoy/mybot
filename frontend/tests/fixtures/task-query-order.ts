import type { WorkItem } from '../../src/workbench/projections'
import type { TaskSortRule } from '../../src/workbench/task-sort'

function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (character) => character.codePointAt(0)!)
  const b = Array.from(right, (character) => character.codePointAt(0)!)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return Math.sign(a.length - b.length)
}

// Synthetic fixtures only; runtime Unicode tables can differ from Python's.
export function compareTaskQueryText(left: string, right: string) {
  const a = left.toLowerCase().split(/([0-9]+)/)
  const b = right.toLowerCase().split(/([0-9]+)/)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (index % 2 === 1) {
      const x = a[index].replace(/^0+/, '') || '0'
      const y = b[index].replace(/^0+/, '') || '0'
      const length = Math.sign(x.length - y.length)
      if (length) return length
      const digits = codePointCompare(x, y)
      if (digits) return digits
    } else {
      const text = codePointCompare(a[index], b[index])
      if (text) return text
    }
  }
  return Math.sign(a.length - b.length)
}

export function taskQuerySortValue(
  item: WorkItem,
  key: TaskSortRule['sortKey'],
) {
  switch (key) {
    case 'title':
      return item.task.title
    case 'projectName':
      return item.projectName
    case 'status':
      return item.run?.status ?? 'pending'
    case 'updated':
      return item.run?.created_at ?? ''
    case 'created_at':
      return item.task.created_at ?? ''
    case 'attempts':
      return item.attempts
    default:
      return item.id
  }
}

export function compareTaskQueryItems(
  a: WorkItem,
  b: WorkItem,
  sorts: TaskSortRule[],
) {
  for (const sort of sorts) {
    const x = taskQuerySortValue(a, sort.sortKey)
    const y = taskQuerySortValue(b, sort.sortKey)
    const result =
      typeof x === 'number' && typeof y === 'number'
        ? Math.sign(x - y)
        : compareTaskQueryText(String(x), String(y))
    if (result) return sort.direction === 'ascending' ? result : -result
  }
  return codePointCompare(b.task.created_at ?? '', a.task.created_at ?? '')
}
