import { api, type Project } from './api'
import { isTaskReadIdentifier, stripQueryWhitespace } from './task-query'

export type ProjectDetail = {
  schema_version: 1
  unit: 'project_detail'
  project: Project
  task_count: number
  run_count: number
}

export type ProjectQueryRequest = {
  query: string
  page: number
  pageSize: 20 | 50 | 100
}

export type ProjectQueryItem = {
  project: Pick<Project, 'id' | 'name' | 'goal' | 'directory'>
  task_count: number
  run_count: number
}

export type ProjectQueryPage = {
  schema_version: 1
  unit: 'project_query'
  query: string
  requested_page: number
  page: number
  page_size: 20 | 50 | 100
  total: number
  total_pages: number
  has_more: boolean
  order: 'projects-created-v1'
  items: ProjectQueryItem[]
}

export class ProjectResourceInputError extends Error {
  constructor() {
    super('project_resource_input_invalid')
  }
}

export class ProjectDetailResponseError extends Error {
  constructor() {
    super('project_detail_response_invalid')
  }
}

export class ProjectQueryResponseError extends Error {
  constructor() {
    super('project_query_response_invalid')
  }
}

const maxPage = 1_000_000
const order = 'projects-created-v1' as const
const pageSizes = [20, 50, 100] as const
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const wellFormed = (value: string) =>
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const exactObject = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && [...value].length <= max && wellFormed(value)
  )
}

function validProjectId(value: unknown): value is string {
  return isTaskReadIdentifier(value)
}

function validCount(value: unknown) {
  return integer(value)
}

function parseDetailProject(value: unknown): Project {
  if (
    !exactObject(value, ['id', 'name', 'goal', 'directory', 'notes']) ||
    !validProjectId(value.id) ||
    !validText(value.name, 100) ||
    !value.name.length ||
    !validText(value.goal, 4000) ||
    !validText(value.directory, 400) ||
    !validText(value.notes, 16000)
  )
    throw new ProjectDetailResponseError()
  return {
    id: value.id,
    name: value.name,
    goal: value.goal,
    directory: value.directory,
    notes: value.notes,
  }
}

export function prepareProjectDetailRequest(identifier: string) {
  if (!validProjectId(identifier)) throw new ProjectResourceInputError()
  return {
    path: `/projects/${encodeURIComponent(identifier)}/detail`,
    identifier,
  }
}

export function parseProjectDetail(
  value: unknown,
  expectedIdentifier?: string,
): ProjectDetail {
  try {
    if (
      !exactObject(value, [
        'schema_version',
        'unit',
        'project',
        'task_count',
        'run_count',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'project_detail' ||
      !validCount(value.task_count) ||
      !validCount(value.run_count) ||
      (value.task_count === 0 && value.run_count !== 0)
    )
      throw new ProjectDetailResponseError()
    const project = parseDetailProject(value.project)
    if (expectedIdentifier !== undefined) {
      if (
        !validProjectId(expectedIdentifier) ||
        project.id !== expectedIdentifier
      )
        throw new ProjectDetailResponseError()
    }
    return {
      schema_version: 1,
      unit: 'project_detail',
      project,
      task_count: value.task_count,
      run_count: value.run_count,
    }
  } catch {
    throw new ProjectDetailResponseError()
  }
}

export async function fetchProjectDetail(
  identifier: string,
  signal?: AbortSignal,
) {
  const prepared = prepareProjectDetailRequest(identifier)
  return parseProjectDetail(
    await api<unknown>(prepared.path, { signal }),
    prepared.identifier,
  )
}

function preparePage(value: ProjectQueryRequest) {
  try {
    if (
      !exactObject(value, ['query', 'page', 'pageSize']) ||
      !validText(value.query, 2000) ||
      !integer(value.page, 1) ||
      value.page > maxPage ||
      !pageSizes.includes(value.pageSize as (typeof pageSizes)[number])
    )
      throw new ProjectResourceInputError()
    const query = stripQueryWhitespace(value.query)
    return {
      query,
      page: value.page,
      pageSize: value.pageSize,
      path: `/projects/query?q=${encodeURIComponent(query)}&page=${value.page}&page_size=${value.pageSize}`,
    }
  } catch {
    throw new ProjectResourceInputError()
  }
}

export function prepareProjectQueryRequest(value: ProjectQueryRequest) {
  return preparePage(value)
}

function parseSummary(value: unknown): ProjectQueryItem {
  if (
    !exactObject(value, ['project', 'task_count', 'run_count']) ||
    !exactObject(value.project, ['id', 'name', 'goal', 'directory']) ||
    !validProjectId(value.project.id) ||
    !validText(value.project.name, 100) ||
    !value.project.name.length ||
    !validText(value.project.goal, 4000) ||
    !validText(value.project.directory, 400) ||
    !validCount(value.task_count) ||
    !validCount(value.run_count) ||
    (value.task_count === 0 && value.run_count !== 0)
  )
    throw new ProjectQueryResponseError()
  return {
    project: {
      id: value.project.id,
      name: value.project.name,
      goal: value.project.goal,
      directory: value.project.directory,
    },
    task_count: value.task_count,
    run_count: value.run_count,
  }
}

export function parseProjectQuery(
  value: unknown,
  expected?: ProjectQueryRequest,
): ProjectQueryPage {
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
        'items',
      ]) ||
      value.schema_version !== 1 ||
      value.unit !== 'project_query' ||
      !validText(value.query, 2000) ||
      stripQueryWhitespace(value.query) !== value.query ||
      !integer(value.requested_page, 1) ||
      value.requested_page > maxPage ||
      !integer(value.page, 1) ||
      !pageSizes.includes(value.page_size as (typeof pageSizes)[number]) ||
      !integer(value.total) ||
      !integer(value.total_pages, 1) ||
      typeof value.has_more !== 'boolean' ||
      value.order !== order ||
      !Array.isArray(value.items)
    )
      throw new ProjectQueryResponseError()
    const pageSize = value.page_size as ProjectQueryPage['page_size']
    const totalPages = Math.max(1, Math.ceil(value.total / pageSize))
    const page = Math.min(value.requested_page, totalPages)
    const expectedLength = Math.min(
      pageSize,
      Math.max(0, value.total - (page - 1) * pageSize),
    )
    if (
      value.page !== page ||
      value.total_pages !== totalPages ||
      value.has_more !== page < totalPages ||
      value.items.length !== expectedLength
    )
      throw new ProjectQueryResponseError()
    const items = value.items.map(parseSummary)
    const ids = items.map((item) => item.project.id)
    if (new Set(ids).size !== ids.length) throw new ProjectQueryResponseError()
    if (expected) {
      const sent = preparePage(expected)
      if (
        value.query !== sent.query ||
        value.requested_page !== sent.page ||
        pageSize !== sent.pageSize
      )
        throw new ProjectQueryResponseError()
    }
    return {
      schema_version: 1,
      unit: 'project_query',
      query: value.query,
      requested_page: value.requested_page,
      page,
      page_size: pageSize,
      total: value.total,
      total_pages: totalPages,
      has_more: value.has_more,
      order,
      items,
    }
  } catch {
    throw new ProjectQueryResponseError()
  }
}

export async function fetchProjectQuery(
  value: ProjectQueryRequest,
  signal?: AbortSignal,
) {
  const prepared = preparePage(value)
  return parseProjectQuery(await api<unknown>(prepared.path, { signal }), {
    query: prepared.query,
    page: prepared.page,
    pageSize: prepared.pageSize,
  })
}
