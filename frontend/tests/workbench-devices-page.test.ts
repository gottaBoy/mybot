import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Bootstrap } from '../src/workbench/api'
import {
  DevicesPage,
  deviceAccessState,
  readDevicesLocation,
  validPairingDraft,
} from '../src/workbench/DevicesPage'
import type {
  Device,
  DeviceCommand,
  DevicePage,
  DevicePairing,
  DeviceReceipt,
} from '../src/workbench/devices'

const mocks = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as { current: any }[],
  effects: [] as {
    dependencies?: unknown[]
    cleanup?: (() => void) | void
  }[],
  pending: [] as (() => void)[],
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  buttons: [] as Record<string, any>[],
  fields: [] as Record<string, any>[],
  checkboxes: [] as Record<string, any>[],
  dialogs: [] as Record<string, any>[],
  discard: undefined as Record<string, any> | undefined,
  guard: undefined as Record<string, any> | undefined,
  fetch: vi.fn(),
  task: vi.fn(),
  pairing: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  receipt: vi.fn(),
  push: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  clipboard: vi.fn(),
  listeners: new Map<string, Set<() => void>>(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = mocks.stateCursor++
      if (!(index in mocks.states))
        mocks.states[index] =
          typeof initial === 'function' ? initial() : initial
      return [
        mocks.states[index],
        (value: unknown) => {
          mocks.states[index] =
            typeof value === 'function' ? value(mocks.states[index]) : value
        },
      ]
    },
    useRef: (initial: unknown) => {
      const index = mocks.refCursor++
      mocks.refs[index] ??= { current: initial }
      return mocks.refs[index]
    },
    useEffect: (
      effect: () => void | (() => void),
      dependencies?: unknown[],
    ) => {
      const index = mocks.effectCursor++
      const previous = mocks.effects[index]
      if (
        previous &&
        dependencies &&
        previous.dependencies &&
        dependencies.length === previous.dependencies.length &&
        dependencies.every((value, key) =>
          Object.is(value, previous.dependencies![key]),
        )
      )
        return
      mocks.pending.push(() => {
        previous?.cleanup?.()
        mocks.effects[index] = { dependencies, cleanup: effect() }
      })
    },
  }
})
vi.mock('../src/components/ui', () => ({
  AppInput: (props: Record<string, any>) => {
    mocks.fields.push(props)
    return createElement('input', {
      'aria-label': props.label,
      type: props.type,
      value: props.value,
      readOnly: true,
    })
  },
  AppButton: (props: Record<string, any>) => {
    mocks.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      {
        'aria-label': props.label,
        href: props.href,
        disabled: props.disabled,
        'data-device-page': props['data-device-page'],
      },
      props.label,
    )
  },
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppCheckbox: (props: Record<string, any>) => {
    mocks.checkboxes.push(props)
    return createElement('input', {
      type: 'checkbox',
      'aria-label': props.label,
      checked: props.value,
      readOnly: true,
    })
  },
  AppLoading: ({ label }: { label: string }) =>
    createElement('p', { role: 'status' }, label),
  AppDialog: (props: Record<string, any>) => {
    mocks.dialogs.push(props)
    return createElement(
      'section',
      {
        role: props.busy ? 'alertdialog' : 'dialog',
        'aria-label': props.title,
      },
      props.children,
    )
  },
}))
vi.mock('../src/components/ui/DraftGuard', () => ({
  AppDraftGuard: (props: Record<string, any>) => {
    mocks.discard = props
    return createElement('section', { role: 'dialog' }, props.title)
  },
}))
vi.mock('../src/workbench/navigation-guard', () => ({
  pushWorkbenchNavigation: (...args: unknown[]) => mocks.push(...args),
  confirmWorkbenchNavigation: () => mocks.confirm(),
  cancelWorkbenchNavigation: () => mocks.cancel(),
  registerWorkbenchNavigationBlocker: (guard: Record<string, any>) => {
    mocks.guard = guard
    return () => {
      if (mocks.guard === guard) mocks.guard = undefined
    }
  },
}))
vi.mock('../src/workbench/devices', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/devices')>(
    '../src/workbench/devices',
  )),
  fetchDevices: (...args: unknown[]) => mocks.fetch(...args),
  fetchDevicePairing: (...args: unknown[]) => mocks.pairing(...args),
  createDevicePairing: (...args: unknown[]) => mocks.create(...args),
  revokeDevice: (...args: unknown[]) => mocks.revoke(...args),
  fetchDeviceOperation: (...args: unknown[]) => mocks.receipt(...args),
  makePairSecret: () => 's'.repeat(43),
}))
vi.mock('../src/workbench/task-detail', () => ({
  fetchTaskDetail: (...args: unknown[]) => mocks.task(...args),
}))

const t = (_zh: string, en: string) => en
const data = {
  workspace: '/synthetic/device-owner',
  capabilities: { device_continuation: true, task_detail: true },
  tasks: [],
  models: [],
  projects: [],
} as unknown as Bootstrap
const device: Device = {
  id: 'device-1',
  name: 'Phone',
  task_id: 'task-1',
  pairing_id: 'pairing-original',
  claim_request_id: 'claim-original',
  scopes: ['task_read', 'message_save'],
  created_at: '2026-11-23T00:00:00Z',
  expires_at: '2030-11-23T00:00:00Z',
  revoked_at: null,
  revision: 1,
}
const page = (
  items: Device[] = [],
  extra: Partial<DevicePage> = {},
): DevicePage => ({
  schema_version: 1,
  unit: 'devices',
  items,
  total: items.length,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  ...extra,
})
const pairing = (id = 'pairing-created'): DevicePairing => ({
  id,
  task_id: 'task-1',
  label: 'Phone invitation',
  created_at: '2026-11-23T00:00:00Z',
  expires_at: '2030-11-23T00:10:00Z',
  state: 'available',
  device_id: null,
})
const pairReceipt = (command: DeviceCommand): DeviceReceipt => {
  if (command.kind !== 'pair') throw new Error('pair command required')
  return {
    kind: 'pair',
    state: 'applied',
    candidate_hash: 'a'.repeat(64),
    request_id: command.request_id,
    result: {
      ...pairing(command.request_id),
      label: command.label,
      task_id: command.task_id,
    },
  }
}
const task = {
  id: 'task-1',
  project_id: 'project-1',
  title: 'Authorized Task',
  goal: 'Inspect only the authorized Task.',
  acceptance: 'Preserve bounded device access.',
  files: [],
}
let currentData = data
let revision = 0
function render(next = currentData) {
  currentData = next
  mocks.buttons = []
  mocks.fields = []
  mocks.checkboxes = []
  mocks.dialogs = []
  mocks.discard = undefined
  mocks.stateCursor = 0
  mocks.refCursor = 0
  mocks.effectCursor = 0
  return renderToStaticMarkup(
    createElement(DevicesPage, {
      data: currentData,
      refreshRevision: revision,
      t,
      locale: 'en',
    }),
  )
}
async function settle() {
  let markup = ''
  for (let index = 0; index < 8; index++) {
    for (const effect of mocks.pending.splice(0)) effect()
    await Promise.resolve()
    markup = render()
  }
  return markup
}
const button = (label: string) => {
  const found = mocks.buttons.find((item) => item.label === label)
  if (!found) throw new Error(`Missing button ${label}`)
  return found
}
const field = (label: string) => {
  const found = mocks.fields.find((item) => item.label === label)
  if (!found) throw new Error(`Missing field ${label}`)
  return found
}
async function ready(items: Device[] = []) {
  mocks.fetch.mockResolvedValue(page(items))
  render()
  return settle()
}
async function preparePair() {
  field('Invitation label').onChange('Phone invitation')
  render()
  mocks.task.mockResolvedValue({ item: { task } })
  await button('Create pairing code').onClick()
  await settle()
}
async function confirmPair() {
  mocks.checkboxes
    .find((item) => item.label === 'I authorize this device scope')!
    .onChange(true)
  render()
  button('Confirm pairing').onClick()
  await settle()
}

beforeEach(() => {
  mocks.states = []
  mocks.refs = []
  mocks.effects = []
  mocks.pending = []
  mocks.listeners.clear()
  mocks.guard = undefined
  for (const fn of [
    mocks.fetch,
    mocks.task,
    mocks.pairing,
    mocks.create,
    mocks.revoke,
    mocks.receipt,
    mocks.push,
    mocks.confirm,
    mocks.cancel,
    mocks.clipboard,
  ])
    fn.mockReset()
  currentData = data
  revision = 0
  vi.stubGlobal('window', {
    location: { href: 'http://localhost/#devices?task=task-1' },
    addEventListener: (name: string, listener: () => void) => {
      if (!mocks.listeners.has(name)) mocks.listeners.set(name, new Set())
      mocks.listeners.get(name)!.add(listener)
    },
    removeEventListener: (name: string, listener: () => void) =>
      mocks.listeners.get(name)?.delete(listener),
  })
  vi.stubGlobal('document', { hidden: false, body: {}, activeElement: {} })
  vi.stubGlobal('navigator', { clipboard: { writeText: mocks.clipboard } })
  mocks.push.mockImplementation((href: string) => {
    window.location.href = `http://localhost/${href}`
    return true
  })
  mocks.fetch.mockResolvedValue(page())
})
afterEach(() => {
  for (const effect of mocks.effects) effect.cleanup?.()
  mocks.effects = []
  vi.unstubAllGlobals()
})

describe('device management location and state', () => {
  it('accepts encoded exact Task and unresolved operation IDs without secret fields', () => {
    expect(
      readDevicesLocation(
        'http://localhost/#devices?task=task%2Fone&deviceRequest=request-123',
      ),
    ).toEqual({
      taskId: 'task/one',
      requestId: 'request-123',
    })
  })
  it.each([
    'deviceRequest=short',
    'deviceRequest=operation-123&deviceRequest=operation-456',
    'task=task-1&task=task-2',
    'task=%20',
  ])('rejects invalid or ambiguous location %s', (query) => {
    expect(readDevicesLocation(`http://localhost/#devices?${query}`)).toEqual({
      error: true,
    })
  })
  it('separates authorized, expired and revoked without inventing presence', () => {
    expect(deviceAccessState(device)).toBe('authorized')
    expect(
      deviceAccessState({ ...device, expires_at: '2020-01-01T00:00:00Z' }),
    ).toBe('expired')
    expect(
      deviceAccessState({
        ...device,
        revoked_at: '2026-11-23T00:00:00Z',
        revision: 2,
      }),
    ).toBe('revoked')
  })
  it('validates bounded invitation label and exact Task candidate', () => {
    expect(validPairingDraft('task-1', ' Phone ')).toBe(true)
    expect(validPairingDraft('', 'Phone')).toBe(false)
    expect(validPairingDraft('task-1', 'a'.repeat(81))).toBe(false)
    expect(validPairingDraft('task-1', '\ud800')).toBe(false)
  })
})

describe('owner device management', () => {
  it('does not request devices or expose pairing actions without explicit capability', async () => {
    currentData = { ...data, capabilities: { task_detail: true } } as Bootstrap
    render()
    const html = await settle()
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(html).toContain('Device continuation is not enabled on this server.')
    expect(mocks.fields).toHaveLength(0)
  })
  it('distinguishes initial loading, empty results and read failures', async () => {
    let complete!: (value: DevicePage) => void
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    expect(render()).toContain('Loading devices')
    await settle()
    expect(render()).not.toContain('No devices have been paired')
    complete(page())
    await settle()
    expect(render()).toContain('No devices have been paired')
    mocks.fetch.mockRejectedValue(new Error('unavailable'))
    button('Refresh devices').onClick()
    render()
    expect(await settle()).toContain('The device list could not be read.')
    expect(button('Create pairing code').disabled).toBe(true)
  })
  it('freshly confirms the exact Task before showing grant confirmation and makes no mutation', async () => {
    await ready()
    await preparePair()
    expect(mocks.task).toHaveBeenCalledWith(
      { taskId: 'task-1', page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    )
    expect(mocks.dialogs[0].title).toBe('Authorize task device')
    expect(button('Confirm pairing').disabled).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(render()).toContain(task.goal)
  })
  it('does not infer Task confirmation from Bootstrap when the detail capability is absent', async () => {
    await ready()
    render({
      ...data,
      capabilities: { device_continuation: true },
    } as Bootstrap)
    field('Invitation label').onChange('Phone invitation')
    render()
    await button('Create pairing code').onClick()
    expect(await settle()).toContain('This server cannot confirm Task details.')
    expect(mocks.task).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('keeps inputs and sends nothing when exact Task validation fails', async () => {
    await ready()
    field('Invitation label').onChange('Phone invitation')
    render()
    mocks.task.mockRejectedValue(new ApiError(404, 'missing'))
    await button('Create pairing code').onClick()
    await settle()
    expect(field('Task ID').value).toBe('task-1')
    expect(field('Invitation label').value).toBe('Phone invitation')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('requires fresh consent and retains the secret only in a masked in-memory field', async () => {
    await ready()
    await preparePair()
    button('Confirm pairing').onClick()
    expect(mocks.create).not.toHaveBeenCalled()
    mocks.create.mockImplementation(async (body: any) =>
      pairReceipt({ kind: 'pair', ...body }),
    )
    await confirmPair()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    const sent = mocks.create.mock.calls[0][0]
    expect(sent).toMatchObject({
      task_id: 'task-1',
      label: 'Phone invitation',
      consent: true,
    })
    expect(window.location.href).not.toContain(sent.pair_secret)
    expect(window.location.href).not.toContain('deviceRequest')
    expect(field('Pairing code')).toMatchObject({
      type: 'password',
      isReadOnly: true,
      value: `${sent.request_id}.${sent.pair_secret}`,
    })
    expect(mocks.clipboard).not.toHaveBeenCalled()
    await button('Copy pairing code').onClick()
    await settle()
    expect(mocks.clipboard).toHaveBeenCalledWith(
      `${sent.request_id}.${sent.pair_secret}`,
    )
    button('Close code').onClick()
    render()
    expect(mocks.fields.some((item) => item.label === 'Pairing code')).toBe(
      false,
    )
  })
  it('invalidates pending grant consent if its Task or label changes', async () => {
    await ready()
    await preparePair()
    mocks.checkboxes
      .find((item) => item.label === 'I authorize this device scope')!
      .onChange(true)
    render()
    const staleConfirm = button('Confirm pairing').onClick
    field('Task ID').onChange('task-2')
    render()
    staleConfirm()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.dialogs).toHaveLength(0)
  })
  it('discards late Task validation after the session is cleared', async () => {
    await ready()
    field('Invitation label').onChange('Phone invitation')
    render()
    let complete!: (value: unknown) => void
    mocks.task.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    button('Create pairing code').onClick()
    await settle()
    const signal = mocks.task.mock.calls[0][1] as AbortSignal
    for (const listener of mocks.listeners.get('mybot:unauthorized') ?? [])
      listener()
    await settle()
    expect(signal.aborted).toBe(true)
    complete({ item: { task } })
    await settle()
    expect(mocks.dialogs).toHaveLength(0)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(field('Task ID').value).toBe('')
  })
  it('keeps unknown write locked and reconciles only the original exact command', async () => {
    await ready()
    await preparePair()
    mocks.create.mockRejectedValue(new ApiError(0, 'lost response'))
    await confirmPair()
    const sent = mocks.create.mock.calls[0][0]
    expect(window.location.href).toContain(`deviceRequest=${sent.request_id}`)
    expect(mocks.guard?.getState()).toMatchObject({ busy: true })
    expect(button('Create pairing code').disabled).toBe(true)
    field('Task ID').onChange('task-other')
    field('Invitation label').onChange('Changed after unknown')
    render()
    expect(field('Task ID').value).toBe('task-1')
    expect(field('Invitation label').value).toBe('Phone invitation')
    mocks.receipt.mockResolvedValue(pairReceipt({ kind: 'pair', ...sent }))
    await button('Check original request').onClick()
    await settle()
    expect(mocks.receipt).toHaveBeenCalledWith(
      sent.request_id,
      expect.any(AbortSignal),
      { kind: 'pair', ...sent },
    )
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(window.location.href).not.toContain('deviceRequest')
    expect(field('Pairing code').value).toContain(sent.pair_secret)
  })
  it('retries a confirmed missing receipt only with the same immutable command and ID', async () => {
    await ready()
    await preparePair()
    mocks.create.mockRejectedValue(new ApiError(0, 'lost'))
    await confirmPair()
    const original = mocks.create.mock.calls[0][0]
    mocks.receipt.mockRejectedValue(new ApiError(404, 'not found'))
    await button('Check original request').onClick()
    await settle()
    expect(mocks.guard?.getState().busy).toBe(true)
    mocks.create.mockImplementation(async (body: any) =>
      pairReceipt({ kind: 'pair', ...body }),
    )
    button('Retry original request').onClick()
    await settle()
    expect(mocks.create.mock.calls[1][0]).toEqual(original)
  })
  it('retains reload404 lock without original secret or inventing a new request', async () => {
    window.location.href =
      'http://localhost/#devices?deviceRequest=unknown-original'
    await ready()
    mocks.receipt.mockRejectedValue(new ApiError(404, 'missing'))
    await button('Check original request').onClick()
    const html = await settle()
    expect(html).toContain('its write may still be in flight')
    expect(
      mocks.buttons.some((item) => item.label === 'Retry original request'),
    ).toBe(false)
    expect(window.location.href).toContain('unknown-original')
    expect(mocks.guard?.getState().busy).toBe(true)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('erases the in-memory secret command after unauthorized cleanup while retaining its unresolved ID', async () => {
    await ready()
    await preparePair()
    mocks.create.mockRejectedValue(new ApiError(0, 'lost'))
    await confirmPair()
    const original = mocks.create.mock.calls[0][0]
    for (const listener of mocks.listeners.get('mybot:unauthorized') ?? [])
      listener()
    await settle()
    mocks.receipt.mockRejectedValue(new ApiError(404, 'missing'))
    await button('Check original request').onClick()
    await settle()
    expect(mocks.receipt).toHaveBeenCalledWith(
      original.request_id,
      expect.any(AbortSignal),
      undefined,
    )
    expect(
      mocks.buttons.some((item) => item.label === 'Retry original request'),
    ).toBe(false)
    expect(window.location.href).toContain(original.request_id)
    expect(field('Invitation label').value).toBe('')
  })
  it('does not recover raw pairing credentials from a persisted operation receipt after reload', async () => {
    window.location.href =
      'http://localhost/#devices?deviceRequest=pairing-created'
    await ready()
    mocks.receipt.mockResolvedValue({
      kind: 'pair',
      request_id: 'pairing-created',
      state: 'applied',
      candidate_hash: 'a'.repeat(64),
      result: pairing(),
    })
    await button('Check original request').onClick()
    const html = await settle()
    expect(html).toContain('cannot be recovered')
    expect(mocks.fields.some((item) => item.label === 'Pairing code')).toBe(
      false,
    )
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('retains drafts across list refresh and binds dirty navigation to an explicit discard', async () => {
    await ready()
    field('Invitation label').onChange('Phone invitation')
    render()
    button('Refresh devices').onClick()
    await settle()
    expect(field('Invitation label').value).toBe('Phone invitation')
    expect(mocks.guard?.getState()).toMatchObject({ dirty: true, busy: false })
    mocks.guard!.onBlocked()
    render()
    mocks.discard!.onKeep()
    expect(mocks.cancel).toHaveBeenCalled()
    mocks.guard!.onBlocked()
    render()
    mocks.discard!.onDiscard()
    expect(mocks.confirm).toHaveBeenCalled()
  })
  it('revoke requires explicit consent and the exact displayed device revision', async () => {
    await ready([device])
    button('Revoke device').onClick()
    render()
    expect(button('Confirm revocation').disabled).toBe(true)
    button('Confirm revocation').onClick()
    expect(mocks.revoke).not.toHaveBeenCalled()
    mocks.checkboxes
      .find(
        (item) => item.label === 'I confirm revocation of this device access',
      )!
      .onChange(true)
    render()
    mocks.revoke.mockImplementation(async (_id: string, body: any) => ({
      kind: 'revoke',
      request_id: body.request_id,
      state: 'applied',
      candidate_hash: 'a'.repeat(64),
      result: { ...device, revoked_at: '2026-11-23T00:20:00Z', revision: 2 },
    }))
    button('Confirm revocation').onClick()
    expect(await settle()).toContain('Device access revoked.')
    expect(mocks.revoke).toHaveBeenCalledWith(
      device.id,
      {
        request_id: expect.any(String),
        expected_revision: 1,
        consent: true,
      },
      expect.any(AbortSignal),
    )
  })
  it('rejects a stale device-row callback after a read failure', async () => {
    await ready([device])
    const open = button('Revoke device').onClick
    mocks.fetch.mockRejectedValue(new ApiError(503, 'unavailable'))
    button('Refresh devices').onClick()
    await settle()
    open()
    render()
    expect(mocks.dialogs).toHaveLength(0)
  })
  it('does not offer revoke for already revoked or expired devices', async () => {
    await ready([
      { ...device, revoked_at: '2026-11-23T00:20:00Z', revision: 2 },
      { ...device, id: 'old-device', expires_at: '2020-01-01T00:00:00Z' },
    ])
    expect(
      mocks.buttons
        .filter((item) => item.label === 'Revoke device')
        .every((item) => item.disabled),
    ).toBe(true)
  })
  it('clears private device projections on unauthorized response', async () => {
    await ready([device])
    field('Invitation label').onChange('Private invitation')
    render()
    for (const listener of mocks.listeners.get('mybot:unauthorized') ?? [])
      listener()
    const html = await settle()
    expect(html).not.toContain('Phone')
    expect(field('Invitation label').value).toBe('')
    expect(field('Task ID').value).toBe('')
    expect(html).toContain('Your session has expired')
  })
  it('discards a delayed list after capability loss rather than exposing devices', async () => {
    let complete!: (value: DevicePage) => void
    mocks.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    render()
    await settle()
    const signal = mocks.fetch.mock.calls[0][1] as AbortSignal
    render({ ...data, capabilities: {} } as Bootstrap)
    await settle()
    expect(signal.aborted).toBe(true)
    complete(page([device]))
    const html = await settle()
    expect(html).not.toContain('Phone')
    expect(html).toContain('not enabled')
  })
  it('requests only the selected bounded device page and preserves invitation drafts', async () => {
    const first = page([device], { total: 21, total_pages: 2, has_more: true })
    mocks.fetch.mockResolvedValue(first)
    render()
    await settle()
    field('Invitation label').onChange('Retained invite draft')
    render()
    mocks.fetch.mockResolvedValue(
      page([{ ...device, id: 'device-21' }], {
        total: 21,
        requested_page: 2,
        page: 2,
        total_pages: 2,
        has_more: false,
      }),
    )
    button('Next devices').onClick()
    const html = await settle()
    expect(mocks.fetch.mock.calls.at(-1)![0]).toBe(2)
    expect(html).toContain('21–21 / 21')
    expect(field('Invitation label').value).toBe('Retained invite draft')
  })
})
