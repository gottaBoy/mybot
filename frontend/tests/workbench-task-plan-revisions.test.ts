import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPlanVersions,
  parsePlanRevisionPreview,
  parsePlanVersion,
  parsePlanVersionPage,
  parseRevisionReceipt,
  planVersionFromCurrent,
  previewPlanRevision,
  publishPlanRevision,
  type PlanVersion,
  type PlanRevisionPreview,
} from '../src/workbench/task-plan-revisions'
import {
  dependencyCriterion,
  fetchPlanOperation,
  fetchTaskPlan,
  parseDependencyGate,
  parseTaskPlan,
} from '../src/workbench/task-plans'

const parent = {
  id: 'parent-a',
  project_id: 'project-a',
  title: 'Goal',
  goal: 'Deliver a real goal',
  acceptance: 'Reviewed report',
  files: ['README.md'],
  created_at: '2026-11-26T00:00:00Z',
}
const definition = {
  items: [
    {
      key: 'a',
      title: 'Research',
      goal: 'Research the source files',
      acceptance: 'Report',
      files: ['README.md'],
      depends_on: [],
    },
    {
      key: 'b',
      title: 'Validate',
      goal: 'Validate source findings',
      acceptance: 'Validation',
      files: [],
      depends_on: ['a'],
    },
  ],
}
const bindings = definition.items
  .map((item) => ({
    key: item.key,
    task: { ...parent, ...item, id: `task-${item.key}` },
  }))
  .map(({ key, task: { key: _key, depends_on: _depends, ...task } }) => ({
    key,
    task,
  }))
const baseline: PlanVersion = {
  version: 1,
  parent_task_id: parent.id,
  plan_hash: 'a'.repeat(64),
  created_at: parent.created_at,
  parent_snapshot: parent,
  definition,
  bindings,
}
const nextDefinition = {
  items: definition.items.map((item) =>
    item.key === 'b' ? { ...item, title: 'Validate revision' } : item,
  ),
}
const preview: PlanRevisionPreview = {
  schema_version: 2,
  unit: 'task_plan_revision_preview',
  parent_task_id: parent.id,
  expected_version: 1,
  expected_plan_hash: baseline.plan_hash,
  baseline,
  parent_snapshot: parent,
  definition: nextDefinition,
  preview_hash: 'b'.repeat(64),
  impact: {
    added_keys: [],
    replaced_keys: ['b'],
    reused_keys: ['a'],
    removed_keys: [],
    retired_task_ids: ['task-b'],
    blockers: [],
  },
}
const nextBindings = bindings.map((item) =>
  item.key === 'b'
    ? {
        key: item.key,
        task: {
          ...item.task,
          id: 'task-b-new',
          title: 'Validate revision',
          created_at: '2026-11-27T00:00:00Z',
        },
      }
    : item,
)
const nextVersion: PlanVersion = {
  ...baseline,
  version: 2,
  plan_hash: preview.preview_hash,
  created_at: '2026-11-27T00:00:00Z',
  definition: nextDefinition,
  bindings: nextBindings,
}
const reviews = nextBindings.map(({ task }) => ({
  task_id: task.id,
  title: task.title,
  latest_run: null,
  state: 'no_run',
  reports: [],
}))
const gates = nextBindings.map(({ task }, index) => ({
  task_id: task.id,
  parent_task_id: parent.id,
  plan_hash: nextVersion.plan_hash,
  criterion: dependencyCriterion,
  ready: index === 0,
  prerequisites: index ? [reviews[0]] : [],
  plan_version: 2,
  membership: 'current',
}))
const { bindings: _bindings, ...planFields } = nextVersion
const read = {
  schema_version: 2,
  unit: 'task_plan',
  task_id: parent.id,
  parent: null,
  gate: null,
  plan: {
    ...planFields,
    items: nextBindings.map((item, index) => ({
      ...item,
      review: reviews[index],
      gate: gates[index],
    })),
  },
}
const receipt = {
  schema_version: 2,
  operation: 'revise',
  request_id: 'original-revision-id',
  task_id: parent.id,
  preview_hash: preview.preview_hash,
  state: 'applied',
  result: read,
}
afterEach(() => vi.unstubAllGlobals())

describe('immutable plan revision projections', () => {
  it.each([undefined, false])(
    'rejects current schema2 when revision capability is not explicit: %j',
    async (enabled) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(read)))
      vi.stubGlobal('fetch', fetcher)
      await expect(
        fetchTaskPlan(parent.id, undefined, enabled),
      ).rejects.toThrow('task_plan_revisions_unsupported')
      expect(fetcher).toHaveBeenCalledOnce()
    },
  )
  it('admits current schema2 only with explicit revision capability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(read))),
    )
    expect(await fetchTaskPlan(parent.id, undefined, true)).toEqual(read)
  })
  it('keeps exact unknown revision reconciliation available after capability loss', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(read)))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchTaskPlan(parent.id, undefined, false)).rejects.toThrow()
    expect(await fetchPlanOperation(parent.id, receipt.request_id)).toEqual(
      receipt,
    )
    expect(
      fetcher.mock.calls.every((call) => call[1].method === undefined),
    ).toBe(true)
  })
  it('preserves v1 source and reused Task creation time in a new version', () => {
    expect(parsePlanVersion(baseline, parent.id)).toEqual(baseline)
    expect(parsePlanVersion(nextVersion, parent.id)).toEqual(nextVersion)
    expect(parseTaskPlan(read, parent.id)).toEqual(read)
    expect(
      planVersionFromCurrent(parseTaskPlan(read, parent.id).plan!),
    ).toEqual(nextVersion)
    expect(nextVersion.bindings[0].task.created_at).not.toBe(
      nextVersion.created_at,
    )
  })
  it.each([
    { ...nextVersion, version: 0 },
    { ...nextVersion, version: 101 },
    { ...nextVersion, review: {} },
    { ...nextVersion, bindings: [...nextBindings].reverse() },
    { ...nextVersion, bindings: [nextBindings[0], nextBindings[0]] },
    { ...nextVersion, parent_task_id: 'other-parent' },
  ])('rejects malformed or substituted historical snapshots %#', (value) => {
    expect(() => parsePlanVersion(value, parent.id)).toThrow()
  })
  it('keeps retired membership separate from ordinary prerequisite readiness', () => {
    const retired = {
      ...gates[0],
      task_id: 'task-b',
      membership: 'retired',
      ready: false,
    }
    const child = {
      schema_version: 2,
      unit: 'task_plan',
      task_id: 'task-b',
      parent: { task_id: parent.id, title: parent.title },
      plan: null,
      gate: retired,
    }
    expect(parseTaskPlan(child, 'task-b')).toEqual(child)
    expect(parseDependencyGate(retired, 'task-b').ready).toBe(false)
    expect(() => parseDependencyGate({ ...retired, ready: true })).toThrow()
    expect(() =>
      parseDependencyGate({ ...retired, prerequisites: [reviews[0]] }),
    ).toThrow()
    expect(() => parseDependencyGate({ ...retired, plan_version: 1 })).toThrow()
  })
  it.each([
    { ...read, plan: { ...read.plan, version: 1 } },
    {
      ...read,
      plan: {
        ...read.plan,
        items: read.plan.items.map((item, index) =>
          index ? { ...item, gate: { ...item.gate, prerequisites: [] } } : item,
        ),
      },
    },
    {
      ...read,
      plan: {
        ...read.plan,
        items: read.plan.items.map((item) => ({
          ...item,
          gate: { ...item.gate, membership: 'retired' },
        })),
      },
    },
    { ...read, gate: gates[0] },
  ])('rejects inconsistent live v2 Task and gate identities %#', (value) => {
    expect(() => parseTaskPlan(value, parent.id)).toThrow()
  })
})

describe('revision preview and exact publication receipts', () => {
  it('binds the entire candidate, baseline, parent and authoritative impact', () => {
    expect(
      parsePlanRevisionPreview(preview, parent, baseline, nextDefinition),
    ).toEqual(preview)
    expect(
      parseRevisionReceipt(receipt, parent.id, receipt.request_id, preview),
    ).toEqual(receipt)
  })
  it.each([
    { ...preview, expected_version: 2 },
    { ...preview, expected_plan_hash: 'c'.repeat(64) },
    { ...preview, baseline: { ...baseline, plan_hash: 'c'.repeat(64) } },
    { ...preview, parent_snapshot: { ...parent, title: 'Changed parent' } },
    { ...preview, impact: { ...preview.impact, reused_keys: ['a', 'b'] } },
    {
      ...preview,
      impact: {
        ...preview.impact,
        replaced_keys: [],
        reused_keys: ['a', 'b'],
        retired_task_ids: [],
      },
    },
    { ...preview, impact: { ...preview.impact, retired_task_ids: [] } },
    {
      ...preview,
      impact: {
        ...preview.impact,
        blockers: [{ task_id: 'task-a', reasons: ['unfinished_run'] }],
      },
    },
  ])('rejects a changed revision candidate or dishonest impact %#', (value) => {
    expect(() =>
      parsePlanRevisionPreview(value, parent, baseline, nextDefinition),
    ).toThrow()
  })
  it('requires downstream replacement when a prerequisite is replaced', () => {
    const changed = {
      ...definition,
      items: definition.items.map((item) =>
        item.key === 'a' ? { ...item, title: 'Changed source' } : item,
      ),
    }
    expect(() =>
      parsePlanRevisionPreview(
        {
          ...preview,
          definition: changed,
          impact: {
            ...preview.impact,
            replaced_keys: ['a'],
            reused_keys: ['b'],
            retired_task_ids: ['task-a'],
          },
        },
        parent,
        baseline,
        changed,
      ),
    ).toThrow()
  })
  it('preserves explicit blockers and refuses publication before any POST', async () => {
    const blocked = {
      ...preview,
      impact: {
        ...preview.impact,
        blockers: [{ task_id: 'task-b', reasons: ['unfinished_run'] as const }],
      },
    }
    const admitted = parsePlanRevisionPreview(
      blocked,
      parent,
      baseline,
      nextDefinition,
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      publishPlanRevision(parent, receipt.request_id, admitted),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not accept a newly minted replacement under an old Task ID', () => {
    const changed = {
      ...read,
      plan: {
        ...read.plan,
        items: read.plan.items.map((item) =>
          item.key === 'b'
            ? {
                ...item,
                task: { ...item.task, id: 'task-b' },
                review: { ...item.review, task_id: 'task-b' },
                gate: { ...item.gate, task_id: 'task-b' },
              }
            : item,
        ),
      },
    }
    expect(() =>
      parseRevisionReceipt(
        { ...receipt, result: changed },
        parent.id,
        receipt.request_id,
        preview,
      ),
    ).toThrow()
  })
  it('uses one explicit publication and GET-only reconciliation of its original receipt', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview)))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
    vi.stubGlobal('fetch', fetcher)
    await previewPlanRevision(parent, baseline, nextDefinition)
    await publishPlanRevision(parent, receipt.request_id, preview)
    expect(
      await fetchPlanOperation(
        parent.id,
        receipt.request_id,
        undefined,
        preview,
      ),
    ).toEqual(receipt)
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/tasks/parent-a/plan/revisions/preview',
      '/api/tasks/parent-a/plan/revisions',
      `/api/tasks/parent-a/plan/operations/${receipt.request_id}`,
    ])
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      ...nextDefinition,
      expected_version: 1,
      expected_plan_hash: baseline.plan_hash,
      request_id: receipt.request_id,
      preview_hash: preview.preview_hash,
      consent: true,
    })
    expect(fetcher.mock.calls[2][1].method).toBeUndefined()
  })
})

describe('bounded pure plan history', () => {
  const versions = Array.from({ length: 21 }, (_, index) => ({
    ...nextVersion,
    version: 21 - index,
  }))
  const first = {
    schema_version: 2,
    parent_task_id: parent.id,
    items: versions.slice(0, 20),
    total: 21,
    requested_page: 1,
    page: 1,
    page_size: 20,
    total_pages: 2,
    has_more: true,
  }
  it('preserves server newest-first snapshots and fixed20 pages', () => {
    expect(parsePlanVersionPage(first, parent.id, 1)).toEqual(first)
    expect(
      parsePlanVersionPage(
        {
          ...first,
          items: versions.slice(20),
          requested_page: 99,
          page: 2,
          has_more: false,
        },
        parent.id,
        99,
      ).items[0].version,
    ).toBe(1)
  })
  it.each([
    { ...first, items: [...first.items].reverse() },
    { ...first, items: first.items.slice(1) },
    { ...first, page_size: 50 },
    { ...first, requested_page: 2 },
    { ...first, total: 101 },
    { ...first, has_more: false },
  ])('rejects malformed pages without sorting or slicing them %#', (value) => {
    expect(() => parsePlanVersionPage(value, parent.id, 1)).toThrow()
  })
  it('only fetches explicit GET pages and does not call with an already aborted signal', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(first)))
    vi.stubGlobal('fetch', fetcher)
    expect(await fetchPlanVersions(parent.id, 1, undefined, true)).toEqual(
      first,
    )
    expect(fetcher.mock.calls[0][1].method).toBeUndefined()
    const abort = new AbortController()
    abort.abort()
    await expect(
      fetchPlanVersions(parent.id, 2, abort.signal, true),
    ).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([undefined, false])(
    'does not request version history without explicit revision capability: %j',
    async (enabled) => {
      const fetcher = vi.fn()
      vi.stubGlobal('fetch', fetcher)
      await expect(
        fetchPlanVersions(parent.id, 1, undefined, enabled),
      ).rejects.toThrow('task_plan_revisions_unsupported')
      expect(fetcher).not.toHaveBeenCalled()
    },
  )
})
