import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  allowWorkbenchNavigation,
  readWorkbenchNavigationKind,
  WORKBENCH_HISTORY_KEY,
  WORKBENCH_NAVIGATION_EVENT,
} from './navigation-guard'

export type ListContinuityEntry = {
  session: string
  key: string
  href: string
  scopeKey: string
}
export type ListContinuityFocus = {
  kind: 'focus-key' | 'task-trigger'
  value: string
}
export type ListContinuitySnapshot = {
  selected: string
  scrollTop: number
  scrollLeft: number
  focus?: ListContinuityFocus
}

export function managedListContinuityEntry(
  href: string,
  state: unknown,
  scopeKey: string,
): ListContinuityEntry | undefined {
  try {
    if (!state || typeof state !== 'object' || Array.isArray(state))
      return undefined
    const stamp: unknown = (state as Record<string, unknown>)[
      WORKBENCH_HISTORY_KEY
    ]
    if (!stamp || typeof stamp !== 'object' || Array.isArray(stamp))
      return undefined
    const value = stamp as Record<string, unknown>
    if (
      typeof href !== 'string' ||
      !href ||
      typeof scopeKey !== 'string' ||
      typeof value.session !== 'string' ||
      !value.session ||
      typeof value.key !== 'string' ||
      !value.key ||
      !Number.isSafeInteger(value.index) ||
      Number(value.index) < 0 ||
      !Number.isSafeInteger(value.maxIndex) ||
      Number(value.maxIndex) < Number(value.index)
    )
      return undefined
    return { session: value.session, key: value.key, href, scopeKey }
  } catch {
    return undefined
  }
}
function entryKey(entry: ListContinuityEntry) {
  return JSON.stringify([entry.session, entry.key, entry.href, entry.scopeKey])
}
function validEntry(entry: ListContinuityEntry) {
  return (
    typeof entry.session === 'string' &&
    entry.session.length > 0 &&
    typeof entry.key === 'string' &&
    entry.key.length > 0 &&
    typeof entry.href === 'string' &&
    entry.href.length > 0 &&
    typeof entry.scopeKey === 'string'
  )
}
function copySnapshot(
  snapshot: ListContinuitySnapshot,
): ListContinuitySnapshot {
  return {
    selected: snapshot.selected,
    scrollTop: snapshot.scrollTop,
    scrollLeft: snapshot.scrollLeft,
    ...(snapshot.focus
      ? { focus: { kind: snapshot.focus.kind, value: snapshot.focus.value } }
      : {}),
  }
}
function validSnapshot(snapshot: ListContinuitySnapshot) {
  return (
    typeof snapshot.selected === 'string' &&
    Number.isFinite(snapshot.scrollTop) &&
    snapshot.scrollTop >= 0 &&
    Number.isFinite(snapshot.scrollLeft) &&
    (!snapshot.focus ||
      (['focus-key', 'task-trigger'].includes(snapshot.focus.kind) &&
        typeof snapshot.focus.value === 'string' &&
        snapshot.focus.value.length > 0))
  )
}

export function createListContinuityStore(limit = 40) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('list_continuity_limit_invalid')
  const entries = new Map<string, ListContinuitySnapshot>()
  return {
    get size() {
      return entries.size
    },
    save(
      entry: ListContinuityEntry | undefined,
      snapshot: ListContinuitySnapshot,
    ) {
      if (!entry || !validEntry(entry) || !validSnapshot(snapshot)) return false
      const key = entryKey(entry)
      entries.delete(key)
      entries.set(key, copySnapshot(snapshot))
      while (entries.size > limit) entries.delete(entries.keys().next().value!)
      return true
    },
    read(entry: ListContinuityEntry | undefined) {
      if (!entry || !validEntry(entry)) return undefined
      const key = entryKey(entry)
      const value = entries.get(key)
      if (!value) return undefined
      entries.delete(key)
      entries.set(key, value)
      return copySnapshot(value)
    },
    clear() {
      entries.clear()
    },
  }
}

type RestorePlan = {
  selected: string
  unavailableSelection: string | null
  snapshot: ListContinuitySnapshot
  restoreFocus: boolean
}
export type ListRestoreAction =
  | { kind: 'wait' }
  | { kind: 'done' }
  | ({ kind: 'select' } & RestorePlan)
  | ({ kind: 'apply' } & RestorePlan)

export function createListRestoreAttempt(
  snapshot: ListContinuitySnapshot | undefined,
  mode: 'restore' | 'reset',
) {
  const saved =
    snapshot && validSnapshot(snapshot) ? copySnapshot(snapshot) : undefined
  let phase: 'waiting' | 'applying' | 'done' = 'waiting'
  let requested: string | undefined
  let plan: RestorePlan | undefined
  return {
    next(input: {
      ready: boolean
      selected: string
      resultIds: readonly string[]
    }): ListRestoreAction {
      if (phase === 'done' || phase === 'applying') return { kind: 'done' }
      if (mode === 'restore' && !input.ready) return { kind: 'wait' }
      if (!plan) {
        const wanted = mode === 'restore' ? (saved?.selected ?? '') : ''
        const available = !wanted || input.resultIds.includes(wanted)
        plan = {
          selected: available ? wanted : '',
          unavailableSelection: available ? null : wanted,
          snapshot:
            mode === 'restore' && saved
              ? saved
              : { selected: '', scrollTop: 0, scrollLeft: 0 },
          restoreFocus: mode === 'restore' && saved !== undefined,
        }
      }
      if (input.selected !== plan.selected) {
        if (requested === plan.selected) return { kind: 'wait' }
        requested = plan.selected
        return { kind: 'select', ...plan }
      }
      phase = 'applying'
      return { kind: 'apply', ...plan }
    },
    complete() {
      phase = 'done'
    },
  }
}

export const listContinuityCache = createListContinuityStore()
let cacheEpoch = 0
const clearListeners = new Set<() => void>()
export function clearListContinuityCache() {
  listContinuityCache.clear()
  cacheEpoch += 1
  for (const listener of clearListeners) listener()
}
if (typeof window !== 'undefined')
  window.addEventListener('mybot:unauthorized', clearListContinuityCache)

export type ListContinuityOptions = {
  rootRef: RefObject<HTMLElement | null>
  scrollRef?: RefObject<HTMLElement | null>
  selected: string
  onSelectedChange: (selected: string) => void
  resultIds: readonly string[]
  ready: boolean
  scopeKey: string
}

function visible(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest('[hidden], [aria-hidden="true"], [inert]') ||
    element.getAttribute('aria-disabled') === 'true' ||
    ('disabled' in element && element.disabled)
  )
    return false
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth &&
    style.visibility !== 'hidden' &&
    style.visibility !== 'collapse'
  )
}
function scrollTargets(options: ListContinuityOptions) {
  const root = options.rootRef.current
  const vertical =
    options.scrollRef?.current ??
    root?.querySelector<HTMLElement>('[data-list-scroll]') ??
    root?.querySelector<HTMLElement>('.wf-list-body') ??
    root
  const horizontal =
    vertical &&
    [vertical, ...vertical.querySelectorAll<HTMLElement>('*')].find(
      (element) =>
        element.clientWidth > 0 &&
        element.scrollWidth > element.clientWidth + 1 &&
        /auto|scroll/.test(getComputedStyle(element).overflowX),
    )
  return { vertical, horizontal: horizontal ?? vertical }
}
function currentFocus(
  options: ListContinuityOptions,
): ListContinuityFocus | undefined {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return undefined
  const keyed = active.closest<HTMLElement>('[data-list-focus-key]')
  if (
    keyed &&
    (options.rootRef.current?.contains(keyed) ||
      (options.selected && keyed.closest('dialog, [role="dialog"]')))
  )
    return { kind: 'focus-key', value: keyed.dataset.listFocusKey! }
  const task = active.closest<HTMLElement>('[data-task-trigger]')
  return task && options.rootRef.current?.contains(task)
    ? { kind: 'task-trigger', value: task.dataset.taskTrigger! }
    : undefined
}
function focusCandidate(
  options: ListContinuityOptions,
  focus: ListContinuityFocus | undefined,
  selected: string,
  allowFallback: boolean,
) {
  const find = (kind: ListContinuityFocus['kind'], value: string) => {
    const attr =
      kind === 'focus-key' ? 'data-list-focus-key' : 'data-task-trigger'
    return [...document.querySelectorAll<HTMLElement>(`[${attr}]`)].find(
      (element) => element.getAttribute(attr) === value && visible(element),
    )
  }
  const exact = focus && find(focus.kind, focus.value)
  if (focus && !exact && !allowFallback) return undefined
  return (
    exact ||
    (selected && find('task-trigger', selected)) ||
    (options.rootRef.current && visible(options.rootRef.current)
      ? options.rootRef.current
      : undefined)
  )
}

/**
 * The owner supplies the real result IDs and skips its inspector-heading focus
 * when consumeInspectorFocusSuppression() returns true.
 */
export function useListContinuity(options: ListContinuityOptions) {
  const latest = useRef(options)
  latest.current = options
  const accepted = useRef<ListContinuityEntry | undefined>(undefined)
  const navigationKind = useRef<'restore' | 'reset'>('restore')
  const [version, setVersion] = useState(0)
  const [restoring, setRestoring] = useState(false)
  const [unavailableSelection, setUnavailableSelection] = useState<
    string | null
  >(null)
  const suppression = useRef<string | null>(null)
  const frame = useRef<number | undefined>(undefined)
  const generation = useRef(0)
  const attempt = useRef<
    | {
        key: string
        version: number
        restore: ReturnType<typeof createListRestoreAttempt>
        done: boolean
      }
    | undefined
  >(undefined)
  const cancelFrame = useCallback(() => {
    generation.current += 1
    if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    frame.current = undefined
  }, [])
  const saveSnapshot = useCallback(() => {
    const current = latest.current
    if (
      !current.ready ||
      !current.rootRef.current?.isConnected ||
      !accepted.current
    )
      return
    const targets = scrollTargets(current)
    listContinuityCache.save(accepted.current, {
      selected: current.selected,
      scrollTop: targets.vertical?.scrollTop ?? 0,
      scrollLeft: targets.horizontal?.scrollLeft ?? 0,
      focus: currentFocus(current),
    })
  }, [])
  const consumeInspectorFocusSuppression = useCallback(() => {
    const expected = suppression.current
    suppression.current = null
    return expected !== null && expected === latest.current.selected
  }, [])
  useLayoutEffect(() => {
    const navigation = (event: Event) => {
      if (!allowWorkbenchNavigation(event)) return
      saveSnapshot()
      cancelFrame()
      navigationKind.current =
        readWorkbenchNavigationKind(event) === 'traverse' ? 'restore' : 'reset'
      suppression.current = null
      setRestoring(false)
      setUnavailableSelection(null)
      setVersion((value) => value + 1)
    }
    const clear = () => {
      cancelFrame()
      attempt.current = undefined
      accepted.current = undefined
      suppression.current = null
      setRestoring(false)
      setUnavailableSelection(null)
    }
    clearListeners.add(clear)
    window.addEventListener(WORKBENCH_NAVIGATION_EVENT, navigation, true)
    return () => {
      clearListeners.delete(clear)
      if (
        frame.current !== undefined &&
        attempt.current &&
        !attempt.current.done
      )
        attempt.current = undefined
      cancelFrame()
      window.removeEventListener(WORKBENCH_NAVIGATION_EVENT, navigation, true)
    }
  }, [cancelFrame, saveSnapshot])
  const resultsKey = JSON.stringify(options.resultIds)
  useLayoutEffect(() => {
    const current = latest.current
    const entry = managedListContinuityEntry(
      location.href,
      history.state,
      current.scopeKey,
    )
    if (!entry) {
      accepted.current = undefined
      attempt.current = undefined
      cancelFrame()
      setRestoring(false)
      return
    }
    const key = entryKey(entry)
    if (
      !attempt.current ||
      attempt.current.key !== key ||
      attempt.current.version !== version
    ) {
      const sameNavigation = attempt.current?.version === version
      attempt.current = {
        key,
        version,
        done: false,
        restore: createListRestoreAttempt(
          listContinuityCache.read(entry),
          sameNavigation ? 'reset' : navigationKind.current,
        ),
      }
      accepted.current = entry
      setUnavailableSelection(null)
    }
    const pending = attempt.current
    if (pending.done) {
      if (
        current.ready &&
        current.selected &&
        !current.resultIds.includes(current.selected)
      ) {
        setUnavailableSelection(current.selected)
        current.onSelectedChange('')
      } else if (current.selected) setUnavailableSelection(null)
      if (suppression.current !== current.selected) suppression.current = null
      return
    }
    const action = pending.restore.next(current)
    if (action.kind === 'wait' || action.kind === 'done') return
    setUnavailableSelection(action.unavailableSelection)
    if (action.kind === 'select') {
      if (action.restoreFocus && action.selected)
        suppression.current = action.selected
      setRestoring(action.restoreFocus)
      current.onSelectedChange(action.selected)
      return
    }
    const targets = scrollTargets(current)
    if (targets.vertical) targets.vertical.scrollTop = action.snapshot.scrollTop
    if (targets.horizontal)
      targets.horizontal.scrollLeft = action.snapshot.scrollLeft
    const complete = () => {
      pending.done = true
      pending.restore.complete()
      setRestoring(false)
    }
    if (!action.restoreFocus) {
      complete()
      return
    }
    setRestoring(true)
    const token = generation.current
    const epoch = cacheEpoch
    let tries = 0
    let layoutFrames = 0
    const focus = () => {
      frame.current = undefined
      if (token !== generation.current || epoch !== cacheEpoch) return
      const now = latest.current
      if (layoutFrames < 2) {
        const settled = scrollTargets(now)
        if (settled.vertical)
          settled.vertical.scrollTop = action.snapshot.scrollTop
        if (settled.horizontal)
          settled.horizontal.scrollLeft = action.snapshot.scrollLeft
        layoutFrames += 1
        frame.current = requestAnimationFrame(focus)
        return
      }
      const missing =
        action.selected && !now.resultIds.includes(action.selected)
      if (missing) {
        setUnavailableSelection(action.selected)
        now.onSelectedChange('')
      }
      const target = focusCandidate(
        now,
        missing ? undefined : action.snapshot.focus,
        missing ? '' : action.selected,
        tries >= 8 || Boolean(missing),
      )
      target?.focus({ preventScroll: true })
      if (target && document.activeElement === target) {
        complete()
        return
      }
      if (++tries < 20) frame.current = requestAnimationFrame(focus)
      else complete()
    }
    frame.current = requestAnimationFrame(focus)
  }, [
    version,
    options.scopeKey,
    options.ready,
    options.selected,
    resultsKey,
    cancelFrame,
  ])
  return {
    unavailableSelection,
    restoring,
    saveSnapshot,
    consumeInspectorFocusSuppression,
  }
}
