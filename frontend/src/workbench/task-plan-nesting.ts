import type { Run, Task } from './api'
import { isTaskReadIdentifier, parseTaskQueryRun } from './task-query'
import {
  parsePlanDefinition,
  parsePlanTask,
  parseTaskReview,
  planObject,
  planText,
  planHash,
  type PlanDefinition,
  type ReviewState,
  type TaskReview,
} from './task-plans'
import {
  parsePlanVersion,
  parsePlanRevisionPreview,
  type PlanVersion,
  type PlanRevisionPreview,
} from './task-plan-revisions'

export const nestedCriterion =
  'nested-children-and-reviewed-integration-v1' as const
export type OutcomeState =
  ReviewState | 'children_pending' | 'integration_stale' | 'retired'
export type OutcomeSummary = {
  task_id: string
  title: string
  state: OutcomeState
  completion_hash: string
}
export type NestedOwnPlan<T> = {
  version: number
  plan_hash: string
  completion_scope_hash: string
  ready: boolean
  children: T[]
}
export type TaskOutcome = OutcomeSummary & {
  kind: 'run' | 'plan'
  latest_run: Run | null
  reports: TaskReview['reports']
  own_plan: NestedOwnPlan<OutcomeSummary> | null
}
export type PlanLineage = {
  task_id: string
  parent_task_id: string
  plan_version: number
  plan_hash: string
  membership: 'current' | 'retired'
}
export type NestedGate = {
  schema_version: 3
  task_id: string
  parent_task_id: string | null
  root_task_id: string
  depth: number
  membership: 'current' | 'retired'
  ready: boolean
  scope_hash: string
  external_scopes: Array<PlanLineage & { prerequisites: TaskOutcome[] }>
  own_plan: NestedOwnPlan<TaskOutcome> | null
}
export type NestedPublishedPlan = {
  version: number
  parent_task_id: string
  plan_hash: string
  created_at: string
  definition: PlanDefinition
  parent_snapshot: Task
  items: Array<{
    key: string
    task: Task
    review: TaskOutcome
    gate: NestedGate
  }>
}
export type NestedTaskPlanRead = {
  schema_version: 3
  unit: 'task_plan'
  task_id: string
  root_task_id: string
  depth: number
  parent: { task_id: string; title: string } | null
  gate: NestedGate
  plan: NestedPublishedPlan | null
}
export type TreeHead = { task_id: string; version: number; plan_hash: string }
export type PlanBlocker = PlanRevisionPreview['impact']['blockers'][number]
export type NestedCreatePreview = {
  schema_version: 3
  unit: 'task_plan_preview'
  parent_task_id: string
  parent_snapshot: Task
  definition: PlanDefinition
  criterion: typeof nestedCriterion
  lineage: PlanLineage[]
  tree_heads: TreeHead[]
  impact: {
    root_task_id: string
    depth: number
    current_task_count: number
    added_tasks: number
    retired_task_ids: string[]
    blockers: PlanBlocker[]
  }
  preview_hash: string
}
export type NestedRevisionPreview = Omit<
  PlanRevisionPreview,
  'schema_version' | 'impact'
> & {
  schema_version: 3
  lineage: PlanLineage[]
  tree_heads: TreeHead[]
  impact: PlanRevisionPreview['impact'] & {
    subtree_retired_task_ids: string[]
    root_task_id: string
    depth: number
    current_task_count: number
  }
}
export type NestedPlanReceipt = {
  schema_version: 3
  operation: 'create' | 'revise'
  request_id: string
  task_id: string
  preview_hash: string
  state: 'applied'
  result: NestedTaskPlanRead
}
function fail(): never {
  throw new Error('task_plan_nested_response_invalid')
}
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const states: OutcomeState[] = [
  'no_run',
  'run_unfinished',
  'run_failed',
  'report_missing',
  'report_unavailable',
  'changes_requested',
  'review_pending',
  'accepted',
  'children_pending',
  'integration_stale',
  'retired',
]
function ids(value: unknown, max = 73): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    new Set(value).size === value.length &&
    value.every(isTaskReadIdentifier)
  )
}
function summary(value: unknown): OutcomeSummary {
  if (
    !planObject(value, ['task_id', 'title', 'state', 'completion_hash']) ||
    !isTaskReadIdentifier(value.task_id) ||
    !planText(value.title, 160) ||
    !states.includes(value.state as OutcomeState) ||
    !planHash(value.completion_hash)
  )
    fail()
  return value as OutcomeSummary
}
function ownPlan<T extends OutcomeSummary>(
  value: unknown,
  parser: (value: unknown) => T,
): NestedOwnPlan<T> {
  if (
    !planObject(value, [
      'version',
      'plan_hash',
      'completion_scope_hash',
      'ready',
      'children',
    ]) ||
    !integer(value.version, 1, 100) ||
    !planHash(value.plan_hash) ||
    !planHash(value.completion_scope_hash) ||
    typeof value.ready !== 'boolean' ||
    !Array.isArray(value.children) ||
    value.children.length < 2 ||
    value.children.length > 8
  )
    fail()
  const children = value.children.map(parser)
  if (
    new Set(children.map((child) => child.task_id)).size !== children.length ||
    value.ready !== children.every((child) => child.state === 'accepted')
  )
    fail()
  return {
    version: value.version,
    plan_hash: value.plan_hash,
    completion_scope_hash: value.completion_scope_hash,
    ready: value.ready,
    children,
  }
}
export function parseTaskOutcome(value: unknown, taskId?: string): TaskOutcome {
  if (
    !planObject(value, [
      'task_id',
      'title',
      'kind',
      'state',
      'latest_run',
      'reports',
      'completion_hash',
      'own_plan',
    ]) ||
    !['run', 'plan'].includes(value.kind as string)
  )
    fail()
  const result = summary({
    task_id: value.task_id,
    title: value.title,
    state: value.state,
    completion_hash: value.completion_hash,
  })
  if (taskId !== undefined && result.task_id !== taskId) fail()
  const run =
    value.latest_run === null
      ? null
      : parseTaskQueryRun(value.latest_run, result.task_id)
  if (
    run === undefined ||
    !Array.isArray(value.reports) ||
    value.reports.length > 8
  )
    fail()
  const reports = value.reports.map((report) => {
    if (
      !planObject(report, ['id', 'decision', 'sha256']) ||
      !isTaskReadIdentifier(report.id) ||
      !['pending', 'accepted', 'changes_requested'].includes(
        report.decision as string,
      ) ||
      (report.sha256 !== null && !planHash(report.sha256))
    )
      fail()
    return report as TaskReview['reports'][number]
  })
  if (new Set(reports.map((report) => report.id)).size !== reports.length)
    fail()
  const own = value.own_plan === null ? null : ownPlan(value.own_plan, summary)
  if (
    (value.kind === 'plan') !== (own !== null) ||
    own?.children.some((child) => child.task_id === result.task_id)
  )
    fail()
  if (['children_pending', 'integration_stale'].includes(result.state) && !own)
    fail()
  if (
    own &&
    result.state !== 'retired' &&
    (result.state === 'children_pending') !== !own.ready
  )
    fail()
  if (!['children_pending', 'retired'].includes(result.state))
    parseTaskReview(
      {
        task_id: result.task_id,
        title: result.title,
        state: result.state === 'integration_stale' ? 'accepted' : result.state,
        latest_run: run,
        reports,
      },
      result.task_id,
    )
  return {
    ...result,
    kind: value.kind as TaskOutcome['kind'],
    latest_run: run,
    reports,
    own_plan: own,
  }
}
function lineage(
  value: unknown,
  taskId: string,
  rootId: string,
  depth: number,
): PlanLineage[] {
  if (!Array.isArray(value) || value.length !== depth) fail()
  let current = taskId
  const seen = new Set([taskId])
  const result = value.map((level) => {
    if (
      !planObject(level, [
        'task_id',
        'parent_task_id',
        'plan_version',
        'plan_hash',
        'membership',
      ]) ||
      level.task_id !== current ||
      !isTaskReadIdentifier(level.parent_task_id) ||
      seen.has(level.parent_task_id) ||
      !integer(level.plan_version, 1, 100) ||
      !planHash(level.plan_hash) ||
      !['current', 'retired'].includes(level.membership as string)
    )
      fail()
    current = level.parent_task_id
    seen.add(current)
    return level as PlanLineage
  })
  if (current !== rootId) fail()
  return result
}
export function parseNestedGate(value: unknown, taskId?: string): NestedGate {
  if (
    !planObject(value, [
      'schema_version',
      'task_id',
      'parent_task_id',
      'root_task_id',
      'depth',
      'membership',
      'ready',
      'scope_hash',
      'external_scopes',
      'own_plan',
    ]) ||
    value.schema_version !== 3 ||
    !isTaskReadIdentifier(value.task_id) ||
    (taskId !== undefined && value.task_id !== taskId) ||
    !isTaskReadIdentifier(value.root_task_id) ||
    !integer(value.depth, 0, 2) ||
    !['current', 'retired'].includes(value.membership as string) ||
    typeof value.ready !== 'boolean' ||
    !planHash(value.scope_hash) ||
    !Array.isArray(value.external_scopes)
  )
    fail()
  const levels = value.external_scopes.map((scope) => {
    if (
      !planObject(scope, [
        'task_id',
        'parent_task_id',
        'plan_version',
        'plan_hash',
        'membership',
        'prerequisites',
      ]) ||
      !Array.isArray(scope.prerequisites) ||
      scope.prerequisites.length > 7
    )
      fail()
    const { prerequisites, ...level } = scope
    return {
      level,
      prerequisites: prerequisites.map((item) => parseTaskOutcome(item)),
    }
  })
  const admitted = lineage(
    levels.map((scope) => scope.level),
    value.task_id,
    value.root_task_id,
    value.depth,
  )
  const scopes = levels.map((scope, index) => {
    const level = admitted[index]
    if (
      new Set(scope.prerequisites.map((item) => item.task_id)).size !==
        scope.prerequisites.length ||
      scope.prerequisites.some((item) =>
        [level.task_id, level.parent_task_id].includes(item.task_id),
      )
    )
      fail()
    return { ...level, prerequisites: scope.prerequisites }
  })
  const own =
    value.own_plan === null
      ? null
      : ownPlan(value.own_plan, (item) => parseTaskOutcome(item))
  if (
    value.parent_task_id !== (admitted[0]?.parent_task_id ?? null) ||
    (value.membership === 'current') !==
      admitted.every((level) => level.membership === 'current') ||
    (value.depth === 2 && own !== null) ||
    own?.children.some((child) => child.task_id === value.task_id) ||
    value.ready !==
      (value.membership === 'current' &&
        scopes.every((scope) =>
          scope.prerequisites.every((item) => item.state === 'accepted'),
        ) &&
        (own === null || own.ready))
  )
    fail()
  return {
    schema_version: 3,
    task_id: value.task_id,
    parent_task_id: value.parent_task_id as string | null,
    root_task_id: value.root_task_id,
    depth: value.depth,
    membership: value.membership as NestedGate['membership'],
    ready: value.ready,
    scope_hash: value.scope_hash,
    external_scopes: scopes,
    own_plan: own,
  }
}
export function parseNestedTaskPlan(
  value: unknown,
  taskId: string,
): NestedTaskPlanRead {
  if (
    !planObject(value, [
      'schema_version',
      'unit',
      'task_id',
      'root_task_id',
      'depth',
      'parent',
      'gate',
      'plan',
    ]) ||
    value.schema_version !== 3 ||
    value.unit !== 'task_plan' ||
    value.task_id !== taskId
  )
    fail()
  const gate = parseNestedGate(value.gate, taskId)
  if (value.root_task_id !== gate.root_task_id || value.depth !== gate.depth)
    fail()
  let parent: NestedTaskPlanRead['parent'] = null
  if (value.parent !== null) {
    if (
      !planObject(value.parent, ['task_id', 'title']) ||
      value.parent.task_id !== gate.parent_task_id ||
      !planText(value.parent.title, 160)
    )
      fail()
    parent = {
      task_id: value.parent.task_id as string,
      title: value.parent.title,
    }
  }
  if ((parent === null) !== (gate.parent_task_id === null)) fail()
  let plan: NestedPublishedPlan | null = null
  if (value.plan !== null) {
    const raw = value.plan
    if (
      !planObject(raw, [
        'version',
        'parent_task_id',
        'plan_hash',
        'created_at',
        'definition',
        'parent_snapshot',
        'items',
      ]) ||
      !Array.isArray(raw.items)
    )
      fail()
    const { items: entries, ...fields } = raw
    const version = parsePlanVersion(
      {
        ...fields,
        bindings: entries.map((entry) => {
          if (!planObject(entry, ['key', 'task', 'review', 'gate'])) fail()
          return { key: entry.key, task: entry.task }
        }),
      },
      taskId,
    )
    const items = entries.map((entry, index) => {
      const binding = version.bindings[index]
      const review = parseTaskOutcome(entry.review, binding.task.id)
      const childGate = parseNestedGate(entry.gate, binding.task.id)
      if (
        review.title !== binding.task.title ||
        childGate.parent_task_id !== taskId ||
        childGate.depth !== gate.depth + 1 ||
        childGate.root_task_id !== gate.root_task_id ||
        childGate.external_scopes[0]?.plan_version !== version.version ||
        childGate.external_scopes[0]?.plan_hash !== version.plan_hash ||
        childGate.membership !== gate.membership
      )
        fail()
      if (
        !same(
          review.own_plan,
          childGate.own_plan === null
            ? null
            : {
                ...childGate.own_plan,
                children: childGate.own_plan.children.map((child) => ({
                  task_id: child.task_id,
                  title: child.title,
                  state: child.state,
                  completion_hash: child.completion_hash,
                })),
              },
        )
      )
        fail()
      return { ...binding, review, gate: childGate }
    })
    if (
      !gate.own_plan ||
      gate.own_plan.version !== version.version ||
      gate.own_plan.plan_hash !== version.plan_hash ||
      !same(
        items.map((item) => item.review),
        gate.own_plan.children,
      )
    )
      fail()
    for (const item of items) {
      const spec = version.definition.items.find(
        (entry) => entry.key === item.key,
      )!
      const expected = items
        .filter((other) => spec.depends_on.includes(other.key))
        .map((other) => other.review)
      if (
        !same(item.gate.external_scopes[0]?.prerequisites, expected) ||
        !same(item.gate.external_scopes.slice(1), gate.external_scopes)
      )
        fail()
    }
    plan = {
      version: version.version,
      parent_task_id: taskId,
      plan_hash: version.plan_hash,
      created_at: version.created_at,
      definition: version.definition,
      parent_snapshot: version.parent_snapshot,
      items,
    }
  } else if (gate.own_plan !== null) fail()
  return {
    schema_version: 3,
    unit: 'task_plan',
    task_id: taskId,
    root_task_id: gate.root_task_id,
    depth: gate.depth,
    parent,
    gate,
    plan,
  }
}
function blockers(value: unknown): PlanBlocker[] {
  if (!Array.isArray(value) || value.length > 73) fail()
  const items = value.map((item) => {
    if (
      !planObject(item, ['task_id', 'reasons']) ||
      !isTaskReadIdentifier(item.task_id) ||
      !Array.isArray(item.reasons) ||
      !item.reasons.length ||
      item.reasons.length > 5 ||
      new Set(item.reasons).size !== item.reasons.length ||
      item.reasons.some(
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
    return item as PlanBlocker
  })
  if (new Set(items.map((item) => item.task_id)).size !== items.length) fail()
  return items
}
function structure(
  value: Record<string, unknown>,
  taskId: string,
  rootId: unknown,
  depth: unknown,
  count: unknown,
) {
  if (
    !isTaskReadIdentifier(rootId) ||
    !integer(depth, 0, 1) ||
    !integer(count, 1, 73)
  )
    fail()
  const levels = lineage(value.lineage, taskId, rootId, depth)
  if (
    levels.some((level) => level.membership !== 'current') ||
    !Array.isArray(value.tree_heads) ||
    !value.tree_heads.length ||
    value.tree_heads.length > 9
  )
    fail()
  const heads = value.tree_heads.map((head) => {
    if (
      !planObject(head, ['task_id', 'version', 'plan_hash']) ||
      !isTaskReadIdentifier(head.task_id) ||
      !integer(head.version, 1, 100) ||
      !planHash(head.plan_hash)
    )
      fail()
    return head as TreeHead
  })
  if (
    new Set(heads.map((head) => head.task_id)).size !== heads.length ||
    heads[0].task_id !== rootId ||
    levels.some(
      (level) =>
        !heads.some(
          (head) =>
            head.task_id === level.parent_task_id &&
            head.version === level.plan_version &&
            head.plan_hash === level.plan_hash,
        ),
    )
  )
    fail()
  return {
    lineage: levels,
    tree_heads: heads,
    root_task_id: rootId,
    depth,
    current_task_count: count,
  }
}
export function parseNestedCreatePreview(
  value: unknown,
  parent: Task,
  definition?: PlanDefinition,
): NestedCreatePreview {
  if (
    !planObject(value, [
      'schema_version',
      'unit',
      'parent_task_id',
      'parent_snapshot',
      'definition',
      'criterion',
      'lineage',
      'tree_heads',
      'impact',
      'preview_hash',
    ]) ||
    value.schema_version !== 3 ||
    value.unit !== 'task_plan_preview' ||
    value.parent_task_id !== parent.id ||
    value.criterion !== nestedCriterion ||
    !planHash(value.preview_hash) ||
    !planObject(value.impact, [
      'root_task_id',
      'depth',
      'current_task_count',
      'added_tasks',
      'retired_task_ids',
      'blockers',
    ])
  )
    fail()
  const task = parsePlanTask(value.parent_snapshot),
    candidate = parsePlanDefinition(value.definition)
  if (
    !same(task, parsePlanTask(parent)) ||
    (definition && !same(candidate, parsePlanDefinition(definition))) ||
    candidate.items.some((item) =>
      item.files.some((path) => !task.files.includes(path)),
    ) ||
    value.impact.added_tasks !== candidate.items.length ||
    !ids(value.impact.retired_task_ids) ||
    value.impact.retired_task_ids.length !== 0
  )
    fail()
  const current = structure(
    value,
    parent.id,
    value.impact.root_task_id,
    value.impact.depth,
    value.impact.current_task_count,
  )
  if (current.current_task_count + candidate.items.length > 73) fail()
  return {
    schema_version: 3,
    unit: 'task_plan_preview',
    parent_task_id: parent.id,
    parent_snapshot: task,
    definition: candidate,
    criterion: nestedCriterion,
    lineage: current.lineage,
    tree_heads: current.tree_heads,
    impact: {
      root_task_id: current.root_task_id,
      depth: current.depth,
      current_task_count: current.current_task_count,
      added_tasks: candidate.items.length,
      retired_task_ids: [],
      blockers: blockers(value.impact.blockers),
    },
    preview_hash: value.preview_hash,
  }
}
export function parseNestedRevisionPreview(
  value: unknown,
  parent: Task,
  baseline: PlanVersion,
  definition: PlanDefinition,
): NestedRevisionPreview {
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
      'lineage',
      'tree_heads',
    ]) ||
    value.schema_version !== 3 ||
    !planObject(value.impact, [
      'added_keys',
      'replaced_keys',
      'reused_keys',
      'removed_keys',
      'retired_task_ids',
      'blockers',
      'subtree_retired_task_ids',
      'root_task_id',
      'depth',
      'current_task_count',
    ])
  )
    fail()
  const {
    subtree_retired_task_ids,
    root_task_id,
    depth,
    current_task_count,
    blockers: rawBlockers,
    ...impact
  } = value.impact
  const { lineage: _lineage, tree_heads: _heads, ...fields } = value
  const common = parsePlanRevisionPreview(
    { ...fields, schema_version: 2, impact: { ...impact, blockers: [] } },
    parent,
    baseline,
    definition,
  )
  if (
    !ids(subtree_retired_task_ids) ||
    common.impact.retired_task_ids.some(
      (id) => !subtree_retired_task_ids.includes(id),
    )
  )
    fail()
  const current = structure(
    value,
    parent.id,
    root_task_id,
    depth,
    current_task_count,
  )
  return {
    ...common,
    schema_version: 3,
    lineage: current.lineage,
    tree_heads: current.tree_heads,
    impact: {
      ...common.impact,
      blockers: blockers(rawBlockers),
      subtree_retired_task_ids,
      root_task_id: current.root_task_id,
      depth: current.depth,
      current_task_count: current.current_task_count,
    },
  }
}
export function parseNestedReceipt(
  value: unknown,
  taskId: string,
  id: string,
  expected?: NestedCreatePreview | NestedRevisionPreview,
): NestedPlanReceipt {
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
    value.schema_version !== 3 ||
    !['create', 'revise'].includes(value.operation as string) ||
    value.request_id !== id ||
    value.task_id !== taskId ||
    !planHash(value.preview_hash) ||
    value.state !== 'applied'
  )
    fail()
  const result = parseNestedTaskPlan(value.result, taskId)
  if (!result.plan || result.plan.plan_hash !== value.preview_hash) fail()
  if (
    expected &&
    (expected.preview_hash !== value.preview_hash ||
      !same(result.plan.definition, expected.definition) ||
      !same(result.plan.parent_snapshot, expected.parent_snapshot) ||
      result.root_task_id !== expected.impact.root_task_id ||
      result.depth !== expected.impact.depth ||
      !same(
        result.gate.external_scopes.map(
          ({ prerequisites: _prerequisites, ...level }) => level,
        ),
        expected.lineage,
      ) ||
      value.operation !==
        ('expected_version' in expected ? 'revise' : 'create') ||
      result.plan.version !==
        ('expected_version' in expected ? expected.expected_version + 1 : 1))
  )
    fail()
  if (expected && 'expected_version' in expected) {
    for (const key of expected.impact.reused_keys) {
      if (
        !same(
          result.plan.items.find((item) => item.key === key)?.task,
          expected.baseline.bindings.find((item) => item.key === key)?.task,
        )
      )
        fail()
    }
    for (const key of [
      ...expected.impact.replaced_keys,
      ...expected.impact.added_keys,
    ]) {
      if (
        expected.baseline.bindings.some(
          (old) =>
            old.task.id ===
            result.plan!.items.find((item) => item.key === key)?.task.id,
        )
      )
        fail()
    }
  }
  return {
    schema_version: 3,
    operation: value.operation as NestedPlanReceipt['operation'],
    request_id: id,
    task_id: taskId,
    preview_hash: value.preview_hash,
    state: 'applied',
    result,
  }
}
