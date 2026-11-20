import { describe, expect, it } from 'vitest'
import type { Bootstrap, Project } from '../src/workbench/api'
import { filterTaskItems } from '../src/workbench/projections'
import { selectRuns } from '../src/workbench/state'
import {
  listLocationHref,
  readListLocation,
} from '../src/workbench/list-location'
import {
  projectWorkspaceLocation,
  workbenchProjectScope,
} from '../src/workbench/project-workspace'

const project: Project = {
  id: 'project-a',
  name: 'Project A',
  goal: 'Project goal',
  directory: 'project-a',
  notes: 'Allowed notes',
}

describe('fixed project workspace scope', () => {
  it('uses the route project instead of all or a conflicting URL filter', () => {
    for (const filter of ['all', 'project-b', 'missing']) {
      expect(workbenchProjectScope(filter, project)).toBe(project.id)
    }
    expect(workbenchProjectScope('all')).toBeUndefined()
    expect(workbenchProjectScope('project-b')).toBe('project-b')
  })

  it('keeps task and historical run counts scoped to the route project', () => {
    const data = {
      projects: [project, { ...project, id: 'project-b' }],
      tasks: [
        { id: 'task-a', project_id: 'project-a', title: 'Task A' },
        { id: 'task-b', project_id: 'project-b', title: 'Task B' },
      ],
      runs: [
        {
          id: 'old-a',
          task_id: 'task-a',
          status: 'failed',
          created_at: '2026-11-13',
        },
        {
          id: 'new-a',
          task_id: 'task-a',
          status: 'succeeded',
          created_at: '2026-11-14',
        },
        {
          id: 'other-b',
          task_id: 'task-b',
          status: 'running',
          created_at: '2026-11-14',
        },
      ],
    } as Bootstrap
    const scope = workbenchProjectScope('project-b', project)
    expect(
      filterTaskItems(data, '', 'all', scope).map((item) => item.id),
    ).toEqual(['task-a'])
    expect(selectRuns(data, '', 'all', scope).map((run) => run.id)).toEqual([
      'new-a',
      'old-a',
    ])
    expect(filterTaskItems(data, '', 'attention', scope)).toEqual([])
    expect(
      selectRuns(data, '', 'attention', scope).map((run) => run.id),
    ).toEqual(['old-a'])
    expect(data.runs[2].status).toBe('running')
  })

  it('locks URL patches to the route project while retaining shared query controls', () => {
    const patch = {
      project: 'project-b',
      query: 'task',
      filter: 'attention' as const,
      order: 'title:ascending',
      page: 2,
      pageSize: 50,
      view: 'table' as const,
    }
    expect(projectWorkspaceLocation(patch, project.id)).toEqual({
      ...patch,
      project: project.id,
      projects: undefined,
    })
    expect(
      projectWorkspaceLocation({ project: undefined, page: 1 }, project.id),
    ).toEqual({
      project: project.id,
      projects: undefined,
      page: 1,
    })
    expect(projectWorkspaceLocation(patch)).toBe(patch)
    expect(patch.project).toBe('project-b')
  })

  it('canonicalizes a normal view patch to the route scope while retaining all committed URL controls', () => {
    const href =
      'http://localhost/?source=shared&project=project-b#project/project-a?q=task+query&filter=attention&project=project-b&order=title%3Adescending&page=2&pageSize=50&view=list'
    const next = listLocationHref(
      href,
      projectWorkspaceLocation({ view: 'board', page: 1 }, project.id),
    )
    expect(readListLocation(`http://localhost${next}`)).toMatchObject({
      query: 'task query',
      filter: 'attention',
      project: project.id,
      order: 'title:descending',
      page: 1,
      pageSize: 50,
      view: 'board',
    })
    expect(new URL(next, 'http://localhost').searchParams.get('source')).toBe(
      'shared',
    )
  })

  it('does not fall back to global tasks or runs when a real route project has no tasks', () => {
    const emptyProject = { ...project, id: 'project-empty' }
    const data = {
      projects: [project, emptyProject],
      tasks: [
        { id: 'other-task', project_id: project.id, title: 'Other task' },
      ],
      runs: [
        {
          id: 'other-run',
          task_id: 'other-task',
          status: 'running',
          created_at: '2026-11-15',
        },
      ],
    } as Bootstrap
    const scope = workbenchProjectScope(project.id, emptyProject)
    expect(filterTaskItems(data, '', 'all', scope)).toEqual([])
    expect(selectRuns(data, '', 'all', scope)).toEqual([])
    expect(data.tasks).toHaveLength(1)
    expect(data.runs).toHaveLength(1)
  })

  it('preserves board pages for original presentation commands before injecting fixed scope', () => {
    const boardPages = JSON.stringify({
      pending: 2,
      active: 1,
      attention: 3,
      completed: 1,
      other: 1,
    })
    const href = `http://localhost/#project/project-a?view=board&boardPages=${encodeURIComponent(boardPages)}`
    for (const patch of [
      { view: 'list' as const, page: 1 },
      { mode: 'jql' as const },
      { order: 'title:ascending', pageSize: 100 },
    ]) {
      const next = listLocationHref(
        href,
        projectWorkspaceLocation(patch, project.id, boardPages),
      )
      expect(readListLocation(`http://localhost${next}`).boardPages).toBe(
        boardPages,
      )
    }
    const malformed = '{invalid}'
    expect(
      projectWorkspaceLocation({ mode: 'basic' }, project.id, malformed)
        .boardPages,
    ).toBe(malformed)
  })

  it('still resets board pages for original query changes and honors explicit page candidates', () => {
    const boardPages = JSON.stringify({
      pending: 2,
      active: 1,
      attention: 3,
      completed: 1,
      other: 1,
    })
    const href = `http://localhost/#project/project-a?boardPages=${encodeURIComponent(boardPages)}`
    for (const patch of [
      { query: 'new' },
      { states: ['attention' as const] },
      { projects: ['project-b'] },
      { jql: '' },
      { filter: 'all' as const },
    ]) {
      const next = listLocationHref(
        href,
        projectWorkspaceLocation(patch, project.id, boardPages),
      )
      expect(
        readListLocation(`http://localhost${next}`).boardPages,
      ).toBeUndefined()
    }
    expect(
      projectWorkspaceLocation({ boardPages }, project.id, '{invalid}')
        .boardPages,
    ).toBe(boardPages)
  })
})
