import type { Artifact, Bootstrap, Call, Run } from './api'

export type Locale = 'zh' | 'en'
export type Copy = (zh: string, en: string) => string
export type Filter = 'all' | 'active' | 'attention' | 'completed'
export const activeStatuses = new Set([
  'queued',
  'running',
  'pause_requested',
  'cancel_requested',
])
export const attentionStatuses = new Set(['failed', 'interrupted', 'paused'])
const labels: Record<string, [string, string]> = {
  queued: ['排队中', 'Queued'],
  pending: ['未开始', 'Pending'],
  waiting: ['等待输入', 'Waiting'],
  running: ['运行中', 'Running'],
  succeeded: ['已完成', 'Completed'],
  failed: ['执行失败', 'Failed'],
  paused: ['已暂停', 'Paused'],
  interrupted: ['已中断', 'Interrupted'],
  canceled: ['已取消', 'Canceled'],
  pause_requested: ['等待阶段结束后暂停', 'Pause requested'],
  cancel_requested: ['正在取消', 'Cancel requested'],
  accepted: ['已接受', 'Accepted'],
  changes_requested: ['要求修改', 'Changes requested'],
}
export function statusText(status: string, t: Copy) {
  const pair = labels[status]
  return pair ? t(...pair) : status
}
const errors: Record<string, [string, string]> = {
  codex_cli_timeout_outcome_unknown: [
    'Codex CLI 超时；结果和用量未知，请勿盲目重试',
    'Codex CLI timed out; outcome and usage are unknown. Do not retry blindly.',
  ],
  provider_timeout_outcome_unknown: [
    '模型请求超时，结果和用量可能未知',
    'Model request timed out; outcome and usage may be unknown.',
  ],
  call_timeout_outcome_unknown: [
    '调用超过时限，结果和用量可能未知',
    'Call exceeded its time limit; outcome and usage may be unknown.',
  ],
  planner_invalid_json: [
    '规划输出不符合计划格式',
    'Planner output does not match the plan schema.',
  ],
  output_truncated: [
    '模型输出被截断，未记为成功',
    'Model output was truncated and was not marked successful.',
  ],
  research_budget_exhausted: [
    '剩余调用预算不足以完成研究与汇总',
    'Insufficient remaining calls for research and synthesis.',
  ],
  run_time_budget_exhausted: [
    '运行时间上限已达到',
    'Run time budget exhausted.',
  ],
  'Model call budget exhausted': [
    '调用上限已达到，可重新分配资源后重试未完成步骤',
    'Call budget exhausted. Reallocate resources before retrying unfinished steps.',
  ],
  missing_api_key: [
    '服务端模型密钥环境变量未提供',
    'The server model-key environment variable is missing.',
  ],
  backend_revoked: ['后端连接已撤销', 'Backend connection revoked.'],
  backend_timeout: ['后端健康检查超时', 'Backend health check timed out.'],
  backend_unreachable: [
    '无法连接后端服务',
    'Cannot reach the backend service.',
  ],
  backend_read_scope_unverified: [
    '读取权限未验证，暂不开放同步',
    'Read permissions unverified. Sync remains disabled.',
  ],
}
export function errorText(code: string, t: Copy) {
  const pair = errors[code]
  return pair ? t(...pair) : code
}
export function statusTone(
  status: string,
): 'success' | 'error' | 'info' | 'warning' | 'neutral' {
  if (['succeeded', 'accepted', 'reachable'].includes(status)) return 'success'
  if (['failed', 'interrupted'].includes(status)) return 'error'
  if (activeStatuses.has(status)) return 'info'
  if (status === 'paused' || status === 'changes_requested') return 'warning'
  return 'neutral'
}
export function selectRuns(
  data: Bootstrap,
  query: string,
  filter: Filter,
  projectId?: string,
): Run[] {
  const term = query.trim().toLocaleLowerCase()
  return data.runs
    .filter((run) => {
      const task = data.tasks.find((task) => task.id === run.task_id)
      const project = data.projects.find(
        (project) => project.id === task?.project_id,
      )
      if (projectId && task?.project_id !== projectId) return false
      if (
        term &&
        !`${task?.id ?? ''} ${task?.title ?? ''} ${project?.name ?? ''} ${run.id}`
          .toLocaleLowerCase()
          .includes(term)
      )
        return false
      return (
        filter === 'all' ||
        (filter === 'active' && activeStatuses.has(run.status)) ||
        (filter === 'attention' && attentionStatuses.has(run.status)) ||
        (filter === 'completed' && run.status === 'succeeded')
      )
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}
export function preferredArtifact(artifacts: Artifact[]) {
  return (
    artifacts.find((item) => item.kind === 'report') ??
    [...artifacts].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  )
}
export function usageSummary(calls: Call[]) {
  return {
    knownTokens: calls.reduce(
      (sum, call) => sum + (call.input_tokens ?? 0) + (call.output_tokens ?? 0),
      0,
    ),
    incomplete: calls.filter(
      (call) => call.input_tokens == null || call.output_tokens == null,
    ).length,
  }
}
export function splitFiles(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ]
}
export function routeFromHash(hash: string) {
  const path = hash.replace(/^#/, '').split('?')[0]
  if (['', 'home', 'workbench', 'agent-work'].includes(path))
    return { page: 'work', id: '' }
  const [page, id = ''] = path.split('/')
  if (page === 'task') {
    try {
      return path.split('/').length === 2 && id
        ? { page, id: decodeURIComponent(id) }
        : { page: 'missing', id: '' }
    } catch {
      return { page: 'missing', id: '' }
    }
  }
  if (['run', 'chat', 'project'].includes(page))
    return { page: page === 'chat' ? 'run' : page, id }
  if (
    [
      'projects',
      'models',
      'backends',
      'overview',
      'inbox',
      'hierarchy',
      'login',
      'documents',
    ].includes(page)
  )
    return { page, id: '' }
  return { page: 'missing', id: '' }
}
export function readPreference<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  try {
    const value = localStorage.getItem(key)
    return values.find((item) => item === value) ?? fallback
  } catch {
    return fallback
  }
}
export function savePreference(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* Browsing without storage remains supported. */
  }
}
