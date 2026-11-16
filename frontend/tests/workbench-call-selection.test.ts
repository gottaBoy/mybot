import { describe, expect, it } from 'vitest'
import type { Call } from '../src/workbench/api'
import { resolveCallSelection } from '../src/workbench/call-selection'

const running: Call = {
  id: 'call-research-1',
  agent_id: 'agent-research-1',
  requested_model: 'research-model',
  status: 'running',
  attempt: 1,
  duration_ms: null,
  input_tokens: null,
  output_tokens: null,
  error_detail: {},
}

describe('live call detail selection', () => {
  it('resolves the same selected ID against each latest read, then reports a missing call', () => {
    const callId = running.id
    const initial = resolveCallSelection(callId, [running])
    expect(initial.kind).toBe('available')
    if (initial.kind !== 'available') throw new Error('Expected selected call')
    expect(initial.call).toBe(running)

    const completed: Call = {
      ...running,
      status: 'succeeded',
      duration_ms: 2140,
      input_tokens: 80,
      output_tokens: 25,
    }
    const refreshed = resolveCallSelection(callId, [completed])
    expect(refreshed.kind).toBe('available')
    if (refreshed.kind !== 'available')
      throw new Error('Expected refreshed call')
    expect(refreshed.call).toBe(completed)
    expect(refreshed.call).toMatchObject({
      status: 'succeeded',
      duration_ms: 2140,
      input_tokens: 80,
      output_tokens: 25,
    })
    expect(running.status).toBe('running')
    expect(resolveCallSelection(callId, [])).toEqual({
      kind: 'unavailable',
      id: callId,
    })
    expect(resolveCallSelection('', [completed])).toEqual({ kind: 'closed' })
  })

  it('preserves timeout errors, diagnostics and unknown usage from the refreshed call', () => {
    const timeout: Call = {
      ...running,
      status: 'failed',
      duration_ms: 120_000,
      error: 'provider_timeout_outcome_unknown',
      error_detail: { timeout_seconds: 120, outcome: 'unknown' },
    }
    const selection = resolveCallSelection(running.id, [timeout])
    expect(selection.kind).toBe('available')
    if (selection.kind !== 'available') throw new Error('Expected timeout call')
    expect(selection.call).toBe(timeout)
    expect(selection.call.error).toBe('provider_timeout_outcome_unknown')
    expect(selection.call.error_detail).toEqual({
      timeout_seconds: 120,
      outcome: 'unknown',
    })
    expect(selection.call.input_tokens).toBeNull()
    expect(selection.call.output_tokens).toBeNull()
    expect(selection.call.status).toBe('failed')
  })

  it('does not substitute a different call when the selected ID is unavailable', () => {
    const other: Call = {
      ...running,
      id: 'call-research-2',
      status: 'succeeded',
    }
    expect(resolveCallSelection(running.id, [other])).toEqual({
      kind: 'unavailable',
      id: running.id,
    })
    expect(other.status).toBe('succeeded')
  })
})
