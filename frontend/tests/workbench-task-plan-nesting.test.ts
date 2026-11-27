import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseNestedTaskPlan,
  parseNestedGate,
  parseTaskOutcome,
  parseNestedCreatePreview,
  parseNestedReceipt,
  parseNestedRevisionPreview,
} from '../src/workbench/task-plan-nesting'
import {
  fetchTaskPlan,
  previewTaskPlan,
  createTaskPlan,
  fetchPlanOperation,
  parseTaskPlan,
  parseAnyDependencyGate,
} from '../src/workbench/task-plans'
import {
  planVersionFromCurrent,
  previewPlanRevision,
  publishPlanRevision,
} from '../src/workbench/task-plan-revisions'
import {
  nestedRoot,
  containerTask,
  grandchildTasks,
  containerGate,
  grandchildGates,
  grandchildOutcomes,
  nestedDefinition,
  nestedRead,
  nestedPreview,
  nestedReceipt,
} from './task-plan-nesting-fixture'
afterEach(() => vi.unstubAllGlobals())
describe('bounded nested Task projections', () => {
  it('admits a Task with both parent membership and its own frozen local plan', () => {
    expect(parseTaskPlan(nestedRead, containerTask.id)).toEqual(nestedRead)
    expect(parseNestedTaskPlan(nestedRead, containerTask.id)).toEqual(
      nestedRead,
    )
    expect(parseAnyDependencyGate(containerGate, containerTask.id)).toEqual(
      containerGate,
    )
    expect(planVersionFromCurrent(nestedRead.plan!).version).toBe(1)
  })
  it('keeps inherited ancestor prerequisites and local sibling gates separate', () => {
    const gate = structuredClone(grandchildGates[0])
    gate.external_scopes[1].prerequisites = [grandchildOutcomes[1]]
    gate.ready = false
    expect(parseNestedGate(gate).ready).toBe(false)
    expect(parseNestedGate(grandchildGates[0]).ready).toBe(true)
    expect(parseNestedGate(containerGate).ready).toBe(false)
  })
  it.each([
    { ...nestedRead, root_task_id: 'wrong-root' },
    { ...nestedRead, parent: null },
    { ...nestedRead, depth: 2 },
    { ...nestedRead, gate: { ...containerGate, ready: true } },
    { ...nestedRead, gate: { ...containerGate, own_plan: null } },
    {
      ...nestedRead,
      plan: {
        ...nestedRead.plan,
        items: [...nestedRead.plan!.items].reverse(),
      },
    },
    {
      ...nestedRead,
      plan: { ...nestedRead.plan, parent_task_id: nestedRoot.id },
    },
  ])('rejects malformed nested reads %#', (value) => {
    expect(() => parseNestedTaskPlan(value, containerTask.id)).toThrow()
  })
  it('rejects missing sibling or inherited evidence despite a success-shaped gate', () => {
    const value = structuredClone(nestedRead)
    value.plan!.items[1].gate.external_scopes[0].prerequisites = []
    value.plan!.items[1].gate.ready = true
    expect(() => parseNestedTaskPlan(value, containerTask.id)).toThrow()
    const inherited = structuredClone(nestedRead)
    inherited.plan!.items[0].gate.external_scopes[1].prerequisites = [
      grandchildOutcomes[1],
    ]
    inherited.plan!.items[0].gate.ready = false
    expect(() => parseNestedTaskPlan(inherited, containerTask.id)).toThrow()
  })
  it('does not convert accepted children into an accepted parent report', () => {
    const children = grandchildOutcomes.map((item) => ({
      task_id: item.task_id,
      title: item.title,
      state: 'accepted',
      completion_hash: item.completion_hash,
    }))
    const parent = {
      task_id: containerTask.id,
      title: containerTask.title,
      kind: 'plan',
      state: 'integration_stale',
      latest_run: {
        id: 'old-parent-run',
        task_id: containerTask.id,
        status: 'succeeded',
        created_at: nestedRoot.created_at,
      },
      reports: [
        { id: 'old-report', decision: 'accepted', sha256: '1'.repeat(64) },
      ],
      completion_hash: '2'.repeat(64),
      own_plan: {
        version: 1,
        plan_hash: 'e'.repeat(64),
        completion_scope_hash: 'f'.repeat(64),
        ready: true,
        children,
      },
    }
    expect(parseTaskOutcome(parent).state).toBe('integration_stale')
    expect(() =>
      parseTaskOutcome({
        ...parent,
        latest_run: null,
        reports: [],
        state: 'accepted',
      }),
    ).toThrow()
    expect(() =>
      parseTaskOutcome({
        ...parent,
        own_plan: { ...parent.own_plan, ready: false },
      }),
    ).toThrow()
  })
  it('marks descendants retired if an ancestor membership is retired', () => {
    const gate = structuredClone(grandchildGates[0])
    gate.external_scopes[1].membership = 'retired'
    gate.membership = 'retired'
    gate.ready = false
    expect(parseNestedGate(gate).ready).toBe(false)
    expect(() => parseNestedGate({ ...gate, membership: 'current' })).toThrow()
    expect(() => parseNestedGate({ ...gate, ready: true })).toThrow()
  })
  it.each([
    { ...grandchildGates[0], depth: 3 },
    { ...grandchildGates[0], external_scopes: [] },
    { ...grandchildGates[0], own_plan: containerGate.own_plan },
    { ...grandchildGates[0], parent_task_id: nestedRoot.id },
    {
      ...grandchildGates[0],
      external_scopes: [
        {
          ...grandchildGates[0].external_scopes[0],
          parent_task_id: grandchildTasks[0].id,
        },
        grandchildGates[0].external_scopes[1],
      ],
    },
  ])('rejects deep, cyclic or substituted lineages %#', (value) => {
    expect(() => parseNestedGate(value)).toThrow()
  })
})
describe('nested capability and immutable operations', () => {
  it('keeps local CAS revisions and frozen history separate from nested live gates', async () => {
    const baseline = planVersionFromCurrent(nestedRead.plan!)
    const definition = { items: [...baseline.definition.items].reverse() }
    const preview = {
      schema_version: 3,
      unit: 'task_plan_revision_preview',
      parent_task_id: containerTask.id,
      expected_version: 1,
      expected_plan_hash: baseline.plan_hash,
      baseline,
      parent_snapshot: containerTask,
      definition,
      lineage: nestedPreview.lineage,
      tree_heads: [
        ...nestedPreview.tree_heads,
        {
          task_id: containerTask.id,
          version: 1,
          plan_hash: baseline.plan_hash,
        },
      ],
      impact: {
        added_keys: [],
        replaced_keys: [],
        reused_keys: ['part2', 'part1'],
        removed_keys: [],
        retired_task_ids: [],
        subtree_retired_task_ids: [],
        root_task_id: nestedRoot.id,
        depth: 1,
        current_task_count: 5,
        blockers: [],
      },
      preview_hash: '9'.repeat(64),
    }
    const admitted = parseNestedRevisionPreview(
      preview,
      containerTask,
      baseline,
      definition,
    )
    const result = structuredClone(nestedRead)
    result.plan!.version = 2
    result.plan!.plan_hash = preview.preview_hash
    result.plan!.definition = definition
    result.plan!.items.reverse()
    result.gate.own_plan!.children.reverse()
    result.gate.own_plan!.version = 2
    result.gate.own_plan!.plan_hash = preview.preview_hash
    for (const item of result.plan!.items) {
      item.gate.external_scopes[0].plan_version = 2
      item.gate.external_scopes[0].plan_hash = preview.preview_hash
    }
    const receipt = {
      ...nestedReceipt,
      operation: 'revise',
      preview_hash: preview.preview_hash,
      result,
    }
    expect(
      parseNestedReceipt(
        receipt,
        containerTask.id,
        receipt.request_id,
        admitted,
      ).result.plan?.version,
    ).toBe(2)
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(preview)))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
    vi.stubGlobal('fetch', fetcher)
    const checked = await previewPlanRevision(
      containerTask,
      baseline,
      definition,
      undefined,
      true,
    )
    expect(
      (
        await publishPlanRevision(
          containerTask,
          receipt.request_id,
          checked,
          undefined,
          true,
        )
      ).result.plan?.version,
    ).toBe(2)
    expect(JSON.parse(fetcher.mock.calls[1][1].body).expected_plan_hash).toBe(
      baseline.plan_hash,
    )
    expect(baseline.version).toBe(1)
    expect(baseline.bindings.map((item) => item.task.id)).toEqual(
      grandchildTasks.map((task) => task.id),
    )
  })
  it.each([undefined, false])(
    'fails closed on current schema3 without capability %j',
    async (enabled) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(
            async () => new Response(JSON.stringify(nestedRead)),
          ),
      )
      await expect(
        fetchTaskPlan(containerTask.id, undefined, true, enabled),
      ).rejects.toThrow('nested_task_plans_unsupported')
    },
  )
  it('keeps original operation reads available after capability loss', async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify(nestedReceipt)),
      )
    vi.stubGlobal('fetch', fetcher)
    expect(
      await fetchPlanOperation(containerTask.id, nestedReceipt.request_id),
    ).toEqual(nestedReceipt)
    expect(fetcher.mock.calls[0][1].method).toBeUndefined()
  })
  it('binds lineage, tree heads, complete definition and fresh parent in a creation preview', () => {
    expect(
      parseNestedCreatePreview(nestedPreview, containerTask, nestedDefinition),
    ).toEqual(nestedPreview)
    expect(
      parseNestedReceipt(
        nestedReceipt,
        containerTask.id,
        nestedReceipt.request_id,
        nestedPreview,
      ),
    ).toEqual(nestedReceipt)
  })
  it.each([
    { ...nestedPreview, tree_heads: [] },
    { ...nestedPreview, lineage: [] },
    { ...nestedPreview, impact: { ...nestedPreview.impact, added_tasks: 8 } },
    { ...nestedPreview, impact: { ...nestedPreview.impact, depth: 2 } },
    {
      ...nestedPreview,
      impact: { ...nestedPreview.impact, current_task_count: 73 },
    },
    {
      ...nestedPreview,
      parent_snapshot: { ...containerTask, goal: 'Other goal' },
    },
    {
      ...nestedPreview,
      criterion: 'latest-successful-run-reviewed-reports-v1',
    },
  ])('rejects changed or unbounded nested previews %#', (value) => {
    expect(() =>
      parseNestedCreatePreview(value, containerTask, nestedDefinition),
    ).toThrow()
  })
  it('uses original create routes and the same ID without any execution POST', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(nestedPreview)))
      .mockResolvedValueOnce(new Response(JSON.stringify(nestedReceipt)))
    vi.stubGlobal('fetch', fetcher)
    const preview = await previewTaskPlan(
      containerTask,
      nestedDefinition,
      undefined,
      true,
    )
    expect(
      await createTaskPlan(
        containerTask,
        nestedReceipt.request_id,
        preview,
        undefined,
        true,
      ),
    ).toEqual(nestedReceipt)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `/api/tasks/${containerTask.id}/plan/preview`,
      `/api/tasks/${containerTask.id}/plan`,
    ])
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      ...nestedDefinition,
      request_id: nestedReceipt.request_id,
      preview_hash: nestedPreview.preview_hash,
      consent: true,
    })
  })
  it('blocks whole-tree active work even when the blocker is outside the edited Task subtree', async () => {
    const blocked = {
      ...nestedPreview,
      impact: {
        ...nestedPreview.impact,
        blockers: [{ task_id: nestedRoot.id, reasons: ['unfinished_run'] }],
      },
    }
    const parsed = parseNestedCreatePreview(
      blocked,
      containerTask,
      nestedDefinition,
    )
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      createTaskPlan(
        containerTask,
        nestedReceipt.request_id,
        parsed,
        undefined,
        true,
      ),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
