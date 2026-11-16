import { describe, expect, it } from 'vitest'
import type { Bootstrap, Task } from '../src/workbench/api'
import { filteredItems, filterTaskItems } from '../src/workbench/projections'
import type { Filter } from '../src/workbench/state'

function task(id: string, projectId: string, title: string): Task {
  return {
    id,
    project_id: projectId,
    title,
    goal: '',
    acceptance: '',
    files: [],
  }
}

function fixture(): Bootstrap {
  return {
    projects: [
      { id: 'p1', name: 'Alpha Lab', goal: '', directory: '', notes: '' },
      { id: 'p2', name: 'Beta Lab', goal: '', directory: '', notes: '' },
    ],
    tasks: [
      task('draft', 'p1', 'Draft connector'),
      task('recovered', 'p1', 'Recovered connector'),
      task('active', 'p1', 'Active connector'),
      task('attention', 'p1', 'Review research'),
      task('unknown', 'p1', 'Unknown state'),
      task('pending', 'p1', 'Pending state'),
      task('beta-active', 'p2', 'Active connector'),
      task('beta-failed', 'p2', 'Failed research'),
      task('canceled', 'p2', 'Canceled research'),
    ],
    runs: [
      {
        id: 'recovered-new',
        task_id: 'recovered',
        status: 'succeeded',
        created_at: '2026-11-14T01:00:00Z',
        source_run_id: 'recovered-old',
      },
      {
        id: 'recovered-old',
        task_id: 'recovered',
        status: 'failed',
        created_at: '2026-11-13T01:00:00Z',
      },
      {
        id: 'active-run',
        task_id: 'active',
        status: 'queued',
        created_at: '2026-11-14',
      },
      {
        id: 'paused-run',
        task_id: 'attention',
        status: 'paused',
        created_at: '2026-11-14',
      },
      {
        id: 'unknown-run',
        task_id: 'unknown',
        status: 'custom_status',
        created_at: '2026-11-14',
      },
      {
        id: 'pending-run',
        task_id: 'pending',
        status: 'pending',
        created_at: '2026-11-14',
      },
      {
        id: 'beta-active-run',
        task_id: 'beta-active',
        status: 'running',
        created_at: '2026-11-14',
      },
      {
        id: 'beta-failed-run',
        task_id: 'beta-failed',
        status: 'failed',
        created_at: '2026-11-14',
      },
      {
        id: 'canceled-run',
        task_id: 'canceled',
        status: 'canceled',
        created_at: '2026-11-14',
      },
    ],
    models: [],
    backends: [],
    workspace: '',
    default_model_id: '',
    local_harnesses: [],
    capabilities: { backend_sync: false },
  }
}

function ids(
  data: Bootstrap,
  query: string,
  filter: Filter,
  projectId?: string,
) {
  return filterTaskItems(data, query, filter, projectId).map((item) => item.id)
}

describe('task-list read model', () => {
  it('returns one item per task using its latest run, not array order or historic failure', () => {
    const data = fixture()
    const recovered = filterTaskItems(data, '', 'all').find(
      (item) => item.id === 'recovered',
    )
    expect(filterTaskItems(data, '', 'all')).toHaveLength(data.tasks.length)
    expect(recovered).toMatchObject({
      column: 'completed',
      attempts: 2,
      run: { id: 'recovered-new', source_run_id: 'recovered-old' },
    })
    expect(ids(data, '', 'attention')).not.toContain('recovered')
    expect(ids(data, 'recovered-old', 'all')).toEqual([])
    expect(data.runs[1].status).toBe('failed')
  })

  it('combines status, project and trimmed case-insensitive title, project or latest-run query', () => {
    const data = fixture()
    expect(ids(data, ' CONNECTOR ', 'active', 'p1')).toEqual(['active'])
    expect(ids(data, 'alpha LAB', 'attention', 'p1')).toEqual(['attention'])
    expect(ids(data, 'RECOVERED-NEW', 'completed', 'p1')).toEqual(['recovered'])
    expect(ids(data, 'connector', 'completed', 'p2')).toEqual([])
    expect(ids(data, 'connector', 'active')).toEqual(['active', 'beta-active'])
    expect(ids(data, 'no match', 'all')).toEqual([])
  })

  it('matches a task ID case-insensitively even when it has no run or matching title', () => {
    const data = fixture()
    data.tasks.push(task('Task-47Ab', 'p1', 'New research proposal'))
    expect(
      filteredItems(data, ' TASK-47AB ', 'p1').map((item) => item.id),
    ).toEqual(['Task-47Ab'])
    expect(ids(data, '47aB', 'all', 'p1')).toEqual(['Task-47Ab'])
    expect(ids(data, 'task-47ab', 'all', 'p2')).toEqual([])
    for (const filter of ['active', 'attention', 'completed'] as const) {
      expect(ids(data, 'task-47ab', filter, 'p1')).toEqual([])
    }
  })

  it('searches the latest run ID intentionally, not IDs from historical attempts', () => {
    const data = fixture()
    expect(ids(data, 'RECOVERED-NEW', 'all', 'p1')).toEqual(['recovered'])
    expect(ids(data, 'recovered-new', 'completed', 'p1')).toEqual(['recovered'])
    expect(ids(data, 'RECOVERED-OLD', 'all', 'p1')).toEqual([])
    expect(ids(data, 'recovered-old', 'attention', 'p1')).toEqual([])
  })

  it('keeps tasks without runs and pending, unknown or canceled states out of status subsets', () => {
    const data = fixture()
    expect(
      filterTaskItems(data, '', 'all').find((item) => item.id === 'draft'),
    ).toMatchObject({
      column: 'pending',
      attempts: 0,
      run: undefined,
    })
    for (const filter of ['active', 'attention', 'completed'] as const) {
      for (const id of ['draft', 'pending', 'unknown', 'canceled']) {
        expect(ids(data, '', filter)).not.toContain(id)
      }
    }
    expect(ids(data, '', 'all')).toEqual(data.tasks.map((item) => item.id))
    expect(ids(data, '', 'completed')).toEqual(['recovered'])
  })

  it.each([
    ['queued', 'active'],
    ['running', 'active'],
    ['pause_requested', 'active'],
    ['cancel_requested', 'active'],
    ['failed', 'attention'],
    ['interrupted', 'attention'],
    ['paused', 'attention'],
    ['succeeded', 'completed'],
  ] as const)('classifies the latest %s run under %s', (status, filter) => {
    const data = fixture()
    data.runs.find((run) => run.id === 'active-run')!.status = status
    expect(ids(data, 'active-run', filter, 'p1')).toEqual(['active'])
    for (const other of ['active', 'attention', 'completed'] as const) {
      if (other !== filter)
        expect(ids(data, 'active-run', other, 'p1')).toEqual([])
    }
  })

  it('limits all results to the explicit project without inventing a project scope', () => {
    const data = fixture()
    expect(ids(data, '', 'all', 'p2')).toEqual([
      'beta-active',
      'beta-failed',
      'canceled',
    ])
    expect(ids(data, '', 'all', 'missing-project')).toEqual([])
    expect(ids(data, '', 'all', '')).toEqual(ids(data, '', 'all'))
  })

  it('does not change input arrays, entities or persisted run history', () => {
    const data = fixture()
    const before = structuredClone(data)
    function freeze(value: unknown): void {
      if (value && typeof value === 'object') {
        Object.freeze(value)
        for (const item of Object.values(value)) freeze(item)
      }
    }
    freeze(data)
    for (const filter of ['all', 'active', 'attention', 'completed'] as const) {
      filterTaskItems(data, 'connector', filter, 'p1')
    }
    expect(data).toEqual(before)
  })
})
