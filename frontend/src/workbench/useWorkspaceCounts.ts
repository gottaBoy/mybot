import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import { fetchWorkspaceCounts, type WorkspaceCounts } from './workspace-reads'

type CountsState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: WorkspaceCounts
  error?: 'forbidden' | 'unavailable' | 'timeout' | 'invalid'
}

export function useWorkspaceCounts({
  data,
  refreshRevision,
  projects = [],
  scopeProjectId,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  projects?: string[]
  scopeProjectId?: string
  enabled?: boolean
}) {
  const remote = enabled && data?.capabilities.workspace_counts === true
  const key = JSON.stringify([
    data?.workspace,
    remote,
    projects,
    scopeProjectId,
  ])
  const [state, setState] = useState<CountsState>()
  const [retry, setRetry] = useState(0)
  const observed = useRef({ data, refreshRevision })
  useEffect(() => {
    if (!remote) {
      setState(undefined)
      return
    }
    const controller = new AbortController()
    let active = true
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)
    setState((previous) => ({
      key,
      kind: 'loading',
      value: previous?.key === key ? previous.value : undefined,
    }))
    void fetchWorkspaceCounts({ projects, scopeProjectId }, controller.signal)
      .then((value) => {
        if (active && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!active || (controller.signal.aborted && !timedOut)) return
        setState({
          key,
          kind: 'error',
          error: timedOut
            ? 'timeout'
            : error instanceof ApiError && error.status === 403
              ? 'forbidden'
              : error instanceof ApiError && error.status === 404
                ? 'unavailable'
                : 'invalid',
        })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, refreshRevision, retry])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision }
    if (
      previous.data !== data &&
      previous.refreshRevision === refreshRevision &&
      state?.key === key &&
      state.kind === 'ready'
    )
      setRetry((value) => value + 1)
  }, [data, refreshRevision, key, state])
  const current = state?.key === key ? state : undefined
  return {
    remote,
    value: remote ? current?.value : undefined,
    busy: Boolean(remote && (!current || current.kind === 'loading')),
    error: current?.kind === 'error' ? current.error : undefined,
    retry: () => setRetry((value) => value + 1),
  }
}
