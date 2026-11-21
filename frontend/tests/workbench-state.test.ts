import { describe, expect, it } from 'vitest'
import {
  errorText,
  preferredArtifact,
  routeFromHash,
  selectRuns,
  splitFiles,
  statusText,
  statusTone,
  usageSummary,
} from '../src/workbench/state'
import type { Artifact, Bootstrap, Call } from '../src/workbench/api'
import { forwardedOrigin } from '../scripts/api-proxy'

const data = {
  projects: [
    { id: 'p1', name: 'mybot' },
    { id: 'p2', name: 'Another' },
  ],
  tasks: [
    { id: 't1', project_id: 'p1', title: '研究连接器' },
    { id: 't2', project_id: 'p2', title: 'Research' },
  ],
  runs: [
    {
      id: 'a1',
      task_id: 't1',
      status: 'running',
      created_at: '2026-11-13T00:00:00Z',
    },
    {
      id: 'b2',
      task_id: 't2',
      status: 'failed',
      created_at: '2026-11-12T00:00:00Z',
    },
    {
      id: 'c3',
      task_id: 't1',
      status: 'pause_requested',
      created_at: '2026-11-13T01:00:00Z',
    },
    {
      id: 'd4',
      task_id: 't1',
      status: 'succeeded',
      created_at: '2026-11-10T00:00:00Z',
    },
  ],
} as Bootstrap

describe('workbench read models', () => {
  it('sorts persisted runs newest first without mutating bootstrap', () => {
    expect(selectRuns(data, '', 'all').map((item) => item.id)).toEqual([
      'c3',
      'a1',
      'b2',
      'd4',
    ])
    expect(data.runs[0].id).toBe('a1')
  })
  it('keeps pending control requests active', () => {
    expect(selectRuns(data, '', 'active').map((item) => item.id)).toEqual([
      'c3',
      'a1',
    ])
  })
  it('combines status, project and case-insensitive text filters', () => {
    expect(
      selectRuns(data, 'MYBOT', 'completed', 'p1').map((item) => item.id),
    ).toEqual(['d4'])
    expect(selectRuns(data, '', 'attention', 'p1')).toEqual([])
    expect(selectRuns(data, 'b2', 'attention').map((item) => item.id)).toEqual([
      'b2',
    ])
  })
  it('searches task IDs case-insensitively and by substring while preserving run filters', () => {
    const taskId = 'Task-47Ab'
    const linked = {
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === 't1' ? { ...task, id: taskId } : task,
      ),
      runs: data.runs.map((run) =>
        run.task_id === 't1' ? { ...run, task_id: taskId } : run,
      ),
    }
    expect(
      selectRuns(linked, '  TASK-47ab  ', 'all').map((run) => run.id),
    ).toEqual(['c3', 'a1', 'd4'])
    expect(
      selectRuns(linked, '47AB', 'active', 'p1').map((run) => run.id),
    ).toEqual(['c3', 'a1'])
    expect(
      selectRuns(linked, '47', 'completed', 'p1').map((run) => run.id),
    ).toEqual(['d4'])
    expect(selectRuns(linked, taskId, 'all', 'p2')).toEqual([])
    expect(selectRuns(linked, taskId, 'attention', 'p1')).toEqual([])
    expect(data.tasks[0].id).toBe('t1')
    expect(data.runs[0].task_id).toBe('t1')
  })
  it('does not turn unknown statuses into successful execution', () => {
    expect(statusText('unrecognized', (zh) => zh)).toBe('unrecognized')
    expect(statusTone('unrecognized')).toBe('neutral')
    expect(statusText('failed', (_, en) => en)).toBe('Failed')
  })
  it('explains unknown timeout outcomes without erasing the diagnostic code', () => {
    expect(
      errorText('codex_cli_timeout_outcome_unknown', (_, en) => en),
    ).toContain('Do not retry blindly')
    expect(errorText('new_provider_code', (zh) => zh)).toBe('new_provider_code')
  })
  it('prefers the report, not array tail, for initial artifact selection', () => {
    const artifacts = [
      { id: 'report', kind: 'report', created_at: '2026-11-13' },
      { id: 'research', kind: 'research', created_at: '2026-11-12' },
    ] as Artifact[]
    expect(preferredArtifact(artifacts)?.id).toBe('report')
    expect(preferredArtifact(artifacts.slice(1))?.id).toBe('research')
    expect(preferredArtifact([])).toBeUndefined()
  })
  it('counts incomplete usage separately, including real zero-token reports', () => {
    const calls = [
      { input_tokens: null, output_tokens: null },
      { input_tokens: 0, output_tokens: 0 },
      { input_tokens: 9, output_tokens: 2 },
    ] as Call[]
    expect(usageSummary(calls)).toEqual({ knownTokens: 11, incomplete: 1 })
  })
  it('splits explicit files, handles Windows line endings, preserves path text', () => {
    expect(splitFiles(' README.md\r\nsrc/app.ts\nREADME.md\n\n')).toEqual([
      'README.md',
      'src/app.ts',
    ])
    expect(splitFiles('../secret')).toEqual(['../secret'])
  })
})

describe('workbench routing', () => {
  it('opens exact encoded task IDs and rejects malformed task paths', () => {
    expect(
      routeFromHash('#task/task%2F%E7%A0%94%E7%A9%B6?taskTab=work'),
    ).toEqual({ page: 'task', id: 'task/研究' })
    for (const hash of ['#task/', '#task/a/b', '#task/%xx'])
      expect(routeFromHash(hash).page).toBe('missing')
  })
  it.each(['', '#workbench', '#home', '#agent-work'])(
    'supports intentional work-list aliases: %s',
    (hash) => {
      expect(routeFromHash(hash)).toEqual({ page: 'work', id: '' })
    },
  )
  it('preserves old run and chat deep links', () => {
    expect(routeFromHash('#run/abc')).toEqual({ page: 'run', id: 'abc' })
    expect(routeFromHash('#chat/abc')).toEqual({ page: 'run', id: 'abc' })
    expect(routeFromHash('#project/xyz')).toEqual({
      page: 'project',
      id: 'xyz',
    })
  })
  it('does not silently route unfinished navigation to the dashboard', () => {
    expect(routeFromHash('#models').page).toBe('models')
    expect(routeFromHash('#not-implemented').page).toBe('missing')
  })
})

describe('development API origin boundary', () => {
  it('translates only the incoming same-origin browser request', () => {
    expect(
      forwardedOrigin(
        'http://127.0.0.1:5173',
        '127.0.0.1:5173',
        'http://127.0.0.1:4180',
      ),
    ).toBe('http://127.0.0.1:4180')
  })
  it.each([
    'https://evil.test',
    'null',
    'http://127.0.0.1:5174',
    'not a url',
    'http://127.0.0.1:5173/path',
    'http://user@127.0.0.1:5173',
  ])('preserves origins for backend rejection: %s', (origin) => {
    expect(
      forwardedOrigin(origin, '127.0.0.1:5173', 'http://127.0.0.1:4180'),
    ).toBe(origin)
  })
  it('does not add an absent origin', () => {
    expect(
      forwardedOrigin(undefined, '127.0.0.1:5173', 'http://127.0.0.1:4180'),
    ).toBeUndefined()
  })
})
