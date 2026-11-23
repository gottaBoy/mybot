import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDeviceClaimSession,
  assertDeviceReceipt,
  claimDevice,
  createDevicePairing,
  deviceCommandHash,
  fetchDeviceEvents,
  fetchDeviceMessage,
  fetchDeviceOperation,
  fetchDeviceSession,
  fetchDevices,
  fetchPairedTask,
  makePairSecret,
  parseDevice,
  parseDeviceEvents,
  parseDeviceMessage,
  parseDevicePage,
  parseDevicePairing,
  parseDeviceReceipt,
  parseDeviceSession,
  parsePairedTask,
  parsePairCode,
  revokeDevice,
  saveDeviceMessage,
  type DeviceClaim,
  type DeviceCommand,
} from '../src/workbench/devices'

const device = {
  id: 'device-1',
  name: '手机',
  task_id: 'task-1',
  pairing_id: 'pair-request-123',
  claim_request_id: 'claim-request-123',
  scopes: ['task_read', 'message_save'],
  created_at: '2026-11-23T00:00:00Z',
  expires_at: '2026-12-23T00:00:00Z',
  revoked_at: null,
  revision: 1,
}
const pairing = {
  id: 'pair-request-123',
  task_id: 'task-1',
  label: '手机',
  created_at: '2026-11-23T00:00:00Z',
  expires_at: '2026-11-23T00:10:00Z',
  state: 'available',
  device_id: null,
}
const message = {
  id: 'message-1',
  request_id: 'message-request-123',
  content: '请检查此任务的边界。',
  created_at: '2026-11-23T00:00:00Z',
  state: 'saved',
  run_id: null,
}
const snapshot = () => ({
  schema_version: 1,
  device_id: device.id,
  task: {
    id: device.task_id,
    title: 'Scoped task',
    goal: 'Read only this task',
    acceptance: '',
  },
  latest_run: null,
  messages: { items: [structuredClone(message)], total: 1 },
  report: null,
  cursor: 9,
})
const history = () => ({
  schema_version: 1,
  unit: 'devices',
  items: [structuredClone(device)],
  total: 1,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
})
const pairCommand = (): DeviceCommand => ({
  kind: 'pair',
  request_id: 'pair-request-123',
  task_id: 'task-1',
  label: '手机',
  pair_secret: 'A'.repeat(43),
  consent: true,
})
const revokeCommand = (): DeviceCommand => ({
  kind: 'revoke',
  device_id: device.id,
  request_id: 'revoke-request-123',
  expected_revision: 1,
  consent: true,
})
const claim = (): DeviceClaim => ({
  request_id: 'claim-request-123',
  pairing_id: 'pair-request-123',
  pair_secret: 'A'.repeat(43),
  device_name: '手机',
  device_secret: 'B'.repeat(43),
})
const events = () => ({
  schema_version: 1,
  device_id: device.id,
  task_id: device.task_id,
  after: 5,
  items: [
    {
      seq: 9,
      id: 'event-9',
      run_id: null,
      kind: 'task.turn.saved',
      created_at: device.created_at,
    },
  ],
  next_cursor: 9,
  watermark: 9,
  has_more: false,
})
const expectedEvents = { id: device.id, task_id: device.task_id, after: 5 }
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('paired device strict admission', () => {
  it('admits exact active and revoked devices while retaining named scopes', () => {
    expect(parseDevice(device)).toEqual(device)
    expect(
      parseDevice({ ...device, revoked_at: device.created_at, revision: 2 })
        .revision,
    ).toBe(2)
  })
  it.each([
    { scopes: ['task_read', 'execute'] },
    { scopes: ['message_save', 'task_read'] },
    { revision: 2 },
    { name: ' 手机 ' },
    { expires_at: '2026-11-22T00:00:00Z' },
    { token_hash: 'private' },
    { pairing_id: 'short' },
    { claim_request_id: '' },
  ])('rejects malformed device or broader permission metadata %j', (patch) => {
    expect(() => parseDevice({ ...device, ...patch })).toThrow()
  })
  it('admits finite pairing states without inventing a claim', () => {
    expect(parseDevicePairing(pairing)).toEqual(pairing)
    expect(
      parseDevicePairing({ ...pairing, state: 'claimed', device_id: device.id })
        .device_id,
    ).toBe(device.id)
    expect(() =>
      parseDevicePairing({
        ...pairing,
        state: 'available',
        device_id: device.id,
      }),
    ).toThrow()
    expect(() =>
      parseDevicePairing({ ...pairing, pair_secret: 'secret' }),
    ).toThrow()
  })
  it('keeps page totals, requested/clamped pages and device identities consistent', () => {
    expect(parseDevicePage(history(), 1).items).toHaveLength(1)
    expect(parseDevicePage({ ...history(), requested_page: 8 }, 8).page).toBe(1)
    expect(() => parseDevicePage(history(), 2)).toThrow()
    expect(() => parseDevicePage({ ...history(), total: 23 })).toThrow()
    expect(() =>
      parseDevicePage({ ...history(), items: [device, device], total: 2 }),
    ).toThrow()
    expect(() => parseDevicePage({ ...history(), page_size: 50 })).toThrow()
  })
  it('distinguishes unavailable session from malformed session', () => {
    expect(
      parseDeviceSession({ schema_version: 1, device: null }).device,
    ).toBeNull()
    expect(parseDeviceSession({ schema_version: 1, device }).device?.id).toBe(
      device.id,
    )
    expect(() => parseDeviceSession({ device: null })).toThrow()
    expect(() =>
      parseDeviceSession({
        schema_version: 1,
        device: { ...device, revoked_at: device.created_at, revision: 2 },
      }),
    ).toThrow()
    expect(() =>
      parseDeviceSession({ schema_version: 1, device, authenticated: true }),
    ).toThrow()
  })
  it('accepts scoped snapshots and rejects another device or task', () => {
    expect(parsePairedTask(snapshot(), device).task.id).toBe(device.task_id)
    expect(() =>
      parsePairedTask({ ...snapshot(), device_id: 'other' }, device),
    ).toThrow()
    expect(() =>
      parsePairedTask(
        { ...snapshot(), task: { ...snapshot().task, id: 'other' } },
        device,
      ),
    ).toThrow()
    expect(() =>
      parsePairedTask({ ...snapshot(), models: [] }, device),
    ).toThrow()
  })
  it('admits only reports belonging to the exact latest Run and bounded text', () => {
    const value = {
      ...snapshot(),
      latest_run: {
        id: 'run-1',
        task_id: device.task_id,
        status: 'succeeded',
        created_at: device.created_at,
      },
      report: {
        id: 'report-1',
        run_id: 'run-1',
        title: 'Report',
        content: '研究报告',
        decision: 'pending',
        truncated: false,
      },
    }
    expect(parsePairedTask(value, device).report?.content).toBe('研究报告')
    expect(() =>
      parsePairedTask(
        { ...value, report: { ...value.report, run_id: 'run-2' } },
        device,
      ),
    ).toThrow()
    expect(() =>
      parsePairedTask(
        { ...value, report: { ...value.report, content: 'x'.repeat(20001) } },
        device,
      ),
    ).toThrow()
    expect(() =>
      parsePairedTask({ ...value, latest_run: null }, device),
    ).toThrow()
  })
  it.each([
    { messages: { items: [message, message], total: 2 } },
    { messages: { items: [], total: 1 } },
    { task: { ...snapshot().task, files: ['secret.env'] } },
    { cursor: -1 },
  ])('rejects malformed bounded snapshot %j', (patch) => {
    expect(() => parsePairedTask({ ...snapshot(), ...patch }, device)).toThrow()
  })
  it('checks immutable message candidate and exact state linkage', () => {
    expect(
      parseDeviceMessage(message, {
        request_id: message.request_id,
        content: message.content,
      }),
    ).toEqual(message)
    expect(() => parseDeviceMessage({ ...message, state: 'applied' })).toThrow()
    expect(() => parseDeviceMessage({ ...message, run_id: 'run-1' })).toThrow()
    expect(() =>
      parseDeviceMessage(message, {
        request_id: message.request_id,
        content: 'different',
      }),
    ).toThrow()
    expect(() => parseDeviceMessage({ ...message, candidate: {} })).toThrow()
  })
  it('admits ordered task-only event cursor pages without private payloads', () => {
    expect(parseDeviceEvents(events(), expectedEvents).next_cursor).toBe(9)
    expect(
      parseDeviceEvents(
        { ...events(), after: 9, items: [] },
        { ...expectedEvents, after: 9 },
      ).items,
    ).toEqual([])
  })
  it.each([
    { device_id: 'other' },
    { task_id: 'other' },
    { after: 4 },
    { watermark: 4 },
    { next_cursor: 8 },
    { has_more: true },
    { items: [{ ...events().items[0], payload: { secret: true } }] },
    { items: [{ ...events().items[0], seq: 5 }] },
    { items: [events().items[0], events().items[0]] },
    { items: [] },
  ])('rejects unbound or inconsistent events %j', (patch) => {
    expect(() =>
      parseDeviceEvents({ ...events(), ...patch }, expectedEvents),
    ).toThrow()
  })
  it('continues bounded50 event pages at their last sequence', () => {
    const value = {
      ...events(),
      after: 0,
      items: Array.from({ length: 50 }, (_, index) => ({
        ...events().items[0],
        seq: index + 1,
        id: `event-${index}`,
      })),
      watermark: 52,
      next_cursor: 50,
      has_more: true,
    }
    expect(
      parseDeviceEvents(value, { ...expectedEvents, after: 0 }).has_more,
    ).toBe(true)
  })
})

describe('device command identity and secrets', () => {
  it('generates32-byte base64url secrets without writing storage', () => {
    const first = makePairSecret(),
      second = makePairSecret()
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
    expect(parsePairCode(`pair-request-123.${first}`)).toEqual({
      pairing_id: 'pair-request-123',
      pair_secret: first,
    })
  })
  it.each([
    'short.secret',
    'pair-request-123.bad',
    'pair-request-123.' + 'A'.repeat(43) + '.more',
    '',
  ])('rejects malformed pairing codes', (code) =>
    expect(() => parsePairCode(code)).toThrow(),
  )
  it('matches Python canonical pair/revoke hashes and includes revoke path identity', async () => {
    expect(await deviceCommandHash(pairCommand())).toBe(
      'e858c2dff52e1b877351eaa28223c9876e6c435352026b6ce9fa713000955feb',
    )
    expect(await deviceCommandHash(revokeCommand())).toBe(
      '71564205b953b6295e628bd69eab80eac6153300feaa0a07e437ac2e7d2045c9',
    )
    expect(
      await deviceCommandHash({
        ...revokeCommand(),
        device_id: 'device-2',
      } as DeviceCommand),
    ).not.toBe(await deviceCommandHash(revokeCommand()))
  })
  it('binds pair operation receipts to task, label, request and hidden candidate hash', async () => {
    const command = pairCommand()
    const receipt = {
      request_id: command.request_id,
      kind: 'pair',
      candidate_hash: await deviceCommandHash(command),
      state: 'applied',
      result: pairing,
    }
    expect(await assertDeviceReceipt(receipt, command)).toEqual(receipt)
    for (const patch of [
      { request_id: 'other-request-123' },
      { candidate_hash: 'a'.repeat(64) },
      { result: { ...pairing, label: 'other' } },
      { result: { ...pairing, task_id: 'task-2' } },
    ])
      await expect(
        assertDeviceReceipt({ ...receipt, ...patch }, command),
      ).rejects.toThrow()
    expect(() =>
      parseDeviceReceipt({ ...receipt, pair_secret: 'secret' }),
    ).toThrow()
  })
  it('binds revoked receipts to exact device and expected next revision', async () => {
    const command = revokeCommand()
    const receipt = {
      request_id: command.request_id,
      kind: 'revoke',
      candidate_hash: await deviceCommandHash(command),
      state: 'applied',
      result: { ...device, revision: 2, revoked_at: device.created_at },
    }
    expect((await assertDeviceReceipt(receipt, command)).kind).toBe('revoke')
    await expect(
      assertDeviceReceipt({ ...receipt, result: device }, command),
    ).rejects.toThrow()
  })
  it('matches claim receipts without reading or echoing HttpOnly device secret', () => {
    expect(assertDeviceClaimSession(parseDevice(device), claim()).id).toBe(
      device.id,
    )
    expect(() => assertDeviceClaimSession(null, claim())).toThrow()
    for (const patch of [
      { claim_request_id: 'other-request' },
      { pairing_id: 'other-request' },
      { name: 'other' },
    ])
      expect(() =>
        assertDeviceClaimSession(parseDevice({ ...device, ...patch }), claim()),
      ).toThrow()
  })
})

describe('device request boundaries and reconciliation', () => {
  it('reads only the explicit owner/device endpoint and validates identity', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(history()))
      .mockResolvedValueOnce(response({ schema_version: 1, device }))
      .mockResolvedValueOnce(response(snapshot()))
      .mockResolvedValueOnce(response(events()))
      .mockResolvedValueOnce(response(message))
    vi.stubGlobal('fetch', fetch)
    await fetchDevices()
    await fetchDeviceSession()
    await fetchPairedTask(parseDevice(device))
    await fetchDeviceEvents(parseDevice(device), 5)
    await fetchDeviceMessage(
      message.request_id,
      device.id,
      undefined,
      message.content,
    )
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      '/api/devices?page=1',
      '/api/device/session',
      '/api/device/task',
      '/api/device/events?after=5',
      `/api/device/messages/requests/${message.request_id}`,
    ])
    expect(
      fetch.mock.calls.every((call) => call[1].credentials === 'same-origin'),
    ).toBe(true)
    expect(fetch.mock.calls[4][1].headers['X-Workbench-Device-Id']).toBe(
      device.id,
    )
  })
  it('saves messages as one explicit POST and rejects changed content receipt', async () => {
    const fetch = vi.fn().mockResolvedValue(response(message))
    vi.stubGlobal('fetch', fetch)
    await saveDeviceMessage(
      { request_id: message.request_id, content: message.content },
      device.id,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      request_id: message.request_id,
      content: message.content,
    })
    expect(fetch.mock.calls[0][1].headers['X-Workbench-Device-Id']).toBe(
      device.id,
    )
    fetch.mockResolvedValue(response({ ...message, content: 'different' }))
    await expect(
      saveDeviceMessage(
        { request_id: message.request_id, content: message.content },
        device.id,
      ),
    ).rejects.toThrow()
  })
  it('claims once and returns only the exact Device DTO', async () => {
    const fetch = vi.fn().mockResolvedValue(response(device))
    vi.stubGlobal('fetch', fetch)
    expect(await claimDevice(claim())).toEqual(device)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/device/claim')
    fetch.mockResolvedValue(response({ ...device, device_secret: 'secret' }))
    await expect(claimDevice(claim())).rejects.toThrow()
  })
  it('posts exact owner commands and GET-only reconciles the same ID', async () => {
    const command = pairCommand()
    const receipt = {
      request_id: command.request_id,
      kind: 'pair',
      candidate_hash: await deviceCommandHash(command),
      state: 'applied',
      result: pairing,
    }
    const fetch = vi.fn().mockImplementation(async () => response(receipt))
    vi.stubGlobal('fetch', fetch)
    const { kind: _kind, ...body } = command
    await createDevicePairing(body as any)
    await fetchDeviceOperation(command.request_id, undefined, command)
    expect(fetch.mock.calls.map((call) => call[1].method ?? 'GET')).toEqual([
      'POST',
      'GET',
    ])
    expect(fetch.mock.calls[1][0]).toBe(
      `/api/devices/operations/${command.request_id}`,
    )
  })
  it('sends revoke device identity in path and hash without adding it to body', async () => {
    const command = revokeCommand()
    const receipt = {
      request_id: command.request_id,
      kind: 'revoke',
      candidate_hash: await deviceCommandHash(command),
      state: 'applied',
      result: { ...device, revision: 2, revoked_at: device.created_at },
    }
    const fetch = vi.fn().mockResolvedValue(response(receipt))
    vi.stubGlobal('fetch', fetch)
    await revokeDevice(device.id, {
      request_id: command.request_id,
      expected_revision: 1,
      consent: true,
    })
    expect(fetch.mock.calls[0][0]).toBe(`/api/devices/${device.id}/revoke`)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty(
      'device_id',
    )
  })
  it('never retries failed GETs or mutations automatically', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('disconnected'))
    vi.stubGlobal('fetch', fetch)
    await expect(fetchDeviceSession()).rejects.toThrow()
    await expect(
      saveDeviceMessage(
        { request_id: message.request_id, content: message.content },
        device.id,
      ),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('does not send an already aborted request', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    controller.abort()
    await expect(fetchDeviceSession(controller.signal)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('discards a response returned after abort even if the transport ignores cancellation', async () => {
    let complete!: (value: Response) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      ),
    )
    const controller = new AbortController()
    const request = fetchDeviceSession(controller.signal)
    controller.abort()
    complete(response({ schema_version: 1, device }))
    await expect(request).rejects.toThrow()
  })
  it('times out after15s and never retries a possibly applied mutation', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const pending = saveDeviceMessage(
      { request_id: message.request_id, content: message.content },
      device.id,
    )
    const assertion = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(15000)
    await assertion
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects invalid command input before network', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchDevices(0)).rejects.toThrow()
    await expect(fetchDeviceEvents(parseDevice(device), -1)).rejects.toThrow()
    await expect(
      saveDeviceMessage({ request_id: 'short', content: 'text' }, device.id),
    ).rejects.toThrow()
    await expect(
      saveDeviceMessage(
        { request_id: message.request_id, content: ' padded ' },
        device.id,
      ),
    ).rejects.toThrow()
    await expect(
      saveDeviceMessage(
        { request_id: message.request_id, content: message.content },
        '',
      ),
    ).rejects.toThrow()
    await expect(fetchDeviceMessage(message.request_id, '')).rejects.toThrow()
    await expect(
      claimDevice({ ...claim(), device_secret: 'bad' }),
    ).rejects.toThrow()
    await expect(fetchDeviceOperation('short')).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
