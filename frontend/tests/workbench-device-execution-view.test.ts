import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  PairedDeviceExecution,
  OwnerDeviceExecution,
  ExecutionFacts,
} from '../src/workbench/DeviceExecution'
import { ApiError } from '../src/workbench/api'
import { DeviceResponseError } from '../src/workbench/devices'

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
  dialog: {} as any,
  read: vi.fn(),
  execute: vi.fn(),
  owner: vi.fn(),
  send: vi.fn(),
  operation: vi.fn(),
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
  AppButton: (props: any) => {
    m.buttons.push(props)
    return createElement('button', { disabled: props.disabled }, props.label)
  },
  AppCheckbox: (props: any) => {
    m.checks.push(props)
    return createElement('input', {
      type: 'checkbox',
      checked: props.value,
      readOnly: true,
    })
  },
  AppBadge: ({ children }: any) => createElement('span', null, children),
  AppLoading: ({ label }: any) => createElement('p', null, label),
  AppDialog: (props: any) => {
    m.dialog = props
    return createElement('section', null, props.children)
  },
}))
vi.mock('../src/workbench/devices', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/devices')>(
    '../src/workbench/devices',
  )),
  fetchScopedExecution: (...args: any[]) => m.read(...args),
  executeDeviceGrant: (...args: any[]) => m.execute(...args),
  fetchOwnerExecution: (...args: any[]) => m.owner(...args),
  sendExecutionCommand: (...args: any[]) => m.send(...args),
  fetchExecutionOperation: (...args: any[]) => m.operation(...args),
}))
const device: any = {
  id: 'device-a',
  task_id: 'task-a',
  name: 'Phone',
  revision: 1,
  revoked_at: null,
  expires_at: '2099-01-01T00:00:00Z',
}
const grant: any = {
  id: 'grant-original',
  device_id: device.id,
  task_id: device.task_id,
  turn_id: 'turn-a',
  turn_request_id: 'request-original',
  candidate_hash: 'a'.repeat(64),
  context_hash: 'b'.repeat(64),
  content: 'Exact message',
  resources: {
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
  },
  models: [
    {
      role: 'coordinator_model',
      id: 'model-a',
      name: 'Model',
      model: 'model',
      kind: 'chat_completions',
    },
  ],
  source_count: 1,
  source_bytes: 100,
  workflow_version: null,
  created_at: '2098-01-01T00:00:00Z',
  expires_at: '2099-01-01T00:00:00Z',
  revoked_at: null,
  revision: 1,
  state: 'authorized',
  run_id: null,
}
let props: any,
  ownerProps: any,
  html = ''
let component: any = PairedDeviceExecution
function render() {
  m.state = m.ref = m.effect = 0
  m.buttons = []
  m.checks = []
  html = renderToStaticMarkup(
    createElement(
      component,
      component === PairedDeviceExecution ? props : ownerProps,
    ),
  )
  for (const fn of m.pending.splice(0)) fn()
  return html
}
async function settle() {
  for (let i = 0; i < 7; i++) {
    await Promise.resolve()
    render()
  }
}
const button = (label: string) => m.buttons.find((v) => v.label === label)
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  m.read.mockReset().mockResolvedValue({ grant })
  m.execute.mockReset().mockResolvedValue({
    grant: { ...grant, state: 'applied', run_id: 'run-a' },
  })
  m.owner.mockReset().mockResolvedValue({
    schema_version: 1,
    device,
    prepared: grant,
    grant: null,
  })
  m.send.mockReset().mockResolvedValue({ grant })
  m.operation.mockReset().mockResolvedValue({ grant })
  component = PairedDeviceExecution
  props = {
    device,
    revision: 1,
    blocked: false,
    t: (_zh: string, en: string) => en,
    stamp: vi.fn().mockReturnValue(true),
    lock: vi.fn(),
    failure: vi.fn(),
  }
  ownerProps = {
    deviceId: device.id,
    t: props.t,
    stamp: vi.fn().mockReturnValue(true),
    close: vi.fn(),
  }
})
afterEach(() => {
  for (const v of m.effects) v?.cleanup?.()
  vi.unstubAllGlobals()
})
describe('paired exact execution confirmation', () => {
  it('retains the configured Codex limit distinction', () => {
    const result = renderToStaticMarkup(
      createElement(ExecutionFacts, {
        value: {
          ...grant,
          models: grant.models.map((model: any) => ({
            ...model,
            kind: 'codex_cli',
          })),
        },
        t: props.t,
      }),
    )
    expect(result).toContain('not a CLI hard ceiling')
  })
  it('only GETs on mount and requires fresh consent before one execution', async () => {
    render()
    await settle()
    expect(m.execute).not.toHaveBeenCalled()
    expect(button('Confirm delegated run').disabled).toBe(true)
    m.checks[0].onChange(true)
    render()
    expect(props.lock).toHaveBeenLastCalledWith(true)
    await button('Confirm delegated run').onClick()
    await settle()
    expect(m.execute).toHaveBeenCalledTimes(1)
    expect(props.stamp.mock.calls).toEqual([['grant-original'], []])
    expect(html).toContain('Queued')
  })
  it('keeps the original unknown grant, no second POST, and reconciles by GET', async () => {
    m.execute.mockRejectedValueOnce(new Error('lost response'))
    render()
    await settle()
    m.checks[0].onChange(true)
    render()
    await button('Confirm delegated run').onClick()
    await settle()
    expect(html).toContain('Original execution grant pending')
    expect(props.lock).toHaveBeenLastCalledWith(true)
    m.read.mockResolvedValueOnce({
      grant: { ...grant, state: 'applied', run_id: 'run-a' },
    })
    await button('Check original execution').onClick()
    await settle()
    expect(m.execute).toHaveBeenCalledTimes(1)
    expect(m.read.mock.calls.at(-1)[1]).toBe('grant-original')
    expect(html).toContain('It was not repeated.')
  })
  it('reload with unknown original ID GET404 stays locked and never executes', async () => {
    props.pendingId = 'grant-original'
    m.read.mockRejectedValue(new ApiError(404, 'missing'))
    render()
    await settle()
    await button('Check original execution').onClick()
    await settle()
    expect(props.lock).toHaveBeenLastCalledWith(true)
    expect(props.stamp).not.toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('invalid execute receipt stays unknown and does not clear its marker', async () => {
    m.execute.mockRejectedValueOnce(new DeviceResponseError())
    render()
    await settle()
    m.checks[0].onChange(true)
    render()
    await button('Confirm delegated run').onClick()
    await settle()
    expect(props.failure).not.toHaveBeenCalled()
    expect(props.stamp.mock.calls).toEqual([['grant-original']])
    expect(html).toContain('receipt is invalid')
    expect(props.lock).toHaveBeenLastCalledWith(true)
  })
  it('revoked authorization clears through scope failure', async () => {
    m.read.mockRejectedValue(new ApiError(401, 'revoked'))
    render()
    await settle()
    expect(props.failure).toHaveBeenCalled()
    expect(m.execute).not.toHaveBeenCalled()
  })
  it('refresh revokes old consent and never retries a failed GET automatically', async () => {
    render()
    await settle()
    m.checks[0].onChange(true)
    render()
    props = { ...props, revision: 2 }
    render()
    await settle()
    expect(m.checks[0].value).toBe(false)
    m.read.mockRejectedValueOnce(new ApiError(503, 'offline'))
    button('Refresh execution grant').onClick()
    await settle()
    const calls = m.read.mock.calls.length
    props = { ...props, revision: 3 }
    render()
    await settle()
    expect(m.read).toHaveBeenCalledTimes(calls)
  })
})
describe('owner grant confirmation', () => {
  it('requires consent, preserves exact unknown operation and locks close', async () => {
    component = OwnerDeviceExecution
    m.send.mockRejectedValueOnce(new Error('lost write'))
    render()
    await settle()
    expect(m.send).not.toHaveBeenCalled()
    m.checks[0].onChange(true)
    render()
    await button('Confirm single-use execution grant').onClick()
    await settle()
    expect(m.send).toHaveBeenCalledTimes(1)
    expect(m.dialog.busy).toBe(true)
    m.dialog.onClose()
    expect(ownerProps.close).not.toHaveBeenCalled()
    await button('Check original delegation').onClick()
    await settle()
    expect(m.operation).toHaveBeenCalledTimes(1)
    expect(m.send).toHaveBeenCalledTimes(1)
    expect(m.dialog.busy).toBe(false)
  })
  it('reload operation404 stays locked without inventing a new candidate', async () => {
    component = OwnerDeviceExecution
    ownerProps.operationId = 'original-operation'
    m.operation.mockRejectedValue(new ApiError(404, 'missing'))
    render()
    await settle()
    await button('Check original delegation').onClick()
    await settle()
    expect(m.dialog.busy).toBe(true)
    expect(m.send).not.toHaveBeenCalled()
    expect(ownerProps.stamp).not.toHaveBeenCalled()
  })
})
