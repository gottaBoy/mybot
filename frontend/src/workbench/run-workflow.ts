import type { WorkflowSnapshot } from './workflows'
import { parseWorkflowSnapshot } from './workflows'

export function recordedRunWorkflow(
  context: unknown,
): WorkflowSnapshot | undefined {
  if (!context || typeof context !== 'object' || Array.isArray(context))
    throw new Error('run_context_invalid')
  if (!Object.prototype.hasOwnProperty.call(context, 'workflow'))
    return undefined
  return parseWorkflowSnapshot((context as Record<string, unknown>).workflow)
}
