import { useEffect, useRef, useState } from 'react'
import { ApiError } from './api'
import { fetchTaskPlan, type TaskPlanRead } from './task-plans'

export function useTaskPlan(
  taskId: string,
  enabled: boolean,
  revision: number,
) {
  const [local, setLocal] = useState(0)
  const [state, setState] = useState<{
    taskId: string
    value?: TaskPlanRead
    error?: string
    busy: boolean
  }>({ taskId, busy: enabled })
  const version = useRef(0)
  useEffect(() => {
    const generation = ++version.current
    if (!enabled) return
    const controller = new AbortController()
    setState({ taskId, busy: true })
    void fetchTaskPlan(taskId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && generation === version.current)
          setState({ taskId, value, busy: false })
      })
      .catch((reason) => {
        if (!controller.signal.aborted && generation === version.current)
          setState({
            taskId,
            busy: false,
            error:
              reason instanceof ApiError &&
              [401, 403, 404].includes(reason.status)
                ? 'unavailable'
                : 'read_failed',
          })
      })
    return () => controller.abort()
  }, [taskId, enabled, revision, local])
  const current = enabled && state.taskId === taskId ? state : undefined
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
