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
  revisionPreview: vi.fn(),
  publish: vi.fn(),
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
vi.mock('../src/workbench/task-plan-revisions', async () => ({
  ...(await vi.importActual<
    typeof import('../src/workbench/task-plan-revisions')
  >('../src/workbench/task-plan-revisions')),
  previewPlanRevision: (...args: any[]) => m.revisionPreview(...args),
  publishPlanRevision: (...args: any[]) => m.publish(...args),
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
  m.create.mockReset().mockImplementation(async (_parent, id) => ({
    request_id: id,
    state: 'applied',
  }))
  m.read.mockReset().mockRejectedValue(new ApiError(404, 'not_found'))
  m.revisionPreview.mockReset()
  m.publish.mockReset()
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

const revisionDefinition = {
  items: [
    {
      key: 'original-a',
      title: 'Original A',
      goal: 'Research source constraints',
      acceptance: 'Reviewed A',
      files: [],
      depends_on: [],
    },
    {
      key: 'original-b',
      title: 'Original B',
      goal: 'Verify source constraints',
      acceptance: 'Reviewed B',
      files: [],
      depends_on: ['original-a'],
    },
  ],
}
const revisionBaseline = {
  version: 1,
  parent_task_id: task.id,
  plan_hash: 'a'.repeat(64),
  definition: revisionDefinition,
  parent_snapshot: task,
  created_at: task.created_at,
  bindings: revisionDefinition.items.map((item) => ({
    key: item.key,
    task: {
      ...task,
      id: `task-${item.key}`,
      title: item.title,
      goal: item.goal,
      acceptance: item.acceptance,
    },
  })),
}
function revisionSetup() {
  props.baseline = structuredClone(revisionBaseline)
  props.revisionsEnabled = true
  props.currentPlanHash = revisionBaseline.plan_hash
  m.revisionPreview.mockImplementation(
    async (parent, baseline, definition) => ({
      schema_version: 2,
      unit: 'task_plan_revision_preview',
      parent_task_id: parent.id,
      expected_version: baseline.version,
      expected_plan_hash: baseline.plan_hash,
      baseline,
      parent_snapshot: parent,
      definition,
      preview_hash: 'b'.repeat(64),
      impact: {
        added_keys: [],
        replaced_keys: ['original-b'],
        reused_keys: ['original-a'],
        removed_keys: [],
        retired_task_ids: ['task-original-b'],
        blockers: [],
      },
    }),
  )
  m.publish.mockImplementation(async (_parent, id) => ({
    schema_version: 2,
    operation: 'revise',
    request_id: id,
    state: 'applied',
  }))
}
describe('Task plan revision controller', () => {
  it('opens a copy of the fixed baseline and keeps it through parent refresh and theme rerenders', async () => {
    revisionSetup()
    render()
    expect(m.inputs.map((input) => input.value)).toEqual([
      'Original A',
      'Original B',
    ])
    expect(m.preview).not.toHaveBeenCalled()
    expect(m.revisionPreview).not.toHaveBeenCalled()
    m.inputs[1].onChange('Edited B')
    render()
    props.baseline = {
      ...revisionBaseline,
      version: 2,
      definition: { items: [] },
    }
    render()
    expect(m.inputs[1].value).toBe('Edited B')
    await button('Review plan revision').onClick()
    await settle()
    expect(m.revisionPreview.mock.calls[0][1].version).toBe(1)
    expect(m.revisionPreview.mock.calls[0][2].items[1].title).toBe('Edited B')
  })
  it('previews authoritative categories and clears confirmation after another edit', async () => {
    revisionSetup()
    render()
    m.inputs[1].onChange('Edited B')
    render()
    await button('Review plan revision').onClick()
    await settle()
    expect(button('Confirm plan revision').disabled).toBe(true)
    m.checks.at(-1).onChange(true)
    render()
    expect(button('Confirm plan revision').disabled).toBe(false)
    m.areas[0].onChange('Changed goal with a downstream impact')
    render()
    expect(button('Confirm plan revision')).toBeUndefined()
    expect(m.guard.getState().dirty).toBe(true)
  })
  it('shows blockers and prevents even a retained confirmation handler from publishing', async () => {
    revisionSetup()
    const normal = m.revisionPreview.getMockImplementation()!
    m.revisionPreview.mockImplementation(async (...args) => {
      const preview = await normal(...args)
      preview.impact.blockers = [
        { task_id: 'task-original-b', reasons: ['prepared_coding'] },
      ]
      return preview
    })
    render()
    await button('Review plan revision').onClick()
    const html = await settleAndHtml()
    expect(html).toContain('Revision publication is blocked')
    expect(html).toContain('Prepared implementation')
    m.checks.at(-1).onChange(true)
    render()
    await button('Confirm plan revision').onClick()
    await settle()
    expect(m.publish).not.toHaveBeenCalled()
  })
  it('retains dirty edits and invalidates publication after a changed current hash', async () => {
    revisionSetup()
    render()
    m.inputs[1].onChange('Edited B')
    render()
    await button('Review plan revision').onClick()
    await settle()
    m.checks.at(-1).onChange(true)
    render()
    const staleSave = button('Confirm plan revision').onClick
    props.currentPlanHash = 'c'.repeat(64)
    render()
    expect(m.inputs[1].value).toBe('Edited B')
    expect(button('Confirm plan revision').disabled).toBe(true)
    await staleSave()
    await settle()
    expect(m.publish).not.toHaveBeenCalled()
  })
  it('preserves the original revision request after response loss and reload only reconciles GET', async () => {
    revisionSetup()
    m.publish.mockRejectedValueOnce(new Error('lost response'))
    render()
    m.inputs[1].onChange('Edited B')
    render()
    await button('Review plan revision').onClick()
    await settle()
    m.checks.at(-1).onChange(true)
    render()
    await button('Confirm plan revision').onClick()
    await settle()
    const id = m.publish.mock.calls[0][1]
    expect(m.guard.getState().busy).toBe(true)
    await button('Check original creation request').onClick()
    await settle()
    expect(m.read).toHaveBeenCalledWith(
      task.id,
      id,
      expect.any(AbortSignal),
      expect.objectContaining({ schema_version: 2, expected_version: 1 }),
    )
    expect(m.publish).toHaveBeenCalledOnce()
    expect(m.create).not.toHaveBeenCalled()
    expect(m.guard.getState().busy).toBe(true)
  })
  it('does not rebase a known revision conflict or discard input', async () => {
    revisionSetup()
    m.publish.mockRejectedValueOnce(
      new ApiError(409, 'task_plan_revision_conflict'),
    )
    render()
    m.inputs[1].onChange('Edited B')
    render()
    await button('Review plan revision').onClick()
    await settle()
    m.checks.at(-1).onChange(true)
    render()
    await button('Confirm plan revision').onClick()
    await settle()
    expect(m.inputs[1].value).toBe('Edited B')
    expect(props.onCreated).not.toHaveBeenCalled()
    expect(m.guard.getState().dirty).toBe(true)
    expect(m.guard.getState().busy).toBe(false)
    expect(m.revisionPreview).toHaveBeenCalledOnce()
  })
  it('reorders existing keys without silently renaming or dropping dependency edges', async () => {
    revisionSetup()
    render()
    m.buttons.filter((item) => item.label === 'Move subtask later')[0].onClick()
    render()
    expect(m.inputs.map((input) => input.value)).toEqual([
      'Original B',
      'Original A',
    ])
    await button('Review plan revision').onClick()
    await settle()
    expect(
      m.revisionPreview.mock.calls[0][2].items.map((item: any) => item.key),
    ).toEqual(['original-b', 'original-a'])
    expect(m.revisionPreview.mock.calls[0][2].items[0].depends_on).toEqual([
      'original-a',
    ])
  })
})

async function settleAndHtml() {
  await settle()
  return render()
}
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
