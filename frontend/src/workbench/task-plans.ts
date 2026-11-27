import { api, type Task, type Run } from './api'
import { isTaskReadIdentifier, parseTaskQueryRun } from './task-query'
import {
  parseRevisionReceipt,
  parseRevisionTaskPlan,
  type PlanRevisionReceipt,
  type PlanRevisionPreview,
} from './task-plan-revisions'
import {
  parseNestedTaskPlan,
  parseNestedGate,
  parseNestedCreatePreview,
  parseNestedReceipt,
  type NestedTaskPlanRead,
  type NestedGate,
  type NestedCreatePreview,
  type NestedRevisionPreview,
  type NestedPlanReceipt,
} from './task-plan-nesting'

export const dependencyCriterion = 'latest-successful-run-reviewed-reports-v1'
export type PlanItemInput = {
  key: string
  title: string
  goal: string
  acceptance: string
  files: string[]
  depends_on: string[]
}
export type PlanDefinition = { items: PlanItemInput[] }
export type PlanPreview = {
  parent_snapshot: Task
  definition: PlanDefinition
  criterion: typeof dependencyCriterion
  preview_hash: string
}
export type ReviewState =
  | 'no_run'
  | 'run_unfinished'
  | 'run_failed'
  | 'report_missing'
  | 'report_unavailable'
  | 'changes_requested'
  | 'review_pending'
  | 'accepted'
export type TaskReview = {
  task_id: string
  title: string
  latest_run: Run | null
  state: ReviewState
  reports: Array<{
    id: string
    decision: 'pending' | 'accepted' | 'changes_requested'
    sha256: string | null
  }>
}
export type DependencyGate = {
  task_id: string
  parent_task_id: string
  plan_hash: string
  criterion: typeof dependencyCriterion
  ready: boolean
  prerequisites: TaskReview[]
  plan_version?: number
  membership?: 'current' | 'retired'
}
export type PublishedPlan = {
  version: number
  parent_task_id: string
  plan_hash: string
  created_at: string
  definition: PlanDefinition
  parent_snapshot: Task
  items: Array<{
    key: string
    task: Task
    review: TaskReview
    gate: DependencyGate
  }>
}
export type LegacyTaskPlanRead = {
  schema_version: 1 | 2
  unit: 'task_plan'
  task_id: string
  parent: { task_id: string; title: string } | null
  gate: DependencyGate | null
  plan: PublishedPlan | null
}
export type TaskPlanRead = LegacyTaskPlanRead | NestedTaskPlanRead
export type AnyDependencyGate = DependencyGate | NestedGate
export type AnyCreatePreview = PlanPreview | NestedCreatePreview
export type AnyPlanPreview =
  AnyCreatePreview | PlanRevisionPreview | NestedRevisionPreview
export type PlanReceipt = {
  request_id: string
  task_id: string
  preview_hash: string
  state: 'applied'
  result: TaskPlanRead
}
export type AnyPlanReceipt =
  PlanReceipt | PlanRevisionReceipt | NestedPlanReceipt
function fail(): never {
  throw new Error('task_plan_response_invalid')
}
function object(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  [...value].length <= max &&
  !value.includes('\0') &&
  !/[\uD800-\uDFFF]/u.test(value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))
const exact = (value: unknown, min: number, max: number): value is string =>
  text(value, max) && [...value].length >= min && value.trim() === value
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const requestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
const timestamp = (value: unknown): value is string =>
  text(value, 60) && value.includes('T') && Number.isFinite(Date.parse(value))
function strings(value: unknown, max: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every((item) => exact(item, 1, 2000))
  )
}
export function parsePlanDefinition(value: unknown): PlanDefinition {
  if (
    !object(value, ['items']) ||
    !Array.isArray(value.items) ||
    value.items.length < 2 ||
    value.items.length > 8
  )
    fail()
  const items = value.items.map((item) => {
    if (
      !object(item, [
        'key',
        'title',
        'goal',
        'acceptance',
        'files',
        'depends_on',
      ]) ||
      !text(item.key, 32) ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(item.key) ||
      !exact(item.title, 1, 160) ||
      !exact(item.goal, 8, 8000) ||
      !exact(item.acceptance, 1, 4000) ||
      !strings(item.files, 10) ||
      !strings(item.depends_on, 7)
    )
      fail()
    return {
      key: item.key,
      title: item.title,
      goal: item.goal,
      acceptance: item.acceptance,
      files: [...item.files],
      depends_on: [...item.depends_on],
    }
  })
  const byKey = new Map(items.map((item) => [item.key, item]))
  if (byKey.size !== items.length) fail()
  const done = new Set<string>(),
    visiting = new Set<string>()
  function visit(key: string) {
    const item = byKey.get(key)
    if (!item || visiting.has(key)) fail()
    if (done.has(key)) return
    visiting.add(key)
    item.depends_on.forEach(visit)
    visiting.delete(key)
    done.add(key)
  }
  items.forEach((item) => visit(item.key))
  return { items }
}
function task(value: unknown): Task {
  if (
    !object(value, [
      'id',
      'project_id',
      'title',
      'goal',
      'acceptance',
      'files',
      'created_at',
    ]) ||
    !isTaskReadIdentifier(value.id) ||
    !isTaskReadIdentifier(value.project_id) ||
    !text(value.title, 160) ||
    !text(value.goal, 8000) ||
    !text(value.acceptance, 4000) ||
    !strings(value.files, 10) ||
    !timestamp(value.created_at)
  )
    fail()
  return {
    id: value.id,
    project_id: value.project_id,
    title: value.title,
    goal: value.goal,
    acceptance: value.acceptance,
    files: value.files,
    created_at: value.created_at,
  }
}
export function parseTaskReview(value: unknown, taskId?: string): TaskReview {
  if (
    !object(value, ['task_id', 'title', 'latest_run', 'state', 'reports']) ||
    !isTaskReadIdentifier(value.task_id) ||
    (taskId !== undefined && value.task_id !== taskId) ||
    !text(value.title, 160) ||
    !Array.isArray(value.reports) ||
    value.reports.length > 8 ||
    ![
      'no_run',
      'run_unfinished',
      'run_failed',
      'report_missing',
      'report_unavailable',
      'changes_requested',
      'review_pending',
      'accepted',
    ].includes(value.state as string)
  )
    fail()
  const run =
    value.latest_run === null
      ? null
      : parseTaskQueryRun(value.latest_run, value.task_id)
  if (run === undefined) fail()
  const reports = value.reports.map((report) => {
    if (
      !object(report, ['id', 'decision', 'sha256']) ||
      !isTaskReadIdentifier(report.id) ||
      !['pending', 'accepted', 'changes_requested'].includes(
        report.decision as string,
      ) ||
      (report.sha256 !== null && !hash(report.sha256))
    )
      fail()
    return report as TaskReview['reports'][number]
  })
  if (
    new Set(reports.map((report) => report.id)).size !== reports.length ||
    (value.state === 'no_run') !== (run === null) ||
    (value.state === 'run_unfinished' &&
      (!run || ['succeeded', 'failed', 'canceled'].includes(run.status))) ||
    (value.state === 'run_failed' &&
      (!run || !['failed', 'canceled'].includes(run.status))) ||
    ([
      'report_missing',
      'report_unavailable',
      'changes_requested',
      'review_pending',
      'accepted',
    ].includes(value.state as string) &&
      run?.status !== 'succeeded') ||
    (value.state === 'accepted' &&
      (!reports.length ||
        reports.some(
          (report) => report.decision !== 'accepted' || report.sha256 === null,
        ))) ||
    (value.state === 'report_missing' && reports.length !== 0) ||
    (['no_run', 'run_unfinished', 'run_failed'].includes(
      value.state as string,
    ) &&
      reports.length !== 0) ||
    (value.state === 'review_pending' &&
      (!reports.length ||
        reports.every((report) => report.decision === 'accepted')))
  )
    fail()
  return {
    task_id: value.task_id,
    title: value.title,
    latest_run: run,
    state: value.state as ReviewState,
    reports,
  }
}
export function parseDependencyGate(
  value: unknown,
  taskId?: string,
): DependencyGate {
  if (
    value &&
    typeof value === 'object' &&
    (Object.hasOwn(value, 'plan_version') || Object.hasOwn(value, 'membership'))
  ) {
    if (
      !object(value, [
        'task_id',
        'parent_task_id',
        'plan_hash',
        'criterion',
        'ready',
        'prerequisites',
        'plan_version',
        'membership',
      ]) ||
      !Number.isSafeInteger(value.plan_version) ||
      Number(value.plan_version) < 2 ||
      Number(value.plan_version) > 100 ||
      !['current', 'retired'].includes(value.membership as string) ||
      (value.membership === 'retired' &&
        (value.ready !== false ||
          !Array.isArray(value.prerequisites) ||
          value.prerequisites.length !== 0))
    )
      fail()
    const { plan_version, membership, ...legacy } = value
    if (membership === 'retired') {
      const admitted = parseDependencyGate({ ...legacy, ready: true }, taskId)
      return {
        ...admitted,
        ready: false,
        plan_version: plan_version as number,
        membership: 'retired',
      }
    }
    return {
      ...parseDependencyGate(legacy, taskId),
      plan_version: plan_version as number,
      membership: 'current',
    }
  }
  if (
    !object(value, [
      'task_id',
      'parent_task_id',
      'plan_hash',
      'criterion',
      'ready',
      'prerequisites',
    ]) ||
    !isTaskReadIdentifier(value.task_id) ||
    !isTaskReadIdentifier(value.parent_task_id) ||
    value.task_id === value.parent_task_id ||
    (taskId !== undefined && value.task_id !== taskId) ||
    !hash(value.plan_hash) ||
    value.criterion !== dependencyCriterion ||
    typeof value.ready !== 'boolean' ||
    !Array.isArray(value.prerequisites) ||
    value.prerequisites.length > 7
  )
    fail()
  const prerequisites = value.prerequisites.map((item) => parseTaskReview(item))
  if (
    new Set(prerequisites.map((item) => item.task_id)).size !==
      prerequisites.length ||
    prerequisites.some((item) =>
      [value.task_id, value.parent_task_id].includes(item.task_id),
    ) ||
    value.ready !== prerequisites.every((item) => item.state === 'accepted')
  )
    fail()
  return {
    task_id: value.task_id,
    parent_task_id: value.parent_task_id,
    plan_hash: value.plan_hash,
    criterion: dependencyCriterion,
    ready: value.ready,
    prerequisites,
  }
}
export function parsePlanPreview(
  value: unknown,
  parent?: Task,
  definition?: PlanDefinition,
): PlanPreview {
  if (
    !object(value, [
      'parent_snapshot',
      'definition',
      'criterion',
      'preview_hash',
    ]) ||
    value.criterion !== dependencyCriterion ||
    !hash(value.preview_hash)
  )
    fail()
  const parentTask = task(value.parent_snapshot),
    candidate = parsePlanDefinition(value.definition)
  if (parent && JSON.stringify(parentTask) !== JSON.stringify(task(parent)))
    fail()
  if (
    definition &&
    JSON.stringify(candidate) !==
      JSON.stringify(parsePlanDefinition(definition))
  )
    fail()
  if (
    candidate.items.some((item) =>
      item.files.some((file) => !parentTask.files.includes(file)),
    )
  )
    fail()
  return {
    parent_snapshot: parentTask,
    definition: candidate,
    criterion: dependencyCriterion,
    preview_hash: value.preview_hash,
  }
}
export function parseTaskPlan(value: unknown, taskId: string): TaskPlanRead {
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  )
    return parseNestedTaskPlan(value, taskId)
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 2
  )
    return parseRevisionTaskPlan(value, taskId)
  if (
    !object(value, [
      'schema_version',
      'unit',
      'task_id',
      'parent',
      'gate',
      'plan',
    ]) ||
    value.schema_version !== 1 ||
    value.unit !== 'task_plan' ||
    value.task_id !== taskId
  )
    fail()
  const gate =
    value.gate === null ? null : parseDependencyGate(value.gate, taskId)
  if (gate?.plan_version !== undefined) fail()
  let parent: TaskPlanRead['parent'] = null
  if (value.parent !== null) {
    if (
      !object(value.parent, ['task_id', 'title']) ||
      !isTaskReadIdentifier(value.parent.task_id) ||
      !text(value.parent.title, 160) ||
      value.parent.task_id !== gate?.parent_task_id
    )
      fail()
    parent = { task_id: value.parent.task_id, title: value.parent.title }
  }
  if ((parent === null) !== (gate === null)) fail()
  let plan: PublishedPlan | null = null
  if (value.plan !== null) {
    const raw = value.plan
    if (
      parent ||
      !object(raw, [
        'version',
        'parent_task_id',
        'plan_hash',
        'created_at',
        'definition',
        'parent_snapshot',
        'items',
      ]) ||
      raw.version !== 1 ||
      raw.parent_task_id !== taskId ||
      !hash(raw.plan_hash) ||
      !timestamp(raw.created_at) ||
      !Array.isArray(raw.items)
    )
      fail()
    const definition = parsePlanDefinition(raw.definition),
      parentTask = task(raw.parent_snapshot)
    if (
      parentTask.id !== taskId ||
      raw.items.length !== definition.items.length
    )
      fail()
    const items = raw.items.map((entry, index) => {
      if (
        !object(entry, ['key', 'task', 'review', 'gate']) ||
        entry.key !== definition.items[index].key
      )
        fail()
      const child = task(entry.task),
        spec = definition.items[index]
      const review = parseTaskReview(entry.review, child.id),
        childGate = parseDependencyGate(entry.gate, child.id)
      if (
        child.id === taskId ||
        child.project_id !== parentTask.project_id ||
        child.created_at !== raw.created_at ||
        child.title !== spec.title ||
        child.goal !== spec.goal ||
        child.acceptance !== spec.acceptance ||
        JSON.stringify(child.files) !== JSON.stringify(spec.files) ||
        review.title !== child.title ||
        childGate.parent_task_id !== taskId ||
        childGate.plan_hash !== raw.plan_hash ||
        childGate.plan_version !== undefined
      )
        fail()
      return { key: spec.key, task: child, review, gate: childGate }
    })
    if (new Set(items.map((item) => item.task.id)).size !== items.length) fail()
    for (const item of items) {
      const spec = definition.items.find((spec) => spec.key === item.key)!
      const expected = items.filter((other) =>
        spec.depends_on.includes(other.key),
      )
      if (
        JSON.stringify(
          item.gate.prerequisites.map((dependency) => dependency.task_id),
        ) !== JSON.stringify(expected.map((other) => other.task.id)) ||
        item.gate.prerequisites.some(
          (review, index) =>
            JSON.stringify(review) !== JSON.stringify(expected[index].review),
        )
      )
        fail()
    }
    plan = {
      version: 1,
      parent_task_id: taskId,
      plan_hash: raw.plan_hash,
      created_at: raw.created_at,
      definition,
      parent_snapshot: parentTask,
      items,
    }
  }
  return {
    schema_version: 1,
    unit: 'task_plan',
    task_id: taskId,
    parent,
    gate,
    plan,
  }
}
export function parsePlanReceipt(
  value: unknown,
  taskId: string,
  id: string,
  expected?: PlanPreview,
): PlanReceipt {
  if (
    !object(value, [
      'request_id',
      'task_id',
      'preview_hash',
      'state',
      'result',
    ]) ||
    value.request_id !== id ||
    value.task_id !== taskId ||
    !hash(value.preview_hash) ||
    value.state !== 'applied'
  )
    fail()
  const result = parseTaskPlan(value.result, taskId)
  if (
    result.schema_version !== 1 ||
    !result.plan ||
    result.plan.plan_hash !== value.preview_hash ||
    (expected &&
      (expected.preview_hash !== value.preview_hash ||
        JSON.stringify(expected.definition) !==
          JSON.stringify(result.plan.definition) ||
        JSON.stringify(expected.parent_snapshot) !==
          JSON.stringify(result.plan.parent_snapshot)))
  )
    fail()
  return {
    request_id: id,
    task_id: taskId,
    preview_hash: value.preview_hash,
    state: 'applied',
    result,
  }
}
const root = (taskId: string) => {
  if (!isTaskReadIdentifier(taskId)) throw new Error('task_plan_input_invalid')
  return `/tasks/${encodeURIComponent(taskId)}/plan`
}
async function request(path: string, body?: unknown, signal?: AbortSignal) {
  const controller = new AbortController(),
    abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 15000)
  try {
    controller.signal.throwIfAborted()
    const value = await api<unknown>(path, {
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(body) }),
    })
    controller.signal.throwIfAborted()
    return value
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
export async function fetchTaskPlan(
  taskId: string,
  signal?: AbortSignal,
  revisionsEnabled = false,
  nestedEnabled = false,
) {
  const value = await request(root(taskId), undefined, signal)
  if (
    !nestedEnabled &&
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  )
    throw new Error('nested_task_plans_unsupported')
  if (
    !revisionsEnabled &&
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 2
  )
    throw new Error('task_plan_revisions_unsupported')
  return parseTaskPlan(value, taskId)
}
export async function previewTaskPlan(
  parent: Task,
  definition: PlanDefinition,
  signal?: AbortSignal,
  nestedEnabled = false,
) {
  const admitted = parsePlanDefinition(definition)
  const value = await request(`${root(parent.id)}/preview`, admitted, signal)
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  ) {
    if (!nestedEnabled) throw new Error('nested_task_plans_unsupported')
    return parseNestedCreatePreview(value, parent, admitted)
  }
  return parsePlanPreview(value, parent, admitted)
}
export async function createTaskPlan(
  parent: Task,
  id: string,
  preview: AnyCreatePreview,
  signal?: AbortSignal,
  nestedEnabled = false,
) {
  if (!requestId(id)) throw new Error('task_plan_input_invalid')
  if ('schema_version' in preview) {
    if (!nestedEnabled) throw new Error('nested_task_plans_unsupported')
    const admitted = parseNestedCreatePreview(preview, parent)
    if (admitted.impact.blockers.length)
      throw new Error('task_plan_nested_busy')
    return parseNestedReceipt(
      await request(
        root(parent.id),
        {
          ...admitted.definition,
          request_id: id,
          preview_hash: admitted.preview_hash,
          consent: true,
        },
        signal,
      ),
      parent.id,
      id,
      admitted,
    )
  }
  const admitted = parsePlanPreview(preview, parent)
  return parsePlanReceipt(
    await request(
      root(parent.id),
      {
        ...admitted.definition,
        request_id: id,
        preview_hash: admitted.preview_hash,
        consent: true,
      },
      signal,
    ),
    parent.id,
    id,
    admitted,
  )
}
export async function fetchPlanOperation(
  taskId: string,
  id: string,
  signal?: AbortSignal,
  expected?: AnyPlanPreview,
): Promise<AnyPlanReceipt> {
  if (!requestId(id)) throw new Error('task_plan_input_invalid')
  const value = await request(
    `${root(taskId)}/operations/${encodeURIComponent(id)}`,
    undefined,
    signal,
  )
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  ) {
    if (
      expected &&
      (!('schema_version' in expected) || expected.schema_version !== 3)
    )
      fail()
    return parseNestedReceipt(
      value,
      taskId,
      id,
      expected && 'schema_version' in expected && expected.schema_version === 3
        ? expected
        : undefined,
    )
  }
  if (expected && 'schema_version' in expected && expected.schema_version === 3)
    fail()
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 2
  ) {
    if (expected && !('schema_version' in expected)) fail()
    return parseRevisionReceipt(
      value,
      taskId,
      id,
      expected && 'schema_version' in expected ? expected : undefined,
    )
  }
  if (expected && 'schema_version' in expected) fail()
  return parsePlanReceipt(value, taskId, id, expected)
}
export function parseAnyDependencyGate(
  value: unknown,
  taskId?: string,
): AnyDependencyGate {
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  )
    return parseNestedGate(value, taskId)
  return parseDependencyGate(value, taskId)
}

export {
  object as planObject,
  text as planText,
  hash as planHash,
  requestId as planRequestId,
  timestamp as planTimestamp,
  task as parsePlanTask,
  request as planRequest,
  root as planRoot,
}
