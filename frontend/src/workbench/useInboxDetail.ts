import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import type { InboxReadError } from './inbox-query'
import type { WorkItem } from './projections'
import { fetchTaskDetail } from './task-detail'

type InboxDetailState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: WorkItem
  error?: InboxReadError
}

export function useInboxDetail({
  data,
  refreshRevision,
  item,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  item: WorkItem | undefined
  enabled?: boolean
}) {
  const remote = data?.capabilities.task_detail === true
  const active = Boolean(remote && enabled && item)
  const taskId = item?.id
  const key = JSON.stringify([data?.workspace, active, taskId])
  const itemRevision = JSON.stringify(
    item ? [item.task, item.projectName, item.run, item.attempts] : undefined,
  )
  const [state, setState] = useState<InboxDetailState>()
  const [revision, setRevision] = useState(0)
  const observed = useRef({ data, refreshRevision, itemRevision })
  useEffect(() => {
    if (!active || !taskId) {
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
    void fetchTaskDetail({ taskId, page: 1, pageSize: 20 }, controller.signal)
      .then((value) => {
        if (live && !controller.signal.aborted)
          setState({ key, kind: 'ready', value: value.item })
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
  }, [active, key, refreshRevision, revision, taskId])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision, itemRevision }
    if (
      previous.refreshRevision === refreshRevision &&
      (previous.data !== data || previous.itemRevision !== itemRevision) &&
      active &&
      state?.key === key &&
      state.kind === 'ready'
    )
      setRevision((value) => value + 1)
  }, [active, data, refreshRevision, itemRevision, key, state])
  const current = state?.key === key ? state : undefined
  return {
    remote,
    value: active ? current?.value : undefined,
    busy: Boolean(active && (!current || current.kind === 'loading')),
    error: active && current?.kind === 'error' ? current.error : undefined,
    retry: () => setRevision((value) => value + 1),
  }
}
