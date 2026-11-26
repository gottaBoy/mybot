import { api } from './api'
import {
  isTaskReadIdentifier,
  maxTaskQueryPage,
  stripQueryWhitespace,
} from './task-query'

export type Device = {
  id: string
  name: string
  task_id: string
  pairing_id: string
  claim_request_id: string
  scopes: ['task_read', 'message_save']
  created_at: string
  expires_at: string
  revoked_at: string | null
  revision: number
}
export type DevicePairing = {
  id: string
  task_id: string
  label: string
  created_at: string
  expires_at: string
  state: 'available' | 'claimed' | 'expired'
  device_id: string | null
}
export type DevicePage = {
  schema_version: 1
  unit: 'devices'
  items: Device[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
}
export type DeviceSession = { schema_version: 1; device: Device | null }
export type DevicePairInput = {
  request_id: string
  task_id: string
  label: string
  pair_secret: string
  consent: true
}
export type DeviceRevokeInput = {
  request_id: string
  expected_revision: number
  consent: true
}
export type DevicePairCommand = { kind: 'pair' } & DevicePairInput
export type DeviceRevokeCommand = {
  kind: 'revoke'
  device_id: string
} & DeviceRevokeInput
export type DeviceCommand = DevicePairCommand | DeviceRevokeCommand
export type DeviceReceipt =
  | {
      request_id: string
      kind: 'pair'
      candidate_hash: string
      state: 'applied'
      result: DevicePairing
    }
  | {
      request_id: string
      kind: 'revoke'
      candidate_hash: string
      state: 'applied'
      result: Device
    }
export type DeviceClaim = {
  request_id: string
  pairing_id: string
  pair_secret: string
  device_name: string
  device_secret: string
}
export type DeviceMessage = {
  id: string
  request_id: string
  content: string
  created_at: string
  state: 'saved' | 'prepared' | 'applied'
  run_id: string | null
}
export type DeviceMessageInput = { request_id: string; content: string }
export type PairedTask = {
  schema_version: 1
  device_id: string
  task: { id: string; title: string; goal: string; acceptance: string }
  latest_run: {
    id: string
    task_id: string
    status: string
    created_at: string
  } | null
  messages: { items: DeviceMessage[]; total: number }
  report: {
    id: string
    run_id: string
    title: string
    content: string
    decision: string
    truncated: boolean
  } | null
  cursor: number
  run_history?: boolean
  execution_delegation?: boolean
}
export type DeviceEvents = {
  schema_version: 1
  device_id: string
  task_id: string
  after: number
  items: Array<{
    seq: number
    id: string
    run_id: string | null
    kind: string
    created_at: string
  }>
  next_cursor: number
  watermark: number
  has_more: boolean
}
export type DeviceRun = NonNullable<PairedTask['latest_run']>
export type DeviceRunPage = {
  schema_version: 1
  device_id: string
  task_id: string
  items: DeviceRun[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
}
export type DeviceRunDetail = {
  schema_version: 1
  device_id: string
  task_id: string
  run: DeviceRun
  report: PairedTask['report']
}

export class DeviceInputError extends Error {
  constructor() {
    super('device_input_invalid')
  }
}
export class DeviceResponseError extends Error {
  constructor() {
    super('device_response_invalid')
  }
}
const own = (
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
const integer = (value: unknown, min = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  [...value].length <= max &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const named = (value: unknown, max = 80): value is string =>
  text(value, max) && !!value && stripQueryWhitespace(value) === value
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
const secret = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.includes('T') &&
  Number.isFinite(Date.parse(value))
const statuses = [
  'queued',
  'running',
  'pause_requested',
  'cancel_requested',
  'paused',
  'interrupted',
  'succeeded',
  'failed',
  'canceled',
]

export function parseDevice(value: unknown): Device {
  if (
    !own(value, [
      'id',
      'name',
      'task_id',
      'pairing_id',
      'claim_request_id',
      'scopes',
      'created_at',
      'expires_at',
      'revoked_at',
      'revision',
    ]) ||
    !isTaskReadIdentifier(value.id) ||
    !isTaskReadIdentifier(value.task_id) ||
    !named(value.name) ||
    !requestId(value.pairing_id) ||
    !requestId(value.claim_request_id) ||
    !Array.isArray(value.scopes) ||
    value.scopes.length !== 2 ||
    value.scopes[0] !== 'task_read' ||
    value.scopes[1] !== 'message_save' ||
    !timestamp(value.created_at) ||
    !timestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.created_at) ||
    (value.revoked_at !== null && !timestamp(value.revoked_at)) ||
    value.revision !== (value.revoked_at === null ? 1 : 2)
  )
    throw new DeviceResponseError()
  return {
    id: value.id,
    name: value.name,
    task_id: value.task_id,
    pairing_id: value.pairing_id,
    claim_request_id: value.claim_request_id,
    scopes: ['task_read', 'message_save'],
    created_at: value.created_at,
    expires_at: value.expires_at,
    revoked_at: value.revoked_at as string | null,
    revision: value.revision as number,
  }
}
export function parseDevicePairing(value: unknown): DevicePairing {
  if (
    !own(value, [
      'id',
      'task_id',
      'label',
      'created_at',
      'expires_at',
      'state',
      'device_id',
    ]) ||
    !requestId(value.id) ||
    !isTaskReadIdentifier(value.task_id) ||
    !named(value.label) ||
    !timestamp(value.created_at) ||
    !timestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.created_at) ||
    !['available', 'claimed', 'expired'].includes(value.state as string) ||
    (value.device_id !== null && !isTaskReadIdentifier(value.device_id)) ||
    (value.state === 'claimed'
      ? value.device_id === null
      : value.device_id !== null)
  )
    throw new DeviceResponseError()
  return {
    id: value.id,
    task_id: value.task_id,
    label: value.label,
    created_at: value.created_at,
    expires_at: value.expires_at,
    state: value.state as DevicePairing['state'],
    device_id: value.device_id as string | null,
  }
}
export function parseDevicePage(
  value: unknown,
  expectedPage?: number,
): DevicePage {
  if (
    !own(value, [
      'schema_version',
      'unit',
      'items',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
    ]) ||
    value.schema_version !== 1 ||
    value.unit !== 'devices' ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    !integer(value.requested_page, 1) ||
    value.requested_page > maxTaskQueryPage ||
    !integer(value.page, 1) ||
    value.page_size !== 20 ||
    !integer(value.total_pages, 1) ||
    typeof value.has_more !== 'boolean' ||
    (expectedPage !== undefined && value.requested_page !== expectedPage)
  )
    throw new DeviceResponseError()
  const pages = Math.max(1, Math.ceil(value.total / 20)),
    page = Math.min(value.requested_page, pages)
  const items = value.items.map(parseDevice)
  if (
    value.page !== page ||
    value.total_pages !== pages ||
    value.has_more !== page < pages ||
    items.length !== Math.min(20, Math.max(0, value.total - (page - 1) * 20)) ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new DeviceResponseError()
  return {
    schema_version: 1,
    unit: 'devices',
    items,
    total: value.total,
    requested_page: value.requested_page,
    page,
    page_size: 20,
    total_pages: pages,
    has_more: page < pages,
  }
}
export function parseDeviceSession(value: unknown): DeviceSession {
  if (!own(value, ['schema_version', 'device']) || value.schema_version !== 1)
    throw new DeviceResponseError()
  const device = value.device === null ? null : parseDevice(value.device)
  if (device?.revoked_at !== null && device !== null)
    throw new DeviceResponseError()
  return { schema_version: 1, device }
}
export function parseDeviceMessage(
  value: unknown,
  expected?: DeviceMessageInput,
): DeviceMessage {
  if (
    !own(value, [
      'id',
      'request_id',
      'content',
      'created_at',
      'state',
      'run_id',
    ]) ||
    !isTaskReadIdentifier(value.id) ||
    !requestId(value.request_id) ||
    !named(value.content, 8000) ||
    !timestamp(value.created_at) ||
    !['saved', 'prepared', 'applied'].includes(value.state as string) ||
    (value.run_id !== null && !isTaskReadIdentifier(value.run_id)) ||
    (value.state === 'applied'
      ? value.run_id === null
      : value.run_id !== null) ||
    (expected &&
      (value.request_id !== expected.request_id ||
        value.content !== expected.content))
  )
    throw new DeviceResponseError()
  return {
    id: value.id,
    request_id: value.request_id,
    content: value.content,
    created_at: value.created_at,
    state: value.state as DeviceMessage['state'],
    run_id: value.run_id as string | null,
  }
}
export function parsePairedTask(
  value: unknown,
  expected?: Pick<Device, 'id' | 'task_id'>,
): PairedTask {
  if (
    !own(value, [
      'schema_version',
      'device_id',
      'task',
      'latest_run',
      'messages',
      'report',
      'cursor',
      ...(value && typeof value === 'object' && 'run_history' in value
        ? ['run_history']
        : []),
      ...(value && typeof value === 'object' && 'execution_delegation' in value
        ? ['execution_delegation']
        : []),
    ]) ||
    value.schema_version !== 1 ||
    !isTaskReadIdentifier(value.device_id) ||
    !own(value.task, ['id', 'title', 'goal', 'acceptance']) ||
    !isTaskReadIdentifier(value.task.id) ||
    !named(value.task.title, 160) ||
    !text(value.task.goal, 8000) ||
    !value.task.goal ||
    !text(value.task.acceptance, 4000) ||
    !own(value.messages, ['items', 'total']) ||
    !Array.isArray(value.messages.items) ||
    !integer(value.messages.total) ||
    !integer(value.cursor) ||
    ('run_history' in value && typeof value.run_history !== 'boolean') ||
    ('execution_delegation' in value &&
      typeof value.execution_delegation !== 'boolean') ||
    (expected &&
      (value.device_id !== expected.id || value.task.id !== expected.task_id))
  )
    throw new DeviceResponseError()
  let latest: PairedTask['latest_run'] = null
  if (value.latest_run !== null) {
    const run = value.latest_run
    if (
      !own(run, ['id', 'task_id', 'status', 'created_at']) ||
      !isTaskReadIdentifier(run.id) ||
      run.task_id !== value.task.id ||
      !statuses.includes(run.status as string) ||
      !timestamp(run.created_at)
    )
      throw new DeviceResponseError()
    latest = {
      id: run.id,
      task_id: run.task_id as string,
      status: run.status as string,
      created_at: run.created_at,
    }
  }
  const items = value.messages.items.map((item) => parseDeviceMessage(item))
  if (
    items.length !== Math.min(20, value.messages.total) ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.request_id)).size !== items.length
  )
    throw new DeviceResponseError()
  let report: PairedTask['report'] = null
  if (value.report !== null) {
    const item = value.report
    if (
      !own(item, [
        'id',
        'run_id',
        'title',
        'content',
        'decision',
        'truncated',
      ]) ||
      !isTaskReadIdentifier(item.id) ||
      !latest ||
      item.run_id !== latest.id ||
      !named(item.title, 160) ||
      !text(item.content, 20000) ||
      !['pending', 'accepted', 'changes_requested'].includes(
        item.decision as string,
      ) ||
      typeof item.truncated !== 'boolean'
    )
      throw new DeviceResponseError()
    report = {
      id: item.id,
      run_id: item.run_id as string,
      title: item.title,
      content: item.content,
      decision: item.decision as string,
      truncated: item.truncated,
    }
  }
  return {
    schema_version: 1,
    device_id: value.device_id,
    task: {
      id: value.task.id,
      title: value.task.title,
      goal: value.task.goal,
      acceptance: value.task.acceptance,
    },
    latest_run: latest,
    messages: { items, total: value.messages.total },
    report,
    cursor: value.cursor,
    ...('run_history' in value
      ? { run_history: value.run_history as boolean }
      : {}),
    ...('execution_delegation' in value
      ? { execution_delegation: value.execution_delegation as boolean }
      : {}),
  }
}
export function parseDeviceEvents(
  value: unknown,
  expected: Pick<Device, 'id' | 'task_id'> & { after: number },
): DeviceEvents {
  if (
    !own(value, [
      'schema_version',
      'device_id',
      'task_id',
      'after',
      'items',
      'next_cursor',
      'watermark',
      'has_more',
    ]) ||
    value.schema_version !== 1 ||
    value.device_id !== expected.id ||
    value.task_id !== expected.task_id ||
    value.after !== expected.after ||
    !integer(value.after) ||
    !integer(value.next_cursor) ||
    !integer(value.watermark) ||
    value.after > value.watermark ||
    value.next_cursor > value.watermark ||
    typeof value.has_more !== 'boolean' ||
    !Array.isArray(value.items) ||
    value.items.length > 50
  )
    throw new DeviceResponseError()
  let seq = value.after
  const items = value.items.map((item) => {
    if (
      !own(item, ['seq', 'id', 'run_id', 'kind', 'created_at']) ||
      !integer(item.seq, seq + 1) ||
      item.seq > (value.watermark as number) ||
      !isTaskReadIdentifier(item.id) ||
      (item.run_id !== null && !isTaskReadIdentifier(item.run_id)) ||
      !named(item.kind, 100) ||
      !timestamp(item.created_at)
    )
      throw new DeviceResponseError()
    seq = item.seq
    return {
      seq: item.seq,
      id: item.id,
      run_id: item.run_id as string | null,
      kind: item.kind,
      created_at: item.created_at,
    }
  })
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    value.next_cursor !== (value.has_more ? seq : value.watermark) ||
    (value.has_more && (items.length !== 50 || seq >= value.watermark)) ||
    value.next_cursor < value.after ||
    (!items.length && value.next_cursor !== value.after)
  )
    throw new DeviceResponseError()
  return {
    schema_version: 1,
    device_id: expected.id,
    task_id: expected.task_id,
    after: expected.after,
    items,
    next_cursor: value.next_cursor,
    watermark: value.watermark,
    has_more: value.has_more,
  }
}

export function makePairSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
export function parsePairCode(code: string) {
  const values = code.trim().split('.')
  if (values.length !== 2 || !requestId(values[0]) || !secret(values[1]))
    throw new DeviceInputError()
  return { pairing_id: values[0], pair_secret: values[1] }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`
  return JSON.stringify(value)
}
async function sha(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
function validateCommand(value: DeviceCommand): DeviceCommand {
  if (value.kind === 'pair') {
    if (
      !own(value, [
        'kind',
        'request_id',
        'task_id',
        'label',
        'pair_secret',
        'consent',
      ]) ||
      !requestId(value.request_id) ||
      !isTaskReadIdentifier(value.task_id) ||
      !named(value.label) ||
      !secret(value.pair_secret) ||
      value.consent !== true
    )
      throw new DeviceInputError()
  } else if (value.kind === 'revoke') {
    if (
      !own(value, [
        'kind',
        'request_id',
        'device_id',
        'expected_revision',
        'consent',
      ]) ||
      !requestId(value.request_id) ||
      !isTaskReadIdentifier(value.device_id) ||
      value.expected_revision !== 1 ||
      value.consent !== true
    )
      throw new DeviceInputError()
  } else throw new DeviceInputError()
  return { ...value }
}
export async function deviceCommandHash(value: DeviceCommand) {
  const command = validateCommand(value)
  return sha(
    canonical(
      command.kind === 'pair'
        ? { ...command, pair_secret: await sha(command.pair_secret) }
        : command,
    ),
  )
}
export function parseDeviceReceipt(value: unknown): DeviceReceipt {
  if (
    !own(value, ['request_id', 'kind', 'candidate_hash', 'state', 'result']) ||
    !requestId(value.request_id) ||
    !['pair', 'revoke'].includes(value.kind as string) ||
    !hash(value.candidate_hash) ||
    value.state !== 'applied'
  )
    throw new DeviceResponseError()
  const common = {
    request_id: value.request_id,
    candidate_hash: value.candidate_hash,
    state: 'applied' as const,
  }
  return value.kind === 'pair'
    ? { ...common, kind: 'pair', result: parseDevicePairing(value.result) }
    : { ...common, kind: 'revoke', result: parseDevice(value.result) }
}
export async function assertDeviceReceipt(
  value: unknown,
  command: DeviceCommand,
): Promise<DeviceReceipt> {
  const sent = validateCommand(command),
    receipt = parseDeviceReceipt(value)
  if (
    receipt.request_id !== sent.request_id ||
    receipt.kind !== sent.kind ||
    receipt.candidate_hash !== (await deviceCommandHash(sent))
  )
    throw new DeviceResponseError()
  if (receipt.kind === 'pair' && sent.kind === 'pair') {
    if (
      receipt.result.id !== sent.request_id ||
      receipt.result.task_id !== sent.task_id ||
      receipt.result.label !== sent.label
    )
      throw new DeviceResponseError()
  } else if (receipt.kind === 'revoke' && sent.kind === 'revoke') {
    if (
      receipt.result.id !== sent.device_id ||
      receipt.result.revoked_at === null ||
      receipt.result.revision !== sent.expected_revision + 1
    )
      throw new DeviceResponseError()
  } else throw new DeviceResponseError()
  return receipt
}
async function request(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
) {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    controller.signal.throwIfAborted()
    const result = await api<unknown>(path, {
      ...options,
      signal: controller.signal,
    })
    controller.signal.throwIfAborted()
    return result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
const post = (
  path: string,
  body: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
) =>
  request(path, { method: 'POST', body: JSON.stringify(body), headers }, signal)
export async function fetchDevices(page = 1, signal?: AbortSignal) {
  if (!integer(page, 1) || page > maxTaskQueryPage) throw new DeviceInputError()
  return parseDevicePage(
    await request(`/devices?page=${page}`, {}, signal),
    page,
  )
}
export async function createDevicePairing(
  value: DevicePairInput,
  signal?: AbortSignal,
) {
  if (!own(value, ['request_id', 'task_id', 'label', 'pair_secret', 'consent']))
    throw new DeviceInputError()
  const command = validateCommand({
    kind: 'pair',
    ...value,
  }) as DevicePairCommand
  const { kind: _kind, ...body } = command
  return assertDeviceReceipt(
    await post('/devices/pairings', body, signal),
    command,
  )
}
export async function revokeDevice(
  deviceId: string,
  value: DeviceRevokeInput,
  signal?: AbortSignal,
) {
  if (!own(value, ['request_id', 'expected_revision', 'consent']))
    throw new DeviceInputError()
  const command = validateCommand({
    kind: 'revoke',
    device_id: deviceId,
    ...value,
  }) as DeviceRevokeCommand
  const { kind: _kind, device_id: _id, ...body } = command
  return assertDeviceReceipt(
    await post(`/devices/${encodeURIComponent(deviceId)}/revoke`, body, signal),
    command,
  )
}
export async function fetchDevicePairing(id: string, signal?: AbortSignal) {
  if (!requestId(id)) throw new DeviceInputError()
  const result = parseDevicePairing(
    await request(`/devices/pairings/${encodeURIComponent(id)}`, {}, signal),
  )
  if (result.id !== id) throw new DeviceResponseError()
  return result
}
export async function fetchDeviceOperation(
  id: string,
  signal?: AbortSignal,
  command?: DeviceCommand,
) {
  if (!requestId(id) || (command && command.request_id !== id))
    throw new DeviceInputError()
  const result = await request(
    `/devices/operations/${encodeURIComponent(id)}`,
    {},
    signal,
  )
  const receipt = command
    ? await assertDeviceReceipt(result, command)
    : parseDeviceReceipt(result)
  if (receipt.request_id !== id) throw new DeviceResponseError()
  return receipt
}
export async function fetchDeviceSession(signal?: AbortSignal) {
  return parseDeviceSession(await request('/device/session', {}, signal))
}
export function assertDeviceClaimSession(
  value: Device | null,
  claim: DeviceClaim,
): Device {
  if (
    !value ||
    value.claim_request_id !== claim.request_id ||
    value.pairing_id !== claim.pairing_id ||
    value.name !== claim.device_name ||
    value.revoked_at !== null
  )
    throw new DeviceResponseError()
  return value
}
export async function claimDevice(value: DeviceClaim, signal?: AbortSignal) {
  if (
    !own(value, [
      'request_id',
      'pairing_id',
      'pair_secret',
      'device_name',
      'device_secret',
    ]) ||
    !requestId(value.request_id) ||
    !requestId(value.pairing_id) ||
    !secret(value.pair_secret) ||
    !secret(value.device_secret) ||
    !named(value.device_name)
  )
    throw new DeviceInputError()
  const sent = { ...value }
  return assertDeviceClaimSession(
    parseDevice(await post('/device/claim', sent, signal)),
    sent,
  )
}
export async function fetchPairedTask(
  device: Pick<Device, 'id' | 'task_id'>,
  signal?: AbortSignal,
) {
  return parsePairedTask(await request('/device/task', {}, signal), device)
}
export async function fetchDeviceEvents(
  device: Pick<Device, 'id' | 'task_id'>,
  after: number,
  signal?: AbortSignal,
) {
  if (!integer(after)) throw new DeviceInputError()
  return parseDeviceEvents(
    await request(`/device/events?after=${after}`, {}, signal),
    { ...device, after },
  )
}
export async function saveDeviceMessage(
  value: DeviceMessageInput,
  deviceId: string,
  signal?: AbortSignal,
) {
  if (
    !own(value, ['request_id', 'content']) ||
    !requestId(value.request_id) ||
    !text(value.content, 8000) ||
    !named(value.content, 8000) ||
    !isTaskReadIdentifier(deviceId)
  )
    throw new DeviceInputError()
  const sent = { ...value }
  return parseDeviceMessage(
    await post('/device/messages', sent, signal, {
      'X-Workbench-Device-Id': deviceId,
    }),
    sent,
  )
}
export async function fetchDeviceMessage(
  id: string,
  deviceId: string,
  signal?: AbortSignal,
  expectedContent?: string,
) {
  if (!requestId(id) || !isTaskReadIdentifier(deviceId))
    throw new DeviceInputError()
  const message = parseDeviceMessage(
    await request(
      `/device/messages/requests/${encodeURIComponent(id)}`,
      { headers: { 'X-Workbench-Device-Id': deviceId } },
      signal,
    ),
  )
  if (
    message.request_id !== id ||
    (expectedContent !== undefined && message.content !== expectedContent)
  )
    throw new DeviceResponseError()
  return message
}
export async function logoutDevice(signal?: AbortSignal) {
  const result = await post('/device/logout', {}, signal)
  if (!own(result, ['ok']) || result.ok !== true)
    throw new DeviceResponseError()
}

export type ExecutionSummary = {
  turn_id: string
  turn_request_id: string
  candidate_hash: string
  content: string
  context_hash: string
  resources: {
    max_calls: number
    parallel: number
    minutes: number
    max_output_tokens: number
  }
  models: Array<{
    role: string
    id: string
    name: string
    model: string
    kind: string
  }>
  source_count: number
  source_bytes: number
  workflow_version: number | null
  artifact_count?: number
}
export type ExecutionGrant = ExecutionSummary & {
  id: string
  device_id: string
  task_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  revision: 1 | 2
  state: 'authorized' | 'applied' | 'revoked' | 'expired' | 'superseded'
  run_id: string | null
}
export type OwnerExecution = {
  schema_version: 1
  device: Device
  prepared: ExecutionSummary | null
  grant: ExecutionGrant | null
}
export type ScopedExecution = {
  schema_version: 1
  device_id: string
  task_id: string
  grant: ExecutionGrant | null
}
export type ExecutionCommand =
  | {
      kind: 'grant'
      device_id: string
      request_id: string
      turn_id: string
      candidate_hash: string
      expected_device_revision: 1
      consent: true
    }
  | {
      kind: 'revoke'
      device_id: string
      grant_id: string
      request_id: string
      expected_revision: 1
      consent: true
    }
export type ExecutionReceipt = {
  request_id: string
  kind: 'grant' | 'revoke'
  candidate_hash: string
  state: 'applied'
  grant: ExecutionGrant
}
const summaryKeys = [
  'turn_id',
  'turn_request_id',
  'candidate_hash',
  'content',
  'context_hash',
  'resources',
  'models',
  'source_count',
  'source_bytes',
  'workflow_version',
]
function executionSummaryKeys(value: unknown) {
  return [
    ...summaryKeys,
    ...(value &&
    typeof value === 'object' &&
    Object.prototype.hasOwnProperty.call(value, 'artifact_count')
      ? ['artifact_count']
      : []),
  ]
}
function parseExecutionSummary(value: unknown): ExecutionSummary {
  if (
    !own(value, executionSummaryKeys(value)) ||
    !isTaskReadIdentifier(value.turn_id) ||
    !requestId(value.turn_request_id) ||
    !hash(value.candidate_hash) ||
    !hash(value.context_hash) ||
    !named(value.content, 8000) ||
    !own(value.resources, [
      'max_calls',
      'parallel',
      'minutes',
      'max_output_tokens',
    ]) ||
    !integer(value.resources.max_calls, 3) ||
    value.resources.max_calls > 8 ||
    !integer(value.resources.parallel, 1) ||
    value.resources.parallel > 2 ||
    !integer(value.resources.minutes, 1) ||
    value.resources.minutes > 30 ||
    !integer(value.resources.max_output_tokens, 256) ||
    value.resources.max_output_tokens > 4096 ||
    !integer(value.source_count) ||
    !integer(value.source_bytes) ||
    (Object.prototype.hasOwnProperty.call(value, 'artifact_count') &&
      (!integer(value.artifact_count, 1) || value.artifact_count > 3)) ||
    (value.workflow_version !== null && !integer(value.workflow_version, 1)) ||
    !Array.isArray(value.models) ||
    value.models.length !== 3
  )
    throw new DeviceResponseError()
  for (const [i, model] of value.models.entries())
    if (
      !own(model, ['role', 'id', 'name', 'model', 'kind']) ||
      model.role !==
        ['coordinator_model', 'researcher_model', 'reviewer_model'][i] ||
      !isTaskReadIdentifier(model.id) ||
      !named(model.name, 80) ||
      !named(model.model, 150) ||
      !['chat_completions', 'codex_cli', 'pi_sdk'].includes(model.kind as string)
    )
      throw new DeviceResponseError()
  return value as unknown as ExecutionSummary
}
export function parseExecutionGrant(
  value: unknown,
  device: Pick<Device, 'id' | 'task_id'>,
): ExecutionGrant {
  if (
    !own(value, [
      ...executionSummaryKeys(value),
      'id',
      'device_id',
      'task_id',
      'created_at',
      'expires_at',
      'revoked_at',
      'revision',
      'state',
      'run_id',
    ]) ||
    !requestId(value.id) ||
    value.device_id !== device.id ||
    value.task_id !== device.task_id ||
    !timestamp(value.created_at) ||
    !timestamp(value.expires_at) ||
    Date.parse(value.expires_at) <= Date.parse(value.created_at) ||
    Date.parse(value.expires_at) - Date.parse(value.created_at) > 600000 ||
    (value.revoked_at !== null && !timestamp(value.revoked_at)) ||
    value.revision !== (value.revoked_at === null ? 1 : 2) ||
    !['authorized', 'applied', 'revoked', 'expired', 'superseded'].includes(
      value.state as string,
    ) ||
    (value.state === 'applied'
      ? !isTaskReadIdentifier(value.run_id)
      : value.run_id !== null) ||
    (value.state === 'revoked') !== (value.revoked_at !== null)
  )
    throw new DeviceResponseError()
  parseExecutionSummary(
    Object.fromEntries(
      executionSummaryKeys(value).map((key) => [key, value[key]]),
    ),
  )
  return value as unknown as ExecutionGrant
}
export function parseOwnerExecution(
  value: unknown,
  deviceId: string,
): OwnerExecution {
  if (
    !own(value, ['schema_version', 'device', 'prepared', 'grant']) ||
    value.schema_version !== 1
  )
    throw new DeviceResponseError()
  const device = parseDevice(value.device)
  if (device.id !== deviceId) throw new DeviceResponseError()
  return {
    schema_version: 1,
    device,
    prepared:
      value.prepared === null ? null : parseExecutionSummary(value.prepared),
    grant:
      value.grant === null ? null : parseExecutionGrant(value.grant, device),
  }
}
export function parseScopedExecution(
  value: unknown,
  device: Pick<Device, 'id' | 'task_id'>,
  grantId?: string,
): ScopedExecution {
  if (
    !own(value, ['schema_version', 'device_id', 'task_id', 'grant']) ||
    value.schema_version !== 1 ||
    value.device_id !== device.id ||
    value.task_id !== device.task_id ||
    (grantId && value.grant === null)
  )
    throw new DeviceResponseError()
  const grant =
    value.grant === null ? null : parseExecutionGrant(value.grant, device)
  if (grantId && grant?.id !== grantId) throw new DeviceResponseError()
  return {
    schema_version: 1,
    device_id: device.id,
    task_id: device.task_id,
    grant,
  }
}
function validateExecutionCommand(command: ExecutionCommand) {
  if (
    !own(
      command,
      command.kind === 'grant'
        ? [
            'kind',
            'device_id',
            'request_id',
            'turn_id',
            'candidate_hash',
            'expected_device_revision',
            'consent',
          ]
        : [
            'kind',
            'device_id',
            'grant_id',
            'request_id',
            'expected_revision',
            'consent',
          ],
    ) ||
    !isTaskReadIdentifier(command.device_id) ||
    !requestId(command.request_id) ||
    command.consent !== true ||
    (command.kind === 'grant'
      ? !isTaskReadIdentifier(command.turn_id) ||
        !hash(command.candidate_hash) ||
        command.expected_device_revision !== 1
      : command.kind !== 'revoke' ||
        !requestId(command.grant_id) ||
        command.expected_revision !== 1)
  )
    throw new DeviceInputError()
}
export async function executionCommandHash(command: ExecutionCommand) {
  validateExecutionCommand(command)
  return sha(canonical(command))
}
export async function parseExecutionReceipt(
  value: unknown,
  deviceId: string,
  operationId: string,
  command?: ExecutionCommand,
): Promise<ExecutionReceipt> {
  if (
    !own(value, ['request_id', 'kind', 'candidate_hash', 'state', 'grant']) ||
    value.request_id !== operationId ||
    !['grant', 'revoke'].includes(value.kind as string) ||
    !hash(value.candidate_hash) ||
    value.state !== 'applied' ||
    !value.grant ||
    typeof value.grant !== 'object' ||
    !('task_id' in value.grant) ||
    !isTaskReadIdentifier(value.grant.task_id)
  )
    throw new DeviceResponseError()
  const grant = parseExecutionGrant(value.grant, {
    id: deviceId,
    task_id: value.grant.task_id,
  })
  if (
    (value.kind === 'grant' &&
      (grant.id !== operationId || grant.state !== 'authorized')) ||
    (value.kind === 'revoke' && grant.state !== 'revoked')
  )
    throw new DeviceResponseError()
  if (
    command &&
    (command.device_id !== deviceId ||
      command.request_id !== operationId ||
      command.kind !== value.kind ||
      value.candidate_hash !== (await executionCommandHash(command)) ||
      (command.kind === 'grant'
        ? grant.turn_id !== command.turn_id ||
          grant.candidate_hash !== command.candidate_hash
        : grant.id !== command.grant_id ||
          grant.revision !== command.expected_revision + 1))
  )
    throw new DeviceResponseError()
  return { ...value, grant } as ExecutionReceipt
}
export async function fetchOwnerExecution(
  deviceId: string,
  signal?: AbortSignal,
) {
  if (!isTaskReadIdentifier(deviceId)) throw new DeviceInputError()
  return parseOwnerExecution(
    await request(
      `/devices/${encodeURIComponent(deviceId)}/execution`,
      {},
      signal,
    ),
    deviceId,
  )
}
export async function sendExecutionCommand(
  command: ExecutionCommand,
  signal?: AbortSignal,
) {
  validateExecutionCommand(command)
  const { kind, device_id, ...rest } = command
  const grant_id = kind === 'revoke' ? command.grant_id : undefined
  const body =
    kind === 'revoke'
      ? {
          request_id: command.request_id,
          expected_revision: command.expected_revision,
          consent: true,
        }
      : rest
  const path = `/devices/${encodeURIComponent(device_id)}/execution-grants${grant_id ? `/${encodeURIComponent(grant_id)}/revoke` : ''}`
  return parseExecutionReceipt(
    await post(path, body, signal),
    device_id,
    command.request_id,
    command,
  )
}
export async function fetchExecutionOperation(
  deviceId: string,
  operationId: string,
  signal?: AbortSignal,
  command?: ExecutionCommand,
) {
  if (!isTaskReadIdentifier(deviceId) || !requestId(operationId))
    throw new DeviceInputError()
  return parseExecutionReceipt(
    await request(
      `/devices/${encodeURIComponent(deviceId)}/execution-operations/${encodeURIComponent(operationId)}`,
      {},
      signal,
    ),
    deviceId,
    operationId,
    command,
  )
}
export async function fetchScopedExecution(
  device: Pick<Device, 'id' | 'task_id'>,
  grantId?: string,
  signal?: AbortSignal,
) {
  if (
    !isTaskReadIdentifier(device.id) ||
    !isTaskReadIdentifier(device.task_id) ||
    (grantId !== undefined && !requestId(grantId))
  )
    throw new DeviceInputError()
  return parseScopedExecution(
    await request(
      `/device/execution-grants${grantId ? `/${encodeURIComponent(grantId)}` : ''}`,
      {
        headers: { 'X-Workbench-Device-Id': device.id },
      },
      signal,
    ),
    device,
    grantId,
  )
}
export async function executeDeviceGrant(
  device: Pick<Device, 'id' | 'task_id'>,
  grant: ExecutionGrant,
  signal?: AbortSignal,
) {
  parseExecutionGrant(grant, device)
  const result = parseScopedExecution(
    await post(
      `/device/execution-grants/${encodeURIComponent(grant.id)}/execute`,
      {
        candidate_hash: grant.candidate_hash,
        consent: true,
      },
      signal,
      { 'X-Workbench-Device-Id': device.id },
    ),
    device,
    grant.id,
  )
  if (
    result.grant?.state !== 'applied' ||
    executionGrantIdentity(result.grant) !== executionGrantIdentity(grant)
  )
    throw new DeviceResponseError()
  return result
}
export function executionGrantIdentity(grant: ExecutionSummary) {
  return canonical(
    Object.fromEntries(
      executionSummaryKeys(grant).map((key) => [
        key,
        grant[key as keyof ExecutionSummary],
      ]),
    ),
  )
}

function parseScopedRun(value: unknown, taskId: string): DeviceRun {
  if (
    !own(value, ['id', 'task_id', 'status', 'created_at']) ||
    !isTaskReadIdentifier(value.id) ||
    value.task_id !== taskId ||
    !statuses.includes(value.status as string) ||
    !timestamp(value.created_at)
  )
    throw new DeviceResponseError()
  return {
    id: value.id,
    task_id: taskId,
    status: value.status as string,
    created_at: value.created_at,
  }
}
export function parseDeviceRunPage(
  value: unknown,
  device: Pick<Device, 'id' | 'task_id'>,
  requestedPage: number,
): DeviceRunPage {
  if (
    !own(value, [
      'schema_version',
      'device_id',
      'task_id',
      'items',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
    ]) ||
    value.schema_version !== 1 ||
    value.device_id !== device.id ||
    value.task_id !== device.task_id ||
    !Array.isArray(value.items) ||
    !integer(value.total) ||
    !integer(value.total_pages, 1) ||
    value.total_pages !== Math.max(1, Math.ceil(value.total / 20)) ||
    value.requested_page !== requestedPage ||
    !integer(requestedPage, 1) ||
    requestedPage > maxTaskQueryPage ||
    value.page_size !== 20 ||
    value.page !== Math.min(requestedPage, value.total_pages) ||
    value.has_more !== value.page < value.total_pages
  )
    throw new DeviceResponseError()
  const items = value.items.map((item) => parseScopedRun(item, device.task_id))
  if (
    items.length !==
      Math.min(20, value.total - ((value.page as number) - 1) * 20) ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new DeviceResponseError()
  return { ...value, items } as DeviceRunPage
}
export function parseDeviceRunDetail(
  value: unknown,
  device: Pick<Device, 'id' | 'task_id'>,
  runId: string,
): DeviceRunDetail {
  if (
    !own(value, ['schema_version', 'device_id', 'task_id', 'run', 'report']) ||
    value.schema_version !== 1 ||
    value.device_id !== device.id ||
    value.task_id !== device.task_id
  )
    throw new DeviceResponseError()
  const run = parseScopedRun(value.run, device.task_id)
  if (run.id !== runId) throw new DeviceResponseError()
  let report: PairedTask['report'] = null
  const item = value.report
  if (item !== null) {
    if (
      !own(item, [
        'id',
        'run_id',
        'title',
        'content',
        'decision',
        'truncated',
      ]) ||
      !isTaskReadIdentifier(item.id) ||
      item.run_id !== runId ||
      !named(item.title, 160) ||
      !text(item.content, 20000) ||
      !['pending', 'accepted', 'changes_requested'].includes(
        item.decision as string,
      ) ||
      typeof item.truncated !== 'boolean'
    )
      throw new DeviceResponseError()
    report = { ...item } as NonNullable<PairedTask['report']>
  }
  return {
    schema_version: 1,
    device_id: device.id,
    task_id: device.task_id,
    run,
    report,
  }
}
export async function fetchDeviceRuns(
  device: Pick<Device, 'id' | 'task_id'>,
  page: number,
  signal?: AbortSignal,
) {
  if (
    !isTaskReadIdentifier(device.id) ||
    !isTaskReadIdentifier(device.task_id) ||
    !integer(page, 1) ||
    page > maxTaskQueryPage
  )
    throw new DeviceInputError()
  return parseDeviceRunPage(
    await request(
      `/device/runs?page=${page}`,
      {
        headers: { 'X-Workbench-Device-Id': device.id },
      },
      signal,
    ),
    device,
    page,
  )
}
export async function fetchDeviceRun(
  device: Pick<Device, 'id' | 'task_id'>,
  runId: string,
  signal?: AbortSignal,
) {
  if (
    !isTaskReadIdentifier(device.id) ||
    !isTaskReadIdentifier(device.task_id) ||
    !isTaskReadIdentifier(runId)
  )
    throw new DeviceInputError()
  return parseDeviceRunDetail(
    await request(
      `/device/runs/${encodeURIComponent(runId)}`,
      {
        headers: { 'X-Workbench-Device-Id': device.id },
      },
      signal,
    ),
    device,
    runId,
  )
}
