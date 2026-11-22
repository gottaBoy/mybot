import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertWorkflowReceipt,
  fetchWorkflow,
  fetchWorkflowImpact,
  fetchWorkflowOperation,
  fetchWorkflowVersion,
  fetchWorkflowVersions,
  parseWorkflowBundle,
  parseWorkflowDefinition,
  parseWorkflowImpact,
  parseWorkflowReceipt,
  parseWorkflowSnapshot,
  parseWorkflowVersion,
  parseWorkflowVersions,
  publishWorkflow,
  saveWorkflowDraft,
  workflowCommandHash,
  workflowConfig,
  type WorkflowCommand,
  type WorkflowDefinition,
} from '../src/workbench/workflows'
import { ApiError } from '../src/workbench/api'

const definition: WorkflowDefinition = {
  schema_version: 1,
  name: '本地研究',
  harness: 'local-superagent',
  stages: [
    {
      id: 'planning',
      role: 'coordinator',
      model_id: 'model-a',
      instructions: '  保留空白\n',
    },
    {
      id: 'research',
      role: 'researcher',
      model_id: 'model-b',
      instructions: '',
    },
    {
      id: 'synthesis',
      role: 'reviewer',
      model_id: 'model-a',
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
const version = {
  workflow_id: 'local-research',
  version: 1,
  definition_hash: 'a'.repeat(64),
  definition,
  created_at: '2026-11-21T00:00:00Z',
}
const bundle = {
  schema_version: 1,
  workflow_id: 'local-research',
  revision: 1,
  definition,
  definition_hash: 'a'.repeat(64),
  updated_at: '2026-11-21T00:00:00Z',
  published: null,
}
const impact = {
  workflow_id: 'local-research',
  revision: 1,
  definition_hash: 'a'.repeat(64),
  impact_hash: 'b'.repeat(64),
  model_ids: ['model-a', 'model-b'],
  active_runs: 2,
  historical_runs: 9,
  published_version: null,
}
const history = (items: unknown[] = [version]) => ({
  schema_version: 1,
  workflow_id: 'local-research',
  items,
  total: items.length,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
})
const saveCommand = (): WorkflowCommand => ({
  kind: 'save',
  request_id: 'workflow-request-123',
  expected_revision: 1,
  definition: structuredClone(definition),
})
const publishCommand = (): WorkflowCommand => ({
  kind: 'publish',
  request_id: 'workflow-request-456',
  expected_revision: 1,
  definition_hash: impact.definition_hash,
  impact_hash: impact.impact_hash,
  consent: true,
})
async function receipt(command = saveCommand()) {
  return {
    request_id: command.request_id,
    kind: command.kind,
    candidate_hash: await workflowCommandHash(command),
    state: 'applied',
    result:
      command.kind === 'save'
        ? {
            ...bundle,
            revision: command.expected_revision + 1,
            definition: command.definition,
          }
        : version,
  }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fixed workflow definition contract', () => {
  it('retains localized stage instructions and copies the definition', () => {
    const source = structuredClone(definition)
    const value = parseWorkflowDefinition(source)
    source.stages[0].instructions = 'edited'
    source.limits.research_tasks = 1
    expect(value.stages[0].instructions).toBe('  保留空白\n')
    expect(value.limits.research_tasks).toBe(2)
  })
  it('allows unbound draft stages, never publication or Run snapshots', () => {
    const draft = structuredClone(definition)
    draft.stages[0].model_id = null
    expect(parseWorkflowDefinition(draft).stages[0].model_id).toBeNull()
    expect(() => parseWorkflowDefinition(draft, true)).toThrow()
    expect(() => workflowConfig(draft)).toThrow()
    expect(() =>
      parseWorkflowSnapshot({ ...version, version: null, definition: draft }),
    ).toThrow()
  })
  it('maps exactly the seven existing Run resources', () => {
    expect(workflowConfig(definition)).toEqual({
      coordinator_model: 'model-a',
      researcher_model: 'model-b',
      reviewer_model: 'model-a',
      max_calls: 4,
      parallel: 2,
      minutes: 10,
      max_output_tokens: 1800,
    })
  })
  it.each([
    { schema_version: 2 },
    { name: '' },
    { name: ' leading' },
    { name: 'x'.repeat(81) },
    { name: '\ud800' },
    { harness: 'shell' },
    { review: 'automatic' },
    { unknown: true },
    { stages: [] },
    { stages: [...definition.stages].reverse() },
    { stages: [...definition.stages, definition.stages[0]] },
  ])('rejects unsupported definition metadata %j', (patch) => {
    expect(() => parseWorkflowDefinition({ ...definition, ...patch })).toThrow(
      'workflow_response_invalid',
    )
  })
  it.each([
    { id: 'custom' },
    { role: 'reviewer' },
    { model_id: '' },
    { model_id: ' model' },
    { instructions: 'x'.repeat(2001) },
    { instructions: '\udc00' },
    { tools: ['shell'] },
  ])('rejects altered stage contracts %j', (patch) => {
    expect(() =>
      parseWorkflowDefinition({
        ...definition,
        stages: [
          { ...definition.stages[0], ...patch },
          ...definition.stages.slice(1),
        ],
      }),
    ).toThrow()
  })
  it.each([
    { max_calls: 2 },
    { max_calls: 9 },
    { max_calls: 3.5 },
    { parallel: 0 },
    { parallel: 3 },
    { minutes: 0 },
    { minutes: 31 },
    { max_output_tokens: 255 },
    { max_output_tokens: 4097 },
    { research_tasks: 0 },
    { research_tasks: 3 },
    { extra: true },
  ])('rejects invalid or unknown resource bounds %j', (patch) => {
    expect(() =>
      parseWorkflowDefinition({
        ...definition,
        limits: { ...definition.limits, ...patch },
      }),
    ).toThrow()
  })
  it('counts Unicode codepoints rather than UTF16 units', () => {
    expect(
      parseWorkflowDefinition({ ...definition, name: '😀'.repeat(80) }).name,
    ).toHaveLength(160)
    expect(() =>
      parseWorkflowDefinition({ ...definition, name: '😀'.repeat(81) }),
    ).toThrow()
  })
})

describe('workflow resource read models', () => {
  it('keeps saved draft and published definition separate', () => {
    const current = parseWorkflowBundle({
      ...bundle,
      definition: { ...definition, name: 'New unsaved-to-publish content' },
      published: version,
    })
    expect(current.definition.name).not.toBe(current.published?.definition.name)
  })
  it.each([
    { workflow_id: 'another-workflow' },
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { definition_hash: 'A'.repeat(64) },
    { updated_at: 'today' },
    { published: {} },
    { credentials: 'secret' },
  ])('rejects malformed or secret-bearing bundles %j', (patch) => {
    expect(() => parseWorkflowBundle({ ...bundle, ...patch })).toThrow()
  })
  it('binds an immutable exact published version', () => {
    expect(parseWorkflowVersion(version, 1).version).toBe(1)
    expect(() => parseWorkflowVersion(version, 2)).toThrow()
    expect(() => parseWorkflowVersion({ ...version, version: null })).toThrow()
  })
  it('distinguishes materialized built-in from immutable published snapshots', () => {
    const { created_at: _createdAt, ...snapshot } = version
    expect(
      parseWorkflowSnapshot({ ...snapshot, version: null }).version,
    ).toBeNull()
    expect(parseWorkflowSnapshot(snapshot).version).toBe(1)
    expect(() => parseWorkflowSnapshot(undefined)).toThrow()
    expect(() => parseWorkflowSnapshot(null)).toThrow()
    expect(() => parseWorkflowSnapshot({ ...snapshot, version: 0 })).toThrow()
    expect(() =>
      parseWorkflowSnapshot({ ...snapshot, plugin: 'shell' }),
    ).toThrow()
  })
  it('preserves descending version history without sorting it', () => {
    const current = parseWorkflowVersions(
      history([{ ...version, version: 3 }, version]),
      1,
    )
    expect(current.items.map((item) => item.version)).toEqual([3, 1])
    expect(() =>
      parseWorkflowVersions(history([version, { ...version, version: 3 }])),
    ).toThrow()
    expect(() => parseWorkflowVersions(history([version, version]))).toThrow()
  })
  it.each([
    { total: 2 },
    { requested_page: 0 },
    { page: 2 },
    { page_size: 50 },
    { total_pages: 2 },
    { has_more: true },
    { extra: true },
  ])('rejects contradictory version page metadata %j', (patch) => {
    expect(() => parseWorkflowVersions({ ...history(), ...patch }, 1)).toThrow()
  })
  it('admits a bounded empty page and clamped late page', () => {
    expect(parseWorkflowVersions(history([])).total).toBe(0)
    expect(
      parseWorkflowVersions({ ...history(), requested_page: 99 }, 99).page,
    ).toBe(1)
  })
  it('binds impact validation to exact saved revision and definition', () => {
    expect(
      parseWorkflowImpact(impact, {
        revision: 1,
        definition_hash: impact.definition_hash,
      }).model_ids,
    ).toEqual(['model-a', 'model-b'])
    expect(() =>
      parseWorkflowImpact(impact, {
        revision: 2,
        definition_hash: impact.definition_hash,
      }),
    ).toThrow()
  })
  it.each([
    { model_ids: [] },
    { model_ids: ['model-a', 'model-a'] },
    { model_ids: ['a', 'b', 'c', 'd'] },
    { active_runs: -1 },
    { historical_runs: null },
    { published_version: 0 },
    { impact_hash: 'missing' },
    { unknown: true },
  ])('rejects incomplete impact or invented metrics %j', (patch) => {
    expect(() => parseWorkflowImpact({ ...impact, ...patch })).toThrow()
  })
})

describe('immutable workflow operation receipts', () => {
  it('binds command hashes to exact content, revision and kind, excluding only request ID', async () => {
    const command = saveCommand()
    const expected = await workflowCommandHash(command)
    expect(
      await workflowCommandHash({ ...command, request_id: 'other-request' }),
    ).toBe(expected)
    expect(
      await workflowCommandHash({ ...command, expected_revision: 2 }),
    ).not.toBe(expected)
    expect(await workflowCommandHash(publishCommand())).not.toBe(expected)
    if (command.kind === 'save')
      expect(
        await workflowCommandHash({
          ...command,
          definition: { ...command.definition, name: 'Other content' },
        }),
      ).not.toBe(expected)
  })
  it('accepts original save receipt, not merely a newer current resource', async () => {
    const command = saveCommand()
    const value = await receipt(command)
    expect(await assertWorkflowReceipt(value, command)).toMatchObject({
      kind: 'save',
      result: { revision: 2 },
    })
    expect(() => parseWorkflowReceipt(bundle)).toThrow()
    await expect(
      assertWorkflowReceipt(
        {
          ...value,
          result: { ...value.result, revision: 3 },
        },
        command,
      ),
    ).rejects.toThrow()
  })
  it('rejects changed request, command hash, kind and saved definition', async () => {
    const command = saveCommand()
    const value = await receipt(command)
    for (const patch of [
      { request_id: 'request-other' },
      { candidate_hash: 'c'.repeat(64) },
      { kind: 'publish', result: version },
      {
        result: {
          ...bundle,
          revision: 2,
          definition: { ...definition, name: 'Changed' },
        },
      },
      { state: 'unknown' },
      { secret: 'never expose' },
    ]) {
      await expect(
        assertWorkflowReceipt({ ...value, ...patch }, command),
      ).rejects.toThrow()
    }
  })
  it('accepts deduplicated published content without inventing another version', async () => {
    const command = publishCommand()
    const value = await receipt(command)
    expect(await assertWorkflowReceipt(value, command)).toMatchObject({
      kind: 'publish',
      result: { version: 1 },
    })
    await expect(
      assertWorkflowReceipt(
        {
          ...value,
          result: { ...version, definition_hash: 'd'.repeat(64) },
        },
        command,
      ),
    ).rejects.toThrow()
  })
})

describe('workflow HTTP boundaries', () => {
  it('uses bounded GET resources and exact request identities', async () => {
    const operation = await receipt()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(bundle))
      .mockResolvedValueOnce(response(history()))
      .mockResolvedValueOnce(response(version))
      .mockResolvedValueOnce(response(impact))
      .mockResolvedValueOnce(response(operation))
    vi.stubGlobal('fetch', fetch)
    await fetchWorkflow()
    await fetchWorkflowVersions(1)
    await fetchWorkflowVersion(1)
    await fetchWorkflowImpact({
      revision: 1,
      definition_hash: impact.definition_hash,
    })
    await fetchWorkflowOperation(operation.request_id, undefined, saveCommand())
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      '/api/workflows/local-research',
      '/api/workflows/local-research/versions?page=1',
      '/api/workflows/local-research/versions/1',
      `/api/workflows/local-research/impact?revision=1&definition_hash=${impact.definition_hash}`,
      `/api/workflows/local-research/operations/${operation.request_id}`,
    ])
    expect(
      fetch.mock.calls.every(([, options]) => options.method !== 'POST'),
    ).toBe(true)
  })
  it('posts one exact save or publish command and validates its durable receipt', async () => {
    const save = saveCommand()
    const publish = publishCommand()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(await receipt(save)))
      .mockResolvedValueOnce(response(await receipt(publish)))
    vi.stubGlobal('fetch', fetch)
    const { kind: _saveKind, ...saveBody } = save
    const { kind: _publishKind, ...publishBody } = publish
    await saveWorkflowDraft(
      saveBody as Extract<WorkflowCommand, { kind: 'save' }>,
    )
    await publishWorkflow(
      publishBody as Extract<WorkflowCommand, { kind: 'publish' }>,
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(
      fetch.mock.calls.map(([, options]) => JSON.parse(options.body)),
    ).toEqual([saveBody, publishBody])
  })
  it('freezes the exact sent save candidate before awaiting HTTP', async () => {
    const command = saveCommand()
    if (command.kind !== 'save') throw new Error('fixture')
    const { kind: _kind, ...body } = command
    const original = structuredClone(command)
    let complete!: (response: Response) => void
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const waiting = saveWorkflowDraft(body)
    body.definition.name = 'Changed while request pending'
    complete(response(await receipt(original)))
    expect((await waiting).kind).toBe('save')
  })
  it('keeps explicit operation404 separate from success and never retries a rejected write', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ detail: 'missing' }, 404))
      .mockResolvedValueOnce(response({ detail: 'conflict' }, 409))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchWorkflowOperation('request-123')).rejects.toMatchObject({
      status: 404,
    })
    const { kind: _kind, ...body } = saveCommand()
    await expect(
      saveWorkflowDraft(body as Extract<WorkflowCommand, { kind: 'save' }>),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it.each(['read', 'write'] as const)(
    'times out one %s without replay',
    async (kind) => {
      const command = saveCommand()
      if (command.kind !== 'save') throw new Error('fixture')
      const { kind: _kind, ...body } = command
      vi.useFakeTimers()
      const fetch = vi.fn().mockImplementation(
        (_path, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Canceled', 'AbortError')),
            )
          }),
      )
      vi.stubGlobal('fetch', fetch)
      const waiting =
        kind === 'read' ? fetchWorkflow() : saveWorkflowDraft(body)
      const rejected = expect(waiting).rejects.toMatchObject({
        name: 'AbortError',
      })
      await vi.advanceTimersByTimeAsync(15_000)
      await rejected
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('forwards caller abort through the independently limited request', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Canceled', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const waiting = fetchWorkflow(controller.signal)
    const rejected = expect(waiting).rejects.toMatchObject({
      name: 'AbortError',
    })
    controller.abort()
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid candidate arguments without any HTTP request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchWorkflowVersions(0)).rejects.toThrow()
    await expect(fetchWorkflowVersion(0)).rejects.toThrow()
    await expect(
      fetchWorkflowImpact({ revision: 1, definition_hash: 'wrong' }),
    ).rejects.toThrow()
    await expect(fetchWorkflowOperation('short')).rejects.toThrow()
    const { kind: _kind, ...body } = publishCommand()
    await expect(
      publishWorkflow({ ...body, consent: false } as never),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
