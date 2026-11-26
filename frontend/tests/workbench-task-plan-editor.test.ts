import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskPlanEditor } from '../src/workbench/TaskPlanEditor'
import { ApiError } from '../src/workbench/api'
const m = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  pending: [] as any[],
  state: 0,
  ref: 0,
  effect: 0,
  buttons: [] as any[],
  checks: [] as any[],
  inputs: [] as any[],
  areas: [] as any[],
  dialog: {} as any,
  guard: {} as any,
  preview: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
}))
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useState: (initial: any) => {
    const index = m.state++
    if (!(index in m.states))
      m.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      m.states[index],
      (next: any) => {
        m.states[index] =
          typeof next === 'function' ? next(m.states[index]) : next
      },
    ]
  },
  useRef: (initial: any) => (m.refs[m.ref++] ??= { current: initial }),
  useEffect: (fn: any, deps: any[]) => {
    const index = m.effect++,
      old = m.effects[index]
    if (old && deps.every((value, i) => Object.is(value, old.deps[i]))) return
    m.pending.push(() => {
      old?.cleanup?.()
      m.effects[index] = { deps, cleanup: fn() }
    })
  },
}))
vi.mock('../src/components/ui', () => ({
  AppButton: (props: any) => {
    m.buttons.push(props)
    return createElement('button', { disabled: props.disabled }, props.label)
  },
  AppCheckbox: (props: any) => {
    m.checks.push(props)
    return null
  },
  AppInput: (props: any) => {
    m.inputs.push(props)
    return null
  },
  AppTextArea: (props: any) => {
    m.areas.push(props)
    return null
  },
  AppDialog: (props: any) => {
    m.dialog = props
    return createElement('section', null, props.children)
  },
}))
vi.mock('../src/components/ui/DraftGuard', () => ({
  AppDraftGuard: () => null,
}))
vi.mock('../src/workbench/navigation-guard', () => ({
  registerWorkbenchNavigationBlocker: (guard: any) => {
    m.guard = guard
    return () => {}
  },
  cancelWorkbenchNavigation: () => {},
  confirmWorkbenchNavigation: () => false,
  pushWorkbenchNavigation: (...args: any[]) => m.push(...args),
}))
vi.mock('../src/workbench/task-plans', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/task-plans')>(
    '../src/workbench/task-plans',
  )),
  previewTaskPlan: (...args: any[]) => m.preview(...args),
  createTaskPlan: (...args: any[]) => m.create(...args),
  fetchPlanOperation: (...args: any[]) => m.read(...args),
}))
let props: any
const task = {
  id: 'parent-a',
  project_id: 'project-a',
  title: 'Parent',
  goal: 'Deliver research results',
  acceptance: 'Human reviewed',
  files: [],
  created_at: '2026-11-26T00:00:00Z',
}
function render() {
  m.state = m.ref = m.effect = 0
  m.buttons = []
  m.checks = []
  m.inputs = []
  m.areas = []
  const html = renderToStaticMarkup(createElement(TaskPlanEditor, props))
  for (const fn of m.pending.splice(0)) fn()
  return html
}
async function settle() {
  for (let index = 0; index < 6; index++) {
    await Promise.resolve()
    render()
  }
}
const button = (label: string) => m.buttons.find((item) => item.label === label)
function fill() {
  for (let index = 0; index < 2; index++) {
    m.inputs[index].onChange(`Work ${index + 1}`)
    render()
    m.areas[index * 2].onChange(`Analyze selected source ${index + 1}`)
    render()
    m.areas[index * 2 + 1].onChange('A reviewable final report')
    render()
  }
}
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  m.preview.mockReset().mockImplementation(async (parent, definition) => ({
    parent_snapshot: parent,
    definition,
    criterion: 'latest-successful-run-reviewed-reports-v1',
    preview_hash: 'a'.repeat(64),
  }))
  m.create
    .mockReset()
    .mockImplementation(async (_parent, id) => ({
      request_id: id,
      state: 'applied',
    }))
  m.read.mockReset().mockRejectedValue(new ApiError(404, 'not_found'))
  m.push.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/#task/parent-a' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  props = {
    task,
    enabled: true,
    t: (_zh: string, en: string) => en,
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }
})
afterEach(() => {
  for (const effect of m.effects) effect?.cleanup?.()
  vi.unstubAllGlobals()
})
describe('Task breakdown creation controller', () => {
  it('does not preview or mutate on open and closes pristine settings directly', () => {
    render()
    m.dialog.onClose()
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(m.preview).not.toHaveBeenCalled()
    expect(m.create).not.toHaveBeenCalled()
  })
  it('rejects empty and cyclic candidates before any request', async () => {
    render()
    await button('Review task breakdown').onClick()
    await settle()
    expect(m.preview).not.toHaveBeenCalled()
    fill()
    m.checks[0].onChange(true)
    render()
    m.checks[1].onChange(true)
    render()
    await button('Review task breakdown').onClick()
    await settle()
    expect(m.preview).not.toHaveBeenCalled()
  })
  it('binds confirmation to the reviewed candidate and revokes it after any edit', async () => {
    render()
    fill()
    await button('Review task breakdown').onClick()
    await settle()
    expect(button('Confirm subtask creation').disabled).toBe(true)
    m.checks.at(-1).onChange(true)
    render()
    expect(button('Confirm subtask creation').disabled).toBe(false)
    m.inputs[0].onChange('Changed title')
    render()
    expect(button('Confirm subtask creation')).toBeUndefined()
    expect(m.guard.getState().dirty).toBe(true)
  })
  it('retains unknown creation ID and only reconciles by GET after response loss', async () => {
    m.create.mockRejectedValueOnce(new Error('response lost'))
    render()
    fill()
    await button('Review task breakdown').onClick()
    await settle()
    m.checks.at(-1).onChange(true)
    render()
    await button('Confirm subtask creation').onClick()
    await settle()
    const id = m.create.mock.calls[0][1]
    expect(m.push.mock.calls[0][0]).toContain(`taskPlanRequest=${id}`)
    expect(m.guard.getState().busy).toBe(true)
    await button('Check original creation request').onClick()
    await settle()
    expect(m.read).toHaveBeenCalledWith(
      task.id,
      id,
      expect.any(AbortSignal),
      expect.objectContaining({ preview_hash: 'a'.repeat(64) }),
    )
    expect(m.create).toHaveBeenCalledOnce()
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(m.guard.getState().busy).toBe(true)
  })
  it('reload without the original draft stays locked on missing original receipt', async () => {
    props.initial = 'original-plan-request'
    render()
    await settle()
    expect(m.read).toHaveBeenCalledOnce()
    expect(m.create).not.toHaveBeenCalled()
    expect(m.guard.getState().busy).toBe(true)
    expect(button('Review task breakdown')).toBeUndefined()
  })
  it('known conflicts preserve edits without claiming creation or replacing a plan', async () => {
    m.create.mockRejectedValueOnce(
      new ApiError(409, 'task_plan_already_created'),
    )
    render()
    fill()
    await button('Review task breakdown').onClick()
    await settle()
    m.checks.at(-1).onChange(true)
    render()
    await button('Confirm subtask creation').onClick()
    await settle()
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(m.inputs[0].value).toBe('Work 1')
    expect(m.guard.getState().busy).toBe(false)
    expect(m.guard.getState().dirty).toBe(true)
  })
})
