import { ApiError, type Bootstrap } from './api'
import { splitFiles, type Copy } from './state'

export type FormDraft = {
  name: string
  directory: string
  goal: string
  notes: string
  files: string
  acceptance: string
  projectId: string
  endpoint: string
  model: string
  modelKind?: 'chat_completions' | 'pi_sdk'
  keyEnv: string
  routing: {
    coordinator_model: string
    researcher_model: string
    reviewer_model: string
  }
  limits: {
    max_calls: number
    parallel: number
    minutes: number
    max_output_tokens: number
  }
  consent: boolean
  snapshotHash: string
  workflowVersion?: number | null
}
export type FormKind =
  'project' | 'task' | 'model' | 'backend' | 'run' | 'test' | 'check' | 'revoke'
export type FormFieldErrors = Record<string, string>
export function formLeaveDecision(state: { dirty: boolean; busy: boolean }) {
  return state.busy ? 'block' : state.dirty ? 'confirm' : 'allow'
}
export function firstFormError(errors: FormFieldErrors) {
  return Object.keys(errors)[0]
}
export function serverFormErrors(error: unknown): FormFieldErrors {
  if (!(error instanceof ApiError)) return {}
  const fields: FormFieldErrors = {}
  for (const [path, message] of Object.entries(error.fieldErrors)) {
    const key = path.split('.')[0]
    fields[key] ??= message
  }
  return fields
}

export function relativeFormPath(value: string) {
  return (
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.startsWith('/') &&
    !value.split('/').includes('..')
  )
}

function endpointParts(value: string) {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.hostname ||
      value.includes('\\') ||
      /[\u0000-\u0020]/.test(value) ||
      url.port === '0'
    )
      return undefined
    const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/)[0]
    if (authority.includes('@')) return undefined
    const host = authority.startsWith('[')
      ? authority.slice(1, authority.indexOf(']'))
      : authority.split(':')[0]
    return { url, host: host.toLowerCase() }
  } catch {
    return undefined
  }
}
function loopbackLiteral(host: string) {
  if (host.includes(':')) {
    try {
      return new URL(`http://[${host}]`).hostname === '[::1]'
    } catch {
      return false
    }
  }
  const parts = host.split('.')
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every(
      (part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255,
    )
  )
}
export function modelFormEndpoint(value: string) {
  const parsed = endpointParts(value.trim())
  if (!parsed) return false
  if (['169.254.169.254', 'metadata.google.internal'].includes(parsed.host))
    return false
  return (
    parsed.url.protocol === 'https:' ||
    (parsed.url.protocol === 'http:' &&
      (parsed.host === 'localhost' || loopbackLiteral(parsed.host)))
  )
}
export function backendFormEndpoint(value: string) {
  const parsed = endpointParts(value.trim())
  return !!parsed && loopbackLiteral(parsed.host) && parsed.url.pathname === '/'
}

export function validateFormDraft(
  kind: FormKind,
  draft: FormDraft,
  data: Pick<Bootstrap, 'projects' | 'models'>,
  t: Copy,
  step = 2,
  options: { projectAvailable?: boolean } = {},
): FormFieldErrors {
  const errors: FormFieldErrors = {}
  const text = (field: string, value: string, min: number, max: number) => {
    const length = [...value.trim()].length
    if (length < min)
      errors[field] = t(
        `至少填写 ${min} 个字符`,
        `Enter at least ${min} characters`,
      )
    else if (length > max)
      errors[field] = t(`最多 ${max} 个字符`, `Use at most ${max} characters`)
  }
  if (kind === 'project') {
    text('name', draft.name, 1, 100)
    text('directory', draft.directory, 0, 400)
    text('goal', draft.goal, 0, 4000)
    text('notes', draft.notes, 0, 16000)
    if (!relativeFormPath(draft.directory.trim()))
      errors.directory = t(
        '使用工作区内的相对目录',
        'Use a relative directory inside the workspace',
      )
  } else if (kind === 'task') {
    const projectAvailable =
      options.projectAvailable ??
      data.projects.some((project) => project.id === draft.projectId)
    if (!draft.projectId || !projectAvailable)
      errors.project_id = t('请选择有效项目', 'Select an available project')
    text('title', draft.name, 1, 160)
    text('goal', draft.goal, 8, 8000)
    text('acceptance', draft.acceptance, 0, 4000)
    const files = splitFiles(draft.files)
    if (files.length > 10)
      errors.files = t('最多选择 10 个文件', 'Select at most 10 files')
    else if (files.some((file) => !relativeFormPath(file)))
      errors.files = t(
        '文件必须使用项目内的相对路径',
        'Use file paths relative to the project',
      )
  } else if (kind === 'model' || kind === 'backend') {
    text('name', draft.name, 1, 80)
    text(
      'endpoint',
      draft.endpoint,
      kind === 'model' ? 5 : 8,
      kind === 'model' ? 500 : 200,
    )
    if (
      !errors.endpoint &&
      !(kind === 'model'
        ? modelFormEndpoint(draft.endpoint)
        : backendFormEndpoint(draft.endpoint))
    )
      errors.endpoint =
        kind === 'model'
          ? t(
              '使用无凭证的 HTTPS 地址，或本机回环 HTTP 地址',
              'Use a credential-free HTTPS URL, or loopback HTTP URL',
            )
          : t(
              '使用无路径、凭证或查询的回环 IP 地址',
              'Use a loopback IP origin without path, credentials or query',
            )
    if (kind === 'model') {
      if (
        !['chat_completions', 'pi_sdk'].includes(
          draft.modelKind ?? 'chat_completions',
        )
      )
        errors.kind = t(
          '请选择有效的执行方式',
          'Select an available execution adapter',
        )
      text('model', draft.model, 1, 150)
      text('key_env', draft.keyEnv, 0, 100)
      if (
        draft.keyEnv.trim() &&
        !/^WORKBENCH_MODEL_[A-Z0-9_]+_KEY$/.test(draft.keyEnv.trim())
      )
        errors.key_env = t(
          '只填 WORKBENCH_MODEL_<NAME>_KEY 变量名，不填密钥',
          'Enter only a WORKBENCH_MODEL_<NAME>_KEY variable name, never a key',
        )
    }
  } else if (kind === 'run') {
    if (!/^[0-9a-f]{64}$/.test(draft.snapshotHash))
      errors.context_hash = t(
        '资料快照不可用，请重新检查',
        'Context snapshot unavailable; recheck it',
      )
    if (step >= 1) {
      for (const [field, id] of Object.entries(draft.routing)) {
        if (!data.models.some((model) => model.id === id))
          errors[field] = t(
            '请选择已保存的模型配置',
            'Select a saved model configuration',
          )
      }
      for (const [field, min, max] of [
        ['max_calls', 3, 8],
        ['parallel', 1, 2],
        ['minutes', 1, 30],
        ['max_output_tokens', 256, 4096],
      ] as const) {
        const value = draft.limits[field]
        if (!Number.isInteger(value) || value < min || value > max)
          errors[field] = t(
            `填写 ${min}–${max} 的整数`,
            `Enter an integer from ${min} to ${max}`,
          )
      }
    }
  }
  if (
    ['run', 'test', 'check', 'revoke'].includes(kind) &&
    step >= 2 &&
    !draft.consent
  )
    errors.consent = t(
      '需要明确确认后才能继续',
      'Explicit confirmation is required',
    )
  return errors
}

export function formDraftFingerprint(kind: FormKind, draft: FormDraft) {
  if (kind === 'project')
    return JSON.stringify([
      draft.name,
      draft.directory,
      draft.goal,
      draft.notes,
    ])
  if (kind === 'task')
    return JSON.stringify([
      draft.projectId,
      draft.name,
      draft.goal,
      draft.acceptance,
      draft.files,
    ])
  if (kind === 'model')
    return JSON.stringify([
      draft.name,
      draft.endpoint,
      draft.model,
      draft.keyEnv,
      draft.modelKind ?? 'chat_completions',
    ])
  if (kind === 'backend') return JSON.stringify([draft.name, draft.endpoint])
  if (kind === 'run')
    return JSON.stringify([
      draft.routing,
      draft.limits,
      draft.consent,
      draft.snapshotHash,
      draft.workflowVersion ?? null,
    ])
  return JSON.stringify([draft.consent])
}
