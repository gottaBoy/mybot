import { describe, expect, it } from 'vitest'
import type { Bootstrap, Project, Task } from '../src/workbench/api'
import {
  projectDocumentView,
  reconcileDocumentSelection,
  selectDocumentProject,
} from '../src/workbench/documents-state'

function project(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    goal: `Goal ${id}`,
    directory: id,
    notes: `Notes ${id}`,
  }
}

function task(id: string, projectId: string, title: string): Task {
  return {
    id,
    project_id: projectId,
    title,
    goal: `Goal ${id}`,
    acceptance: `Acceptance ${id}`,
    files: [`${id}.md`],
  }
}

function fixture(): Pick<Bootstrap, 'projects' | 'tasks'> {
  return {
    projects: [project('p1'), project('p2')],
    tasks: [
      task('selected', 'p1', 'Connector research'),
      task('other', 'p1', 'Workflow design'),
      task('outside', 'p2', 'Connector elsewhere'),
    ],
  }
}

describe('project documents selection', () => {
  it('adopts the first real project after initially empty data arrives', () => {
    const initial = selectDocumentProject('')
    const empty = projectDocumentView({ projects: [], tasks: [] }, initial)
    expect(empty.project).toBeUndefined()
    expect(empty.selection).toBe(initial)
    expect(empty.navigationTasks).toEqual([])

    const data = fixture()
    const loaded = projectDocumentView(data, initial)
    expect(loaded.project?.id).toBe('p1')
    expect(loaded.selection).toEqual(selectDocumentProject('p1'))
    expect(loaded.content).toBe('notes')
    expect(initial.projectId).toBe('')
  })

  it('does not replace a valid chosen project when incoming projects reorder', () => {
    const data = fixture()
    const selection = selectDocumentProject('p2')
    data.projects.reverse()
    expect(reconcileDocumentSelection(data.projects, selection)).toBe(selection)
    expect(projectDocumentView(data, selection).project?.id).toBe('p2')
  })

  it('filters navigation without changing the selected task body', () => {
    const selection = {
      projectId: 'p1',
      chosenTask: 'selected',
      query: ' WORKFLOW ',
    }
    const view = projectDocumentView(fixture(), selection)
    expect(view.projectTasks.map((item) => item.id)).toEqual([
      'selected',
      'other',
    ])
    expect(view.navigationTasks.map((item) => item.id)).toEqual(['other'])
    expect(view.current?.id).toBe('selected')
    expect(view.current?.goal).toBe('Goal selected')
    expect(view.content).toBe('task')
    expect(view.selection).toBe(selection)
  })

  it('keeps the selected body even when the directory has no query matches', () => {
    const view = projectDocumentView(fixture(), {
      projectId: 'p1',
      chosenTask: 'selected',
      query: 'no matches',
    })
    expect(view.navigationTasks).toEqual([])
    expect(view.current?.id).toBe('selected')
    expect(view.content).toBe('task')
  })

  it('searches project task titles and acceptance but never another project', () => {
    const view = projectDocumentView(fixture(), {
      projectId: 'p1',
      chosenTask: null,
      query: 'ACCEPTANCE SELECTED',
    })
    expect(view.navigationTasks.map((item) => item.id)).toEqual(['selected'])
    expect(view.current).toBeUndefined()
    expect(view.content).toBe('notes')
    expect(
      projectDocumentView(fixture(), {
        ...view.selection,
        query: 'elsewhere',
      }).navigationTasks,
    ).toEqual([])
  })

  it('clears the query and chosen task only on an explicit project change', () => {
    const before = {
      projectId: 'p1',
      chosenTask: 'selected',
      query: 'workflow',
    }
    const next = selectDocumentProject('p2')
    expect(next).toEqual({
      projectId: 'p2',
      chosenTask: null,
      query: '',
    })
    expect(projectDocumentView(fixture(), next).content).toBe('notes')
    expect(before.chosenTask).toBe('selected')
    expect(before.query).toBe('workflow')
  })

  it('marks a missing selected task unavailable instead of showing project notes', () => {
    const data = fixture()
    data.tasks = data.tasks.filter((item) => item.id !== 'selected')
    const view = projectDocumentView(data, {
      projectId: 'p1',
      chosenTask: 'selected',
      query: '',
    })
    expect(view.project?.notes).toBe('Notes p1')
    expect(view.current).toBeUndefined()
    expect(view.content).toBe('unavailable')
    expect(view.selection.chosenTask).toBe('selected')
  })

  it('does not select a task moved to or requested from another project', () => {
    const data = fixture()
    data.tasks[0].project_id = 'p2'
    for (const chosenTask of ['selected', 'outside']) {
      const view = projectDocumentView(data, {
        projectId: 'p1',
        chosenTask,
        query: '',
      })
      expect(view.current).toBeUndefined()
      expect(view.content).toBe('unavailable')
      expect(view.navigationTasks.map((item) => item.id)).toEqual(['other'])
    }
  })

  it('falls back to a remaining project but does not silently replace lost task selection', () => {
    const data = fixture()
    data.projects = [data.projects[1]]
    const requested = {
      projectId: 'p1',
      chosenTask: 'selected',
      query: 'connector',
    }
    const view = projectDocumentView(data, requested)
    expect(view.project?.id).toBe('p2')
    expect(view.selection).toEqual({
      ...requested,
      projectId: 'p2',
      chosenTaskProjectId: 'p1',
    })
    expect(view.current).toBeUndefined()
    expect(view.content).toBe('unavailable')
    expect(view.navigationTasks.map((item) => item.id)).toEqual(['outside'])
  })

  it('does not activate a moved task when its original project disappears', () => {
    const data = fixture()
    data.tasks[0].project_id = 'p2'
    data.projects = [data.projects[1]]
    const next = reconcileDocumentSelection(data.projects, {
      projectId: 'p1',
      chosenTask: 'selected',
      query: '',
    })
    const view = projectDocumentView(data, next)
    expect(view.project?.id).toBe('p2')
    expect(view.projectTasks.map((item) => item.id)).toContain('selected')
    expect(view.current).toBeUndefined()
    expect(view.content).toBe('unavailable')
    expect(next.chosenTaskProjectId).toBe('p1')
  })

  it('keeps missing selection explicit when all projects disappear and later return', () => {
    const selection = {
      projectId: 'p1',
      chosenTask: 'selected',
      query: 'research',
    }
    const missing = projectDocumentView(
      { projects: [], tasks: fixture().tasks },
      selection,
    )
    expect(missing.project).toBeUndefined()
    expect(missing.projectTasks).toEqual([])
    expect(missing.current).toBeUndefined()
    expect(missing.content).toBe('unavailable')
    expect(missing.selection).toBe(selection)
    expect(projectDocumentView(fixture(), selection).current?.id).toBe(
      'selected',
    )
  })

  it('distinguishes the notes view from a real task whose ID is notes', () => {
    const data = fixture()
    data.tasks.push(task('notes', 'p1', 'Task named notes'))
    expect(projectDocumentView(data, selectDocumentProject('p1')).content).toBe(
      'notes',
    )
    const view = projectDocumentView(data, {
      ...selectDocumentProject('p1'),
      chosenTask: 'notes',
    })
    expect(view.content).toBe('task')
    expect(view.current?.title).toBe('Task named notes')
  })

  it('does not mutate project data, task data or selection', () => {
    const data = fixture()
    const selection = {
      projectId: 'missing-project',
      chosenTask: 'selected',
      query: 'CONNECTOR',
    }
    const before = structuredClone({ data, selection })
    function freeze(value: unknown): void {
      if (!value || typeof value !== 'object') return
      Object.freeze(value)
      Object.values(value).forEach(freeze)
    }
    freeze(data)
    freeze(selection)
    projectDocumentView(data, selection)
    expect({ data, selection }).toEqual(before)
  })
})
