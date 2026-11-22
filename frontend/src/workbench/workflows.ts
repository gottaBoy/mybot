import { api } from './api'
import {
  isTaskReadIdentifier,
  maxTaskQueryPage,
  stripQueryWhitespace,
} from './task-query'

export const workflowId = 'local-research' as const
const workflowPath = `/workflows/${workflowId}`

export type WorkflowStage = {
  id: 'planning' | 'research' | 'synthesis'
  role: 'coordinator' | 'researcher' | 'reviewer'
  model_id: string | null
  instructions: string
}
export type WorkflowDefinition = {
  schema_version: 1
  name: string
  harness: 'local-superagent'
  stages: WorkflowStage[]
  limits: {
    max_calls: number
    parallel: number
    minutes: number
    max_output_tokens: number
    research_tasks: number
  }
  review: 'human'
}
export type WorkflowVersion = {
  workflow_id: typeof workflowId
  version: number
  definition_hash: string
  definition: WorkflowDefinition
  created_at: string
}
export type WorkflowBundle = {
  schema_version: 1
  workflow_id: typeof workflowId
  revision: number
  definition: WorkflowDefinition
  definition_hash: string
  updated_at: string
  published: WorkflowVersion | null
}
export type WorkflowVersions = {
  schema_version: 1
  workflow_id: typeof workflowId
  items: WorkflowVersion[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
}
export type WorkflowImpact = {
  workflow_id: typeof workflowId
  revision: number
  definition_hash: string
  impact_hash: string
  model_ids: string[]
  active_runs: number
  historical_runs: number
  published_version: number | null
}
export type WorkflowSnapshot = {
  workflow_id: typeof workflowId
  version: number | null
  definition_hash: string
  definition: WorkflowDefinition
}
export type WorkflowSave = {
  request_id: string
  expected_revision: number
  definition: WorkflowDefinition
}
export type WorkflowPublish = {
  request_id: string
  expected_revision: number
  definition_hash: string
  impact_hash: string
  consent: true
}
export type WorkflowCommand =
  ({ kind: 'save' } & WorkflowSave) | ({ kind: 'publish' } & WorkflowPublish)
export type WorkflowReceipt =
  | {
      request_id: string
      kind: 'save'
      candidate_hash: string
      state: 'applied'
      result: WorkflowBundle
    }
  | {
      request_id: string
      kind: 'publish'
      candidate_hash: string
      state: 'applied'
      result: WorkflowVersion
    }
export type WorkflowRunConfig = {
  coordinator_model: string
  researcher_model: string
  reviewer_model: string
  max_calls: number
  parallel: number
  minutes: number
  max_output_tokens: number
}
export class WorkflowInputError extends Error {
  constructor() {
    super('workflow_input_invalid')
  }
}
export class WorkflowResponseError extends Error {
  constructor() {
    super('workflow_response_invalid')
  }
}
function exactObject(
  value: unknown,
  required: string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === required.length &&
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
const bounded = (value: unknown, minimum: number, maximum: number) =>
  integer(value, minimum) && value <= maximum
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
const validText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' &&
  [...value].length <= maximum &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.includes('T') &&
  Number.isFinite(Date.parse(value))
const stageIds = ['planning', 'research', 'synthesis'] as const
const stageRoles = ['coordinator', 'researcher', 'reviewer'] as const

export function parseWorkflowDefinition(
  value: unknown,
  published = false,
): WorkflowDefinition {
  if (
    !exactObject(value, [
      'schema_version',
      'name',
      'harness',
      'stages',
      'limits',
      'review',
    ]) ||
    value.schema_version !== 1 ||
    !validText(value.name, 80) ||
    !value.name ||
    stripQueryWhitespace(value.name) !== value.name ||
    value.harness !== 'local-superagent' ||
    value.review !== 'human' ||
    !Array.isArray(value.stages) ||
    value.stages.length !== 3 ||
    !exactObject(value.limits, [
      'max_calls',
      'parallel',
      'minutes',
      'max_output_tokens',
      'research_tasks',
    ]) ||
    !bounded(value.limits.max_calls, 3, 8) ||
    !bounded(value.limits.parallel, 1, 2) ||
    !bounded(value.limits.minutes, 1, 30) ||
    !bounded(value.limits.max_output_tokens, 256, 4096) ||
    !bounded(value.limits.research_tasks, 1, 2)
  )
    throw new WorkflowResponseError()
  const stages = value.stages.map((stage, index) => {
    if (
      !exactObject(stage, ['id', 'role', 'model_id', 'instructions']) ||
      stage.id !== stageIds[index] ||
      stage.role !== stageRoles[index] ||
      (stage.model_id === null
        ? published
        : !isTaskReadIdentifier(stage.model_id)) ||
      !validText(stage.instructions, 2000)
    )
      throw new WorkflowResponseError()
    return {
      id: stageIds[index],
      role: stageRoles[index],
      model_id: stage.model_id as string | null,
      instructions: stage.instructions,
    }
  })
  return {
    schema_version: 1,
    name: value.name,
    harness: 'local-superagent',
    stages,
    limits: {
      max_calls: value.limits.max_calls as number,
      parallel: value.limits.parallel as number,
      minutes: value.limits.minutes as number,
      max_output_tokens: value.limits.max_output_tokens as number,
      research_tasks: value.limits.research_tasks as number,
    },
    review: 'human',
  }
}

export function workflowConfig(value: WorkflowDefinition): WorkflowRunConfig {
  const definition = parseWorkflowDefinition(value, true)
  return {
    coordinator_model: definition.stages[0].model_id!,
    researcher_model: definition.stages[1].model_id!,
    reviewer_model: definition.stages[2].model_id!,
    max_calls: definition.limits.max_calls,
    parallel: definition.limits.parallel,
    minutes: definition.limits.minutes,
    max_output_tokens: definition.limits.max_output_tokens,
  }
}

export function parseWorkflowVersion(
  value: unknown,
  expectedVersion?: number,
): WorkflowVersion {
  if (
    !exactObject(value, [
      'workflow_id',
      'version',
      'definition_hash',
      'definition',
      'created_at',
    ]) ||
    value.workflow_id !== workflowId ||
    !integer(value.version, 1) ||
    (expectedVersion !== undefined && value.version !== expectedVersion) ||
    !hash(value.definition_hash) ||
    !timestamp(value.created_at)
  )
    throw new WorkflowResponseError()
  return {
    workflow_id: workflowId,
    version: value.version,
    definition_hash: value.definition_hash,
    definition: parseWorkflowDefinition(value.definition, true),
    created_at: value.created_at,
  }
}

export function parseWorkflowBundle(value: unknown): WorkflowBundle {
  if (
    !exactObject(value, [
      'schema_version',
      'workflow_id',
      'revision',
      'definition',
      'definition_hash',
      'updated_at',
      'published',
    ]) ||
    value.schema_version !== 1 ||
    value.workflow_id !== workflowId ||
    !integer(value.revision, 1) ||
    !hash(value.definition_hash) ||
    !timestamp(value.updated_at)
  )
    throw new WorkflowResponseError()
  return {
    schema_version: 1,
    workflow_id: workflowId,
    revision: value.revision,
    definition: parseWorkflowDefinition(value.definition),
    definition_hash: value.definition_hash,
    updated_at: value.updated_at,
    published:
      value.published === null ? null : parseWorkflowVersion(value.published),
  }
}

export function parseWorkflowSnapshot(value: unknown): WorkflowSnapshot {
  if (
    !exactObject(value, [
      'workflow_id',
      'version',
      'definition_hash',
      'definition',
    ]) ||
    value.workflow_id !== workflowId ||
    (value.version !== null && !integer(value.version, 1)) ||
    !hash(value.definition_hash)
  )
    throw new WorkflowResponseError()
  return {
    workflow_id: workflowId,
    version: value.version as number | null,
    definition_hash: value.definition_hash,
    definition: parseWorkflowDefinition(value.definition, true),
  }
}

export function parseWorkflowVersions(
  value: unknown,
  expectedPage?: number,
): WorkflowVersions {
  if (
    !exactObject(value, [
      'schema_version',
      'workflow_id',
      'items',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
    ]) ||
    value.schema_version !== 1 ||
    value.workflow_id !== workflowId ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    !bounded(value.requested_page, 1, maxTaskQueryPage) ||
    (expectedPage !== undefined && value.requested_page !== expectedPage) ||
    value.page_size !== 20 ||
    !integer(value.page, 1) ||
    !integer(value.total_pages, 1) ||
    typeof value.has_more !== 'boolean'
  )
    throw new WorkflowResponseError()
  const pages = Math.max(1, Math.ceil(value.total / 20))
  const page = Math.min(value.requested_page as number, pages)
  const count = Math.min(20, Math.max(0, value.total - (page - 1) * 20))
  if (
    value.total_pages !== pages ||
    value.page !== page ||
    value.has_more !== page < pages ||
    value.items.length !== count
  )
    throw new WorkflowResponseError()
  const items = value.items.map((item) => parseWorkflowVersion(item))
  if (
    items.some(
      (item, index) => index > 0 && item.version >= items[index - 1].version,
    )
  )
    throw new WorkflowResponseError()
  return {
    schema_version: 1,
    workflow_id: workflowId,
    items,
    total: value.total,
    requested_page: value.requested_page as number,
    page,
    page_size: 20,
    total_pages: pages,
    has_more: page < pages,
  }
}

export function parseWorkflowImpact(
  value: unknown,
  expected?: { revision: number; definition_hash: string },
): WorkflowImpact {
  if (
    !exactObject(value, [
      'workflow_id',
      'revision',
      'definition_hash',
      'impact_hash',
      'model_ids',
      'active_runs',
      'historical_runs',
      'published_version',
    ]) ||
    value.workflow_id !== workflowId ||
    !integer(value.revision, 1) ||
    !hash(value.definition_hash) ||
    !hash(value.impact_hash) ||
    !Array.isArray(value.model_ids) ||
    value.model_ids.length < 1 ||
    value.model_ids.length > 3 ||
    !value.model_ids.every(isTaskReadIdentifier) ||
    new Set(value.model_ids).size !== value.model_ids.length ||
    !integer(value.active_runs) ||
    !integer(value.historical_runs) ||
    (value.published_version !== null &&
      !integer(value.published_version, 1)) ||
    (expected !== undefined &&
      (value.revision !== expected.revision ||
        value.definition_hash !== expected.definition_hash))
  )
    throw new WorkflowResponseError()
  return {
    workflow_id: workflowId,
    revision: value.revision,
    definition_hash: value.definition_hash,
    impact_hash: value.impact_hash,
    model_ids: [...value.model_ids] as string[],
    active_runs: value.active_runs,
    historical_runs: value.historical_runs,
    published_version: value.published_version as number | null,
  }
}

export function parseWorkflowReceipt(
  value: unknown,
  expectedRequestId?: string,
): WorkflowReceipt {
  if (
    !exactObject(value, [
      'request_id',
      'kind',
      'candidate_hash',
      'state',
      'result',
    ]) ||
    !requestId(value.request_id) ||
    (expectedRequestId !== undefined &&
      value.request_id !== expectedRequestId) ||
    (value.kind !== 'save' && value.kind !== 'publish') ||
    !hash(value.candidate_hash) ||
    value.state !== 'applied'
  )
    throw new WorkflowResponseError()
  const shared = {
    request_id: value.request_id,
    candidate_hash: value.candidate_hash,
    state: 'applied' as const,
  }
  return value.kind === 'save'
    ? { ...shared, kind: 'save', result: parseWorkflowBundle(value.result) }
    : { ...shared, kind: 'publish', result: parseWorkflowVersion(value.result) }
}

function parseCommand(value: unknown): WorkflowCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new WorkflowInputError()
  const command = value as Record<string, unknown>
  if (
    !requestId(command.request_id) ||
    !bounded(command.expected_revision, 1, Number.MAX_SAFE_INTEGER - 1)
  )
    throw new WorkflowInputError()
  if (command.kind === 'save') {
    if (
      !exactObject(command, [
        'kind',
        'request_id',
        'expected_revision',
        'definition',
      ])
    )
      throw new WorkflowInputError()
    let definition: WorkflowDefinition
    try {
      definition = parseWorkflowDefinition(command.definition)
    } catch {
      throw new WorkflowInputError()
    }
    return {
      kind: 'save',
      request_id: command.request_id,
      expected_revision: command.expected_revision as number,
      definition,
    }
  }
  if (
    command.kind !== 'publish' ||
    !exactObject(command, [
      'kind',
      'request_id',
      'expected_revision',
      'definition_hash',
      'impact_hash',
      'consent',
    ]) ||
    !hash(command.definition_hash) ||
    !hash(command.impact_hash) ||
    command.consent !== true
  )
    throw new WorkflowInputError()
  return {
    kind: 'publish',
    request_id: command.request_id,
    expected_revision: command.expected_revision as number,
    definition_hash: command.definition_hash,
    impact_hash: command.impact_hash,
    consent: true,
  }
}

function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, (item as Record<string, unknown>)[key]]),
        )
      : item,
  )
}

export async function workflowCommandHash(value: WorkflowCommand) {
  const command = parseCommand(value)
  const { kind, request_id: _requestId, ...body } = command
  const bytes = new TextEncoder().encode(sortedJson([kind, body]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function assertWorkflowReceipt(
  value: unknown,
  candidate: WorkflowCommand,
): Promise<WorkflowReceipt> {
  const command = parseCommand(candidate)
  const receipt = parseWorkflowReceipt(value, command.request_id)
  if (
    receipt.kind !== command.kind ||
    receipt.candidate_hash !== (await workflowCommandHash(command))
  )
    throw new WorkflowResponseError()
  if (command.kind === 'save' && receipt.kind === 'save') {
    if (
      receipt.result.revision !== command.expected_revision + 1 ||
      JSON.stringify(receipt.result.definition) !==
        JSON.stringify(command.definition)
    )
      throw new WorkflowResponseError()
  } else if (command.kind === 'publish' && receipt.kind === 'publish') {
    if (receipt.result.definition_hash !== command.definition_hash)
      throw new WorkflowResponseError()
  } else {
    throw new WorkflowResponseError()
  }
  return receipt
}

async function request(
  path: string,
  options: RequestInit,
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    return await api<unknown>(path, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export async function fetchWorkflow(signal?: AbortSignal) {
  return parseWorkflowBundle(await request(workflowPath, {}, signal))
}
export async function fetchWorkflowVersions(
  page: number,
  signal?: AbortSignal,
) {
  if (!bounded(page, 1, maxTaskQueryPage)) throw new WorkflowInputError()
  return parseWorkflowVersions(
    await request(`${workflowPath}/versions?page=${page}`, {}, signal),
    page,
  )
}
export async function fetchWorkflowVersion(
  version: number,
  signal?: AbortSignal,
) {
  if (!integer(version, 1)) throw new WorkflowInputError()
  return parseWorkflowVersion(
    await request(`${workflowPath}/versions/${version}`, {}, signal),
    version,
  )
}
export async function fetchWorkflowImpact(
  candidate: { revision: number; definition_hash: string },
  signal?: AbortSignal,
) {
  if (
    !exactObject(candidate, ['revision', 'definition_hash']) ||
    !integer(candidate.revision, 1) ||
    !hash(candidate.definition_hash)
  )
    throw new WorkflowInputError()
  const sent = { ...candidate }
  const params = new URLSearchParams({
    revision: String(sent.revision),
    definition_hash: sent.definition_hash,
  })
  return parseWorkflowImpact(
    await request(`${workflowPath}/impact?${params}`, {}, signal),
    sent,
  )
}

export async function saveWorkflowDraft(
  value: WorkflowSave,
  signal?: AbortSignal,
) {
  if (!exactObject(value, ['request_id', 'expected_revision', 'definition']))
    throw new WorkflowInputError()
  const command = parseCommand({ ...value, kind: 'save' })
  const { kind: _kind, ...body } = command
  return assertWorkflowReceipt(
    await request(
      `${workflowPath}/draft`,
      { method: 'POST', body: JSON.stringify(body) },
      signal,
    ),
    command,
  )
}

export async function publishWorkflow(
  value: WorkflowPublish,
  signal?: AbortSignal,
) {
  if (
    !exactObject(value, [
      'request_id',
      'expected_revision',
      'definition_hash',
      'impact_hash',
      'consent',
    ])
  )
    throw new WorkflowInputError()
  const command = parseCommand({ ...value, kind: 'publish' })
  const { kind: _kind, ...body } = command
  return assertWorkflowReceipt(
    await request(
      `${workflowPath}/publish`,
      { method: 'POST', body: JSON.stringify(body) },
      signal,
    ),
    command,
  )
}

export async function fetchWorkflowOperation(
  id: string,
  signal?: AbortSignal,
  candidate?: WorkflowCommand,
) {
  if (!requestId(id)) throw new WorkflowInputError()
  const command = candidate === undefined ? undefined : parseCommand(candidate)
  if (command && command.request_id !== id) throw new WorkflowInputError()
  const value = await request(
    `${workflowPath}/operations/${encodeURIComponent(id)}`,
    {},
    signal,
  )
  return command
    ? assertWorkflowReceipt(value, command)
    : parseWorkflowReceipt(value, id)
}
