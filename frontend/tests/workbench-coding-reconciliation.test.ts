import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseCodingCandidate,
  parseCodingConfig,
  prepareCoding,
  fetchCoding,
} from '../src/workbench/coding'
import {
  assertReconciliationComparison,
  compareCodingBaseline,
  parseCodingComparison,
  parseReconciliationInput,
  resolvedCodingFiles,
} from '../src/workbench/coding-reconciliation'
import {
  reconciliationComparison as comparison,
  reconciliationConfig as config,
  reconciledCandidate,
} from './coding-reconciliation-fixture'
afterEach(() => vi.unstubAllGlobals())
describe('explicit changed-base comparison', () => {
  it('keeps old origin, checkpoint and current files distinct without model execution', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(comparison)))
    vi.stubGlobal('fetch', fetcher)
    expect(
      await compareCodingBaseline('task-a', config, undefined, true, [
        'code.py',
        'test_code.py',
      ]),
    ).toEqual(comparison)
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/tasks/task-a/coding/reconciliation/preview',
    )
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(config)
  })
  it.each([undefined, false])(
    'requires explicit capability %j',
    async (enabled) => {
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)
      await expect(
        compareCodingBaseline('task-a', config, undefined, enabled),
      ).rejects.toThrow()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
  it.each([
    { task_id: 'other' },
    { config: { ...config, max_rounds: 1 } },
    { source: { ...comparison.source, sha256: '2'.repeat(64) } },
    { source: { ...comparison.source, round: 0 } },
    { current_hash: 'bad' },
    { checkpoint_files: [...comparison.checkpoint_files].reverse() },
    { current_files: [comparison.current_files[0]] },
    { changes: [...comparison.changes].reverse() },
    {
      changes: [
        { ...comparison.changes[0], writable: false },
        comparison.changes[1],
      ],
    },
    {
      changes: [
        { ...comparison.changes[0], current_changed: false },
        comparison.changes[1],
      ],
    },
    {
      changes: [
        { ...comparison.changes[0], inherited_discarded: true },
        comparison.changes[1],
      ],
    },
    { extra: true },
  ])('rejects substituted comparison metadata %#', (patch) => {
    expect(() =>
      parseCodingComparison({ ...comparison, ...patch }, 'task-a', config),
    ).toThrow()
  })
  it('binds exact Task file order independently of response content', () => {
    expect(() =>
      parseCodingComparison(comparison, 'task-a', config, [
        'test_code.py',
        'code.py',
      ]),
    ).toThrow()
  })
})
describe('bounded manual file resolutions', () => {
  const input = reconciledCandidate().config.continuation!.reconciliation!
  it.each(['current', 'checkpoint', 'manual'] as const)(
    'applies only the chosen editable %s content and keeps tests current',
    (source) => {
      const candidate = reconciledCandidate(source)
      expect(
        parseCodingCandidate(candidate, 'task-a', candidate.config),
      ).toEqual(candidate)
      expect(candidate.snapshot.files[1]).toEqual(comparison.current_files[1])
      expect(
        resolvedCodingFiles(
          candidate.config,
          comparison.current_files,
          comparison.checkpoint_files,
        ),
      ).toEqual(candidate.snapshot.files)
      assertReconciliationComparison(candidate, comparison)
    },
  )
  it('admits an empty manual file and a reviewed start equal to current project files', () => {
    expect(
      parseCodingCandidate(reconciledCandidate('manual', ''), 'task-a').snapshot
        .files[0].bytes,
    ).toBe(0)
    const current = reconciledCandidate('current')
    expect(parseCodingCandidate(current, 'task-a').snapshot.files).toEqual(
      current.snapshot.origin_files,
    )
  })
  it.each([
    { resolutions: [] },
    {
      resolutions: [
        { path: 'test_code.py', source: 'manual', content: '# forbidden' },
      ],
    },
    { resolutions: [{ path: 'code.py', source: 'current', content: '' }] },
    { resolutions: [{ path: 'code.py', source: 'manual' }] },
    { resolutions: [{ path: 'code.py', source: 'manual', content: null }] },
    { resolutions: [{ path: 'code.py', source: 'manual', content: 'nul\0' }] },
    {
      resolutions: [
        { path: 'code.py', source: 'manual', content: '中'.repeat(11000) },
      ],
    },
    { resolutions: [{ path: 'code.py', source: 'auto' }] },
    { review_hash: 'bad' },
    { extra: true },
  ])(
    'rejects incomplete, readonly, oversized or unknown choices %#',
    (patch) => {
      expect(() =>
        parseReconciliationInput({ ...input, ...patch }, config.writable),
      ).toThrow()
    },
  )
  it('rejects duplicate paths and manual total over64KiB', () => {
    expect(() =>
      parseReconciliationInput(
        { ...input, resolutions: [input.resolutions[0], input.resolutions[0]] },
        ['code.py', 'other.py'],
      ),
    ).toThrow()
    expect(() =>
      parseReconciliationInput(
        {
          ...input,
          resolutions: ['a.py', 'b.py', 'c.py'].map((path) => ({
            path,
            source: 'manual',
            content: 'a'.repeat(24000),
          })),
        },
        ['a.py', 'b.py', 'c.py'],
      ),
    ).toThrow()
  })
})
describe('frozen changed-base candidate receipts', () => {
  it.each([
    (value: any) => {
      value.snapshot.reconciliation.current_hash = '2'.repeat(64)
    },
    (value: any) => {
      value.snapshot.reconciliation.review_hash = '2'.repeat(64)
    },
    (value: any) => {
      value.snapshot.files[0] = { path: 'code.py', content: 'wrong', bytes: 5 }
    },
    (value: any) => {
      value.snapshot.files[1] = {
        path: 'test_code.py',
        content: 'wrong',
        bytes: 5,
      }
    },
    (value: any) => {
      delete value.snapshot.reconciliation
    },
    (value: any) => {
      delete value.config.continuation.reconciliation
    },
    (value: any) => {
      value.snapshot.reconciliation.source_origin_files.reverse()
    },
    (value: any) => {
      value.snapshot.reconciliation.extra = true
    },
  ])('rejects tampered resolution binding %#', (change) => {
    const value = structuredClone(reconciledCandidate())
    change(value)
    expect(() => parseCodingCandidate(value, 'task-a')).toThrow()
  })
  it('rejects a different source candidate returned after the original comparison', () => {
    const value = reconciledCandidate()
    value.snapshot.reconciliation!.source_candidate_hash = '2'.repeat(64)
    expect(() => assertReconciliationComparison(value, comparison)).toThrow()
  })
  it('preserves full decisions in preparation and GET-only reconciliation of an exact candidate', async () => {
    const candidate = reconciledCandidate()
    const job = {
      request_id: 'reconciled-request',
      task_id: 'task-a',
      candidate_hash: candidate.candidate_hash,
      state: 'prepared',
      run_id: null,
      created_at: '2026-11-27T00:00:00Z',
      candidate,
    }
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(job)))
    vi.stubGlobal('fetch', fetcher)
    expect(
      (await prepareCoding('task-a', job.request_id, candidate)).candidate,
    ).toEqual(candidate)
    expect(
      JSON.parse(fetcher.mock.calls[0][1].body).continuation.reconciliation,
    ).toEqual(candidate.config.continuation!.reconciliation)
    expect(
      (await fetchCoding('task-a', job.request_id, undefined, candidate))
        .candidate,
    ).toEqual(candidate)
    expect(fetcher.mock.calls[1][1].method).toBeUndefined()
  })
})
