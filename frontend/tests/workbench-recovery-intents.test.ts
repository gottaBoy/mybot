import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abandonRecoveryIntent,
  executeRecoveryIntent,
  intentConfig,
  intentIsLocked,
  parseRecoveryIntent,
  parseRecoveryLedger,
  presentAppliedRecovery,
  prepareRecoveryIntent,
  readRecoveryIntent,
  readRecoveryIntents,
  type RecoveryIntent,
} from '../src/workbench/recovery-intents'

const config = {
  coordinator_model: 'planner-model',
  researcher_model: 'research-model',
  reviewer_model: 'review-model',
  max_calls: 3,
  parallel: 1,
  minutes: 10,
  max_output_tokens: 1800,
  call_timeout_seconds: 120,
}
function receipt(patch: Partial<RecoveryIntent> = {}): RecoveryIntent {
  return {
    request_id: 'request-123',
    source_run_id: 'source',
    mode: 'retry',
    state: 'prepared',
    snapshot_hash: 'a'.repeat(64),
    candidate_hash: 'b'.repeat(64),
    config: { ...config },
    target_run_id: null,
    error_code: null,
    requires_acknowledgement: true,
    outcome_unknown: false,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    settled_at: null,
    ...patch,
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('durable recovery receipt validation', () => {
  it('retains exact source, request identity and registered candidate', () => {
    expect(parseRecoveryIntent(receipt(), 'source', 'request-123')).toEqual(
      receipt(),
    )
    expect(() => parseRecoveryIntent(receipt(), 'another-source')).toThrow(
      'recovery_receipt_invalid',
    )
    expect(() =>
      parseRecoveryIntent(receipt(), 'source', 'another-request'),
    ).toThrow('recovery_receipt_invalid')
  })
  it.each([
    { state: 'succeeded' },
    { snapshot_hash: '' },
    { candidate_hash: 'not-a-hash' },
    { mode: 'deploy' },
    { mode: ['retry'] },
    { target_run_id: 'unexpected-target' },
    { outcome_unknown: true },
    { error_code: 'private error content' },
    { requires_acknowledgement: undefined },
    { config: { ...config, max_calls: 0 } },
    { config: { ...config, parallel: 3 } },
    { config: { ...config, minutes: 31 } },
    { config: { ...config, max_output_tokens: 8000 } },
    { config: { ...config, call_timeout_seconds: undefined } },
    { config: { ...config, reviewer_model: '' } },
  ])('rejects malformed or unsupported receipts %j', (patch) => {
    expect(() =>
      parseRecoveryIntent({ ...receipt(), ...patch }, 'source'),
    ).toThrow('recovery_receipt_invalid')
  })
  it('does not invent a fixed original resume timeout', () => {
    const original = { ...config }
    const { call_timeout_seconds: _, ...withoutTimeout } = original
    const resumed = receipt({
      mode: 'resume',
      config: withoutTimeout,
      requires_acknowledgement: false,
    })
    expect(parseRecoveryIntent(resumed, 'source').config).not.toHaveProperty(
      'call_timeout_seconds',
    )
    expect(intentConfig(resumed, config).max_calls).toBe(3)
  })
  it('requires a precise target for applied controls and never treats it as model success', () => {
    const applied = receipt({
      state: 'applied',
      target_run_id: 'child',
      settled_at: '2026-11-15T00:00:01Z',
    })
    expect(parseRecoveryIntent(applied, 'source').target_run_id).toBe('child')
    expect(() =>
      parseRecoveryIntent({ ...applied, target_run_id: null }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryIntent({ ...applied, target_run_id: 'source' }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryIntent({ ...applied, mode: 'resume' }, 'source'),
    ).toThrow()
    expect(
      parseRecoveryIntent(
        { ...applied, mode: 'resume', target_run_id: 'source' },
        'source',
      ).state,
    ).toBe('applied')
  })
  it.each(['applying', 'applied', 'unknown', 'rejected', 'abandoned'] as const)(
    'locks %s rather than enabling another execute',
    (state) => expect(intentIsLocked(receipt({ state }))).toBe(true),
  )
  it('permits reviewing only an unsubmitted draft or a prepared candidate', () => {
    expect(intentIsLocked(null)).toBe(false)
    expect(intentIsLocked(receipt())).toBe(false)
  })
  it('validates ledger counters, source identities and pending states', () => {
    const prepared = receipt()
    const value = {
      latest: prepared,
      unresolved: prepared,
      history: [prepared],
      total: 1,
      history_truncated: false,
    }
    expect(parseRecoveryLedger(value, 'source').unresolved?.request_id).toBe(
      'request-123',
    )
    expect(() =>
      parseRecoveryLedger({ ...value, total: 0 }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger(
        {
          ...value,
          unresolved: receipt({ state: 'applied', target_run_id: 'child' }),
        },
        'source',
      ),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger(
        { ...value, history: [receipt({ source_run_id: 'other' })] },
        'source',
      ),
    ).toThrow()
    expect(() => parseRecoveryLedger({ history: [] }, 'source')).toThrow()
    expect(() =>
      parseRecoveryLedger({ ...value, latest: null }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger({ ...value, unresolved: null }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger({ ...value, history_truncated: true }, 'source'),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger(
        { ...value, history: [], latest: null, unresolved: null },
        'source',
      ),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger(
        { ...value, history: [prepared, prepared], total: 2 },
        'source',
      ),
    ).toThrow()
    expect(() =>
      parseRecoveryLedger(
        { ...value, latest: receipt({ candidate_hash: 'c'.repeat(64) }) },
        'source',
      ),
    ).toThrow()
  })
  it('separates a failed UI callback from an already confirmed application', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('View refresh failed'))
    const applied = receipt({ state: 'applied', target_run_id: 'child' })
    expect(await presentAppliedRecovery(applied, complete)).toBe(
      'recovery_applied_presentation_failed',
    )
    expect(complete).toHaveBeenCalledWith('child')
    expect(applied.state).toBe('applied')
    await expect(presentAppliedRecovery(receipt(), complete)).rejects.toThrow(
      'recovery_not_applied',
    )
  })
  it.each(['abandoned', 'rejected', 'applied'] as const)(
    'rejects a truncated ledger with a conflicting %s receipt for its unresolved ID',
    (state) => {
      const history = Array.from({ length: 50 }, (_, index) =>
        receipt({
          request_id: `request-${String(index).padStart(3, '0')}`,
          state,
          target_run_id: state === 'applied' ? 'child' : null,
        }),
      )
      expect(() =>
        parseRecoveryLedger(
          {
            latest: history[0],
            unresolved: receipt({ request_id: history[0].request_id }),
            history,
            total: 51,
            history_truncated: true,
          },
          'source',
        ),
      ).toThrow('recovery_ledger_invalid')
    },
  )
  it('permits an unresolved receipt outside the truncated history window', () => {
    const history = Array.from({ length: 50 }, (_, index) =>
      receipt({
        request_id: `request-${String(index).padStart(3, '0')}`,
        state: 'abandoned',
      }),
    )
    const value = {
      latest: history[0],
      unresolved: receipt({ request_id: 'older-request' }),
      history,
      total: 51,
      history_truncated: true,
    }
    expect(parseRecoveryLedger(value, 'source').unresolved?.request_id).toBe(
      'older-request',
    )
  })
})

describe('explicit recovery request boundary', () => {
  it('registers resources without granting execution consent', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(receipt())))
    vi.stubGlobal('fetch', fetch)
    await prepareRecoveryIntent('source', {
      request_id: 'request-123',
      mode: 'retry',
      snapshot_hash: 'a'.repeat(64),
      config,
    })
    expect(fetch).toHaveBeenCalledOnce()
    const options = fetch.mock.calls[0][1]
    expect(fetch.mock.calls[0][0]).toBe('/api/runs/source/recovery-intents')
    expect(JSON.parse(options.body)).toEqual({
      request_id: 'request-123',
      mode: 'retry',
      snapshot_hash: 'a'.repeat(64),
      config,
    })
    expect(JSON.parse(options.body)).not.toHaveProperty('consent')
  })
  it('queries the exact persisted receipt using GET only', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(receipt({ state: 'unknown', outcome_unknown: true })),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            latest: null,
            unresolved: null,
            history: [],
            total: 0,
            history_truncated: false,
          }),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    expect((await readRecoveryIntent('source', 'request-123')).state).toBe(
      'unknown',
    )
    expect((await readRecoveryIntents('source')).total).toBe(0)
    expect(
      fetch.mock.calls.every(
        ([, options]) => !options.method || options.method === 'GET',
      ),
    ).toBe(true)
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/runs/source/recovery-intents/request-123',
    )
  })
  it('executes only a registered ID and keeps abandon separate from execution', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(receipt({ state: 'applied', target_run_id: 'child' })),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(receipt({ state: 'abandoned' }))),
      )
    vi.stubGlobal('fetch', fetch)
    await executeRecoveryIntent('source', 'request-123', true)
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/runs/source/recovery-intents/request-123/execute',
    )
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      consent: true,
      acknowledge_replay: true,
    })
    await abandonRecoveryIntent('source', 'request-123')
    expect(fetch.mock.calls[1][0]).toBe(
      '/api/runs/source/recovery-intents/request-123/abandon',
    )
    expect(fetch.mock.calls[1][1].body).toBe('{}')
  })
  it('rejects a 2xx receipt with the wrong identity without retrying', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(receipt({ request_id: 'another-request' })),
        ),
      )
    vi.stubGlobal('fetch', fetch)
    await expect(
      executeRecoveryIntent('source', 'request-123', false),
    ).rejects.toThrow('recovery_receipt_invalid')
    expect(fetch).toHaveBeenCalledOnce()
  })
  it('propagates aborts without replaying a mutation', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation(
      (_path, options) =>
        new Promise((_, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const result = executeRecoveryIntent(
      'source',
      'request-123',
      false,
      controller.signal,
    )
    const rejected = expect(result).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()
    await rejected
    expect(fetch).toHaveBeenCalledOnce()
  })
})
