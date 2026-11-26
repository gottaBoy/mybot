import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PairedRunHistory } from '../src/workbench/PairedRunHistory'
import { ApiError } from '../src/workbench/api'
const m = vi.hoisted(() => ({
  states: [] as any[],
  refs: [] as any[],
  effects: [] as any[],
  pending: [] as (() => void)[],
  state: 0,
  ref: 0,
  effect: 0,
  buttons: [] as any[],
  list: vi.fn(),
  detail: vi.fn(),
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
  useRef: (initial: any) => {
    const index = m.ref++
    return (m.refs[index] ??= { current: initial })
  },
  useEffect: (effect: any, deps: any[]) => {
    const index = m.effect++,
      before = m.effects[index]
    if (
      before &&
      deps.every((value, key) => Object.is(value, before.deps[key]))
    )
      return
    m.pending.push(() => {
      before?.cleanup?.()
      m.effects[index] = { deps, cleanup: effect() }
    })
  },
}))
vi.mock('../src/components/ui', () => ({
  AppButton: (props: any) => {
    m.buttons.push(props)
    return createElement('button', { disabled: props.disabled }, props.label)
  },
  AppLoading: ({ label }: any) => createElement('p', null, label),
  AppBadge: ({ children }: any) => createElement('span', null, children),
}))
vi.mock('../src/workbench/devices', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/devices')>(
    '../src/workbench/devices',
  )),
  fetchDeviceRuns: (...args: any[]) => m.list(...args),
  fetchDeviceRun: (...args: any[]) => m.detail(...args),
}))
const device: any = { id: 'device-a', task_id: 'task-a' }
const run = {
  id: 'old-run',
  task_id: 'task-a',
  status: 'failed',
  created_at: '2026-11-24T00:00:00Z',
}
const report = {
  id: 'old-report',
  run_id: run.id,
  title: 'Original report',
  content: 'Old exact output',
  decision: 'pending',
  truncated: false,
}
const page = {
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
}
const detail = {
  schema_version: 1,
  device_id: device.id,
  task_id: device.task_id,
  run,
  report,
}
let props: Parameters<typeof PairedRunHistory>[0]
let html = ''
const deferred = () => {
  let resolve!: (value: any) => void
  const promise = new Promise<any>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function render() {
  m.state = m.ref = m.effect = 0
  m.buttons = []
  html = renderToStaticMarkup(createElement(PairedRunHistory, props))
  for (const effect of m.pending.splice(0)) effect()
  return html
}
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    render()
  }
}
beforeEach(() => {
  m.states = []
  m.refs = []
  m.effects = []
  m.pending = []
  m.list.mockReset().mockResolvedValue(page)
  m.detail.mockReset().mockResolvedValue(detail)
  props = {
    device,
    location: { view: 'review', page: 1, runId: run.id },
    revision: 1,
    disabled: false,
    t: (_zh, en) => en,
    navigate: vi.fn(),
    onScopeFailure: vi.fn(),
  }
  vi.stubGlobal('document', { activeElement: null, body: null })
})
afterEach(() => {
  for (const effect of m.effects) effect?.cleanup?.()
  vi.unstubAllGlobals()
})
describe('paired historical Run view', () => {
  it('renders the exact report independently from page selection', async () => {
    render()
    await settle()
    expect(html).toContain('Old exact output')
    expect(html).toContain('Awaiting human review')
    const selection = m.buttons.find((item) => item.label === run.id)
    selection.onClick()
    expect(props.navigate).toHaveBeenCalledWith({
      runId: run.id,
      view: 'review',
    })
    expect(m.detail).toHaveBeenCalledWith(
      device,
      run.id,
      expect.any(AbortSignal),
    )
  })
  it('clears old detail immediately on selection change and discards a late response', async () => {
    const pending = deferred()
    m.detail.mockReturnValueOnce(pending.promise)
    render()
    await settle()
    const firstSignal = m.detail.mock.calls[0][2]
    props = { ...props, location: { ...props.location, runId: 'next-run' } }
    m.detail.mockResolvedValue({
      ...detail,
      run: { ...run, id: 'next-run' },
      report: null,
    })
    render()
    await settle()
    expect(firstSignal.aborted).toBe(true)
    pending.resolve(detail)
    await settle()
    expect(html).not.toContain('Old exact output')
    expect(html).toContain('This run has no report.')
  })
  it('does not cancel a loading GET or retry an errored GET on event refresh', async () => {
    const pending = deferred()
    m.detail.mockReturnValueOnce(pending.promise)
    render()
    await settle()
    props = { ...props, revision: 2 }
    render()
    await settle()
    expect(m.detail).toHaveBeenCalledTimes(1)
    expect(m.detail.mock.calls[0][2].aborted).toBe(false)
    pending.resolve(detail)
    await settle()
    m.detail.mockRejectedValueOnce(new ApiError(503, 'offline'))
    props = { ...props, revision: 3 }
    render()
    await settle()
    expect(html).toContain('The selected run could not be read.')
    props = { ...props, revision: 4 }
    render()
    await settle()
    expect(m.detail).toHaveBeenCalledTimes(2)
    m.buttons.find((item) => item.label === 'Retry selected run').onClick()
    render()
    await settle()
    expect(html).toContain('Old exact output')
  })
  it('reports a missing selected Run without substituting a page row', async () => {
    m.detail.mockRejectedValue(new ApiError(404, 'missing'))
    render()
    await settle()
    expect(html).toContain('missing or outside this task')
    expect(html).not.toContain('Old exact output')
    expect(props.onScopeFailure).not.toHaveBeenCalled()
  })
  it('escalates authorization failure for private-content cleanup', async () => {
    m.detail.mockRejectedValue(new ApiError(401, 'revoked'))
    render()
    await settle()
    expect(props.onScopeFailure).toHaveBeenCalled()
    expect(html).not.toContain('Old exact output')
  })
  it('does not read a selected detail when only history is presented', async () => {
    props = { ...props, location: { view: 'work', page: 1 } }
    render()
    await settle()
    expect(m.detail).not.toHaveBeenCalled()
    expect(m.list).toHaveBeenCalledTimes(1)
  })
})
