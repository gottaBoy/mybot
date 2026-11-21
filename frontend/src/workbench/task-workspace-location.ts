import { isTaskReadIdentifier } from './task-query'

export type TaskWorkspaceTab = 'goal' | 'work' | 'review'
export type TaskWorkspaceLocation = {
  tab: TaskWorkspaceTab
  runId?: string
  error?: 'tab_invalid' | 'run_invalid'
}
export type TaskWorkspaceDestination = {
  tab?: TaskWorkspaceTab
  runId?: string
}

export function taskWorkspaceHref(
  taskId: string,
  destination: TaskWorkspaceDestination = {},
) {
  if (
    !isTaskReadIdentifier(taskId) ||
    (destination.tab !== undefined &&
      !['goal', 'work', 'review'].includes(destination.tab)) ||
    (destination.runId !== undefined &&
      !isTaskReadIdentifier(destination.runId))
  )
    throw new Error('task_workspace_location_invalid')
  const params = new URLSearchParams()
  if (destination.tab && destination.tab !== 'goal')
    params.set('taskTab', destination.tab)
  if (destination.runId !== undefined) params.set('taskRun', destination.runId)
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
  if (tabs.length > 1 || !['goal', 'work', 'review'].includes(tab))
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
  return {
    tab: selectedTab,
    ...(runId === undefined ? {} : { runId }),
  }
}
