import { useEffect, useRef, useState } from 'react'
import type {
  WorkflowDefinition,
  WorkflowSnapshot,
  WorkflowVersions,
} from './workflows'
import { fetchWorkflowVersions, workflowConfig } from './workflows'

export function useRunWorkflow({
  enabled,
  locked,
  initial,
}: {
  enabled: boolean
  locked: boolean
  initial?: WorkflowSnapshot
}) {
  const [version, setVersion] = useState<number | null>(
    initial?.version ?? null,
  )
  const [definition, setDefinition] = useState<WorkflowDefinition | undefined>(
    initial?.definition,
  )
  const [requestedPage, setRequestedPage] = useState(1)
  const availability = useRef({ enabled, locked, epoch: 0 })
  if (
    availability.current.enabled !== enabled ||
    availability.current.locked !== locked
  )
    availability.current = {
      enabled,
      locked,
      epoch: availability.current.epoch + 1,
    }
  const epoch = availability.current.epoch
  const [read, setRead] = useState<{
    epoch: number
    requestedPage: number
    value?: WorkflowVersions
    error?: string
    loading: boolean
  }>()
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    if (!enabled || locked) return
    const request = new AbortController()
    const current = ++generation.current
    setRead({ epoch, requestedPage, loading: true })
    void fetchWorkflowVersions(requestedPage, request.signal)
      .then((value) => {
        if (!request.signal.aborted && current === generation.current)
          setRead({ epoch, requestedPage, value, loading: false })
      })
      .catch((reason: unknown) => {
        if (!request.signal.aborted && current === generation.current)
          setRead({
            epoch,
            requestedPage,
            error: reason instanceof Error ? reason.message : String(reason),
            loading: false,
          })
      })
    return () => request.abort()
  }, [enabled, locked, epoch, requestedPage, revision])
  const current =
    read?.requestedPage === requestedPage && read.epoch === epoch
      ? read
      : undefined
  const active = enabled && !locked
  const value = active ? current?.value : undefined
  const unsupportedSelection = !enabled && version !== null
  const error = unsupportedSelection
    ? 'workflow_version_capability_unavailable'
    : active
      ? (current?.error ?? '')
      : ''
  const busy = active && (!current || current.loading)
  const admission = useRef({ active, busy, error, value })
  admission.current = { active, busy, error, value }
  return {
    version,
    definition,
    versions: value?.items ?? [],
    requestedPage,
    page: value?.page ?? requestedPage,
    total: value?.total,
    totalPages: value?.total_pages,
    hasMore: value?.has_more ?? false,
    busy,
    error,
    blocked: unsupportedSelection || (active && (busy || Boolean(error))),
    retry: () => setRevision((value) => value + 1),
    changePage: (page: number) => {
      const current = admission.current
      if (
        !current.active ||
        current.busy ||
        current.error ||
        !current.value ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        page > current.value.total_pages
      )
        return
      setRequestedPage(page)
    },
    choose: (value: string) => {
      const current = admission.current
      if (!current.active || current.busy || current.error || !current.value)
        return undefined
      if (value === 'builtin') {
        setVersion(null)
        setDefinition(undefined)
        return { version: null, config: null }
      }
      const selected = current.value.items.find(
        (item) => String(item.version) === value,
      )
      if (!selected) return undefined
      const config = workflowConfig(selected.definition)
      setVersion(selected.version)
      setDefinition(selected.definition)
      return { version: selected.version, config }
    },
    restore: (snapshot?: WorkflowSnapshot) => {
      setVersion(snapshot?.version ?? null)
      setDefinition(snapshot?.definition)
    },
  }
}
