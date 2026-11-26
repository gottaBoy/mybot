import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyCoding,
  fetchCoding,
  fetchPreparedCoding,
  parseCodingCandidate,
  parseCodingConfig,
  parseCodingJob,
  parseCodingTest,
  prepareCoding,
  previewCoding,
  type CodingCandidate,
} from '../src/workbench/coding'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
} from '../src/workbench/task-workspace-location'
const config = {
  model_id: 'model-a',
  writable: ['code.py'],
  tests: ['test_code.py'],
  max_rounds: 2,
  test_timeout: 10,
  max_output_tokens: 8192,
}
const candidate: CodingCandidate = {
  config,
  candidate_hash: 'a'.repeat(64),
  snapshot: {
    task_id: 'task-a',
    goal: 'Implement a verified change',
    acceptance: 'Tests pass',
    notes: '',
    files: [
      { path: 'code.py', content: 'x=0\n', bytes: 4 },
      { path: 'test_code.py', content: '', bytes: 0 },
    ],
    profile: 'python-unittest',
    model: {
      id: 'model-a',
      name: 'Model',
      kind: 'chat_completions',
      model: 'm',
      endpoint: 'http://127.0.0.1:9999/v1',
    },
  },
}
const job = {
  request_id: 'original-coding-request',
  task_id: 'task-a',
  candidate_hash: candidate.candidate_hash,
  state: 'prepared',
  run_id: null,
  created_at: '2026-11-25T00:00:00Z',
  candidate,
}
const result = {
  profile: 'python-unittest',
  command: ['python', '-m', 'unittest', 'explicit-files'],
  exit_code: 0,
  duration_ms: 25,
  output: 'actual output',
  timed_out: false,
  truncated: false,
  tests_run: 2,
  passed: true,
  round: 1,
  test_files: ['test_code.py'],
  receipt: { tests_run: 2, failures: 0, errors: 0, skipped: 0, success: true },
}
afterEach(() => vi.unstubAllGlobals())
describe('isolated coding admission', () => {
  it('admits exact candidate and stable prepared identity', () => {
    expect(parseCodingCandidate(candidate, 'task-a', config)).toEqual(candidate)
    expect(parseCodingJob(job, 'task-a', job.request_id, candidate)).toEqual(
      job,
    )
  })
  it.each([
    { max_rounds: 4 },
    { test_timeout: 0 },
    { max_output_tokens: 0 },
    { writable: ['../code.py'] },
    { tests: ['/etc/passwd'] },
    { writable: ['.env'] },
    { tests: ['test_code.py', 'test_code.py'] },
    { writable: ['test_code.py'] },
    { extra: true },
  ])('rejects invalid config %j', (patch) =>
    expect(() => parseCodingConfig({ ...config, ...patch })).toThrow(),
  )
  it.each([
    { candidate_hash: 'bad' },
    { extra: true },
    { snapshot: { ...candidate.snapshot, task_id: 'other' } },
    {
      snapshot: {
        ...candidate.snapshot,
        files: [{ path: 'code.py', content: 'private', bytes: 4 }],
      },
    },
    {
      snapshot: {
        ...candidate.snapshot,
        model: { ...candidate.snapshot.model, id: 'other' },
      },
    },
    { config: { ...config, model_id: 'other' } },
  ])('rejects malformed or substituted candidate %j', (patch) =>
    expect(() =>
      parseCodingCandidate({ ...candidate, ...patch }, 'task-a'),
    ).toThrow(),
  )
  it.each([
    { request_id: 'other-request' },
    { task_id: 'other' },
    { run_id: 'run-a' },
    { state: 'applied' },
    { candidate_hash: 'b'.repeat(64) },
    { created_at: 'not a timestamp' },
    {
      candidate: {
        ...candidate,
        snapshot: { ...candidate.snapshot, notes: 'different' },
      },
    },
  ])('binds exact job to original input %j', (patch) =>
    expect(() =>
      parseCodingJob({ ...job, ...patch }, 'task-a', job.request_id, candidate),
    ).toThrow(),
  )
  it('preview and prepare do not execute; a lost response reconciles by GET', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(candidate)))
      .mockResolvedValueOnce(new Response(JSON.stringify(job)))
      .mockResolvedValueOnce(new Response(JSON.stringify(job)))
    vi.stubGlobal('fetch', fetcher)
    await previewCoding('task-a', config)
    await prepareCoding('task-a', job.request_id, candidate)
    await fetchCoding('task-a', job.request_id, undefined, candidate)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      '/api/tasks/task-a/coding/preview',
      '/api/tasks/task-a/coding/prepare',
      `/api/tasks/task-a/coding/${job.request_id}`,
    ])
    expect(fetcher.mock.calls[2][1].method).toBeUndefined()
  })
  it('execution requires an exact applied receipt, not a changed candidate or a latest Run', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ...job, state: 'applied', run_id: 'run-a' }),
          ),
        ),
    )
    expect((await applyCoding('task-a', job as any, 'execute')).run_id).toBe(
      'run-a',
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...job, state: 'prepared' })),
        ),
    )
    await expect(applyCoding('task-a', job as any, 'execute')).rejects.toThrow()
  })
  it('prepared hydration rejects an applied row and cancelled reads make no request', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              prepared: { ...job, state: 'applied', run_id: 'run-a' },
            }),
          ),
        ),
    )
    await expect(fetchPreparedCoding('task-a')).rejects.toThrow()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchCoding('task-a', job.request_id, controller.signal),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
describe('actual test result contract', () => {
  it('preserves actual output and test count', () =>
    expect(parseCodingTest(JSON.stringify(result))).toEqual(result))
  it.each([
    { exit_code: 1 },
    { tests_run: 0 },
    { timed_out: true },
    { truncated: true },
    { passed: 'yes' },
    { receipt: null },
    { receipt: { ...result.receipt, tests_run: 1 } },
    { extra: 1 },
  ])('rejects success-shaped invalid evidence %j', (patch) =>
    expect(() =>
      parseCodingTest(JSON.stringify({ ...result, ...patch })),
    ).toThrow(),
  )
})
describe('coding pending location', () => {
  it('round trips the original request independently of the selected Run', () => {
    const href = taskWorkspaceHref('task-a', {
      tab: 'work',
      runId: 'run-a',
      codingRequestId: job.request_id,
    })
    expect(readTaskWorkspaceLocation(href)).toEqual({
      tab: 'work',
      runId: 'run-a',
      codingRequestId: job.request_id,
    })
  })
  it.each([
    'codingRequest=bad',
    'codingRequest=original-request&codingRequest=another-request',
    'codingRequest=original-request&taskSend=message-request',
  ])('rejects contradictory requests %s', (query) => {
    expect(readTaskWorkspaceLocation(`#task/task-a?${query}`).error).toBe(
      'coding_invalid',
    )
  })
})
