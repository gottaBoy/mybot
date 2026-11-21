import { ApiError, type Snapshot } from './api'

export const contextChangedDetail =
  'Context changed after preview; inspect and confirm the latest snapshot'

export function isContextChangedError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.message === contextChangedDetail ||
      error.message === 'context_changed' ||
      (typeof error.details === 'object' &&
        error.details !== null &&
        (error.details as { code?: unknown }).code ===
          'task_turn_context_changed'))
  )
}

export function recheckedRunContext<
  T extends { snapshot: Snapshot; step: number; consent: boolean },
>(draft: T, snapshot: Snapshot) {
  return { ...draft, snapshot, step: 0, consent: false }
}
