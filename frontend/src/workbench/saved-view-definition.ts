import { normalizeQueryConditions, type QueryStateCategory } from './query-conditions'
import { parseTaskSort, type TaskSortRule } from './task-sort'
import {
  normalizeTaskColumns,
  taskColumnKeys,
  type TaskColumnKey,
} from './task-table-config'

export type SavedViewDefinition = {
  schema_version: 1
  query: {
    text: string
    projects: string[]
    states: QueryStateCategory[]
    jql: string
    mode: 'basic' | 'jql'
  }
  table: {
    page_size: 20 | 50 | 100
    sorts: TaskSortRule[]
    columns: TaskColumnKey[]
    column_order: TaskColumnKey[]
  }
}

const sortQueries = new Set([
  'ORDER BY CREATED DESC',
  'ORDER BY CREATED ASC',
  'ORDER BY SUMMARY ASC',
  'ORDER BY SUMMARY DESC',
])
function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}
function columns(value: unknown, complete: boolean): value is TaskColumnKey[] {
  if (!Array.isArray(value) || value.length > taskColumnKeys.length ||
      new Set(value).size !== value.length || !value.includes('title')) return false
  if (complete && value.length !== taskColumnKeys.length) return false
  for (const key of value)
    if (typeof key !== 'string' || !taskColumnKeys.includes(key as TaskColumnKey)) return false
  return true
}
export function parseSavedViewDefinition(value: unknown): SavedViewDefinition {
  const invalid = () => { throw new Error('saved_view_definition_invalid') }
  try {
    if (!exactObject(value, ['schema_version', 'query', 'table']) ||
        value.schema_version !== 1 ||
        !exactObject(value.query, ['text', 'projects', 'states', 'jql', 'mode']) ||
        !exactObject(value.table, ['page_size', 'sorts', 'columns', 'column_order']))
      return invalid()
    const query = value.query
    const table = value.table
    const conditions = normalizeQueryConditions({
      projects: query.projects,
      states: query.states,
    })
    const sorts = parseTaskSort(table.sorts)
    if (typeof query.text !== 'string' || [...query.text].length > 2000 ||
        typeof query.jql !== 'string' || [...query.jql].length > 2000 ||
        (query.mode !== 'basic' && query.mode !== 'jql') ||
        conditions.error || sorts === undefined ||
        ![20, 50, 100].includes(table.page_size as number) ||
        !columns(table.columns, false) || !columns(table.column_order, true))
      return invalid()
    const jql = query.jql.trim().replace(/\s+/g, ' ').toUpperCase()
    if (jql && !sortQueries.has(jql)) return invalid()
    return {
      schema_version: 1,
      query: {
        text: query.text,
        ...conditions.conditions,
        jql,
        mode: query.mode,
      },
      table: {
        page_size: table.page_size as 20 | 50 | 100,
        sorts,
        columns: normalizeTaskColumns(table.columns),
        column_order: [...table.column_order],
      },
    }
  } catch {
    return invalid()
  }
}
