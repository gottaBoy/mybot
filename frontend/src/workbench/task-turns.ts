import { api, type Snapshot } from './api'
import {
  isTaskReadIdentifier,
  maxTaskQueryPage,
  stripQueryWhitespace,
} from './task-query'

export type TurnConfig = {
  coordinator_model: string
  researcher_model: string
  reviewer_model: string
  max_calls: number
  parallel: number
  minutes: number
  max_output_tokens: number
}
export type TurnSnapshot = Snapshot & {
  access: 'read_only'
  tools: []
  supplement: { id: string; content: string }
}
export type TaskTurn = {
  id: string
  task_id: string
  request_id: string
  content: string
  created_at: string
  state: 'saved' | 'prepared' | 'applied'
  run_id: string | null
  candidate: {
    candidate_hash: string
    config: TurnConfig
    snapshot: TurnSnapshot
  } | null
}
export type TaskTurnPage = {
  schema_version: 1
  unit: 'task_turns'
  task_id: string
  items: TaskTurn[]
  prepared: TaskTurn | null
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
  order: 'turns-created-v1'
}
export type TurnCreate = { request_id: string; content: string }
export type TurnPreparation = TurnConfig & { context_hash: string }
export type TurnExecution = { candidate_hash: string; consent: true }
export type TaskTurnReadError =
  'forbidden' | 'missing' | 'unavailable' | 'timeout' | 'invalid'

export class TaskTurnInputError extends Error {
  constructor() {
    super('task_turn_input_invalid')
  }
}
export class TaskTurnResponseError extends Error {
  constructor() {
    super('task_turn_response_invalid')
  }
}
const configKeys = [
  'coordinator_model',
  'researcher_model',
  'reviewer_model',
  'max_calls',
  'parallel',
  'minutes',
  'max_output_tokens',
]
const turnKeys = [
  'id',
  'task_id',
  'request_id',
  'content',
  'created_at',
  'state',
  'run_id',
  'candidate',
]
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
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const boundedInteger = (value: unknown, minimum: number, maximum: number) =>
  integer(value, minimum) && value <= maximum
const wellFormed = (value: string) =>
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && [...value].length <= maximum && wellFormed(value)
const content = (value: unknown): value is string =>
  text(value, 8000) && value.length > 0 && stripQueryWhitespace(value) === value
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.includes('T') &&
  Number.isFinite(Date.parse(value))

export function parseTurnConfig(value: unknown): TurnConfig {
  if (
    !exactObject(value, configKeys) ||
    !isTaskReadIdentifier(value.coordinator_model) ||
    !isTaskReadIdentifier(value.researcher_model) ||
    !isTaskReadIdentifier(value.reviewer_model) ||
    !boundedInteger(value.max_calls, 3, 8) ||
    !boundedInteger(value.parallel, 1, 2) ||
    !boundedInteger(value.minutes, 1, 30) ||
    !boundedInteger(value.max_output_tokens, 256, 4096)
  )
    throw new TaskTurnResponseError()
  return {
    coordinator_model: value.coordinator_model,
    researcher_model: value.researcher_model,
    reviewer_model: value.reviewer_model,
    max_calls: value.max_calls as number,
    parallel: value.parallel as number,
    minutes: value.minutes as number,
    max_output_tokens: value.max_output_tokens as number,
  }
}

export function parseTurnSnapshot(
  value: unknown,
  expected?: { id: string; content?: string },
): TurnSnapshot {
  if (
    !exactObject(value, [
      'context_hash',
      'goal',
      'acceptance',
      'notes',
      'text',
      'bytes',
      'evidence',
      'access',
      'tools',
      'supplement',
    ]) ||
    !hash(value.context_hash) ||
    !text(value.goal, 20_000) ||
    !value.goal ||
    !text(value.acceptance, 4000) ||
    !text(value.notes, 16_000) ||
    !text(value.text, 1_000_000) ||
    !boundedInteger(value.bytes, 0, 1_000_000) ||
    value.bytes !== new TextEncoder().encode(value.text).length ||
    !Array.isArray(value.evidence) ||
    value.evidence.length > 10 ||
    value.access !== 'read_only' ||
    !Array.isArray(value.tools) ||
    value.tools.length !== 0 ||
    !exactObject(value.supplement, ['id', 'content']) ||
    !isTaskReadIdentifier(value.supplement.id) ||
    !content(value.supplement.content) ||
    (expected !== undefined &&
      (value.supplement.id !== expected.id ||
        (expected.content !== undefined &&
          value.supplement.content !== expected.content)))
  )
    throw new TaskTurnResponseError()
  const paths = new Set<string>()
  let bytes = 0
  const evidence = value.evidence.map((item) => {
    if (
      !exactObject(item, ['path', 'bytes']) ||
      !text(item.path, 2000) ||
      !item.path ||
      paths.has(item.path) ||
      !boundedInteger(item.bytes, 0, 32_768)
    )
      throw new TaskTurnResponseError()
    paths.add(item.path)
    bytes += item.bytes as number
    if (bytes > 65_536) throw new TaskTurnResponseError()
    return { path: item.path, bytes: item.bytes as number }
  })
  return {
    context_hash: value.context_hash,
    goal: value.goal,
    acceptance: value.acceptance,
    notes: value.notes,
    text: value.text,
    bytes: value.bytes as number,
    evidence,
    access: 'read_only',
    tools: [],
    supplement: {
      id: value.supplement.id,
      content: value.supplement.content,
    },
  }
}

export function parseTaskTurn(
  value: unknown,
  expected?: {
    taskId: string
    turnId?: string
    requestId?: string
    content?: string
  },
): TaskTurn {
  if (
    !exactObject(value, turnKeys) ||
    !isTaskReadIdentifier(value.id) ||
    !isTaskReadIdentifier(value.task_id) ||
    !requestId(value.request_id) ||
    !content(value.content) ||
    !timestamp(value.created_at) ||
    !['saved', 'prepared', 'applied'].includes(value.state as string) ||
    (value.run_id !== null && !isTaskReadIdentifier(value.run_id)) ||
    (expected !== undefined &&
      (value.task_id !== expected.taskId ||
        (expected.turnId !== undefined && value.id !== expected.turnId) ||
        (expected.requestId !== undefined &&
          value.request_id !== expected.requestId) ||
        (expected.content !== undefined && value.content !== expected.content)))
  )
    throw new TaskTurnResponseError()
  let candidate: TaskTurn['candidate'] = null
  if (value.candidate !== null) {
    if (
      !exactObject(value.candidate, ['candidate_hash', 'config', 'snapshot']) ||
      !hash(value.candidate.candidate_hash)
    )
      throw new TaskTurnResponseError()
    candidate = {
      candidate_hash: value.candidate.candidate_hash,
      config: parseTurnConfig(value.candidate.config),
      snapshot: parseTurnSnapshot(value.candidate.snapshot, {
        id: value.id,
        content: value.content,
      }),
    }
  }
  if (
    (value.state === 'saved' &&
      (candidate !== null || value.run_id !== null)) ||
    (value.state === 'prepared' && (!candidate || value.run_id !== null)) ||
    (value.state === 'applied' && (!candidate || value.run_id === null))
  )
    throw new TaskTurnResponseError()
  return {
    id: value.id,
    task_id: value.task_id,
    request_id: value.request_id,
    content: value.content,
    created_at: value.created_at,
    state: value.state as TaskTurn['state'],
    run_id: value.run_id as string | null,
    candidate,
  }
}

export function assertTaskTurnReceipt(
  current: unknown,
  known: TaskTurn,
  pendingPreparation?: TurnPreparation,
): TaskTurn {
  const previous = parseTaskTurn(known)
  const receipt = parseTaskTurn(current, {
    taskId: previous.task_id,
    turnId: previous.id,
    requestId: previous.request_id,
    content: previous.content,
  })
  if (
    receipt.created_at !== previous.created_at ||
    (previous.candidate !== null &&
      JSON.stringify(receipt.candidate) !==
        JSON.stringify(previous.candidate)) ||
    (previous.state === 'applied' &&
      (receipt.state !== 'applied' || receipt.run_id !== previous.run_id))
  )
    throw new TaskTurnResponseError()
  if (pendingPreparation !== undefined) {
    if (
      !exactObject(pendingPreparation, [...configKeys, 'context_hash']) ||
      !hash(pendingPreparation.context_hash)
    )
      throw new TaskTurnResponseError()
    const sentConfig = parseTurnConfig(
      Object.fromEntries(
        configKeys.map((key) => [
          key,
          pendingPreparation[key as keyof TurnPreparation],
        ]),
      ),
    )
    if (
      receipt.candidate &&
      (JSON.stringify(receipt.candidate.config) !== JSON.stringify(sentConfig) ||
        receipt.candidate.snapshot.context_hash !==
          pendingPreparation.context_hash)
    )
      throw new TaskTurnResponseError()
  }
  return receipt
}

export function prepareTaskTurnsRequest(taskId: string, page: number) {
  if (
    !isTaskReadIdentifier(taskId) ||
    !boundedInteger(page, 1, maxTaskQueryPage)
  )
    throw new TaskTurnInputError()
  return {
    taskId,
    page,
    path: `/tasks/${encodeURIComponent(taskId)}/turns?page=${page}`,
  }
}

export function parseTaskTurnPage(
  value: unknown,
  expected?: { taskId: string; page: number },
): TaskTurnPage {
  if (
    !exactObject(value, [
      'schema_version',
      'unit',
      'task_id',
      'items',
      'prepared',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
      'order',
    ]) ||
    value.schema_version !== 1 ||
    value.unit !== 'task_turns' ||
    !isTaskReadIdentifier(value.task_id) ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    !boundedInteger(value.requested_page, 1, maxTaskQueryPage) ||
    !integer(value.page, 1) ||
    value.page_size !== 20 ||
    !integer(value.total_pages, 1) ||
    typeof value.has_more !== 'boolean' ||
    value.order !== 'turns-created-v1'
  )
    throw new TaskTurnResponseError()
  if (expected !== undefined) {
    const sent = prepareTaskTurnsRequest(expected.taskId, expected.page)
    if (value.task_id !== sent.taskId || value.requested_page !== sent.page)
      throw new TaskTurnResponseError()
  }
  const pages = Math.max(1, Math.ceil(value.total / 20))
  const page = Math.min(value.requested_page as number, pages)
  const length = Math.min(20, Math.max(0, value.total - (page - 1) * 20))
  if (
    value.total_pages !== pages ||
    value.page !== page ||
    value.has_more !== page < pages ||
    value.items.length !== length
  )
    throw new TaskTurnResponseError()
  const identity = { taskId: value.task_id }
  const items = value.items.map((item) => parseTaskTurn(item, identity))
  const ids = new Set(items.map((item) => item.id))
  const requests = new Set(items.map((item) => item.request_id))
  const runs = items.flatMap((item) => (item.run_id ? [item.run_id] : []))
  if (
    ids.size !== items.length ||
    requests.size !== items.length ||
    new Set(runs).size !== runs.length
  )
    throw new TaskTurnResponseError()
  const prepared =
    value.prepared === null ? null : parseTaskTurn(value.prepared, identity)
  const visiblePrepared = items.filter((item) => item.state === 'prepared')
  if (
    visiblePrepared.length > 1 ||
    (prepared !== null &&
      (prepared.state !== 'prepared' ||
        value.total < 1 ||
        (items.some((item) => item.id === prepared.id) &&
          JSON.stringify(items.find((item) => item.id === prepared.id)) !==
            JSON.stringify(prepared)) ||
        (items.some((item) => item.request_id === prepared.request_id) &&
          !items.some((item) => item.id === prepared.id)))) ||
    (visiblePrepared.length === 1 &&
      (!prepared || visiblePrepared[0].id !== prepared.id))
  )
    throw new TaskTurnResponseError()
  return {
    schema_version: 1,
    unit: 'task_turns',
    task_id: value.task_id,
    items,
    prepared,
    total: value.total,
    requested_page: value.requested_page as number,
    page,
    page_size: 20,
    total_pages: pages,
    has_more: page < pages,
    order: 'turns-created-v1',
  }
}

function turnPath(taskId: string, turnId?: string) {
  if (
    !isTaskReadIdentifier(taskId) ||
    (turnId !== undefined && !isTaskReadIdentifier(turnId))
  )
    throw new TaskTurnInputError()
  const base = `/tasks/${encodeURIComponent(taskId)}/turns`
  return turnId === undefined ? base : `${base}/${encodeURIComponent(turnId)}`
}

export async function fetchTaskTurns(
  taskId: string,
  page: number,
  signal?: AbortSignal,
) {
  const sent = prepareTaskTurnsRequest(taskId, page)
  return parseTaskTurnPage(await api<unknown>(sent.path, { signal }), sent)
}

// A timed-out mutation remains an unknown outcome; callers reconcile by GET.
async function mutation(path: string, body: unknown, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    return await api<unknown>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function saveTaskTurn(
  taskId: string,
  value: TurnCreate,
  signal?: AbortSignal,
) {
  const path = turnPath(taskId)
  if (
    !exactObject(value, ['request_id', 'content']) ||
    !requestId(value.request_id) ||
    typeof value.content !== 'string' ||
    !wellFormed(value.content)
  )
    throw new TaskTurnInputError()
  const normalized = stripQueryWhitespace(value.content)
  if (!content(normalized)) throw new TaskTurnInputError()
  const sent = { request_id: value.request_id, content: normalized }
  return parseTaskTurn(await mutation(path, sent, signal), {
    taskId,
    requestId: sent.request_id,
    content: sent.content,
  })
}

export async function fetchTaskTurn(
  taskId: string,
  turnId: string,
  signal?: AbortSignal,
) {
  return parseTaskTurn(
    await api<unknown>(turnPath(taskId, turnId), { signal }),
    {
      taskId,
      turnId,
    },
  )
}

export async function fetchTaskTurnRequest(
  taskId: string,
  id: string,
  signal?: AbortSignal,
) {
  const path = turnPath(taskId)
  if (!requestId(id)) throw new TaskTurnInputError()
  return parseTaskTurn(
    await api<unknown>(`${path}/requests/${encodeURIComponent(id)}`, {
      signal,
    }),
    { taskId, requestId: id },
  )
}

export async function previewTaskTurn(
  taskId: string,
  turnId: string,
  signal?: AbortSignal,
) {
  return parseTurnSnapshot(
    await mutation(`${turnPath(taskId, turnId)}/preview`, {}, signal),
    { id: turnId },
  )
}

export async function prepareTaskTurn(
  taskId: string,
  turnId: string,
  value: TurnPreparation,
  signal?: AbortSignal,
) {
  const path = `${turnPath(taskId, turnId)}/prepare`
  if (
    !exactObject(value, [...configKeys, 'context_hash']) ||
    !hash(value.context_hash)
  )
    throw new TaskTurnInputError()
  let config: TurnConfig
  try {
    config = parseTurnConfig(
      Object.fromEntries(
        configKeys.map((key) => [key, value[key as keyof TurnPreparation]]),
      ),
    )
  } catch {
    throw new TaskTurnInputError()
  }
  const sent = { ...config, context_hash: value.context_hash }
  const turn = parseTaskTurn(await mutation(path, sent, signal), {
    taskId,
    turnId,
  })
  if (
    turn.state === 'saved' ||
    !turn.candidate ||
    turn.candidate.snapshot.context_hash !== sent.context_hash ||
    JSON.stringify(turn.candidate.config) !== JSON.stringify(config)
  )
    throw new TaskTurnResponseError()
  return turn
}

export async function executeTaskTurn(
  taskId: string,
  turnId: string,
  value: TurnExecution,
  signal?: AbortSignal,
) {
  const path = `${turnPath(taskId, turnId)}/execute`
  if (
    !exactObject(value, ['candidate_hash', 'consent']) ||
    !hash(value.candidate_hash) ||
    value.consent !== true
  )
    throw new TaskTurnInputError()
  const sent = { candidate_hash: value.candidate_hash, consent: true }
  const turn = parseTaskTurn(await mutation(path, sent, signal), {
    taskId,
    turnId,
  })
  if (
    turn.state !== 'applied' ||
    turn.candidate?.candidate_hash !== sent.candidate_hash
  )
    throw new TaskTurnResponseError()
  return turn
}
