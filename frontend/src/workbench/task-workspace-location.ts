import { isTaskReadIdentifier } from './task-query'

export type TaskWorkspaceTab = 'goal' | 'work' | 'review' | 'conversation'
export type TaskWorkspaceLocation = {
  tab: TaskWorkspaceTab
  runId?: string
  pendingRequestId?: string
  error?: 'tab_invalid' | 'run_invalid' | 'request_invalid'
}
export type TaskWorkspaceDestination = {
  tab?: TaskWorkspaceTab
  runId?: string
  pendingRequestId?: string
}

export function taskWorkspaceHref(
  taskId: string,
  destination: TaskWorkspaceDestination = {},
) {
  if (
    !isTaskReadIdentifier(taskId) ||
    (destination.tab !== undefined &&
      !['goal', 'work', 'review', 'conversation'].includes(destination.tab)) ||
    (destination.runId !== undefined &&
      !isTaskReadIdentifier(destination.runId)) ||
    (destination.pendingRequestId !== undefined &&
      !/^[A-Za-z0-9_-]{8,100}$/.test(destination.pendingRequestId))
  )
    throw new Error('task_workspace_location_invalid')
  const params = new URLSearchParams()
  if (destination.tab && destination.tab !== 'goal')
    params.set('taskTab', destination.tab)
  if (destination.runId !== undefined) params.set('taskRun', destination.runId)
  if (destination.pendingRequestId !== undefined)
    params.set('taskSend', destination.pendingRequestId)
  return `#task/${encodeURIComponent(taskId)}${params.size ? `?${params}` : ''}`
}

export function readTaskWorkspaceLocation(href: string): TaskWorkspaceLocation {
  let query: string
  try {
    const url = new URL(href, 'http://localhost')
    const separator = url.hash.indexOf('?')
    query = separator < 0 ? '' : url.hash.slice(separator + 1)
  } catch {
    return { tab: 'goal', error: 'tab_invalid' }
  }
  const values = (key: string) =>
    query.split('&').flatMap((part) => {
      const separator = part.indexOf('=')
      const rawKey = separator < 0 ? part : part.slice(0, separator)
      let decodedKey: string
      try {
        decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '))
      } catch {
        return []
      }
      if (decodedKey !== key) return []
      return [
        decodeURIComponent(
          (separator < 0 ? '' : part.slice(separator + 1)).replace(/\+/g, ' '),
        ),
      ]
    })
  let tabs: string[]
  try {
    tabs = values('taskTab')
  } catch {
    return { tab: 'goal', error: 'tab_invalid' }
  }
  const tab = tabs[0] ?? 'goal'
  if (
    tabs.length > 1 ||
    !['goal', 'work', 'review', 'conversation'].includes(tab)
  )
    return { tab: 'goal', error: 'tab_invalid' }
  const selectedTab = tab as TaskWorkspaceTab
  let runs: string[]
  try {
    runs = values('taskRun')
  } catch {
    return { tab: selectedTab, error: 'run_invalid' }
  }
  const runId = runs[0]
  if (runs.length > 1 || (runId !== undefined && !isTaskReadIdentifier(runId)))
    return { tab: selectedTab, error: 'run_invalid' }
  let requests: string[]
  try {
    requests = values('taskSend')
  } catch {
    return { tab: selectedTab, error: 'request_invalid' }
  }
  const pendingRequestId = requests[0]
  if (
    requests.length > 1 ||
    (pendingRequestId !== undefined &&
      !/^[A-Za-z0-9_-]{8,100}$/.test(pendingRequestId))
  )
    return { tab: selectedTab, error: 'request_invalid' }
  return {
    tab: selectedTab,
    ...(runId === undefined ? {} : { runId }),
    ...(pendingRequestId === undefined ? {} : { pendingRequestId }),
  }
}
