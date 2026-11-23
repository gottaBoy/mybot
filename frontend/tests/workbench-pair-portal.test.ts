import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/workbench/api'
import {
  PairPortal,
  readPairPortalLocation,
  portalReceiptMatchesDevice,
} from '../src/workbench/PairPortal'

const mocks = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  pending: [] as Array<() => void>,
  stateIndex: 0,
  refIndex: 0,
  effectIndex: 0,
  buttons: [] as Record<string, any>[],
  fields: [] as Record<string, any>[],
  guard: undefined as Record<string, any> | undefined,
  discard: undefined as Record<string, any> | undefined,
  fetchSession: vi.fn(),
  fetchTask: vi.fn(),
  fetchEvents: vi.fn(),
  claim: vi.fn(),
  save: vi.fn(),
  receipt: vi.fn(),
  logout: vi.fn(),
  push: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
}))
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof import('react')>('react')),
  useState: (initial: any) => {
    const index = mocks.stateIndex++
    if (!(index in mocks.states))
      mocks.states[index] = typeof initial === 'function' ? initial() : initial
    return [
      mocks.states[index],
      (value: any) => {
        mocks.states[index] =
          typeof value === 'function' ? value(mocks.states[index]) : value
      },
    ]
  },
  useRef: (initial: any) => {
    const index = mocks.refIndex++
    mocks.refs[index] ??= { current: initial }
    return mocks.refs[index]
  },
  useEffect: (effect: () => void | (() => void), dependencies?: unknown[]) => {
    const index = mocks.effectIndex++,
      before = mocks.effects[index]
    if (
      before &&
      dependencies &&
      before.dependencies &&
      dependencies.length === before.dependencies.length &&
      dependencies.every((value, key) =>
        Object.is(value, before.dependencies[key]),
      )
    )
      return
    mocks.pending.push(() => {
      before?.cleanup?.()
      mocks.effects[index] = { dependencies, cleanup: effect() }
    })
  },
}))
vi.mock('../src/components/ui', () => {
  const field = (kind: string) => (props: any) => {
    mocks.fields.push({ ...props, kind })
    return createElement(kind === 'textarea' ? 'textarea' : 'input', {
      'aria-label': props.label,
      value: props.value,
      readOnly: true,
      disabled: props.isDisabled ?? props.disabled,
    })
  }
  return {
    AppTheme: ({ children }: { children: ReactNode }) =>
      createElement('div', null, children),
    AppBadge: ({ children }: { children: ReactNode }) =>
      createElement('span', null, children),
    AppInput: field('input'),
    AppTextArea: field('textarea'),
    AppSelect: field('select'),
    AppButton: (props: any) => {
      mocks.buttons.push(props)
      return createElement(
        'button',
        { disabled: props.disabled || props.busy, 'aria-label': props.label },
        props.label,
      )
    },
    AppLoading: ({ label }: { label: string }) =>
      createElement('p', { role: 'status' }, label),
    AppDialog: ({ children, title }: { children: ReactNode; title: string }) =>
      createElement('div', { role: 'dialog', 'aria-label': title }, children),
  }
})
vi.mock('../src/components/ui/DraftGuard', () => ({
  AppDraftGuard: (props: any) => {
    mocks.discard = props
    return createElement('div', { role: 'dialog' }, props.title)
  },
}))
vi.mock('../src/workbench/navigation-guard', () => ({
  registerWorkbenchNavigationBlocker: (props: any) => {
    mocks.guard = props
    return () => {
      if (mocks.guard === props) mocks.guard = undefined
    }
  },
  pushWorkbenchNavigation: (...args: any[]) => mocks.push(...args),
  cancelWorkbenchNavigation: () => mocks.cancel(),
  confirmWorkbenchNavigation: () => mocks.confirm(),
}))
vi.mock('../src/workbench/devices', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/devices')>(
    '../src/workbench/devices',
  )),
  fetchDeviceSession: (...args: any[]) => mocks.fetchSession(...args),
  fetchPairedTask: (...args: any[]) => mocks.fetchTask(...args),
  fetchDeviceEvents: (...args: any[]) => mocks.fetchEvents(...args),
  claimDevice: (...args: any[]) => mocks.claim(...args),
  saveDeviceMessage: (...args: any[]) => mocks.save(...args),
  fetchDeviceMessage: (...args: any[]) => mocks.receipt(...args),
  logoutDevice: (...args: any[]) => mocks.logout(...args),
}))
const device = {
  id: 'device-1',
  name: 'Paired phone',
  task_id: 'task-1',
  pairing_id: 'pair-request-123',
  claim_request_id: 'claim-request-123',
  scopes: ['task_read', 'message_save'] as ['task_read', 'message_save'],
  created_at: '2026-11-23T00:00:00Z',
  expires_at: '2026-12-23T00:00:00Z',
  revoked_at: null,
  revision: 1,
}
const task = () => ({
  schema_version: 1,
  device_id: device.id,
  task: {
    id: device.task_id,
    title: 'Only this task',
    goal: 'Preserved original goal.',
    acceptance: 'Read-only proposal.',
  },
  latest_run: {
    id: 'run-1',
    task_id: device.task_id,
    status: 'succeeded',
    created_at: device.created_at,
  },
  messages: { items: [], total: 0 },
  report: {
    id: 'report-1',
    run_id: 'run-1',
    title: 'Actual report',
    content: 'Verifiable output.',
    decision: 'pending',
    truncated: false,
  },
  cursor: 7,
})
let storage: Map<string, string>
let markup = ''
function render() {
  mocks.stateIndex = mocks.refIndex = mocks.effectIndex = 0
  mocks.buttons = []
  mocks.fields = []
  mocks.discard = undefined
  markup = renderToStaticMarkup(createElement(PairPortal))
  for (const effect of mocks.pending.splice(0)) effect()
  return markup
}
async function settle() {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve()
    render()
  }
  return markup
}
const button = (label: string) => {
  const result = mocks.buttons.find((item) => item.label === label)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
const field = (label: string) => {
  const result = mocks.fields.find((item) => item.label === label)
  if (!result) throw new Error(`Missing field: ${label}`)
  return result
}
beforeEach(() => {
  vi.useFakeTimers()
  mocks.states = []
  mocks.refs = []
  mocks.effects = []
  mocks.pending = []
  mocks.guard = undefined
  mocks.fetchSession
    .mockReset()
    .mockResolvedValue({ schema_version: 1, device: null })
  mocks.fetchTask.mockReset().mockResolvedValue(task())
  mocks.fetchEvents.mockReset().mockResolvedValue({ items: [], next_cursor: 7 })
  mocks.claim.mockReset().mockResolvedValue(device)
  mocks.save.mockReset().mockResolvedValue({})
  mocks.receipt.mockReset().mockResolvedValue({})
  mocks.logout.mockReset().mockResolvedValue(undefined)
  mocks.push.mockReset().mockImplementation((href: string) => {
    window.location.href = new URL(href, window.location.href).href
    return true
  })
  storage = new Map([['mybot.locale', 'en']])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/#pair' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  })
  vi.stubGlobal('document', { hidden: false })
})
afterEach(() => {
  for (const effect of mocks.effects) effect?.cleanup?.()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PairPortal URL and immutable device identity', () => {
  it('keeps only finite nonsensitive unresolved request IDs', () => {
    expect(
      readPairPortalLocation(
        'http://localhost/#pair?deviceClaim=claim-request-123',
      ),
    ).toEqual({ claimId: 'claim-request-123', sendId: undefined })
    expect(
      readPairPortalLocation(
        'http://localhost/#pair?deviceSend=message-request-123',
      ),
    ).toEqual({ claimId: undefined, sendId: 'message-request-123' })
    for (const query of [
      'deviceSend=bad',
      'deviceSend=message-request-123&deviceClaim=claim-request-123',
      'deviceSend=message-request-123&deviceSend=another-request',
    ])
      expect(readPairPortalLocation(`http://localhost/#pair?${query}`)).toEqual(
        { error: true },
      )
  })
  it('never equates a changed task or claim identity with the known device', () => {
    expect(portalReceiptMatchesDevice(device, device)).toBe(true)
    expect(
      portalReceiptMatchesDevice({ ...device, task_id: 'task-2' }, device),
    ).toBe(false)
    expect(
      portalReceiptMatchesDevice(
        { ...device, claim_request_id: 'claim-other' },
        device,
      ),
    ).toBe(false)
  })
})
describe('PairPortal scoped workflow', () => {
  it('reads only the device session before showing pairing and stores appearance only', async () => {
    render()
    await settle()
    expect(markup).toContain('Pair device')
    expect(mocks.fetchSession).toHaveBeenCalledTimes(1)
    expect(mocks.fetchTask).not.toHaveBeenCalled()
    expect([...storage.keys()].sort()).toEqual([
      'mybot.locale',
      'mybot.mode',
      'mybot.style',
    ])
  })
  it('treats failed initial session reads as errors instead of an unpaired browser', async () => {
    mocks.fetchSession.mockRejectedValueOnce(new ApiError(0, 'Disconnected'))
    render()
    await settle()
    expect(markup).toContain('Device session unavailable')
    expect(mocks.buttons.some((item) => item.label === 'Pair device')).toBe(
      false,
    )
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device: null })
    button('Retry device session').onClick()
    render()
    await settle()
    expect(markup).toContain('Pair device')
  })
  it('loads the scoped task, real report and messages without owner execution controls', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    render()
    await settle()
    expect(markup).toContain('Only this task')
    expect(markup).toContain('Verifiable output.')
    expect(markup).toContain('Awaiting human review')
    expect(
      mocks.buttons.some((item) =>
        /start run|preview|publish/i.test(item.label),
      ),
    ).toBe(false)
    expect(mocks.fetchTask).toHaveBeenCalledWith(
      device,
      expect.any(AbortSignal),
    )
  })
  it('preserves an unsaved requirement during a theme change and protects navigation', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    render()
    await settle()
    field('Supplemental requirements').onChange('Unsaved request')
    render()
    field('Style').onChange('zira')
    render()
    expect(field('Supplemental requirements').value).toBe('Unsaved request')
    expect(mocks.guard?.getState()).toEqual({ dirty: true, busy: false })
    expect(mocks.save).not.toHaveBeenCalled()
    expect(storage.get('mybot.style')).toBe('zira')
    expect([...storage.values()]).not.toContain('Unsaved request')
    mocks.guard!.onBlocked()
    render()
    mocks.discard!.onKeep()
    expect(field('Supplemental requirements').value).toBe('Unsaved request')
  })
  it('saves explicitly, keeps the request ID in the URL only while pending, and never starts a Run', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    render()
    await settle()
    field('Supplemental requirements').onChange(' Explicit supplement ')
    render()
    await button('Save requirement').onClick()
    await settle()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      content: 'Explicit supplement',
    })
    expect(mocks.push.mock.calls[0][0]).toMatch(/deviceSend=/)
    expect(window.location.href).toBe('http://localhost/#pair')
    expect(field('Supplemental requirements').value).toBe('')
    expect(markup).toContain('No run has started')
  })
  it('keeps an unknown save locked and reconciles by original ID/content GET only', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.save.mockRejectedValue(new ApiError(0, 'Disconnected'))
    render()
    await settle()
    field('Supplemental requirements').onChange('Original message')
    render()
    await button('Save requirement').onClick()
    await settle()
    const sent = mocks.save.mock.calls[0][0]
    expect(button('Save requirement').disabled).toBe(true)
    expect(mocks.guard?.getState().busy).toBe(true)
    await button('Check save receipt').onClick()
    await settle()
    expect(mocks.receipt).toHaveBeenCalledWith(
      sent.request_id,
      device.id,
      expect.any(AbortSignal),
      sent.content,
    )
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(field('Supplemental requirements').value).toBe('')
  })
  it('retains unknown save identity after reload404 without inventing a new candidate', async () => {
    window.location.href =
      'http://localhost/#pair?deviceSend=message-request-123'
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.receipt.mockRejectedValue(new ApiError(404, 'Missing'))
    render()
    await settle()
    await button('Check save receipt').onClick()
    await settle()
    expect(window.location.href).toContain('deviceSend=message-request-123')
    expect(button('Save requirement').disabled).toBe(true)
    expect(
      mocks.buttons.some((item) => item.label === 'Retry original message'),
    ).toBe(false)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('allows only an identical explicit retry after a save404 with the original candidate', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.save.mockRejectedValueOnce(new ApiError(0, 'Disconnected'))
    mocks.receipt.mockRejectedValue(new ApiError(404, 'Missing'))
    render()
    await settle()
    field('Supplemental requirements').onChange('Keep exact original')
    render()
    await button('Save requirement').onClick()
    await settle()
    const sent = mocks.save.mock.calls[0][0]
    await button('Check save receipt').onClick()
    await settle()
    await button('Retry original message').onClick()
    await settle()
    expect(mocks.save.mock.calls[1][0]).toEqual(sent)
  })
  it('resnapshots a reset cursor by GET without replaying any pending save', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.fetchEvents.mockRejectedValueOnce(
      new ApiError(409, 'Cursor reset', { code: 'device_cursor_reset' }),
    )
    render()
    await settle()
    field('Supplemental requirements').onChange('Draft stays local')
    render()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()
    expect(mocks.fetchTask).toHaveBeenCalledTimes(2)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(field('Supplemental requirements').value).toBe('Draft stays local')
  })
  it('clears private content when an event read detects revocation', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.fetchEvents.mockRejectedValueOnce(new ApiError(401, 'Revoked'))
    render()
    await settle()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()
    expect(markup).not.toContain('Preserved original goal.')
    expect(markup).not.toContain('Verifiable output.')
    expect(markup).toContain('expired or was revoked')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('clears the previous Task draft and rereads session when another tab changes its cookie', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.save.mockRejectedValueOnce(
      new ApiError(409, 'Changed', { code: 'device_identity_changed' }),
    )
    render()
    await settle()
    field('Supplemental requirements').onChange('Original device task input')
    render()
    mocks.fetchSession.mockResolvedValue({
      schema_version: 1,
      device: { ...device, id: 'device-2', task_id: 'task-2' },
    })
    mocks.fetchTask.mockResolvedValue({
      ...task(),
      device_id: 'device-2',
      task: {
        ...task().task,
        id: 'task-2',
        title: 'Different task',
        goal: 'Different goal',
      },
    })
    await button('Save requirement').onClick()
    await settle()
    expect(mocks.save.mock.calls[0][1]).toBe(device.id)
    expect(mocks.fetchSession).toHaveBeenCalledTimes(2)
    expect(markup).toContain('Different task')
    expect(markup).not.toContain('Preserved original goal.')
    expect(field('Supplemental requirements').value).toBe('')
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
  it('clears a malformed or wrong-scope snapshot instead of showing old content as stale', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    render()
    await settle()
    const { DeviceResponseError } = await import('../src/workbench/devices')
    mocks.fetchTask.mockRejectedValueOnce(new DeviceResponseError())
    button('Refresh task').onClick()
    await settle()
    expect(markup).not.toContain('Preserved original goal.')
    expect(markup).not.toContain('Verifiable output.')
    expect(markup).toContain('Device session unavailable')
  })
  it('does not abort a manual task refresh merely because its busy state rerendered', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    render()
    await settle()
    let complete!: (value: unknown) => void
    mocks.fetchTask.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    button('Refresh task').onClick()
    render()
    const signal = mocks.fetchTask.mock.calls[1][1] as AbortSignal
    expect(signal.aborted).toBe(false)
    complete({ ...task(), task: { ...task().task, goal: 'Fresh task goal' } })
    await settle()
    expect(markup).toContain('Fresh task goal')
  })
  it('does not repeatedly poll a failed connection until an explicit refresh', async () => {
    mocks.fetchSession.mockResolvedValue({ schema_version: 1, device })
    mocks.fetchEvents.mockRejectedValueOnce(new ApiError(0, 'Disconnected'))
    render()
    await settle()
    await vi.advanceTimersByTimeAsync(3000)
    await settle()
    await vi.advanceTimersByTimeAsync(15000)
    await settle()
    expect(mocks.fetchEvents).toHaveBeenCalledTimes(1)
    expect(markup).toContain('connection was interrupted')
    await button('Refresh task').onClick()
    await settle()
    expect(mocks.fetchTask).toHaveBeenCalledTimes(2)
  })
  it('keeps a missing claim after reload locked without original secret reconstruction', async () => {
    window.location.href =
      'http://localhost/#pair?deviceClaim=claim-request-123'
    render()
    await settle()
    await button('Check pairing result').onClick()
    await settle()
    expect(button('Pair device').disabled).toBe(true)
    expect(markup).toContain('credentials are no longer in memory')
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(
      mocks.buttons.some((item) => item.label === 'Retry original pairing'),
    ).toBe(false)
  })
})
