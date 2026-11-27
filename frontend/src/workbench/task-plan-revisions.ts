import type { Task } from './api'
import { isTaskReadIdentifier, maxTaskQueryPage } from './task-query'
import {
  dependencyCriterion,
  parseDependencyGate,
  parsePlanDefinition,
  parsePlanTask,
  parseTaskReview,
  planHash,
  planObject,
  planRequest,
  planRequestId,
  planRoot,
  planText,
  planTimestamp,
  type PlanDefinition,
  type PublishedPlan,
  type TaskPlanRead,
  type LegacyTaskPlanRead,
} from './task-plans'
import {
  parseNestedRevisionPreview,
  parseNestedReceipt,
  type NestedRevisionPreview,
} from './task-plan-nesting'

export type PlanVersion = {
  version: number
  parent_task_id: string
  plan_hash: string
  created_at: string
  definition: PlanDefinition
  parent_snapshot: Task
  bindings: Array<{ key: string; task: Task }>
}
export type PlanRevisionPreview = {
  schema_version: 2
  unit: 'task_plan_revision_preview'
  parent_task_id: string
  expected_version: number
  expected_plan_hash: string
  baseline: PlanVersion
  parent_snapshot: Task
  definition: PlanDefinition
  impact: {
    added_keys: string[]
    replaced_keys: string[]
    reused_keys: string[]
    removed_keys: string[]
    retired_task_ids: string[]
    blockers: Array<{
      task_id: string
      reasons: Array<
        | 'unfinished_run'
        | 'prepared_turn'
        | 'prepared_coding'
        | 'unresolved_recovery'
        | 'unconsumed_grant'
      >
    }>
  }
  preview_hash: string
}
export type PlanRevisionReceipt = {
  schema_version: 2
  operation: 'revise'
  request_id: string
  task_id: string
  preview_hash: string
  state: 'applied'
  result: TaskPlanRead
}
export type PlanVersionPage = {
  schema_version: 2
  parent_task_id: string
  items: PlanVersion[]
  total: number
  requested_page: number
  page: number
  page_size: 20
  total_pages: number
  has_more: boolean
}
function fail(): never {
  throw new Error('task_plan_revision_response_invalid')
}
const integer = (value: unknown, min = 1, max = 100): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const identifiers = (value: unknown, max = 8): value is string[] =>
  Array.isArray(value) &&
  value.length <= max &&
  new Set(value).size === value.length &&
  value.every(isTaskReadIdentifier)

export function planVersionFromCurrent(
  plan: Omit<PublishedPlan, 'items'> & {
    items: Array<{ key: string; task: Task }>
  },
): PlanVersion {
  return parsePlanVersion(
    {
      version: plan.version,
      parent_task_id: plan.parent_task_id,
      plan_hash: plan.plan_hash,
      created_at: plan.created_at,
      definition: plan.definition,
      parent_snapshot: plan.parent_snapshot,
      bindings: plan.items.map(({ key, task }) => ({ key, task })),
    },
    plan.parent_task_id,
  )
}
export function parsePlanVersion(
  value: unknown,
  parentId: string,
  expectedVersion?: number,
): PlanVersion {
  if (
    !planObject(value, [
      'version',
      'parent_task_id',
      'plan_hash',
      'created_at',
      'definition',
      'parent_snapshot',
      'bindings',
    ]) ||
    !integer(value.version) ||
    (expectedVersion !== undefined && value.version !== expectedVersion) ||
    value.parent_task_id !== parentId ||
    !isTaskReadIdentifier(parentId) ||
    !planHash(value.plan_hash) ||
    !planTimestamp(value.created_at) ||
    !Array.isArray(value.bindings)
  )
    fail()
  const definition = parsePlanDefinition(value.definition)
  const parent = parsePlanTask(value.parent_snapshot)
  if (
    parent.id !== parentId ||
    value.bindings.length !== definition.items.length
  )
    fail()
  const bindings = value.bindings.map((binding, index) => {
    if (
      !planObject(binding, ['key', 'task']) ||
      binding.key !== definition.items[index].key
    )
      fail()
    const task = parsePlanTask(binding.task),
      spec = definition.items[index]
    if (
      task.id === parentId ||
      task.project_id !== parent.project_id ||
      task.title !== spec.title ||
      task.goal !== spec.goal ||
      task.acceptance !== spec.acceptance ||
      !same(task.files, spec.files) ||
      spec.files.some((file) => !parent.files.includes(file))
    )
      fail()
    return { key: spec.key, task }
  })
  if (new Set(bindings.map((item) => item.task.id)).size !== bindings.length)
    fail()
  return {
    version: value.version,
    parent_task_id: parentId,
    plan_hash: value.plan_hash,
    created_at: value.created_at,
    definition,
    parent_snapshot: parent,
    bindings,
  }
}
export function parseRevisionTaskPlan(
  value: unknown,
  taskId: string,
): LegacyTaskPlanRead {
  if (
    !planObject(value, [
      'schema_version',
      'unit',
      'task_id',
      'parent',
      'gate',
      'plan',
    ]) ||
    value.schema_version !== 2 ||
    value.unit !== 'task_plan' ||
    value.task_id !== taskId
  )
    fail()
  const gate =
    value.gate === null ? null : parseDependencyGate(value.gate, taskId)
  if (gate && gate.plan_version === undefined) fail()
  let parent: LegacyTaskPlanRead['parent'] = null
  if (value.parent !== null) {
    if (
      !planObject(value.parent, ['task_id', 'title']) ||
      value.parent.task_id !== gate?.parent_task_id ||
      !isTaskReadIdentifier(value.parent.task_id) ||
      !planText(value.parent.title, 160)
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
      !planObject(raw, [
        'version',
        'parent_task_id',
        'plan_hash',
        'created_at',
        'definition',
        'parent_snapshot',
        'items',
      ]) ||
      !integer(raw.version, 2) ||
      !Array.isArray(raw.items)
    )
      fail()
    const { items: entries, ...versionFields } = raw
    const snapshot = parsePlanVersion(
      {
        ...versionFields,
        bindings: entries.map((entry) => {
          if (!planObject(entry, ['key', 'task', 'review', 'gate'])) fail()
          return { key: entry.key, task: entry.task }
        }),
      } as unknown,
      taskId,
    )
    // Version snapshots deliberately exclude live review and dependency facts.
    const items = raw.items.map((entry, index) => {
      const binding = snapshot.bindings[index]
      const review = parseTaskReview(entry.review, binding.task.id)
      const itemGate = parseDependencyGate(entry.gate, binding.task.id)
      if (
        review.title !== binding.task.title ||
        itemGate.parent_task_id !== taskId ||
        itemGate.plan_hash !== snapshot.plan_hash ||
        itemGate.plan_version !== snapshot.version ||
        itemGate.membership !== 'current'
      )
        fail()
      return { ...binding, review, gate: itemGate }
    })
    for (const item of items) {
      const spec = snapshot.definition.items.find(
        (spec) => spec.key === item.key,
      )!
      const expected = items.filter((other) =>
        spec.depends_on.includes(other.key),
      )
      if (
        !same(
          item.gate.prerequisites,
          expected.map((other) => other.review),
        )
      )
        fail()
    }
    plan = {
      version: snapshot.version,
      parent_task_id: taskId,
      plan_hash: snapshot.plan_hash,
      created_at: snapshot.created_at,
      definition: snapshot.definition,
      parent_snapshot: snapshot.parent_snapshot,
      items,
    }
  }
  if (!plan && !gate) fail()
  return {
    schema_version: 2,
    unit: 'task_plan',
    task_id: taskId,
    parent,
    gate,
    plan,
  }
}
export function parsePlanRevisionPreview(
  value: unknown,
  parent: Task,
  baseline: PlanVersion,
  definition: PlanDefinition,
): PlanRevisionPreview {
  if (
    !planObject(value, [
      'schema_version',
      'unit',
      'parent_task_id',
      'expected_version',
      'expected_plan_hash',
      'baseline',
      'parent_snapshot',
      'definition',
      'impact',
      'preview_hash',
    ]) ||
    value.schema_version !== 2 ||
    value.unit !== 'task_plan_revision_preview' ||
    value.parent_task_id !== parent.id ||
    value.expected_version !== baseline.version ||
    value.expected_plan_hash !== baseline.plan_hash ||
    !planHash(value.preview_hash)
  )
    fail()
  const saved = parsePlanVersion(value.baseline, parent.id, baseline.version)
  const currentParent = parsePlanTask(value.parent_snapshot)
  const candidate = parsePlanDefinition(value.definition)
  if (
    !same(saved, parsePlanVersion(baseline, parent.id)) ||
    !same(currentParent, parsePlanTask(parent)) ||
    !same(candidate, parsePlanDefinition(definition)) ||
    candidate.items.some((item) =>
      item.files.some((file) => !currentParent.files.includes(file)),
    )
  )
    fail()
  const impact = value.impact
  if (
    !planObject(impact, [
      'added_keys',
      'replaced_keys',
      'reused_keys',
      'removed_keys',
      'retired_task_ids',
      'blockers',
    ])
  )
    fail()
  for (const key of [
    'added_keys',
    'replaced_keys',
    'reused_keys',
    'removed_keys',
    'retired_task_ids',
  ])
    if (!identifiers(impact[key])) fail()
  const added = impact.added_keys as string[],
    replaced = impact.replaced_keys as string[],
    reused = impact.reused_keys as string[],
    removed = impact.removed_keys as string[],
    retired = impact.retired_task_ids as string[]
  const oldKeys = saved.definition.items.map((item) => item.key)
  const keys = candidate.items.map((item) => item.key)
  const assigned = [...added, ...replaced, ...reused]
  const retiredExpected = saved.bindings
    .filter((item) => replaced.includes(item.key) || removed.includes(item.key))
    .map((item) => item.task.id)
  const invalidReuse = reused.some((key) => {
    const before = saved.definition.items.find((item) => item.key === key)
    const after = candidate.items.find((item) => item.key === key)
    return (
      !before ||
      !after ||
      before.title !== after.title ||
      before.goal !== after.goal ||
      before.acceptance !== after.acceptance ||
      !same(before.files, after.files) ||
      !same([...before.depends_on].sort(), [...after.depends_on].sort()) ||
      after.depends_on.some((dependency) => !reused.includes(dependency))
    )
  })
  if (
    new Set(assigned).size !== assigned.length ||
    assigned.length !== keys.length ||
    assigned.some((key) => !keys.includes(key)) ||
    invalidReuse ||
    added.some((key) => oldKeys.includes(key)) ||
    [...replaced, ...reused].some((key) => !oldKeys.includes(key)) ||
    !same(
      removed,
      oldKeys.filter((key) => !keys.includes(key)),
    ) ||
    retired.length !== retiredExpected.length ||
    retired.some((id) => !retiredExpected.includes(id)) ||
    !Array.isArray(impact.blockers) ||
    impact.blockers.length > 8
  )
    fail()
  const blockers = impact.blockers.map((blocker) => {
    if (
      !planObject(blocker, ['task_id', 'reasons']) ||
      !retired.includes(blocker.task_id as string) ||
      !Array.isArray(blocker.reasons) ||
      !blocker.reasons.length ||
      blocker.reasons.length > 5 ||
      new Set(blocker.reasons).size !== blocker.reasons.length ||
      blocker.reasons.some(
        (reason) =>
          ![
            'unfinished_run',
            'prepared_turn',
            'prepared_coding',
            'unresolved_recovery',
            'unconsumed_grant',
          ].includes(reason),
      )
    )
      fail()
    return blocker as PlanRevisionPreview['impact']['blockers'][number]
  })
  if (new Set(blockers.map((item) => item.task_id)).size !== blockers.length)
    fail()
  return {
    schema_version: 2,
    unit: 'task_plan_revision_preview',
    parent_task_id: parent.id,
    expected_version: baseline.version,
    expected_plan_hash: baseline.plan_hash,
    baseline: saved,
    parent_snapshot: currentParent,
    definition: candidate,
    impact: {
      added_keys: added,
      replaced_keys: replaced,
      reused_keys: reused,
      removed_keys: removed,
      retired_task_ids: retired,
      blockers,
    },
    preview_hash: value.preview_hash,
  }
}
export function parseRevisionReceipt(
  value: unknown,
  taskId: string,
  id: string,
  expected?: PlanRevisionPreview,
): PlanRevisionReceipt {
  if (
    !planObject(value, [
      'schema_version',
      'operation',
      'request_id',
      'task_id',
      'preview_hash',
      'state',
      'result',
    ]) ||
    value.schema_version !== 2 ||
    value.operation !== 'revise' ||
    value.request_id !== id ||
    value.task_id !== taskId ||
    !planHash(value.preview_hash) ||
    value.state !== 'applied'
  )
    fail()
  const result = parseRevisionTaskPlan(value.result, taskId)
  if (
    !result.plan ||
    result.plan.plan_hash !== value.preview_hash ||
    (expected &&
      (value.preview_hash !== expected.preview_hash ||
        result.plan.version !== expected.expected_version + 1 ||
        !same(result.plan.definition, expected.definition) ||
        !same(result.plan.parent_snapshot, expected.parent_snapshot) ||
        expected.impact.reused_keys.some((key) => {
          const old = expected.baseline.bindings.find(
            (item) => item.key === key,
          )!
          return !same(
            result.plan!.items.find((item) => item.key === key)?.task,
            old.task,
          )
        }) ||
        [...expected.impact.replaced_keys, ...expected.impact.added_keys].some(
          (key) => {
            const item = result.plan!.items.find((item) => item.key === key)!
            return expected.baseline.bindings.some(
              (old) => old.task.id === item.task.id,
            )
          },
        )))
  )
    fail()
  return {
    schema_version: 2,
    operation: 'revise',
    request_id: id,
    task_id: taskId,
    preview_hash: value.preview_hash,
    state: 'applied',
    result,
  }
}
export async function previewPlanRevision(
  parent: Task,
  baseline: PlanVersion,
  definition: PlanDefinition,
  signal?: AbortSignal,
  nestedEnabled = false,
) {
  const admitted = parsePlanDefinition(definition)
  const saved = parsePlanVersion(baseline, parent.id)
  const value = await planRequest(
    `${planRoot(parent.id)}/revisions/preview`,
    {
      expected_version: saved.version,
      expected_plan_hash: saved.plan_hash,
      ...admitted,
    },
    signal,
  )
  if (
    value &&
    typeof value === 'object' &&
    (value as { schema_version?: unknown }).schema_version === 3
  ) {
    if (!nestedEnabled) throw new Error('nested_task_plans_unsupported')
    return parseNestedRevisionPreview(value, parent, saved, admitted)
  }
  return parsePlanRevisionPreview(value, parent, saved, admitted)
}
export async function publishPlanRevision(
  parent: Task,
  id: string,
  preview: PlanRevisionPreview | NestedRevisionPreview,
  signal?: AbortSignal,
  nestedEnabled = false,
) {
  if (!planRequestId(id)) throw new Error('task_plan_input_invalid')
  if (preview.schema_version === 3) {
    if (!nestedEnabled) throw new Error('nested_task_plans_unsupported')
    const admitted = parseNestedRevisionPreview(
      preview,
      parent,
      preview.baseline,
      preview.definition,
    )
    if (admitted.impact.blockers.length)
      throw new Error('task_plan_nested_busy')
    return parseNestedReceipt(
      await planRequest(
        `${planRoot(parent.id)}/revisions`,
        {
          expected_version: admitted.expected_version,
          expected_plan_hash: admitted.expected_plan_hash,
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
  const admitted = parsePlanRevisionPreview(
    preview,
    parent,
    preview.baseline,
    preview.definition,
  )
  if (admitted.impact.blockers.length)
    throw new Error('task_plan_revision_blocked')
  return parseRevisionReceipt(
    await planRequest(
      `${planRoot(parent.id)}/revisions`,
      {
        expected_version: admitted.expected_version,
        expected_plan_hash: admitted.expected_plan_hash,
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
export function parsePlanVersionPage(
  value: unknown,
  taskId: string,
  requested: number,
): PlanVersionPage {
  if (
    !planObject(value, [
      'schema_version',
      'parent_task_id',
      'items',
      'total',
      'requested_page',
      'page',
      'page_size',
      'total_pages',
      'has_more',
    ]) ||
    value.schema_version !== 2 ||
    value.parent_task_id !== taskId ||
    !integer(value.total, 1) ||
    value.requested_page !== requested ||
    value.page_size !== 20 ||
    !Array.isArray(value.items)
  )
    fail()
  const pages = Math.max(1, Math.ceil(value.total / 20)),
    page = Math.min(pages, requested)
  if (
    value.total_pages !== pages ||
    value.page !== page ||
    value.has_more !== page < pages ||
    value.items.length !== Math.min(20, value.total - (page - 1) * 20)
  )
    fail()
  const items = value.items.map((item, index) =>
    parsePlanVersion(
      item,
      taskId,
      (value.total as number) - (page - 1) * 20 - index,
    ),
  )
  return {
    schema_version: 2,
    parent_task_id: taskId,
    items,
    total: value.total,
    requested_page: requested,
    page,
    page_size: 20,
    total_pages: pages,
    has_more: page < pages,
  }
}
export async function fetchPlanVersions(
  taskId: string,
  page: number,
  signal?: AbortSignal,
  revisionsEnabled = false,
) {
  if (!revisionsEnabled) throw new Error('task_plan_revisions_unsupported')
  if (!integer(page, 1, maxTaskQueryPage))
    throw new Error('task_plan_input_invalid')
  return parsePlanVersionPage(
    await planRequest(
      `${planRoot(taskId)}/versions?page=${page}`,
      undefined,
      signal,
    ),
    taskId,
    page,
  )
}
