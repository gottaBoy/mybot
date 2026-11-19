import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap } from './api'
import { fetchProjectDetail, type ProjectDetail } from './project-resources'

type DetailError =
  'forbidden' | 'missing' | 'unavailable' | 'timeout' | 'invalid'

export function useProjectDetail({
  data,
  refreshRevision,
  projectId,
  enabled = true,
}: {
  data: Bootstrap | null
  refreshRevision: number
  projectId?: string
  enabled?: boolean
}) {
  const remote = data?.capabilities.project_detail === true
  const active = Boolean(remote && enabled && projectId !== undefined)
  const key = JSON.stringify([data?.workspace, active, projectId])
  const [state, setState] = useState<{
    key: string
    kind: 'loading' | 'ready' | 'error'
    value?: ProjectDetail
    error?: DetailError
  }>()
  const [revision, setRevision] = useState(0)
  const observed = useRef({ data, refreshRevision })
  useEffect(() => {
    if (!active || projectId === undefined) {
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
    void fetchProjectDetail(projectId, controller.signal)
      .then((value) => {
        if (live && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!live || (controller.signal.aborted && !timedOut)) return
        const missing =
          error instanceof ApiError &&
          error.status === 404 &&
          typeof error.details === 'object' &&
          error.details !== null &&
          (error.details as { code?: unknown }).code ===
            'project_detail_unavailable'
        const detailError: DetailError = timedOut
          ? 'timeout'
          : error instanceof ApiError && error.status === 403
            ? 'forbidden'
            : missing
              ? 'missing'
              : error instanceof ApiError && error.status === 404
                ? 'unavailable'
                : 'invalid'
        setState((previous) => ({
          key,
          kind: 'error',
          error: detailError,
          value:
            previous?.key === key &&
            !['missing', 'forbidden'].includes(detailError)
              ? previous.value
              : undefined,
        }))
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [active, data?.workspace, key, projectId, refreshRevision, revision])
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
  }, [active, data, key, refreshRevision, state])
  const current = state?.key === key ? state : undefined
  return {
    remote,
    value: active ? current?.value : undefined,
    busy: Boolean(active && (!current || current.kind === 'loading')),
    error: active && current?.kind === 'error' ? current.error : undefined,
    retry: () => setRevision((value) => value + 1),
  }
}
