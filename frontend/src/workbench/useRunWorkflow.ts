import { useEffect, useRef, useState } from 'react'
import type { WorkflowDefinition, WorkflowSnapshot, WorkflowVersion } from './workflows'
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
  const [version, setVersion] = useState<number | null>(initial?.version ?? null)
  const [definition, setDefinition] = useState<WorkflowDefinition | undefined>(
    initial?.definition,
  )
  const [versions, setVersions] = useState<WorkflowVersion[]>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    if (!enabled || locked) return
    const request = new AbortController()
    const current = ++generation.current
    setLoading(true)
    setError('')
    void fetchWorkflowVersions(1, request.signal)
      .then((value) => {
        if (!request.signal.aborted && current === generation.current)
          setVersions(value.items)
      })
      .catch((reason: unknown) => {
        if (!request.signal.aborted && current === generation.current) {
          setVersions(undefined)
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })
      .finally(() => {
        if (!request.signal.aborted && current === generation.current)
          setLoading(false)
      })
    return () => request.abort()
  }, [enabled, locked, revision])
  const busy = enabled && !locked && (loading || (!versions && !error))
  return {
    version,
    definition,
    versions: versions ?? [],
    busy,
    error: enabled && !locked ? error : '',
    blocked: enabled && !locked && (busy || Boolean(error)),
    retry: () => setRevision((value) => value + 1),
    choose: (value: string) => {
      if (!enabled || locked || busy || error) return undefined
      if (value === 'builtin') {
        setVersion(null)
        setDefinition(undefined)
        return { version: null, config: null }
      }
      const selected = versions?.find((item) => String(item.version) === value)
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
