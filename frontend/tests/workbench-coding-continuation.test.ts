import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseCodingCandidate,
  parseCodingConfig,
  parseCodingCheckpoints,
  parseCodeCheckpoint,
  previewCoding,
  prepareCoding,
  fetchCoding,
  fetchCodingCheckpoints,
  recordedCodingCandidate,
} from '../src/workbench/coding'

const origin = [
  { path: 'code.py', content: 'x=0\n', bytes: 4 },
  { path: 'test_code.py', content: '', bytes: 0 },
]
const current = [{ path: 'code.py', content: 'x=1\n', bytes: 4 }, origin[1]]
const config = {
  model_id: 'model-a',
  writable: ['code.py'],
  tests: ['test_code.py'],
  max_rounds: 1,
  test_timeout: 5,
  max_output_tokens: 8192,
  continuation: {
    checkpoint: { id: 'checkpoint-a', sha256: 'a'.repeat(64) },
    instruction: 'Fix remaining work',
  },
}
const candidate = {
  config,
  candidate_hash: 'b'.repeat(64),
  snapshot: {
    task_id: 'task-a',
    goal: 'Goal',
    acceptance: '',
    notes: '',
    profile: 'python-unittest',
    files: current,
    origin_files: origin,
    continuation: {
      id: 'checkpoint-a',
      sha256: 'a'.repeat(64),
      run_id: 'run-source',
      round: 1,
      origin_hash: 'c'.repeat(64),
      patch: '--- a/code.py\n+++ b/code.py\n@@ -1 +1 @@\n-x=0\n+x=1\n',
    },
    model: {
      id: 'model-a',
      name: 'Model',
      kind: 'chat_completions',
      model: 'fixture',
      endpoint: 'http://127.0.0.1:9999',
    },
  },
}
const option = {
  id: 'checkpoint-a',
  run_id: 'run-source',
  task_id: 'task-a',
  title: 'Code snapshot',
  created_at: '2026-11-26T00:00:00Z',
  source_status: 'failed',
  bytes: 320,
  sha256: 'a'.repeat(64),
  round: 1,
}
const page = {
  schema_version: 1,
  unit: 'coding_checkpoints',
  task_id: 'task-a',
  items: [option],
  total: 1,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  order: 'checkpoints-created-v1',
}
const checkpoint = {
  schema_version: 1,
  task_id: 'task-a',
  run_id: 'run-source',
  candidate_hash: 'b'.repeat(64),
  round: 1,
  origin_hash: 'c'.repeat(64),
  files: current,
}
const job = {
  request_id: 'coding-request-new',
  task_id: 'task-a',
  candidate_hash: candidate.candidate_hash,
  state: 'prepared',
  run_id: null,
  created_at: '2026-11-26T00:00:00Z',
  candidate,
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => vi.unstubAllGlobals())
describe('isolated code continuation identity', () => {
  it('keeps inherited files, original base, instruction and immediate provenance distinct', () => {
    expect(parseCodingCandidate(candidate, 'task-a', config)).toEqual(candidate)
    expect(
      parseCodeCheckpoint(JSON.stringify(checkpoint), 'task-a', 'run-source'),
    ).toEqual(checkpoint)
    expect(
      recordedCodingCandidate(
        {
          mode: 'coding-v1',
          coding: { ...candidate, model: { id: 'model-a' } },
        },
        'task-a',
      ),
    ).toEqual(candidate)
    expect(() =>
      recordedCodingCandidate({ mode: 'coding-v1' }, 'task-a'),
    ).toThrow()
  })
  it.each([
    { instruction: '' },
    { instruction: '  ' },
    { instruction: ' padded ' },
    { instruction: 'nul\0character' },
    { checkpoint: { id: 'wrong', sha256: 'bad' } },
    { checkpoint: { ...config.continuation.checkpoint, files: [] } },
    { instruction: 'x'.repeat(8001) },
    { extra: true },
  ])('rejects malformed continuation configuration %#', (patch) => {
    expect(() =>
      parseCodingConfig({
        ...config,
        continuation: { ...config.continuation, ...patch },
      }),
    ).toThrow()
  })
  it.each([
    {
      ...candidate.snapshot,
      continuation: { ...candidate.snapshot.continuation, id: 'wrong' },
    },
    {
      ...candidate.snapshot,
      continuation: {
        ...candidate.snapshot.continuation,
        sha256: 'd'.repeat(64),
      },
    },
    { ...candidate.snapshot, origin_files: undefined },
    { ...candidate.snapshot, files: origin },
    {
      ...candidate.snapshot,
      files: [
        current[0],
        { path: 'test_code.py', content: 'changed', bytes: 7 },
      ],
    },
    { ...candidate.snapshot, origin_files: [...origin].reverse() },
  ])('rejects substituted origins and inherited test edits %#', (snapshot) => {
    expect(() =>
      parseCodingCandidate({ ...candidate, snapshot }, 'task-a'),
    ).toThrow()
  })
  it('rejects continuation snapshot without an explicit selection', () => {
    const { continuation: _, ...plain } = config
    expect(() =>
      parseCodingCandidate({ ...candidate, config: plain }, 'task-a'),
    ).toThrow()
  })
  it.each([
    { ...page, task_id: 'other' },
    { ...page, requested_page: 2 },
    { ...page, has_more: true },
    { ...page, total: 21 },
    { ...page, items: [{ ...option, source_status: 'running' }] },
    { ...page, items: [{ ...option, files: [] }] },
    { ...page, items: [{ ...option, sha256: null }] },
  ])('rejects wrong metadata snapshots %#', (value) => {
    expect(() => parseCodingCheckpoints(value, 'task-a', 1)).toThrow()
  })
  it('keeps invalid metadata unavailable without fabricating checkpoint content', () => {
    expect(
      parseCodingCheckpoints(
        { ...page, items: [{ ...option, round: null, sha256: null }] },
        'task-a',
        1,
      ).items[0].sha256,
    ).toBeNull()
  })
  it.each([
    { ...checkpoint, task_id: 'other' },
    { ...checkpoint, run_id: 'other' },
    { ...checkpoint, round: 0 },
    { ...checkpoint, origin_hash: 'bad' },
    { ...checkpoint, files: [{ ...current[0], bytes: 5 }] },
  ])('rejects invalid checkpoint bodies %#', (value) => {
    expect(() =>
      parseCodeCheckpoint(JSON.stringify(value), 'task-a', 'run-source'),
    ).toThrow()
  })
  it('sends the precise selection and verifies preparation and original GET receipts', async () => {
    const fetch = vi.fn().mockResolvedValue(response(candidate))
    vi.stubGlobal('fetch', fetch)
    expect(await previewCoding('task-a', config)).toEqual(candidate)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(config)
    fetch.mockResolvedValueOnce(response(job))
    const prepared = await prepareCoding('task-a', job.request_id, candidate)
    expect(prepared.candidate).toEqual(candidate)
    const sent = JSON.parse(fetch.mock.calls[1][1].body)
    expect(sent.continuation).toEqual(config.continuation)
    fetch.mockResolvedValueOnce(response(job))
    expect(
      (await fetchCoding('task-a', job.request_id, undefined, candidate))
        .candidate,
    ).toEqual(candidate)
    expect(fetch.mock.calls[2][1].method).toBeUndefined()
    fetch.mockResolvedValueOnce(
      response({
        ...job,
        candidate: {
          ...candidate,
          config: {
            ...config,
            continuation: {
              ...config.continuation,
              instruction: 'Different work',
            },
          },
        },
      }),
    )
    await expect(
      fetchCoding('task-a', job.request_id, undefined, candidate),
    ).rejects.toThrow()
  })
  it('does not hide catalog failures or accept obsolete reads', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchCodingCheckpoints('task-a', 1)).rejects.toThrow()
    const controller = new AbortController()
    fetch.mockImplementationOnce(async () => {
      controller.abort()
      return response(page)
    })
    await expect(
      fetchCodingCheckpoints('task-a', 1, controller.signal),
    ).rejects.toThrow()
  })
})
