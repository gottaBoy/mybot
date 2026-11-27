import { isTaskReadIdentifier } from './task-query'

export type TaskPlanScope = {
  schema_version: 1
  task_id: string
  scope_hash: string
}
export function parseTaskPlanScope(
  value: unknown,
  taskId?: string,
): TaskPlanScope {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Reflect.ownKeys(value).length !== 3 ||
    !Object.hasOwn(value, 'schema_version') ||
    !Object.hasOwn(value, 'task_id') ||
    !Object.hasOwn(value, 'scope_hash')
  )
    throw new Error('task_plan_scope_invalid')
  const scope = value as Record<string, unknown>
  if (
    scope.schema_version !== 1 ||
    !isTaskReadIdentifier(scope.task_id) ||
    (taskId !== undefined && scope.task_id !== taskId) ||
    typeof scope.scope_hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(scope.scope_hash)
  )
    throw new Error('task_plan_scope_invalid')
  return {
    schema_version: 1,
    task_id: scope.task_id,
    scope_hash: scope.scope_hash,
  }
}
export const sameTaskPlanScope = (a?: TaskPlanScope, b?: TaskPlanScope) =>
  a?.task_id === b?.task_id && a?.scope_hash === b?.scope_hash
export function admitTaskPlanScope<
  T extends { task_plan_scope?: TaskPlanScope },
>(value: T, taskId: string): T {
  if (!value || typeof value !== 'object')
    throw new Error('task_plan_scope_invalid')
  return Object.hasOwn(value, 'task_plan_scope')
    ? {
        ...value,
        task_plan_scope: parseTaskPlanScope(value.task_plan_scope, taskId),
      }
    : value
}
