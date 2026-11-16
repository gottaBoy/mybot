import { describe, expect, it } from 'vitest'
import type { Bootstrap, Run, Task } from '../src/workbench/api'
import { taskItems, type WorkItem } from '../src/workbench/projections'
import {
  buildQueryFieldDirectory,
  matchesRunConditions,
  matchesTaskConditions,
  normalizeQueryConditions,
  parseQueryConditions,
  queryConditionsEqual,
  queryRunState,
  queryStateCategories,
  type QueryConditions,
} from '../src/workbench/query-conditions'

const all: QueryConditions = { projects: [], states: [] }
const english = (_: string, en: string) => en
const chinese = (zh: string) => zh
function task(id: string, projectId: string): Task {
  return {
    id,
    project_id: projectId,
    title: `Task ${id}`,
    goal: '',
    acceptance: '',
    files: [],
  }
}
function fixture(): Bootstrap {
  return {
    projects: [
      { id: 'project-b', name: 'Beta', goal: '', directory: '.', notes: '' },
      { id: 'project-a', name: 'Alpha', goal: '', directory: '.', notes: '' },
    ],
    tasks: [
      task('recovered', 'project-a'),
      task('never-run', 'project-a'),
      task('active', 'project-b'),
      task('attention', 'project-b'),
      task('unknown', 'project-a'),
      task('pending-record', 'project-a'),
    ],
    runs: [
      {
        id: 'recovered-old',
        task_id: 'recovered',
        status: 'failed',
        created_at: '2026-11-14T00:00:00Z',
      },
      {
        id: 'recovered-new',
        task_id: 'recovered',
        status: 'succeeded',
        created_at: '2026-11-15T00:00:00Z',
      },
      {
        id: 'active-run',
        task_id: 'active',
        status: 'running',
        created_at: '2026-11-15T00:00:00Z',
      },
      {
        id: 'paused-run',
        task_id: 'attention',
        status: 'paused',
        created_at: '2026-11-15T00:00:00Z',
      },
      {
        id: 'unknown-run',
        task_id: 'unknown',
        status: 'custom_status',
        created_at: '2026-11-15T00:00:00Z',
      },
      {
        id: 'pending-run',
        task_id: 'pending-record',
        status: 'pending',
        created_at: '2026-11-15T00:00:00Z',
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
function selectedTasks(conditions: QueryConditions, fixedProjectId?: string) {
  return taskItems(fixture())
    .filter((item) => matchesTaskConditions(item, conditions, fixedProjectId))
    .map((item) => item.id)
}

describe('strict JSON condition parsing', () => {
  it('uses absent or explicit empty arrays as all values without introducing all sentinels', () => {
    expect(parseQueryConditions(null, null)).toEqual({ conditions: all })
    expect(parseQueryConditions('[]', '[]')).toEqual({ conditions: all })
    expect(normalizeQueryConditions(all)).toEqual({ conditions: all })
  })
  it('canonicalizes project order and category order without changing input', () => {
    const input = {
      projects: ['project-b', 'project-a'],
      states: ['other', 'completed', 'pending', 'attention', 'active'],
    }
    const before = structuredClone(input)
    const expected = {
      conditions: {
        projects: ['project-a', 'project-b'],
        states: [...queryStateCategories],
      },
    }
    expect(normalizeQueryConditions(input)).toEqual(expected)
    expect(
      parseQueryConditions(
        JSON.stringify(input.projects),
        JSON.stringify(input.states),
      ),
    ).toEqual(expected)
    expect(input).toEqual(before)
  })
  it.each([
    '',
    '{',
    '{}',
    'null',
    'true',
    '42',
    '"project-a"',
    '[null]',
    '[1]',
    '[""]',
    '[" project-a"]',
    '["project-a "]',
    '["project-a","project-a"]',
    JSON.stringify(['x'.repeat(101)]),
    JSON.stringify(
      Array.from({ length: 101 }, (_, index) => `project-${index}`),
    ),
  ])('rejects malformed or invalid projects JSON %j explicitly', (projects) => {
    expect(parseQueryConditions(projects, '["active"]')).toHaveProperty(
      'error',
      'conditions_invalid',
    )
  })
  it.each([
    '',
    '{}',
    'null',
    'false',
    '"active"',
    '[null]',
    '[1]',
    '["all"]',
    '["failed"]',
    '["Active"]',
    '["active "]',
    '["active","active"]',
    '["pending","active","attention","completed","other","active"]',
  ])('rejects malformed or unsupported states JSON %j explicitly', (states) => {
    expect(parseQueryConditions('["project-a"]', states)).toHaveProperty(
      'error',
      'conditions_invalid',
    )
  })
  it.each([
    undefined,
    null,
    [],
    'all',
    {},
    { projects: [] },
    { states: [] },
    { projects: [], states: [], assignee: 'currentUser' },
    { projects: 'project-a', states: [] },
    { projects: [], states: 'active' },
    { projects: ['a', 'a'], states: [] },
    { projects: [], states: ['other', 'other'] },
    new Date(0),
    Object.create({ projects: [], states: [] }),
    { projects: new Array(1), states: [] },
  ])('normalization rejects invalid structures or duplicates %j', (value) => {
    expect(normalizeQueryConditions(value)).toHaveProperty(
      'error',
      'conditions_invalid',
    )
  })
  it('rejects unexpected symbols and inaccessible values rather than silently filtering less', () => {
    const symbol = { projects: [], states: [], [Symbol('extra')]: true }
    expect(normalizeQueryConditions(symbol).error).toBe('conditions_invalid')
    const blocked = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error('blocked')
        },
      },
    )
    expect(() => normalizeQueryConditions(blocked)).not.toThrow()
    expect(normalizeQueryConditions(blocked).error).toBe('conditions_invalid')
  })
  it('accepts the maximum project count and character length with case-sensitive opaque IDs', () => {
    const projects = Array.from(
      { length: 100 },
      (_, index) => `project-${index}`,
    )
    expect(
      normalizeQueryConditions({ projects, states: [] }).error,
    ).toBeUndefined()
    expect(
      normalizeQueryConditions({
        projects: ['x'.repeat(100), '项目'.repeat(50)],
        states: [],
      }).error,
    ).toBeUndefined()
    expect(
      normalizeQueryConditions({ projects: ['a', 'A'], states: [] }).conditions
        .projects,
    ).toEqual(['A', 'a'])
  })
  it('compares canonical conditions and never treats invalid conditions as an equal valid all-selection', () => {
    expect(
      queryConditionsEqual(
        { projects: ['b', 'a'], states: ['other', 'active'] },
        { projects: ['a', 'b'], states: ['active', 'other'] },
      ),
    ).toBe(true)
    expect(queryConditionsEqual(all, { projects: ['a'], states: [] })).toBe(
      false,
    )
    expect(
      queryConditionsEqual(all, { projects: [], states: ['pending'] }),
    ).toBe(false)
    expect(
      queryConditionsEqual(
        { projects: ['a', 'a'], states: [] },
        { projects: ['a'], states: [] },
      ),
    ).toBe(false)
  })
})

describe('task condition composition', () => {
  it('uses OR within projects and states, and AND across the two fields', () => {
    expect(
      selectedTasks({
        projects: ['project-a', 'project-b'],
        states: ['active', 'completed'],
      }),
    ).toEqual(['recovered', 'active'])
    expect(
      selectedTasks({
        projects: ['project-a'],
        states: ['active', 'completed'],
      }),
    ).toEqual(['recovered'])
    expect(
      selectedTasks({
        projects: ['project-b'],
        states: ['active', 'attention'],
      }),
    ).toEqual(['active', 'attention'])
    expect(
      selectedTasks({ projects: ['missing-project'], states: [] }),
    ).toEqual([])
    expect(selectedTasks(all)).toHaveLength(fixture().tasks.length)
  })
  it('uses each current WorkItem column and retains failed history after successful recovery', () => {
    const data = fixture()
    expect(selectedTasks({ projects: [], states: ['attention'] })).toEqual([
      'attention',
    ])
    expect(selectedTasks({ projects: [], states: ['completed'] })).toEqual([
      'recovered',
    ])
    expect(data.runs[0]).toMatchObject({
      id: 'recovered-old',
      status: 'failed',
    })
    const current = taskItems(data).find((item) => item.id === 'recovered')!
    const projected = { ...current, run: data.runs[0] }
    expect(
      matchesTaskConditions(projected, { projects: [], states: ['completed'] }),
    ).toBe(true)
    expect(
      matchesTaskConditions(projected, { projects: [], states: ['attention'] }),
    ).toBe(false)
  })
  it('distinguishes a never-run task from an actual pending or unknown Run record', () => {
    expect(selectedTasks({ projects: [], states: ['pending'] })).toEqual([
      'never-run',
    ])
    expect(selectedTasks({ projects: [], states: ['other'] })).toEqual([
      'unknown',
      'pending-record',
    ])
  })
  it('lets a fixed route project override selected projects but never escape its boundary', () => {
    expect(
      selectedTasks({ projects: ['project-b'], states: [] }, 'project-a'),
    ).toEqual(['recovered', 'never-run', 'unknown', 'pending-record'])
    expect(
      selectedTasks(
        { projects: ['project-b'], states: ['active'] },
        'project-a',
      ),
    ).toEqual([])
    expect(selectedTasks(all, 'missing-project')).toEqual([])
    expect(selectedTasks(all, '')).toEqual([])
    expect(selectedTasks(all, ' project-a')).toEqual([])
  })
  it('rejects malformed conditions instead of treating them as no filters', () => {
    const item = taskItems(fixture())[0]
    expect(
      matchesTaskConditions(item, {
        projects: ['project-a', 'project-a'],
        states: [],
      }),
    ).toBe(false)
    expect(
      matchesTaskConditions(item, {
        projects: [],
        states: ['success'],
      } as unknown as QueryConditions),
    ).toBe(false)
    expect(
      matchesTaskConditions(
        { ...item, column: 'unknown' } as unknown as WorkItem,
        all,
      ),
    ).toBe(false)
  })
})

describe('historical Run conditions', () => {
  it.each([
    ['queued', 'active'],
    ['running', 'active'],
    ['pause_requested', 'active'],
    ['cancel_requested', 'active'],
    ['failed', 'attention'],
    ['interrupted', 'attention'],
    ['paused', 'attention'],
    ['succeeded', 'completed'],
    ['pending', 'other'],
    ['waiting', 'other'],
    ['canceled', 'other'],
    ['custom_status', 'other'],
  ] as const)('classifies actual %s Run records as %s', (status, category) => {
    expect(queryRunState({ status })).toBe(category)
  })
  it('reserves pending for the absence of a Run, not an existing pending-status record', () => {
    expect(queryRunState(undefined)).toBe('pending')
    const data = fixture()
    const run = data.runs.find((item) => item.status === 'pending')!
    const source = data.tasks.find((item) => item.id === run.task_id)
    expect(
      matchesRunConditions(run, source, { projects: [], states: ['pending'] }),
    ).toBe(false)
    expect(
      matchesRunConditions(run, source, { projects: [], states: ['other'] }),
    ).toBe(true)
  })
  it('counts each historical record independently from its task current state', () => {
    const data = fixture()
    const records = data.runs.filter((run) =>
      matchesRunConditions(
        run,
        data.tasks.find((item) => item.id === run.task_id),
        { projects: ['project-a'], states: ['attention', 'completed'] },
      ),
    )
    expect(records.map((run) => run.id)).toEqual([
      'recovered-old',
      'recovered-new',
    ])
    expect(
      selectedTasks({
        projects: ['project-a'],
        states: ['attention', 'completed'],
      }),
    ).toEqual(['recovered'])
  })
  it('allows an orphan Run only without a project restriction and never borrows another task identity', () => {
    const run: Run = {
      id: 'orphan',
      task_id: 'missing',
      status: 'failed',
      created_at: '2026-11-15',
    }
    expect(matchesRunConditions(run, undefined, all)).toBe(true)
    expect(
      matchesRunConditions(run, undefined, {
        projects: [],
        states: ['attention'],
      }),
    ).toBe(true)
    expect(
      matchesRunConditions(run, undefined, {
        projects: ['project-a'],
        states: [],
      }),
    ).toBe(false)
    expect(matchesRunConditions(run, undefined, all, 'project-a')).toBe(false)
    expect(
      matchesRunConditions(run, task('wrong', 'project-a'), all, 'project-a'),
    ).toBe(false)
  })
  it('uses the fixed project scope above any project selection and still validates conditions', () => {
    const data = fixture()
    const run = data.runs[1]
    const source = data.tasks[0]
    expect(
      matchesRunConditions(
        run,
        source,
        { projects: ['project-b'], states: ['completed'] },
        'project-a',
      ),
    ).toBe(true)
    expect(matchesRunConditions(run, source, all, 'project-b')).toBe(false)
    expect(
      matchesRunConditions(
        run,
        source,
        { projects: [], states: ['completed', 'completed'] },
        'project-a',
      ),
    ).toBe(false)
  })
})

describe('real query field directory', () => {
  it('offers only real project IDs and five domain categories, with no identity or all-value options', () => {
    const fields = buildQueryFieldDirectory(fixture(), english)
    expect(fields.map((field) => field.id)).toEqual(['projects', 'states'])
    expect(fields[0].options).toEqual([
      { value: 'project-b', label: 'Beta' },
      { value: 'project-a', label: 'Alpha' },
    ])
    expect(fields[1].options.map((option) => option.value)).toEqual(
      queryStateCategories,
    )
    expect(
      fields
        .flatMap((field) => field.options)
        .some((option) => option.value === 'all'),
    ).toBe(false)
    expect(fields[1].units).toEqual({ tasks: 'tasks', runs: 'run records' })
    expect(fields[1].description).toContain('each record')
    expect(fields[1].description).toContain('without a run')
    expect(buildQueryFieldDirectory(fixture(), chinese)[1].label).toBe(
      '状态分类',
    )
  })
  it('does not invent projects when the real directory is empty', () => {
    const fields = buildQueryFieldDirectory({ projects: [] }, english)
    expect(fields[0].options).toEqual([])
    expect(fields[1].options).toHaveLength(5)
  })
  it('does not mutate condition arrays, source projects, tasks or Run history', () => {
    const data = fixture()
    const conditions: QueryConditions = {
      projects: ['project-b', 'project-a'],
      states: ['other', 'active'],
    }
    const before = structuredClone({ data, conditions })
    function freeze(value: unknown): void {
      if (!value || typeof value !== 'object') return
      Object.freeze(value)
      Object.values(value).forEach(freeze)
    }
    freeze(data)
    freeze(conditions)
    normalizeQueryConditions(conditions)
    buildQueryFieldDirectory(data, english)
    taskItems(data).forEach((item) => matchesTaskConditions(item, conditions))
    data.runs.forEach((run) =>
      matchesRunConditions(
        run,
        data.tasks.find((item) => item.id === run.task_id),
        conditions,
      ),
    )
    expect({ data, conditions }).toEqual(before)
  })
})
