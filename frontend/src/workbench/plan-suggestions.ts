import { api } from './api'
import {
  parsePlanDefinition,
  type PlanDefinition,
} from './task-plans'
import { isTaskReadIdentifier } from './task-query'
import type { Task } from './api'
import type { TaskPlanScope } from './task-plan-scope'

export type PlanSuggestionConfig = {
  model_id: string
  files: string[]
  max_calls: 1
  call_timeout_seconds: number
  max_output_tokens: number
}

export type PlanSuggestionFile = {
  path: string
  bytes: number
  sha256: string
}

export type PlanSuggestionSource = {
  task: Task
  task_snapshot_hash: string
  context_hash: string
  files: PlanSuggestionFile[]
  task_plan_scope?: TaskPlanScope
}

export type PlanSuggestionModel = {
  id: string
  name: string
  kind: string
  model: string
}

export type PlanSuggestionPreview = {
  schema_version: 1
  unit: 'task_plan_suggestion_preview'
  task_id: string
  preview_hash: string
  source: PlanSuggestionSource
  model: PlanSuggestionModel
  config: PlanSuggestionConfig
  candidate_hash: string
}

export type PlanSuggestionCandidate = {
  candidate_hash: string
  config: PlanSuggestionConfig
  source: PlanSuggestionSource
  model: PlanSuggestionModel
}

export type PlanSuggestionArtifact = {
  id: string
  run_id: string
  task_id: string
  title: string
  kind: 'plan_suggestion'
  created_at: string
  bytes: number
  sha256: string
  summary?: string
  definition: PlanDefinition
  candidate_hash: string
  source: PlanSuggestionSource
  model: PlanSuggestionModel
  config: PlanSuggestionConfig
}

export type PlanSuggestionJob = {
  schema_version: 1
  unit: 'task_plan_suggestion'
  request_id: string
  task_id: string
  candidate_hash: string
  state: 'prepared' | 'applying' | 'applied' | 'discarded' | 'unknown' | 'rejected'
  run_id: string | null
  artifact: PlanSuggestionArtifact | null
  candidate: PlanSuggestionCandidate
  created_at: string
  updated_at: string
}

function invalid(): never {
  throw new Error('task_plan_suggestion_response_invalid')
}
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
function text(value: unknown, max = 2000): value is string {
  return (
    typeof value === 'string' &&
    [...value].length <= max &&
    !value.includes('\u0000') &&
    !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
  )
}
function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
}
function requestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
}
function timestamp(value: unknown): value is string {
  return text(value, 80) && value.includes('T') && Number.isFinite(Date.parse(value))
}
function fileRecord(value: unknown): value is PlanSuggestionFile {
  if (!object(value)) return false
  return text(value.path, 400) && integer(value.bytes, 0, 65536) && hash(value.sha256)
}
function files(value: unknown): value is PlanSuggestionFile[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    new Set(value.map((item) => object(item) && item.path)).size === value.length &&
    value.every(fileRecord)
  )
}
function model(value: unknown): value is PlanSuggestionModel {
  return (
    object(value) &&
    isTaskReadIdentifier(value.id) &&
    text(value.name, 160) &&
    text(value.kind, 80) &&
    text(value.model, 240)
  )
}
function task(value: unknown, expectedId: string): value is Task {
  return (
    object(value) &&
    value.id === expectedId &&
    isTaskReadIdentifier(value.id) &&
    isTaskReadIdentifier(value.project_id) &&
    text(value.title, 160) &&
    text(value.goal, 8000) &&
    text(value.acceptance, 4000) &&
    Array.isArray(value.files) &&
    value.files.every((file) => text(file, 400)) &&
    (value.created_at === undefined || timestamp(value.created_at))
  )
}
function source(value: unknown, taskId: string): value is PlanSuggestionSource {
  if (
    !object(value) ||
    !task(value.task, taskId) ||
    !hash(value.task_snapshot_hash) ||
    !hash(value.context_hash) ||
    !files(value.files)
  )
    return false
  if (value.task_plan_scope !== undefined && !object(value.task_plan_scope))
    return false
  return true
}
function config(value: unknown): value is PlanSuggestionConfig {
  if (!object(value)) return false
  const modelId = value.model_id
  const selectedFiles = value.files
  const timeout = value.call_timeout_seconds
  const output = value.max_output_tokens
  return (
    typeof modelId === 'string' &&
    Array.isArray(selectedFiles) &&
    selectedFiles.length <= 10 &&
    new Set(selectedFiles).size === selectedFiles.length &&
    selectedFiles.every((file) => text(file, 400)) &&
    value.max_calls === 1 &&
    integer(timeout, 10, 180) &&
    integer(output, 1024, 8192)
  )
}
function candidate(
  value: unknown,
  taskId: string,
): value is PlanSuggestionCandidate {
  return (
    object(value) &&
    hash(value.candidate_hash) &&
    config(value.config) &&
    source(value.source, taskId) &&
    model(value.model)
  )
}
export function parsePlanSuggestionPreview(
  value: unknown,
  taskId: string,
): PlanSuggestionPreview {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    value.unit !== 'task_plan_suggestion_preview' ||
    value.task_id !== taskId ||
    !isTaskReadIdentifier(taskId) ||
    !hash(value.preview_hash) ||
    !source(value.source, taskId) ||
    !model(value.model) ||
    !config(value.config) ||
    !hash(value.candidate_hash)
  )
    invalid()
  return value as PlanSuggestionPreview
}
function artifact(value: unknown, taskId: string): value is PlanSuggestionArtifact {
  if (!object(value)) return false
  let definition: PlanDefinition
  try {
    definition = parsePlanDefinition(value.definition)
  } catch {
    return false
  }
  return (
    isTaskReadIdentifier(value.id) &&
    isTaskReadIdentifier(value.run_id) &&
    value.task_id === taskId &&
    text(value.title, 240) &&
    value.kind === 'plan_suggestion' &&
    timestamp(value.created_at) &&
    integer(value.bytes, 1, 65536) &&
    hash(value.sha256) &&
    (value.summary === undefined || text(value.summary, 2000)) &&
    definition.items.length >= 2 &&
    hash(value.candidate_hash) &&
    source(value.source, taskId) &&
    model(value.model) &&
    config(value.config)
  )
}
export function parsePlanSuggestionJob(
  value: unknown,
  taskId: string,
): PlanSuggestionJob {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    value.unit !== 'task_plan_suggestion' ||
    !requestId(value.request_id) ||
    value.task_id !== taskId ||
    !isTaskReadIdentifier(taskId) ||
    !hash(value.candidate_hash) ||
    !['prepared', 'applying', 'applied', 'discarded', 'unknown', 'rejected'].includes(
      value.state as string,
    ) ||
    (value.run_id !== null && !isTaskReadIdentifier(value.run_id)) ||
    !candidate(value.candidate, taskId) ||
    !timestamp(value.created_at) ||
    !timestamp(value.updated_at)
  )
    invalid()
  if (value.state === 'applied' && !value.run_id) invalid()
  if (value.state !== 'applied' && value.run_id !== null)
    invalid()
  if (value.artifact !== null && !artifact(value.artifact, taskId)) invalid()
  return value as PlanSuggestionJob
}

const path = (taskId: string, suffix: string) =>
  `/tasks/${encodeURIComponent(taskId)}/plan-suggestions${suffix}`

export async function previewPlanSuggestion(
  task: Task,
  value: PlanSuggestionConfig,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(path(task.id, '/preview'), {
    method: 'POST',
    body: JSON.stringify(value),
    signal,
  })
  signal?.throwIfAborted()
  return parsePlanSuggestionPreview(result, task.id)
}
export async function preparePlanSuggestion(
  task: Task,
  request_id: string,
  preview: PlanSuggestionPreview,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(path(task.id, '/prepare'), {
    method: 'POST',
    body: JSON.stringify({
      request_id,
      preview_hash: preview.preview_hash,
      candidate_hash: preview.candidate_hash,
      consent: true,
      config: preview.config,
    }),
    signal,
  })
  signal?.throwIfAborted()
  return parsePlanSuggestionJob(result, task.id)
}
export async function executePlanSuggestion(
  task: Task,
  job: PlanSuggestionJob,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(
    path(task.id, `/${encodeURIComponent(job.request_id)}/execute`),
    {
    method: 'POST',
    body: JSON.stringify({ request_id: job.request_id, candidate_hash: job.candidate_hash, consent: true }),
      signal,
    },
  )
  signal?.throwIfAborted()
  return parsePlanSuggestionJob(result, task.id)
}
export async function fetchPlanSuggestion(
  taskId: string,
  request_id: string,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(
    path(taskId, `/${encodeURIComponent(request_id)}`),
    { signal },
  )
  signal?.throwIfAborted()
  return parsePlanSuggestionJob(result, taskId)
}
export async function fetchPreparedPlanSuggestion(
  taskId: string,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(path(taskId, ''), { signal })
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    !Object.hasOwn(result, 'prepared')
  )
    invalid()
  const prepared = (result as { prepared: unknown }).prepared
  return {
    prepared:
      prepared === null
        ? null
        : parsePlanSuggestionJob(prepared, taskId),
  }
}
export async function discardPlanSuggestion(
  task: Task,
  job: PlanSuggestionJob,
  signal?: AbortSignal,
) {
  const result = await api<unknown>(
    path(task.id, `/${encodeURIComponent(job.request_id)}/discard`),
    {
      method: 'POST',
      body: JSON.stringify({
        request_id: job.request_id,
        candidate_hash: job.candidate_hash,
        consent: true,
      }),
      signal,
    },
  )
  signal?.throwIfAborted()
  return parsePlanSuggestionJob(result, task.id)
}
