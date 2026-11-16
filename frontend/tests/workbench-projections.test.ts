import { describe, expect, it } from 'vitest'
import {
  filteredItems,
  projectProgress,
  taskItems,
  treeBranchIds,
  workTree,
} from '../src/workbench/projections'
import type { Bootstrap } from '../src/workbench/api'
import {
  defaultProductTheme,
  loadProductTheme,
  styleIds,
} from '../src/components/ui/themes'

const data = {
  projects: [{ id: 'p', name: 'mybot' }],
  tasks: [
    { id: 'draft', project_id: 'p', title: 'Draft' },
    { id: 'fixed', project_id: 'p', title: 'Recovered task' },
    { id: 'paused', project_id: 'p', title: 'Paused task' },
    { id: 'unknown', project_id: 'p', title: 'Unknown state' },
  ],
  runs: [
    { id: 'old', task_id: 'fixed', status: 'failed', created_at: '2026-11-01' },
    {
      id: 'new',
      task_id: 'fixed',
      status: 'succeeded',
      created_at: '2026-11-13',
    },
    {
      id: 'pause',
      task_id: 'paused',
      status: 'paused',
      created_at: '2026-11-13',
    },
    {
      id: 'unk',
      task_id: 'unknown',
      status: 'custom_status',
      created_at: '2026-11-13',
    },
  ],
} as Bootstrap

describe('shared template data projections', () => {
  it('groups one card per task, choosing latest run without mutating history', () => {
    const items = taskItems(data)
    expect(items).toHaveLength(4)
    expect(items.find((item) => item.id === 'fixed')).toMatchObject({
      column: 'completed',
      attempts: 2,
      run: { id: 'new' },
    })
    expect(data.runs[0].status).toBe('failed')
  })
  it('never calls a recovered historic failure a current inbox problem', () => {
    expect(
      taskItems(data)
        .filter((item) => item.column === 'attention')
        .map((item) => item.id),
    ).toEqual(['paused'])
  })
  it('distinguishes drafts and unknown execution state from completed work', () => {
    expect(taskItems(data).find((item) => item.id === 'draft')?.column).toBe(
      'pending',
    )
    expect(taskItems(data).find((item) => item.id === 'unknown')?.column).toBe(
      'other',
    )
  })
  it('filters task cards by explicit project and case-insensitive query', () => {
    expect(filteredItems(data, 'RECOVER', 'p').map((item) => item.id)).toEqual([
      'fixed',
    ])
    expect(filteredItems(data, '', 'missing')).toEqual([])
  })
  it('counts execution progress using tasks, not all historic attempts', () => {
    expect(projectProgress(data)[0]).toMatchObject({
      total: 4,
      complete: 1,
      active: 0,
      attention: 1,
    })
  })
  it('retains matching tree ancestors and all persisted run history', () => {
    const rows = workTree(data, 'old')
    expect(rows[0].id).toBe('project:p')
    expect(rows[0].children?.[0].id).toBe('task:fixed')
    expect(rows[0].children?.[0].children?.map((row) => row.id)).toEqual([
      'run:old',
    ])
    expect(treeBranchIds(rows)).toEqual(['project:p', 'task:fixed'])
    expect(workTree(data, 'no-match')).toEqual([])
  })
  it('does not scan workspace paths or synthesize file-tree nodes', () => {
    const kinds = workTree(data, '').flatMap((project) => [
      project.kind,
      ...(project.children ?? []).flatMap((task) => [
        task.kind,
        ...(task.children ?? []).map((run) => run.kind),
      ]),
    ])
    expect(new Set(kinds)).toEqual(new Set(['project', 'task', 'run']))
  })
})

describe('one-codebase product styles', () => {
  it('has eight explicit styles and caches a loaded theme', async () => {
    expect(styleIds).toHaveLength(8)
    expect(await loadProductTheme('neutral')).toBe(defaultProductTheme)
    const first = loadProductTheme('matcha')
    expect(loadProductTheme('matcha')).toBe(first)
    expect((await first).name).toBe('mybot-matcha')
  })
  it('maps the user-authorized Zira colors without replacing Astryx components', async () => {
    const theme = await loadProductTheme('zira')
    expect(theme.tokens['--color-accent']).toBe('light-dark(#3568e8, #5b87f5)')
    expect(theme.tokens['--color-text-primary']).toBe(
      'light-dark(#172b4d, #e6e9ef)',
    )
  })
  it('loads every selected style through published packages', async () => {
    for (const id of styleIds) {
      const theme = await loadProductTheme(id)
      expect(theme.name).toBe(`mybot-${id}`)
      expect(theme.tokens['--radius-container']).toBe(
        id === 'gothic' ? '4px' : '8px',
      )
    }
  })
})
