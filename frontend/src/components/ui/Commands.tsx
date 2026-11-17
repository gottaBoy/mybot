import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import {
  CommandPalette,
  CommandPaletteInput,
  useCommandPaletteContext,
} from '@astryxdesign/core/CommandPalette'
import type { SearchableItem, SearchSource } from '@astryxdesign/core/Typeahead'

export type AppCommand = {
  id: string
  label: string
  group: string
  keywords?: string[]
  onSelect: () => void
}
export type AppCommandSearchResult = {
  items: AppCommand[]
  total: number
  count: number
  hasMore: boolean
}
export type AppCommandSearchStatus =
  | { kind: 'loading' }
  | { kind: 'ready'; total: number; count: number; hasMore: boolean }
  | { kind: 'error'; error: unknown }

type SearchItem = SearchableItem<{
  group: string
  keywords: string[]
  generation?: number
}>

function toSearchable(items: AppCommand[], generation?: number): SearchItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    auxiliaryData: {
      group: item.group,
      keywords: item.keywords ?? [],
      generation,
    },
  }))
}

function localMatches(items: AppCommand[], query: string) {
  const term = query.trim().toLowerCase()
  return items.filter(
    (item) =>
      !term ||
      [item.label, ...(item.keywords ?? [])].some((value) =>
        value.toLowerCase().includes(term),
      ),
  )
}
export function isAppCommandSelectionCurrent(
  id: string | undefined,
  generation: string | undefined,
  currentGeneration: number,
  pending: boolean,
  commands: ReadonlyMap<string, AppCommand>,
) {
  return (
    !pending &&
    generation === String(currentGeneration) &&
    id !== undefined &&
    commands.has(id)
  )
}

function SearchFeedback({
  render,
  status,
  currentQuery,
  onRetry,
}: {
  render?: (status: AppCommandSearchStatus, retry: () => void) => ReactNode
  status: AppCommandSearchStatus
  currentQuery: () => string
  onRetry: () => void
}) {
  const palette = useCommandPaletteContext()
  return (
    render?.(status, () => {
      onRetry()
      palette?.setSearch(currentQuery())
    }) ?? null
  )
}

export function AppCommands({
  items,
  onClose,
  label,
  placeholder,
  empty,
  search,
  renderSearchStatus,
}: {
  items: AppCommand[]
  onClose: () => void
  label: string
  placeholder: string
  empty: string
  search?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<AppCommandSearchResult>
  renderSearchStatus?: (
    status: AppCommandSearchStatus,
    retry: () => void,
  ) => ReactNode
}) {
  const callbacks = useRef({ items, search, onClose })
  callbacks.current = { items, search, onClose }
  const currentQuery = useRef('')
  const commandMap = useRef(new Map<string, AppCommand>())
  const pending = useRef(Boolean(search))
  const activeGeneration = useRef(0)
  const mounted = useRef(true)
  const [status, setStatus] = useState<AppCommandSearchStatus>({
    kind: 'loading',
  })
  const remote = Boolean(search)
  const source = useMemo<SearchSource<SearchItem>>(() => {
    let version = 0
    let controller: AbortController | undefined
    function cancel() {
      version += 1
      controller?.abort()
    }
    async function run(query: string) {
      cancel()
      const requestVersion = version
      activeGeneration.current = requestVersion
      commandMap.current.clear()
      currentQuery.current = query
      if (!remote) {
        const values = localMatches(callbacks.current.items, query)
        commandMap.current = new Map(values.map((item) => [item.id, item]))
        pending.current = false
        return toSearchable(values, requestVersion)
      }
      pending.current = true
      setStatus({ kind: 'loading' })
      controller = new AbortController()
      const activeController = controller
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        activeController.abort()
      }, 15_000)
      const current = () => mounted.current && requestVersion === version
      try {
        const result = await callbacks.current.search!(
          query,
          activeController.signal,
        )
        if (!current() || activeController.signal.aborted) return []
        commandMap.current = new Map(
          result.items.map((item) => [item.id, item]),
        )
        pending.current = false
        setStatus({
          kind: 'ready',
          total: result.total,
          count: result.count,
          hasMore: result.hasMore,
        })
        return toSearchable(result.items, requestVersion)
      } catch (error) {
        if (!current() || (activeController.signal.aborted && !timedOut))
          return []
        const local = localMatches(callbacks.current.items, query)
        commandMap.current = new Map(local.map((item) => [item.id, item]))
        pending.current = false
        setStatus({
          kind: 'error',
          error: timedOut ? new Error('workspace_search_timeout') : error,
        })
        return toSearchable(local, requestVersion)
      } finally {
        clearTimeout(timeout)
      }
    }
    return {
      bootstrap: () => run(''),
      search: run,
      cancel,
    }
  }, [remote])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      source.cancel?.()
    }
  }, [source])
  const selectionBlocked = () => remote && pending.current
  // The vendor retains optimistic rows while its asynchronous source settles.
  // Block selection before a stale option can close the palette.
  const guardOptionClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const marker =
      target.closest<HTMLElement>('[data-app-command-id]') ??
      target
        .closest('[role="option"]')
        ?.querySelector<HTMLElement>('[data-app-command-id]')
    if (
      marker &&
      !isAppCommandSelectionCurrent(
        marker.dataset.appCommandId,
        marker.dataset.appCommandGeneration,
        activeGeneration.current,
        selectionBlocked(),
        commandMap.current,
      )
    ) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  return (
    <CommandPalette
      isOpen
      aria-busy={remote && pending.current ? true : undefined}
      onOpenChange={(open) => {
        if (!open) {
          source.cancel?.()
          callbacks.current.onClose()
        }
      }}
      searchSource={source}
      label={label}
      input={
        <CommandPaletteInput
          label={label}
          placeholder={placeholder}
          onChange={() => {
            if (remote) setStatus({ kind: 'loading' })
          }}
        />
      }
      footer={
        remote ? (
          <SearchFeedback
            render={renderSearchStatus}
            status={status}
            currentQuery={() => currentQuery.current}
            onRetry={() => setStatus({ kind: 'loading' })}
          />
        ) : null
      }
      emptySearchText={remote && status.kind !== 'ready' ? '' : empty}
      emptyBootstrapText={remote && status.kind !== 'ready' ? '' : empty}
      renderItem={(item) => (
        <span
          data-app-command-id={item.id}
          data-app-command-generation={item.auxiliaryData?.generation}
        >
          {item.label}
        </span>
      )}
      onClickCapture={guardOptionClick}
      onKeyDownCapture={(event) => {
        const target = event.target as HTMLElement
        const activeOptionId = target.getAttribute('aria-activedescendant')
        const marker = activeOptionId
          ? document
              .getElementById(activeOptionId)
              ?.querySelector<HTMLElement>('[data-app-command-id]')
          : undefined
        if (
          event.key === 'Enter' &&
          !event.nativeEvent.isComposing &&
          (selectionBlocked() ||
            (remote &&
              marker &&
              !isAppCommandSelectionCurrent(
                marker.dataset.appCommandId,
                marker.dataset.appCommandGeneration,
                activeGeneration.current,
                false,
                commandMap.current,
              )))
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onValueChange={(id) => {
        if (selectionBlocked()) return
        const command = commandMap.current.get(id)
        if (!command) return
        callbacks.current.onClose()
        command.onSelect()
      }}
    />
  )
}
