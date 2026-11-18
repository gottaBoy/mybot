import { api, type Project } from './api'
import { isTaskReadIdentifier, stripQueryWhitespace } from './task-query'

export type ProjectReferenceItem = {
  project: Pick<Project, 'id' | 'name'>
  task_count: number
  run_count: number
}
export type ProjectReferencesRequest = {
  query: string
  page: number
  pageSize: 20 | 50 | 100
  selectedIds: string[]
}
export type ProjectReferences = {
  schema_version: 1
  unit: 'project_references'
  query: string
  requested_page: number
  page: number
  page_size: 20 | 50 | 100
  total: number
  total_pages: number
  has_more: boolean
  order: 'projects-created-v1'
  selected_ids: string[]
  selected: ProjectReferenceItem[]
  missing_ids: string[]
  totals: { projects: number; tasks: number; runs: number }
  items: ProjectReferenceItem[]
}

export class ProjectReferenceInputError extends Error {
  constructor() {
    super('project_reference_input_invalid')
  }
}
export class ProjectReferenceResponseError extends Error {
  constructor() {
    super('project_reference_response_invalid')
  }
}

const maxPage = 1_000_000
const order = 'projects-created-v1' as const
const pageSizes = [20, 50, 100]
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const wellFormed = (value: string) =>
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
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
function codePointCompare(left: string, right: string) {
  const a = Array.from(left, (item) => item.codePointAt(0)!)
  const b = Array.from(right, (item) => item.codePointAt(0)!)
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1
  }
  return Math.sign(a.length - b.length)
}
function projectIds(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(isTaskReadIdentifier) ||
    new Set(value).size !== value.length
  )
    throw new ProjectReferenceInputError()
  return [...value].sort(codePointCompare)
}
function canonicalIds(value: unknown) {
  const ids = projectIds(value)
  if (JSON.stringify(ids) !== JSON.stringify(value))
    throw new ProjectReferenceResponseError()
  return ids
}
function validQuery(value: unknown): value is string {
  return (
    typeof value === 'string' && [...value].length <= 2000 && wellFormed(value)
  )
}
export function prepareProjectReferencesRequest(
  value: ProjectReferencesRequest,
) {
  try {
    if (
      !exactObject(value, ['query', 'page', 'pageSize', 'selectedIds']) ||
      !validQuery(value.query) ||
      !integer(value.page, 1) ||
      value.page > maxPage ||
      !pageSizes.includes(value.pageSize as number)
    )
      throw new ProjectReferenceInputError()
    const query = stripQueryWhitespace(value.query)
    const selectedIds = projectIds(value.selectedIds)
    const pageSize = value.pageSize as ProjectReferencesRequest['pageSize']
    const params = new URLSearchParams({
      q: query,
      page: String(value.page),
      page_size: String(pageSize),
      selected: JSON.stringify(selectedIds),
    })
    return {
      path: `/project-references?${params}`,
      query,
      page: value.page,
      pageSize,
      selectedIds,
    }
  } catch {
    throw new ProjectReferenceInputError()
  }
}

function parseItem(
  value: unknown,
  totals: ProjectReferences['totals'],
): ProjectReferenceItem {
  if (
    !exactObject(value, ['project', 'task_count', 'run_count']) ||
    !exactObject(value.project, ['id', 'name']) ||
    !isTaskReadIdentifier(value.project.id) ||
    typeof value.project.name !== 'string' ||
    !wellFormed(value.project.name) ||
    !integer(value.task_count) ||
    !integer(value.run_count) ||
    value.task_count > totals.tasks ||
    value.run_count > totals.runs ||
    (value.task_count === 0 && value.run_count !== 0)
  )
    throw new ProjectReferenceResponseError()
  return {
    project: { id: value.project.id, name: value.project.name },
    task_count: value.task_count,
    run_count: value.run_count,
  }
}
export function parseProjectReferences(
  value: unknown,
  expected?: ProjectReferencesRequest,
): ProjectReferences {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'query',
        'requested_page',
        'page',
        'page_size',
        'total',
        'total_pages',
        'has_more',
        'order',
        'selected_ids',
        'selected',
        'missing_ids',
        'totals',
        'items',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'project_references' ||
      value.order !== order ||
      !validQuery(value.query) ||
      stripQueryWhitespace(value.query) !== value.query ||
      !integer(value.requested_page, 1) ||
      value.requested_page > maxPage ||
      !integer(value.page, 1) ||
      !pageSizes.includes(value.page_size as number) ||
      !integer(value.total) ||
      !integer(value.total_pages, 1) ||
      typeof value.has_more !== 'boolean' ||
      !exactObject(value.totals, ['projects', 'tasks', 'runs']) ||
      !integer(value.totals.projects) ||
      !integer(value.totals.tasks) ||
      !integer(value.totals.runs) ||
      !Array.isArray(value.items) ||
      !Array.isArray(value.selected)
    )
      throw new ProjectReferenceResponseError()
    const pageSize = value.page_size as ProjectReferences['page_size']
    const totalPages = Math.max(1, Math.ceil(value.total / pageSize))
    const page = Math.min(value.requested_page, totalPages)
    const length = Math.min(pageSize, value.total - (page - 1) * pageSize)
    const totals = {
      projects: value.totals.projects,
      tasks: value.totals.tasks,
      runs: value.totals.runs,
    }
    if (
      value.page !== page ||
      value.total_pages !== totalPages ||
      value.has_more !== page < totalPages ||
      value.items.length !== length ||
      value.total > totals.projects ||
      (value.query === '' && value.total !== totals.projects) ||
      (totals.projects === 0 && (totals.tasks !== 0 || totals.runs !== 0)) ||
      (totals.tasks === 0 && totals.runs !== 0)
    )
      throw new ProjectReferenceResponseError()
    const selectedIds = canonicalIds(value.selected_ids)
    const missingIds = canonicalIds(value.missing_ids)
    const selected = value.selected.map((item) => parseItem(item, totals))
    const hydratedIds = selected.map((item) => item.project.id)
    canonicalIds(hydratedIds)
    const hydratedSet = new Set(hydratedIds)
    if (
      missingIds.some((id) => hydratedSet.has(id)) ||
      JSON.stringify([...hydratedIds, ...missingIds].sort(codePointCompare)) !==
        JSON.stringify(selectedIds)
    )
      throw new ProjectReferenceResponseError()
    const items = value.items.map((item) => parseItem(item, totals))
    const pageIds = new Set<string>()
    const references = new Map(selected.map((item) => [item.project.id, item]))
    const missingSet = new Set(missingIds)
    for (const item of items) {
      const id = item.project.id
      const hydrated = references.get(id)
      if (
        pageIds.has(id) ||
        missingSet.has(id) ||
        (hydrated &&
          (hydrated.project.name !== item.project.name ||
            hydrated.task_count !== item.task_count ||
            hydrated.run_count !== item.run_count))
      )
        throw new ProjectReferenceResponseError()
      pageIds.add(id)
      references.set(id, item)
    }
    if (references.size > totals.projects)
      throw new ProjectReferenceResponseError()
    const knownTasks = [...references.values()].reduce(
      (sum, item) => sum + item.task_count,
      0,
    )
    const knownRuns = [...references.values()].reduce(
      (sum, item) => sum + item.run_count,
      0,
    )
    if (
      !integer(knownTasks) ||
      !integer(knownRuns) ||
      knownTasks > totals.tasks ||
      knownRuns > totals.runs ||
      (references.size === totals.projects &&
        (knownTasks !== totals.tasks || knownRuns !== totals.runs))
    )
      throw new ProjectReferenceResponseError()
    if (expected) {
      const sent = prepareProjectReferencesRequest(expected)
      if (
        value.query !== sent.query ||
        value.requested_page !== sent.page ||
        pageSize !== sent.pageSize ||
        JSON.stringify(selectedIds) !== JSON.stringify(sent.selectedIds)
      )
        throw new ProjectReferenceResponseError()
    }
    return {
      schema_version: 1,
      unit: 'project_references',
      query: value.query,
      requested_page: value.requested_page,
      page,
      page_size: pageSize,
      total: value.total,
      total_pages: totalPages,
      has_more: value.has_more,
      order,
      selected_ids: selectedIds,
      selected,
      missing_ids: missingIds,
      totals,
      items,
    }
  } catch {
    throw new ProjectReferenceResponseError()
  }
}

export async function fetchProjectReferences(
  value: ProjectReferencesRequest,
  signal?: AbortSignal,
) {
  const prepared = prepareProjectReferencesRequest(value)
  const expected: ProjectReferencesRequest = {
    query: prepared.query,
    page: prepared.page,
    pageSize: prepared.pageSize,
    selectedIds: [...prepared.selectedIds],
  }
  return parseProjectReferences(
    await api<unknown>(prepared.path, { signal }),
    expected,
  )
}
