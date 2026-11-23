import { describe, expect, it } from 'vitest'
import { recordedRunWorkflow } from '../src/workbench/run-workflow'

const definition = {
  schema_version: 1,
  name: 'Recorded workflow',
  harness: 'local-superagent',
  stages: [
    {
      id: 'planning',
      role: 'coordinator',
      model_id: 'model-1',
      instructions: '',
    },
    {
      id: 'research',
      role: 'researcher',
      model_id: 'model-1',
      instructions: '',
    },
    {
      id: 'synthesis',
      role: 'reviewer',
      model_id: 'model-1',
      instructions: '',
    },
  ],
  limits: {
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
    research_tasks: 2,
  },
  review: 'human',
}
const snapshot = {
  workflow_id: 'local-research',
  version: 3,
  definition_hash: 'a'.repeat(64),
  definition,
}

describe('recorded Run workflow admission', () => {
  it('keeps historical absence explicit without inventing the latest version', () => {
    expect(recordedRunWorkflow({ evidence: [] })).toBeUndefined()
  })
  it('preserves the recorded version and complete definition', () => {
    expect(recordedRunWorkflow({ workflow: snapshot })).toEqual(snapshot)
  })
  it('admits a materialized built-in snapshot with explicit null version', () => {
    expect(
      recordedRunWorkflow({ workflow: { ...snapshot, version: null } })
        ?.version,
    ).toBeNull()
  })
  it.each([
    null,
    undefined,
    {},
    { ...snapshot, version: 0 },
    { ...snapshot, unknown: true },
  ])(
    'rejects a present malformed snapshot instead of enabling legacy controls',
    (workflow) => expect(() => recordedRunWorkflow({ workflow })).toThrow(),
  )
  it.each([null, undefined, [], 'context'])(
    'rejects malformed Run context',
    (context) => {
      expect(() => recordedRunWorkflow(context)).toThrow()
    },
  )
})
