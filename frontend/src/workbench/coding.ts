import { api } from './api'
import { isTaskReadIdentifier, maxTaskQueryPage } from './task-query'
import {
  parseReconciliationInput,
  parseReconciliationSnapshot,
  type CodingReconciliation,
  type CodingReconciliationSnapshot,
} from './coding-reconciliation'
import { parseTaskPlanScope, type TaskPlanScope } from './task-plan-scope'

export type CodingProfile = 'python-unittest' | 'python-pytest' | 'node-test'
const codingProfileNames: Record<CodingProfile, string> = {
  'python-unittest': 'Python unittest',
  'python-pytest': 'Python pytest',
  'node-test': 'Node.js node:test',
}
export const codingProfileLabel = (value: CodingProfile) =>
  codingProfileNames[value]
export type CodingConfig = {
  model_id: string
  writable: string[]
  tests: string[]
  max_rounds: number
  test_timeout: number
  max_output_tokens: number
  profile?: CodingProfile
  continuation?: {
    checkpoint: { id: string; sha256: string }
    instruction: string
    reconciliation?: CodingReconciliation
  }
}
export type CodingFiles = Array<{
  path: string
  content: string
  bytes: number
}>
export type CodingProvenance = {
  id: string
  sha256: string
  run_id: string
  round: number
  origin_hash: string
  patch: string
}
export type CodingCandidate = {
  config: CodingConfig
  snapshot: {
    task_id: string
    goal: string
    acceptance: string
    notes: string
    profile: CodingProfile
    files: CodingFiles
    origin_files?: CodingFiles
    continuation?: CodingProvenance
    reconciliation?: CodingReconciliationSnapshot
    task_plan_scope?: TaskPlanScope
    model: {
      id: string
      name: string
      kind: string
      model: string
      endpoint: string
    }
  }
  candidate_hash: string
}
export type CodingJob = {
  request_id: string
  task_id: string
  candidate_hash: string
  state: 'prepared' | 'applied' | 'discarded'
  run_id: string | null
  created_at: string
  candidate: CodingCandidate
}
export class CodingResponseError extends Error {
  constructor() {
    super('coding_response_invalid')
  }
}
const object = (
  value: unknown,
  keys: string[],
): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key))
const optionalObject = (
  value: unknown,
  keys: string[],
  optional: string[],
): value is Record<string, unknown> =>
  object(value, [
    ...keys,
    ...optional.filter(
      (key) => value && typeof value === 'object' && Object.hasOwn(value, key),
    ),
  ])
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  [...value].length <= max &&
  !value.includes('\u0000') &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
const profile = (value: unknown): value is CodingProfile =>
  value === 'python-unittest' ||
  value === 'python-pytest' ||
  value === 'node-test'
const nodeTestFiles = (value: string[]) =>
  value.every((path) => path.endsWith('.mjs') || path.endsWith('.cjs'))
const paths = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 10 &&
  new Set(value).size === value.length &&
  value.every(
    (path) =>
      text(path, 400) &&
      !!path &&
      !path.startsWith('/') &&
      !path.includes('\\') &&
      !path.split('/').some((part) => !part || part.startsWith('.')) &&
      !/[\u0000-\u001f]/.test(path),
  )
export function parseCodingConfig(value: unknown): CodingConfig {
  if (
    !optionalObject(
      value,
      [
        'model_id',
        'writable',
        'tests',
        'max_rounds',
        'test_timeout',
        'max_output_tokens',
      ],
      ['continuation', 'profile'],
    ) ||
    !isTaskReadIdentifier(value.model_id) ||
    !paths(value.writable) ||
    !paths(value.tests) ||
    value.writable.some(
      (path) => value.tests instanceof Array && value.tests.includes(path),
    ) ||
    !integer(value.max_rounds, 1, 3) ||
    !integer(value.test_timeout, 1, 15) ||
    !integer(value.max_output_tokens, 1024, 16384) ||
    (Object.hasOwn(value, 'profile') && !profile(value.profile)) ||
    (value.profile === 'node-test' && !nodeTestFiles(value.tests))
  )
    throw new CodingResponseError()
  let continuation: CodingConfig['continuation']
  if (Object.hasOwn(value, 'continuation')) {
    const next = value.continuation
    if (
      !optionalObject(
        next,
        ['checkpoint', 'instruction'],
        ['reconciliation'],
      ) ||
      !object(next.checkpoint, ['id', 'sha256']) ||
      !isTaskReadIdentifier(next.checkpoint.id) ||
      !hash(next.checkpoint.sha256) ||
      !text(next.instruction, 8000) ||
      !next.instruction.trim() ||
      next.instruction.trim() !== next.instruction
    )
      throw new CodingResponseError()
    continuation = {
      checkpoint: { id: next.checkpoint.id, sha256: next.checkpoint.sha256 },
      instruction: next.instruction,
      ...(Object.hasOwn(next, 'reconciliation')
        ? {
            reconciliation: parseReconciliationInput(
              next.reconciliation,
              value.writable as string[],
            ),
          }
        : {}),
    }
  }
  return {
    model_id: value.model_id,
    writable: [...value.writable],
    tests: [...value.tests],
    max_rounds: value.max_rounds,
    test_timeout: value.test_timeout,
    max_output_tokens: value.max_output_tokens,
    ...(Object.hasOwn(value, 'profile')
      ? { profile: value.profile as CodingProfile }
      : {}),
    ...(continuation ? { continuation } : {}),
  }
}
export function parseCodingFiles(value: unknown): CodingFiles {
  if (!Array.isArray(value) || !value.length || value.length > 10)
    throw new CodingResponseError()
  const files = value.map((file) => {
    if (
      !object(file, ['path', 'content', 'bytes']) ||
      !paths([file.path]) ||
      !text(file.content, 32768) ||
      !integer(file.bytes, 0, 32768) ||
      new TextEncoder().encode(file.content).length !== file.bytes
    )
      throw new CodingResponseError()
    return {
      path: file.path as string,
      content: file.content,
      bytes: file.bytes,
    }
  })
  if (
    new Set(files.map((file) => file.path)).size !== files.length ||
    files.reduce((sum, file) => sum + file.bytes, 0) > 65536
  )
    throw new CodingResponseError()
  return files
}
export function parseCodingCandidate(
  value: unknown,
  taskId: string,
  expected?: CodingConfig,
): CodingCandidate {
  if (
    !object(value, ['config', 'snapshot', 'candidate_hash']) ||
    !hash(value.candidate_hash) ||
    !optionalObject(
      value.snapshot,
      ['task_id', 'goal', 'acceptance', 'notes', 'files', 'profile', 'model'],
      ['origin_files', 'continuation', 'reconciliation', 'task_plan_scope'],
    )
  )
    throw new CodingResponseError()
  const config = parseCodingConfig(value.config),
    snapshot = value.snapshot
  if (
    (expected &&
      JSON.stringify(config) !== JSON.stringify(parseCodingConfig(expected))) ||
    snapshot.task_id !== taskId ||
    !text(snapshot.goal, 8000) ||
    !snapshot.goal ||
    !text(snapshot.acceptance, 4000) ||
    !text(snapshot.notes, 16000) ||
    snapshot.profile !== (config.profile ?? 'python-unittest') ||
    !Array.isArray(snapshot.files) ||
    !snapshot.files.length ||
    snapshot.files.length > 10 ||
    !object(snapshot.model, ['id', 'name', 'kind', 'model', 'endpoint']) ||
    snapshot.model.id !== config.model_id ||
    !text(snapshot.model.name, 80) ||
    !['chat_completions', 'codex_cli', 'pi_sdk'].includes(
      snapshot.model.kind as string,
    ) ||
    !text(snapshot.model.model, 150) ||
    !text(snapshot.model.endpoint, 500)
  )
    throw new CodingResponseError()
  const files = parseCodingFiles(snapshot.files)
  const names = files.map((file) => file.path)
  if (
    new Set(names).size !== names.length ||
    files.reduce((sum, file) => sum + file.bytes, 0) > 65536 ||
    [...config.writable, ...config.tests].some((path) => !names.includes(path))
  )
    throw new CodingResponseError()
  let originFiles: CodingFiles | undefined,
    provenance: CodingProvenance | undefined,
    reconciliation: CodingReconciliationSnapshot | undefined
  if (config.continuation) {
    originFiles = parseCodingFiles(snapshot.origin_files)
    const ref = snapshot.continuation
    if (
      !object(ref, [
        'id',
        'sha256',
        'run_id',
        'round',
        'origin_hash',
        'patch',
      ]) ||
      ref.id !== config.continuation.checkpoint.id ||
      ref.sha256 !== config.continuation.checkpoint.sha256 ||
      !isTaskReadIdentifier(ref.run_id) ||
      !integer(ref.round, 1, 3) ||
      !hash(ref.origin_hash) ||
      !text(ref.patch, 200000) ||
      !ref.patch ||
      originFiles.some(
        (file, index) =>
          files[index]?.path !== file.path ||
          (files[index]?.content !== file.content &&
            !config.writable.includes(file.path)),
      ) ||
      originFiles.length !== files.length ||
      (!config.continuation.reconciliation &&
        originFiles.every(
          (file, index) => file.content === files[index].content,
        ))
    )
      throw new CodingResponseError()
    provenance = ref as CodingProvenance
    if (config.continuation.reconciliation) {
      reconciliation = parseReconciliationSnapshot(
        snapshot.reconciliation,
        config,
        originFiles,
        files,
      )
    } else if (Object.hasOwn(snapshot, 'reconciliation'))
      throw new CodingResponseError()
  } else if (
    Object.hasOwn(snapshot, 'origin_files') ||
    Object.hasOwn(snapshot, 'continuation') ||
    Object.hasOwn(snapshot, 'reconciliation')
  )
    throw new CodingResponseError()
  return {
    config,
    candidate_hash: value.candidate_hash,
    snapshot: {
      task_id: taskId,
      goal: snapshot.goal,
      acceptance: snapshot.acceptance,
      notes: snapshot.notes,
      files,
      ...(originFiles && provenance
        ? { origin_files: originFiles, continuation: provenance }
        : {}),
      ...(reconciliation ? { reconciliation } : {}),
      ...(Object.hasOwn(snapshot, 'task_plan_scope')
        ? {
            task_plan_scope: parseTaskPlanScope(
              snapshot.task_plan_scope,
              taskId,
            ),
          }
        : {}),
      profile: snapshot.profile as CodingProfile,
      model: snapshot.model as CodingCandidate['snapshot']['model'],
    },
  }
}
export function recordedCodingCandidate(
  context: { mode?: string; coding?: unknown },
  taskId: string,
) {
  if (context.mode !== 'coding-v1') return undefined
  const value = context.coding
  if (!object(value, ['config', 'snapshot', 'candidate_hash', 'model']))
    throw new CodingResponseError()
  return parseCodingCandidate(
    {
      config: value.config,
      snapshot: value.snapshot,
      candidate_hash: value.candidate_hash,
    },
    taskId,
  )
}
export function parseCodingJob(
  value: unknown,
  taskId: string,
  id?: string,
  expected?: CodingCandidate,
): CodingJob {
  if (
    !object(value, [
      'request_id',
      'task_id',
      'candidate_hash',
      'state',
      'run_id',
      'created_at',
      'candidate',
    ]) ||
    !requestId(value.request_id) ||
    (id && value.request_id !== id) ||
    value.task_id !== taskId ||
    !hash(value.candidate_hash) ||
    !['prepared', 'applied', 'discarded'].includes(value.state as string) ||
    (value.state === 'applied'
      ? !isTaskReadIdentifier(value.run_id)
      : value.run_id !== null) ||
    !text(value.created_at, 60) ||
    !Number.isFinite(Date.parse(value.created_at))
  )
    throw new CodingResponseError()
  const candidate = parseCodingCandidate(value.candidate, taskId)
  if (
    candidate.candidate_hash !== value.candidate_hash ||
    (expected &&
      JSON.stringify(candidate) !==
        JSON.stringify(parseCodingCandidate(expected, taskId)))
  )
    throw new CodingResponseError()
  return { ...value, candidate } as CodingJob
}
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const controller = new AbortController(),
    abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 15000)
  try {
    controller.signal.throwIfAborted()
    const result = await api<unknown>(path, {
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(body) }),
    })
    controller.signal.throwIfAborted()
    return result
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
const root = (taskId: string) => {
  if (!isTaskReadIdentifier(taskId)) throw new Error('coding_input_invalid')
  return `/tasks/${encodeURIComponent(taskId)}/coding`
}
export async function previewCoding(
  taskId: string,
  config: CodingConfig,
  signal?: AbortSignal,
) {
  const admitted = parseCodingConfig(config)
  return parseCodingCandidate(
    await request(`${root(taskId)}/preview`, admitted, signal),
    taskId,
    admitted,
  )
}
export async function prepareCoding(
  taskId: string,
  id: string,
  candidate: CodingCandidate,
  signal?: AbortSignal,
) {
  if (!requestId(id)) throw new Error('coding_input_invalid')
  const admitted = parseCodingCandidate(candidate, taskId)
  return parseCodingJob(
    await request(
      `${root(taskId)}/prepare`,
      {
        ...admitted.config,
        request_id: id,
        preview_hash: admitted.candidate_hash,
      },
      signal,
    ),
    taskId,
    id,
    admitted,
  )
}
export async function fetchCoding(
  taskId: string,
  id: string,
  signal?: AbortSignal,
  expected?: CodingCandidate,
) {
  if (!requestId(id)) throw new Error('coding_input_invalid')
  return parseCodingJob(
    await request(
      `${root(taskId)}/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),
    taskId,
    id,
    expected,
  )
}
export async function fetchPreparedCoding(
  taskId: string,
  signal?: AbortSignal,
) {
  const value = await request(root(taskId), undefined, signal)
  if (!object(value, ['prepared'])) throw new CodingResponseError()
  const job =
    value.prepared === null ? null : parseCodingJob(value.prepared, taskId)
  if (job && job.state !== 'prepared') throw new CodingResponseError()
  return job
}

export type CodingCheckpointOption = {
  id: string
  run_id: string
  task_id: string
  title: string
  created_at: string
  source_status: 'succeeded' | 'failed' | 'canceled'
  bytes: number
  sha256: string | null
  round: number | null
}
export type CodingCheckpointPage = {
  schema_version: 1
  unit: 'coding_checkpoints'
  task_id: string
  items: CodingCheckpointOption[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
  order: 'checkpoints-created-v1'
}
export function parseCodingCheckpoints(
  value: unknown,
  taskId: string,
  requested: number,
): CodingCheckpointPage {
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
    value.unit !== 'coding_checkpoints' ||
    value.task_id !== taskId ||
    value.requested_page !== requested ||
    value.page_size !== 20 ||
    value.order !== 'checkpoints-created-v1' ||
    !integer(value.total, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.items)
  )
    throw new CodingResponseError()
  const pages = Math.max(1, Math.ceil(value.total / 20)),
    page = Math.min(pages, requested)
  if (
    value.total_pages !== pages ||
    value.page !== page ||
    value.has_more !== page < pages ||
    value.items.length !==
      Math.min(20, Math.max(0, value.total - (page - 1) * 20))
  )
    throw new CodingResponseError()
  for (const item of value.items) {
    if (
      !object(item, [
        'id',
        'run_id',
        'task_id',
        'title',
        'created_at',
        'source_status',
        'bytes',
        'sha256',
        'round',
      ]) ||
      !isTaskReadIdentifier(item.id) ||
      !isTaskReadIdentifier(item.run_id) ||
      item.task_id !== taskId ||
      !text(item.title, 2000) ||
      !text(item.created_at, 60) ||
      !Number.isFinite(Date.parse(item.created_at)) ||
      !['succeeded', 'failed', 'canceled'].includes(
        item.source_status as string,
      ) ||
      !integer(item.bytes, 0, Number.MAX_SAFE_INTEGER) ||
      (item.sha256 === null
        ? item.round !== null
        : !hash(item.sha256) ||
          !integer(item.round, 1, 3) ||
          item.bytes < 1 ||
          item.bytes > 524288)
    )
      throw new CodingResponseError()
  }
  if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
    throw new CodingResponseError()
  return value as CodingCheckpointPage
}
export async function fetchCodingCheckpoints(
  taskId: string,
  page: number,
  signal?: AbortSignal,
) {
  if (!integer(page, 1, maxTaskQueryPage))
    throw new Error('coding_input_invalid')
  return parseCodingCheckpoints(
    await request(
      `${root(taskId)}/checkpoints?page=${page}`,
      undefined,
      signal,
    ),
    taskId,
    page,
  )
}
export function parseCodeCheckpoint(
  content: string,
  taskId: string,
  runId: string,
) {
  const value: unknown = JSON.parse(content)
  if (
    !object(value, [
      'schema_version',
      'task_id',
      'run_id',
      'candidate_hash',
      'round',
      'origin_hash',
      'files',
    ]) ||
    value.schema_version !== 1 ||
    value.task_id !== taskId ||
    value.run_id !== runId ||
    !hash(value.candidate_hash) ||
    !hash(value.origin_hash) ||
    !integer(value.round, 1, 3)
  )
    throw new CodingResponseError()
  return { ...value, files: parseCodingFiles(value.files) } as {
    schema_version: 1
    task_id: string
    run_id: string
    candidate_hash: string
    round: number
    origin_hash: string
    files: CodingFiles
  }
}
export async function applyCoding(
  taskId: string,
  job: CodingJob,
  action: 'execute' | 'discard',
  signal?: AbortSignal,
) {
  const admitted = parseCodingJob(job, taskId, job.request_id)
  const result = parseCodingJob(
    await request(
      `${root(taskId)}/${encodeURIComponent(job.request_id)}/${action}`,
      {
        candidate_hash: admitted.candidate_hash,
        consent: true,
      },
      signal,
    ),
    taskId,
    job.request_id,
    admitted.candidate,
  )
  if (result.state !== (action === 'execute' ? 'applied' : 'discarded'))
    throw new CodingResponseError()
  return result
}

export type CodingTest = {
  profile: CodingProfile
  command: string[]
  round: number
  tests_run: number
  exit_code: number
  duration_ms: number
  passed: boolean
  timed_out: boolean
  truncated: boolean
  output: string
  test_files: string[]
  receipt: {
    tests_run: number
    failures: number
    errors: number
    skipped: number
    success: boolean
  } | null
}
export function parseCodingTest(content: string): CodingTest {
  const value: unknown = JSON.parse(content)
  if (
    !object(value, [
      'profile',
      'command',
      'exit_code',
      'duration_ms',
      'output',
      'timed_out',
      'truncated',
      'tests_run',
      'passed',
      'receipt',
      'round',
      'test_files',
    ]) ||
    !profile(value.profile) ||
    !Array.isArray(value.command) ||
    !value.command.every((v) => text(v, 8192)) ||
    !integer(value.exit_code, -128, 255) ||
    !integer(value.duration_ms, 0, 10000000) ||
    !text(value.output, 32768) ||
    typeof value.timed_out !== 'boolean' ||
    typeof value.truncated !== 'boolean' ||
    typeof value.passed !== 'boolean' ||
    !integer(value.tests_run, 0, 1000000) ||
    !integer(value.round, 0, 3) ||
    !paths(value.test_files) ||
    (value.profile === 'node-test' && !nodeTestFiles(value.test_files))
  )
    throw new CodingResponseError()
  const receipt = value.receipt
  if (
    receipt !== null &&
    (!object(receipt, [
      'tests_run',
      'failures',
      'errors',
      'skipped',
      'success',
    ]) ||
      receipt.tests_run !== value.tests_run ||
      !integer(receipt.failures, 0, value.tests_run) ||
      !integer(receipt.errors, 0, Number.MAX_SAFE_INTEGER) ||
      !integer(receipt.skipped, 0, value.tests_run) ||
      typeof receipt.success !== 'boolean' ||
      (receipt.success &&
        (receipt.failures !== 0 ||
          receipt.errors !== 0 ||
          value.tests_run <= receipt.skipped)))
  )
    throw new CodingResponseError()
  const passed =
    value.exit_code === 0 &&
    !value.timed_out &&
    !value.truncated &&
    value.tests_run > 0 &&
    !!receipt &&
    typeof receipt === 'object' &&
    'success' in receipt &&
    'skipped' in receipt &&
    typeof receipt.skipped === 'number' &&
    value.tests_run > receipt.skipped &&
    receipt.success === true
  if (value.passed !== passed) throw new CodingResponseError()
  return value as unknown as CodingTest
}

export {
  object as codingObject,
  optionalObject as codingOptionalObject,
  text as codingText,
  hash as codingHash,
  paths as codingPaths,
  request as codingRequest,
  root as codingRoot,
}
