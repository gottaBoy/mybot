export const WORKBENCH_NAVIGATION_EVENT = 'mybot:navigation'
export const WORKBENCH_HISTORY_KEY = '__mybotNavigation'

export type WorkbenchNavigationKind = 'push' | 'replace' | 'traverse'

export function readWorkbenchNavigationKind(
  event: Event,
): WorkbenchNavigationKind | undefined {
  try {
    if (event.type !== WORKBENCH_NAVIGATION_EVENT) return undefined
    const detail: unknown = (event as CustomEvent<unknown>).detail
    if (!detail || typeof detail !== 'object' || Array.isArray(detail))
      return undefined
    const kind = (detail as Record<string, unknown>).kind
    return kind === 'push' || kind === 'replace' || kind === 'traverse'
      ? kind
      : undefined
  } catch {
    return undefined
  }
}

type Stamp = {
  session: string
  index: number
  key: string
  maxIndex: number
}
type Entry = { href: string; state: unknown; stamp?: Stamp }
export type NavigationIntent =
  | { kind: 'push' | 'replace'; href: string; state?: unknown }
  | { kind: 'traverse'; index: number; href?: string; key?: string }
  | { kind: 'unmanaged'; href: string }
export type NavigationBlocker = {
  getState: () => { dirty: boolean; busy: boolean }
  onBlocked: (intent: NavigationIntent) => void
  onReset?: () => void
}
export type NavigationHistoryPort = {
  read: () => { href: string; state: unknown }
  push: (state: unknown, href: string) => void
  replace: (state: unknown, href: string) => void
  go: (
    delta: number,
    destination: Pick<Stamp, 'session' | 'index'> & { key?: string },
  ) => void
  sync?: () => void
  publish: (kind: WorkbenchNavigationKind) => void
}

function stampOf(state: unknown): Stamp | undefined {
  if (!state || typeof state !== 'object' || Array.isArray(state))
    return undefined
  const stamp = (state as Record<string, unknown>)[WORKBENCH_HISTORY_KEY]
  if (!stamp || typeof stamp !== 'object') return undefined
  const value = stamp as Partial<Stamp>
  return typeof value.session === 'string' &&
    typeof value.key === 'string' &&
    Number.isSafeInteger(value.index) &&
    Number(value.index) >= 0 &&
    Number.isSafeInteger(value.maxIndex) &&
    Number(value.maxIndex) >= Number(value.index)
    ? (value as Stamp)
    : undefined
}
function stamped(state: unknown, stamp: Stamp) {
  const original =
    state !== null && typeof state === 'object' && !Array.isArray(state)
      ? (state as Record<string, unknown>)
      : state == null
        ? {}
        : { __mybotNavigationOriginalState: state }
  return { ...original, [WORKBENCH_HISTORY_KEY]: stamp }
}
function sameEntry(a: Entry, b: Entry) {
  return (
    !!a.stamp &&
    !!b.stamp &&
    a.stamp.session === b.stamp.session &&
    a.stamp.key === b.stamp.key &&
    a.stamp.index === b.stamp.index &&
    a.href === b.href
  )
}

/**
 * Native traversal cannot be cancelled. Bounce to the accepted entry without
 * editing the target, then replay the retained delta only after confirmation.
 */
export function createNavigationHistoryController(
  port: NavigationHistoryPort,
  createId: () => string = () => crypto.randomUUID(),
) {
  const first = port.read()
  const existing = stampOf(first.state)
  let session = existing?.session ?? createId()
  let ceiling = existing?.maxIndex ?? 0
  let accepted: Entry = {
    ...first,
    stamp: existing ?? { session, index: 0, maxIndex: 0, key: createId() },
  }
  if (!existing) {
    accepted.state = stamped(first.state, accepted.stamp!)
    port.replace(accepted.state, accepted.href)
  }
  port.sync?.()
  let physical = accepted
  const entries = new Map<number, Entry>([[accepted.stamp!.index, accepted]])
  let guard: (NavigationBlocker & { approved: boolean }) | undefined
  let pending: NavigationIntent | undefined
  let notified = false
  let approvedPending = false
  let travel:
    { kind: 'restore' | 'commit'; index: number; key?: string } | undefined

  const state = () => {
    if (!guard || guard.approved) return { dirty: false, busy: false }
    try {
      return guard.getState()
    } catch {
      return { dirty: true, busy: false }
    }
  }
  const owned = (entry: Entry) => entry.stamp?.session === session
  const atAccepted = () => sameEntry(physical, accepted)
  function clearPending(notify = false) {
    pending = undefined
    notified = false
    approvedPending = false
    if (notify) guard?.onReset?.()
  }
  function accept(entry: Entry) {
    accepted = entry
    physical = entry
    if (owned(entry)) {
      ceiling = Math.max(ceiling, entry.stamp!.maxIndex, entry.stamp!.index)
      entries.set(entry.stamp!.index, entry)
      if (entry.stamp!.maxIndex !== ceiling) {
        const stamp = { ...entry.stamp!, maxIndex: ceiling }
        const updated = { ...entry, stamp, state: stamped(entry.state, stamp) }
        accepted = physical = updated
        entries.set(stamp.index, updated)
        port.replace(updated.state, updated.href)
      }
      port.sync?.()
    }
    port.publish('traverse')
  }
  function notify() {
    if (!pending || notified || state().busy) return
    if (pending.kind !== 'unmanaged' && !atAccepted()) return
    if (!state().dirty) {
      confirm()
      return
    }
    notified = true
    guard?.onBlocked(pending)
  }
  function restore() {
    if (atAccepted()) {
      if (approvedPending) commit()
      else notify()
      return
    }
    if (travel) return
    if (!owned(physical) || !owned(accepted)) {
      pending = { kind: 'unmanaged', href: physical.href }
      notified = false
      notify()
      return
    }
    travel = {
      kind: 'restore',
      index: accepted.stamp!.index,
      key: accepted.stamp!.key,
    }
    port.go(accepted.stamp!.index - physical.stamp!.index, accepted.stamp!)
  }
  function write(
    intent: Extract<NavigationIntent, { kind: 'push' | 'replace' }>,
  ) {
    const current = port.read()
    const currentStamp = stampOf(current.state)
    const canReplace =
      intent.kind === 'replace' && currentStamp?.session === session
    if (intent.kind === 'replace' && !canReplace) {
      pending = { kind: 'unmanaged', href: current.href }
      notified = false
      notify()
      return false
    }
    // An explicit push may start a new managed segment after an unmanaged entry.
    if (!currentStamp || currentStamp.session !== session) {
      session = createId()
      entries.clear()
      ceiling = -1
    }
    const index = canReplace
      ? currentStamp!.index
      : owned(accepted)
        ? accepted.stamp!.index + 1
        : 0
    if (!canReplace) ceiling = index
    const stamp: Stamp = {
      session,
      index,
      maxIndex: ceiling,
      key: canReplace ? currentStamp!.key : createId(),
    }
    const value =
      intent.state === undefined && canReplace ? current.state : intent.state
    const entry = { href: intent.href, state: stamped(value, stamp), stamp }
    if (canReplace) port.replace(entry.state, entry.href)
    else {
      for (const key of entries.keys()) if (key >= index) entries.delete(key)
      port.push(entry.state, entry.href)
    }
    clearPending()
    accepted = physical = entry
    entries.set(index, entry)
    port.publish(intent.kind)
    return true
  }
  function commit() {
    if (!pending) return false
    if (travel?.kind === 'commit') return true
    if (pending.kind === 'unmanaged') {
      const current = port.read()
      clearPending()
      accept({ ...current, stamp: stampOf(current.state) })
      return true
    }
    if (!atAccepted()) {
      approvedPending = true
      restore()
      return true
    }
    if (pending.kind === 'push' || pending.kind === 'replace')
      return write(pending)
    const destination = pending
    if (destination.kind !== 'traverse') return false
    if (destination.index === accepted.stamp?.index) {
      clearPending(true)
      return false
    }
    travel = { kind: 'commit', index: destination.index, key: destination.key }
    port.go(destination.index - accepted.stamp!.index, {
      session,
      index: destination.index,
      key: destination.key,
    })
    return true
  }
  function confirm() {
    if (!pending) return false
    if (guard) guard.approved = true
    approvedPending = true
    return commit()
  }
  function arrival() {
    const current = port.read()
    const incoming: Entry = { ...current, stamp: stampOf(current.state) }
    if (
      sameEntry(incoming, physical) ||
      (!incoming.stamp && incoming.href === physical.href)
    )
      return
    if (
      travel &&
      owned(incoming) &&
      incoming.stamp!.index === travel.index &&
      (!travel.key || incoming.stamp!.key === travel.key)
    ) {
      const kind = travel.kind
      travel = undefined
      physical = incoming
      if (kind === 'restore') {
        if (approvedPending) commit()
        else notify()
      } else {
        clearPending()
        accept(incoming)
      }
      return
    }
    const blocked = state()
    if (!blocked.dirty && !blocked.busy) {
      travel = undefined
      clearPending()
      accept(incoming)
      return
    }
    if (!owned(incoming) || !owned(physical) || !owned(accepted)) {
      physical = incoming
      travel = undefined
      pending = { kind: 'unmanaged', href: incoming.href }
      notified = false
      notify()
      return
    }
    entries.set(incoming.stamp!.index, incoming)
    ceiling = Math.max(ceiling, incoming.stamp!.maxIndex)
    const delta = incoming.stamp!.index - physical.stamp!.index
    const index = Math.max(
      0,
      Math.min(
        ceiling,
        pending?.kind === 'traverse'
          ? pending.index + delta
          : incoming.stamp!.index,
      ),
    )
    physical = incoming
    if (index === accepted.stamp!.index) {
      clearPending(true)
    } else {
      const known = entries.get(index)
      pending = {
        kind: 'traverse',
        index,
        href: known?.href,
        key: known?.stamp?.key,
      }
    }
    restore()
  }

  return {
    arrival,
    push(href: string, options: { replace?: boolean; state?: unknown } = {}) {
      const destination = new URL(href, accepted.href).href
      if (destination === accepted.href && atAccepted()) return true
      const intent: NavigationIntent = {
        kind: options.replace ? 'replace' : 'push',
        href: destination,
        state: options.state,
      }
      const blocked = state()
      if (blocked.dirty || blocked.busy || travel) {
        pending = intent
        approvedPending = false
        restore()
        return false
      }
      return write(intent)
    },
    register(blocker: NavigationBlocker) {
      const registration = { ...blocker, approved: false }
      guard = registration
      return () => {
        if (guard !== registration) return
        if (!registration.approved) clearPending()
        guard = undefined
      }
    },
    confirm,
    cancel() {
      clearPending(true)
    },
    refresh() {
      if (pending) {
        if (!state().busy && !state().dirty) confirm()
        else notify()
      }
    },
    reset() {
      clearPending(true)
      guard = undefined
      travel = undefined
      const current = port.read()
      accepted = physical = { ...current, stamp: stampOf(current.state) }
    },
    travelFailed() {
      if (!travel) return
      const current = port.read()
      physical = { ...current, stamp: stampOf(current.state) }
      travel = undefined
      approvedPending = false
      if (guard) guard.approved = false
      pending = { kind: 'unmanaged', href: current.href }
      notified = false
      notify()
    },
    pending: () => pending,
  }
}

type LegacyGuard = { check: (event: Event) => boolean }
let current: LegacyGuard | undefined
const decisions = new WeakMap<Event, { guard: LegacyGuard; allowed: boolean }>()
const approvedEvents = new WeakSet<Event>()
let browserController:
  ReturnType<typeof createNavigationHistoryController> | undefined
type NativeHistoryEntry = {
  key: string
  sameDocument: boolean
  getState: () => unknown
}
type NativeNavigation = {
  currentEntry?: NativeHistoryEntry
  entries: () => NativeHistoryEntry[]
  updateCurrentEntry: (options: { state: unknown }) => void
  traverseTo: (key: string) => {
    committed: Promise<unknown>
    finished: Promise<unknown>
  }
}

export function initializeWorkbenchNavigation() {
  if (browserController || typeof window === 'undefined') return
  const native = (window as unknown as { navigation?: NativeNavigation })
    .navigation
  const absolute =
    native &&
    typeof native.entries === 'function' &&
    typeof native.updateCurrentEntry === 'function' &&
    typeof native.traverseTo === 'function'
  const sync = () => {
    if (!absolute || !native.currentEntry) return
    const stamp = stampOf(history.state)
    if (!stamp) return
    try {
      const value = native.currentEntry.getState()
      if (JSON.stringify(stampOf(value)) !== JSON.stringify(stamp))
        native.updateCurrentEntry({ state: stamped(value, stamp) })
    } catch {
      // An unavailable native state store does not grant ownership to other entries.
    }
  }
  let traversalToken = 0
  browserController = createNavigationHistoryController({
    read: () => ({ href: location.href, state: history.state }),
    push: (state, href) => {
      history.pushState(state, '', href)
      sync()
    },
    replace: (state, href) => {
      history.replaceState(state, '', href)
      sync()
    },
    sync,
    go: (delta, destination) => {
      if (!absolute) {
        history.go(delta)
        return
      }
      const token = ++traversalToken
      let reported = false
      const rejected = () => {
        if (reported || token !== traversalToken) return
        reported = true
        queueMicrotask(() => browserController?.travelFailed())
      }
      try {
        const target = native.entries().find((entry) => {
          if (!entry.sameDocument) return false
          const stamp = stampOf(entry.getState())
          return (
            stamp?.session === destination.session &&
            stamp.index === destination.index &&
            (!destination.key || stamp.key === destination.key)
          )
        })
        if (!target) {
          rejected()
          return
        }
        const operation = native.traverseTo(target.key)
        void operation.committed.catch(rejected)
        void operation.finished.catch(rejected)
      } catch {
        rejected()
      }
    },
    publish: (kind) => {
      const event = new CustomEvent(WORKBENCH_NAVIGATION_EVENT, {
        detail: { kind },
      })
      approvedEvents.add(event)
      window.dispatchEvent(event)
    },
  })
  const arrival = () => browserController!.arrival()
  window.addEventListener('popstate', arrival, true)
  window.addEventListener('hashchange', arrival, true)
  window.addEventListener('mybot:list-location', arrival, true)
  window.addEventListener(
    'mybot:unauthorized',
    () => resetWorkbenchNavigation(),
    true,
  )
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const link = (event.target as Element | null)?.closest?.(
      'a[href]',
    ) as HTMLAnchorElement | null
    if (
      !link ||
      (link.target && link.target !== '_self') ||
      link.hasAttribute('download')
    )
      return
    const destination = new URL(link.href, location.href)
    if (
      destination.origin !== location.origin ||
      destination.pathname !== location.pathname
    )
      return
    if (destination.href === location.href) return
    event.preventDefault()
    pushWorkbenchNavigation(destination.href)
  })
}

export function pushWorkbenchNavigation(
  href: string,
  options: { replace?: boolean; state?: unknown } = {},
) {
  initializeWorkbenchNavigation()
  if (!browserController) return false
  const destination = new URL(href, location.href)
  if (
    destination.origin !== location.origin ||
    destination.pathname !== location.pathname
  )
    throw new Error('workbench_navigation_requires_same_document')
  return browserController.push(destination.href, options)
}
export function registerWorkbenchNavigationBlocker(blocker: NavigationBlocker) {
  initializeWorkbenchNavigation()
  return browserController?.register(blocker) ?? (() => {})
}
export function confirmWorkbenchNavigation() {
  return browserController?.confirm() ?? false
}
export function cancelWorkbenchNavigation() {
  browserController?.cancel()
}
export function refreshWorkbenchNavigationBlocker() {
  browserController?.refresh()
}
export function resetWorkbenchNavigation() {
  browserController?.reset()
}

// Retained for consumers/tests of the previous event-level admission contract.
export function registerNavigationGuard(check: LegacyGuard['check']) {
  const guard = { check }
  current = guard
  return () => {
    if (current === guard) current = undefined
  }
}
export function allowWorkbenchNavigation(event: Event) {
  if (approvedEvents.has(event)) return true
  const guard = current
  if (!guard) return !browserController
  const previous = decisions.get(event)
  if (previous?.guard === guard) return previous.allowed
  let allowed = false
  try {
    allowed = guard.check(event)
  } catch {
    // A failed draft check must not authorize navigation.
  }
  decisions.set(event, { guard, allowed })
  return allowed
}

initializeWorkbenchNavigation()
