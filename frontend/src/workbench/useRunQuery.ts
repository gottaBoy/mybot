import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import {
  fetchRunQueryPage,
  prepareRunQueryRequest,
  type RunQueryPage,
  type RunQueryRequest,
} from './run-query'

type RunReadState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: RunQueryPage
  error?: 'forbidden' | 'unavailable' | 'timeout' | 'invalid'
}

export function useRunQuery({
  data,
  refreshRevision,
  request,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  request: RunQueryRequest
  enabled?: boolean
}) {
  const remote = data?.capabilities.run_query === true
  const active = remote && enabled
  let keyRequest: unknown = request
  try {
    const { path: _path, ...canonical } = prepareRunQueryRequest(request)
    keyRequest = canonical
  } catch {
    // Invalid input is reported by the read path, not thrown during rendering.
  }
  const key = JSON.stringify([data?.workspace, active, keyRequest])
  const [state, setState] = useState<RunReadState>()
  const [revision, setRevision] = useState(0)
  const observed = useRef({ data, refreshRevision })
  useEffect(() => {
    if (!active) {
      setState(undefined)
      return
    }
    const controller = new AbortController()
    let live = true
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
    void fetchRunQueryPage(request, controller.signal)
      .then((value) => {
        if (live && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!live || (controller.signal.aborted && !timedOut)) return
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
      live = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, refreshRevision, revision])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision }
    if (
      previous.data !== data &&
      previous.refreshRevision === refreshRevision &&
      active &&
      state?.key === key &&
      state.kind === 'ready'
    )
      setRevision((value) => value + 1)
  }, [active, data, refreshRevision, key, state])
  const current = state?.key === key ? state : undefined
  return {
    remote,
    value: active ? current?.value : undefined,
    busy: Boolean(active && (!current || current.kind === 'loading')),
    error: active && current?.kind === 'error' ? current.error : undefined,
    retry: () => setRevision((value) => value + 1),
  }
}
