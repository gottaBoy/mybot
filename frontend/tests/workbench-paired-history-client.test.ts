import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchDeviceRun,
  fetchDeviceRuns,
  parseDeviceRunDetail,
  parseDeviceRunPage,
} from '../src/workbench/devices'
import {
  pairedWorkspaceHref,
  readPairedLocation,
} from '../src/workbench/pair-location'

const device = { id: 'device-one', task_id: 'task-one' }
const run = {
  id: 'run-one',
  task_id: device.task_id,
  status: 'failed',
  created_at: '2026-11-24T00:00:00Z',
}
const report = {
  id: 'report-one',
  run_id: run.id,
  title: 'Historic report',
  content: 'Original',
  decision: 'pending',
  truncated: false,
}
const page = () => ({
  schema_version: 1,
  device_id: device.id,
  task_id: device.task_id,
  items: [run],
  total: 1,
  requested_page: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
})
const detail = () => ({
  schema_version: 1,
  device_id: device.id,
  task_id: device.task_id,
  run,
  report,
})
afterEach(() => vi.unstubAllGlobals())
describe('scoped Run read admission', () => {
  it('retains authoritative rows and exact historical report', () => {
    expect(parseDeviceRunPage(page(), device, 1).items).toEqual([run])
    expect(parseDeviceRunDetail(detail(), device, run.id).report).toEqual(
      report,
    )
    expect(
      parseDeviceRunDetail({ ...detail(), report: null }, device, run.id)
        .report,
    ).toBeNull()
  })
  it.each([
    { device_id: 'another' },
    { task_id: 'another' },
    { total: 20 },
    { page_size: 100 },
    { requested_page: 2 },
    { page: 0 },
    { has_more: true },
    { total_pages: 2 },
    { items: [run, run] },
    { items: [{ ...run, task_id: 'other-task' }] },
    { items: [{ ...run, status: 'unknown' }] },
    { items: [{ ...run, extra: true }] },
    { extra: true },
  ])('rejects malformed or wrong-identity history %j', (patch) => {
    expect(() =>
      parseDeviceRunPage({ ...page(), ...patch }, device, 1),
    ).toThrow()
  })
  it.each([
    { device_id: 'another' },
    { task_id: 'another' },
    { run: { ...run, id: 'other-run' } },
    { report: { ...report, run_id: 'other-run' } },
    { report: { ...report, content: '中'.repeat(20001) } },
    { report: { ...report, decision: 'unknown' } },
    { report: { ...report, extra: true } },
    { report: { ...report, truncated: 0 } },
    { extra: true },
  ])('rejects malformed or unrelated detail %j', (patch) => {
    expect(() =>
      parseDeviceRunDetail({ ...detail(), ...patch }, device, run.id),
    ).toThrow()
  })
  it('sends GET only, binds the Device header and exact request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page())))
      .mockResolvedValueOnce(new Response(JSON.stringify(detail())))
    vi.stubGlobal('fetch', fetcher)
    await fetchDeviceRuns(device, 1)
    await fetchDeviceRun(device, run.id)
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
      '/api/device/runs?page=1',
      '/api/device/runs/run-one',
    ])
    for (const [, options] of fetcher.mock.calls) {
      expect(options.method).toBeUndefined()
      expect(options.headers['X-Workbench-Device-Id']).toBe(device.id)
    }
  })
  it('rejects invalid input before HTTP and discards a cancelled late response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(detail())))
    vi.stubGlobal('fetch', fetcher)
    await expect(fetchDeviceRuns(device, 0)).rejects.toThrow()
    await expect(fetchDeviceRun(device, '')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchDeviceRun(device, run.id, controller.signal),
    ).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
describe('read-position continuation URL', () => {
  it('round trips exact encoded Task/Run identity without secrets or drafts', () => {
    const href = pairedWorkspaceHref('研发 / #', {
      runId: 'run / 中文',
      view: 'review',
      page: 2,
    })
    expect(readPairedLocation(href)).toEqual({
      taskId: '研发 / #',
      runId: 'run / 中文',
      view: 'review',
      page: 2,
    })
    expect(href).not.toContain('secret')
  })
  it('preserves only explicit pending IDs', () => {
    const href = pairedWorkspaceHref(
      device.task_id,
      { view: 'conversation' },
      { sendId: 'original-request-id' },
    )
    expect(href).toContain('deviceSend=original-request-id')
    expect(readPairedLocation(href).view).toBe('conversation')
  })
  it.each([
    'task=a&task=b',
    'run=run-one',
    'task=a&run=',
    'task=a&view=unknown',
    'historyPage=0',
    'historyPage=01',
    'historyPage=1&historyPage=2',
    'task=%ZZ',
    'historyPage=9999999999999999999999',
    'view=goal&view=review',
  ])('fails closed for invalid or ambiguous location %s', (query) => {
    expect(readPairedLocation(`#pair?${query}`).error).toBe(true)
  })
  it('rejects invalid destinations and contradictory pending writes', () => {
    expect(() => pairedWorkspaceHref('', {})).toThrow()
    expect(() => pairedWorkspaceHref(device.task_id, { page: 0 })).toThrow()
    expect(() =>
      pairedWorkspaceHref(
        device.task_id,
        {},
        { claimId: 'claim-request', sendId: 'send-request' },
      ),
    ).toThrow()
  })
})
