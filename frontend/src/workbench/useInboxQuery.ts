import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import {
  fetchInboxPage,
  prepareInboxRequest,
  type InboxQueryRequest,
  type InboxReadError,
} from './inbox-query'
import type { ServerTaskQueryPage } from './task-query'

type InboxReadState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: ServerTaskQueryPage
  error?: InboxReadError
}

export function useInboxQuery({
  data,
  refreshRevision,
  request,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  request: InboxQueryRequest
  enabled?: boolean
}) {
  const remote = data?.capabilities.task_query === true
  const active = remote && enabled
  let keyRequest: unknown = request
  try {
    keyRequest = prepareInboxRequest(request)
  } catch {
    // Report invalid committed candidates through the read state.
  }
  const key = JSON.stringify([data?.workspace, active, keyRequest])
  const [state, setState] = useState<InboxReadState>()
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
    void fetchInboxPage(request, controller.signal)
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
