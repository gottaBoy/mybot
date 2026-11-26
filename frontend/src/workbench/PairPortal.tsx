import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  Check,
  Languages,
  LogOut,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sun,
  ListChecks,
  MessageSquare,
  Workflow,
  FileCheck2,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppDialog,
  AppInput,
  AppLoading,
  AppSelect,
  AppSegments,
  AppTextArea,
  AppTheme,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import {
  styleIds,
  styleOptions,
  accentIds,
  type AccentId,
  type Density,
  type StyleId,
} from '../components/ui/themes'
import { ApiError } from './api'
import {
  assertDeviceClaimSession,
  claimDevice,
  fetchDeviceEvents,
  fetchDeviceMessage,
  fetchDeviceSession,
  fetchPairedTask,
  logoutDevice,
  makePairSecret,
  parsePairCode,
  saveDeviceMessage,
  DeviceResponseError,
  type Device,
  type DeviceClaim,
  type DeviceMessageInput,
  type PairedTask,
} from './devices'
import {
  allowWorkbenchNavigation,
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
  WORKBENCH_NAVIGATION_EVENT,
} from './navigation-guard'
import { PairedRunHistory } from './PairedRunHistory'
import { PairedDeviceExecution } from './DeviceExecution'
import {
  pairedWorkspaceHref,
  readPairedLocation,
  type PairedLocation,
} from './pair-location'
import {
  readPreference,
  savePreference,
  statusText,
  statusTone,
  type Copy,
  type Locale,
} from './state'
import './workbench.css'
import './pair-portal.css'

type PendingClaim = {
  phase: 'sending' | 'unknown' | 'retry'
  requestId: string
  command?: DeviceClaim
}
type PendingMessage = {
  phase: 'sending' | 'unknown' | 'retry'
  requestId: string
  command?: DeviceMessageInput
}
type Feedback = { tone: 'info' | 'error'; text: string }

export function readPairPortalLocation(href: string): {
  error?: boolean
  claimId?: string
  sendId?: string
  executeId?: string
} {
  const query = href.split('#')[1]?.split('?')[1] ?? ''
  const params = new URLSearchParams(query)
  const claims = params.getAll('deviceClaim'),
    sends = params.getAll('deviceSend'),
    executes = params.getAll('deviceExecute')
  const valid = (values: string[]) =>
    values.length <= 1 &&
    (!values.length || /^[A-Za-z0-9_-]{8,100}$/.test(values[0]))
  if (
    !valid(claims) ||
    !valid(sends) ||
    !valid(executes) ||
    [claims, sends, executes].filter((values) => values.length).length > 1
  )
    return { error: true }
  return {
    claimId: claims[0],
    sendId: sends[0],
    ...(executes[0] ? { executeId: executes[0] } : {}),
  }
}
export function portalReceiptMatchesDevice(current: Device, expected: Device) {
  return (
    current.id === expected.id &&
    current.task_id === expected.task_id &&
    current.pairing_id === expected.pairing_id &&
    current.claim_request_id === expected.claim_request_id &&
    current.name === expected.name &&
    current.created_at === expected.created_at &&
    current.expires_at === expected.expires_at &&
    current.revoked_at === null
  )
}
export function PairPortal() {
  const [locale, setLocale] = useState<Locale>(() =>
    readPreference('mybot.locale', ['zh', 'en'], 'zh'),
  )
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    readPreference('mybot.mode', ['light', 'dark'], 'light'),
  )
  const [styleId, setStyleId] = useState<StyleId>(() =>
    readPreference('mybot.style', styleIds, 'neutral'),
  )
  const [density] = useState<Density>(() =>
    readPreference(
      'mybot.density',
      ['comfortable', 'compact', 'touch'],
      'comfortable',
    ),
  )
  const [accentId] = useState<AccentId>(() =>
    readPreference('mybot.accent', accentIds, 'theme'),
  )
  const t: Copy = (zh, en) => (locale === 'zh' ? zh : en)
  const location = readPairPortalLocation(
    typeof window === 'undefined' ? '' : window.location.href,
  )
  const [device, setDevice] = useState<Device | null>()
  const [position, setPosition] = useState(() =>
    readPairedLocation(
      typeof window === 'undefined' ? '' : window.location.href,
    ),
  )
  const [snapshot, setSnapshot] = useState<PairedTask>()
  const [executionLock, setExecutionLock] = useState(false)
  const [sessionBusy, setSessionBusy] = useState(true)
  const [sessionFailed, setSessionFailed] = useState(false)
  const [sessionRevision, setSessionRevision] = useState(0)
  const [readBusy, setReadBusy] = useState(false)
  const [syncFailed, setSyncFailed] = useState(false)
  const [lastSync, setLastSync] = useState('')
  const [feedback, setFeedback] = useState<Feedback>()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [draft, setDraft] = useState('')
  const [claim, setClaim] = useState<PendingClaim | undefined>(() =>
    location.claimId
      ? { phase: 'unknown', requestId: location.claimId }
      : undefined,
  )
  const [message, setMessage] = useState<PendingMessage | undefined>(() =>
    location.sendId
      ? { phase: 'unknown', requestId: location.sendId }
      : undefined,
  )
  const [checking, setChecking] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const mounted = useRef(true)
  const generation = useRef(0)
  const taskRequest = useRef<AbortController | undefined>(undefined)
  const actionRequest = useRef<AbortController | undefined>(undefined)
  const sessionRequest = useRef<AbortController | undefined>(undefined)
  const pollRequest = useRef<AbortController | undefined>(undefined)
  const polling = useRef(false)
  const operation = useRef(false)
  const cursor = useRef(0)
  const deviceState = useRef(device)
  const positionState = useRef(position)
  positionState.current = position
  const claimState = useRef(claim)
  const messageState = useRef(message)
  const internalNavigation = useRef(false)
  const readBusyState = useRef(readBusy)
  readBusyState.current = readBusy
  deviceState.current = device
  claimState.current = claim
  messageState.current = message
  const dirty = Boolean(draft || (!device && (code || name)))
  const scopeMismatch = Boolean(
    position.taskId && device && position.taskId !== device.task_id,
  )
  const positionInvalid = Boolean(
    position.error ||
    scopeMismatch ||
    (snapshot &&
      snapshot.run_history !== true &&
      (position.runId || position.view !== 'overview' || position.page !== 1)),
  )
  const locked = Boolean(
    claim ||
    message ||
    checking ||
    leaving ||
    location.error ||
    positionInvalid ||
    executionLock ||
    Boolean(location.executeId),
  )
  const guard = useRef({ dirty, busy: locked })
  guard.current = { dirty, busy: locked }
  useEffect(() => {
    savePreference('mybot.locale', locale)
  }, [locale])
  useEffect(() => {
    savePreference('mybot.mode', mode)
  }, [mode])
  useEffect(() => {
    savePreference('mybot.style', styleId)
  }, [styleId])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      generation.current++
      taskRequest.current?.abort()
      actionRequest.current?.abort()
      sessionRequest.current?.abort()
      pollRequest.current?.abort()
    }
  }, [])
  useEffect(() => {
    const change = (event: Event) => {
      if (allowWorkbenchNavigation(event))
        setPosition(readPairedLocation(window.location.href))
    }
    window.addEventListener(WORKBENCH_NAVIGATION_EVENT, change)
    return () => window.removeEventListener(WORKBENCH_NAVIGATION_EVENT, change)
  }, [])
  useEffect(() => {
    if (!dirty && !locked) return
    const unregister = registerWorkbenchNavigationBlocker({
      getState: () =>
        internalNavigation.current
          ? { dirty: false, busy: false }
          : guard.current,
      onBlocked: () => setDiscardOpen(true),
      onReset: () => setDiscardOpen(false),
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!guard.current.dirty && !guard.current.busy) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      unregister()
      window.removeEventListener('beforeunload', unload)
    }
  }, [dirty, locked])
  function stamp(
    next: { claimId?: string; sendId?: string; executeId?: string } = {},
  ) {
    const query = new URLSearchParams(
      window.location.href.split('#')[1]?.split('?')[1] ?? '',
    )
    query.delete('deviceClaim')
    query.delete('deviceSend')
    query.delete('deviceExecute')
    if (next.claimId) query.set('deviceClaim', next.claimId)
    if (next.sendId) query.set('deviceSend', next.sendId)
    if (next.executeId) query.set('deviceExecute', next.executeId)
    internalNavigation.current = true
    try {
      return pushWorkbenchNavigation(`#pair${query.size ? `?${query}` : ''}`, {
        replace: true,
      })
    } finally {
      internalNavigation.current = false
    }
  }
  function unavailable(text?: string) {
    generation.current++
    taskRequest.current?.abort()
    actionRequest.current?.abort()
    pollRequest.current?.abort()
    deviceState.current = null
    setDevice(null)
    setSnapshot(undefined)
    setDraft('')
    setCode('')
    setName('')
    setClaim(undefined)
    setMessage(undefined)
    setReadBusy(false)
    setSessionBusy(false)
    setSessionFailed(false)
    setSyncFailed(false)
    setLastSync('')
    setExecutionLock(false)
    stamp()
    setFeedback({
      tone: 'error',
      text:
        text ??
        t(
          '设备会话已失效或被撤销，任务内容已清除。',
          'This device session expired or was revoked. Task content has been cleared.',
        ),
    })
  }
  const identityChanged = (reason: unknown) =>
    reason instanceof ApiError &&
    reason.status === 409 &&
    (reason.details as { code?: string } | undefined)?.code ===
      'device_identity_changed'
  function scopeChanged() {
    unavailable(
      t(
        '设备授权已在其他页面更换，旧任务输入已清除。正在核对当前会话。',
        'Device authorization changed in another tab. Previous task input was cleared; the current session is being checked.',
      ),
    )
    setSessionRevision((value) => value + 1)
  }
  function invalidProjection() {
    unavailable(
      t(
        '任务响应与设备授权不一致，旧内容已清除。请重新核对设备会话。',
        'The task response did not match this device authorization. Previous content was cleared; recheck the device session.',
      ),
    )
    setDevice(undefined)
    setSessionFailed(true)
  }
  const active = (expected: Device, version: number) =>
    mounted.current &&
    generation.current === version &&
    deviceState.current?.id === expected.id &&
    deviceState.current.task_id === expected.task_id
  async function refreshTask(expected = deviceState.current) {
    if (!expected || polling.current) return
    polling.current = true
    const version = generation.current
    taskRequest.current?.abort()
    const controller = new AbortController()
    taskRequest.current = controller
    setReadBusy(true)
    try {
      const next = await fetchPairedTask(expected, controller.signal)
      if (!active(expected, version) || controller.signal.aborted) return
      cursor.current = next.cursor
      setSnapshot(next)
      setSyncFailed(false)
      setLastSync(new Date().toISOString())
      setFeedback((before) =>
        before?.tone === 'error' && !messageState.current && !claimState.current
          ? undefined
          : before,
      )
    } catch (reason) {
      if (!active(expected, version) || controller.signal.aborted) return
      if (identityChanged(reason)) scopeChanged()
      else if (reason instanceof DeviceResponseError) invalidProjection()
      else if (
        reason instanceof ApiError &&
        [401, 403, 404].includes(reason.status)
      )
        unavailable()
      else {
        setSyncFailed(true)
        setFeedback({
          tone: 'error',
          text: t(
            '读取任务失败，已显示内容可能过期。请重新读取。',
            'Task synchronization failed. Displayed content may be stale; refresh the task.',
          ),
        })
      }
    } finally {
      polling.current = false
      if (active(expected, version)) setReadBusy(false)
    }
  }
  function acceptDevice(next: Device) {
    generation.current++
    deviceState.current = next
    setDevice(next)
    setSnapshot(undefined)
    setCode('')
    setName('')
    setClaim(undefined)
    claimState.current = undefined
    setFeedback(undefined)
    setSessionBusy(false)
    setSessionFailed(false)
  }
  useEffect(() => {
    const controller = new AbortController()
    sessionRequest.current = controller
    setSessionBusy(true)
    setSessionFailed(false)
    void fetchDeviceSession(controller.signal)
      .then((result) => {
        if (!mounted.current || controller.signal.aborted) return
        if (result.device) {
          if (
            location.claimId &&
            result.device.claim_request_id !== location.claimId
          )
            throw new Error('device_claim_identity_changed')
          if (location.claimId && !stamp())
            throw new Error('device_claim_navigation_unconfirmed')
          acceptDevice(result.device)
        } else {
          setDevice(null)
          setSessionBusy(false)
        }
      })
      .catch(() => {
        if (mounted.current && !controller.signal.aborted) {
          setSessionBusy(false)
          setDevice(undefined)
          setSessionFailed(true)
          setFeedback({
            tone: 'error',
            text: t(
              '设备会话读取失败，请核对连接。',
              'The device session could not be read. Check the connection.',
            ),
          })
        }
      })
    return () => controller.abort()
  }, [sessionRevision])
  useEffect(() => {
    if (device) void refreshTask(device)
  }, [device?.id])
  useEffect(() => {
    if (!device || !snapshot || syncFailed) return
    const expected = device
    const timer = window.setInterval(async () => {
      if (document.hidden || polling.current || readBusyState.current) return
      polling.current = true
      const version = generation.current
      const controller = new AbortController()
      pollRequest.current = controller
      try {
        const events = await fetchDeviceEvents(
          expected,
          cursor.current,
          controller.signal,
        )
        if (!active(expected, version) || controller.signal.aborted) return
        if (events.items.length) {
          const next = await fetchPairedTask(expected, controller.signal)
          if (!active(expected, version) || controller.signal.aborted) return
          cursor.current = next.cursor
          setSnapshot(next)
        } else cursor.current = events.next_cursor
        setLastSync(new Date().toISOString())
      } catch (reason) {
        if (!active(expected, version) || controller.signal.aborted) return
        if (identityChanged(reason)) scopeChanged()
        else if (reason instanceof DeviceResponseError) invalidProjection()
        else if (
          reason instanceof ApiError &&
          [401, 403, 404].includes(reason.status)
        )
          unavailable()
        else if (
          reason instanceof ApiError &&
          reason.status === 409 &&
          (reason.details as { code?: string } | undefined)?.code ===
            'device_cursor_reset'
        ) {
          polling.current = false
          void refreshTask(expected)
        } else {
          setSyncFailed(true)
          setFeedback({
            tone: 'error',
            text: t(
              '连接已中断，任务内容可能过期。重新读取不会重发消息。',
              'The connection was interrupted and content may be stale. Refreshing does not resend messages.',
            ),
          })
        }
      } finally {
        polling.current = false
      }
    }, 3000)
    return () => {
      clearInterval(timer)
      pollRequest.current?.abort()
    }
  }, [device?.id, snapshot?.device_id, syncFailed])
  async function sendClaim(command: DeviceClaim) {
    if (operation.current) return
    operation.current = true
    setFeedback(undefined)
    if (!stamp({ claimId: command.request_id })) {
      operation.current = false
      return
    }
    const pending: PendingClaim = {
      phase: 'sending',
      requestId: command.request_id,
      command,
    }
    claimState.current = pending
    setClaim(pending)
    actionRequest.current?.abort()
    const controller = new AbortController()
    actionRequest.current = controller
    try {
      const next = await claimDevice(command, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (!stamp()) throw new Error('device_claim_navigation_unconfirmed')
      acceptDevice(next)
    } catch (reason) {
      if (!mounted.current) return
      const rejected =
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      if (rejected && stamp()) {
        setClaim(undefined)
        claimState.current = undefined
        setFeedback({
          tone: 'error',
          text: t(
            '配对请求被拒绝，请确认配对码未使用且未过期。',
            'Pairing was rejected. Check that the code is unused and has not expired.',
          ),
        })
      } else {
        const unknown = { ...pending, phase: 'unknown' as const }
        claimState.current = unknown
        setClaim(unknown)
        setFeedback({
          tone: 'error',
          text: t(
            '配对结果未确认。请核对设备会话，不会自动重试。',
            'The pairing outcome is unconfirmed. Check the device session; it will not be retried automatically.',
          ),
        })
      }
    } finally {
      operation.current = false
    }
  }
  async function pair(event: FormEvent) {
    event.preventDefault()
    if (
      operation.current ||
      locked ||
      !name.trim() ||
      [...name.trim()].length > 80
    )
      return
    try {
      await sendClaim({
        request_id: crypto.randomUUID(),
        ...parsePairCode(code),
        device_name: name.trim(),
        device_secret: makePairSecret(),
      })
    } catch {
      setFeedback({
        tone: 'error',
        text: t(
          '请填写有效配对码和设备名称。',
          'Enter a valid pairing code and device name.',
        ),
      })
    }
  }
  async function checkClaim() {
    const before = claimState.current
    if (!before || operation.current || before.phase === 'sending') return
    operation.current = true
    setChecking(true)
    const controller = new AbortController()
    actionRequest.current = controller
    try {
      const session = await fetchDeviceSession(controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      if (!session.device) {
        const next = {
          ...before,
          phase: before.command ? ('retry' as const) : ('unknown' as const),
        }
        claimState.current = next
        setClaim(next)
        setFeedback({
          tone: 'error',
          text: before.command
            ? t(
                '尚未确认设备会话。可以显式重试原配对请求，内容和标识保持不变。',
                'No device session was confirmed. You may explicitly retry the identical pairing request.',
              )
            : t(
                '未找到设备会话，浏览器已无原配对凭据。请联系主工作台核对或重新授权。',
                'No device session was found and original pairing credentials are no longer in memory. Ask the workbench owner to reconcile or authorize a new invitation.',
              ),
        })
        return
      }
      if (before.command)
        assertDeviceClaimSession(session.device, before.command)
      else if (session.device.claim_request_id !== before.requestId)
        throw new Error('device_claim_identity_changed')
      if (!stamp()) throw new Error('device_claim_navigation_unconfirmed')
      acceptDevice(session.device)
    } catch {
      if (mounted.current)
        setFeedback({
          tone: 'error',
          text: t(
            '配对回执仍未确认，请保留原请求继续核对。',
            'The pairing receipt remains unconfirmed. Keep the original request and check again.',
          ),
        })
    } finally {
      operation.current = false
      if (mounted.current) setChecking(false)
    }
  }
  async function sendMessage(command?: DeviceMessageInput) {
    const expected = deviceState.current
    if (
      !expected ||
      !snapshot ||
      syncFailed ||
      readBusy ||
      positionInvalid ||
      executionLock ||
      location.executeId ||
      operation.current ||
      (!command && messageState.current)
    )
      return
    const content = command?.content ?? draft.trim()
    if (!content || [...content].length > 8000) return
    const sent = command ?? { request_id: crypto.randomUUID(), content }
    if (!stamp({ sendId: sent.request_id })) return
    operation.current = true
    const pending: PendingMessage = {
      phase: 'sending',
      requestId: sent.request_id,
      command: sent,
    }
    messageState.current = pending
    setMessage(pending)
    setFeedback(undefined)
    const version = generation.current
    actionRequest.current?.abort()
    const controller = new AbortController()
    actionRequest.current = controller
    try {
      await saveDeviceMessage(sent, expected.id, controller.signal)
      if (!active(expected, version) || controller.signal.aborted) return
      finishMessage()
    } catch (reason) {
      if (!active(expected, version)) return
      if (identityChanged(reason)) scopeChanged()
      else if (
        reason instanceof ApiError &&
        [401, 403, 404].includes(reason.status)
      )
        unavailable()
      else {
        const next = { ...pending, phase: 'unknown' as const }
        messageState.current = next
        setMessage(next)
        setFeedback({
          tone: 'error',
          text: t(
            '保存结果未确认。请核对原消息，不会自动重发。',
            'The save outcome is unconfirmed. Check the original message; it will not be resent automatically.',
          ),
        })
      }
    } finally {
      operation.current = false
    }
  }
  function finishMessage() {
    if (!stamp()) throw new Error('device_message_navigation_unconfirmed')
    setMessage(undefined)
    messageState.current = undefined
    setDraft('')
    setFeedback({
      tone: 'info',
      text: t(
        '补充要求已保存，尚未开始运行。',
        'The supplemental requirement was saved. No run has started.',
      ),
    })
    void refreshTask()
  }
  async function checkMessage() {
    const before = messageState.current,
      expected = deviceState.current
    if (!before || !expected || operation.current || before.phase === 'sending')
      return
    operation.current = true
    setChecking(true)
    const controller = new AbortController()
    actionRequest.current = controller
    const version = generation.current
    try {
      await fetchDeviceMessage(
        before.requestId,
        expected.id,
        controller.signal,
        before.command?.content,
      )
      if (!active(expected, version) || controller.signal.aborted) return
      finishMessage()
    } catch (reason) {
      if (!active(expected, version)) return
      if (identityChanged(reason)) scopeChanged()
      else if (reason instanceof ApiError && [401, 403].includes(reason.status))
        unavailable()
      else {
        const retry =
          reason instanceof ApiError && reason.status === 404 && before.command
        const next: PendingMessage = {
          ...before,
          phase: retry ? 'retry' : 'unknown',
        }
        messageState.current = next
        setMessage(next)
        setFeedback({
          tone: 'error',
          text: retry
            ? t(
                '暂未找到回执，可用同一请求重试原消息。',
                'No receipt was found yet. You may retry the original message with the same request ID.',
              )
            : t(
                '原消息仍待核对。未确认写入结束前不能发送新消息。',
                'The original message remains unresolved. A new message cannot be sent until it is reconciled.',
              ),
        })
      }
    } finally {
      operation.current = false
      if (mounted.current) setChecking(false)
    }
  }
  async function leave() {
    if (operation.current || message || claim) return
    operation.current = true
    setLeaving(true)
    setLeaveOpen(false)
    setDraft('')
    try {
      await logoutDevice()
      if (!mounted.current) return
      generation.current++
      taskRequest.current?.abort()
      setDevice(null)
      deviceState.current = null
      setSnapshot(undefined)
      setFeedback({
        tone: 'info',
        text: t(
          '已退出此设备会话，服务器授权记录仍由主工作台管理。',
          'This browser left the device session. The workbench owner still manages the authorization record.',
        ),
      })
    } catch {
      if (mounted.current)
        setFeedback({
          tone: 'error',
          text: t(
            '退出结果未确认，请刷新核对设备会话。',
            'The sign-out outcome is unconfirmed. Refresh to check the device session.',
          ),
        })
    } finally {
      operation.current = false
      if (mounted.current) setLeaving(false)
    }
  }
  const when = (value: string) =>
    new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  function navigatePosition(next: Partial<PairedLocation>) {
    const expected = deviceState.current
    if (
      !expected ||
      guard.current.busy ||
      operation.current ||
      readBusyState.current ||
      syncFailed ||
      positionState.current !== position
    )
      return
    internalNavigation.current = true
    try {
      const target = { ...position, ...next }
      if (
        pushWorkbenchNavigation(pairedWorkspaceHref(expected.task_id, target))
      )
        setPosition({ ...target, taskId: expected.task_id })
    } finally {
      internalNavigation.current = false
    }
  }
  const show = (view: string) =>
    position.view === 'overview' || position.view === view
  return (
    <AppTheme
      mode={mode}
      locale={locale}
      styleId={styleId}
      density={density}
      accentId={accentId}
    >
      <div className="wb-pair-shell">
        <header className="wb-pair-header">
          <strong className="wb-pair-brand">
            <Smartphone size={19} />
            mybot
          </strong>
          <div className="wb-pair-appearance">
            <AppSelect
              label={t('样式', 'Style')}
              value={styleId}
              options={styleOptions.map((style) => ({
                value: style.value,
                label: style.label,
              }))}
              onChange={(value) => {
                if (styleIds.includes(value as StyleId))
                  setStyleId(value as StyleId)
              }}
            />
            <AppButton
              label={t('Switch to English', '切换为中文')}
              icon={<Languages size={17} />}
              iconOnly
              tone="ghost"
              onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
            />
            <AppButton
              label={
                mode === 'light'
                  ? t('切换深色', 'Dark mode')
                  : t('切换浅色', 'Light mode')
              }
              icon={mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              iconOnly
              tone="ghost"
              onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
            />
          </div>
        </header>
        <main className="wb-pair-main">
          {location.error && (
            <p className="wb-error" role="alert">
              {t(
                '原请求标识无效，操作已锁定。',
                'The original request identifier is invalid. Actions are locked.',
              )}
            </p>
          )}
          {positionInvalid && (
            <p className="wb-error" role="alert">
              {scopeMismatch
                ? t(
                    '接续链接不属于当前授权任务，未显示任务内容。',
                    'This continuation link does not match the authorized task. Task content is hidden.',
                  )
                : t(
                    '接续位置无效或当前服务不支持此位置。',
                    'This continuation position is invalid or unsupported by this server.',
                  )}
            </p>
          )}
          {positionInvalid && device && !claim && !message && (
            <AppButton
              label={t('打开授权任务概览', 'Open authorized task overview')}
              icon={<RefreshCw size={16} />}
              onClick={() => {
                if (operation.current) return
                internalNavigation.current = true
                try {
                  if (
                    pushWorkbenchNavigation(pairedWorkspaceHref(device.task_id))
                  ) {
                    setPosition({
                      taskId: device.task_id,
                      view: 'overview',
                      page: 1,
                    })
                  }
                } finally {
                  internalNavigation.current = false
                }
              }}
            />
          )}
          {feedback && (
            <p
              className={feedback.tone === 'error' ? 'wb-error' : 'wb-notice'}
              role={feedback.tone === 'error' ? 'alert' : 'status'}
            >
              {feedback.text}
            </p>
          )}
          {sessionBusy ? (
            <AppLoading
              label={t('正在读取设备会话', 'Loading device session')}
            />
          ) : sessionFailed ? (
            <section className="wb-pair-form-section">
              <h1>{t('设备会话暂不可用', 'Device session unavailable')}</h1>
              <AppButton
                label={t('重试读取设备会话', 'Retry device session')}
                icon={<RefreshCw size={16} />}
                onClick={() => setSessionRevision((value) => value + 1)}
              />
            </section>
          ) : device ? (
            <section
              data-testid="paired-task"
              className="wb-paired-task"
              aria-busy={readBusy || undefined}
            >
              <div className="wb-pair-context">
                <div>
                  <AppBadge tone="info">
                    {t('任务接续', 'Task continuation')}
                  </AppBadge>
                  <h1>
                    {(!positionInvalid && snapshot?.task.title) ||
                      t('任务接续', 'Task continuation')}
                  </h1>
                  <span className="wb-muted">{device.name}</span>
                </div>
                <div className="wb-pair-actions">
                  <AppButton
                    label={t('刷新任务', 'Refresh task')}
                    icon={<RefreshCw size={16} />}
                    onClick={() => void refreshTask()}
                    busy={readBusy}
                    disabled={readBusy || checking}
                  />
                  <AppButton
                    label={t('退出设备会话', 'Leave device session')}
                    icon={<LogOut size={16} />}
                    iconOnly
                    tone="ghost"
                    onClick={() => setLeaveOpen(true)}
                    disabled={Boolean(
                      message ||
                      claim ||
                      leaving ||
                      executionLock ||
                      location.executeId,
                    )}
                  />
                </div>
              </div>
              <p className="wb-pair-boundary">
                <ShieldCheck size={16} />
                {snapshot?.execution_delegation === true
                  ? t(
                      '基础权限为查看与补充要求。一次执行需要主工作台单独授权并在此确认。',
                      'Base access permits reading and messages. A single execution requires a separate workbench grant and confirmation here.',
                    )
                  : t(
                      '仅限此任务的查看与补充要求。运行和配置由主工作台确认。',
                      'View and supplement this task only. Runs and configuration require workbench confirmation.',
                    )}
              </p>
              {lastSync && (
                <p className="wb-pair-sync">
                  {syncFailed
                    ? t('同步中断', 'Synchronization interrupted')
                    : t('最近读取', 'Last read')}
                  : {when(lastSync)}
                </p>
              )}
              {snapshot && !positionInvalid ? (
                <>
                  {snapshot.run_history === true && (
                    <nav className="wb-pair-views">
                      <AppSegments
                        label={t('接续视图', 'Continuation view')}
                        value={position.view}
                        onChange={(value) =>
                          navigatePosition({
                            view: value as PairedLocation['view'],
                          })
                        }
                        options={[
                          {
                            value: 'overview',
                            label: t('概览', 'Overview'),
                            icon: <Smartphone size={15} />,
                          },
                          {
                            value: 'goal',
                            label: t('目标', 'Goal'),
                            icon: <ListChecks size={15} />,
                          },
                          {
                            value: 'conversation',
                            label: t('会话', 'Conversation'),
                            icon: <MessageSquare size={15} />,
                          },
                          {
                            value: 'work',
                            label: t('运行', 'Runs'),
                            icon: <Workflow size={15} />,
                          },
                          {
                            value: 'review',
                            label: t('成果', 'Reports'),
                            icon: <FileCheck2 size={15} />,
                          },
                        ]}
                        iconOnly
                      />
                    </nav>
                  )}
                  {snapshot.execution_delegation === true &&
                    (position.view === 'overview' ||
                      position.view === 'work' ||
                      location.executeId) && (
                      <PairedDeviceExecution
                        key={device.id}
                        device={device}
                        revision={snapshot.cursor}
                        pendingId={location.executeId}
                        blocked={Boolean(
                          claim ||
                          message ||
                          checking ||
                          leaving ||
                          readBusy ||
                          syncFailed ||
                          positionInvalid,
                        )}
                        t={t}
                        stamp={(id) => stamp(id ? { executeId: id } : {})}
                        lock={setExecutionLock}
                        failure={(reason) => {
                          if (identityChanged(reason)) scopeChanged()
                          else if (reason instanceof DeviceResponseError)
                            invalidProjection()
                          else unavailable()
                        }}
                      />
                    )}
                  {location.executeId &&
                    snapshot.execution_delegation !== true && (
                      <p role="alert" className="wb-error">
                        {t(
                          '当前服务未提供原执行授权的核对能力。',
                          'This server cannot reconcile the original execution grant.',
                        )}
                      </p>
                    )}
                  {show('goal') && (
                    <section className="wb-pair-section">
                      <h2>{t('目标与验收', 'Goal & acceptance')}</h2>
                      <p className="wb-pair-prose">{snapshot.task.goal}</p>
                      {snapshot.task.acceptance && (
                        <p className="wb-pair-prose wb-muted">
                          {snapshot.task.acceptance}
                        </p>
                      )}
                    </section>
                  )}
                  {show('work') && (
                    <section className="wb-pair-section">
                      <h2>{t('最近运行', 'Latest run')}</h2>
                      {snapshot.latest_run ? (
                        <div className="wb-pair-actions">
                          <AppBadge
                            tone={statusTone(snapshot.latest_run.status)}
                          >
                            {statusText(snapshot.latest_run.status, t)}
                          </AppBadge>
                          <code>{snapshot.latest_run.id}</code>
                          <time>{when(snapshot.latest_run.created_at)}</time>
                        </div>
                      ) : (
                        <p className="wb-muted">
                          {t('尚无运行', 'No runs yet')}
                        </p>
                      )}
                    </section>
                  )}
                  {snapshot.report &&
                    position.view === 'overview' &&
                    !position.runId && (
                      <section className="wb-pair-section">
                        <h2>{snapshot.report.title}</h2>
                        <AppBadge tone={statusTone(snapshot.report.decision)}>
                          {snapshot.report.decision === 'pending'
                            ? t('待人工审查', 'Awaiting human review')
                            : statusText(snapshot.report.decision, t)}
                        </AppBadge>
                        <p className="wb-pair-prose">
                          {snapshot.report.content}
                        </p>
                        {snapshot.report.truncated && (
                          <p className="wb-hint">
                            {t(
                              '成果正文已截断，请在主工作台查看完整内容。',
                              'Report content was truncated. Open the workbench for the complete report.',
                            )}
                          </p>
                        )}
                      </section>
                    )}
                  {snapshot.run_history === true &&
                    (show('work') || show('review')) && (
                      <PairedRunHistory
                        device={device}
                        location={position}
                        revision={snapshot.cursor}
                        disabled={locked || readBusy || syncFailed}
                        t={t}
                        navigate={navigatePosition}
                        onScopeFailure={(reason) => {
                          if (identityChanged(reason)) scopeChanged()
                          else if (reason instanceof DeviceResponseError)
                            invalidProjection()
                          else unavailable()
                        }}
                      />
                    )}
                  <section
                    className="wb-pair-section"
                    hidden={!show('conversation')}
                  >
                    <h2>{t('补充要求', 'Supplemental requirements')}</h2>
                    <AppTextArea
                      label={t('补充要求', 'Supplemental requirements')}
                      value={draft}
                      onChange={(value) => {
                        if (!messageState.current && !operation.current)
                          setDraft(value)
                      }}
                      rows={4}
                      isDisabled={Boolean(message || checking)}
                    />
                    <div className="wb-pair-composer-actions">
                      <span className="wb-muted">
                        {[...draft].length} / 8000
                      </span>
                      <AppButton
                        label={t('保存补充要求', 'Save requirement')}
                        icon={<Save size={16} />}
                        tone="primary"
                        busy={message?.phase === 'sending'}
                        disabled={Boolean(
                          message ||
                          checking ||
                          syncFailed ||
                          readBusy ||
                          location.error ||
                          positionInvalid ||
                          executionLock ||
                          Boolean(location.executeId) ||
                          !draft.trim() ||
                          [...draft.trim()].length > 8000,
                        )}
                        onClick={() => void sendMessage()}
                      />
                    </div>
                    {message && (
                      <div className="wb-pair-receipt" role="status">
                        <code>{message.requestId}</code>
                        <AppButton
                          label={t('核对保存回执', 'Check save receipt')}
                          icon={<RefreshCw size={16} />}
                          busy={checking}
                          disabled={message.phase === 'sending' || checking}
                          onClick={() => void checkMessage()}
                        />
                        {message.phase === 'retry' && message.command && (
                          <AppButton
                            label={t('重试原消息', 'Retry original message')}
                            disabled={checking || syncFailed || readBusy}
                            onClick={() => {
                              const before = messageState.current
                              if (before?.phase === 'retry' && before.command)
                                void sendMessage(before.command)
                            }}
                          />
                        )}
                      </div>
                    )}
                    <div
                      className="wb-pair-message-list"
                      aria-label={t('已保存补充要求', 'Saved requirements')}
                    >
                      {snapshot.messages.items.map((item) => (
                        <article key={item.id} data-device-message={item.id}>
                          <header>
                            <AppBadge
                              tone={
                                item.state === 'applied' ? 'info' : 'neutral'
                              }
                            >
                              {item.state === 'applied'
                                ? t('已关联运行', 'Run linked')
                                : item.state === 'prepared'
                                  ? t(
                                      '已准备，待确认',
                                      'Prepared, awaiting confirmation',
                                    )
                                  : t('已保存，未执行', 'Saved, not executed')}
                            </AppBadge>
                            <time>{when(item.created_at)}</time>
                          </header>
                          <p className="wb-pair-prose">{item.content}</p>
                          {item.run_id && (
                            <code>
                              {t('关联运行', 'Linked run')}: {item.run_id}
                            </code>
                          )}
                        </article>
                      ))}
                      {!snapshot.messages.total && (
                        <p className="wb-muted">
                          {t(
                            '还没有补充要求',
                            'No supplemental requirements yet',
                          )}
                        </p>
                      )}
                      <p className="wb-hint">
                        {t(
                          `显示最近 ${snapshot.messages.items.length} / ${snapshot.messages.total} 条`,
                          `Showing latest ${snapshot.messages.items.length} / ${snapshot.messages.total} messages`,
                        )}
                      </p>
                    </div>
                  </section>
                </>
              ) : readBusy ? (
                <AppLoading label={t('正在读取任务', 'Loading task')} />
              ) : (
                <p className="wb-error">
                  {t(
                    '任务暂不可用，请重新读取。',
                    'The task is unavailable. Refresh to try again.',
                  )}
                </p>
              )}
            </section>
          ) : (
            <section className="wb-pair-form-section">
              <h1>{t('配对设备', 'Pair device')}</h1>
              <p className="wb-muted">
                {t(
                  '使用主工作台为此任务创建的限时配对码。',
                  'Use the limited-time pairing code created for this task in the workbench.',
                )}
              </p>
              <form className="wb-form" onSubmit={pair}>
                <AppInput
                  label={t('配对码', 'Pairing code')}
                  value={code}
                  type="password"
                  autoComplete="off"
                  onChange={(value) => {
                    if (!claimState.current && !operation.current)
                      setCode(value)
                  }}
                  isDisabled={Boolean(claim || checking || location.error)}
                />
                <AppInput
                  label={t('设备名称', 'Device name')}
                  value={name}
                  autoComplete="off"
                  maxLength={80}
                  onChange={(value) => {
                    if (!claimState.current && !operation.current)
                      setName(value)
                  }}
                  isDisabled={Boolean(claim || checking || location.error)}
                />
                <AppButton
                  label={t('配对设备', 'Pair device')}
                  icon={<Check size={16} />}
                  type="submit"
                  tone="primary"
                  busy={claim?.phase === 'sending'}
                  disabled={Boolean(
                    claim ||
                    checking ||
                    location.error ||
                    !code.trim() ||
                    !name.trim() ||
                    [...name.trim()].length > 80,
                  )}
                />
              </form>
              {claim && (
                <div className="wb-pair-receipt" role="status">
                  <code>{claim.requestId}</code>
                  <AppButton
                    label={t('核对配对结果', 'Check pairing result')}
                    icon={<RefreshCw size={16} />}
                    busy={checking}
                    disabled={checking || claim.phase === 'sending'}
                    onClick={() => void checkClaim()}
                  />
                  {claim.phase === 'retry' && claim.command && (
                    <AppButton
                      label={t('重试原配对请求', 'Retry original pairing')}
                      disabled={checking}
                      onClick={() => {
                        const before = claimState.current
                        if (before?.phase === 'retry' && before.command)
                          void sendClaim(before.command)
                      }}
                    />
                  )}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
      {discardOpen && (
        <AppDraftGuard
          title={t('放弃未保存内容？', 'Discard unsaved content?')}
          description={t(
            '离开后，此设备尚未保存的输入将丢失。',
            'Leaving discards input that has not been saved.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃修改', 'Discard changes')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            setDiscardOpen(false)
          }}
          onDiscard={() => {
            setDraft('')
            setCode('')
            setName('')
            guard.current = { dirty: false, busy: false }
            setDiscardOpen(false)
            confirmWorkbenchNavigation()
          }}
        />
      )}
      {leaveOpen && (
        <AppDialog
          title={t('退出设备会话？', 'Leave device session?')}
          closeLabel={t('取消', 'Cancel')}
          onClose={() => setLeaveOpen(false)}
        >
          <p>
            {t(
              '未保存输入将丢失。已保存要求仍保留，服务器授权由主工作台管理。',
              'Unsaved input will be lost. Saved requirements remain; the workbench owner manages server authorization.',
            )}
          </p>
          <div className="wb-pair-actions">
            <AppButton
              label={t('取消', 'Cancel')}
              onClick={() => setLeaveOpen(false)}
            />
            <AppButton
              label={t('确认退出', 'Confirm leave')}
              tone="destructive"
              onClick={() => void leave()}
            />
          </div>
        </AppDialog>
      )}
    </AppTheme>
  )
}
