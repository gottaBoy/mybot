import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { CodingRunDialog } from '../src/workbench/CodingRunDialog'
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
  areas: [] as any[],
  selects: [] as any[],
  checkpointPicker: {} as any,
  dialog: {} as any,
  guard: {} as any,
  preview: vi.fn(),
  prepare: vi.fn(),
  apply: vi.fn(),
  read: vi.fn(),
  push: vi.fn(),
}))
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useState: (initial: any) => {
    const i = m.state++
    if (!(i in m.states))
      m.states[i] = typeof initial === 'function' ? initial() : initial
    return [
      m.states[i],
      (next: any) => {
        m.states[i] = typeof next === 'function' ? next(m.states[i]) : next
      },
    ]
  },
  useRef: (initial: any) => (m.refs[m.ref++] ??= { current: initial }),
  useEffect: (fn: any, deps: any[]) => {
    const i = m.effect++,
      before = m.effects[i]
    if (before && deps.every((v, k) => Object.is(v, before.deps[k]))) return
    m.pending.push(() => {
      before?.cleanup?.()
      m.effects[i] = { deps, cleanup: fn() }
    })
  },
}))
vi.mock('../src/components/ui', () => ({
  AppButton: (p: any) => {
    m.buttons.push(p)
    return createElement('button', { disabled: p.disabled }, p.label)
  },
  AppCheckbox: (p: any) => {
    m.checks.push(p)
    return createElement('input', {
      type: 'checkbox',
      checked: p.value,
      readOnly: true,
    })
  },
  AppDialog: (p: any) => {
    m.dialog = p
    return createElement('section', null, p.children)
  },
  AppNumber: () => null,
  AppSelect: (props: any) => {
    m.selects.push(props)
    return null
  },
  AppTextArea: (props: any) => {
    m.areas.push(props)
    return null
  },
}))
vi.mock('../src/workbench/CodingCheckpointPicker', () => ({
  CodingCheckpointPicker: (props: any) => {
    m.checkpointPicker = props
    return null
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
  pushWorkbenchNavigation: (...args: any[]) => m.push(...args),
  cancelWorkbenchNavigation: () => {},
  confirmWorkbenchNavigation: () => false,
}))
vi.mock('../src/workbench/coding', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/coding')>(
    '../src/workbench/coding',
  )),
  previewCoding: (...args: any[]) => m.preview(...args),
  prepareCoding: (...args: any[]) => m.prepare(...args),
  applyCoding: (...args: any[]) => m.apply(...args),
  fetchCoding: (...args: any[]) => m.read(...args),
}))
const candidate: any = {
  config: {
    model_id: 'model-a',
    writable: ['code.py'],
    tests: ['test_code.py'],
    max_rounds: 2,
    test_timeout: 10,
    max_output_tokens: 8192,
  },
  candidate_hash: 'a'.repeat(64),
  snapshot: {
    task_id: 'task-a',
    goal: 'Change source',
    acceptance: 'Tests pass',
    notes: '',
    files: [
      { path: 'code.py', content: '<script>unsafe()</script>', bytes: 25 },
    ],
    profile: 'python-unittest',
    model: {
      id: 'model-a',
      name: 'Model',
      model: 'm',
      kind: 'chat_completions',
      endpoint: 'http://127.0.0.1:9999/v1',
    },
  },
}
const job: any = {
  request_id: 'original-coding-id',
  task_id: 'task-a',
  candidate_hash: candidate.candidate_hash,
  state: 'prepared',
  run_id: null,
  created_at: '2026-11-25T00:00:00Z',
  candidate,
}
let props: any,
  html = ''
function render() {
  m.state = m.ref = m.effect = 0
  m.buttons = []
  m.checks = []
  m.areas = []
  m.selects = []
  m.checkpointPicker = {}
  html = renderToStaticMarkup(createElement(CodingRunDialog, props))
  for (const fn of m.pending.splice(0)) fn()
  return html
}
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    render()
  }
}
const button = (name: string) => m.buttons.find((b) => b.label === name)
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  m.preview.mockReset().mockResolvedValue(candidate)
  m.prepare
    .mockReset()
    .mockImplementation(async (_task, id) => ({ ...job, request_id: id }))
  m.apply.mockReset().mockImplementation(async (_task, prepared, action) => ({
    ...prepared,
    state: action === 'execute' ? 'applied' : 'discarded',
    run_id: action === 'execute' ? 'run-a' : null,
  }))
  m.read.mockReset().mockResolvedValue(job)
  m.push.mockReset().mockReturnValue(true)
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/#task/task-a' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  props = {
    task: { id: 'task-a', title: 'Task', files: ['code.py', 'test_code.py'] },
    models: [{ id: 'model-a' }],
    t: (_zh: string, en: string) => en,
    onClose: vi.fn(),
    onStarted: vi.fn(),
  }
})
afterEach(() => {
  for (const value of m.effects) value?.cleanup?.()
  vi.unstubAllGlobals()
})
describe('isolated coding confirmation', () => {
  it('requires explicit checkpoint and requirements before previewing continued code', async () => {
    props.continuationEnabled = true
    render()
    m.selects
      .find((select) => select.label === 'Implementation starting point')
      .onChange('checkpoint')
    render()
    await button('Review sources & test environment').onClick()
    await settle()
    expect(m.preview).not.toHaveBeenCalled()
    m.checkpointPicker.onChange({ id: 'checkpoint-a', sha256: 'c'.repeat(64) })
    render()
    m.areas
      .find((area) => area.label === 'Requirements for this implementation')
      .onChange('Fix remaining tests')
    render()
    await button('Review sources & test environment').onClick()
    await settle()
    expect(m.preview).toHaveBeenCalledWith(
      'task-a',
      expect.objectContaining({
        continuation: {
          checkpoint: { id: 'checkpoint-a', sha256: 'c'.repeat(64) },
          instruction: 'Fix remaining tests',
        },
      }),
      expect.any(AbortSignal),
    )
    expect(m.guard.getState().dirty).toBe(true)
  })
  it('blocks a hydrated continuation when its explicit capability is unavailable', async () => {
    props.initial = job.request_id
    m.read.mockResolvedValue({
      ...job,
      candidate: {
        ...candidate,
        config: {
          ...candidate.config,
          continuation: {
            checkpoint: { id: 'checkpoint-a', sha256: 'c'.repeat(64) },
            instruction: 'Continue',
          },
        },
        snapshot: {
          ...candidate.snapshot,
          continuation: {
            id: 'checkpoint-a',
            sha256: 'c'.repeat(64),
            run_id: 'source-run',
            round: 1,
            patch: 'Diff',
          },
        },
      },
    })
    render()
    await settle()
    m.checks[0].onChange(true)
    render()
    expect(button('Confirm implementation & tests').disabled).toBe(true)
    expect(html).toContain('This server does not admit code continuation')
    await button('Confirm implementation & tests').onClick()
    await settle()
    expect(m.apply).not.toHaveBeenCalled()
    await button('Discard this preparation').onClick()
    await settle()
    expect(m.apply).toHaveBeenCalledWith(
      'task-a',
      expect.anything(),
      'discard',
      expect.any(AbortSignal),
    )
  })
  it('closes an unchanged configuration without a discard confirmation', async () => {
    props.task.files = [
      'workbench/schemas.py',
      'tests/fixtures/coding_relative_path_case.py',
    ]
    render()
    await settle()
    expect(m.areas[0].value).toBe('workbench/schemas.py')
    expect(m.areas[1].value).toBe('tests/fixtures/coding_relative_path_case.py')
    m.dialog.onClose()
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
  it('preview is separate from execution, escapes code and requires consent', async () => {
    render()
    await button('Review sources & test environment').onClick()
    await settle()
    expect(m.prepare).not.toHaveBeenCalled()
    expect(m.apply).not.toHaveBeenCalled()
    expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;')
    expect(button('Confirm implementation & tests').disabled).toBe(true)
    m.checks[0].onChange(true)
    render()
    await button('Confirm implementation & tests').onClick()
    await settle()
    expect(m.prepare).toHaveBeenCalledTimes(1)
    expect(m.apply).toHaveBeenCalledTimes(1)
    expect(props.onStarted).toHaveBeenCalledWith('run-a')
  })
  it('lost preparation retains its original ID, locks close and GET never auto-executes', async () => {
    m.prepare.mockRejectedValueOnce(new Error('lost response'))
    render()
    await button('Review sources & test environment').onClick()
    await settle()
    m.checks[0].onChange(true)
    render()
    await button('Confirm implementation & tests').onClick()
    await settle()
    expect(m.dialog.busy).toBe(true)
    m.dialog.onClose()
    expect(props.onClose).not.toHaveBeenCalled()
    const id = m.prepare.mock.calls[0][1]
    m.read.mockResolvedValueOnce({ ...job, request_id: id })
    await button('Check original implementation').onClick()
    await settle()
    expect(m.read.mock.calls[0][1]).toBe(id)
    expect(m.apply).not.toHaveBeenCalled()
    expect(m.checks[0].value).toBe(false)
    expect(m.dialog.busy).toBe(false)
  })
  it('unknown execution reconciles original prepared identity without a second POST', async () => {
    m.apply.mockRejectedValueOnce(new Error('lost execution'))
    render()
    await button('Review sources & test environment').onClick()
    await settle()
    m.checks[0].onChange(true)
    render()
    await button('Confirm implementation & tests').onClick()
    await settle()
    const id = m.prepare.mock.calls[0][1]
    m.read.mockResolvedValueOnce({
      ...job,
      request_id: id,
      state: 'applied',
      run_id: 'run-a',
    })
    await button('Check original implementation').onClick()
    await settle()
    expect(m.apply).toHaveBeenCalledTimes(1)
    expect(props.onStarted).toHaveBeenCalledWith('run-a')
  })
  it('reload without original content keeps a404 unknown and does not prepare another candidate', async () => {
    props.initial = job.request_id
    m.read.mockRejectedValue(new ApiError(404, 'missing'))
    render()
    await settle()
    expect(m.dialog.busy).toBe(true)
    expect(m.prepare).not.toHaveBeenCalled()
    expect(m.apply).not.toHaveBeenCalled()
    expect(html).toContain('does not prove an in-flight write ended')
  })
  it('fresh persisted preparation needs new consent and can be explicitly discarded', async () => {
    props.initial = job.request_id
    render()
    await settle()
    expect(m.checks[0].value).toBe(false)
    expect(m.apply).not.toHaveBeenCalled()
    await button('Discard this preparation').onClick()
    await settle()
    expect(m.apply.mock.calls[0][2]).toBe('discard')
    expect(props.onClose).toHaveBeenCalled()
  })
})
