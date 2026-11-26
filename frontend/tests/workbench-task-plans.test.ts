import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTaskPlan,
  dependencyCriterion,
  fetchPlanOperation,
  fetchTaskPlan,
  parseDependencyGate,
  parsePlanDefinition,
  parsePlanPreview,
  parsePlanReceipt,
  parseTaskPlan,
  parseTaskReview,
  previewTaskPlan,
} from '../src/workbench/task-plans'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
} from '../src/workbench/task-workspace-location'

const parent = {
  id: 'parent',
  project_id: 'project-a',
  title: 'Parent goal',
  goal: 'Deliver a reviewable research outcome',
  acceptance: 'Review selected evidence',
  files: ['README.md'],
  created_at: '2026-11-26T00:00:00Z',
}
const definition = {
  items: [
    {
      key: 'a',
      title: 'Analyze source',
      goal: 'Analyze source constraints',
      acceptance: 'A source report',
      files: ['README.md'],
      depends_on: [],
    },
    {
      key: 'b',
      title: 'Validate advice',
      goal: 'Validate source findings',
      acceptance: 'A validation report',
      files: [],
      depends_on: ['a'],
    },
  ],
}
const a = {
  ...parent,
  id: 'task-a',
  title: definition.items[0].title,
  goal: definition.items[0].goal,
  acceptance: definition.items[0].acceptance,
}
const b = {
  ...parent,
  id: 'task-b',
  title: definition.items[1].title,
  goal: definition.items[1].goal,
  acceptance: definition.items[1].acceptance,
  files: [],
}
const reviewA = {
  task_id: a.id,
  title: a.title,
  latest_run: null,
  state: 'no_run',
  reports: [],
}
const reviewB = {
  task_id: b.id,
  title: b.title,
  latest_run: null,
  state: 'no_run',
  reports: [],
}
const gateA = {
  task_id: a.id,
  parent_task_id: parent.id,
  plan_hash: 'a'.repeat(64),
  criterion: dependencyCriterion,
  ready: true,
  prerequisites: [],
}
const gateB = {
  ...gateA,
  task_id: b.id,
  ready: false,
  prerequisites: [reviewA],
}
const published = {
  version: 1,
  parent_task_id: parent.id,
  plan_hash: 'a'.repeat(64),
  created_at: parent.created_at,
  definition,
  parent_snapshot: parent,
  items: [
    { key: 'a', task: a, review: reviewA, gate: gateA },
    { key: 'b', task: b, review: reviewB, gate: gateB },
  ],
}
const read = {
  schema_version: 1,
  unit: 'task_plan',
  task_id: parent.id,
  parent: null,
  gate: null,
  plan: published,
}
const preview = {
  parent_snapshot: parent,
  definition,
  criterion: dependencyCriterion,
  preview_hash: 'a'.repeat(64),
}
const receipt = {
  request_id: 'plan-operation-original',
  task_id: parent.id,
  preview_hash: preview.preview_hash,
  state: 'applied',
  result: read,
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => vi.unstubAllGlobals())
describe('real Task decomposition and dependency admission', () => {
  it.each([undefined, false, true])(
    'preserves legacy schema1 reads independently of revision capability: %j',
    async (enabled) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify(read))),
      )
      expect(await fetchTaskPlan(parent.id, undefined, enabled)).toEqual(read)
    },
  )
  it('admits an immutable plan, actual children and independent readiness facts', () => {
    expect(parseTaskPlan(read, parent.id)).toEqual(read)
    expect(parsePlanPreview(preview, parent, definition)).toEqual(preview)
    expect(
      parsePlanReceipt(receipt, parent.id, receipt.request_id, preview),
    ).toEqual(receipt)
    expect(
      parseTaskPlan(
        {
          ...read,
          task_id: b.id,
          parent: { task_id: parent.id, title: parent.title },
          gate: gateB,
          plan: null,
        },
        b.id,
      ).gate?.ready,
    ).toBe(false)
  })
  it.each([
    { ...read, task_id: 'other' },
    {
      ...read,
      plan: { ...published, items: [published.items[1], published.items[0]] },
    },
    {
      ...read,
      plan: {
        ...published,
        items: [published.items[0], { ...published.items[1], task: a }],
      },
    },
    {
      ...read,
      plan: {
        ...published,
        items: [
          published.items[0],
          { ...published.items[1], gate: { ...gateB, ready: true } },
        ],
      },
    },
    {
      ...read,
      plan: {
        ...published,
        items: [
          published.items[0],
          { ...published.items[1], task: { ...b, project_id: 'foreign' } },
        ],
      },
    },
    {
      ...read,
      plan: {
        ...published,
        items: [
          published.items[0],
          { ...published.items[1], gate: { ...gateB, prerequisites: [] } },
        ],
      },
    },
    { ...read, parent: { task_id: 'other', title: 'Other' } },
    { ...read, error: 'failed' },
  ])(
    'rejects substituted plans, tasks, gates and success-shaped errors %#',
    (value) => {
      expect(() => parseTaskPlan(value, parent.id)).toThrow()
    },
  )
  it.each([
    { items: [] },
    { items: definition.items.map((item) => ({ ...item, key: 'a' })) },
    {
      items: [
        { ...definition.items[0], depends_on: ['b'] },
        definition.items[1],
      ],
    },
    {
      items: [
        { ...definition.items[0], depends_on: ['a'] },
        definition.items[1],
      ],
    },
    {
      items: [
        definition.items[0],
        { ...definition.items[1], depends_on: ['missing'] },
      ],
    },
    {
      items: [{ ...definition.items[0], acceptance: '' }, definition.items[1]],
    },
    {
      items: [
        { ...definition.items[0], files: ['README.md', 'README.md'] },
        definition.items[1],
      ],
    },
    { items: [{ ...definition.items[0], run_now: true }, definition.items[1]] },
  ])('rejects invalid finite candidates %#', (value) => {
    expect(() => parsePlanDefinition(value)).toThrow()
  })
  it('binds previews to the exact parent context and file scope', () => {
    expect(() =>
      parsePlanPreview(
        {
          ...preview,
          parent_snapshot: { ...parent, goal: 'Different parent goal' },
        },
        parent,
        definition,
      ),
    ).toThrow()
    expect(() =>
      parsePlanPreview(
        {
          ...preview,
          definition: {
            items: [
              { ...definition.items[0], files: ['private.env'] },
              definition.items[1],
            ],
          },
        },
        parent,
      ),
    ).toThrow()
  })
  it('requires an actual successful latest run and accepted final report facts', () => {
    const latest = {
      id: 'run-a',
      task_id: a.id,
      status: 'succeeded',
      created_at: parent.created_at,
    }
    const accepted = {
      ...reviewA,
      latest_run: latest,
      state: 'accepted',
      reports: [
        { id: 'report-a', decision: 'accepted', sha256: 'b'.repeat(64) },
      ],
    }
    expect(parseTaskReview(accepted, a.id)).toEqual(accepted)
    expect(
      parseDependencyGate(
        { ...gateB, ready: true, prerequisites: [accepted] },
        b.id,
      ).ready,
    ).toBe(true)
    expect(() =>
      parseDependencyGate(
        { ...gateB, ready: false, prerequisites: [accepted] },
        b.id,
      ),
    ).toThrow()
    for (const value of [
      { ...reviewA, reports: accepted.reports },
      { ...accepted, state: 'review_pending' },
      { ...accepted, reports: [] },
      { ...accepted, latest_run: { ...latest, status: 'failed' } },
      {
        ...accepted,
        reports: [{ ...accepted.reports[0], decision: 'pending' }],
      },
      { ...accepted, reports: [{ ...accepted.reports[0], sha256: null }] },
    ])
      expect(() => parseTaskReview(value, a.id)).toThrow()
  })
  it('retains the exact create operation and reconciles using GET only', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(preview))
      .mockResolvedValueOnce(response(receipt))
      .mockResolvedValueOnce(response(receipt))
    vi.stubGlobal('fetch', fetch)
    expect(await previewTaskPlan(parent, definition)).toEqual(preview)
    expect(await createTaskPlan(parent, receipt.request_id, preview)).toEqual(
      receipt,
    )
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      ...definition,
      request_id: receipt.request_id,
      preview_hash: preview.preview_hash,
      consent: true,
    })
    expect(
      await fetchPlanOperation(
        parent.id,
        receipt.request_id,
        undefined,
        preview,
      ),
    ).toEqual(receipt)
    expect(fetch.mock.calls[2][1].method).toBeUndefined()
    expect(() =>
      parsePlanReceipt(
        {
          ...receipt,
          result: {
            ...read,
            plan: { ...published, plan_hash: 'c'.repeat(64) },
          },
        },
        parent.id,
        receipt.request_id,
        preview,
      ),
    ).toThrow()
  })
  it('does not silently fall back on advertised read failure or admit canceled reads', async () => {
    const controller = new AbortController()
    const fetch = vi
      .fn()
      .mockImplementationOnce(async () => {
        controller.abort()
        return response(read)
      })
      .mockResolvedValueOnce(new Response('Unavailable', { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchTaskPlan(parent.id, controller.signal)).rejects.toThrow()
    await expect(fetchTaskPlan(parent.id)).rejects.toThrow()
  })
  it('keeps plan unknown markers separate from coding and message execution', () => {
    const href = taskWorkspaceHref(parent.id, {
      planRequestId: receipt.request_id,
    })
    expect(readTaskWorkspaceLocation(href).planRequestId).toBe(
      receipt.request_id,
    )
    for (const tail of [
      'taskPlanRequest=short',
      'taskPlanRequest=one-valid-id&taskPlanRequest=two-valid-id',
      'taskPlanRequest=one-valid-id&taskSend=message-request',
      'taskPlanRequest=one-valid-id&codingRequest=coding-request',
    ])
      expect(readTaskWorkspaceLocation(`#task/parent?${tail}`).error).toBe(
        'plan_invalid',
      )
    expect(() =>
      taskWorkspaceHref(parent.id, {
        planRequestId: receipt.request_id,
        codingRequestId: 'coding-request',
      }),
    ).toThrow()
    expect(() =>
      taskWorkspaceHref(parent.id, {
        planRequestId: receipt.request_id,
        pendingRequestId: 'message-request',
      }),
    ).toThrow()
  })
})
