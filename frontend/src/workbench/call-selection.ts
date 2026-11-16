import type { Call } from './api'

export type CallSelection =
  | { kind: 'closed' }
  | { kind: 'available'; call: Call }
  | { kind: 'unavailable'; id: string }

export function resolveCallSelection(
  callId: string,
  calls: readonly Call[],
): CallSelection {
  if (!callId) return { kind: 'closed' }
  const call = calls.find((item) => item.id === callId)
  return call
    ? { kind: 'available', call }
    : { kind: 'unavailable', id: callId }
}
