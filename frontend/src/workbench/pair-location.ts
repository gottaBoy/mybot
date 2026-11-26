import { isTaskReadIdentifier, maxTaskQueryPage } from './task-query'

export type PairedView =
  'overview' | 'goal' | 'conversation' | 'work' | 'review'
export type PairedLocation = {
  taskId?: string
  runId?: string
  view: PairedView
  page: number
  error?: boolean
}
const views: PairedView[] = [
  'overview',
  'goal',
  'conversation',
  'work',
  'review',
]
export function readPairedLocation(href: string): PairedLocation {
  const failed: PairedLocation = { view: 'overview', page: 1, error: true }
  try {
    const raw = new URL(href, 'http://localhost').hash.split('?')[1] ?? ''
    decodeURIComponent(raw.replace(/\+/g, ' '))
    const params = new URLSearchParams(raw)
    for (const key of ['task', 'run', 'view', 'historyPage'])
      if (params.getAll(key).length > 1) return failed
    const taskId = params.get('task') ?? undefined
    const runId = params.get('run') ?? undefined
    const view = params.get('view') ?? 'overview'
    const page = params.get('historyPage') ?? '1'
    if (
      (taskId !== undefined && !isTaskReadIdentifier(taskId)) ||
      (runId !== undefined && (!taskId || !isTaskReadIdentifier(runId))) ||
      !views.includes(view as PairedView) ||
      !/^[1-9]\d*$/.test(page) ||
      !Number.isSafeInteger(Number(page)) ||
      Number(page) > maxTaskQueryPage
    )
      return failed
    return { taskId, runId, view: view as PairedView, page: Number(page) }
  } catch {
    return failed
  }
}
export function pairedWorkspaceHref(
  taskId: string,
  destination: Partial<Pick<PairedLocation, 'view' | 'runId' | 'page'>> = {},
  pending: { claimId?: string; sendId?: string } = {},
) {
  const params = new URLSearchParams({ task: taskId })
  if (destination.view && destination.view !== 'overview')
    params.set('view', destination.view)
  if (destination.runId !== undefined) params.set('run', destination.runId)
  if (destination.page !== undefined && destination.page !== 1)
    params.set('historyPage', String(destination.page))
  if (pending.claimId && pending.sendId)
    throw new Error('paired_location_invalid')
  for (const [key, value] of [
    ['deviceClaim', pending.claimId],
    ['deviceSend', pending.sendId],
  ]) {
    if (value === undefined) continue
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(value))
      throw new Error('paired_location_invalid')
    params.set(key!, value)
  }
  const href = `#pair?${params}`
  if (readPairedLocation(href).error) throw new Error('paired_location_invalid')
  return href
}
