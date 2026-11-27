import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppLoading,
  AppNumber,
  AppSelect,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { api, ApiError, type Bootstrap, type RunDetail } from './api'
import { statusText, type Copy } from './state'
import {
  lockReusedModels,
  originalRecoveryConfig,
  pausedResumeProblems,
  recoveryCandidateKey,
  recoveryProblems,
  recoveryReviewIsCurrent,
  recoveryRoles,
  retryRoleIsActive,
  type RecoveryConfig,
  type RecoveryPreview,
} from './recovery'
import { admitTaskPlanScope } from './task-plan-scope'
import {
  abandonRecoveryIntent,
  executeRecoveryIntent,
  intentConfig,
  intentIsLocked,
  prepareRecoveryIntent,
  presentAppliedRecovery,
  readRecoveryIntent,
  readRecoveryIntents,
  type RecoveryIntent,
  type RecoveryIntentLedger,
} from './recovery-intents'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  refreshWorkbenchNavigationBlocker,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'

type RecoveryState = {
  detail: RunDetail
  preview: RecoveryPreview
  models: Bootstrap['models']
  ledger: RecoveryIntentLedger
}
type Props = {
  source: RunDetail
  mode: 'retry' | 'resume'
  open: boolean
  t: Copy
  legacyUrl: string
  onClose: () => void
  onUncertain: () => void
  onComplete: (id: string) => Promise<void>
}

export function RunRecovery({
  source,
  mode,
  open,
  t,
  legacyUrl,
  onClose,
  onUncertain,
  onComplete,
}: Props) {
  const [state, setState] = useState<RecoveryState | null>(null)
  const [config, setConfig] = useState<RecoveryConfig | null>(null)
  const [reviewed, setReviewed] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID())
  const [consent, setConsent] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState('load')
  const [error, setError] = useState('')
  const [ambiguous, setAmbiguous] = useState(false)
  const [intent, setIntent] = useState<RecoveryIntent | null>(null)
  const [uncertainAction, setUncertainAction] = useState<
    'prepare' | 'abandon' | 'execute' | null
  >(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const [baseline, setBaseline] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const request = useRef<AbortController | null>(null)
  const submitting = useRef(false)
  const navigationPending = useRef(false)
  const navigationState = useRef({ dirty: false, busy: false })
  const sourceId = source.run.id
  const operationMode = intent?.mode ?? mode
  const isResume = operationMode === 'resume'

  async function read(signal: AbortSignal): Promise<RecoveryState> {
    const [detail, preview, bootstrap, ledger] = await Promise.all([
      api<RunDetail>(`/runs/${sourceId}`, { signal }),
      api<RecoveryPreview>(`/runs/${sourceId}/retry-preview`, { signal }),
      api<Bootstrap>('/bootstrap', { signal }),
      readRecoveryIntents(sourceId, signal),
    ])
    if (detail.run.id !== sourceId || preview.source_run_id !== sourceId)
      throw new Error(t('恢复来源不匹配', 'Recovery source does not match'))
    admitTaskPlanScope(preview, detail.task.id)
    return { detail, preview, models: bootstrap.models, ledger }
  }
  function adopt(next: RecoveryState, receipt: RecoveryIntent | null) {
    const resume = (receipt?.mode ?? mode) === 'resume'
    const defaults = resume
      ? originalRecoveryConfig(next.detail, next.preview)
      : next.preview.defaults
    const candidate = receipt ? intentConfig(receipt, defaults) : defaults
    setState(next)
    setIntent(receipt)
    setConfig(candidate)
    setBaseline(JSON.stringify(candidate))
    setRequestId(receipt?.request_id ?? crypto.randomUUID())
    revokeReview()
    const unresolved =
      receipt?.state === 'applying' || receipt?.state === 'unknown'
    setAmbiguous(unresolved)
    if (unresolved) onUncertain()
  }

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    void read(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return
        adopt(next, next.ledger.unresolved ?? next.ledger.latest)
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof ApiError && reason.status === 404
              ? t(
                  '后端尚未提供持久恢复回执，请同步更新后端后再操作。',
                  'Durable recovery receipts are unavailable. Update the matching backend before proceeding.',
                )
              : String(reason.message ?? reason),
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy('')
      })
    return () => request.current?.abort()
    // A recovery dialog owns a fixed source and operation until it is closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, mode, loadVersion])

  const problemText = (code: string) => {
    const labels: Record<string, [string, string]> = {
      source_not_ready: [
        '来源尚未停止，或已没有需要恢复的步骤。',
        'The source is not stopped or has no unfinished steps.',
      ],
      max_calls: [
        '新增调用预算必须覆盖全部待重试步骤，且不超过 8。',
        'The new call budget must cover unfinished steps and cannot exceed 8.',
      ],
      parallel: [
        '研究并行上限必须为 1 或 2。',
        'Research concurrency must be 1 or 2.',
      ],
      minutes: [
        '执行时限必须为 1 至 30 分钟。',
        'The time limit must be 1–30 minutes.',
      ],
      max_output_tokens: [
        '输出上限必须为 256 至 4096 Token。',
        'The output limit must be 256–4096 tokens.',
      ],
      call_timeout_seconds: [
        '单次调用时限必须为 10 至 300 秒。',
        'The per-call timeout must be 10–300 seconds.',
      ],
      reused_model_locked: [
        '已复用角色的模型不能修改。',
        'Models for fully reused roles cannot change.',
      ],
      resume_not_paused: [
        '仅明确暂停的运行可按原资源继续。',
        'Only a clearly paused run can resume with its original resources.',
      ],
      resume_has_child: [
        '来源已有重试，请检查关联运行。',
        'The source already has a retry; inspect the associated run.',
      ],
      resume_snapshot_mismatch: [
        '运行详情与恢复预览不一致，请重新读取后检查。',
        'The run detail and recovery preview differ. Read them again before reviewing.',
      ],
      resume_ambiguous_calls: [
        '存在未确认调用；请改用关联重试并确认未知结果。',
        'Calls have ambiguous outcomes; use a linked retry with explicit replay consent.',
      ],
      resume_budget_insufficient: [
        '原调用预算不足以覆盖剩余步骤，请创建关联重试。',
        'The original call budget cannot cover the remaining steps; create a linked retry.',
      ],
    }
    const label = labels[code]
    return label
      ? t(...label)
      : t(
          '所选角色模型已不存在或密钥不可用。',
          'A selected role model is missing or its key is unavailable.',
        )
  }
  const problems =
    state && config
      ? [
          ...recoveryProblems(state.preview, config, state.models),
          ...(isResume
            ? pausedResumeProblems(state.detail, state.preview)
            : []),
        ]
      : []
  const currentReview =
    !!state &&
    !!config &&
    intent?.state === 'prepared' &&
    intent.snapshot_hash === state.preview.snapshot_hash &&
    recoveryReviewIsCurrent(reviewed, state.preview, config)
  const blocked = !!busy || ambiguous || intentIsLocked(intent)
  const dirty = !!config && !!baseline && JSON.stringify(config) !== baseline
  navigationState.current = {
    dirty: open && dirty && !ambiguous,
    busy: open && ['submit', 'review', 'abandon'].includes(busy),
  }
  useEffect(() => {
    if (!open) return
    const release = registerWorkbenchNavigationBlocker({
      getState: () => ({
        ...navigationState.current,
        busy: navigationState.current.busy || submitting.current,
      }),
      onBlocked: () => {
        navigationPending.current = true
        setDiscardOpen(true)
      },
      onReset: () => {
        navigationPending.current = false
        setDiscardOpen(false)
      },
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!navigationState.current.dirty && !navigationState.current.busy)
        return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      release()
      window.removeEventListener('beforeunload', unload)
    }
  }, [open])
  useEffect(() => {
    if (open) refreshWorkbenchNavigationBlocker()
  }, [open, dirty, ambiguous, busy])

  function requestClose() {
    if (['submit', 'review', 'abandon'].includes(busy)) return
    if (dirty && !ambiguous) setDiscardOpen(true)
    else onClose()
  }

  function revokeReview() {
    setReviewed(null)
    setConsent(false)
    setAcknowledged(false)
  }
  function change<K extends keyof RecoveryConfig>(
    key: K,
    value: RecoveryConfig[K],
  ) {
    if (!config || blocked || isResume) return
    setConfig({ ...config, [key]: value })
    revokeReview()
    setError('')
  }
  async function review() {
    if (!state || !config || blocked) return
    setBusy('review')
    setError('')
    revokeReview()
    const controller = new AbortController()
    request.current = controller
    let mutationAttempted = false
    try {
      const next = await read(controller.signal)
      const pending = next.ledger.unresolved
      if (pending && pending.request_id !== intent?.request_id) {
        adopt(next, pending)
        setError(
          t(
            '发现另一份已登记请求，已恢复其资源；请检查后重新确认。',
            'Another registered request was found. Its resources were restored for review.',
          ),
        )
        return
      }
      const candidate = isResume
        ? originalRecoveryConfig(next.detail, next.preview)
        : lockReusedModels(next.preview, config)
      setState(next)
      setConfig(candidate)
      if (next.preview.snapshot_hash !== state.preview.snapshot_hash) {
        setError(
          t(
            '来源记录已变化，已刷新范围。请重新检查并确认。',
            'The source changed. Review the refreshed scope before confirming.',
          ),
        )
        return
      }
      const invalid = [
        ...recoveryProblems(next.preview, candidate, next.models),
        ...(isResume ? pausedResumeProblems(next.detail, next.preview) : []),
      ]
      if (invalid.length) {
        setError(invalid.map(problemText).join(' '))
        return
      }
      const samePrepared =
        pending?.state === 'prepared' &&
        pending.mode === operationMode &&
        pending.snapshot_hash === next.preview.snapshot_hash &&
        JSON.stringify(intentConfig(pending, candidate)) ===
          JSON.stringify(candidate)
      let registered: RecoveryIntent
      if (samePrepared) {
        registered = pending
      } else {
        let id = requestId
        if (pending) {
          setUncertainAction('abandon')
          mutationAttempted = true
          const abandoned = await abandonRecoveryIntent(
            sourceId,
            pending.request_id,
            controller.signal,
          )
          if (abandoned.state !== 'abandoned') {
            adopt(next, abandoned)
            setAmbiguous(true)
            onUncertain()
            return
          }
          setIntent(null)
          id = crypto.randomUUID()
          setRequestId(id)
        }
        setUncertainAction('prepare')
        mutationAttempted = true
        registered = await prepareRecoveryIntent(
          sourceId,
          {
            request_id: id,
            mode: operationMode,
            snapshot_hash: next.preview.snapshot_hash,
            ...(isResume ? {} : { config: candidate }),
          },
          controller.signal,
        )
      }
      setIntent(registered)
      setRequestId(registered.request_id)
      setUncertainAction(null)
      if (registered.state !== 'prepared') {
        adopt(next, registered)
        return
      }
      const confirmed = intentConfig(registered, candidate)
      if (
        JSON.stringify(confirmed) !== JSON.stringify(candidate) ||
        registered.mode !== operationMode ||
        registered.snapshot_hash !== next.preview.snapshot_hash
      )
        throw new Error('recovery_registered_candidate_mismatch')
      setConfig(confirmed)
      setBaseline(JSON.stringify(confirmed))
      setReviewed(recoveryCandidateKey(next.preview, candidate))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      if (mutationAttempted && !rejected) {
        setAmbiguous(true)
        onUncertain()
      } else setUncertainAction(null)
    } finally {
      setBusy('')
    }
  }
  async function submit() {
    if (
      !state ||
      !config ||
      blocked ||
      submitting.current ||
      !currentReview ||
      !intent ||
      problems.length ||
      !consent ||
      (!isResume && state.preview.requires_acknowledgement && !acknowledged)
    )
      return
    submitting.current = true
    setBusy('submit')
    setError('')
    const controller = new AbortController()
    request.current = controller
    setUncertainAction('execute')
    try {
      const receipt = await executeRecoveryIntent(
        sourceId,
        intent.request_id,
        acknowledged,
        controller.signal,
      )
      setIntent(receipt)
      revokeReview()
      if (receipt.state === 'applied' && receipt.target_run_id) {
        setUncertainAction(null)
        navigationState.current = { dirty: false, busy: false }
        submitting.current = false
        if (confirmWorkbenchNavigation()) {
          onClose()
          return
        }
        const presentationError = await presentAppliedRecovery(
          receipt,
          onComplete,
        )
        if (presentationError)
          setError(
            t(
              '控制请求已应用，但页面未能更新。请检查目标运行，不要重发。',
              'The control request was applied, but the view could not update. Inspect the target run; do not replay it.',
            ),
          )
      } else if (
        receipt.state === 'rejected' ||
        receipt.state === 'abandoned'
      ) {
        setUncertainAction(null)
        setError(
          receipt.error_code ??
            t(
              '请求未应用，需重新检查。',
              'The request was not applied. Review again.',
            ),
        )
      } else {
        setAmbiguous(true)
        onUncertain()
      }
    } catch (reason) {
      setConsent(false)
      setAcknowledged(false)
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      if (!rejected) {
        setAmbiguous(true)
        onUncertain()
      } else {
        revokeReview()
        setUncertainAction(null)
      }
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      submitting.current = false
      setBusy('')
    }
  }
  async function reconcile() {
    if (busy) return
    setBusy('reconcile')
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const next = await read(controller.signal)
      setState(next)
      const id = requestId
      let receipt: RecoveryIntent | null = null
      try {
        receipt = await readRecoveryIntent(sourceId, id, controller.signal)
      } catch (reason) {
        if (!(reason instanceof ApiError && reason.status === 404)) throw reason
      }
      if (!receipt) {
        setError(
          t(
            '尚未找到该请求的精确回执；未找到记录不证明请求未处理。不会自动重发。',
            'No exact receipt was found. Missing records do not prove rejection. Nothing will be replayed automatically.',
          ),
        )
        return
      }
      if (receipt.state !== 'prepared' || uncertainAction !== 'execute') {
        adopt(next, receipt)
        setUncertainAction(null)
      } else {
        setIntent(receipt)
        revokeReview()
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }
  async function abandon() {
    if (!intent || intent.state !== 'prepared' || busy || ambiguous) return
    setBusy('abandon')
    setUncertainAction('abandon')
    revokeReview()
    const controller = new AbortController()
    request.current = controller
    try {
      const receipt = await abandonRecoveryIntent(
        sourceId,
        intent.request_id,
        controller.signal,
      )
      setIntent(receipt)
      setUncertainAction(null)
      if (receipt.state !== 'abandoned') {
        setAmbiguous(true)
        onUncertain()
      }
    } catch (reason) {
      setAmbiguous(true)
      onUncertain()
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }
  function newCandidate() {
    if (
      !state ||
      busy ||
      !intent ||
      !['applied', 'rejected', 'abandoned'].includes(intent.state) ||
      !state.preview.allowed
    )
      return
    const candidate =
      mode === 'resume'
        ? originalRecoveryConfig(state.detail, state.preview)
        : state.preview.defaults
    setIntent(null)
    setConfig(candidate)
    setBaseline(JSON.stringify(candidate))
    setRequestId(crypto.randomUUID())
    setAmbiguous(false)
    setUncertainAction(null)
    revokeReview()
    setError('')
  }

  if (!open) return null
  return (
    <>
      <AppDialog
        title={
          isResume
            ? t('继续暂停运行', 'Resume paused run')
            : t('重试与资源', 'Retry & resources')
        }
        closeLabel={t('关闭', 'Close')}
        onClose={requestClose}
        busy={['submit', 'review', 'abandon'].includes(busy)}
      >
        <div className="wb-form">
          {error && (
            <p className="wb-error" role="alert">
              {error}
            </p>
          )}
          {!state || !config ? (
            <>
              {busy ? (
                <AppLoading
                  label={t('正在读取恢复范围', 'Loading recovery scope')}
                />
              ) : (
                <AppButton
                  label={t('重新读取', 'Read again')}
                  icon={<RefreshCw size={15} />}
                  onClick={() => {
                    setBusy('load')
                    setError('')
                    setLoadVersion((value) => value + 1)
                  }}
                />
              )}
            </>
          ) : (
            <>
              <div className="wb-notice">
                <ShieldCheck size={17} />
                <p>
                  {isResume
                    ? t(
                        '继续同一 Run，保留原资料和原资源。请求先登记并绑定快照；确认执行与回执原子保存。',
                        'Resume the same Run with its original context and resources. The registered request binds the snapshot; applying the control and its receipt is atomic.',
                      )
                    : t(
                        '创建关联的新 Run，仅重试未完成步骤。来源运行、历史调用和成果保持不变。',
                        'Create a linked Run and retry only unfinished steps. The source run, historical calls and artifacts remain unchanged.',
                      )}
                </p>
              </div>
              {intent && (
                <section
                  aria-label={t('恢复请求回执', 'Recovery request receipt')}
                >
                  <dl className="wb-details">
                    <dt>{t('请求标识', 'Request ID')}</dt>
                    <dd>
                      <code>{intent.request_id}</code>
                    </dd>
                    <dt>{t('操作', 'Operation')}</dt>
                    <dd>
                      {intent.mode === 'resume'
                        ? t('继续原运行', 'Resume source')
                        : t('关联重试', 'Linked retry')}
                    </dd>
                    <dt>{t('回执状态', 'Receipt state')}</dt>
                    <dd>
                      <AppBadge
                        tone={
                          intent.state === 'applied'
                            ? 'info'
                            : intent.state === 'rejected'
                              ? 'error'
                              : intent.state === 'unknown'
                                ? 'warning'
                                : 'neutral'
                        }
                      >
                        {
                          {
                            prepared: t(
                              '已登记，执行尚未确认',
                              'Registered; execution not confirmed',
                            ),
                            applying: t(
                              '正在应用控制请求',
                              'Applying control request',
                            ),
                            applied: t(
                              '控制请求已应用',
                              'Control request applied',
                            ),
                            rejected: t(
                              '控制请求被拒绝',
                              'Control request rejected',
                            ),
                            unknown: t(
                              '控制请求结果未知',
                              'Control outcome unknown',
                            ),
                            abandoned: t(
                              '登记候选已放弃',
                              'Registered candidate abandoned',
                            ),
                          }[intent.state]
                        }
                      </AppBadge>
                    </dd>
                    <dt>{t('候选指纹', 'Candidate fingerprint')}</dt>
                    <dd>
                      <code>{intent.candidate_hash}</code>
                    </dd>
                  </dl>
                  {intent.state === 'applied' && (
                    <p className="wb-hint">
                      {t(
                        '这只确认排队或继续命令已应用，不代表模型执行成功、成果已验收或费用已结算。',
                        'This confirms only that the queue or resume command was applied, not model success, artifact acceptance or settled costs.',
                      )}
                    </p>
                  )}
                  {intent.error_code && (
                    <p className="wb-error">{intent.error_code}</p>
                  )}
                  {intent.state === 'applied' && intent.target_run_id && (
                    <AppButton
                      label={`${t('检查运行', 'Inspect run')} ${intent.target_run_id.slice(0, 8)}`}
                      href={`#run/${intent.target_run_id}`}
                      icon={<ArrowRight size={14} />}
                    />
                  )}
                  {intent.state === 'prepared' && !ambiguous && (
                    <AppButton
                      label={t(
                        '放弃已登记候选',
                        'Abandon registered candidate',
                      )}
                      disabled={!!busy}
                      busy={busy === 'abandon'}
                      onClick={() => void abandon()}
                    />
                  )}
                  {['applied', 'rejected', 'abandoned'].includes(
                    intent.state,
                  ) &&
                    !ambiguous &&
                    state.preview.allowed && (
                      <AppButton
                        label={t(
                          '准备新的恢复候选',
                          'Prepare a new recovery candidate',
                        )}
                        disabled={!!busy}
                        onClick={newCandidate}
                      />
                    )}
                  {!ambiguous && (
                    <AppButton
                      label={t('重新读取恢复状态', 'Read recovery outcome')}
                      icon={<RefreshCw size={15} />}
                      busy={busy === 'reconcile'}
                      disabled={!!busy}
                      onClick={() => void reconcile()}
                    />
                  )}
                </section>
              )}
              <dl className="wb-details">
                <dt>{t('来源运行', 'Source run')}</dt>
                <dd>
                  <code>{sourceId}</code> ·{' '}
                  {statusText(state.preview.source_status, t)}
                </dd>
                <dt>{t('历史调用', 'Historical calls')}</dt>
                <dd>
                  {state.preview.source_call_count} ·{' '}
                  {state.preview.source_unknown_usage}{' '}
                  {t('次用量不完整', 'with incomplete usage')}
                </dd>
                <dt>{t('本次范围', 'Recovery scope')}</dt>
                <dd>
                  {state.preview.reuse_step_keys.length}{' '}
                  {t('步复用', 'reused steps')} · {state.preview.minimum_calls}{' '}
                  {t('次最低新增调用', 'minimum new calls')}
                </dd>
                <dt>{t('费用', 'Cost')}</dt>
                <dd>{t('未知，不等于免费', 'Unknown, not free')}</dd>
              </dl>
              <ol>
                {state.preview.steps.map((step) => (
                  <li key={step.key}>
                    <AppBadge
                      tone={step.action === 'reuse' ? 'success' : 'neutral'}
                    >
                      {step.action === 'reuse'
                        ? t('复用', 'Reuse')
                        : t('待重试', 'Retry')}
                    </AppBadge>{' '}
                    {step.title}
                  </li>
                ))}
              </ol>
              {recoveryRoles.map(([role, key], index) => {
                const selected = state.models.find(
                  (model) => model.id === config[key],
                )
                return (
                  <AppSelect
                    key={role}
                    label={`${[t('规划模型', 'Planning model'), t('研究模型', 'Research model'), t('汇总模型', 'Synthesis model')][index]}${retryRoleIsActive(state.preview, role) ? '' : t(' · 复用原结果', ' · reused result')}`}
                    value={config[key]}
                    disabled={
                      blocked ||
                      isResume ||
                      !retryRoleIsActive(state.preview, role)
                    }
                    options={[
                      ...state.models.map((model) => ({
                        value: model.id,
                        label: `${model.name} · ${model.model}${model.key_available ? '' : t(' · 密钥不可用', ' · key unavailable')}`,
                      })),
                      ...(!selected
                        ? [
                            {
                              value: config[key],
                              label: `${t('历史模型', 'Historical model')} · ${config[key]}`,
                            },
                          ]
                        : []),
                    ]}
                    onChange={(value) => change(key, value)}
                  />
                )
              })}
              <div className="wb-form-grid">
                <AppNumber
                  label={
                    isResume
                      ? t('原调用总预算', 'Original call budget')
                      : t('本次新增调用预算', 'New call budget')
                  }
                  value={config.max_calls}
                  min={state.preview.minimum_calls}
                  max={8}
                  isDisabled={blocked || isResume}
                  onChange={(value) => change('max_calls', value)}
                />
                <AppNumber
                  label={t('研究并行上限', 'Research concurrency')}
                  value={config.parallel}
                  min={1}
                  max={2}
                  isDisabled={blocked || isResume}
                  onChange={(value) => change('parallel', value)}
                />
                {isResume &&
                !('call_timeout_seconds' in state.detail.run.config) ? (
                  <div>
                    <p>{t('单次调用时限', 'Per-call timeout')}</p>
                    <p className="wb-hint">
                      {t(
                        '原运行未固定该值；沿用执行器默认，实际时限未知。',
                        'Not fixed by the original run. The executor default applies; its effective timeout is unknown.',
                      )}
                    </p>
                  </div>
                ) : (
                  <AppNumber
                    label={t(
                      '单次调用时限（秒）',
                      'Per-call timeout (seconds)',
                    )}
                    value={config.call_timeout_seconds}
                    min={10}
                    max={300}
                    isDisabled={blocked || isResume}
                    onChange={(value) => change('call_timeout_seconds', value)}
                  />
                )}
                <AppNumber
                  label={t('执行时限（分钟）', 'Time limit (minutes)')}
                  value={config.minutes}
                  min={1}
                  max={30}
                  isDisabled={blocked || isResume}
                  onChange={(value) => change('minutes', value)}
                />
                <AppNumber
                  label={t('每次输出 Token 上限', 'Output tokens per call')}
                  value={config.max_output_tokens}
                  min={256}
                  max={4096}
                  isDisabled={blocked || isResume}
                  onChange={(value) => change('max_output_tokens', value)}
                />
              </div>
              {(!intent || intent.state === 'prepared') && (
                <section>
                  <h3>{t('本次资料发送位置', 'Context destinations')}</h3>
                  {recoveryRoles
                    .filter(([role]) => retryRoleIsActive(state.preview, role))
                    .map(([role, key]) => {
                      const model = state.models.find(
                        (item) => item.id === config[key],
                      )
                      return (
                        <p key={role}>
                          {model?.name ?? config[key]} ·{' '}
                          <code>{model?.endpoint || model?.kind || '-'}</code>
                        </p>
                      )
                    })}
                  <p className="wb-hint">
                    {t(
                      'Codex 使用单通道；Token 设置不构成 CLI 输出硬上限。',
                      'Codex uses a single channel; the token setting is not a hard CLI output ceiling.',
                    )}
                  </p>
                </section>
              )}
              <details className="wb-disclosure">
                <summary>
                  {t(
                    '原资料快照与复用正文',
                    'Original snapshot and reused output',
                  )}
                </summary>
                <pre className="wb-call-diagnostics">
                  {JSON.stringify(
                    {
                      context: state.preview.context,
                      reused_outputs: state.preview.reused_outputs,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {!!problems.length &&
                (!intent || intent.state === 'prepared') && (
                  <ul className="wb-error" role="status">
                    {problems.map((problem) => (
                      <li key={problem}>{problemText(problem)}</li>
                    ))}
                  </ul>
                )}
              {!ambiguous && (!intent || intent.state === 'prepared') && (
                <>
                  <AppButton
                    label={
                      isResume
                        ? t('检查继续范围', 'Review resume scope')
                        : t('检查重试范围', 'Review retry scope')
                    }
                    icon={<RefreshCw size={15} />}
                    busy={busy === 'review'}
                    disabled={!!busy || !!problems.length}
                    onClick={() => void review()}
                  />
                  {currentReview && (
                    <p role="status" className="wb-hint">
                      {t(
                        '已登记当前资料、模型和资源候选，尚未授权执行。修改后需重新登记和确认。',
                        'The context, models and resources are registered, without execution authorization. Changes require registration and consent again.',
                      )}
                    </p>
                  )}
                  {!isResume && state.preview.requires_acknowledgement && (
                    <AppCheckbox
                      label={t(
                        '我确认未知结果可能再次产生费用',
                        'I acknowledge that unknown outcomes may incur costs again',
                      )}
                      value={acknowledged}
                      isDisabled={!currentReview || !!busy}
                      onChange={setAcknowledged}
                    />
                  )}
                  <AppCheckbox
                    label={
                      isResume
                        ? t(
                            '我确认按原资源继续此暂停运行',
                            'I consent to resume this paused Run with its original resources',
                          )
                        : t(
                            '我确认原资料快照、模型和本次新增预算',
                            'I consent to the original snapshot, selected models and new call budget',
                          )
                    }
                    value={consent}
                    isDisabled={!currentReview || !!busy}
                    onChange={setConsent}
                  />
                  <AppButton
                    label={
                      isResume
                        ? t('确认继续运行', 'Confirm resume')
                        : t('确认创建关联重试', 'Confirm linked retry')
                    }
                    icon={<ArrowRight size={15} />}
                    tone="primary"
                    busy={busy === 'submit'}
                    disabled={
                      !!busy ||
                      !currentReview ||
                      !!problems.length ||
                      !consent ||
                      (!isResume &&
                        state.preview.requires_acknowledgement &&
                        !acknowledged)
                    }
                    onClick={() => void submit()}
                  />
                </>
              )}
              {ambiguous && (
                <div className="wb-error" role="status">
                  <p>
                    {t(
                      '请求结果尚未确认，已锁定此候选。只查询原请求的精确回执，不自动重发或改用新请求标识。',
                      'The outcome is unconfirmed and this candidate is locked. Read the exact original receipt; nothing is automatically replayed or assigned a new request ID.',
                    )}
                  </p>
                  <AppButton
                    label={t('重新读取恢复状态', 'Read recovery outcome')}
                    icon={<RefreshCw size={15} />}
                    busy={busy === 'reconcile'}
                    disabled={!!busy}
                    onClick={() => void reconcile()}
                  />
                  {uncertainAction && uncertainAction !== 'execute' && (
                    <p>
                      {t(
                        '本次仅尝试登记或放弃候选，客户端尚未为此操作发送执行请求。',
                        'This attempt only registered or abandoned a candidate; this client has not submitted execution for that operation.',
                      )}
                    </p>
                  )}
                  <code>
                    {t('保留的请求标识', 'Retained request ID')}: {requestId}
                  </code>
                </div>
              )}
              {!!state.ledger.history.length && (
                <details className="wb-disclosure">
                  <summary>
                    {t('上次读取的恢复历史', 'Last-read recovery history')} ·{' '}
                    {state.ledger.total}
                  </summary>
                  {state.ledger.history_truncated && (
                    <p>
                      {t(
                        '仅列出最近50条。',
                        'Only the latest 50 records are listed.',
                      )}
                    </p>
                  )}
                  <ul>
                    {state.ledger.history.map((receipt) => (
                      <li key={receipt.request_id}>
                        <code>{receipt.request_id}</code> · {receipt.mode} ·{' '}
                        {receipt.state}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          <AppButton
            label={t('旧版恢复工作台', 'Classic recovery workbench')}
            icon={<ExternalLink size={14} />}
            tone="ghost"
            href={`${legacyUrl}/#run/${sourceId}`}
            target="_blank"
            rel="noreferrer"
          />
        </div>
      </AppDialog>
      {discardOpen && (
        <AppDraftGuard
          title={t('放弃恢复资源草稿？', 'Discard recovery resource changes?')}
          description={t(
            '关闭会放弃未登记的本地修改。已登记请求仍保存在服务端；关闭不会执行或重发请求。',
            'Closing discards unregistered local edits. Registered requests remain on the server; closing never executes or replays them.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃更改', 'Discard changes')}
          onKeep={() => {
            if (navigationPending.current) {
              navigationPending.current = false
              cancelWorkbenchNavigation()
            }
            setDiscardOpen(false)
          }}
          onDiscard={() => {
            setDiscardOpen(false)
            if (navigationPending.current) {
              navigationState.current = { dirty: false, busy: false }
              navigationPending.current = false
              confirmWorkbenchNavigation()
            }
            onClose()
          }}
        />
      )}
    </>
  )
}
