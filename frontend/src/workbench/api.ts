import type { ModelTestReceipt } from './model-test-state'
import type { WorkflowSnapshot } from './workflows'

export type Project = {
  id: string
  name: string
  goal: string
  directory: string
  notes: string
}
export type Task = {
  id: string
  project_id: string
  title: string
  goal: string
  acceptance: string
  files: string[]
  created_at?: string
}
export type Model = {
  id: string
  kind: string
  name: string
  endpoint: string
  model: string
  key_env: string
  key_available: boolean
  tested_at?: string
  test_status?: string
  latest_test?: ModelTestReceipt | null
}
export type Run = {
  id: string
  task_id: string
  status: string
  created_at: string
  error?: string
  source_run_id?: string
}
export type Backend = {
  id: string
  name: string
  endpoint: string
  status: string
  test_status?: string
  tested_at?: string
  revoked_at?: string
}
export type Bootstrap = {
  projects: Project[]
  tasks: Task[]
  models: Model[]
  runs: Run[]
  backends: Backend[]
  workspace: string
  default_model_id: string
  local_harnesses: Array<{
    id: string
    label: string
    available: boolean
    auth: string
  }>
  capabilities: {
    backend_sync: boolean
    task_query?: boolean
    task_detail?: boolean
    workspace_counts?: boolean
    workspace_search?: boolean
    project_references?: boolean
    project_detail?: boolean
    project_query?: boolean
    run_query?: boolean
    task_board?: boolean
    task_conversation?: boolean
    workflow_versions?: boolean
  }
}
export type Snapshot = {
  context_hash: string
  goal: string
  acceptance: string
  notes: string
  text: string
  bytes: number
  evidence: Array<{ path: string; bytes: number }>
  workflow?: WorkflowSnapshot
}
export type Call = {
  id: string
  agent_id: string
  requested_model: string
  status: string
  attempt: number
  duration_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  error?: string
  error_detail: Record<string, unknown>
}
export type Artifact = {
  id: string
  agent_id: string
  title: string
  kind: string
  content: string
  decision: string
  created_at: string
}
export type RunDetail = {
  run: Run & {
    config: { max_calls: number }
    context: {
      evidence: Array<{ path: string; bytes: number }>
      workflow?: WorkflowSnapshot
    }
  }
  task: Task
  project: Project
  agents: Array<{
    id: string
    role: string
    title: string
    objective: string
    status: string
    output?: string
    model_id: string
    source_agent_id?: string
  }>
  calls: Call[]
  artifacts: Artifact[]
  events: Array<{
    id: string
    seq: number
    kind: string
    actor: string
    created_at: string
    payload: Record<string, unknown>
  }>
  retry_runs: Run[]
  harness: {
    stages: Array<{
      key: string
      title: string
      status: string
      agent_count: number
      call_count: number
      artifact_count: number
    }>
    parallel_limit: number
  }
}

export class ApiError extends Error {
  readonly fieldErrors: Record<string, string> = {}
  constructor(
    public status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    if (Array.isArray(details)) {
      for (const item of details) {
        if (
          !item ||
          typeof item !== 'object' ||
          !Array.isArray(item.loc) ||
          typeof item.msg !== 'string'
        )
          continue
        const path = item.loc
          .slice(item.loc[0] === 'body' ? 1 : 0)
          .map(String)
          .join('.')
        if (path && !this.fieldErrors[path]) this.fieldErrors[path] = item.msg
      }
    }
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Workbench-Request': '1',
        ...options.headers,
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new ApiError(0, '无法连接服务器 / Cannot reach server')
  }
  // Authentication cleanup must not depend on a proxy returning valid JSON.
  if (response.status === 401)
    window.dispatchEvent(new Event('mybot:unauthorized'))
  const body = await response.json()
  if (!response.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail
          .map(
            (item: { loc?: string[]; msg: string }) =>
              `${item.loc?.slice(1).join('.')}: ${item.msg}`,
          )
          .join('; ')
      : body.detail
    throw new ApiError(
      response.status,
      String(detail || `HTTP ${response.status}`),
      body.detail,
    )
  }
  return body as T
}

export function post<T>(path: string, body: unknown = {}) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) })
}
