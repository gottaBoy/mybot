import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canPrepareModelTest,
  clearModelTests,
  createModelTestDraft,
  currentModelTest,
  modelTestReceipt,
  modelTestTone,
  prepareModelTest,
  rememberModelTest,
  unknownModelTest,
  type ModelTestReceipt,
} from '../src/workbench/model-test-state'
import {
  readModelTest,
  startModelTest,
} from '../src/workbench/model-test-request'

const receipt = (
  state: ModelTestReceipt['state'],
  status: string = state,
): ModelTestReceipt => ({
  request_id: 'test-request-1',
  model_id: 'model-1',
  state,
  status,
  input_tokens: null,
  output_tokens: null,
  usage_unknown: true,
})
afterEach(() => {
  clearModelTests()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('model test receipts and explicit new authorization', () => {
  it('retains one request ID after a lost response and never automatically retries', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const original = createModelTestDraft('test-request-1')
    const unknown = unknownModelTest(original)
    expect(unknown).toMatchObject({
      requestId: original.requestId,
      phase: 'unknown',
    })
    expect(modelTestTone(unknown)).toBe('warning')
    expect(canPrepareModelTest(unknown, false)).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    expect(original.phase).toBe('ready')
  })
  it('counts only succeeded plus reachable as success, not HTTP 200 or failed/unknown state', () => {
    const original = createModelTestDraft('test-request-1')
    expect(
      modelTestTone(
        modelTestReceipt(
          original,
          receipt('succeeded', 'reachable'),
          'model-1',
        ),
      ),
    ).toBe('success')
    expect(
      modelTestTone(
        modelTestReceipt(
          original,
          receipt('failed', 'authentication_failed'),
          'model-1',
        ),
      ),
    ).toBe('error')
    expect(
      modelTestTone(
        modelTestReceipt(
          original,
          receipt('unknown', 'provider_timeout_outcome_unknown'),
          'model-1',
        ),
      ),
    ).toBe('warning')
    expect(
      modelTestTone(modelTestReceipt(original, receipt('running'), 'model-1')),
    ).toBe('info')
    expect(
      modelTestReceipt(
        original,
        receipt('succeeded', 'inconsistent'),
        'model-1',
      ).phase,
    ).toBe('unknown')
    expect(
      modelTestTone(
        modelTestReceipt(
          original,
          { ...receipt('succeeded', 'reachable'), outcome_unknown: true },
          'model-1',
        ),
      ),
    ).toBe('warning')
  })
  it('rejects a receipt for another request or another model', () => {
    const original = createModelTestDraft('test-request-1')
    expect(() =>
      modelTestReceipt(
        original,
        { ...receipt('succeeded'), request_id: 'another' },
        'model-1',
      ),
    ).toThrow('identity_mismatch')
    expect(() =>
      modelTestReceipt(original, receipt('succeeded'), 'another-model'),
    ).toThrow('identity_mismatch')
  })
  it('requires unknown acknowledgement and a distinct ID before preparing another test', () => {
    const unknown = unknownModelTest(createModelTestDraft('test-request-1'))
    expect(() => prepareModelTest(unknown, 'test-request-2', false)).toThrow(
      'new_authorization_required',
    )
    expect(() => prepareModelTest(unknown, 'test-request-1', true)).toThrow(
      'new_authorization_required',
    )
    const next = prepareModelTest(unknown, 'test-request-2', true)
    expect(next).toMatchObject({
      requestId: 'test-request-2',
      phase: 'ready',
      previous: [{ requestId: 'test-request-1', phase: 'unknown' }],
    })
    expect(next).not.toHaveProperty('consent')
    expect(unknown.requestId).toBe('test-request-1')
  })
  it('does not prepare parallel new tests while a receipt is running', () => {
    const running = modelTestReceipt(
      createModelTestDraft('test-request-1'),
      receipt('running'),
      'model-1',
    )
    expect(canPrepareModelTest(running, true)).toBe(false)
  })
  it('does not convert unknown or malformed usage to zero', () => {
    const original = createModelTestDraft('test-request-1')
    const result = modelTestReceipt(
      original,
      {
        ...receipt('succeeded', 'reachable'),
        input_tokens: 0,
        output_tokens: -1,
      },
      'model-1',
    )
    expect(result.receipt?.input_tokens).toBe(0)
    expect(result.receipt?.output_tokens).toBeNull()
    expect(result.receipt?.usage_unknown).toBe(true)
  })
  it('retains the same in-memory receipt when its dialog reopens and clears it on session reset', () => {
    const unknown = unknownModelTest(createModelTestDraft('test-request-1'))
    rememberModelTest('model-1', unknown)
    expect(currentModelTest('model-1', () => 'unused-new-id')).toBe(unknown)
    clearModelTests()
    expect(currentModelTest('model-1', () => 'new-session-id')).toMatchObject({
      requestId: 'new-session-id',
      phase: 'ready',
    })
  })
  it.each(['running', 'unknown', 'succeeded', 'failed'] as const)(
    'restores persisted latest %s receipt after refresh without allocating a new request',
    (phase) => {
      const createId = vi.fn(() => 'must-not-be-used')
      const latest = receipt(phase, phase === 'succeeded' ? 'reachable' : phase)
      const restored = currentModelTest('model-1', createId, latest)
      expect(restored.requestId).toBe('test-request-1')
      expect(restored.phase).toBe(phase)
      expect(createId).not.toHaveBeenCalled()
      expect(restored.phase).not.toBe('ready')
    },
  )
  it('keeps a lost-response active ID instead of silently replacing it with another latest record', () => {
    const unknown = unknownModelTest(createModelTestDraft('pending-request'))
    rememberModelTest('model-1', unknown)
    expect(
      currentModelTest(
        'model-1',
        () => 'unused',
        receipt('succeeded', 'reachable'),
      ),
    ).toBe(unknown)
  })
  it.each(['running', 'unknown'] as const)(
    'does not let an unopened ready draft hide a newly persisted %s receipt',
    (phase) => {
      rememberModelTest('model-1', createModelTestDraft('unused-ready-id'))
      const latest = { ...receipt(phase), request_id: 'remote-test-request' }
      const createId = vi.fn(() => 'must-not-be-used')
      const restored = currentModelTest('model-1', createId, latest)
      expect(restored).toMatchObject({
        requestId: 'remote-test-request',
        phase,
      })
      expect(restored.phase).not.toBe('ready')
      expect(createId).not.toHaveBeenCalled()
    },
  )
  it('retains an explicitly prepared draft only while its acknowledged latest receipt has not changed', () => {
    const prior = modelTestReceipt(
      createModelTestDraft('test-request-1'),
      receipt('unknown'),
      'model-1',
    )
    const prepared = prepareModelTest(prior, 'new-authorized-id', true)
    rememberModelTest('model-1', prepared)
    expect(
      currentModelTest('model-1', () => 'unused', receipt('unknown')),
    ).toBe(prepared)
    expect(
      currentModelTest('model-1', () => 'unused', {
        ...receipt('unknown'),
        request_id: 'newer-remote-request',
      }),
    ).toMatchObject({ requestId: 'newer-remote-request', phase: 'unknown' })
    expect(
      currentModelTest('model-1', () => 'unused', receipt('running')),
    ).toMatchObject({ requestId: 'test-request-1', phase: 'running' })
  })
  it.each(['running', 'provider_timeout_outcome_unknown', 'reachable'])(
    'does not treat legacy %s without an identity-bearing receipt as ready',
    (status) => {
      const createId = vi.fn(() => 'must-not-be-used')
      const restored = currentModelTest('model-1', createId, null, status)
      expect(restored).toMatchObject({
        requestId: '',
        phase: 'unknown',
        legacyStatus: status,
      })
      expect(canPrepareModelTest(restored, false)).toBe(false)
      expect(createId).not.toHaveBeenCalled()
    },
  )
})

describe('explicit bounded test request boundary', () => {
  it('posts once with stable identity and consent, and reads receipts using GET only', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(receipt('succeeded', 'reachable'))),
      )
    vi.stubGlobal('fetch', fetch)
    await startModelTest('model-1', 'test-request-1')
    expect(fetch.mock.calls[0][0]).toBe('/api/models/model-1/test')
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '{"request_id":"test-request-1","consent":true}',
    })
    fetch.mockResolvedValue(new Response(JSON.stringify(receipt('unknown'))))
    await readModelTest('model-1', 'test-request-1')
    expect(fetch.mock.calls[1][0]).toBe(
      '/api/models/model-1/tests/test-request-1',
    )
    expect(fetch.mock.calls[1][1].method).toBe('GET')
    expect(fetch.mock.calls[1][1].body).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('stops waiting after the bound without retrying or claiming the server stopped', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const attempt = startModelTest('model-1', 'test-request-1')
    const rejected = expect(attempt).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(unknownModelTest(createModelTestDraft('test-request-1')).phase).toBe(
      'unknown',
    )
  })
})
