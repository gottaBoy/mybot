import { parseQueryConditions } from './query-conditions'
import type { QueryStateCategory } from './query-conditions'
import { parseTaskSort, type TaskSortRule } from './task-sort'
import { runOrderSort } from './run-sort'

export const listKeys = [
  'q',
  'query',
  'jql',
  'mode',
  'view',
  'filter',
  'project',
  'projects',
  'states',
  'order',
  'sorts',
  'runOrder',
  'groupBy',
  'group',
  'page',
  'pageSize',
] as const
export type ListLocation = {
  query?: string
  jql: string
  mode: 'basic' | 'jql'
  view?: 'list' | 'table' | 'board'
  filter?: 'all' | 'active' | 'attention' | 'completed'
  project?: string
  projects?: string[]
  states?: QueryStateCategory[]
  conditionsInvalid?: true
  order?: string
  sorts?: TaskSortRule[]
  sortsInvalid?: true
  runOrder?: string
  runOrderInvalid?: true
  groupBy: string
  group: string
  page?: number
  pageSize?: number
}
function positiveInteger(value: string | null) {
  if (value === null || value.trim() !== value || !/^\d+$/.test(value))
    return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}
function filterValue(value: string | null): ListLocation['filter'] {
  return value === 'all' ||
    value === 'active' ||
    value === 'attention' ||
    value === 'completed'
    ? value
    : undefined
}
function orderValue(value: string | null) {
  return value !== null &&
    value.trim() === value &&
    /^(id|title|projectName|status|updated|attempts|created_at):(ascending|descending)$/.test(
      value,
    )
    ? value
    : undefined
}
function normalizedParameter(key: string, value: string | null) {
  if (value === null) return undefined
  if (key === 'q') return value.trim() ? value : undefined
  if (key === 'project') return value.trim() || undefined
  if (key === 'filter') return filterValue(value)
  if (key === 'order') return orderValue(value)
  if (key === 'runOrder') return value
  if (key === 'projects' || key === 'states') {
    const result = parseQueryConditions(
      key === 'projects' ? value : null,
      key === 'states' ? value : null,
    )
    return result.error ? value : JSON.stringify(result.conditions[key])
  }
  if (key === 'sorts') {
    try {
      const result = parseTaskSort(JSON.parse(value))
      return result === undefined ? value : JSON.stringify(result)
    } catch {
      return value
    }
  }
  if (key === 'page') return positiveInteger(value)?.toString()
  if (key === 'pageSize') {
    const size = positiveInteger(value)
    return size !== undefined && [20, 50, 100].includes(size)
      ? size.toString()
      : undefined
  }
  if (key === 'mode')
    return value === 'basic' || value === 'jql' ? value : undefined
  if (key === 'view')
    return value === 'list' || value === 'table' || value === 'board'
      ? value
      : undefined
  return value
}
function canonicalParameters(params: URLSearchParams) {
  if (!params.has('q') && params.has('query'))
    params.set('q', params.get('query')!)
  params.delete('query')
  return params
}
function parameters(url: URL) {
  const params = canonicalParameters(new URLSearchParams(url.search))
  const hashQuery = url.hash.indexOf('?')
  if (hashQuery >= 0) {
    canonicalParameters(
      new URLSearchParams(url.hash.slice(hashQuery + 1)),
    ).forEach((value, key) => params.set(key, value))
  }
  return params
}
export function readListLocation(href: string): ListLocation {
  const params = parameters(new URL(href, 'http://localhost'))
  const view = params.get('view')
  const query = normalizedParameter('q', params.get('q'))
  const filter = filterValue(params.get('filter'))
  const project = normalizedParameter('project', params.get('project'))
  const order = orderValue(params.get('order'))
  const runOrder = params.get('runOrder')
  const conditions = parseQueryConditions(
    params.get('projects'),
    params.get('states'),
  )
  let sorts: TaskSortRule[] | undefined
  if (params.has('sorts')) {
    try {
      sorts = parseTaskSort(JSON.parse(params.get('sorts')!))
    } catch {
      // Preserve the unsupported candidate and report it rather than falling back.
    }
  }
  const page = positiveInteger(params.get('page'))
  const requestedPageSize = positiveInteger(params.get('pageSize'))
  const pageSize =
    requestedPageSize !== undefined && [20, 50, 100].includes(requestedPageSize)
      ? requestedPageSize
      : undefined
  return {
    ...(query === undefined ? {} : { query }),
    jql: params.get('jql') ?? '',
    mode: params.get('mode') === 'jql' ? 'jql' : 'basic',
    view:
      view === 'list' || view === 'table' || view === 'board'
        ? view
        : undefined,
    ...(filter === undefined ? {} : { filter }),
    ...(project === undefined ? {} : { project }),
    ...(conditions.error
      ? { conditionsInvalid: true as const }
      : {
          ...(params.has('projects')
            ? { projects: conditions.conditions.projects }
            : {}),
          ...(params.has('states')
            ? { states: conditions.conditions.states }
            : {}),
        }),
    ...(order === undefined ? {} : { order }),
    ...(runOrder === null
      ? {}
      : {
          runOrder,
          ...(runOrderSort(runOrder) === undefined
            ? { runOrderInvalid: true as const }
            : {}),
        }),
    ...(params.has('sorts')
      ? sorts === undefined
        ? { sortsInvalid: true as const }
        : { sorts }
      : {}),
    groupBy: params.get('groupBy') ?? '',
    group: params.get('group') ?? 'none',
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
  }
}
export function listLocationHref(href: string, patch: Partial<ListLocation>) {
  const url = new URL(href, 'http://localhost')
  const all = parameters(url)
  const outer = new URLSearchParams(url.search)
  const hashQuery = url.hash.indexOf('?')
  const hashPath =
    (hashQuery < 0 ? url.hash.slice(1) : url.hash.slice(1, hashQuery)) ||
    'workbench'
  const inner = new URLSearchParams(
    hashQuery < 0 ? '' : url.hash.slice(hashQuery + 1),
  )
  for (const key of listKeys) {
    outer.delete(key)
    inner.delete(key)
    if (key === 'query') continue
    const value = normalizedParameter(key, all.get(key))
    if (value !== undefined) inner.set(key, value)
  }
  for (const [key, value] of Object.entries(patch)) {
    const parameter = key === 'query' ? 'q' : key
    if (!listKeys.includes(parameter as (typeof listKeys)[number])) continue
    const normalized = normalizedParameter(
      parameter,
      value === undefined
        ? null
        : Array.isArray(value)
          ? JSON.stringify(value)
          : String(value),
    )
    if (normalized === undefined) inner.delete(parameter)
    else inner.set(parameter, normalized)
  }
  url.search = outer.toString()
  const hashParams = inner.toString()
  url.hash = `${hashPath}${hashParams ? `?${hashParams}` : ''}`
  return `${url.pathname}${url.search}${url.hash}`
}

// A finite compatibility set, not a hand-written general JQL grammar. Other
// expressions fail closed until their fields and query engine are implemented.
const sortQueries = new Map([
  ['ORDER BY CREATED DESC', { key: 'created_at', descending: true }],
  ['ORDER BY CREATED ASC', { key: 'created_at', descending: false }],
  ['ORDER BY SUMMARY ASC', { key: 'title', descending: false }],
  ['ORDER BY SUMMARY DESC', { key: 'title', descending: true }],
])
export function supportedListQuery(state: ListLocation) {
  if (state.conditionsInvalid) return { error: 'conditions_invalid' as const }
  if (state.sortsInvalid) return { error: 'sort_invalid' as const }
  if (state.groupBy || !['', 'none'].includes(state.group))
    return { error: 'grouping_unavailable' as const }
  const query = state.jql.trim().replace(/\s+/g, ' ').toUpperCase()
  if (!query) return { sort: undefined }
  const sort = sortQueries.get(query)
  if (sort) return { sort }
  if (query.includes('ASSIGNEE') || query.includes('CURRENTUSER('))
    return { error: 'assignee_unavailable' as const }
  return { error: 'jql_unavailable' as const }
}
