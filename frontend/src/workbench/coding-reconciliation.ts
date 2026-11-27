import {
  CodingResponseError,
  codingHash,
  codingObject,
  codingOptionalObject,
  codingPaths,
  codingRequest,
  codingRoot,
  codingText,
  parseCodingConfig,
  parseCodingFiles,
  type CodingConfig,
  type CodingFiles,
  type CodingCandidate,
} from './coding'
import { isTaskReadIdentifier } from './task-query'

export type CodingResolution = {
  path: string
  source: 'current' | 'checkpoint' | 'manual'
  content?: string
}
export type CodingReconciliation = {
  review_hash: string
  expected_current_hash: string
  resolutions: CodingResolution[]
}
export type CodingFileChange = {
  path: string
  writable: boolean
  current_changed: boolean
  checkpoint_changed: boolean
  diverged: boolean
  inherited_discarded: boolean
}
export type CodingComparison = {
  schema_version: 1
  unit: 'coding_reconciliation'
  task_id: string
  config: CodingConfig
  source: {
    id: string
    sha256: string
    run_id: string
    round: number
    origin_hash: string
    candidate_hash: string
  }
  origin_files: CodingFiles
  checkpoint_files: CodingFiles
  current_files: CodingFiles
  current_hash: string
  changes: CodingFileChange[]
  review_hash: string
}
export type CodingReconciliationSnapshot = {
  schema_version: 1
  review_hash: string
  current_hash: string
  resolved_hash: string
  source_candidate_hash: string
  source_origin_files: CodingFiles
  checkpoint_files: CodingFiles
  changes: CodingFileChange[]
}
function fail(): never {
  throw new CodingResponseError()
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const bytes = (value: string) => new TextEncoder().encode(value).length

export function parseReconciliationInput(
  value: unknown,
  writable: string[],
): CodingReconciliation {
  if (
    !codingObject(value, [
      'review_hash',
      'expected_current_hash',
      'resolutions',
    ]) ||
    !codingHash(value.review_hash) ||
    !codingHash(value.expected_current_hash) ||
    !Array.isArray(value.resolutions) ||
    value.resolutions.length !== writable.length
  )
    fail()
  let total = 0
  const resolutions = value.resolutions.map((entry) => {
    if (
      !codingOptionalObject(entry, ['path', 'source'], ['content']) ||
      !codingPaths([entry.path]) ||
      !writable.includes(entry.path as string) ||
      !['current', 'checkpoint', 'manual'].includes(entry.source as string) ||
      (entry.source === 'manual'
        ? !codingText(entry.content, 32768) || bytes(entry.content) > 32768
        : Object.hasOwn(entry, 'content'))
    )
      fail()
    if (entry.source === 'manual') total += bytes(entry.content as string)
    return {
      path: entry.path as string,
      source: entry.source as CodingResolution['source'],
      ...(entry.source === 'manual'
        ? { content: entry.content as string }
        : {}),
    }
  })
  if (
    total > 65536 ||
    new Set(resolutions.map((entry) => entry.path)).size !== resolutions.length
  )
    fail()
  return {
    review_hash: value.review_hash,
    expected_current_hash: value.expected_current_hash,
    resolutions,
  }
}
function matchingPaths(...sets: CodingFiles[]) {
  if (
    sets.some(
      (files) =>
        !same(
          files.map((file) => file.path),
          sets[0].map((file) => file.path),
        ),
    )
  )
    fail()
}
function parseChanges(
  value: unknown,
  config: CodingConfig,
  origin: CodingFiles,
  checkpoint: CodingFiles,
  current: CodingFiles,
): CodingFileChange[] {
  matchingPaths(origin, checkpoint, current)
  if (!Array.isArray(value) || value.length !== current.length) fail()
  return value.map((change, index) => {
    const old = origin[index],
      prior = checkpoint[index],
      file = current[index]
    const writable = config.writable.includes(file.path)
    if (
      !codingObject(change, [
        'path',
        'writable',
        'current_changed',
        'checkpoint_changed',
        'diverged',
        'inherited_discarded',
      ]) ||
      change.path !== file.path ||
      change.writable !== writable ||
      change.current_changed !== (file.content !== old.content) ||
      change.checkpoint_changed !== (prior.content !== old.content) ||
      change.diverged !== (file.content !== prior.content) ||
      change.inherited_discarded !==
        (!writable &&
          prior.content !== old.content &&
          prior.content !== file.content)
    )
      fail()
    return change as CodingFileChange
  })
}
export function parseCodingComparison(
  value: unknown,
  taskId: string,
  expected: CodingConfig,
  taskFiles?: string[],
): CodingComparison {
  if (
    !codingObject(value, [
      'schema_version',
      'unit',
      'task_id',
      'config',
      'source',
      'origin_files',
      'checkpoint_files',
      'current_files',
      'current_hash',
      'changes',
      'review_hash',
    ]) ||
    value.schema_version !== 1 ||
    value.unit !== 'coding_reconciliation' ||
    value.task_id !== taskId ||
    !codingHash(value.current_hash) ||
    !codingHash(value.review_hash) ||
    !codingObject(value.source, [
      'id',
      'sha256',
      'run_id',
      'round',
      'origin_hash',
      'candidate_hash',
    ])
  )
    fail()
  const config = parseCodingConfig(value.config)
  const source = value.source
  if (
    !config.continuation ||
    config.continuation.reconciliation ||
    !same(config, parseCodingConfig(expected)) ||
    source.id !== config.continuation.checkpoint.id ||
    source.sha256 !== config.continuation.checkpoint.sha256 ||
    !isTaskReadIdentifier(source.run_id) ||
    !Number.isSafeInteger(source.round) ||
    Number(source.round) < 1 ||
    Number(source.round) > 3 ||
    !codingHash(source.origin_hash) ||
    !codingHash(source.candidate_hash)
  )
    fail()
  const origin = parseCodingFiles(value.origin_files),
    checkpoint = parseCodingFiles(value.checkpoint_files),
    current = parseCodingFiles(value.current_files)
  matchingPaths(origin, checkpoint, current)
  if (
    (taskFiles &&
      !same(
        current.map((file) => file.path),
        taskFiles,
      )) ||
    [...config.writable, ...config.tests].some(
      (path) => !current.some((file) => file.path === path),
    )
  )
    fail()
  const changes = parseChanges(
    value.changes,
    config,
    origin,
    checkpoint,
    current,
  )
  return {
    schema_version: 1,
    unit: 'coding_reconciliation',
    task_id: taskId,
    config,
    source: source as CodingComparison['source'],
    origin_files: origin,
    checkpoint_files: checkpoint,
    current_files: current,
    current_hash: value.current_hash,
    changes,
    review_hash: value.review_hash,
  }
}
export function resolvedCodingFiles(
  config: CodingConfig,
  current: CodingFiles,
  checkpoint: CodingFiles,
): CodingFiles {
  const resolution = config.continuation?.reconciliation
  if (!resolution) fail()
  const expectedOrder = current
    .filter((file) => config.writable.includes(file.path))
    .map((file) => file.path)
  if (
    !same(
      resolution.resolutions.map((item) => item.path),
      expectedOrder,
    )
  )
    fail()
  const files = current.map((file, index) => {
    const choice = resolution.resolutions.find(
      (entry) => entry.path === file.path,
    )
    const content =
      choice?.source === 'manual'
        ? choice.content!
        : choice?.source === 'checkpoint'
          ? checkpoint[index].content
          : file.content
    return { path: file.path, content, bytes: bytes(content) }
  })
  return parseCodingFiles(files)
}
export function parseReconciliationSnapshot(
  value: unknown,
  config: CodingConfig,
  current: CodingFiles,
  resolved: CodingFiles,
): CodingReconciliationSnapshot {
  const selection = config.continuation?.reconciliation
  if (
    !selection ||
    !codingObject(value, [
      'schema_version',
      'review_hash',
      'current_hash',
      'resolved_hash',
      'source_candidate_hash',
      'source_origin_files',
      'checkpoint_files',
      'changes',
    ]) ||
    value.schema_version !== 1 ||
    value.review_hash !== selection.review_hash ||
    value.current_hash !== selection.expected_current_hash ||
    !codingHash(value.resolved_hash) ||
    !codingHash(value.source_candidate_hash)
  )
    fail()
  const origin = parseCodingFiles(value.source_origin_files),
    checkpoint = parseCodingFiles(value.checkpoint_files)
  const changes = parseChanges(
    value.changes,
    config,
    origin,
    checkpoint,
    current,
  )
  if (!same(resolvedCodingFiles(config, current, checkpoint), resolved)) fail()
  return {
    schema_version: 1,
    review_hash: selection.review_hash,
    current_hash: selection.expected_current_hash,
    resolved_hash: value.resolved_hash,
    source_candidate_hash: value.source_candidate_hash,
    source_origin_files: origin,
    checkpoint_files: checkpoint,
    changes,
  }
}
export async function compareCodingBaseline(
  taskId: string,
  config: CodingConfig,
  signal?: AbortSignal,
  enabled = false,
  taskFiles?: string[],
) {
  if (!enabled) throw new Error('coding_reconciliation_unsupported')
  const admitted = parseCodingConfig(config)
  if (!admitted.continuation || admitted.continuation.reconciliation) fail()
  return parseCodingComparison(
    await codingRequest(
      `${codingRoot(taskId)}/reconciliation/preview`,
      admitted,
      signal,
    ),
    taskId,
    admitted,
    taskFiles,
  )
}
export function assertReconciliationComparison(
  candidate: CodingCandidate,
  comparison: CodingComparison,
) {
  const frozen = candidate.snapshot.reconciliation
  const selection = candidate.config.continuation?.reconciliation
  if (
    !frozen ||
    !selection ||
    candidate.snapshot.continuation?.origin_hash !==
      comparison.source.origin_hash ||
    frozen.review_hash !== comparison.review_hash ||
    frozen.current_hash !== comparison.current_hash ||
    frozen.source_candidate_hash !== comparison.source.candidate_hash ||
    candidate.snapshot.continuation?.run_id !== comparison.source.run_id ||
    candidate.snapshot.continuation?.round !== comparison.source.round ||
    !same(frozen.source_origin_files, comparison.origin_files) ||
    !same(frozen.checkpoint_files, comparison.checkpoint_files) ||
    !same(candidate.snapshot.origin_files, comparison.current_files) ||
    !same(frozen.changes, comparison.changes)
  )
    fail()
  const { reconciliation: _choices, ...source } = candidate.config.continuation!
  if (!same({ ...candidate.config, continuation: source }, comparison.config))
    fail()
}
