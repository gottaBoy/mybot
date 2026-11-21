import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import {
  fetchTaskTurns,
  prepareTaskTurnsRequest,
  type TaskTurnPage,
  type TaskTurnReadError,
} from './task-turns'

type TurnReadState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: TaskTurnPage
  error?: TaskTurnReadError
}

export function useTaskTurns({
  data,
  refreshRevision,
  taskId,
  page,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  taskId: string
  page: number
  enabled?: boolean
}) {
  const remote = data?.capabilities.task_conversation === true
  const active = remote && enabled
  const key = JSON.stringify([data?.workspace, active, taskId, page])
  const [state, setState] = useState<TurnReadState>()
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
    void Promise.resolve()
      .then(() => {
        prepareTaskTurnsRequest(taskId, page)
        return fetchTaskTurns(taskId, page, controller.signal)
      })
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
                ? 'missing'
                : 'invalid',
        })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, key, taskId, page, refreshRevision, revision])
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
