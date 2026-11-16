export type ModelTestPhase =
  'ready' | 'running' | 'succeeded' | 'failed' | 'unknown'
export type ModelTestReceipt = {
  request_id: string
  model_id: string
  state: Exclude<ModelTestPhase, 'ready'>
  status: string
  started_at?: string | null
  ended_at?: string | null
  note?: string
  input_tokens?: number | null
  output_tokens?: number | null
  usage_unknown?: boolean
  outcome_unknown?: boolean
}
export type ModelTestDraft = {
  requestId: string
  phase: ModelTestPhase
  receipt?: ModelTestReceipt
  legacyStatus?: string
  previous: Array<{ requestId: string; phase: ModelTestPhase; status?: string }>
}

export function createModelTestDraft(requestId: string): ModelTestDraft {
  return { requestId, phase: 'ready', previous: [] }
}
export function modelTestReceipt(
  draft: ModelTestDraft,
  receipt: ModelTestReceipt,
  modelId: string,
): ModelTestDraft {
  if (receipt.request_id !== draft.requestId || receipt.model_id !== modelId)
    throw new Error('model_test_receipt_identity_mismatch')
  if (!['running', 'succeeded', 'failed', 'unknown'].includes(receipt.state))
    throw new Error('model_test_receipt_state_invalid')
  const phase =
    receipt.outcome_unknown === true ||
    (receipt.state === 'succeeded' && receipt.status !== 'reachable')
      ? 'unknown'
      : receipt.state
  const tokens = (value: unknown) =>
    Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
  const input = tokens(receipt.input_tokens)
  const output = tokens(receipt.output_tokens)
  return {
    ...draft,
    receipt: {
      ...receipt,
      input_tokens: input,
      output_tokens: output,
      usage_unknown: receipt.usage_unknown || input === null || output === null,
    },
    phase,
  }
}
export function unknownModelTest(draft: ModelTestDraft): ModelTestDraft {
  return { ...draft, phase: 'unknown' }
}
export function canPrepareModelTest(
  draft: ModelTestDraft,
  acknowledgeUnknown: boolean,
) {
  return (
    draft.phase === 'succeeded' ||
    draft.phase === 'failed' ||
    (draft.phase === 'unknown' && acknowledgeUnknown)
  )
}
export function prepareModelTest(
  draft: ModelTestDraft,
  requestId: string,
  acknowledgeUnknown: boolean,
): ModelTestDraft {
  if (
    !canPrepareModelTest(draft, acknowledgeUnknown) ||
    requestId === draft.requestId
  )
    throw new Error('model_test_new_authorization_required')
  return {
    ...createModelTestDraft(requestId),
    previous: [
      ...draft.previous,
      {
        requestId: draft.requestId,
        phase: draft.phase,
        status: draft.receipt?.status,
      },
    ],
  }
}
export function modelTestTone(draft: ModelTestDraft) {
  return draft.phase === 'succeeded' && draft.receipt?.status === 'reachable'
    ? ('success' as const)
    : draft.phase === 'failed'
      ? ('error' as const)
      : draft.phase === 'unknown'
        ? ('warning' as const)
        : ('info' as const)
}

// In-memory receipts survive closing a dialog, but never an authentication reset.
const attempts = new Map<string, ModelTestDraft>()
export function currentModelTest(
  modelId: string,
  createId: () => string,
  latest?: ModelTestReceipt | null,
  legacyStatus?: string,
) {
  const active = attempts.get(modelId)
  if (active && ['running', 'unknown'].includes(active.phase)) return active
  let restored: ModelTestDraft | undefined
  if (latest) {
    const initial = createModelTestDraft(latest.request_id)
    try {
      restored = modelTestReceipt(initial, latest, modelId)
    } catch {
      restored = { ...initial, phase: 'unknown' }
    }
  }
  if (active?.phase === 'ready') {
    if (!restored) return active
    const acknowledged = active.previous.at(-1)
    if (
      acknowledged?.requestId === restored.requestId &&
      acknowledged.phase === restored.phase
    )
      return active
  }
  if (restored) return restored
  if (active) return active
  if (
    legacyStatus &&
    !['untested', 'never', 'not_tested'].includes(legacyStatus)
  )
    return {
      ...createModelTestDraft(''),
      phase: 'unknown' as const,
      legacyStatus,
    }
  return createModelTestDraft(createId())
}
export function rememberModelTest(modelId: string, draft: ModelTestDraft) {
  attempts.set(modelId, draft)
}
export function clearModelTests() {
  attempts.clear()
}
if (typeof window !== 'undefined')
  window.addEventListener('mybot:unauthorized', clearModelTests)
