import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { fetchTaskPlan, type TaskPlanRead } from './task-plans'

export function useTaskPlan(
  taskId: string,
  enabled: boolean,
  revision: number,
  revisionsEnabled = false,
  nestedEnabled = false,
) {
  const [local, setLocal] = useState(0)
  const [state, setState] = useState<{
    taskId: string
    value?: TaskPlanRead
    error?: string
    busy: boolean
    revisionsEnabled: boolean
    nestedEnabled: boolean
  }>({ taskId, busy: enabled, revisionsEnabled, nestedEnabled })
  const version = useRef(0)
  useEffect(() => {
    const generation = ++version.current
    if (!enabled) return
    const controller = new AbortController()
    setState({ taskId, busy: true, revisionsEnabled, nestedEnabled })
    void fetchTaskPlan(
      taskId,
      controller.signal,
      revisionsEnabled,
      nestedEnabled,
    )
      .then((value) => {
        if (!controller.signal.aborted && generation === version.current)
          setState({
            taskId,
            value,
            busy: false,
            revisionsEnabled,
            nestedEnabled,
          })
      })
      .catch((reason) => {
        if (!controller.signal.aborted && generation === version.current)
          setState({
            taskId,
            revisionsEnabled,
            nestedEnabled,
            busy: false,
            error:
              reason instanceof ApiError &&
              [401, 403, 404].includes(reason.status)
                ? 'unavailable'
                : 'read_failed',
          })
      })
    return () => controller.abort()
  }, [taskId, enabled, revisionsEnabled, nestedEnabled, revision, local])
  const current =
    enabled &&
    state.taskId === taskId &&
    state.revisionsEnabled === revisionsEnabled &&
    state.nestedEnabled === nestedEnabled
      ? state
      : undefined
  return {
    enabled,
    value: current?.value,
    error: current?.error,
    busy: enabled && (!current || current.busy),
    blocked:
      enabled &&
      (!current?.value ||
        current.busy ||
        !!current.error ||
        current.value.gate?.ready === false),
    retry: () => setLocal((value) => value + 1),
  }
}
