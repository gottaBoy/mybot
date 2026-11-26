import { useEffect, useRef, useState } from 'react'
import { Check, Play, RefreshCw, ShieldX } from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppLoading,
} from '../components/ui'
import { ApiError } from './api'
import {
  DeviceResponseError,
  executeDeviceGrant,
  executionGrantIdentity,
  fetchExecutionOperation,
  fetchOwnerExecution,
  fetchScopedExecution,
  sendExecutionCommand,
  type Device,
  type ExecutionCommand,
  type ExecutionGrant,
  type ExecutionSummary,
  type OwnerExecution,
} from './devices'
import type { Copy } from './state'
import './device-execution.css'

export function ExecutionFacts({
  value,
  t,
}: {
  value: ExecutionSummary
  t: Copy
}) {
  return (
    <div className="wb-execution-facts">
      <p className="wb-execution-message">{value.content}</p>
      <dl>
        <dt>{t('消息', 'Message')}</dt>
        <dd>
          <code>{value.turn_id}</code>
        </dd>
        <dt>{t('资料', 'Sources')}</dt>
        <dd>
          {value.source_count} {t('文件', 'files')} / {value.source_bytes} bytes
        </dd>
        {value.artifact_count !== undefined && (
          <>
            <dt>{t('引用成果', 'Referenced artifacts')}</dt>
            <dd>{value.artifact_count}</dd>
          </>
        )}
        <dt>{t('调用上限', 'Call limit')}</dt>
        <dd>{value.resources.max_calls}</dd>
        <dt>{t('并行上限', 'Concurrency limit')}</dt>
        <dd>{value.resources.parallel}</dd>
        <dt>{t('时限', 'Time limit')}</dt>
        <dd>{value.resources.minutes} min</dd>
        <dt>{t('单次输出上限', 'Output limit per call')}</dt>
        <dd>{value.resources.max_output_tokens} tokens</dd>
        <dt>{t('工作流版本', 'Workflow version')}</dt>
        <dd>{value.workflow_version ?? t('内置', 'Built in')}</dd>
      </dl>
      <ul>
        {value.models.map((model) => (
          <li key={model.role}>
            <span>
              {model.role === 'coordinator_model'
                ? t('规划', 'Planning')
                : model.role === 'researcher_model'
                  ? t('研究', 'Research')
                  : t('汇总', 'Synthesis')}
            </span>
            <strong>{model.name}</strong>
            <span>
              {model.model} · {model.kind}
            </span>
          </li>
        ))}
      </ul>
      {value.models.some((model) => model.kind === 'codex_cli') && (
        <p className="wb-hint">
          {t(
            'Codex CLI 实际单通道执行，输出 Token 设置不是 CLI 硬限制。',
            'Codex CLI runs in a single channel. The output token setting is not a CLI hard ceiling.',
          )}
        </p>
      )}
      <details>
        <summary>{t('快照标识', 'Snapshot identity')}</summary>
        <p>
          {t('执行候选', 'Execution candidate')}:{' '}
          <code>{value.candidate_hash}</code>
        </p>
        <p>
          {t('资料快照', 'Source snapshot')}: <code>{value.context_hash}</code>
        </p>
      </details>
    </div>
  )
}
function GrantState({ grant, t }: { grant: ExecutionGrant; t: Copy }) {
  const labels = {
    authorized: t('等待设备确认', 'Awaiting device confirmation'),
    applied: t('已入队', 'Queued'),
    revoked: t('已撤销', 'Revoked'),
    expired: t('已过期', 'Expired'),
    superseded: t('已由主工作台启动', 'Started from the workbench'),
  }
  return (
    <div className="wb-execution-state">
      <AppBadge tone={grant.state === 'applied' ? 'success' : 'neutral'}>
        {labels[grant.state]}
      </AppBadge>
      <code>{grant.id}</code>
      <time dateTime={grant.expires_at}>
        {t('到期', 'Expires')}: {new Date(grant.expires_at).toLocaleString()}
      </time>
      {grant.run_id && <code>{grant.run_id}</code>}
    </div>
  )
}
const hard = (error: unknown) =>
  error instanceof DeviceResponseError ||
  (error instanceof ApiError && [401, 403].includes(error.status))

export function OwnerDeviceExecution({
  deviceId,
  operationId,
  t,
  stamp,
  close,
}: {
  deviceId: string
  operationId?: string
  t: Copy
  stamp: (operationId?: string) => boolean
  close: () => void
}) {
  const [value, setValue] = useState<OwnerExecution>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [revokeConsent, setRevokeConsent] = useState(false)
  const [pending, setPending] = useState(operationId)
  const [sending, setSending] = useState(false)
  const [revision, setRevision] = useState(0)
  const [notice, setNotice] = useState('')
  const command = useRef<ExecutionCommand | undefined>(undefined)
  const latest = useRef({ value, consent, revokeConsent, pending, loading })
  latest.current = { value, consent, revokeConsent, pending, loading }
  const action = useRef(false)
  const mounted = useRef(true)
  const request = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setConsent(false)
    setRevokeConsent(false)
    void fetchOwnerExecution(deviceId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setValue(result)
      })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setValue(undefined)
        setError(
          t('执行委托读取失败。', 'Execution delegation could not be read.'),
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [deviceId, revision])
  async function submit(kind: 'grant' | 'revoke') {
    const state = latest.current
    if (
      action.current ||
      state.loading ||
      state.pending ||
      !state.value ||
      (kind === 'grant'
        ? !state.consent || !state.value.prepared
        : !state.revokeConsent || state.value.grant?.state !== 'authorized')
    )
      return
    const data = state.value
    const next: ExecutionCommand =
      kind === 'grant'
        ? {
            kind,
            device_id: deviceId,
            request_id: crypto.randomUUID(),
            turn_id: data.prepared!.turn_id,
            candidate_hash: data.prepared!.candidate_hash,
            expected_device_revision: 1,
            consent: true,
          }
        : {
            kind,
            device_id: deviceId,
            request_id: crypto.randomUUID(),
            grant_id: data.grant!.id,
            expected_revision: 1,
            consent: true,
          }
    if (!stamp(next.request_id)) return
    action.current = true
    command.current = next
    setPending(next.request_id)
    setSending(true)
    setConsent(false)
    setRevokeConsent(false)
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await sendExecutionCommand(next, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (
        next.kind === 'grant' &&
        executionGrantIdentity(result.grant) !==
          executionGrantIdentity(data.prepared!)
      )
        throw new DeviceResponseError()
      if (!stamp()) throw new Error('execution_navigation_unconfirmed')
      setPending(undefined)
      command.current = undefined
      setNotice(t('委托操作已确认。', 'Delegation operation confirmed.'))
      setRevision((n) => n + 1)
    } catch (reason) {
      if (!mounted.current) return
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        stamp()
      ) {
        setPending(undefined)
        command.current = undefined
        setError(
          t(
            '委托未应用，请刷新并重新确认。',
            'Delegation was not applied. Refresh and confirm again.',
          ),
        )
        setRevision((n) => n + 1)
      } else
        setError(
          t(
            '结果未知，请核对原委托请求。',
            'Outcome unknown. Check the original delegation request.',
          ),
        )
      if (hard(reason)) setValue(undefined)
    } finally {
      if (mounted.current) {
        action.current = false
        setSending(false)
      }
    }
  }
  async function reconcile() {
    const id = latest.current.pending
    if (!id || action.current) return
    action.current = true
    setSending(true)
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = await fetchExecutionOperation(
        deviceId,
        id,
        controller.signal,
        command.current,
      )
      if (!mounted.current || controller.signal.aborted) return
      if (result.grant.device_id !== deviceId || !stamp())
        throw new DeviceResponseError()
      setPending(undefined)
      command.current = undefined
      setNotice(
        t('原委托回执已确认。', 'Original delegation receipt confirmed.'),
      )
      setRevision((n) => n + 1)
    } catch (reason) {
      if (!mounted.current) return
      if (hard(reason)) setValue(undefined)
      setError(
        t(
          '原委托仍待核对，尚未重发。',
          'The original delegation remains unresolved. It has not been resent.',
        ),
      )
    } finally {
      if (mounted.current) {
        action.current = false
        setSending(false)
      }
    }
  }
  const deviceReady =
    value &&
    value.device.revoked_at === null &&
    Date.parse(value.device.expires_at) > Date.now()
  const blocked = loading || Boolean(pending) || sending
  return (
    <AppDialog
      title={t('一次执行委托', 'Single-use execution delegation')}
      closeLabel={t('关闭', 'Close')}
      busy={Boolean(pending) || sending}
      onClose={() => {
        if (!action.current && !latest.current.pending) close()
      }}
    >
      <div className="wb-form wb-execution-panel">
        {error && (
          <p role="alert" className="wb-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {pending && (
          <div role="status">
            <p>
              {t('原委托请求待确认', 'Original delegation request pending')}:{' '}
              <code>{pending}</code>
            </p>
            <AppButton
              label={t('核对原委托', 'Check original delegation')}
              icon={<RefreshCw size={16} />}
              busy={sending}
              disabled={sending}
              onClick={() => void reconcile()}
            />
          </div>
        )}
        <AppButton
          label={t('刷新执行委托', 'Refresh execution delegation')}
          icon={<RefreshCw size={16} />}
          disabled={blocked}
          onClick={() => setRevision((n) => n + 1)}
        />
        {loading && (
          <AppLoading
            label={t('正在读取执行委托', 'Loading execution delegation')}
          />
        )}
        {value && !loading && (
          <>
            <strong>{value.device.name}</strong>
            <code>{value.device.id}</code>
            <p>
              {t('任务', 'Task')}: <code>{value.device.task_id}</code>
            </p>
            {value.grant && (
              <>
                <GrantState grant={value.grant} t={t} />
                <ExecutionFacts value={value.grant} t={t} />
                {value.grant.state === 'authorized' && (
                  <>
                    <AppCheckbox
                      label={t(
                        '撤销此次执行委托',
                        'Revoke this execution delegation',
                      )}
                      value={revokeConsent}
                      isDisabled={blocked}
                      onChange={setRevokeConsent}
                    />
                    <AppButton
                      label={t('确认撤销委托', 'Confirm delegation revocation')}
                      icon={<ShieldX size={16} />}
                      disabled={blocked || !revokeConsent}
                      onClick={() => void submit('revoke')}
                    />
                  </>
                )}
              </>
            )}
            {value.prepared && value.grant?.state !== 'authorized' ? (
              <>
                <h3>{t('已准备的下一轮', 'Prepared next run')}</h3>
                <ExecutionFacts value={value.prepared} t={t} />
                <AppCheckbox
                  label={t(
                    '授权此设备在十分钟内启动这一次运行，可能产生模型费用',
                    'Authorize this device to start this exact run within ten minutes; model charges may apply',
                  )}
                  value={consent}
                  isDisabled={blocked || !deviceReady}
                  onChange={setConsent}
                />
                <AppButton
                  label={t(
                    '确认一次执行授权',
                    'Confirm single-use execution grant',
                  )}
                  icon={<Check size={16} />}
                  tone="primary"
                  disabled={blocked || !deviceReady || !consent}
                  onClick={() => void submit('grant')}
                />
              </>
            ) : (
              !value.prepared && (
                <p>
                  {t('没有已准备的下一轮。', 'There is no prepared next run.')}
                </p>
              )
            )}
          </>
        )}
      </div>
    </AppDialog>
  )
}

export function PairedDeviceExecution({
  device,
  revision,
  pendingId,
  blocked,
  t,
  stamp,
  lock,
  failure,
}: {
  device: Device
  revision: number
  pendingId?: string
  blocked: boolean
  t: Copy
  stamp: (id?: string) => boolean
  lock: (value: boolean) => void
  failure: (reason: unknown) => void
}) {
  const [grant, setGrant] = useState<ExecutionGrant | null>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [pending, setPending] = useState(pendingId)
  const [sending, setSending] = useState(false)
  const [readVersion, setReadVersion] = useState(0)
  const [notice, setNotice] = useState('')
  const action = useRef(false)
  const mounted = useRef(true)
  const request = useRef<AbortController | undefined>(undefined)
  const state = useRef({
    grant,
    pending,
    consent,
    loading,
    blocked,
    revision,
    stamp,
    lock,
    failure,
  })
  state.current = {
    grant,
    pending,
    consent,
    loading,
    blocked,
    revision,
    stamp,
    lock,
    failure,
  }
  const observed = useRef(revision)
  useEffect(() => {
    if (revision !== observed.current) {
      observed.current = revision
      setConsent(false)
      if (
        !state.current.pending &&
        !state.current.loading &&
        state.current.grant !== undefined
      )
        setReadVersion((n) => n + 1)
    }
  }, [revision])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
      state.current.lock(false)
    }
  }, [])
  useEffect(() => {
    state.current.lock(Boolean(pending) || sending || consent)
  }, [pending, sending, consent])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setConsent(false)
    void fetchScopedExecution(device, state.current.pending, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setGrant(result.grant)
      })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setGrant(undefined)
        setError(
          t('执行授权读取失败。', 'The execution grant could not be read.'),
        )
        if (
          (hard(reason) && !(reason instanceof DeviceResponseError)) ||
          (reason instanceof ApiError && reason.status === 409)
        )
          state.current.failure(reason)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [device.id, device.task_id, readVersion])
  async function executeOrCheck(check: boolean) {
    const before = state.current
    if (
      action.current ||
      (check
        ? !before.pending
        : before.blocked ||
          before.loading ||
          !before.consent ||
          !before.grant ||
          before.grant.state !== 'authorized' ||
          Date.parse(before.grant.expires_at) <= Date.now())
    )
      return
    const id = check ? before.pending! : before.grant!.id
    if (!check && !before.stamp(id)) return
    action.current = true
    setSending(true)
    setConsent(false)
    setPending(id)
    setError('')
    const controller = new AbortController()
    request.current = controller
    try {
      const result = check
        ? await fetchScopedExecution(device, id, controller.signal)
        : await executeDeviceGrant(device, before.grant!, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (
        before.grant &&
        before.grant.id === id &&
        executionGrantIdentity(result.grant!) !==
          executionGrantIdentity(before.grant)
      )
        throw new DeviceResponseError()
      setGrant(result.grant)
      if (result.grant?.state === 'authorized') {
        setError(
          t(
            '原执行结果仍未知，请继续核对。',
            'The original execution outcome remains unknown. Keep checking.',
          ),
        )
      } else {
        if (!state.current.stamp())
          throw new Error('execution_navigation_unconfirmed')
        setPending(undefined)
        setNotice(
          result.grant?.state === 'applied'
            ? t(
                '原运行已入队，未重复执行。',
                'The original run is queued. It was not repeated.',
              )
            : t('此次授权已不可执行。', 'This grant can no longer execute.'),
        )
      }
    } catch (reason) {
      if (!mounted.current) return
      if (reason instanceof DeviceResponseError) {
        setGrant(undefined)
        setError(
          t(
            '回执无效，原执行仍待核对。',
            'The receipt is invalid. Keep checking the original execution.',
          ),
        )
      } else if (
        hard(reason) ||
        (reason instanceof ApiError &&
          reason.status === 409 &&
          (reason.details as { code?: string })?.code ===
            'device_identity_changed')
      ) {
        setGrant(undefined)
        state.current.failure(reason)
      } else if (
        !check &&
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        state.current.stamp()
      ) {
        setPending(undefined)
        setGrant(undefined)
        setError(
          t(
            '执行未应用，请刷新并重新确认。',
            'Execution was not applied. Refresh and confirm again.',
          ),
        )
      } else
        setError(
          t(
            '结果未知，请核对原执行授权。',
            'Outcome unknown. Check the original execution grant.',
          ),
        )
    } finally {
      if (mounted.current) {
        action.current = false
        setSending(false)
      }
    }
  }
  return (
    <section
      className="wb-pair-section wb-execution-panel"
      aria-label={t('执行委托', 'Execution delegation')}
    >
      <h2>{t('执行委托', 'Execution delegation')}</h2>
      {error && (
        <p role="alert" className="wb-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {pending ? (
        <div role="status">
          <p>
            {t('原执行授权待核对', 'Original execution grant pending')}:{' '}
            <code>{pending}</code>
          </p>
          <AppButton
            label={t('核对原执行', 'Check original execution')}
            icon={<RefreshCw size={16} />}
            busy={sending}
            disabled={sending}
            onClick={() => void executeOrCheck(true)}
          />
        </div>
      ) : (
        <AppButton
          label={t('刷新执行授权', 'Refresh execution grant')}
          icon={<RefreshCw size={16} />}
          disabled={loading || sending || blocked}
          onClick={() => setReadVersion((n) => n + 1)}
        />
      )}
      {loading ? (
        <AppLoading label={t('正在读取执行授权', 'Loading execution grant')} />
      ) : grant === null ? (
        <p>{t('没有执行授权。', 'There is no execution grant.')}</p>
      ) : (
        grant && (
          <>
            <GrantState grant={grant} t={t} />
            <ExecutionFacts value={grant} t={t} />
            {grant.state === 'authorized' && !pending && (
              <>
                <AppCheckbox
                  label={t(
                    '按上述快照与调用上限启动这一次运行，可能产生模型费用',
                    'Start this exact run with the snapshot and limits above; model charges may apply',
                  )}
                  value={consent}
                  isDisabled={
                    blocked ||
                    sending ||
                    Date.parse(grant.expires_at) <= Date.now()
                  }
                  onChange={setConsent}
                />
                <AppButton
                  label={t('确认启动授权运行', 'Confirm delegated run')}
                  icon={<Play size={16} />}
                  tone="primary"
                  disabled={
                    blocked ||
                    sending ||
                    !consent ||
                    Date.parse(grant.expires_at) <= Date.now()
                  }
                  onClick={() => void executeOrCheck(false)}
                />
              </>
            )}
          </>
        )
      )}
    </section>
  )
}
