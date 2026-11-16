import { api, ApiError } from './api'
import {
  parseSavedViewDefinition,
  type SavedViewDefinition,
} from './saved-view-definition'

export type { SavedViewDefinition } from './saved-view-definition'
export type SavedViewScope =
  | { scope_type: 'workspace'; project_id: null }
  | { scope_type: 'project'; project_id: string }
export type SavedView = SavedViewScope & {
  id: string
  name: string
  definition: SavedViewDefinition
  revision: number
  created_at: string
  updated_at: string
}
export type SavedViewPage = {
  items: SavedView[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}
export type SavedViewDeleteReceipt = {
  id: string
  deleted: true
  revision: number
  deleted_at: string
}
export class SavedViewResponseError extends Error {
  constructor() {
    super('saved_view_response_invalid')
  }
}
export class SavedViewInputError extends Error {}

const identifier =
  /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
function object(
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
const integer = (value: unknown, minimum: number) =>
  Number.isSafeInteger(value) && Number(value) >= minimum
const projectId = (value: unknown): value is string =>
  typeof value === 'string' &&
  [...value].length > 0 &&
  [...value].length <= 100 &&
  value.trim() === value
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.includes('T') &&
  Number.isFinite(Date.parse(value))

export function normalizeSavedViewName(value: string) {
  const name = value.trim()
  if (![...name].length || [...name].length > 100)
    throw new SavedViewInputError('saved_view_name_invalid')
  return name
}
export function savedViewScopeKey(scope: SavedViewScope) {
  if (
    (scope.scope_type === 'workspace' && scope.project_id === null) ||
    (scope.scope_type === 'project' && projectId(scope.project_id))
  )
    return JSON.stringify([scope.scope_type, scope.project_id])
  throw new SavedViewInputError('saved_view_scope_invalid')
}
function sameScope(record: SavedViewScope, scope: SavedViewScope) {
  return (
    record.scope_type === scope.scope_type &&
    record.project_id === scope.project_id
  )
}
function definitionForScope(
  value: unknown,
  scope: SavedViewScope,
): SavedViewDefinition {
  savedViewScopeKey(scope)
  let definition: SavedViewDefinition
  try {
    definition = parseSavedViewDefinition(value)
  } catch {
    throw new SavedViewInputError('saved_view_definition_invalid')
  }
  if (
    scope.scope_type === 'project' &&
    (definition.query.projects.length !== 1 ||
      definition.query.projects[0] !== scope.project_id)
  )
    throw new SavedViewInputError('saved_view_scope_invalid')
  return definition
}
function requireId(value: string) {
  if (!identifier.test(value)) throw new SavedViewInputError('saved_view_id_invalid')
  return value
}
export function newSavedViewId() {
  return crypto.randomUUID()
}
export function parseSavedView(
  value: unknown,
  scope?: SavedViewScope,
  id?: string,
): SavedView {
  try {
    if (
      !object(value, [
        'id',
        'name',
        'scope_type',
        'project_id',
        'definition',
        'revision',
        'created_at',
        'updated_at',
      ]) ||
      typeof value.id !== 'string' ||
      !identifier.test(value.id) ||
      (id !== undefined && value.id !== id) ||
      typeof value.name !== 'string' ||
      normalizeSavedViewName(value.name) !== value.name ||
      !integer(value.revision, 1) ||
      !timestamp(value.created_at) ||
      !timestamp(value.updated_at)
    )
      throw new SavedViewResponseError()
    const recordScope: SavedViewScope =
      value.scope_type === 'workspace' && value.project_id === null
        ? { scope_type: 'workspace', project_id: null }
        : value.scope_type === 'project' && projectId(value.project_id)
          ? { scope_type: 'project', project_id: value.project_id }
          : (() => {
              throw new SavedViewResponseError()
            })()
    if (scope && !sameScope(recordScope, scope))
      throw new SavedViewResponseError()
    return {
      ...recordScope,
      id: value.id,
      name: value.name,
      definition: definitionForScope(value.definition, recordScope),
      revision: Number(value.revision),
      created_at: value.created_at,
      updated_at: value.updated_at,
    }
  } catch {
    throw new SavedViewResponseError()
  }
}
export function parseSavedViewPage(
  value: unknown,
  scope: SavedViewScope,
  window?: { offset: number; limit: number },
): SavedViewPage {
  try {
    if (
      !object(value, ['items', 'total', 'offset', 'limit', 'has_more']) ||
      !Array.isArray(value.items) ||
      !integer(value.total, 0) ||
      !integer(value.offset, 0) ||
      !integer(value.limit, 1) ||
      Number(value.limit) > 100 ||
      typeof value.has_more !== 'boolean' ||
      value.items.length > Number(value.limit) ||
      value.items.length > Number(value.total) ||
      (value.items.length > 0 &&
        Number(value.offset) + value.items.length > Number(value.total)) ||
      (window &&
        (value.offset !== window.offset || value.limit !== window.limit)) ||
      value.has_more !==
        Number(value.offset) + value.items.length < Number(value.total) ||
      (value.has_more && value.items.length === 0)
    )
      throw new SavedViewResponseError()
    const items = value.items.map((item) => parseSavedView(item, scope))
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new SavedViewResponseError()
    return {
      items,
      total: Number(value.total),
      offset: Number(value.offset),
      limit: Number(value.limit),
      has_more: value.has_more,
    }
  } catch {
    throw new SavedViewResponseError()
  }
}
export function savedViewErrorCode(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined
  const detail = error.details
  if (
    detail &&
    typeof detail === 'object' &&
    !Array.isArray(detail) &&
    'code' in detail &&
    typeof detail.code === 'string' &&
    /^[a-z][a-z0-9_]{0,100}$/.test(detail.code)
  )
    return detail.code
  return undefined
}
export function savedViewMutationUnknown(error: unknown) {
  if (error instanceof SavedViewInputError) return false
  return (
    !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  )
}

export async function listSavedViews(
  scope: SavedViewScope,
  options: { offset?: number; limit?: number; signal?: AbortSignal } = {},
) {
  savedViewScopeKey(scope)
  const offset = options.offset ?? 0
  const limit = options.limit ?? 20
  if (!integer(offset, 0) || !integer(limit, 1) || limit > 100)
    throw new SavedViewInputError('saved_view_window_invalid')
  const params = new URLSearchParams({
    scope_type: scope.scope_type,
    offset: String(offset),
    limit: String(limit),
  })
  if (scope.scope_type === 'project') params.set('project_id', scope.project_id)
  return parseSavedViewPage(
    await api<unknown>(`/saved-views?${params}`, { signal: options.signal }),
    scope,
    { offset, limit },
  )
}
export async function readSavedView(
  id: string,
  scope: SavedViewScope,
  signal?: AbortSignal,
) {
  savedViewScopeKey(scope)
  return parseSavedView(
    await api<unknown>(`/saved-views/${requireId(id)}`, { signal }),
    scope,
    id,
  )
}
function namedSnapshot(
  value: { name: string; definition: SavedViewDefinition },
  scope: SavedViewScope,
) {
  return {
    name: normalizeSavedViewName(value.name),
    definition: definitionForScope(value.definition, scope),
  }
}
function matchingMutation(
  record: SavedView,
  expected: { name: string; definition: SavedViewDefinition },
  revision: number,
) {
  if (
    record.revision !== revision ||
    record.name !== expected.name ||
    JSON.stringify(record.definition) !== JSON.stringify(expected.definition)
  )
    throw new SavedViewResponseError()
  return record
}
export async function createSavedView(
  value: {
    id: string
    name: string
    scope: SavedViewScope
    definition: SavedViewDefinition
  },
  signal?: AbortSignal,
) {
  const snapshot = namedSnapshot(value, value.scope)
  return matchingMutation(
    parseSavedView(
      await api<unknown>('/saved-views', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          id: requireId(value.id),
          ...snapshot,
          ...value.scope,
        }),
      }),
      value.scope,
      value.id,
    ),
    snapshot,
    1,
  )
}
export async function updateSavedView(
  record: SavedView,
  value: { name: string; definition: SavedViewDefinition },
  signal?: AbortSignal,
) {
  const snapshot = namedSnapshot(value, record)
  if (
    !integer(record.revision, 1) ||
    record.revision >= Number.MAX_SAFE_INTEGER
  )
    throw new SavedViewInputError('saved_view_revision_invalid')
  return matchingMutation(
    parseSavedView(
      await api<unknown>(`/saved-views/${requireId(record.id)}`, {
        method: 'PUT',
        signal,
        body: JSON.stringify({
          ...snapshot,
          expected_revision: record.revision,
        }),
      }),
      record,
      record.id,
    ),
    snapshot,
    record.revision + 1,
  )
}
export async function deleteSavedView(
  record: SavedView,
  signal?: AbortSignal,
): Promise<SavedViewDeleteReceipt> {
  if (
    !integer(record.revision, 1) ||
    record.revision >= Number.MAX_SAFE_INTEGER
  )
    throw new SavedViewInputError('saved_view_revision_invalid')
  const value = await api<unknown>(
    `/saved-views/${requireId(record.id)}/delete`,
    {
      method: 'POST',
      signal,
      body: JSON.stringify({ expected_revision: record.revision }),
    },
  )
  if (
    !object(value, ['id', 'deleted', 'revision', 'deleted_at']) ||
    value.id !== record.id ||
    value.deleted !== true ||
    value.revision !== record.revision + 1 ||
    !timestamp(value.deleted_at)
  )
    throw new SavedViewResponseError()
  return {
    id: record.id,
    deleted: true,
    revision: Number(value.revision),
    deleted_at: value.deleted_at,
  }
}
