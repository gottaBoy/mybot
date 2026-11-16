import { afterEach, describe, expect, it, vi } from 'vitest'
import { WORKBENCH_HISTORY_KEY } from '../src/workbench/navigation-guard'
import {
  clearListContinuityCache,
  createListContinuityStore,
  createListRestoreAttempt,
  listContinuityCache,
  managedListContinuityEntry,
  type ListContinuityEntry,
  type ListContinuitySnapshot,
} from '../src/workbench/list-continuity'

function entry(
  key = 'entry-a',
  overrides: Partial<ListContinuityEntry> = {},
): ListContinuityEntry {
  return {
    session: 'session-a',
    key,
    href: 'http://localhost/#workbench?page=1',
    scopeKey: '',
    ...overrides,
  }
}
function snapshot(
  overrides: Partial<ListContinuitySnapshot> = {},
): ListContinuitySnapshot {
  return {
    selected: 'task-a',
    scrollTop: 480,
    scrollLeft: 75,
    focus: { kind: 'focus-key', value: 'latest-run:task-a' },
    ...overrides,
  }
}
afterEach(() => {
  clearListContinuityCache()
  vi.unstubAllGlobals()
})

describe('managed list entry identity', () => {
  it('extracts only the managed identity and explicit scope, never business history payload', () => {
    const identity = managedListContinuityEntry(
      'http://localhost/#project/a?page=2',
      {
        [WORKBENCH_HISTORY_KEY]: {
          session: 's',
          key: 'k',
          index: 2,
          maxIndex: 4,
        },
        formDraft: 'must not be cached',
      },
      'project:a',
    )
    expect(identity).toEqual({
      session: 's',
      key: 'k',
      href: 'http://localhost/#project/a?page=2',
      scopeKey: 'project:a',
    })
    expect(identity).not.toHaveProperty('index')
    expect(identity).not.toHaveProperty('formDraft')
  })
  it.each([
    undefined,
    null,
    [],
    {},
    { key: 'not-managed', index: 1 },
    { [WORKBENCH_HISTORY_KEY]: {} },
    { [WORKBENCH_HISTORY_KEY]: { session: 's', key: 'k' } },
    {
      [WORKBENCH_HISTORY_KEY]: { session: '', key: 'k', index: 0, maxIndex: 0 },
    },
    {
      [WORKBENCH_HISTORY_KEY]: { session: 's', key: '', index: 0, maxIndex: 0 },
    },
    {
      [WORKBENCH_HISTORY_KEY]: {
        session: 's',
        key: 'k',
        index: -1,
        maxIndex: 1,
      },
    },
    {
      [WORKBENCH_HISTORY_KEY]: {
        session: 's',
        key: 'k',
        index: 1.5,
        maxIndex: 2,
      },
    },
    {
      [WORKBENCH_HISTORY_KEY]: {
        session: 's',
        key: 'k',
        index: 2,
        maxIndex: 1,
      },
    },
    {
      [WORKBENCH_HISTORY_KEY]: {
        session: 's',
        key: 'k',
        index: 0,
        maxIndex: Infinity,
      },
    },
  ])(
    'does not guess an entry from malformed or unmanaged state %j',
    (state) => {
      expect(
        managedListContinuityEntry('http://localhost/#workbench', state, ''),
      ).toBeUndefined()
    },
  )
  it('fails closed for inaccessible history state', () => {
    const state = new Proxy(
      {},
      {
        get: () => {
          throw new Error('not accessible')
        },
      },
    )
    expect(() =>
      managedListContinuityEntry('http://localhost/#workbench', state, ''),
    ).not.toThrow()
    expect(
      managedListContinuityEntry('http://localhost/#workbench', state, ''),
    ).toBeUndefined()
  })
})

describe('bounded memory-only list snapshots', () => {
  it('keeps at most forty entries by default', () => {
    const store = createListContinuityStore()
    for (let index = 0; index < 45; index++)
      store.save(entry(`entry-${index}`), snapshot({ scrollTop: index }))
    expect(store.size).toBe(40)
    expect(store.read(entry('entry-4'))).toBeUndefined()
    expect(store.read(entry('entry-5'))?.scrollTop).toBe(5)
    expect(store.read(entry('entry-44'))?.scrollTop).toBe(44)
  })
  it('uses LRU reads without growing the store or conflating history entries', () => {
    const store = createListContinuityStore(2)
    store.save(entry('a'), snapshot({ selected: 'task-a' }))
    store.save(entry('b'), snapshot({ selected: 'task-b' }))
    expect(store.read(entry('a'))?.selected).toBe('task-a')
    store.save(entry('c'), snapshot({ selected: 'task-c' }))
    expect(store.read(entry('b'))).toBeUndefined()
    expect(store.read(entry('a'))?.selected).toBe('task-a')
    expect(store.size).toBe(2)
  })
  it.each([
    { session: 'session-b' },
    { key: 'entry-b' },
    { href: 'http://localhost/#workbench?page=2' },
    { href: 'http://localhost/#workbench?page=1&view=table' },
    { scopeKey: 'project:a' },
  ])(
    'requires the exact session, entry key, href and fixed scope %j',
    (difference) => {
      const store = createListContinuityStore()
      store.save(entry(), snapshot())
      expect(store.read(entry('entry-a', difference))).toBeUndefined()
      expect(store.read(entry())?.selected).toBe('task-a')
    },
  )
  it('does not create or return a snapshot for an absent entry identity', () => {
    const store = createListContinuityStore()
    expect(store.save(undefined, snapshot())).toBe(false)
    expect(store.read(undefined)).toBeUndefined()
    expect(store.save(entry('', { href: '' }), snapshot())).toBe(false)
    expect(store.size).toBe(0)
  })
  it.each([0, -1, 1.5, 101, NaN, Infinity])(
    'rejects an unbounded or invalid cache limit %s',
    (limit) => {
      expect(() => createListContinuityStore(limit)).toThrow(
        'list_continuity_limit_invalid',
      )
    },
  )
  it.each([
    { scrollTop: NaN },
    { scrollTop: -1 },
    { scrollTop: Infinity },
    { scrollLeft: NaN },
    { scrollLeft: Infinity },
    { selected: null },
    { focus: { kind: 'unknown', value: 'task-a' } },
    { focus: { kind: 'focus-key', value: '' } },
  ])('does not persist malformed snapshot values %j', (patch) => {
    const store = createListContinuityStore()
    expect(
      store.save(entry(), {
        ...snapshot(),
        ...patch,
      } as unknown as ListContinuitySnapshot),
    ).toBe(false)
    expect(store.size).toBe(0)
  })
  it('copies only selected ID, scroll coordinates and named focus metadata', () => {
    const store = createListContinuityStore()
    const input = {
      ...snapshot(),
      formDraft: 'unsaved notes',
      modelOutput: 'private output',
      consent: true,
      focus: {
        kind: 'focus-key',
        value: 'latest-run:task-a',
        token: 'not copied',
      },
    }
    const before = structuredClone(input)
    Object.freeze(input)
    Object.freeze(input.focus)
    expect(store.save(entry(), input as ListContinuitySnapshot)).toBe(true)
    const read = store.read(entry())!
    expect(read).toEqual(snapshot())
    expect(read).not.toHaveProperty('formDraft')
    expect(read.focus).not.toHaveProperty('token')
    read.selected = 'changed by consumer'
    read.focus!.value = 'changed by consumer'
    expect(store.read(entry())).toEqual(snapshot())
    expect(input).toEqual(before)
  })
  it('can preserve a signed horizontal offset without inventing a vertical position', () => {
    const store = createListContinuityStore()
    store.save(entry(), snapshot({ scrollTop: 0, scrollLeft: -24 }))
    expect(store.read(entry())?.scrollLeft).toBe(-24)
  })
  it('does not write preferences or browser history when saving and restoring memory', () => {
    const setItem = vi.fn()
    const pushState = vi.fn()
    const replaceState = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    vi.stubGlobal('history', { pushState, replaceState })
    const store = createListContinuityStore()
    store.save(entry(), snapshot())
    store.read(entry())
    store.clear()
    expect(setItem).not.toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).not.toHaveBeenCalled()
  })
  it('clears every cached scope on authentication reset and starts empty after a fresh module lifetime', () => {
    listContinuityCache.save(entry(), snapshot())
    listContinuityCache.save(
      entry('other', { scopeKey: 'project:b' }),
      snapshot(),
    )
    clearListContinuityCache()
    expect(listContinuityCache.size).toBe(0)
    expect(listContinuityCache.read(entry())).toBeUndefined()
    expect(createListContinuityStore().size).toBe(0)
  })
})

describe('one-shot restore decisions', () => {
  it('waits for real ready results, requests selection only once and applies coordinates after selection renders', () => {
    const saved = snapshot()
    const attempt = createListRestoreAttempt(saved, 'restore')
    expect(attempt.next({ ready: false, selected: '', resultIds: [] })).toEqual(
      { kind: 'wait' },
    )
    expect(
      attempt.next({ ready: false, selected: '', resultIds: ['task-a'] }),
    ).toEqual({ kind: 'wait' })
    expect(
      attempt.next({ ready: true, selected: '', resultIds: ['task-a'] }),
    ).toMatchObject({
      kind: 'select',
      selected: 'task-a',
      unavailableSelection: null,
      restoreFocus: true,
    })
    expect(
      attempt.next({ ready: true, selected: '', resultIds: ['task-a'] }),
    ).toEqual({ kind: 'wait' })
    expect(
      attempt.next({ ready: true, selected: 'task-a', resultIds: ['task-a'] }),
    ).toMatchObject({
      kind: 'apply',
      selected: 'task-a',
      snapshot: saved,
      restoreFocus: true,
    })
    expect(
      attempt.next({ ready: true, selected: 'task-a', resultIds: ['task-a'] }),
    ).toEqual({ kind: 'done' })
    attempt.complete()
    expect(
      attempt.next({ ready: true, selected: 'task-b', resultIds: ['task-b'] }),
    ).toEqual({ kind: 'done' })
  })
  it('keeps a missing or moved selected task explicit without selecting the first available record', () => {
    const attempt = createListRestoreAttempt(snapshot(), 'restore')
    expect(
      attempt.next({
        ready: true,
        selected: '',
        resultIds: ['different-task'],
      }),
    ).toMatchObject({
      kind: 'apply',
      selected: '',
      unavailableSelection: 'task-a',
      restoreFocus: true,
      snapshot: { scrollTop: 480, scrollLeft: 75 },
    })
  })
  it('clears selection and scroll for a new query/page/view entry even if a snapshot was supplied', () => {
    const attempt = createListRestoreAttempt(snapshot(), 'reset')
    expect(
      attempt.next({ ready: false, selected: 'task-a', resultIds: ['task-a'] }),
    ).toMatchObject({
      kind: 'select',
      selected: '',
      unavailableSelection: null,
      restoreFocus: false,
    })
    const action = attempt.next({
      ready: true,
      selected: '',
      resultIds: ['task-a'],
    })
    expect(action).toMatchObject({
      kind: 'apply',
      selected: '',
      snapshot: { selected: '', scrollTop: 0, scrollLeft: 0 },
      restoreFocus: false,
    })
  })
  it('does not guess a saved position when a managed entry has no cache', () => {
    const attempt = createListRestoreAttempt(undefined, 'restore')
    expect(
      attempt.next({ ready: true, selected: '', resultIds: ['task-a'] }),
    ).toEqual({
      kind: 'apply',
      selected: '',
      unavailableSelection: null,
      snapshot: { selected: '', scrollTop: 0, scrollLeft: 0 },
      restoreFocus: false,
    })
  })
  it('restores scroll with no selection without manufacturing an active row', () => {
    const attempt = createListRestoreAttempt(
      snapshot({ selected: '' }),
      'restore',
    )
    expect(
      attempt.next({ ready: true, selected: '', resultIds: ['task-b'] }),
    ).toMatchObject({
      kind: 'apply',
      selected: '',
      unavailableSelection: null,
      restoreFocus: true,
    })
  })
  it('copies a source snapshot and never reapplies on later data or theme renders', () => {
    const saved = snapshot()
    const before = structuredClone(saved)
    Object.freeze(saved)
    Object.freeze(saved.focus!)
    const attempt = createListRestoreAttempt(saved, 'restore')
    const first = attempt.next({
      ready: true,
      selected: 'task-a',
      resultIds: ['task-a'],
    })
    expect(first).toHaveProperty('kind', 'apply')
    attempt.complete()
    for (const resultIds of [['task-a'], ['task-b'], []])
      expect(
        attempt.next({ ready: true, selected: 'task-b', resultIds }),
      ).toEqual({ kind: 'done' })
    expect(saved).toEqual(before)
  })
})
