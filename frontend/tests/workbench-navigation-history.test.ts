import { describe, expect, it, vi } from 'vitest'
import {
  createNavigationHistoryController,
  WORKBENCH_HISTORY_KEY,
  type NavigationHistoryPort,
  type WorkbenchNavigationKind,
} from '../src/workbench/navigation-guard'

function harness(initialState: unknown = { existing: 'kept' }) {
  const entries = [{ href: 'http://localhost/#a', state: initialState }]
  let position = 0
  let id = 0
  const jobs: number[] = []
  const published: string[] = []
  const publishedKinds: WorkbenchNavigationKind[] = []
  const writes: Array<{ kind: string; position: number }> = []
  const controller = createNavigationHistoryController(
    {
      read: () => structuredClone(entries[position]),
      push: (state, href) => {
        entries.splice(position + 1)
        entries.push({ state: structuredClone(state), href })
        position++
        writes.push({ kind: 'push', position })
      },
      replace: (state, href) => {
        entries[position] = { state: structuredClone(state), href }
        writes.push({ kind: 'replace', position })
      },
      go: (delta) => {
        const target = position + delta
        if (target >= 0 && target < entries.length) jobs.push(target)
      },
      publish: (kind) => {
        published.push(entries[position].href)
        publishedKinds.push(kind)
      },
    },
    () => `id-${++id}`,
  )
  const userGo = (delta: number) => {
    position += delta
    controller.arrival()
    controller.arrival() // A paired hashchange must not handle the pop again.
  }
  return {
    controller,
    entries,
    jobs,
    published,
    publishedKinds,
    writes,
    userGo,
    current: () => entries[position],
    position: () => position,
    flush: () => {
      for (let count = 0; jobs.length && count < 20; count++) {
        position = jobs.shift()!
        controller.arrival()
        controller.arrival()
      }
      expect(jobs).toHaveLength(0)
    },
    unknown: () => {
      entries.push({
        href: 'http://localhost/#unmanaged',
        state: { foreign: true },
      })
      position = entries.length - 1
      controller.arrival()
    },
  }
}

function fourEntries() {
  const h = harness()
  for (const route of ['b', 'c', 'd', 'e']) h.controller.push(`#${route}`)
  h.published.length = 0
  h.publishedKinds.length = 0
  return h
}

describe('managed workbench history transactions', () => {
  it('owns an index namespace while retaining unrelated entry state', () => {
    const h = harness({ unrelated: { value: 42 } })
    expect(h.current().state).toMatchObject({ unrelated: { value: 42 } })
    h.controller.push('#b', { state: { filter: 'owned elsewhere' } })
    const before = structuredClone(h.current().state) as Record<string, unknown>
    h.controller.push('#b?view=table', { replace: true })
    expect(h.entries).toHaveLength(2)
    expect(h.current().state).toEqual(before)
    expect(h.current().href).toBe('http://localhost/#b?view=table')
    expect(
      (h.current().state as Record<string, { index: number }>)[
        WORKBENCH_HISTORY_KEY
      ].index,
    ).toBe(1)
  })
  it('classifies accepted writes and native arrivals without publishing setup or duplicate arrivals', () => {
    const h = harness()
    expect(h.publishedKinds).toEqual([])
    h.controller.push('#b')
    h.controller.push('#b?q=changed', { replace: true })
    h.controller.push('#b?q=changed', { replace: true })
    h.userGo(-1)
    h.userGo(1)
    expect(h.publishedKinds).toEqual([
      'push',
      'replace',
      'traverse',
      'traverse',
    ])
  })
  it('retains compatibility with a no-argument publication port', () => {
    let entry: { href: string; state: unknown } = {
      href: 'http://localhost/#a',
      state: null,
    }
    let publications = 0
    const port: NavigationHistoryPort = {
      read: () => entry,
      push: (state, href) => {
        entry = { state, href }
      },
      replace: (state, href) => {
        entry = { state, href }
      },
      go: () => {},
      publish: () => {
        publications++
      },
    }
    const controller = createNavigationHistoryController(port)
    expect(controller.push('#b')).toBe(true)
    expect(controller.push('#b?q=changed', { replace: true })).toBe(true)
    expect(publications).toBe(2)
  })
  it('cancels Back without rewriting its target or adding history entries', () => {
    const h = fourEntries()
    const target = structuredClone(h.entries[3])
    const origin = structuredClone(h.current())
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked,
    })
    h.userGo(-1)
    expect(onBlocked).not.toHaveBeenCalled()
    h.flush()
    expect(onBlocked).toHaveBeenCalledOnce()
    h.controller.cancel()
    expect(h.current()).toEqual(origin)
    expect(h.entries[3]).toEqual(target)
    expect(h.entries).toHaveLength(5)
    expect(h.published).toEqual([])
    expect(h.publishedKinds).toEqual([])
  })
  it('confirms a real Back target and leaves the original entry reachable by Forward', () => {
    const h = fourEntries()
    const release = h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked: vi.fn(),
    })
    h.userGo(-2)
    h.flush()
    expect(h.controller.confirm()).toBe(true)
    release()
    h.flush()
    expect(h.position()).toBe(2)
    expect(h.current().href).toBe('http://localhost/#c')
    h.userGo(2)
    expect(h.current().href).toBe('http://localhost/#e')
    expect(h.entries.map((entry) => entry.href)).toEqual([
      'http://localhost/#a',
      'http://localhost/#b',
      'http://localhost/#c',
      'http://localhost/#d',
      'http://localhost/#e',
    ])
  })
  it('accumulates consecutive Back requests behind one discard dialog', () => {
    const h = fourEntries()
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked,
    })
    h.userGo(-1)
    h.flush()
    h.userGo(-1)
    h.flush()
    expect(h.controller.pending()).toMatchObject({ kind: 'traverse', index: 2 })
    expect(onBlocked).toHaveBeenCalledOnce()
    h.controller.confirm()
    h.flush()
    expect(h.current().href).toBe('http://localhost/#c')
    expect(h.published).toEqual(['http://localhost/#c'])
    expect(h.publishedKinds).toEqual(['traverse'])
  })
  it('tracks a second pop before the first restoration has arrived', () => {
    const h = fourEntries()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked: vi.fn(),
    })
    h.userGo(-1)
    h.userGo(-1)
    expect(h.jobs).toHaveLength(1)
    h.flush()
    expect(h.position()).toBe(4)
    expect(h.controller.pending()).toMatchObject({ index: 2 })
    h.controller.confirm()
    h.flush()
    expect(h.position()).toBe(2)
  })
  it('retains the intended direction and distance for consecutive Forward', () => {
    const h = fourEntries()
    h.userGo(-3)
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked,
    })
    h.userGo(1)
    h.flush()
    h.userGo(1)
    h.flush()
    expect(h.controller.pending()).toMatchObject({ index: 3 })
    expect(onBlocked).toHaveBeenCalledOnce()
    h.controller.confirm()
    h.flush()
    expect(h.current().href).toBe('http://localhost/#d')
  })
  it('combines a multi-step pop with a later opposite-direction request', () => {
    const h = fourEntries()
    h.userGo(-2)
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked: vi.fn(),
    })
    h.userGo(-2)
    h.flush()
    h.userGo(1)
    h.flush()
    expect(h.controller.pending()).toMatchObject({ index: 1 })
    h.controller.confirm()
    h.flush()
    expect(h.position()).toBe(1)
  })
  it('keeps busy traversal intent until a failed operation can ask for confirmation', () => {
    const h = fourEntries()
    let busy = true
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy }),
      onBlocked,
    })
    h.userGo(-2)
    h.flush()
    expect(onBlocked).not.toHaveBeenCalled()
    busy = false
    h.controller.refresh()
    expect(onBlocked).toHaveBeenCalledOnce()
    expect(h.controller.pending()).toMatchObject({ index: 2 })
    h.controller.confirm()
    h.flush()
    expect(h.position()).toBe(2)
  })
  it('finishes an approved busy intent even when the saved form immediately unmounts', () => {
    const h = fourEntries()
    const release = h.controller.register({
      getState: () => ({ dirty: true, busy: true }),
      onBlocked: vi.fn(),
    })
    h.userGo(-1)
    h.controller.confirm()
    release()
    h.flush()
    expect(h.position()).toBe(3)
    expect(h.current().href).toBe('http://localhost/#d')
  })
  it('issues only one traversal when save completion and busy cleanup both confirm', () => {
    const h = fourEntries()
    let busy = true
    h.controller.register({
      getState: () => ({ dirty: false, busy }),
      onBlocked: vi.fn(),
    })
    h.userGo(-1)
    h.flush()
    h.controller.confirm()
    busy = false
    h.controller.refresh()
    h.controller.confirm()
    expect(h.jobs).toHaveLength(1)
    h.flush()
    expect(h.position()).toBe(3)
    expect(h.published).toEqual(['http://localhost/#d'])
    expect(h.publishedKinds).toEqual(['traverse'])
  })
  it('guards ordinary push and replace before either writes the target', () => {
    const h = fourEntries()
    const origin = structuredClone(h.current())
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked,
    })
    expect(h.controller.push('#e?q=first')).toBe(false)
    expect(h.controller.push('#e?q=second', { replace: true })).toBe(false)
    expect(onBlocked).toHaveBeenCalledOnce()
    expect(h.current()).toEqual(origin)
    h.controller.cancel()
    expect(h.current()).toEqual(origin)
    h.controller.push('#e?q=accepted')
    h.controller.confirm()
    expect(h.entries).toHaveLength(6)
    expect(h.current().href).toBe('http://localhost/#e?q=accepted')
    expect(h.publishedKinds).toEqual(['push'])
  })
  it('keeps the replace reason when a blocked write is confirmed', () => {
    const h = fourEntries()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked: vi.fn(),
    })
    h.controller.push('#e?q=accepted', { replace: true })
    expect(h.publishedKinds).toEqual([])
    h.controller.confirm()
    expect(h.publishedKinds).toEqual(['replace'])
    expect(h.entries).toHaveLength(5)
  })
  it('does not replay queued private navigation after an authorization reset', () => {
    const h = fourEntries()
    h.controller.register({
      getState: () => ({ dirty: true, busy: true }),
      onBlocked: vi.fn(),
    })
    h.controller.push('#private-target')
    h.controller.reset()
    h.controller.refresh()
    expect(h.controller.pending()).toBeUndefined()
    expect(h.controller.confirm()).toBe(false)
    expect(h.current().href).toBe('http://localhost/#e')
  })
  it('does not forge an index or rewrite an unmanaged history target', () => {
    const h = fourEntries()
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => ({ dirty: true, busy: false }),
      onBlocked,
    })
    h.unknown()
    const target = structuredClone(h.current())
    expect(onBlocked).toHaveBeenCalledWith({
      kind: 'unmanaged',
      href: target.href,
    })
    h.controller.cancel()
    expect(h.current()).toEqual(target)
    expect(h.jobs).toHaveLength(0)
    expect(
      (h.current().state as Record<string, unknown>)[WORKBENCH_HISTORY_KEY],
    ).toBeUndefined()
  })
  it('does not let stale registrations clear a newer form or approve thrown state checks', () => {
    const h = fourEntries()
    const old = h.controller.register({
      getState: () => ({ dirty: false, busy: false }),
      onBlocked: vi.fn(),
    })
    const onBlocked = vi.fn()
    h.controller.register({
      getState: () => {
        throw new Error('unavailable')
      },
      onBlocked,
    })
    old()
    h.controller.push('#protected')
    expect(h.current().href).toBe('http://localhost/#e')
    expect(onBlocked).toHaveBeenCalledOnce()
  })
})
