import { api } from './api'
import { isTaskReadIdentifier } from './task-query'

export type CodingConfig = {
  model_id: string
  writable: string[]
  tests: string[]
  max_rounds: number
  test_timeout: number
  max_output_tokens: number
}
export type CodingCandidate = {
  config: CodingConfig
  snapshot: {
    task_id: string
    goal: string
    acceptance: string
    notes: string
    profile: 'python-unittest'
    files: Array<{ path: string; content: string; bytes: number }>
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
    !object(value, [
      'model_id',
      'writable',
      'tests',
      'max_rounds',
      'test_timeout',
      'max_output_tokens',
    ]) ||
    !isTaskReadIdentifier(value.model_id) ||
    !paths(value.writable) ||
    !paths(value.tests) ||
    value.writable.some(
      (path) => value.tests instanceof Array && value.tests.includes(path),
    ) ||
    !integer(value.max_rounds, 1, 3) ||
    !integer(value.test_timeout, 1, 15) ||
    !integer(value.max_output_tokens, 1024, 16384)
  )
    throw new CodingResponseError()
  return {
    model_id: value.model_id,
    writable: [...value.writable],
    tests: [...value.tests],
    max_rounds: value.max_rounds,
    test_timeout: value.test_timeout,
    max_output_tokens: value.max_output_tokens,
  }
}
export function parseCodingCandidate(
  value: unknown,
  taskId: string,
  expected?: CodingConfig,
): CodingCandidate {
  if (
    !object(value, ['config', 'snapshot', 'candidate_hash']) ||
    !hash(value.candidate_hash) ||
    !object(value.snapshot, [
      'task_id',
      'goal',
      'acceptance',
      'notes',
      'files',
      'profile',
      'model',
    ])
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
    snapshot.profile !== 'python-unittest' ||
    !Array.isArray(snapshot.files) ||
    !snapshot.files.length ||
    snapshot.files.length > 10 ||
    !object(snapshot.model, ['id', 'name', 'kind', 'model', 'endpoint']) ||
    snapshot.model.id !== config.model_id ||
    !text(snapshot.model.name, 80) ||
    !['chat_completions', 'codex_cli'].includes(
      snapshot.model.kind as string,
    ) ||
    !text(snapshot.model.model, 150) ||
    !text(snapshot.model.endpoint, 500)
  )
    throw new CodingResponseError()
  const files = snapshot.files.map((file) => {
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
  const names = files.map((file) => file.path)
  if (
    new Set(names).size !== names.length ||
    files.reduce((sum, file) => sum + file.bytes, 0) > 65536 ||
    [...config.writable, ...config.tests].some((path) => !names.includes(path))
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
      profile: 'python-unittest',
      model: snapshot.model as CodingCandidate['snapshot']['model'],
    },
  }
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
    value.profile !== 'python-unittest' ||
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
    !paths(value.test_files)
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
      !integer(receipt.errors, 0, value.tests_run) ||
      !integer(receipt.skipped, 0, value.tests_run) ||
      typeof receipt.success !== 'boolean')
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
    receipt.success === true
  if (value.passed !== passed) throw new CodingResponseError()
  return value as unknown as CodingTest
}
