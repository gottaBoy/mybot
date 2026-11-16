import { api } from './api'
import type { RecoveryConfig } from './recovery'

export type RecoveryMode = 'retry' | 'resume'
export type RecoveryIntentState =
  'prepared' | 'applying' | 'applied' | 'rejected' | 'unknown' | 'abandoned'
export type RecoveryIntent = {
  request_id: string
  source_run_id: string
  mode: RecoveryMode
  snapshot_hash: string
  candidate_hash: string
  config: Omit<RecoveryConfig, 'call_timeout_seconds'> & {
    call_timeout_seconds?: number
  }
  state: RecoveryIntentState
  target_run_id: string | null
  error_code: string | null
  requires_acknowledgement: boolean
  outcome_unknown: boolean
  created_at: string
  updated_at: string
  settled_at: string | null
}
export type RecoveryIntentLedger = {
  latest: RecoveryIntent | null
  unresolved: RecoveryIntent | null
  history: RecoveryIntent[]
  total: number
  history_truncated: boolean
}
const states: RecoveryIntentState[] = [
  'prepared',
  'applying',
  'applied',
  'rejected',
  'unknown',
  'abandoned',
]
const unresolvedStates: RecoveryIntentState[] = [
  'prepared',
  'applying',
  'unknown',
]
const hash = /^[0-9a-f]{64}$/
const identifier = /^[A-Za-z0-9_-]{1,100}$/
const requestIdentifier = /^[A-Za-z0-9_-]{8,100}$/
const configKeys = [
  'coordinator_model',
  'researcher_model',
  'reviewer_model',
  'max_calls',
  'parallel',
  'minutes',
  'max_output_tokens',
  'call_timeout_seconds',
] as const
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function parseRecoveryIntent(
  value: unknown,
  source: string,
  requestId?: string,
): RecoveryIntent {
  const invalid = () => {
    throw new Error('recovery_receipt_invalid')
  }
  if (!object(value)) return invalid()
  if (
    typeof value.request_id !== 'string' ||
    !requestIdentifier.test(value.request_id) ||
    (requestId !== undefined && value.request_id !== requestId) ||
    value.source_run_id !== source ||
    typeof value.mode !== 'string' ||
    !['retry', 'resume'].includes(value.mode) ||
    !states.includes(value.state as RecoveryIntentState) ||
    typeof value.snapshot_hash !== 'string' ||
    !hash.test(value.snapshot_hash) ||
    typeof value.candidate_hash !== 'string' ||
    !hash.test(value.candidate_hash) ||
    !object(value.config) ||
    typeof value.requires_acknowledgement !== 'boolean' ||
    typeof value.outcome_unknown !== 'boolean' ||
    value.outcome_unknown !== (value.state === 'unknown') ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string' ||
    (value.settled_at !== null && typeof value.settled_at !== 'string') ||
    (value.error_code !== null &&
      (typeof value.error_code !== 'string' ||
        !/^[a-z0-9_]{1,120}$/.test(value.error_code))) ||
    (value.target_run_id !== null &&
      (typeof value.target_run_id !== 'string' ||
        !identifier.test(value.target_run_id)))
  )
    return invalid()
  const config = value.config as Record<string, unknown>
  if (
    Object.keys(config).some(
      (key) => !configKeys.includes(key as (typeof configKeys)[number]),
    )
  )
    return invalid()
  for (const key of ['coordinator_model', 'researcher_model', 'reviewer_model'])
    if (typeof config[key] !== 'string' || !identifier.test(config[key]))
      return invalid()
  for (const [key, min, max] of [
    ['max_calls', 1, 8],
    ['parallel', 1, 2],
    ['minutes', 1, 30],
    ['max_output_tokens', 256, 4096],
  ] as const) {
    const number = config[key]
    if (
      !Number.isInteger(number) ||
      Number(number) < min ||
      Number(number) > max
    )
      return invalid()
  }
  if (
    (value.mode === 'retry' && config.call_timeout_seconds === undefined) ||
    (config.call_timeout_seconds !== undefined &&
      (!Number.isInteger(config.call_timeout_seconds) ||
        Number(config.call_timeout_seconds) < 10 ||
        Number(config.call_timeout_seconds) > 300))
  )
    return invalid()
  if (
    value.state === 'applied' &&
    (!value.target_run_id ||
      (value.mode === 'resume' && value.target_run_id !== source) ||
      (value.mode === 'retry' && value.target_run_id === source))
  )
    return invalid()
  if (value.state === 'prepared' && value.target_run_id !== null)
    return invalid()
  return value as unknown as RecoveryIntent
}

export function parseRecoveryLedger(
  value: unknown,
  source: string,
): RecoveryIntentLedger {
  if (
    !object(value) ||
    !Array.isArray(value.history) ||
    !Number.isSafeInteger(value.total) ||
    Number(value.total) < value.history.length ||
    typeof value.history_truncated !== 'boolean' ||
    value.history.length > 50
  )
    throw new Error('recovery_ledger_invalid')
  const latest =
    value.latest === null ? null : parseRecoveryIntent(value.latest, source)
  const unresolved =
    value.unresolved === null
      ? null
      : parseRecoveryIntent(value.unresolved, source)
  const history = value.history.map((item) => parseRecoveryIntent(item, source))
  if (unresolved && !unresolvedStates.includes(unresolved.state))
    throw new Error('recovery_ledger_invalid')
  const signature = (receipt: RecoveryIntent) =>
    JSON.stringify([
      receipt.request_id,
      receipt.source_run_id,
      receipt.mode,
      receipt.snapshot_hash,
      receipt.candidate_hash,
      configKeys.map((key) => receipt.config[key]),
      receipt.state,
      receipt.target_run_id,
      receipt.error_code,
      receipt.requires_acknowledgement,
      receipt.outcome_unknown,
      receipt.created_at,
      receipt.updated_at,
      receipt.settled_at,
    ])
  const pending = history.filter((receipt) =>
    unresolvedStates.includes(receipt.state),
  )
  const listedUnresolved = unresolved
    ? history.find((receipt) => receipt.request_id === unresolved.request_id)
    : undefined
  if (
    history.length !== Math.min(Number(value.total), 50) ||
    value.history_truncated !== Number(value.total) > history.length ||
    new Set(history.map((receipt) => receipt.request_id)).size !==
      history.length ||
    !!history.length !== !!latest ||
    (latest && signature(latest) !== signature(history[0])) ||
    pending.length > 1 ||
    (pending.length === 1 &&
      (!unresolved || signature(pending[0]) !== signature(unresolved))) ||
    (listedUnresolved &&
      unresolved &&
      signature(listedUnresolved) !== signature(unresolved)) ||
    (unresolved && !value.history_truncated && pending.length === 0)
  )
    throw new Error('recovery_ledger_invalid')
  return {
    latest,
    unresolved,
    history,
    total: Number(value.total),
    history_truncated: value.history_truncated,
  }
}

async function bounded(path: string, options: RequestInit, timeout = 15_000) {
  const controller = new AbortController()
  const parent = options.signal
  const abort = () => controller.abort()
  if (parent?.aborted) controller.abort()
  parent?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeout)
  try {
    return await api<unknown>(path, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', abort)
  }
}
function base(source: string) {
  if (!identifier.test(source)) throw new Error('recovery_source_invalid')
  return `/runs/${encodeURIComponent(source)}/recovery-intents`
}
function item(source: string, requestId: string) {
  if (!requestIdentifier.test(requestId))
    throw new Error('recovery_request_id_invalid')
  return `${base(source)}/${encodeURIComponent(requestId)}`
}
export async function readRecoveryIntents(
  source: string,
  signal?: AbortSignal,
) {
  return parseRecoveryLedger(await bounded(base(source), { signal }), source)
}
export async function readRecoveryIntent(
  source: string,
  requestId: string,
  signal?: AbortSignal,
) {
  return parseRecoveryIntent(
    await bounded(item(source, requestId), { signal }),
    source,
    requestId,
  )
}
export async function prepareRecoveryIntent(
  source: string,
  candidate: {
    request_id: string
    mode: RecoveryMode
    snapshot_hash: string
    config?: RecoveryConfig
  },
  signal?: AbortSignal,
) {
  item(source, candidate.request_id)
  return parseRecoveryIntent(
    await bounded(base(source), {
      method: 'POST',
      body: JSON.stringify(candidate),
      signal,
    }),
    source,
    candidate.request_id,
  )
}
export async function executeRecoveryIntent(
  source: string,
  requestId: string,
  acknowledge: boolean,
  signal?: AbortSignal,
) {
  return parseRecoveryIntent(
    await bounded(`${item(source, requestId)}/execute`, {
      method: 'POST',
      body: JSON.stringify({ consent: true, acknowledge_replay: acknowledge }),
      signal,
    }),
    source,
    requestId,
  )
}
export async function abandonRecoveryIntent(
  source: string,
  requestId: string,
  signal?: AbortSignal,
) {
  return parseRecoveryIntent(
    await bounded(`${item(source, requestId)}/abandon`, {
      method: 'POST',
      body: '{}',
      signal,
    }),
    source,
    requestId,
  )
}
export function intentIsLocked(intent: RecoveryIntent | null) {
  return !!intent && intent.state !== 'prepared'
}
export function intentConfig(
  intent: RecoveryIntent,
  fallback: RecoveryConfig,
): RecoveryConfig {
  return { ...fallback, ...intent.config }
}
export async function presentAppliedRecovery(
  intent: RecoveryIntent,
  onComplete: (id: string) => Promise<void>,
) {
  if (intent.state !== 'applied' || !intent.target_run_id)
    throw new Error('recovery_not_applied')
  try {
    await onComplete(intent.target_run_id)
    return null
  } catch {
    return 'recovery_applied_presentation_failed'
  }
}
