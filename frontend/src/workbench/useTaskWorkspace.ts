import { useEffect, useRef, useState } from 'react'
import { ApiError, type Bootstrap, type Run } from './api'
import { taskItems } from './projections'
import {
  fetchTaskDetail,
  prepareTaskDetailRequest,
  taskDetailHistoryOrder,
  type TaskDetail,
} from './task-detail'

export type TaskWorkspaceReadError =
  'forbidden' | 'missing' | 'unavailable' | 'timeout' | 'invalid'

type WorkspaceReadState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: TaskDetail
  error?: TaskWorkspaceReadError
}

class MissingTaskWorkspaceError extends Error {}

function minimalRun(run: Run): Run {
  return {
    id: run.id,
    task_id: run.task_id,
    status: run.status,
    created_at: run.created_at,
  }
}

export function readLegacyTaskWorkspace(
  data: Bootstrap,
  taskId: string,
  requestedPage: number,
): TaskDetail {
  prepareTaskDetailRequest({ taskId, page: requestedPage, pageSize: 20 })
  const item = taskItems(data).find((candidate) => candidate.id === taskId)
  if (
    !item ||
    !data.projects.some((project) => project.id === item.task.project_id)
  )
    throw new MissingTaskWorkspaceError('task_workspace_missing')
  const history = data.runs
    .filter((run) => run.task_id === taskId)
    .map(minimalRun)
    .sort((left, right) =>
      left.created_at === right.created_at
        ? 0
        : left.created_at > right.created_at
          ? -1
          : 1,
    )
  const total = history.length
  const totalPages = Math.max(1, Math.ceil(total / 20))
  const page = Math.min(requestedPage, totalPages)
  return {
    schema_version: 1,
    unit: 'task_detail',
    item: {
      ...item,
      task: { ...item.task, files: [...item.task.files] },
      run: item.run ? minimalRun(item.run) : undefined,
    },
    history: {
      unit: 'runs',
      items: history.slice((page - 1) * 20, page * 20),
      total,
      requested_page: requestedPage,
      page,
      page_size: 20,
      total_pages: totalPages,
      has_more: page < totalPages,
      order: taskDetailHistoryOrder,
    },
  }
}

export function useTaskWorkspace({
  data,
  refreshRevision,
  taskId,
  page,
  enabled = true,
}: {
  data: Bootstrap
  refreshRevision: number
  taskId: string
  page: number
  enabled?: boolean
}) {
  const remote = data.capabilities.task_detail === true
  const active = remote && enabled
  const key = JSON.stringify([data.workspace, active, taskId, page])
  let invalid = false
  try {
    prepareTaskDetailRequest({ taskId, page, pageSize: 20 })
  } catch {
    invalid = true
  }
  const [state, setState] = useState<WorkspaceReadState>()
  const [revision, setRevision] = useState(0)
  const observed = useRef({ data, refreshRevision })
  useEffect(() => {
    if (!active || invalid) {
      setState(undefined)
      return
    }
    const controller = new AbortController()
    let live = true
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)
    setState((previous) => ({
      key,
      kind: 'loading',
      value: previous?.key === key ? previous.value : undefined,
    }))
    void fetchTaskDetail({ taskId, page, pageSize: 20 }, controller.signal)
      .then((value) => {
        if (live && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!live || (controller.signal.aborted && !timedOut)) return
        const missing =
          error instanceof ApiError &&
          error.status === 404 &&
          error.details !== null &&
          typeof error.details === 'object' &&
          (error.details as { code?: unknown }).code ===
            'task_detail_unavailable'
        setState({
          key,
          kind: 'error',
          error: timedOut
            ? 'timeout'
            : error instanceof ApiError && error.status === 403
              ? 'forbidden'
              : missing
                ? 'missing'
                : error instanceof ApiError && error.status === 404
                  ? 'unavailable'
                  : 'invalid',
        })
      })
      .finally(() => clearTimeout(timeout))
    return () => {
      live = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [active, invalid, key, taskId, page, refreshRevision, revision])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision }
    if (
      previous.data !== data &&
      previous.refreshRevision === refreshRevision &&
      active &&
      !invalid &&
      state?.key === key &&
      state.kind === 'ready'
    )
      setRevision((value) => value + 1)
  }, [active, data, invalid, key, refreshRevision, state])
  const current = state?.key === key ? state : undefined
  let legacy: TaskDetail | undefined
  let legacyError: TaskWorkspaceReadError | undefined
  if (!remote && enabled && !invalid) {
    try {
      legacy = readLegacyTaskWorkspace(data, taskId, page)
    } catch (error) {
      legacyError =
        error instanceof MissingTaskWorkspaceError ? 'missing' : 'invalid'
    }
  }
  return {
    remote,
    value: !enabled || invalid ? undefined : remote ? current?.value : legacy,
    busy: Boolean(
      active && !invalid && (!current || current.kind === 'loading'),
    ),
    error: !enabled
      ? undefined
      : invalid
        ? ('invalid' as const)
        : remote
          ? current?.kind === 'error'
            ? current.error
            : undefined
          : legacyError,
    retry: () => setRevision((value) => value + 1),
  }
}
