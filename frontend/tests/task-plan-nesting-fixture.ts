import type { Task } from '../src/workbench/api'
import type {
  TaskOutcome,
  NestedGate,
  NestedTaskPlanRead,
  NestedCreatePreview,
} from '../src/workbench/task-plan-nesting'

const hash = (value: string) => value.repeat(64)
export const nestedRoot: Task = {
  id: 'root-a',
  project_id: 'project-a',
  title: 'Root outcome',
  goal: 'Deliver a reviewed outcome',
  acceptance: 'Accepted integration',
  files: ['README.md'],
  created_at: '2026-11-27T00:00:00Z',
}
export const containerTask: Task = {
  ...nestedRoot,
  id: 'container-a',
  title: 'Integrate source findings',
}
export const grandchildTasks: Task[] = [1, 2].map((value) => ({
  ...nestedRoot,
  id: `grandchild-${value}`,
  title: `Research part ${value}`,
}))
export const nestedDefinition = {
  items: grandchildTasks.map((task, index) => ({
    key: `part${index + 1}`,
    title: task.title,
    goal: task.goal,
    acceptance: task.acceptance,
    files: task.files,
    depends_on: index ? ['part1'] : [],
  })),
}
export const grandchildOutcomes: TaskOutcome[] = grandchildTasks.map(
  (task, index) => ({
    task_id: task.id,
    title: task.title,
    kind: 'run',
    state: 'no_run',
    latest_run: null,
    reports: [],
    own_plan: null,
    completion_hash: hash(index ? 'b' : 'a'),
  }),
)
const ancestor = {
  task_id: containerTask.id,
  parent_task_id: nestedRoot.id,
  plan_version: 1,
  plan_hash: hash('c'),
  membership: 'current' as const,
}
export const containerGate: NestedGate = {
  schema_version: 3,
  task_id: containerTask.id,
  parent_task_id: nestedRoot.id,
  root_task_id: nestedRoot.id,
  depth: 1,
  membership: 'current',
  ready: false,
  scope_hash: hash('d'),
  external_scopes: [{ ...ancestor, prerequisites: [] }],
  own_plan: {
    version: 1,
    plan_hash: hash('e'),
    completion_scope_hash: hash('f'),
    ready: false,
    children: grandchildOutcomes,
  },
}
export const grandchildGates: NestedGate[] = grandchildTasks.map(
  (task, index) => ({
    schema_version: 3,
    task_id: task.id,
    parent_task_id: containerTask.id,
    root_task_id: nestedRoot.id,
    depth: 2,
    membership: 'current',
    ready: index === 0,
    scope_hash: hash(index ? '2' : '1'),
    own_plan: null,
    external_scopes: [
      {
        task_id: task.id,
        parent_task_id: containerTask.id,
        plan_version: 1,
        plan_hash: hash('e'),
        membership: 'current',
        prerequisites: index ? [grandchildOutcomes[0]] : [],
      },
      { ...ancestor, prerequisites: [] },
    ],
  }),
)
export const nestedRead: NestedTaskPlanRead = {
  schema_version: 3,
  unit: 'task_plan',
  task_id: containerTask.id,
  root_task_id: nestedRoot.id,
  depth: 1,
  parent: { task_id: nestedRoot.id, title: nestedRoot.title },
  gate: containerGate,
  plan: {
    version: 1,
    parent_task_id: containerTask.id,
    plan_hash: hash('e'),
    created_at: nestedRoot.created_at!,
    parent_snapshot: containerTask,
    definition: nestedDefinition,
    items: grandchildTasks.map((task, index) => ({
      key: `part${index + 1}`,
      task,
      review: grandchildOutcomes[index],
      gate: grandchildGates[index],
    })),
  },
}
export const nestedPreview: NestedCreatePreview = {
  schema_version: 3,
  unit: 'task_plan_preview',
  parent_task_id: containerTask.id,
  parent_snapshot: containerTask,
  definition: nestedDefinition,
  criterion: 'nested-children-and-reviewed-integration-v1',
  lineage: [ancestor],
  tree_heads: [{ task_id: nestedRoot.id, version: 1, plan_hash: hash('c') }],
  impact: {
    root_task_id: nestedRoot.id,
    depth: 1,
    current_task_count: 3,
    added_tasks: 2,
    retired_task_ids: [],
    blockers: [],
  },
  preview_hash: hash('e'),
}
export const nestedReceipt = {
  schema_version: 3 as const,
  operation: 'create' as const,
  request_id: 'nested-original-id',
  task_id: containerTask.id,
  preview_hash: hash('e'),
  state: 'applied' as const,
  result: nestedRead,
}
