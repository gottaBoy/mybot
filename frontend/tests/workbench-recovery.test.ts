import { describe, expect, it } from 'vitest'
import type { Model, RunDetail } from '../src/workbench/api'
import {
  lockReusedModels,
  originalRecoveryConfig,
  pausedResumeProblems,
  recoveryCandidateKey,
  recoveryProblems,
  recoveryReviewIsCurrent,
  retryRoleIsActive,
  type RecoveryPreview,
} from '../src/workbench/recovery'

const preview: RecoveryPreview = {
  source_run_id: 'source',
  source_status: 'failed',
  allowed: true,
  snapshot_hash: 'a'.repeat(64),
  steps: [
    { key: 'plan', role: 'coordinator', title: 'Plan', action: 'reuse' },
    {
      key: 'research-0',
      role: 'researcher',
      title: 'Research',
      action: 'retry',
    },
    { key: 'synthesis', role: 'reviewer', title: 'Review', action: 'retry' },
  ],
  reuse_step_keys: ['plan'],
  minimum_calls: 2,
  source_call_count: 2,
  source_unknown_usage: 1,
  requires_acknowledgement: true,
  defaults: {
    coordinator_model: 'model',
    researcher_model: 'model',
    reviewer_model: 'model',
    max_calls: 2,
    parallel: 1,
    minutes: 10,
    max_output_tokens: 1800,
    call_timeout_seconds: 120,
  },
  retry_runs: [],
  context: { goal: '', acceptance: '', notes: '', text: '', evidence: [] },
  reused_outputs: [],
}
const models = [{ id: 'model', key_available: true }] as Model[]

describe('native recovery contract', () => {
  it('locks only fully reused role models', () => {
    expect(retryRoleIsActive(preview, 'coordinator')).toBe(false)
    expect(retryRoleIsActive(preview, 'researcher')).toBe(true)
    const changed = {
      ...preview.defaults,
      coordinator_model: 'other',
      researcher_model: 'other',
    }
    expect(lockReusedModels(preview, changed)).toEqual({
      ...changed,
      coordinator_model: 'model',
    })
    expect(changed.coordinator_model).toBe('other')
  })
  it('validates every API resource boundary and required remaining budget', () => {
    expect(recoveryProblems(preview, preview.defaults, models)).toEqual([])
    for (const [key, value] of [
      ['max_calls', 1],
      ['max_calls', 9],
      ['parallel', 0],
      ['parallel', 3],
      ['minutes', 31],
      ['max_output_tokens', 255],
      ['max_output_tokens', 4097],
      ['call_timeout_seconds', 9],
      ['call_timeout_seconds', 301],
    ] as const) {
      expect(
        recoveryProblems(
          preview,
          { ...preview.defaults, [key]: value },
          models,
        ),
      ).toContain(key)
    }
  })
  it('rejects missing models, missing keys, locked model edits and invalid source hashes', () => {
    expect(recoveryProblems(preview, preview.defaults, [])).toContain(
      'researcher_model_unavailable',
    )
    expect(
      recoveryProblems(preview, preview.defaults, [
        { ...models[0], key_available: false },
      ]),
    ).toContain('reviewer_model_unavailable')
    expect(
      recoveryProblems(
        preview,
        { ...preview.defaults, coordinator_model: 'other' },
        models,
      ),
    ).toContain('reused_model_locked')
    expect(
      recoveryProblems(
        { ...preview, snapshot_hash: 'not-a-hash' },
        preview.defaults,
        models,
      ),
    ).toContain('source_not_ready')
  })
  it('binds review to the source fingerprint and the full model/resource candidate', () => {
    const reviewed = recoveryCandidateKey(preview, preview.defaults)
    expect(recoveryReviewIsCurrent(reviewed, preview, preview.defaults)).toBe(
      true,
    )
    expect(
      recoveryReviewIsCurrent(reviewed, preview, {
        ...preview.defaults,
        parallel: 2,
      }),
    ).toBe(false)
    expect(
      recoveryReviewIsCurrent(
        reviewed,
        { ...preview, snapshot_hash: 'b'.repeat(64) },
        preview.defaults,
      ),
    ).toBe(false)
    expect(recoveryReviewIsCurrent(null, preview, preview.defaults)).toBe(false)
  })
  it('offers in-place resume only for unambiguous paused checkpoints with original call budget', () => {
    const paused = {
      ...preview,
      source_status: 'paused',
      requires_acknowledgement: false,
    }
    const detail = {
      run: { status: 'paused', config: { ...preview.defaults, max_calls: 4 } },
      calls: [{ status: 'succeeded' }, { status: 'succeeded' }],
      retry_runs: [],
    } as unknown as RunDetail
    expect(pausedResumeProblems(detail, paused)).toEqual([])
    expect(originalRecoveryConfig(detail, paused).max_calls).toBe(4)
    expect(
      pausedResumeProblems(
        { ...detail, run: { ...detail.run, status: 'failed' } },
        paused,
      ),
    ).toContain('resume_not_paused')
    expect(
      pausedResumeProblems(
        { ...detail, calls: [{ status: 'running' }] as RunDetail['calls'] },
        paused,
      ),
    ).toContain('resume_ambiguous_calls')
    expect(
      pausedResumeProblems(
        { ...detail, calls: detail.calls.slice(0, 1) },
        paused,
      ),
    ).toContain('resume_snapshot_mismatch')
    expect(
      pausedResumeProblems(
        { ...detail, retry_runs: [{ id: 'child' }] as RunDetail['retry_runs'] },
        paused,
      ),
    ).toContain('resume_has_child')
    expect(
      pausedResumeProblems(
        { ...detail, run: { ...detail.run, config: { max_calls: 2 } } },
        paused,
      ),
    ).toContain('resume_budget_insufficient')
  })
})
