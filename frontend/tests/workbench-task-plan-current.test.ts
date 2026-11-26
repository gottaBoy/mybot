import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTaskPlan } from '../src/workbench/useTaskPlan'

const m = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  pending: [] as any[],
  state: 0,
  ref: 0,
  effect: 0,
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
const child = {
  schema_version: 2,
  unit: 'task_plan',
  task_id: 'child-a',
  parent: { task_id: 'parent-a', title: 'Parent' },
  plan: null,
  gate: {
    task_id: 'child-a',
    parent_task_id: 'parent-a',
    plan_hash: 'a'.repeat(64),
    criterion: 'latest-successful-run-reviewed-reports-v1',
    ready: true,
    prerequisites: [],
    plan_version: 2,
    membership: 'current',
  },
}
let capability: boolean | undefined
function render() {
  m.state = m.ref = m.effect = 0
  const result = useTaskPlan('child-a', true, 1, capability)
  for (const effect of m.pending.splice(0)) effect()
  return result
}
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return render()
}
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  capability = true
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(JSON.stringify(child))),
  )
})
afterEach(() => {
  for (const effect of m.effects) effect?.cleanup?.()
  vi.unstubAllGlobals()
})
describe('explicit current plan revision admission', () => {
  it.each([undefined, false])(
    'does not surface schema2 or permit execution without explicit capability: %j',
    async (value) => {
      capability = value
      render()
      const result = await settle()
      expect(result.value).toBeUndefined()
      expect(result.error).toBe('read_failed')
      expect(result.blocked).toBe(true)
    },
  )
  it('immediately hides the admitted projection and blocks execution when capability is lost', async () => {
    render()
    const admitted = await settle()
    expect(admitted.value).toEqual(child)
    expect(admitted.blocked).toBe(false)
    capability = false
    const changed = render()
    expect(changed.value).toBeUndefined()
    expect(changed.busy).toBe(true)
    expect(changed.blocked).toBe(true)
    const rejected = await settle()
    expect(rejected.value).toBeUndefined()
    expect(rejected.error).toBe('read_failed')
    expect(rejected.blocked).toBe(true)
  })
})
