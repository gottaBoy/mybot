import type { Model, RunDetail } from './api'

export type RecoveryConfig = {
  coordinator_model: string
  researcher_model: string
  reviewer_model: string
  max_calls: number
  parallel: number
  minutes: number
  max_output_tokens: number
  call_timeout_seconds: number
}
export type RecoveryRole = 'coordinator' | 'researcher' | 'reviewer'
export const recoveryRoles = [
  ['coordinator', 'coordinator_model'],
  ['researcher', 'researcher_model'],
  ['reviewer', 'reviewer_model'],
] as const
export type RecoveryPreview = {
  source_run_id: string
  source_status: string
  allowed: boolean
  snapshot_hash: string
  steps: Array<{
    key: string
    role: RecoveryRole
    title: string
    action: 'reuse' | 'retry'
  }>
  reuse_step_keys: string[]
  minimum_calls: number
  source_call_count: number
  source_unknown_usage: number
  requires_acknowledgement: boolean
  defaults: RecoveryConfig
  retry_runs: Array<{ id: string; status: string; created_at: string }>
  context: {
    goal: string
    acceptance: string
    notes: string
    text: string
    evidence: Array<{ path: string; bytes: number }>
  }
  reused_outputs: Array<{
    agent_id: string
    step_key: string
    title: string
    output: string
  }>
}

export function retryRoleIsActive(
  preview: RecoveryPreview,
  role: RecoveryRole,
) {
  return preview.steps.some(
    (step) => step.role === role && step.action === 'retry',
  )
}

export function originalRecoveryConfig(
  detail: RunDetail,
  preview: RecoveryPreview,
): RecoveryConfig {
  return {
    ...preview.defaults,
    ...detail.run.config,
    call_timeout_seconds:
      (detail.run.config as Partial<RecoveryConfig>).call_timeout_seconds ??
      120,
  }
}

export function lockReusedModels(
  preview: RecoveryPreview,
  config: RecoveryConfig,
): RecoveryConfig {
  const next = { ...config }
  for (const [role, key] of recoveryRoles)
    if (!retryRoleIsActive(preview, role)) next[key] = preview.defaults[key]
  return next
}

export function recoveryProblems(
  preview: RecoveryPreview,
  config: RecoveryConfig,
  models: Model[],
) {
  const problems: string[] = []
  if (!preview.allowed || !/^[0-9a-f]{64}$/.test(preview.snapshot_hash))
    problems.push('source_not_ready')
  const limits = [
    ['max_calls', Math.max(1, preview.minimum_calls), 8],
    ['parallel', 1, 2],
    ['minutes', 1, 30],
    ['max_output_tokens', 256, 4096],
    ['call_timeout_seconds', 10, 300],
  ] as const
  for (const [key, min, max] of limits)
    if (
      !Number.isInteger(config[key]) ||
      config[key] < min ||
      config[key] > max
    )
      problems.push(key)
  for (const [role, key] of recoveryRoles) {
    if (!retryRoleIsActive(preview, role)) {
      if (config[key] !== preview.defaults[key])
        problems.push('reused_model_locked')
      continue
    }
    const model = models.find((item) => item.id === config[key])
    if (!model || !model.key_available)
      problems.push(`${role}_model_unavailable`)
  }
  return [...new Set(problems)]
}

export function pausedResumeProblems(
  detail: RunDetail,
  preview: RecoveryPreview,
) {
  const problems: string[] = []
  if (detail.run.status !== 'paused' || preview.source_status !== 'paused')
    problems.push('resume_not_paused')
  if ((detail.retry_runs ?? []).length || preview.retry_runs.length)
    problems.push('resume_has_child')
  if (detail.calls.length !== preview.source_call_count)
    problems.push('resume_snapshot_mismatch')
  if (
    preview.requires_acknowledgement ||
    detail.calls.some((call) => call.status !== 'succeeded')
  )
    problems.push('resume_ambiguous_calls')
  const remaining = detail.run.config.max_calls - detail.calls.length
  if (!Number.isInteger(remaining) || remaining < preview.minimum_calls)
    problems.push('resume_budget_insufficient')
  return problems
}

export function recoveryCandidateKey(
  preview: RecoveryPreview,
  config: RecoveryConfig,
) {
  return JSON.stringify([preview.snapshot_hash, config])
}

export function recoveryReviewIsCurrent(
  reviewed: string | null,
  preview: RecoveryPreview,
  config: RecoveryConfig,
) {
  return reviewed === recoveryCandidateKey(preview, config)
}
