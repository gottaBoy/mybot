import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DeviceResponseError,
  executeDeviceGrant,
  executionCommandHash,
  executionGrantIdentity,
  fetchExecutionOperation,
  fetchOwnerExecution,
  fetchScopedExecution,
  parseExecutionGrant,
  parseExecutionReceipt,
  parseOwnerExecution,
  parseScopedExecution,
  sendExecutionCommand,
  type ExecutionCommand,
} from '../src/workbench/devices'
import { readPairPortalLocation } from '../src/workbench/PairPortal'
import { readDevicesLocation } from '../src/workbench/DevicesPage'

const device = {
  id: 'device-a',
  task_id: 'task-a',
  name: 'Phone',
  pairing_id: 'pair-request-a',
  claim_request_id: 'claim-request-a',
  scopes: ['task_read', 'message_save'],
  created_at: '2026-11-25T00:00:00Z',
  expires_at: '2026-12-25T00:00:00Z',
  revoked_at: null,
  revision: 1,
}
export const grant = {
  id: 'execution-grant-a',
  device_id: device.id,
  task_id: device.task_id,
  turn_id: 'turn-a',
  turn_request_id: 'turn-request-a',
  content: 'Only this message',
  candidate_hash: 'a'.repeat(64),
  context_hash: 'b'.repeat(64),
  resources: {
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
  },
  models: ['coordinator_model', 'researcher_model', 'reviewer_model'].map(
    (role) => ({
      role,
      id: 'model-a',
      name: 'Local model',
      model: 'test-model',
      kind: 'chat_completions',
    }),
  ),
  source_count: 1,
  source_bytes: 100,
  workflow_version: null,
  created_at: '2026-11-25T00:00:00Z',
  expires_at: '2026-11-25T00:10:00Z',
  revoked_at: null,
  revision: 1 as const,
  state: 'authorized' as const,
  run_id: null,
}
const command: ExecutionCommand = {
  kind: 'grant',
  device_id: device.id,
  request_id: grant.id,
  turn_id: grant.turn_id,
  candidate_hash: grant.candidate_hash,
  expected_device_revision: 1,
  consent: true,
}
const envelope = (item: unknown = grant) => ({
  schema_version: 1,
  device_id: device.id,
  task_id: device.task_id,
  grant: item,
})
afterEach(() => vi.unstubAllGlobals())
describe('one-use device execution contract', () => {
  it('retains referenced-artifact count in grant identity without source bodies', () => {
    const referenced = { ...grant, artifact_count: 2 }
    expect(parseExecutionGrant(referenced, device)).toEqual(referenced)
    expect(executionGrantIdentity(referenced)).not.toBe(
      executionGrantIdentity(grant),
    )
    expect(() =>
      parseExecutionGrant({ ...grant, artifact_count: 4 }, device),
    ).toThrow()
    expect(() =>
      parseExecutionGrant({ ...grant, artifact_count: 0 }, device),
    ).toThrow()
    expect(() =>
      parseExecutionGrant({ ...referenced, artifacts: ['body'] }, device),
    ).toThrow()
  })
  it('admits exact identity and no broader device scopes', () => {
    expect(parseExecutionGrant(grant, device)).toEqual(grant)
    expect(parseScopedExecution(envelope(), device, grant.id).grant).toEqual(
      grant,
    )
    expect(parseScopedExecution(envelope(null), device).grant).toBeNull()
    expect(
      parseOwnerExecution(
        { schema_version: 1, device, prepared: null, grant },
        device.id,
      ).grant,
    ).toEqual(grant)
  })
  it.each([
    { device_id: 'other' },
    { task_id: 'other' },
    { id: 'bad' },
    { candidate_hash: 'bad' },
    { context_hash: 'bad' },
    { run_id: 'invented' },
    { state: 'applied' },
    { state: 'unknown' },
    { revision: 2 },
    { revoked_at: '2026-11-25T00:01:00Z' },
    { expires_at: '2026-11-25T00:11:00Z' },
    { expires_at: grant.created_at },
    { source_count: -1 },
    { source_bytes: 1.2 },
    { workflow_version: 0 },
    { resources: { ...grant.resources, max_calls: 9 } },
    { resources: { ...grant.resources, parallel: 3 } },
    { resources: { ...grant.resources, max_output_tokens: 5000 } },
    { models: [grant.models[0]] },
    { models: [grant.models[1], grant.models[0], grant.models[2]] },
    { models: grant.models.map((model) => ({ ...model, key_env: 'LEAK' })) },
    { extra: true },
  ])('rejects malformed/expanded/wrong-identity grant %j', (patch) => {
    expect(() => parseExecutionGrant({ ...grant, ...patch }, device)).toThrow(
      DeviceResponseError,
    )
  })
  it('accepts a queued receipt separately from model success and rejects superseded-as-applied', () => {
    const applied = { ...grant, state: 'applied', run_id: 'run-a' }
    expect(parseScopedExecution(envelope(applied), device).grant?.state).toBe(
      'applied',
    )
    expect(() =>
      parseExecutionGrant(
        { ...grant, state: 'superseded', run_id: 'run-a' },
        device,
      ),
    ).toThrow()
  })
  it('binds operation hash, recipient and complete grant identity', async () => {
    const receipt = {
      request_id: grant.id,
      kind: 'grant',
      candidate_hash: await executionCommandHash(command),
      state: 'applied',
      grant,
    }
    expect(
      await parseExecutionReceipt(receipt, device.id, grant.id, command),
    ).toEqual(receipt)
    await expect(
      parseExecutionReceipt(
        { ...receipt, candidate_hash: 'f'.repeat(64) },
        device.id,
        grant.id,
        command,
      ),
    ).rejects.toThrow()
    await expect(
      parseExecutionReceipt(receipt, 'other-device', grant.id, command),
    ).rejects.toThrow()
    await expect(
      parseExecutionReceipt(receipt, device.id, 'other-request', command),
    ).rejects.toThrow()
    expect(executionGrantIdentity(grant)).toBe(
      executionGrantIdentity({ ...grant, run_id: 'run-a' } as any),
    )
    expect(executionGrantIdentity(grant)).not.toBe(
      executionGrantIdentity({ ...grant, source_count: 2 }),
    )
  })
  it('owner grant and exact operation GET never execute', async () => {
    const receipt = {
      request_id: grant.id,
      kind: 'grant',
      candidate_hash: await executionCommandHash(command),
      state: 'applied',
      grant,
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ schema_version: 1, device, prepared: null, grant }),
        ),
      )
    vi.stubGlobal('fetch', fetcher)
    await sendExecutionCommand(command)
    await fetchExecutionOperation(device.id, grant.id, undefined, command)
    await fetchOwnerExecution(device.id)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      `/api/devices/${device.id}/execution-grants`,
      `/api/devices/${device.id}/execution-operations/${grant.id}`,
      `/api/devices/${device.id}/execution`,
    ])
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      request_id: grant.id,
      turn_id: grant.turn_id,
      candidate_hash: grant.candidate_hash,
      expected_device_revision: 1,
      consent: true,
    })
  })
  it('execute sends exact immutable identity with device header, GET only for reconciliation', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            envelope({ ...grant, state: 'applied', run_id: 'run-a' }),
          ),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope())))
    vi.stubGlobal('fetch', fetcher)
    await executeDeviceGrant(device, grant)
    await fetchScopedExecution(device, grant.id)
    expect(fetcher.mock.calls[0][0]).toBe(
      `/api/device/execution-grants/${grant.id}/execute`,
    )
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      candidate_hash: grant.candidate_hash,
      consent: true,
    })
    for (const [, options] of fetcher.mock.calls)
      expect(options.headers['X-Workbench-Device-Id']).toBe(device.id)
    expect(fetcher.mock.calls[1][1].method).toBeUndefined()
  })
  it('rejects response substitution after execute', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            envelope({
              ...grant,
              context_hash: 'c'.repeat(64),
              state: 'applied',
              run_id: 'run-a',
            }),
          ),
        ),
      ),
    )
    await expect(executeDeviceGrant(device, grant)).rejects.toThrow(
      DeviceResponseError,
    )
  })
  it('invalid input and pre-aborted reads make no requests', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      sendExecutionCommand({ ...command, consent: false } as any),
    ).rejects.toThrow()
    await expect(fetchScopedExecution(device, 'bad')).rejects.toThrow()
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchScopedExecution(device, grant.id, controller.signal),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
describe('execution request URL admission', () => {
  it('retains exact original grant and owner operation identifiers', () => {
    expect(
      readPairPortalLocation('#pair?deviceExecute=execution-grant-a').executeId,
    ).toBe(grant.id)
    expect(
      readDevicesLocation(
        '#devices?executionDevice=device-a&executionOperation=operation-abc',
      ),
    ).toEqual({
      executionDevice: device.id,
      executionOperation: 'operation-abc',
    })
  })
  it.each([
    'deviceExecute=bad',
    'deviceExecute=execution-grant-a&deviceExecute=another-grant',
    'deviceExecute=execution-grant-a&deviceSend=message-request',
    'deviceExecute=execution-grant-a&deviceClaim=claim-request',
  ])('rejects contradictory paired pending operations %s', (query) => {
    expect(readPairPortalLocation(`#pair?${query}`).error).toBe(true)
  })
  it.each([
    'executionOperation=operation-abc',
    'executionDevice=',
    'executionDevice=a&executionDevice=b',
    'executionDevice=a&deviceRequest=request-abc',
    'executionDevice=a&executionOperation=bad',
  ])('rejects contradictory owner pending operations %s', (query) => {
    expect(readDevicesLocation(`#devices?${query}`).error).toBe(true)
  })
})
