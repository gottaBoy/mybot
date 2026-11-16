import { describe, expect, it, vi } from 'vitest'
import {
  allowWorkbenchNavigation,
  readWorkbenchNavigationKind,
  registerNavigationGuard,
  WORKBENCH_NAVIGATION_EVENT,
} from '../src/workbench/navigation-guard'

describe('shared navigation admission', () => {
  it('admits navigation without an active form', () => {
    expect(allowWorkbenchNavigation(new Event('hashchange'))).toBe(true)
  })
  it('shares one rejected decision across route and query listeners', () => {
    const check = vi.fn(() => false)
    const release = registerNavigationGuard(check)
    try {
      const event = new Event('hashchange')
      expect(allowWorkbenchNavigation(event)).toBe(false)
      expect(allowWorkbenchNavigation(event)).toBe(false)
      expect(check).toHaveBeenCalledOnce()
    } finally {
      release()
    }
  })
  it('shares an explicit replay approval without consuming it twice', () => {
    const check = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    const release = registerNavigationGuard(check)
    try {
      const replay = new Event('hashchange')
      expect(allowWorkbenchNavigation(replay)).toBe(true)
      expect(allowWorkbenchNavigation(replay)).toBe(true)
      expect(allowWorkbenchNavigation(new Event('hashchange'))).toBe(false)
      expect(check).toHaveBeenCalledTimes(2)
    } finally {
      release()
    }
  })
  it('does not let an old form cleanup remove a newer guard', () => {
    const old = registerNavigationGuard(() => true)
    const release = registerNavigationGuard(() => false)
    old()
    expect(allowWorkbenchNavigation(new Event('popstate'))).toBe(false)
    release()
    expect(allowWorkbenchNavigation(new Event('popstate'))).toBe(true)
  })
  it('does not reuse decisions from a different form registration', () => {
    const event = new Event('mybot:list-location')
    const old = registerNavigationGuard(() => false)
    expect(allowWorkbenchNavigation(event)).toBe(false)
    const release = registerNavigationGuard(() => true)
    old()
    expect(allowWorkbenchNavigation(event)).toBe(true)
    release()
  })
  it('fails closed if draft admission throws', () => {
    const release = registerNavigationGuard(() => {
      throw new Error('draft check failed')
    })
    try {
      expect(allowWorkbenchNavigation(new Event('hashchange'))).toBe(false)
    } finally {
      release()
    }
  })
})

describe('canonical navigation notification', () => {
  it.each(['push', 'replace', 'traverse'] as const)(
    'reads the validated %s reason',
    (kind) => {
      expect(
        readWorkbenchNavigationKind(
          new CustomEvent(WORKBENCH_NAVIGATION_EVENT, { detail: { kind } }),
        ),
      ).toBe(kind)
    },
  )
  it.each([
    undefined,
    null,
    'traverse',
    ['traverse'],
    {},
    { kind: 'unmanaged' },
    { kind: 1 },
  ])('rejects an untyped or unsupported detail: %j', (detail) => {
    expect(
      readWorkbenchNavigationKind(
        new CustomEvent(WORKBENCH_NAVIGATION_EVENT, { detail }),
      ),
    ).toBeUndefined()
  })
  it('does not infer a reason from another event or a missing detail', () => {
    expect(
      readWorkbenchNavigationKind(
        new CustomEvent('popstate', { detail: { kind: 'traverse' } }),
      ),
    ).toBeUndefined()
    expect(
      readWorkbenchNavigationKind(new Event(WORKBENCH_NAVIGATION_EVENT)),
    ).toBeUndefined()
  })
  it('does not throw when untrusted detail accessors fail', () => {
    const event = new Event(WORKBENCH_NAVIGATION_EVENT)
    Object.defineProperty(event, 'detail', {
      get: () => {
        throw new Error('untrusted detail')
      },
    })
    expect(readWorkbenchNavigationKind(event)).toBeUndefined()
    expect(
      readWorkbenchNavigationKind(
        new CustomEvent(WORKBENCH_NAVIGATION_EVENT, {
          detail: {
            get kind() {
              throw new Error('untrusted kind')
            },
          },
        }),
      ),
    ).toBeUndefined()
  })
  it('publishes a typed CustomEvent that retains canonical admission approval', async () => {
    const windowTarget = new EventTarget()
    const documentTarget = new EventTarget()
    const browserLocation = new URL('http://localhost/#a')
    let entryState: unknown = null
    const browserHistory = {
      get state() {
        return entryState
      },
      pushState(state: unknown, _unused: string, href: string) {
        entryState = state
        browserLocation.href = href
      },
      replaceState(state: unknown, _unused: string, href: string) {
        entryState = state
        browserLocation.href = href
      },
      go: vi.fn(),
    }
    const events: Event[] = []
    windowTarget.addEventListener(WORKBENCH_NAVIGATION_EVENT, (event) => {
      events.push(event)
    })
    vi.resetModules()
    vi.stubGlobal('window', windowTarget)
    vi.stubGlobal('document', documentTarget)
    vi.stubGlobal('location', browserLocation)
    vi.stubGlobal('history', browserHistory)
    try {
      const browser = await import('../src/workbench/navigation-guard')
      const check = vi.fn(() => false)
      const release = browser.registerNavigationGuard(check)
      try {
        expect(browser.pushWorkbenchNavigation('#b')).toBe(true)
        expect(
          browser.pushWorkbenchNavigation('#b?q=changed', { replace: true }),
        ).toBe(true)
        expect(events).toHaveLength(2)
        expect(events.map(browser.readWorkbenchNavigationKind)).toEqual([
          'push',
          'replace',
        ])
        for (const event of events) {
          expect(event).toBeInstanceOf(CustomEvent)
          expect(browser.allowWorkbenchNavigation(event)).toBe(true)
        }
        expect(check).not.toHaveBeenCalled()
      } finally {
        release()
      }
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})
