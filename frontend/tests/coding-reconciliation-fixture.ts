import type { CodingConfig, CodingCandidate } from '../src/workbench/coding'
import type { CodingComparison } from '../src/workbench/coding-reconciliation'

export const reconciliationConfig: CodingConfig = {
  model_id: 'model-a',
  writable: ['code.py'],
  tests: ['test_code.py'],
  max_rounds: 2,
  test_timeout: 10,
  max_output_tokens: 8192,
  continuation: {
    checkpoint: { id: 'checkpoint-a', sha256: 'a'.repeat(64) },
    instruction: 'Continue against the changed project',
  },
}
export const reconciliationComparison: CodingComparison = {
  schema_version: 1,
  unit: 'coding_reconciliation',
  task_id: 'task-a',
  config: reconciliationConfig,
  source: {
    id: 'checkpoint-a',
    sha256: 'a'.repeat(64),
    run_id: 'run-source',
    round: 1,
    origin_hash: 'b'.repeat(64),
    candidate_hash: 'c'.repeat(64),
  },
  origin_files: [
    { path: 'code.py', content: 'x=0\n', bytes: 4 },
    { path: 'test_code.py', content: '# old\n', bytes: 6 },
  ],
  checkpoint_files: [
    { path: 'code.py', content: 'x=1\n', bytes: 4 },
    { path: 'test_code.py', content: '# old\n', bytes: 6 },
  ],
  current_files: [
    { path: 'code.py', content: 'x=2\n', bytes: 4 },
    { path: 'test_code.py', content: '# new\n', bytes: 6 },
  ],
  current_hash: 'd'.repeat(64),
  review_hash: 'e'.repeat(64),
  changes: [
    {
      path: 'code.py',
      writable: true,
      current_changed: true,
      checkpoint_changed: true,
      diverged: true,
      inherited_discarded: false,
    },
    {
      path: 'test_code.py',
      writable: false,
      current_changed: true,
      checkpoint_changed: false,
      diverged: true,
      inherited_discarded: false,
    },
  ],
}
export function reconciledCandidate(
  source: 'current' | 'checkpoint' | 'manual' = 'manual',
  content = 'x=3\n',
): CodingCandidate {
  const comparison = reconciliationComparison
  const selected =
    source === 'current'
      ? comparison.current_files[0].content
      : source === 'checkpoint'
        ? comparison.checkpoint_files[0].content
        : content
  return {
    candidate_hash: 'f'.repeat(64),
    config: {
      ...reconciliationConfig,
      continuation: {
        ...reconciliationConfig.continuation!,
        reconciliation: {
          review_hash: comparison.review_hash,
          expected_current_hash: comparison.current_hash,
          resolutions: [
            {
              path: 'code.py',
              source,
              ...(source === 'manual' ? { content } : {}),
            },
          ],
        },
      },
    },
    snapshot: {
      task_id: 'task-a',
      goal: 'Implement against a changed project',
      acceptance: 'Tests pass',
      notes: '',
      profile: 'python-unittest',
      files: [
        {
          path: 'code.py',
          content: selected,
          bytes: new TextEncoder().encode(selected).length,
        },
        comparison.current_files[1],
      ],
      origin_files: comparison.current_files,
      continuation: {
        id: comparison.source.id,
        sha256: comparison.source.sha256,
        run_id: comparison.source.run_id,
        round: comparison.source.round,
        origin_hash: comparison.source.origin_hash,
        patch: '--- a/code.py\n+++ b/code.py\n@@ -1 +1 @@\n-x=0\n+x=1\n',
      },
      reconciliation: {
        schema_version: 1,
        review_hash: comparison.review_hash,
        current_hash: comparison.current_hash,
        resolved_hash: '1'.repeat(64),
        source_candidate_hash: comparison.source.candidate_hash,
        source_origin_files: comparison.origin_files,
        checkpoint_files: comparison.checkpoint_files,
        changes: comparison.changes,
      },
      model: {
        id: 'model-a',
        name: 'Model',
        kind: 'chat_completions',
        model: 'm',
        endpoint: 'http://127.0.0.1:9999/v1',
      },
    },
  }
}
