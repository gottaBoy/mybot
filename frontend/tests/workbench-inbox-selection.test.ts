import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../src/workbench/projections'
import { resolveInboxSelection } from '../src/workbench/inbox-selection'

const task: WorkItem = {
  id: 'task-a',
  task: {
    id: 'task-a',
    project_id: 'project',
    title: 'Review findings',
    goal: 'Inspect the persisted results',
    acceptance: 'Keep unknown outcomes explicit',
    files: ['README.md'],
  },
  projectName: 'Project',
  column: 'attention',
  attempts: 1,
  run: {
    id: 'run-a',
    task_id: 'task-a',
    status: 'paused',
    created_at: '2026-11-14T00:00:00Z',
  },
}

describe('inbox task selection', () => {
  it('keeps mobile unselected until activation while allowing the desktop first item', () => {
    expect(resolveInboxSelection([task], '', false)).toEqual({ kind: 'empty' })
    expect(resolveInboxSelection([task], '', true)).toEqual({
      kind: 'available',
      item: task,
    })
    expect(resolveInboxSelection([], '', true)).toEqual({ kind: 'empty' })
  })

  it('uses the latest task and run facts for the selected ID', () => {
    const original = resolveInboxSelection([task], task.id, false)
    expect(original.kind).toBe('available')
    const updated: WorkItem = {
      ...task,
      task: { ...task.task, acceptance: 'Updated acceptance', files: [] },
      run: {
        ...task.run!,
        status: 'failed',
        error: 'provider_timeout_outcome_unknown',
      },
    }
    const selected = resolveInboxSelection([updated], task.id, false)
    expect(selected.kind).toBe('available')
    if (selected.kind !== 'available') throw new Error('Expected selected task')
    expect(selected.item).toBe(updated)
    expect(selected.item.run?.error).toBe('provider_timeout_outcome_unknown')
    expect(selected.item.task.acceptance).toBe('Updated acceptance')
    expect(selected.item.task.files).toEqual([])
    expect(task.run?.status).toBe('paused')
  })

  it('never substitutes another task when an explicit selection leaves the results', () => {
    const other: WorkItem = {
      ...task,
      id: 'task-b',
      task: { ...task.task, id: 'task-b', title: 'Another task' },
    }
    for (const selectFirst of [false, true]) {
      expect(resolveInboxSelection([other], task.id, selectFirst)).toEqual({
        kind: 'unavailable',
        id: task.id,
      })
      expect(resolveInboxSelection([], task.id, selectFirst)).toEqual({
        kind: 'unavailable',
        id: task.id,
      })
    }
  })
})
