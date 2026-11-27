import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  admitTaskPlanScope,
  parseTaskPlanScope,
} from '../src/workbench/task-plan-scope'
import { parseCodingCandidate } from '../src/workbench/coding'
import {
  parseTaskTurn,
  parseTurnSnapshot,
  assertTaskTurnReceipt,
  discardTaskTurn,
  fetchTaskTurn,
} from '../src/workbench/task-turns'
import { parseDeviceMessage } from '../src/workbench/devices'
import { reconciledCandidate } from './coding-reconciliation-fixture'

const scope = {
  schema_version: 1 as const,
  task_id: 'task-a',
  scope_hash: 'a'.repeat(64),
}
const snapshot = {
  context_hash: 'b'.repeat(64),
  goal: 'Task goal',
  acceptance: 'Accepted report',
  notes: '',
  text: 'source',
  bytes: 6,
  evidence: [],
  access: 'read_only',
  tools: [],
  supplement: { id: 'turn-a', content: 'Explicit next work' },
  task_plan_scope: scope,
}
const turn = {
  id: 'turn-a',
  task_id: 'task-a',
  request_id: 'original-turn-request',
  content: 'Explicit next work',
  created_at: '2026-11-27T00:00:00Z',
  state: 'prepared',
  run_id: null,
  candidate: {
    candidate_hash: 'c'.repeat(64),
    config: {
      coordinator_model: 'model-a',
      researcher_model: 'model-a',
      reviewer_model: 'model-a',
      max_calls: 4,
      parallel: 2,
      minutes: 10,
      max_output_tokens: 1800,
    },
    snapshot,
  },
}
afterEach(() => vi.unstubAllGlobals())
describe('exact execution Task plan scopes', () => {
  it('preserves scope metadata and keeps legacy omission exact', () => {
    expect(parseTaskPlanScope(scope, 'task-a')).toEqual(scope)
    expect(admitTaskPlanScope({ task_plan_scope: scope }, 'task-a')).toEqual({
      task_plan_scope: scope,
    })
    expect(admitTaskPlanScope({}, 'task-a')).toEqual({})
    expect(parseTurnSnapshot(snapshot).task_plan_scope).toEqual(scope)
    const candidate = reconciledCandidate()
    candidate.snapshot.task_plan_scope = scope
    expect(
      parseCodingCandidate(candidate, 'task-a').snapshot.task_plan_scope,
    ).toEqual(scope)
  })
  it.each([
    null,
    { ...scope, schema_version: true },
    { ...scope, schema_version: 2 },
    { ...scope, task_id: 'other-task' },
    { ...scope, scope_hash: 'bad' },
    { ...scope, extra: true },
  ])('rejects malformed or substituted scopes %#', (value) => {
    expect(() => parseTaskPlanScope(value, 'task-a')).toThrow()
    const candidate = reconciledCandidate() as any
    candidate.snapshot.task_plan_scope = value
    expect(() => parseCodingCandidate(candidate, 'task-a')).toThrow()
    expect(() =>
      parseTaskTurn({
        ...turn,
        candidate: {
          ...turn.candidate,
          snapshot: { ...snapshot, task_plan_scope: value },
        },
      }),
    ).toThrow()
  })
  it('binds a known prepared message to the same frozen scope after a response loss', () => {
    const known = parseTaskTurn(turn)
    expect(assertTaskTurnReceipt(turn, known)).toEqual(known)
    expect(() =>
      assertTaskTurnReceipt(
        {
          ...turn,
          candidate: {
            ...turn.candidate,
            snapshot: {
              ...snapshot,
              task_plan_scope: { ...scope, scope_hash: 'd'.repeat(64) },
            },
          },
        },
        known,
      ),
    ).toThrow()
  })
})
describe('explicit prepared Task turn discard', () => {
  it('retains candidate, content and request identity in the immutable terminal message', () => {
    const discarded = { ...turn, state: 'discarded' }
    expect(parseTaskTurn(discarded).candidate).toEqual(turn.candidate)
    expect(assertTaskTurnReceipt(discarded, parseTaskTurn(turn)).state).toBe(
      'discarded',
    )
    expect(() =>
      assertTaskTurnReceipt(turn, parseTaskTurn(discarded)),
    ).toThrow()
    expect(() => parseTaskTurn({ ...discarded, candidate: null })).toThrow()
    expect(() => parseTaskTurn({ ...discarded, run_id: 'some-run' })).toThrow()
  })
  it('performs one explicit discard then reconciles the original message with GET', async () => {
    const discarded = { ...turn, state: 'discarded' }
    const fetcher = vi
      .fn()
      .mockImplementation(async () => new Response(JSON.stringify(discarded)))
    vi.stubGlobal('fetch', fetcher)
    expect((await discardTaskTurn('task-a', parseTaskTurn(turn))).state).toBe(
      'discarded',
    )
    expect((await fetchTaskTurn('task-a', 'turn-a')).state).toBe('discarded')
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/tasks/task-a/turns/turn-a/discard',
    )
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      candidate_hash: turn.candidate.candidate_hash,
      consent: true,
    })
    expect(fetcher.mock.calls[1][1].method).toBeUndefined()
  })
  it('does not discard unknown/applied messages or accept a substituted terminal candidate', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      discardTaskTurn(
        'task-a',
        parseTaskTurn({ ...turn, state: 'applied', run_id: 'run-a' }),
      ),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...turn,
          state: 'discarded',
          candidate: { ...turn.candidate, candidate_hash: 'd'.repeat(64) },
        }),
      ),
    )
    await expect(
      discardTaskTurn('task-a', parseTaskTurn(turn)),
    ).rejects.toThrow()
  })
  it('exposes only the terminal message state to paired devices without coding or discard scope', () => {
    const message = {
      id: turn.id,
      request_id: turn.request_id,
      content: turn.content,
      created_at: turn.created_at,
      state: 'discarded',
      run_id: null,
    }
    expect(parseDeviceMessage(message).state).toBe('discarded')
    expect(() =>
      parseDeviceMessage({ ...message, candidate: turn.candidate }),
    ).toThrow()
  })
})
