import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertTaskTurnReceipt,
  executeTaskTurn,
  fetchTaskTurn,
  fetchTaskTurnRequest,
  fetchTaskTurns,
  parseTaskTurn,
  parseTaskTurnPage,
  parseTurnConfig,
  parseTurnSnapshot,
  prepareTaskTurn,
  prepareTaskTurnsRequest,
  previewTaskTurn,
  saveTaskTurn,
} from '../src/workbench/task-turns'
import { ApiError } from '../src/workbench/api'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
} from '../src/workbench/task-workspace-location'

const snapshot = {
  context_hash: 'a'.repeat(64),
  goal: 'Task goal',
  acceptance: 'Accept',
  notes: 'Notes',
  text: 'FILE README.md\ntext',
  bytes: new TextEncoder().encode('FILE README.md\ntext').length,
  evidence: [{ path: 'README.md', bytes: 4 }],
  access: 'read_only',
  tools: [],
  supplement: { id: 'turn-123', content: 'Follow up with this.' },
}
const config = {
  coordinator_model: 'model-a',
  researcher_model: 'model-b',
  reviewer_model: 'model-c',
  max_calls: 3,
  parallel: 1,
  minutes: 10,
  max_output_tokens: 1800,
}
const turn = {
  id: 'turn-123',
  task_id: 'task-a',
  request_id: 'request-123',
  content: 'Follow up with this.',
  created_at: '2026-11-21T00:00:00Z',
  state: 'prepared',
  run_id: null,
  candidate: {
    candidate_hash: 'b'.repeat(64),
    config,
    snapshot,
  },
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('task turn DTOs', () => {
  it('accepts exact prepared turn and rejects state/candidate mismatch', () => {
    expect(parseTaskTurn(turn, { taskId: 'task-a' }).state).toBe('prepared')
    expect(() =>
      parseTaskTurn({ ...turn, state: 'saved' }, { taskId: 'task-a' }),
    ).toThrow('task_turn_response_invalid')
  })
  it('accepts a prepared turn outside the current page only when prepared matches', () => {
    const page = {
      schema_version: 1,
      unit: 'task_turns',
      task_id: 'task-a',
      items: [
        {
          ...turn,
          id: 'turn-other',
          request_id: 'request-other',
          state: 'saved',
          candidate: null,
        },
      ],
      prepared: turn,
      total: 21,
      requested_page: 2,
      page: 2,
      page_size: 20,
      total_pages: 2,
      has_more: false,
      order: 'turns-created-v1',
    }
    expect(() =>
      parseTaskTurnPage(page, { taskId: 'task-a', page: 2 }),
    ).not.toThrow()
  })
  it('rejects forged snapshot bytes or supplement identity', () => {
    expect(() =>
      parseTurnSnapshot({ ...snapshot, bytes: 1 }, { id: 'turn-123' }),
    ).toThrow()
    expect(() =>
      parseTurnSnapshot(
        {
          ...snapshot,
          supplement: { id: 'other', content: snapshot.supplement.content },
        },
        { id: 'turn-123' },
      ),
    ).toThrow()
  })
})

describe('task conversation URL state', () => {
  it('round trips conversation and a pending request ID', () => {
    const href = taskWorkspaceHref('task-a', {
      tab: 'conversation',
      pendingRequestId: 'request-123',
    })
    expect(readTaskWorkspaceLocation(`http://localhost/${href}`)).toEqual({
      tab: 'conversation',
      pendingRequestId: 'request-123',
    })
  })
  it('fails closed for duplicate pending request IDs', () => {
    expect(
      readTaskWorkspaceLocation(
        'http://localhost/#task/task-a?taskTab=conversation&taskSend=request-123&taskSend=request-456',
      ),
    ).toMatchObject({ tab: 'conversation', error: 'request_invalid' })
  })
  it.each(['short', 'request x', 'request/123', 'x'.repeat(101), '%'])(
    'rejects malformed pending request %s',
    (pending) => {
      expect(
        readTaskWorkspaceLocation(
          `http://localhost/#task/task-a?taskTab=conversation&taskSend=${pending}`,
        ).error,
      ).toBe('request_invalid')
    },
  )
  it('preserves pending receipt identity across tabs without storing content', () => {
    for (const tab of ['goal', 'work', 'review', 'conversation'] as const) {
      const href = taskWorkspaceHref('task-a', {
        tab,
        pendingRequestId: 'request-123',
      })
      expect(
        readTaskWorkspaceLocation(`http://localhost/${href}`).pendingRequestId,
      ).toBe('request-123')
      expect(href).not.toContain(turn.content)
    }
  })
})

describe('strict turn identity and snapshot admission', () => {
  it.each([
    { state: 'unknown' },
    { state: 'prepared', candidate: null },
    { state: 'prepared', run_id: 'run-1' },
    { state: 'saved', candidate: null, run_id: 'run-1' },
    { state: 'applied', run_id: null },
    { state: 'applied', run_id: 'run-1', candidate: null },
    { request_id: 'short' },
    { request_id: 'request ü' },
    { content: '' },
    { content: ' whitespace ' },
    { content: '\ud800' },
    { created_at: 'yesterday' },
    { extra: true },
  ])('rejects malformed/state-inconsistent turn %j', (patch) => {
    expect(() => parseTaskTurn({ ...turn, ...patch })).toThrow()
  })
  it.each([
    ['task', { task_id: 'other' }],
    ['turn', { id: 'other' }],
    ['request', { request_id: 'request-other' }],
    ['content', { content: 'Different content' }],
  ])('binds exact expected %s identity', (_name, patch) => {
    expect(() =>
      parseTaskTurn(
        { ...turn, ...patch },
        {
          taskId: turn.task_id,
          turnId: turn.id,
          requestId: turn.request_id,
          content: turn.content,
        },
      ),
    ).toThrow()
  })
  it('accepts saved and applied as distinct confirmed states', () => {
    expect(
      parseTaskTurn({ ...turn, state: 'saved', candidate: null }).state,
    ).toBe('saved')
    expect(
      parseTaskTurn({ ...turn, state: 'applied', run_id: 'run-1' }).run_id,
    ).toBe('run-1')
  })
  it('copies candidate data and accepts response property order', () => {
    const source = structuredClone(turn)
    const parsed = parseTaskTurn(
      Object.fromEntries(Object.entries(source).reverse()),
    )
    source.candidate.config.minutes = 30
    source.candidate.snapshot.evidence[0].path = 'other'
    expect(parsed.candidate?.config.minutes).toBe(10)
    expect(parsed.candidate?.snapshot.evidence[0].path).toBe('README.md')
  })
  it.each([
    { coordinator_model: '' },
    { max_calls: 2 },
    { max_calls: 9 },
    { max_calls: 3.1 },
    { parallel: 0 },
    { parallel: 3 },
    { minutes: 31 },
    { max_output_tokens: 255 },
    { max_output_tokens: 4097 },
    { key_env: 'SECRET' },
  ])('rejects resource or secret-bearing config %j', (patch) => {
    expect(() => parseTurnConfig({ ...config, ...patch })).toThrow()
  })
  it.each([
    { access: 'write' },
    { tools: ['shell'] },
    { context_hash: 'A'.repeat(64) },
    { models: {} },
    { goal: '' },
    { acceptance: 'x'.repeat(4001) },
    { evidence: [{ path: 'README.md', bytes: -1 }] },
    { evidence: [{ path: 'README.md', bytes: 32_769 }] },
    { evidence: [snapshot.evidence[0], snapshot.evidence[0]] },
    { supplement: { ...snapshot.supplement, token: 'SECRET' } },
  ])('rejects malformed/extra snapshot %j', (patch) => {
    expect(() => parseTurnSnapshot({ ...snapshot, ...patch })).toThrow()
  })
})

describe('durable turn receipt reconciliation', () => {
  const prepared = () => parseTaskTurn(turn)
  const saved = () =>
    parseTaskTurn({ ...turn, state: 'saved', candidate: null })
  const applied = () =>
    parseTaskTurn({ ...turn, state: 'applied', run_id: 'run-1' })
  const pending = () => ({ ...config, context_hash: snapshot.context_hash })
  it.each([
    { id: 'turn-other' },
    { task_id: 'task-other' },
    { request_id: 'request-other' },
    { content: 'A different message' },
    { created_at: '2026-11-21T01:00:00Z' },
  ])('rejects changed immutable turn identity %j', (patch) => {
    const receipt = { ...saved(), ...patch }
    expect(() => assertTaskTurnReceipt(receipt, saved())).toThrow(
      'task_turn_response_invalid',
    )
  })
  it.each([
    { candidate_hash: 'c'.repeat(64) },
    { config: { ...config, minutes: 11 } },
    { snapshot: { ...snapshot, notes: 'A different frozen note' } },
    {
      snapshot: {
        ...snapshot,
        evidence: [{ path: 'another-file.md', bytes: 4 }],
      },
    },
  ])('rejects any change to an already known candidate %j', (patch) => {
    expect(() =>
      assertTaskTurnReceipt(
        { ...turn, candidate: { ...turn.candidate, ...patch } },
        prepared(),
      ),
    ).toThrow('task_turn_response_invalid')
  })
  it('accepts the same prepared candidate becoming applied without mutating inputs', () => {
    const before = prepared()
    const current = applied()
    const original = structuredClone({ before, current })
    expect(assertTaskTurnReceipt(current, before)).toEqual(current)
    expect({ before, current }).toEqual(original)
  })
  it('accepts equivalent candidate property ordering after canonical admission', () => {
    const current = {
      ...turn,
      candidate: Object.fromEntries(Object.entries(turn.candidate).reverse()),
    }
    expect(assertTaskTurnReceipt(current, prepared())).toEqual(prepared())
  })
  it.each([
    { state: 'saved', candidate: null, run_id: null },
    { state: 'prepared', run_id: null },
    { state: 'applied', run_id: 'run-other' },
  ])('never regresses or relinks an applied turn %j', (patch) => {
    expect(() =>
      assertTaskTurnReceipt({ ...applied(), ...patch }, applied()),
    ).toThrow('task_turn_response_invalid')
  })
  it('rejects a known prepared candidate returning to saved', () => {
    expect(() => assertTaskTurnReceipt(saved(), prepared())).toThrow(
      'task_turn_response_invalid',
    )
  })
  it('admits an unchanged saved receipt when preparation did not persist', () => {
    expect(assertTaskTurnReceipt(saved(), saved(), pending())).toEqual(saved())
  })
  it('admits prepared or applied only for the pending resource and context candidate', () => {
    expect(assertTaskTurnReceipt(prepared(), saved(), pending())).toEqual(
      prepared(),
    )
    expect(assertTaskTurnReceipt(applied(), saved(), pending())).toEqual(
      applied(),
    )
  })
  it.each([
    { coordinator_model: 'model-other' },
    { researcher_model: 'model-other' },
    { reviewer_model: 'model-other' },
    { max_calls: 4 },
    { parallel: 2 },
    { minutes: 11 },
    { max_output_tokens: 1801 },
  ])('binds every pending resource field after response loss %j', (patch) => {
    const receipt = {
      ...turn,
      candidate: {
        ...turn.candidate,
        config: { ...config, ...patch },
      },
    }
    expect(() => assertTaskTurnReceipt(receipt, saved(), pending())).toThrow(
      'task_turn_response_invalid',
    )
  })
  it('rejects a different pending context even if resources match', () => {
    expect(() =>
      assertTaskTurnReceipt(prepared(), saved(), {
        ...pending(),
        context_hash: 'd'.repeat(64),
      }),
    ).toThrow('task_turn_response_invalid')
  })
  it('rejects malformed pending preparation instead of clearing the unknown lock', () => {
    expect(() =>
      assertTaskTurnReceipt(saved(), saved(), {
        ...pending(),
        max_calls: 1,
      }),
    ).toThrow('task_turn_response_invalid')
    expect(() =>
      assertTaskTurnReceipt(saved(), saved(), {
        ...pending(),
        consent: true,
      } as ReturnType<typeof pending>),
    ).toThrow('task_turn_response_invalid')
  })
})

function pageFixture(items: unknown[] = [turn]) {
  return {
    schema_version: 1,
    unit: 'task_turns',
    task_id: 'task-a',
    items,
    prepared: turn,
    total: items.length,
    requested_page: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    has_more: false,
    order: 'turns-created-v1',
  }
}

const workflow = {
  workflow_id: 'local-research',
  version: 2,
  definition_hash: 'e'.repeat(64),
  definition: {
    schema_version: 1,
    name: 'Published research',
    harness: 'local-superagent',
    stages: [
      {
        id: 'planning',
        role: 'coordinator',
        model_id: config.coordinator_model,
        instructions: '',
      },
      {
        id: 'research',
        role: 'researcher',
        model_id: config.researcher_model,
        instructions: '',
      },
      {
        id: 'synthesis',
        role: 'reviewer',
        model_id: config.reviewer_model,
        instructions: '',
      },
    ],
    limits: {
      max_calls: config.max_calls,
      parallel: config.parallel,
      minutes: config.minutes,
      max_output_tokens: config.max_output_tokens,
      research_tasks: 1,
    },
    review: 'human',
  },
}
function workflowTurn(...metadata: [] | [unknown]) {
  return {
    ...turn,
    candidate: {
      ...turn.candidate,
      snapshot: {
        ...snapshot,
        workflow: metadata.length ? metadata[0] : workflow,
      },
    },
  }
}

describe('frozen workflow metadata on Task turn candidates', () => {
  const saved = () =>
    parseTaskTurn({ ...turn, state: 'saved', candidate: null })
  const pending = () => ({ ...config, context_hash: snapshot.context_hash })
  it('preserves true legacy absence without manufacturing a workflow', () => {
    expect(Object.hasOwn(parseTurnSnapshot(snapshot), 'workflow')).toBe(false)
    expect(
      Object.hasOwn(parseTaskTurn(turn).candidate!.snapshot, 'workflow'),
    ).toBe(false)
  })
  it('admits a materialized built-in or an exact frozen published version', () => {
    expect(parseTaskTurn(workflowTurn()).candidate?.snapshot.workflow).toEqual(
      workflow,
    )
    expect(
      parseTaskTurn(workflowTurn({ ...workflow, version: null })).candidate
        ?.snapshot.workflow?.version,
    ).toBeNull()
  })
  it.each([
    undefined,
    null,
    { ...workflow, version: 0 },
    { ...workflow, unknown: true },
    {
      ...workflow,
      definition: { ...workflow.definition, review: 'automatic' },
    },
  ])('fails closed for provided invalid workflow metadata %j', (metadata) => {
    expect(() => parseTaskTurn(workflowTurn(metadata))).toThrow(
      'task_turn_response_invalid',
    )
  })
  it('rejects a frozen definition that disagrees with the actual seven Run resources', () => {
    expect(() =>
      parseTaskTurn(
        workflowTurn({
          ...workflow,
          definition: {
            ...workflow.definition,
            limits: { ...workflow.definition.limits, minutes: 11 },
          },
        }),
      ),
    ).toThrow('task_turn_response_invalid')
  })
  it('binds a lost preparation to the selected published version', () => {
    expect(
      assertTaskTurnReceipt(workflowTurn(), saved(), {
        ...pending(),
        workflow_version: 2,
      }).candidate?.snapshot.workflow?.version,
    ).toBe(2)
    expect(() =>
      assertTaskTurnReceipt(workflowTurn(), saved(), {
        ...pending(),
        workflow_version: 3,
      }),
    ).toThrow()
    expect(() =>
      assertTaskTurnReceipt(turn, saved(), {
        ...pending(),
        workflow_version: 2,
      }),
    ).toThrow()
  })
  it('binds explicit built-in selection to recorded null version', () => {
    const builtin = workflowTurn({ ...workflow, version: null })
    expect(
      assertTaskTurnReceipt(builtin, saved(), {
        ...pending(),
        workflow_version: null,
      }).candidate?.snapshot.workflow?.version,
    ).toBeNull()
    expect(() =>
      assertTaskTurnReceipt(workflowTurn(), saved(), {
        ...pending(),
        workflow_version: null,
      }),
    ).toThrow()
    expect(() =>
      assertTaskTurnReceipt(turn, saved(), {
        ...pending(),
        workflow_version: null,
      }),
    ).toThrow()
  })
  it('admits legacy missing selection only for absent or built-in metadata', () => {
    expect(() => assertTaskTurnReceipt(turn, saved(), pending())).not.toThrow()
    expect(() =>
      assertTaskTurnReceipt(
        workflowTurn({ ...workflow, version: null }),
        saved(),
        pending(),
      ),
    ).not.toThrow()
    expect(() =>
      assertTaskTurnReceipt(workflowTurn(), saved(), pending()),
    ).toThrow()
  })
  it('never rewrites an already prepared workflow to the latest published definition', () => {
    const known = parseTaskTurn(workflowTurn())
    expect(() =>
      assertTaskTurnReceipt(workflowTurn({ ...workflow, version: 3 }), known),
    ).toThrow()
  })
  it('keeps workflow selection outside the seven resource config fields', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(workflowTurn())))
    vi.stubGlobal('fetch', fetch)
    const value = await prepareTaskTurn('task-a', turn.id, {
      ...pending(),
      workflow_version: 2,
    })
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...pending(),
      workflow_version: 2,
    })
    expect(Object.hasOwn(value.candidate!.config, 'workflow_version')).toBe(
      false,
    )
    expect(value.candidate?.snapshot.workflow?.version).toBe(2)
  })
  it.each([undefined, 0, -1, 1.5, '2', true])(
    'rejects provided invalid version %j before any POST',
    async (selected) => {
      const fetch = vi.fn()
      vi.stubGlobal('fetch', fetch)
      await expect(
        prepareTaskTurn('task-a', turn.id, {
          ...pending(),
          workflow_version: selected,
        } as never),
      ).rejects.toThrow('task_turn_input_invalid')
      expect(fetch).not.toHaveBeenCalled()
    },
  )
})

describe('bounded turn page metadata', () => {
  it('preserves server order with no browser text/order evaluation', () => {
    const saved = {
      ...turn,
      id: 'turn-z',
      request_id: 'request-z',
      state: 'saved',
      candidate: null,
    }
    const parsed = parseTaskTurnPage(pageFixture([saved, turn]), {
      taskId: 'task-a',
      page: 1,
    })
    expect(parsed.items.map((t) => t.id)).toEqual(['turn-z', 'turn-123'])
  })
  it.each([
    { total: -1 },
    { total: 2 },
    { total: Number.MAX_SAFE_INTEGER + 1 },
    { page_size: 50 },
    { requested_page: 0 },
    { page: 2 },
    { total_pages: 2 },
    { has_more: true },
    { unit: 'tasks' },
    { schema_version: 2 },
    { order: 'browser-sort' },
    { extra: true },
    { prepared: null },
    { prepared: { ...turn, state: 'saved', candidate: null } },
  ])('rejects invalid page metadata/hydration %j', (patch) => {
    expect(() => parseTaskTurnPage({ ...pageFixture(), ...patch })).toThrow()
  })
  it('rejects duplicate and inconsistent identities between page and hydration', () => {
    expect(() => parseTaskTurnPage(pageFixture([turn, turn]))).toThrow()
    expect(() =>
      parseTaskTurnPage({
        ...pageFixture(),
        prepared: { ...turn, created_at: '2026-11-22T00:00:00Z' },
      }),
    ).toThrow()
  })
  it('binds task and requested page without normalizing a different request', () => {
    expect(() =>
      parseTaskTurnPage(pageFixture(), { taskId: 'other', page: 1 }),
    ).toThrow()
    expect(() =>
      parseTaskTurnPage(pageFixture(), { taskId: 'task-a', page: 2 }),
    ).toThrow()
  })
  it('clamps an empty result while preserving requested page99', () => {
    const result = parseTaskTurnPage(
      {
        ...pageFixture([]),
        prepared: null,
        requested_page: 99,
      },
      { taskId: 'task-a', page: 99 },
    )
    expect(result.page).toBe(1)
    expect(result.requested_page).toBe(99)
  })
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER])(
    'rejects invalid request page %s',
    (page) => expect(() => prepareTaskTurnsRequest('task-a', page)).toThrow(),
  )
})

describe('task turn HTTP requests', () => {
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  it('sends one immutable normalized message without mutating the input', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        ...turn,
        content: 'Supplement',
        state: 'saved',
        candidate: null,
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const input = { request_id: 'request-123', content: ' Supplement \n' }
    expect((await saveTaskTurn('task-a', input)).content).toBe('Supplement')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/tasks/task-a/turns')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      request_id: 'request-123',
      content: 'Supplement',
    })
    expect(input.content).toBe(' Supplement \n')
  })
  it('binds a save response to copied content when the caller changes', async () => {
    let complete!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      ),
    )
    const input = { request_id: 'request-123', content: turn.content }
    const pending = saveTaskTurn('task-a', input)
    input.content = 'Changed'
    complete(response({ ...turn, state: 'saved', candidate: null }))
    expect((await pending).content).toBe(turn.content)
  })
  it('does not retry a save and preserves an HTTP409 ApiError', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ detail: 'busy' }, 409))
    vi.stubGlobal('fetch', fetch)
    await expect(
      saveTaskTurn('task-a', {
        request_id: 'request-123',
        content: turn.content,
      }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('reconciles by GET request receipt and preserves explicit404', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ detail: 'missing' }, 404))
    vi.stubGlobal('fetch', fetch)
    await expect(
      fetchTaskTurnRequest('task-a', 'request-123'),
    ).rejects.toMatchObject({ status: 404 })
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/tasks/task-a/turns/requests/request-123',
    )
    expect(fetch.mock.calls[0][1].method).toBeUndefined()
  })
  it('encodes exact IDs and passes caller read AbortSignal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ ...turn, task_id: 'task/研究' }))
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    await fetchTaskTurn('task/研究', turn.id, controller.signal)
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/tasks/task%2F%E7%A0%94%E7%A9%B6/turns/turn-123',
    )
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal)
  })
  it('reads one bounded page including independently hydrated preparation', async () => {
    const fetch = vi.fn().mockResolvedValue(response(pageFixture()))
    vi.stubGlobal('fetch', fetch)
    expect((await fetchTaskTurns('task-a', 1)).prepared?.id).toBe(turn.id)
    expect(fetch.mock.calls[0][0]).toBe('/api/tasks/task-a/turns?page=1')
  })
  it('previews only via one explicit POST with the selected supplement ID', async () => {
    const fetch = vi.fn().mockResolvedValue(response(snapshot))
    vi.stubGlobal('fetch', fetch)
    expect((await previewTaskTurn('task-a', turn.id)).supplement.id).toBe(
      turn.id,
    )
    expect(fetch.mock.calls[0][0]).toBe(
      '/api/tasks/task-a/turns/turn-123/preview',
    )
    expect(fetch.mock.calls[0][1].method).toBe('POST')
  })
  it('registers resource preparation without consent or another request ID', async () => {
    const fetch = vi.fn().mockResolvedValue(response(turn))
    vi.stubGlobal('fetch', fetch)
    await prepareTaskTurn('task-a', turn.id, {
      ...config,
      context_hash: snapshot.context_hash,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...config,
      context_hash: snapshot.context_hash,
    })
  })
  it('rejects an unbound preparation response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...turn,
          candidate: { ...turn.candidate, config: { ...config, minutes: 11 } },
        }),
      ),
    )
    await expect(
      prepareTaskTurn('task-a', turn.id, {
        ...config,
        context_hash: snapshot.context_hash,
      }),
    ).rejects.toThrow('task_turn_response_invalid')
  })
  it('executes one exact candidate with explicit consent and an applied receipt', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        ...turn,
        state: 'applied',
        run_id: 'run-1',
      }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(
      (
        await executeTaskTurn('task-a', turn.id, {
          candidate_hash: turn.candidate.candidate_hash,
          consent: true,
        })
      ).run_id,
    ).toBe('run-1')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      candidate_hash: turn.candidate.candidate_hash,
      consent: true,
    })
  })
  it('rejects success-shaped non-applied execution response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(turn)))
    await expect(
      executeTaskTurn('task-a', turn.id, {
        candidate_hash: turn.candidate.candidate_hash,
        consent: true,
      }),
    ).rejects.toThrow()
  })
  it('times out a mutation once without automatic POST replay', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockImplementation(
        (_path, options) =>
          new Promise((_resolve, reject) =>
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Canceled', 'AbortError')),
            ),
          ),
      )
    vi.stubGlobal('fetch', fetch)
    const pending = saveTaskTurn('task-a', {
      request_id: 'request-123',
      content: turn.content,
    })
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('retains an unknown outcome when an aborted execution returns a late receipt', async () => {
    vi.useFakeTimers()
    let complete!: (value: Response) => void
    const fetch = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const pending = executeTaskTurn('task-a', turn.id, {
      candidate_hash: turn.candidate.candidate_hash,
      consent: true,
    })
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(15_000)
    complete(response({ ...turn, state: 'applied', run_id: 'run-1' }))
    await rejected
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid mutation candidates before making HTTP requests', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(
      saveTaskTurn('task-a', { request_id: 'short', content: 'content' }),
    ).rejects.toThrow()
    await expect(
      prepareTaskTurn('task-a', turn.id, { ...config, context_hash: 'wrong' }),
    ).rejects.toThrow()
    await expect(
      executeTaskTurn('task-a', turn.id, {
        candidate_hash: turn.candidate.candidate_hash,
        consent: false as true,
      }),
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
