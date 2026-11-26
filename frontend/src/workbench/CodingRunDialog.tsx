import { useEffect, useRef, useState } from 'react'
import { FileSearch, Play, RefreshCw, Trash2 } from 'lucide-react'
import {
  AppButton,
  AppCheckbox,
  AppDialog,
  AppNumber,
  AppSelect,
  AppTextArea,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { ApiError, type Model, type Task } from './api'
import {
  applyCoding,
  fetchCoding,
  parseCodingConfig,
  prepareCoding,
  previewCoding,
  type CodingCandidate,
  type CodingConfig,
  type CodingJob,
} from './coding'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import type { Copy } from './state'
import { CodingCheckpointPicker } from './CodingCheckpointPicker'
import './task-artifacts.css'

export function CodingRunDialog({
  task,
  models,
  initial,
  continuationEnabled = false,
  pytestEnabled = false,
  t,
  onClose,
  onStarted,
}: {
  task: Task
  models: Model[]
  initial?: string
  continuationEnabled?: boolean
  pytestEnabled?: boolean
  t: Copy
  onClose: () => void
  onStarted: (id: string) => void
}) {
  const [config, setConfig] = useState<CodingConfig>(() => ({
    model_id: models[0]?.id ?? '',
    writable: task.files.filter(
      (path) =>
        !path.split('/').includes('tests') &&
        !path.split('/').at(-1)?.startsWith('test'),
    ),
    tests: task.files.filter(
      (path) =>
        (path.split('/').includes('tests') ||
          path.split('/').at(-1)?.startsWith('test')) &&
        path.endsWith('.py'),
    ),
    max_rounds: 2,
    test_timeout: 10,
    max_output_tokens: 8192,
  }))
  const [candidate, setCandidate] = useState<CodingCandidate>()
  const [job, setJob] = useState<CodingJob>()
  const [pending, setPending] = useState(initial)
  const [phase, setPhase] = useState<
    'edit' | 'preview' | 'prepared' | 'sending' | 'unknown'
  >(initial ? 'unknown' : 'edit')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const [sourceMode, setSourceMode] = useState<'original' | 'checkpoint'>(
    'original',
  )
  const mounted = useRef(true),
    internal = useRef(false),
    operation = useRef(false),
    released = useRef(false)
  const request = useRef<AbortController | undefined>(undefined)
  const latest = useRef({
    phase,
    pending,
    job,
    candidate,
    config,
    consent,
    continuationEnabled,
    pytestEnabled,
  })
  const initialConfig = useRef(JSON.stringify(config))
  latest.current = {
    phase,
    pending,
    job,
    candidate,
    config,
    consent,
    continuationEnabled,
    pytestEnabled,
  }
  const busy = phase === 'sending' || phase === 'unknown'
  const dirty =
    !job &&
    (Boolean(candidate) ||
      JSON.stringify(config) !== initialConfig.current ||
      sourceMode === 'checkpoint')
  const guard = useRef({ busy, dirty })
  guard.current = { busy, dirty }
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
          ? { busy: false, dirty: false }
          : guard.current,
      onBlocked: () => {
        if (!guard.current.busy) setDiscard(true)
      },
      onReset: () => setDiscard(false),
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!released.current && (guard.current.busy || guard.current.dirty)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      unregister()
      window.removeEventListener('beforeunload', unload)
    }
  }, [])
  useEffect(() => {
    if (initial) void reconcile()
  }, [])
  useEffect(() => {
    if (!pytestEnabled) setConsent(false)
  }, [pytestEnabled])
  const pytestUnavailable = (reason: unknown) =>
    reason instanceof ApiError &&
    reason.details &&
    typeof reason.details === 'object' &&
    (reason.details as { code?: unknown }).code === 'coding_pytest_unavailable'
  const pytestUnavailableMessage = () =>
    t(
      '当前执行环境中的 pytest 不可用，请核对所选测试框架。',
      'pytest is unavailable in this execution environment. Review the selected test profile.',
    )
  function stamp(id?: string) {
    const url = new URL(window.location.href),
      params = new URLSearchParams(url.hash.split('?')[1] ?? '')
    params.delete('codingRequest')
    if (id) params.set('codingRequest', id)
    internal.current = true
    try {
      return pushWorkbenchNavigation(
        `#task/${encodeURIComponent(task.id)}${params.size ? `?${params}` : ''}`,
        { replace: true },
      )
    } finally {
      internal.current = false
    }
  }
  function admit(result: CodingJob) {
    setJob(result)
    setCandidate(result.candidate)
    setConsent(false)
    if (result.state === 'prepared') {
      setPhase('prepared')
      return
    }
    cancelWorkbenchNavigation()
    if (!stamp()) throw new Error('coding_navigation_unconfirmed')
    setPending(undefined)
    released.current = true
    if (result.state === 'applied' && result.run_id) onStarted(result.run_id)
    else onClose()
  }
  async function reconcile() {
    const state = latest.current,
      id = state.pending
    if (!id || operation.current) return
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await fetchCoding(
        task.id,
        id,
        controller.signal,
        state.candidate,
      )
      if (!mounted.current || controller.signal.aborted) return
      admit(result)
    } catch (reason) {
      if (!mounted.current) return
      setPhase('unknown')
      if (reason instanceof ApiError && [401, 403].includes(reason.status)) {
        setJob(undefined)
        setCandidate(undefined)
      }
      setError(
        t(
          '原实现请求仍待核对，未重发。404不能证明在途请求已经结束。',
          'The original implementation request remains unresolved. It has not been resent; a 404 does not prove an in-flight write ended.',
        ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function preview() {
    if (operation.current || latest.current.pending) return
    if (
      latest.current.config.profile === 'python-pytest' &&
      !latest.current.pytestEnabled
    ) {
      setError(pytestUnavailableMessage())
      return
    }
    let validated: CodingConfig
    try {
      if (
        sourceMode === 'checkpoint' &&
        (!continuationEnabled || !latest.current.config.continuation)
      )
        throw new Error('coding_checkpoint_required')
      validated = parseCodingConfig(latest.current.config)
    } catch {
      setError(
        t(
          '请核对模型、文件、测试；接续实现还须选择检查点并填写本轮要求。',
          'Review model, files and tests. Continuation also requires a checkpoint and supplemental requirements.',
        ),
      )
      return
    }
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    try {
      const value = await previewCoding(task.id, validated, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setCandidate(value)
      setPhase('preview')
    } catch (reason) {
      if (!mounted.current) return
      setCandidate(undefined)
      setPhase('edit')
      setError(
        pytestUnavailable(reason)
          ? pytestUnavailableMessage()
          : reason instanceof ApiError &&
              reason.details &&
              typeof reason.details === 'object' &&
              (reason.details as { code?: unknown }).code ===
                'coding_checkpoint_base_changed'
            ? t(
                '原项目文件已变化，不能沿用该检查点。请核对基线或选择从原项目开始。',
                'The original project files changed. Review the base or start from the current project files.',
              )
            : t(
                '资料、检查点或隔离运行能力验证失败，尚未准备或调用模型。',
                'Source, checkpoint or sandbox verification failed. No candidate was prepared and no model was called.',
              ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function submit(action: 'execute' | 'discard') {
    const state = latest.current
    if (
      operation.current ||
      state.phase === 'unknown' ||
      !state.candidate ||
      (action === 'execute' &&
        state.candidate.config.continuation &&
        !state.continuationEnabled) ||
      (action === 'execute' &&
        state.candidate.snapshot.profile === 'python-pytest' &&
        !state.pytestEnabled) ||
      (action === 'execute' && !state.consent)
    )
      return
    const id = state.pending ?? crypto.randomUUID()
    if (!stamp(id)) return
    operation.current = true
    setPending(id)
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    let registered = state.job
    try {
      if (!registered) {
        registered = await prepareCoding(
          task.id,
          id,
          state.candidate,
          controller.signal,
        )
        if (!mounted.current || controller.signal.aborted) return
        setJob(registered)
      }
      if (
        action === 'execute' &&
        registered.candidate.snapshot.profile === 'python-pytest' &&
        !latest.current.pytestEnabled
      ) {
        setPhase('prepared')
        setError(pytestUnavailableMessage())
        return
      }
      const result = await applyCoding(
        task.id,
        registered,
        action,
        controller.signal,
      )
      if (!mounted.current || controller.signal.aborted) return
      admit(result)
    } catch (reason) {
      if (!mounted.current) return
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        if (registered) {
          setJob(registered)
          setPhase('prepared')
        } else if (stamp()) {
          setPending(undefined)
          setPhase('preview')
        } else setPhase('unknown')
        setError(
          pytestUnavailable(reason)
            ? pytestUnavailableMessage()
            : t(
                '请求未应用，请核对候选后重新确认。',
                'The request was not applied. Review the candidate and confirm again.',
              ),
        )
      } else {
        setPhase('unknown')
        setError(
          t(
            '请求结果未知，请保留原标识核对，不要重复执行。',
            'The outcome is unknown. Keep and check the original request ID; do not repeat execution.',
          ),
        )
      }
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  function change(next: Partial<CodingConfig>) {
    if (operation.current || latest.current.pending) return
    setConfig((previous) => {
      const updated = { ...previous, ...next }
      if (updated.profile === undefined) delete updated.profile
      if (updated.continuation === undefined) delete updated.continuation
      return updated
    })
    setCandidate(undefined)
    setConsent(false)
    setPhase('edit')
  }
  const close = () => {
    if (guard.current.busy) return
    if (job || !guard.current.dirty) {
      released.current = true
      onClose()
    } else setDiscard(true)
  }
  const displayed = job?.candidate ?? candidate
  const unsupportedContinuation = Boolean(
    displayed?.config.continuation && !continuationEnabled,
  )
  const unsupportedPytest = Boolean(
    (displayed?.snapshot.profile ?? config.profile) === 'python-pytest' &&
    !pytestEnabled,
  )
  return (
    <>
      <AppDialog
        title={t('研发实现与验证', 'Implement & validate')}
        closeLabel={t('关闭', 'Close')}
        busy={busy}
        onClose={close}
      >
        <div className="wb-form" data-testid="coding-run-dialog">
          <strong>{task.title}</strong>
          {error && (
            <p role="alert" className="wb-error">
              {error}
            </p>
          )}
          {pending && (
            <div role="status">
              <code>{pending}</code>
              <AppButton
                label={t('核对原实现请求', 'Check original implementation')}
                icon={<RefreshCw size={16} />}
                disabled={phase === 'sending'}
                onClick={() => void reconcile()}
              />
            </div>
          )}
          {unsupportedContinuation && (
            <p role="alert" className="wb-error">
              {t(
                '服务未提供本轮代码接续能力，执行已暂停。',
                'This server does not admit code continuation. Execution is paused.',
              )}
            </p>
          )}
          {unsupportedPytest && (
            <p role="alert" className="wb-error">
              {t(
                '服务未提供 pytest 测试能力，执行已暂停。已准备的候选仍可放弃。',
                'This server does not admit pytest tests. Execution is paused; a prepared candidate can still be discarded.',
              )}
            </p>
          )}
          {!pending && (
            <>
              {continuationEnabled && (
                <AppSelect
                  label={t('实现起点', 'Implementation starting point')}
                  value={sourceMode}
                  disabled={busy}
                  options={[
                    {
                      value: 'original',
                      label: t('原项目文件', 'Original project files'),
                    },
                    {
                      value: 'checkpoint',
                      label: t('前轮代码检查点', 'Prior code checkpoint'),
                    },
                  ]}
                  onChange={(value) => {
                    if (operation.current) return
                    setSourceMode(
                      value === 'checkpoint' ? 'checkpoint' : 'original',
                    )
                    change({ continuation: undefined })
                  }}
                />
              )}
              {sourceMode === 'checkpoint' && continuationEnabled && (
                <>
                  <CodingCheckpointPicker
                    taskId={task.id}
                    selected={config.continuation}
                    disabled={busy}
                    t={t}
                    onChange={(checkpoint) =>
                      change({
                        continuation: {
                          checkpoint,
                          instruction: config.continuation?.instruction ?? '',
                        },
                      })
                    }
                  />
                  <AppTextArea
                    label={t(
                      '本轮实现要求',
                      'Requirements for this implementation',
                    )}
                    value={config.continuation?.instruction ?? ''}
                    isDisabled={busy || !config.continuation}
                    onChange={(instruction) => {
                      if (config.continuation)
                        change({
                          continuation: { ...config.continuation, instruction },
                        })
                    }}
                    rows={3}
                  />
                </>
              )}
              <AppSelect
                label={t('测试框架', 'Test profile')}
                value={config.profile ?? 'python-unittest'}
                options={[
                  { value: 'python-unittest', label: 'Python unittest' },
                  ...(pytestEnabled
                    ? [{ value: 'python-pytest', label: 'Python pytest' }]
                    : []),
                ]}
                disabled={busy}
                onChange={(value) => {
                  if (value === 'python-unittest')
                    change({ profile: undefined })
                  else if (
                    value === 'python-pytest' &&
                    latest.current.pytestEnabled
                  )
                    change({ profile: 'python-pytest' })
                }}
              />
              <AppSelect
                label={t('实现模型', 'Implementation model')}
                value={config.model_id}
                options={models.map((model) => ({
                  value: model.id,
                  label: `${model.name} · ${model.model}`,
                }))}
                disabled={busy}
                onChange={(model_id) => change({ model_id })}
              />
              <AppTextArea
                label={t(
                  '可修改文件（每行一个）',
                  'Editable files (one per line)',
                )}
                value={config.writable.join('\n')}
                isDisabled={busy}
                onChange={(value) =>
                  change({
                    writable: value
                      .split('\n')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
              />
              <AppTextArea
                label={t(
                  '不可修改的测试文件（每行一个）',
                  'Immutable test files (one per line)',
                )}
                value={config.tests.join('\n')}
                isDisabled={busy}
                onChange={(value) =>
                  change({
                    tests: value
                      .split('\n')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
              />
              <AppNumber
                label={t('实现调用上限', 'Implementation call limit')}
                value={config.max_rounds}
                min={1}
                max={3}
                onChange={(max_rounds) => change({ max_rounds })}
              />
              <AppButton
                label={t(
                  '核对资料与测试环境',
                  'Review sources & test environment',
                )}
                icon={<FileSearch size={16} />}
                disabled={busy || unsupportedPytest}
                onClick={() => void preview()}
              />
            </>
          )}
          {displayed && (
            <>
              <dl className="wb-details">
                <dt>{t('资料', 'Sources')}</dt>
                <dd>
                  {displayed.snapshot.files.length} {t('文件', 'files')}
                </dd>
                <dt>{t('发送目标', 'Send to')}</dt>
                <dd>
                  {displayed.snapshot.model.name}{' '}
                  <code>{displayed.snapshot.model.endpoint}</code>
                </dd>
                <dt>{t('测试', 'Tests')}</dt>
                <dd>
                  {displayed.snapshot.profile === 'python-pytest'
                    ? 'Python pytest'
                    : 'Python unittest'}{' '}
                  · {displayed.config.test_timeout}s
                </dd>
                <dt>{t('模型调用上限', 'Model call limit')}</dt>
                <dd>{displayed.config.max_rounds}</dd>
                <dt>{t('单次输出设置', 'Output token setting')}</dt>
                <dd>{displayed.config.max_output_tokens} tokens</dd>
                <dt>{t('执行时限', 'Execution deadline')}</dt>
                <dd>
                  {t(
                    '单次模型180秒，整轮10分钟',
                    '180s per model call; 10min per Run',
                  )}
                </dd>
                <dt>{t('候选', 'Candidate')}</dt>
                <dd>
                  <code className="wb-wrap">{displayed.candidate_hash}</code>
                </dd>
              </dl>
              {displayed.snapshot.model.kind === 'codex_cli' && (
                <p className="wb-hint">
                  {t(
                    'Codex CLI 为文本生成调用；输出Token设置不是CLI硬限制。',
                    'Codex CLI generates text only; the output token setting is not a CLI hard ceiling.',
                  )}
                </p>
              )}
              {displayed.snapshot.continuation && (
                <section
                  className="wb-artifact-references"
                  aria-label={t('接续代码快照', 'Continuation code snapshot')}
                >
                  <strong>
                    {t('接续代码快照', 'Continuation code snapshot')}
                  </strong>
                  <p>
                    Run <code>{displayed.snapshot.continuation.run_id}</code> ·{' '}
                    {t('轮次', 'Round')} {displayed.snapshot.continuation.round}
                  </p>
                  <p className="wb-wrap">
                    <code>{displayed.snapshot.continuation.id}</code>
                    <br />
                    SHA-256{' '}
                    <code>{displayed.snapshot.continuation.sha256}</code>
                  </p>
                  <p className="wb-wrap">
                    {t('原项目基线', 'Original project base')} ·{' '}
                    <code>{displayed.snapshot.continuation.origin_hash}</code>
                  </p>
                  <p className="wb-wrap">
                    {displayed.config.continuation?.instruction}
                  </p>
                  <details className="wb-disclosure">
                    <summary>
                      {t('继承的代码修改', 'Inherited code changes')}
                    </summary>
                    <pre>{displayed.snapshot.continuation.patch}</pre>
                  </details>
                </section>
              )}
              <details className="wb-disclosure">
                <summary>{t('完整发送资料', 'Complete model input')}</summary>
                <p>{displayed.snapshot.goal}</p>
                <p>{displayed.snapshot.acceptance}</p>
                <p>{displayed.snapshot.notes}</p>
                {displayed.snapshot.files.map((file) => (
                  <details key={file.path}>
                    <summary>{file.path}</summary>
                    <pre>{file.content}</pre>
                  </details>
                ))}
              </details>
              <p className="wb-hint">
                {t(
                  '修改仅发生在隔离副本，测试文件保持不变。结果包含Diff和实际测试证据，原项目需另行人工审查。',
                  'Changes stay in an isolated copy and tests remain unchanged. Results include Diff and actual test evidence; the original project requires separate human review.',
                )}
              </p>
              <AppCheckbox
                label={t(
                  '确认发送上述资料、在隔离副本修改文件并执行这些测试；模型调用可能产生费用',
                  'Confirm sending this context, changing the isolated copy and running these tests; model charges may apply',
                )}
                value={consent}
                isDisabled={busy}
                onChange={setConsent}
              />
              <AppButton
                label={t('确认修改并验证', 'Confirm implementation & tests')}
                icon={<Play size={16} />}
                tone="primary"
                disabled={
                  busy ||
                  !consent ||
                  unsupportedContinuation ||
                  unsupportedPytest
                }
                onClick={() => void submit('execute')}
              />
              {job?.state === 'prepared' && (
                <AppButton
                  label={t('放弃此次准备', 'Discard this preparation')}
                  icon={<Trash2 size={16} />}
                  disabled={busy}
                  onClick={() => void submit('discard')}
                />
              )}
            </>
          )}
        </div>
      </AppDialog>
      {discard && (
        <AppDraftGuard
          title={t('放弃实现配置？', 'Discard implementation settings?')}
          description={t(
            '当前资料与资源配置尚未准备，离开会丢失本页编辑。',
            'These source and resource settings are not prepared. Leaving discards the edits.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃配置', 'Discard settings')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            setDiscard(false)
          }}
          onDiscard={() => {
            released.current = true
            setDiscard(false)
            if (!confirmWorkbenchNavigation()) onClose()
          }}
        />
      )}
    </>
  )
}
