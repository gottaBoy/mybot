import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  artifactRefs,
  parseArtifactPage,
  parseArtifactRefs,
  parseArtifactSources,
  fetchTaskArtifacts,
} from '../src/workbench/task-artifacts'
import {
  assertTaskTurnReceipt,
  parseTaskTurn,
  prepareTaskTurn,
  previewTaskTurn,
} from '../src/workbench/task-turns'

const item = {
  id: 'artifact-a',
  run_id: 'run-a',
  task_id: 'task-a',
  title: 'Prior report',
  kind: 'report',
  created_at: '2026-11-26T00:00:00Z',
  bytes: 6,
  sha256: 'a'.repeat(64),
  content: '中文',
}
const { content: _, ...option } = item
const refs = artifactRefs([item])
const page = {
  schema_version: 1,
  unit: 'task_artifacts',
  task_id: 'task-a',
  items: [option],
  total: 1,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  order: 'artifacts-created-v1',
}
const snapshot = {
  context_hash: 'b'.repeat(64),
  goal: 'Goal',
  acceptance: '',
  notes: '',
  text: 'Exact context',
  bytes: 13,
  evidence: [],
  access: 'read_only',
  tools: [],
  supplement: { id: 'turn-a', content: 'Continue selected work' },
  artifacts: [item],
}
const config = {
  coordinator_model: 'model-a',
  researcher_model: 'model-a',
  reviewer_model: 'model-a',
  max_calls: 4,
  parallel: 2,
  minutes: 10,
  max_output_tokens: 1800,
}
const turn = {
  id: 'turn-a',
  task_id: 'task-a',
  request_id: 'request-a',
  content: 'Continue selected work',
  created_at: '2026-11-26T00:00:00Z',
  state: 'prepared',
  run_id: null,
  candidate: { candidate_hash: 'c'.repeat(64), config, snapshot },
}
afterEach(() => vi.unstubAllGlobals())
function response(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
describe('explicit prior artifact admission', () => {
  it('accepts UTF-8 bytes and exact task-scoped sources', () => {
    expect(parseArtifactSources([item], 'task-a')).toEqual([item])
    expect(parseArtifactPage(page, 'task-a', 1)).toEqual(page)
    expect(parseTaskTurn(turn).candidate?.snapshot.artifacts).toEqual([item])
  })
  it.each([
    { ...item, bytes: 2 },
    { ...item, task_id: 'wrong' },
    { ...item, sha256: 'bad' },
    { ...item, content: '\ud800' },
    { ...item, extra: true },
    { ...item, bytes: 32769 },
  ])('rejects malformed or foreign full references %#', (value) => {
    expect(() => parseArtifactSources([value], 'task-a')).toThrow()
  })
  it('rejects duplicates, total overflow and excess references', () => {
    expect(() => parseArtifactSources([item, item])).toThrow()
    expect(() => parseArtifactRefs([...refs, ...refs])).toThrow()
    const large = [0, 1, 2].map((index) => ({
      ...item,
      id: `a-${index}`,
      bytes: 23000,
      content: 'x'.repeat(23000),
    }))
    expect(() => parseArtifactSources(large)).toThrow()
    expect(() =>
      parseArtifactRefs(
        [0, 1, 2, 3].map((index) => ({
          id: `a-${index}`,
          sha256: item.sha256,
        })),
      ),
    ).toThrow()
  })
  it.each([
    { ...page, task_id: 'wrong' },
    { ...page, requested_page: 2 },
    { ...page, total: 21 },
    { ...page, has_more: true },
    { ...page, items: [item] },
    { ...page, items: [{ ...option, sha256: null }] },
    { ...page, error: 'failure' },
  ])('rejects mismatched or success-shaped catalog responses %#', (value) => {
    expect(() => parseArtifactPage(value, 'task-a', 1)).toThrow()
  })
  it('keeps unavailable sizes explicit without inventing empty bodies', () => {
    const unavailable = { ...option, bytes: 40000, sha256: null }
    expect(
      parseArtifactPage({ ...page, items: [unavailable] }, 'task-a', 1).items,
    ).toEqual([unavailable])
    expect(() =>
      parseArtifactSources([{ ...unavailable, content: '' }]),
    ).toThrow()
  })
  it('binds preview to exactly the selected IDs, hashes and Task', async () => {
    const fetch = vi.fn().mockResolvedValue(response(snapshot))
    vi.stubGlobal('fetch', fetch)
    expect(
      (await previewTaskTurn('task-a', 'turn-a', undefined, refs)).artifacts,
    ).toEqual([item])
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      artifact_refs: refs,
    })
    fetch.mockResolvedValueOnce(response(snapshot))
    await expect(
      previewTaskTurn('task-a', 'turn-a', undefined, []),
    ).rejects.toThrow()
    fetch.mockResolvedValueOnce(
      response({ ...snapshot, artifacts: [{ ...item, task_id: 'foreign' }] }),
    )
    await expect(
      previewTaskTurn('task-a', 'turn-a', undefined, refs),
    ).rejects.toThrow()
  })
  it('binds preparation and GET reconciliation to the reference candidate', async () => {
    const preparation = {
      ...config,
      context_hash: snapshot.context_hash,
      artifact_refs: refs,
    }
    const fetch = vi.fn().mockResolvedValue(response(turn))
    vi.stubGlobal('fetch', fetch)
    const prepared = await prepareTaskTurn('task-a', 'turn-a', preparation)
    expect(prepared.candidate?.snapshot.artifacts).toEqual([item])
    expect(
      assertTaskTurnReceipt(
        turn,
        { ...turn, state: 'saved', candidate: null } as any,
        preparation,
      ),
    ).toEqual(turn)
    expect(() =>
      assertTaskTurnReceipt(
        turn,
        { ...turn, state: 'saved', candidate: null } as any,
        { ...preparation, artifact_refs: [] },
      ),
    ).toThrow()
    fetch.mockResolvedValueOnce(
      response({
        ...turn,
        candidate: {
          ...turn.candidate,
          snapshot: {
            ...snapshot,
            artifacts: [{ ...item, sha256: 'd'.repeat(64) }],
          },
        },
      }),
    )
    await expect(
      prepareTaskTurn('task-a', 'turn-a', preparation),
    ).rejects.toThrow()
  })
  it('cancels obsolete catalog reads and preserves endpoint failures', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        controller.abort()
        return response(page)
      }),
    )
    await expect(
      fetchTaskArtifacts('task-a', 1, controller.signal),
    ).rejects.toThrow()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })),
    )
    await expect(fetchTaskArtifacts('task-a', 1)).rejects.toThrow()
  })
})
