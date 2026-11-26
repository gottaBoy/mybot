import { api } from './api'
import { isTaskReadIdentifier, maxTaskQueryPage } from './task-query'

export type ArtifactRef = { id: string; sha256: string }
export type ArtifactSource = {
  id: string
  run_id: string
  task_id: string
  title: string
  kind: string
  created_at: string
  bytes: number
  sha256: string
  content: string
}
export type ArtifactOption = Omit<ArtifactSource, 'content' | 'sha256'> & {
  sha256: string | null
}
export type ArtifactPage = {
  schema_version: 1
  unit: 'task_artifacts'
  task_id: string
  items: ArtifactOption[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
  order: 'artifacts-created-v1'
}
function fail(): never {
  throw new Error('task_artifact_response_invalid')
}
function object(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)),
  )
}
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const text = (value: unknown): value is string =>
  typeof value === 'string' &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const sourceKeys = [
  'id',
  'run_id',
  'task_id',
  'title',
  'kind',
  'created_at',
  'bytes',
  'sha256',
]
function source(value: unknown, full: boolean, taskId?: string) {
  if (
    !object(value, full ? [...sourceKeys, 'content'] : sourceKeys) ||
    !isTaskReadIdentifier(value.id) ||
    !isTaskReadIdentifier(value.run_id) ||
    !isTaskReadIdentifier(value.task_id) ||
    (taskId && value.task_id !== taskId) ||
    !text(value.title) ||
    !text(value.kind) ||
    !text(value.created_at) ||
    !value.created_at.includes('T') ||
    !Number.isFinite(Date.parse(value.created_at)) ||
    !integer(value.bytes) ||
    (full
      ? !hash(value.sha256)
      : value.sha256 !== null && !hash(value.sha256)) ||
    (value.sha256 !== null && (value.bytes < 1 || value.bytes > 32768)) ||
    (value.sha256 === null && value.bytes >= 1 && value.bytes <= 32768) ||
    (full &&
      (!text(value.content) ||
        new TextEncoder().encode(value.content).length !== value.bytes))
  )
    fail()
  return value
}
export function parseArtifactSources(
  value: unknown,
  taskId?: string,
): ArtifactSource[] {
  if (!Array.isArray(value) || value.length > 3) fail()
  const result = value.map(
    (item) => source(item, true, taskId) as ArtifactSource,
  )
  if (
    new Set(result.map((item) => item.id)).size !== result.length ||
    result.reduce((sum, item) => sum + item.bytes, 0) > 65536 ||
    new Set(result.map((item) => item.task_id)).size > 1
  )
    fail()
  return result
}
export function parseArtifactRefs(value: unknown): ArtifactRef[] {
  if (!Array.isArray(value) || value.length > 3) fail()
  const result = value.map((item) => {
    if (
      !object(item, ['id', 'sha256']) ||
      !isTaskReadIdentifier(item.id) ||
      !hash(item.sha256)
    )
      fail()
    return { id: item.id, sha256: item.sha256 }
  })
  if (new Set(result.map((item) => item.id)).size !== result.length) fail()
  return result
}
export function artifactRefs(
  items: readonly ArtifactSource[] | undefined,
): ArtifactRef[] {
  return (items ?? []).map(({ id, sha256 }) => ({ id, sha256 }))
}
export function sameArtifactRefs(left: ArtifactRef[], right: ArtifactRef[]) {
  return JSON.stringify(left) === JSON.stringify(right)
}
export function parseArtifactPage(
  value: unknown,
  taskId: string,
  requestedPage: number,
): ArtifactPage {
  if (
    !object(value, [
      'schema_version',
      'unit',
      'task_id',
      'items',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
      'order',
    ]) ||
    value.schema_version !== 1 ||
    value.unit !== 'task_artifacts' ||
    value.task_id !== taskId ||
    value.order !== 'artifacts-created-v1' ||
    value.requested_page !== requestedPage ||
    !integer(value.total) ||
    value.page_size !== 20 ||
    !Array.isArray(value.items)
  )
    fail()
  const pages = Math.max(1, Math.ceil(value.total / 20)),
    page = Math.min(requestedPage, pages)
  if (
    value.page !== page ||
    value.total_pages !== pages ||
    value.has_more !== page < pages ||
    value.items.length !==
      Math.min(20, Math.max(0, value.total - (page - 1) * 20))
  )
    fail()
  const items = value.items.map(
    (item) => source(item, false, taskId) as ArtifactOption,
  )
  if (new Set(items.map((item) => item.id)).size !== items.length) fail()
  return value as unknown as ArtifactPage
}
export async function fetchTaskArtifacts(
  taskId: string,
  page: number,
  signal?: AbortSignal,
) {
  if (
    !isTaskReadIdentifier(taskId) ||
    !integer(page) ||
    page < 1 ||
    page > maxTaskQueryPage
  )
    throw new Error('task_artifact_input_invalid')
  const result = await api<unknown>(
    `/tasks/${encodeURIComponent(taskId)}/artifacts?page=${page}`,
    { signal },
  )
  signal?.throwIfAborted()
  return parseArtifactPage(result, taskId, page)
}
