import { useEffect, useRef, useState } from 'react'
import { Check, FileSearch, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppNumber,
  AppSelect,
} from '../components/ui'
import { ApiError, type Model, type Task } from './api'
import type { Copy } from './state'
import {
  discardPlanSuggestion,
  executePlanSuggestion,
  fetchPlanSuggestion,
  preparePlanSuggestion,
  previewPlanSuggestion,
  type PlanSuggestionConfig,
  type PlanSuggestionJob,
  type PlanSuggestionPreview,
  type PlanSuggestionSource,
} from './plan-suggestions'
import type { PlanDefinition } from './task-plans'
import {
  cancelWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'

type Phase = 'edit' | 'preview' | 'prepared' | 'result' | 'sending' | 'unknown'

export function TaskPlanSuggestionDialog({
  task,
  models,
  initial,
  t,
  onClose,
  onRequestId,
  onUseSuggestion,
}: {
  task: Task
  models: Model[]
  initial?: string
  t: Copy
  onClose: () => void
  onRequestId?: (requestId?: string) => void
  onUseSuggestion: (
    definition: PlanDefinition,
    source: {
      artifact_id: string
      run_id: string
      candidate_hash: string
      source: PlanSuggestionSource
    },
  ) => void
}) {
  const [config, setConfig] = useState<PlanSuggestionConfig>(() => ({
    model_id: '',
    files: [],
    max_calls: 1,
    call_timeout_seconds: 120,
    max_output_tokens: 1800,
  }))
  const [preview, setPreview] = useState<PlanSuggestionPreview>()
  const [job, setJob] = useState<PlanSuggestionJob>()
  const [pending, setPending] = useState(initial)
  const [phase, setPhase] = useState<Phase>(initial ? 'unknown' : 'edit')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [discardOpen, setDiscardOpen] = useState(false)
  const mounted = useRef(true)
  const operation = useRef(false)
  const internal = useRef(false)
  const request = useRef<AbortController | undefined>(undefined)
  const released = useRef(false)
  const latest = useRef({ config, preview, job, pending, phase, consent })
  latest.current = { config, preview, job, pending, phase, consent }
  const busy = phase === 'sending' || phase === 'unknown'
  const dirty =
    phase !== 'result' &&
    (Boolean(preview) || Boolean(job) || JSON.stringify(config) !== JSON.stringify({
      model_id: '',
      files: [],
      max_calls: 1,
      call_timeout_seconds: 120,
      max_output_tokens: 1800,
    }))
  const guard = useRef({ dirty, busy })
  guard.current = { dirty, busy }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    const unregister = registerWorkbenchNavigationBlocker({
      getState: () =>
        internal.current || released.current
          ? { dirty: false, busy: false }
          : guard.current,
      onBlocked: () => undefined,
      onReset: () => undefined,
    })
    return unregister
  }, [])
  useEffect(() => {
    if (initial) void reconcile()
  }, [])

  function close() {
    if (busy) return
    released.current = true
    cancelWorkbenchNavigation()
    onClose()
  }
  function useSuggestion() {
    if (!artifact || !definition || !job) return
    released.current = true
    cancelWorkbenchNavigation()
    onUseSuggestion(definition, {
      artifact_id: artifact.id,
      run_id: artifact.run_id,
      candidate_hash: job.candidate_hash,
      source: artifact.source,
    })
  }
  function updateConfig(next: Partial<PlanSuggestionConfig>) {
    if (operation.current || pending) return
    setConfig((current) => ({ ...current, ...next }))
    setPreview(undefined)
    setConsent(false)
    setPhase('edit')
    setError('')
  }
  async function previewSuggestion() {
    const state = latest.current
    if (operation.current || state.pending || !state.config.model_id) return
    operation.current = true
    setPhase('sending')
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await previewPlanSuggestion(task, state.config, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setPreview(result)
      setJob(undefined)
      setConsent(false)
      setPhase('preview')
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return
      setPhase('edit')
      setError(
        reason instanceof ApiError && reason.status === 409
          ? t(
              '当前任务已有未结束的建议，请先核对或放弃原请求。',
              'This task already has an unresolved suggestion. Reconcile or discard the original request first.',
            )
          : t(
              '建议资料核对失败，未调用模型。',
              'Suggestion context could not be verified. No model was called.',
            ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function prepareSuggestion() {
    const state = latest.current
    if (operation.current || state.pending || !state.preview || !state.consent) return
    const requestId = crypto.randomUUID()
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    setPending(requestId)
    internal.current = true
    try {
      onRequestId?.(requestId)
    } finally {
      internal.current = false
    }
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await preparePlanSuggestion(
        task,
        requestId,
        state.preview,
        controller.signal,
      )
      if (!mounted.current || controller.signal.aborted) return
      setJob(result)
      setPhase('prepared')
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setPending(undefined)
        onRequestId?.()
        setPhase('preview')
        setError(t('建议候选未准备，当前资料仍可重新核对。', 'The suggestion candidate was not prepared. Review the current context again.'))
      } else {
        setPhase('unknown')
        setError(
          t(
            '准备结果未确认，请按原请求核对；不会自动重发。',
            'Preparation is unresolved. Check the original request; it will not be resent automatically.',
          ),
        )
      }
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function executeSuggestion() {
    const state = latest.current
    if (operation.current || !state.job || state.job.state !== 'prepared' || !state.consent)
      return
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await executePlanSuggestion(task, state.job, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      let settled = result
      if (result.state === 'applied' && !result.artifact) {
        for (let attempt = 0; attempt < 120; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 150))
          if (controller.signal.aborted) return
          settled = await fetchPlanSuggestion(
            task.id,
            result.request_id,
            controller.signal,
          )
          if (settled.artifact || settled.state !== 'applied') break
        }
      }
      setJob(settled)
      setPending(settled.request_id)
      setPhase(settled.state === 'applied' ? 'result' : 'unknown')
      if (settled.state !== 'applied')
        setError(
          t(
            '建议运行结果未确认，请核对原请求。',
            'The suggestion run outcome is unresolved. Check the original request.',
          ),
        )
    } catch (reason) {
      if (!mounted.current || controller.signal.aborted) return
      if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
        setPhase('prepared')
        setError(t('建议尚未运行，已准备的候选仍保留。', 'The suggestion did not start. The prepared candidate remains available.'))
      } else {
        setPhase('unknown')
        setError(
          t(
            '建议运行结果未确认，请按原请求核对；不会自动重发。',
            'The suggestion run outcome is unresolved. Check the original request; it will not be resent automatically.',
          ),
        )
      }
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function reconcile() {
    const id = latest.current.pending
    if (operation.current || !id) return
    operation.current = true
    setPhase('sending')
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await fetchPlanSuggestion(task.id, id, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (result.state === 'discarded') {
        setJob(result)
        setPending(undefined)
        setPhase('result')
        released.current = true
        cancelWorkbenchNavigation()
        onClose()
        return
      }
      setJob(result)
      setPending(result.request_id)
      setPhase(
        result.state === 'applied'
          ? 'result'
          : result.state === 'prepared'
            ? 'prepared'
            : 'unknown',
      )
      if (result.state === 'applied') setPreview(undefined)
    } catch {
      if (!mounted.current) return
      setPhase('unknown')
      setError(
        t(
          '原建议请求仍待核对。404不能证明在途请求已结束。',
          'The original suggestion request remains unresolved. A 404 does not prove that an in-flight request ended.',
        ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function discard() {
    const state = latest.current
    if (operation.current || !state.job || state.job.state !== 'prepared') return
    operation.current = true
    setPhase('sending')
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await discardPlanSuggestion(task, state.job, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setJob(result)
      setPending(undefined)
      setPhase('result')
      released.current = true
      cancelWorkbenchNavigation()
      onClose()
    } catch (reason) {
      if (mounted.current) {
        if (reason instanceof ApiError && [400, 403, 404, 409, 422].includes(reason.status)) {
          setPhase('prepared')
          setError(t('建议仍保留，放弃未应用。', 'The suggestion remains prepared; discard was not applied.'))
        } else {
          setPhase('unknown')
          setError(
            t(
              '放弃结果未确认，请按原请求核对。',
              'The discard outcome is unresolved. Check the original request.',
            ),
          )
        }
      }
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  const selectedModel = models.find((item) => item.id === config.model_id)
  const artifact = job?.artifact
  const definition = artifact?.definition
  return (
    <>
      <AppDialog
        title={t('AI建议拆解', 'AI breakdown suggestion')}
        closeLabel={t('关闭', 'Close')}
        busy={busy}
        onClose={close}
      >
      <div className="wb-form wb-plan-suggestion" data-testid="plan-suggestion-dialog">
        <strong>{task.title}</strong>
        <p className="wb-muted">
          {t(
            '建议只生成计划草稿，不创建子任务，也不会自动发布或开始普通运行。',
            'The suggestion creates a plan draft only. It does not create subtasks, publish a plan or start a normal run.',
          )}
        </p>
        {error && <p className="wb-error" role="alert">{error}</p>}
        {phase === 'edit' || phase === 'sending' && !preview && !job ? (
          <>
            <AppSelect
              label={t('建议模型', 'Suggestion model')}
              value={config.model_id}
              options={[
                { value: '', label: t('请选择模型', 'Select a model') },
                ...models.map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.model}`,
                })),
              ]}
              onChange={(value) => updateConfig({ model_id: value })}
            />
            <fieldset className="wb-plan-suggestion-files">
              <legend>{t('可选文件资料', 'Optional file context')}</legend>
              <p className="wb-hint">
                {t(
                  '默认只发送任务元数据；勾选后才把这些任务文件加入冻结候选。',
                  'Task metadata is the default context. Check files to include them in the frozen candidate.',
                )}
              </p>
              {task.files.length ? task.files.map((file) => (
                <AppCheckbox
                  key={file}
                  label={file}
                  value={config.files.includes(file)}
                  onChange={(value) => updateConfig({
                    files: value
                      ? [...config.files, file]
                      : config.files.filter((item) => item !== file),
                  })}
                />
              )) : <p className="wb-muted">{t('任务未选择文件', 'The task has no selected files')}</p>}
            </fieldset>
            <div className="wb-form-grid">
              <AppNumber
                label={t('单次调用时限（秒）', 'Call timeout (sec)')}
                value={config.call_timeout_seconds}
                min={10}
                max={180}
                onChange={(value) => updateConfig({ call_timeout_seconds: value })}
              />
              <AppNumber
                label={t('输出 Token 上限', 'Output token limit')}
                value={config.max_output_tokens}
                min={1024}
                max={8192}
                onChange={(value) => updateConfig({ max_output_tokens: value })}
              />
            </div>
            <div className="wb-form-actions">
              <AppButton
                label={t('核对建议资料', 'Review suggestion context')}
                icon={<FileSearch size={16} />}
                disabled={busy || !config.model_id}
                busy={phase === 'sending'}
                onClick={() => void previewSuggestion()}
              />
            </div>
          </>
        ) : phase === 'unknown' ? (
          <div className="wb-error" role="alert">
            <p>{error || t('原请求待核对。', 'The original request needs reconciliation.')}</p>
            <AppButton
              label={t('核对原建议请求', 'Check original suggestion request')}
              icon={<RefreshCw size={16} />}
              disabled={busy || !pending}
              onClick={() => void reconcile()}
            />
          </div>
        ) : phase === 'result' && (!artifact || !definition) ? (
          <>
            <div className="wb-notice">
              <Sparkles size={17} />
              <span>
                {t(
                  '建议运行已确认，正在读取严格建议成果。',
                  'The suggestion run is confirmed; its strict result is still being read.',
                )}
              </span>
            </div>
            {job?.run_id && <code>{job.run_id}</code>}
            <div className="wb-form-actions">
              <AppButton
                label={t('刷新建议成果', 'Refresh suggestion result')}
                icon={<RefreshCw size={16} />}
                disabled={busy || !pending}
                onClick={() => void reconcile()}
              />
            </div>
          </>
        ) : phase === 'result' && artifact && definition ? (
          <>
            <div className="wb-notice">
              <Sparkles size={17} />
              <span>{t('模型建议草稿，尚未发布', 'Model suggestion draft; not published')}</span>
            </div>
            {artifact.summary && <p>{artifact.summary}</p>}
            <SuggestionReceipt job={job!} t={t} />
            <ol className="wb-task-plan-items">
              {definition.items.map((item) => (
                <li key={item.key}>
                  <strong>{item.title}</strong>
                  <p>{item.goal}</p>
                  <p className="wb-muted">{item.acceptance}</p>
                  {item.depends_on.length > 0 && (
                    <small>
                      {t('依赖', 'Depends on')}: {item.depends_on.join(', ')}
                    </small>
                  )}
                </li>
              ))}
            </ol>
            <div className="wb-form-actions">
              <AppButton
                label={t('选入计划草稿', 'Use as plan draft')}
                icon={<Check size={16} />}
                onClick={useSuggestion}
              />
              <AppButton
                label={t('关闭', 'Close')}
                icon={<Trash2 size={16} />}
                tone="ghost"
                onClick={close}
              />
            </div>
          </>
        ) : (
          <>
            {preview && (
              <>
                <SuggestionReceipt preview={preview} t={t} />
                <AppCheckbox
                  label={t(
                    '我确认冻结上述任务资料、模型和预算，准备一次建议候选。',
                    'I confirm the task context, model and budget are frozen for one suggestion candidate.',
                  )}
                  value={consent}
                  onChange={setConsent}
                />
                {phase === 'preview' && (
                  <div className="wb-form-actions">
                    <AppButton
                      label={t('准备建议候选', 'Prepare suggestion candidate')}
                      icon={<Check size={16} />}
                      disabled={!consent || busy}
                      onClick={() => void prepareSuggestion()}
                    />
                  </div>
                )}
              </>
            )}
            {job?.state === 'prepared' && (
              <>
                <div className="wb-notice">
                  <AppBadge tone="warning">
                    {t('已准备，等待建议运行确认', 'Prepared; awaiting suggestion run consent')}
                  </AppBadge>
                </div>
                <AppCheckbox
                  label={t(
                    '我确认调用一次建议模型并保存严格计划建议成果。',
                    'I consent to one suggestion model call and a strict plan suggestion artifact.',
                  )}
                  value={consent}
                  onChange={setConsent}
                />
                <div className="wb-form-actions">
                  <AppButton
                    label={t('生成建议', 'Generate suggestion')}
                    icon={<Sparkles size={16} />}
                    disabled={!consent || busy}
                    onClick={() => void executeSuggestion()}
                  />
                  <AppButton
                    label={t('放弃准备', 'Discard preparation')}
                    icon={<Trash2 size={16} />}
                    tone="ghost"
                    disabled={busy}
                    onClick={() => setDiscardOpen(true)}
                  />
                </div>
              </>
            )}
          </>
        )}
        </div>
      </AppDialog>
      {discardOpen && (
        <AppDialog
          title={t('放弃AI建议准备？', 'Discard the AI suggestion preparation?')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setDiscardOpen(false)}
        >
          <p>
            {t(
              '原任务资料和候选凭据会保留在记录中。本次建议不会调用模型。',
              'The original task context and candidate receipt remain recorded. This suggestion will not call a model.',
            )}
          </p>
          <div className="wb-form-actions">
            <AppButton
              label={t('保留准备', 'Keep preparation')}
              onClick={() => setDiscardOpen(false)}
            />
            <AppButton
              label={t('确认放弃准备', 'Confirm discard')}
              icon={<Trash2 size={16} />}
              tone="destructive"
              onClick={() => {
                setDiscardOpen(false)
                void discard()
              }}
            />
          </div>
        </AppDialog>
      )}
    </>
  )
}

function SuggestionReceipt({
  preview,
  job,
  t,
}: {
  preview?: PlanSuggestionPreview
  job?: PlanSuggestionJob
  t: Copy
}) {
  const source = preview?.source ?? job?.candidate.source
  const model = preview?.model ?? job?.candidate.model
  const config = preview?.config ?? job?.candidate.config
  if (!source || !model || !config) return null
  return (
    <div className="wb-plan-suggestion-receipt">
      {job?.artifact?.summary && (
        <p className="wb-wrap">{job.artifact.summary}</p>
      )}
      <dl>
        <dt>{t('模型', 'Model')}</dt>
        <dd>{model.name} · {model.model}</dd>
        <dt>{t('资料', 'Context')}</dt>
        <dd>
          {source.files.length ? (
            <ul className="wb-plan-suggestion-source-list">
              {source.files.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>{' '}
                  <code>{file.sha256}</code>
                </li>
              ))}
            </ul>
          ) : t('仅任务元数据', 'Task metadata only')}
        </dd>
        <dt>{t('调用上限', 'Call budget')}</dt>
        <dd>{config.max_calls}</dd>
        <dt>{t('时间上限', 'Time limit')}</dt>
        <dd>{config.call_timeout_seconds} sec</dd>
        <dt>{t('候选凭据', 'Candidate receipt')}</dt>
        <dd><code>{job?.candidate_hash ?? preview?.candidate_hash}</code></dd>
        <dt>{t('任务快照', 'Task snapshot')}</dt>
        <dd><code>{source.task_snapshot_hash}</code></dd>
        <dt>{t('资料快照', 'Context snapshot')}</dt>
        <dd><code>{source.context_hash}</code></dd>
      </dl>
    </div>
  )
}
