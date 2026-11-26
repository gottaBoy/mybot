import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskPlanHistory } from '../src/workbench/TaskPlanHistory'
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
  read: vi.fn(),
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
  AppLoading: ({ label }: any) => createElement('p', { role: 'status' }, label),
}))
vi.mock('../src/workbench/task-plan-revisions', () => ({
  fetchPlanVersions: (...args: any[]) => m.read(...args),
}))
let props: any
function render() {
  m.state = m.ref = m.effect = 0
  m.buttons = []
  const html = renderToStaticMarkup(createElement(TaskPlanHistory, props))
  for (const effect of m.pending.splice(0)) effect()
  return html
}
async function settle() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    render()
  }
  return render()
}
const version = {
  version: 1,
  created_at: '2026-11-27T00:00:00Z',
  plan_hash: 'a'.repeat(64),
  definition: { items: [{ key: 'a', depends_on: [] }] },
  bindings: [
    {
      key: 'a',
      task: {
        id: 'historical-child',
        title: 'Historical goal',
        goal: 'Frozen task goal',
        acceptance: 'Frozen acceptance',
        files: ['README.md'],
      },
    },
  ],
}
const page = {
  page: 1,
  total: 1,
  total_pages: 1,
  has_more: false,
  items: [version],
}
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  m.read.mockReset().mockResolvedValue(page)
  props = {
    taskId: 'parent-a',
    currentHash: 'a'.repeat(64),
    enabled: true,
    t: (_zh: string, en: string) => en,
  }
})
afterEach(() => {
  for (const effect of m.effects) effect?.cleanup?.()
})
describe('read-only plan version history', () => {
  it('reads only when presented and displays frozen Task fields without live acceptance claims', async () => {
    expect(m.read).not.toHaveBeenCalled()
    expect(render()).toContain('Loading version history')
    const html = await settle()
    expect(m.read).toHaveBeenCalledWith(
      'parent-a',
      1,
      expect.any(AbortSignal),
      true,
    )
    expect(html).toContain('Historical goal')
    expect(html).toContain('Frozen acceptance')
    expect(html).toContain('Frozen tasks and dependencies')
    expect(html).not.toContain('Latest report accepted')
    expect(
      m.buttons.find((button) => button.label === 'Next versions').disabled,
    ).toBe(true)
  })
  it('hides snapshots and aborts history reads immediately after revision capability loss', async () => {
    render()
    await settle()
    const signal = m.read.mock.calls[0][2]
    props.enabled = false
    const html = render()
    expect(html).toContain('This server does not provide plan version history')
    expect(html).not.toContain('Historical goal')
    expect(signal.aborted).toBe(true)
    await settle()
    expect(m.read).toHaveBeenCalledOnce()
  })
  it('does not let a late response from another parent replace the current history', async () => {
    let finish: ((value: any) => void) | undefined
    m.read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render()
    const originalSignal = m.read.mock.calls[0][2]
    props.taskId = 'parent-b'
    m.read.mockResolvedValue({ ...page, items: [{ ...version, bindings: [] }] })
    render()
    await settle()
    expect(originalSignal.aborted).toBe(true)
    finish?.(page)
    const html = await settle()
    expect(html).not.toContain('Historical goal')
  })
  it('hides previous private history after a forbidden refresh and retries only explicitly', async () => {
    render()
    await settle()
    m.read.mockRejectedValue(new ApiError(403, 'forbidden'))
    m.buttons
      .find((button) => button.label === 'Refresh version history')
      .onClick()
    render()
    const html = await settle()
    expect(html).toContain('Version history could not be read')
    expect(html).not.toContain('Frozen task goal')
    expect(m.read).toHaveBeenCalledTimes(2)
    await settle()
    expect(m.read).toHaveBeenCalledTimes(2)
    m.buttons
      .find((button) => button.label === 'Retry version history')
      .onClick()
    render()
    await settle()
    expect(m.read).toHaveBeenCalledTimes(3)
  })
})
