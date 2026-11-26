import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy as CopyIcon,
  KeyRound,
  Link2,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppLoading,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { ApiError, type Bootstrap, type Task } from './api'
import {
  createDevicePairing,
  fetchDeviceOperation,
  fetchDevicePairing,
  fetchDevices,
  makePairSecret,
  revokeDevice,
  type Device,
  type DeviceCommand,
  type DevicePage,
  type DevicePairing,
  type DeviceReceipt,
} from './devices'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import type { Copy, Locale } from './state'
import { fetchTaskDetail } from './task-detail'
import { isTaskReadIdentifier } from './task-query'
import { taskWorkspaceHref } from './task-workspace-location'
import './devices-page.css'
import { OwnerDeviceExecution } from './DeviceExecution'

type Operation =
  | { phase: 'idle' }
  | {
      phase: 'sending' | 'unknown' | 'checking' | 'missing'
      requestId: string
      command?: DeviceCommand
    }
type Notice = { tone: 'info' | 'error'; text: string }
type Grant = { task: Task; label: string; fingerprint: string }

export function readDevicesLocation(href: string): {
  taskId?: string
  requestId?: string
  executionDevice?: string
  executionOperation?: string
  error?: boolean
} {
  try {
    const url = new URL(href, 'http://localhost')
    const params = new URLSearchParams(url.hash.split('?')[1] ?? '')
    const tasks = params.getAll('task')
    const requests = params.getAll('deviceRequest')
    const executionDevices = params.getAll('executionDevice')
    const executionOperations = params.getAll('executionOperation')
    if (
      tasks.length > 1 ||
      requests.length > 1 ||
      executionDevices.length > 1 ||
      executionOperations.length > 1 ||
      (executionDevices.length === 1 &&
        !isTaskReadIdentifier(executionDevices[0])) ||
      (executionOperations.length === 1 &&
        (!executionDevices.length ||
          !/^[A-Za-z0-9_-]{8,100}$/.test(executionOperations[0]))) ||
      (executionDevices.length > 0 && requests.length > 0) ||
      (tasks.length === 1 && !isTaskReadIdentifier(tasks[0])) ||
      (requests.length === 1 && !/^[A-Za-z0-9_-]{8,100}$/.test(requests[0]))
    )
      return { error: true }
    return {
      ...(tasks.length ? { taskId: tasks[0] } : {}),
      ...(requests.length ? { requestId: requests[0] } : {}),
      ...(executionDevices.length
        ? { executionDevice: executionDevices[0] }
        : {}),
      ...(executionOperations.length
        ? { executionOperation: executionOperations[0] }
        : {}),
    }
  } catch {
    return { error: true }
  }
}

export function deviceAccessState(device: Device, now = Date.now()) {
  return device.revoked_at
    ? 'revoked'
    : Date.parse(device.expires_at) <= now
      ? 'expired'
      : 'authorized'
}

export function validPairingDraft(taskId: string, label: string) {
  const name = label.trim()
  return (
    isTaskReadIdentifier(taskId.trim()) &&
    name.length > 0 &&
    [...name].length <= 80 &&
    !/[\uD800-\uDFFF]/u.test(
      name.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''),
    )
  )
}

const hardFailure = (reason: unknown) =>
  reason instanceof ApiError && [401, 403, 404].includes(reason.status)

export function DevicesPage({
  data,
  refreshRevision,
  t,
  locale,
}: {
  data: Bootstrap
  refreshRevision: number
  t: Copy
  locale: Locale
}) {
  const supported = data.capabilities.device_continuation === true
  const location = readDevicesLocation(
    typeof window === 'undefined' ? '' : window.location.href,
  )
  const [taskId, setTaskId] = useState(location.taskId ?? '')
  const [label, setLabel] = useState('')
  const [page, setPage] = useState(1)
  const [directory, setDirectory] = useState<DevicePage>()
  const [readBusy, setReadBusy] = useState(true)
  const [readError, setReadError] = useState('')
  const [readRevision, setReadRevision] = useState(0)
  const [validating, setValidating] = useState(false)
  const [grant, setGrant] = useState<Grant>()
  const [selectedDevice, setSelectedDevice] = useState<Device>()
  const [consent, setConsent] = useState(false)
  const [operation, setOperation] = useState<Operation>(() =>
    location.requestId
      ? { phase: 'unknown', requestId: location.requestId }
      : { phase: 'idle' },
  )
  const [invitation, setInvitation] = useState<DevicePairing>()
  const [code, setCode] = useState('')
  const [invitationError, setInvitationError] = useState('')
  const [notice, setNotice] = useState<Notice>()
  const [discard, setDiscard] = useState(false)
  const [copying, setCopying] = useState(false)
  const [executionDevice, setExecutionDevice] = useState(
    location.executionDevice,
  )
  const root = useRef<HTMLElement>(null)
  const retryTrigger = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<
    { origin: Element | null; direction: 'previous' | 'next' } | undefined
  >(undefined)
  const mounted = useRef(true)
  const activeWorkspace = useRef(data.workspace)
  activeWorkspace.current = data.workspace
  const previousWorkspace = useRef(data.workspace)
  const previousSupported = useRef(supported)
  const generation = useRef(0)
  const mutationRequest = useRef<AbortController | undefined>(undefined)
  const validationRequest = useRef<AbortController | undefined>(undefined)
  const operationBusy = useRef(false)
  const operationState = useRef(operation)
  operationState.current = operation
  const internalNavigation = useRef(false)
  const initialTask = useRef(location.taskId ?? '')
  const fingerprint = JSON.stringify([data.workspace, taskId, label])
  const latestFingerprint = useRef(fingerprint)
  latestFingerprint.current = fingerprint
  const locked =
    operation.phase !== 'idle' ||
    Boolean(location.error) ||
    Boolean(executionDevice)
  const dirty = Boolean(label || taskId !== initialTask.current || code)
  const guardState = useRef({ dirty: false, busy: false })
  guardState.current = { dirty, busy: locked || validating || copying }
  const admission = useRef({
    ready: false,
    candidate: '',
    devices: new Map<string, string>(),
  })
  admission.current = {
    ready: Boolean(
      supported && directory && !readBusy && !readError && !locked,
    ),
    candidate: fingerprint,
    devices: new Map(
      (directory?.items ?? []).map((device) => [
        device.id,
        JSON.stringify(device),
      ]),
    ),
  }
  const current = (workspace: string) =>
    mounted.current && activeWorkspace.current === workspace
  const clearPrivate = () => {
    generation.current++
    operationBusy.current = false
    mutationRequest.current?.abort()
    validationRequest.current?.abort()
    setDirectory(undefined)
    setExecutionDevice(undefined)
    setReadBusy(false)
    setGrant(undefined)
    setSelectedDevice(undefined)
    setInvitation(undefined)
    setCode('')
    setTaskId('')
    setLabel('')
    setConsent(false)
    setValidating(false)
    const pending = operationState.current
    if (pending.phase !== 'idle') {
      const unresolved: Operation = {
        phase: 'unknown',
        requestId: pending.requestId,
      }
      operationState.current = unresolved
      setOperation(unresolved)
    }
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      mutationRequest.current?.abort()
      validationRequest.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (
      previousWorkspace.current === data.workspace &&
      previousSupported.current === supported
    )
      return
    previousWorkspace.current = data.workspace
    previousSupported.current = supported
    clearPrivate()
    setReadError('')
    setNotice(undefined)
    setLabel('')
    initialTask.current = location.taskId ?? ''
    setTaskId(initialTask.current)
    setPage(1)
    setOperation(
      location.requestId
        ? { phase: 'unknown', requestId: location.requestId }
        : { phase: 'idle' },
    )
  }, [data.workspace, supported])
  useEffect(() => {
    const unauthorized = () => {
      clearPrivate()
      setLabel('')
      setTaskId('')
      setNotice(undefined)
      setReadError(
        t(
          '登录已失效，请重新登录。',
          'Your session has expired. Sign in again.',
        ),
      )
    }
    window.addEventListener('mybot:unauthorized', unauthorized)
    return () => window.removeEventListener('mybot:unauthorized', unauthorized)
  }, [t])
  useEffect(() => {
    if (location.requestId && operationState.current.phase === 'idle')
      setOperation({ phase: 'unknown', requestId: location.requestId })
  }, [location.requestId])
  useEffect(() => {
    if (!dirty && !locked && !validating && !copying) return
    const release = registerWorkbenchNavigationBlocker({
      getState: () =>
        internalNavigation.current
          ? { dirty: false, busy: false }
          : guardState.current,
      onBlocked: () => setDiscard(true),
      onReset: () => setDiscard(false),
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!guardState.current.dirty && !guardState.current.busy) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      release()
      window.removeEventListener('beforeunload', unload)
    }
  }, [dirty, locked, validating, copying])
  useEffect(() => {
    const controller = new AbortController()
    const version = generation.current
    const workspace = data.workspace
    if (!supported) {
      setDirectory(undefined)
      setReadBusy(false)
      return
    }
    setReadBusy(true)
    setReadError('')
    setDirectory((before) =>
      before?.requested_page === page ? before : undefined,
    )
    void fetchDevices(page, controller.signal)
      .then((value) => {
        if (
          !controller.signal.aborted &&
          current(workspace) &&
          version === generation.current
        )
          setDirectory(value)
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          !current(workspace) ||
          version !== generation.current
        )
          return
        if (hardFailure(reason)) clearPrivate()
        setReadError(
          t(
            '设备列表无法读取，现有内容可能已过期。',
            'The device list could not be read. Displayed content may be stale.',
          ),
        )
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          current(workspace) &&
          version === generation.current
        )
          setReadBusy(false)
      })
    return () => controller.abort()
  }, [supported, data.workspace, page, refreshRevision, readRevision])
  const invitationId = invitation?.id
  const invitationState = invitation?.state
  useEffect(() => {
    if (!supported || !invitationId || invitationState !== 'available') return
    const controller = new AbortController()
    const workspace = data.workspace
    const version = generation.current
    let inFlight = false
    const read = async () => {
      if (inFlight || document.hidden) return
      inFlight = true
      try {
        const value = await fetchDevicePairing(invitationId, controller.signal)
        if (
          !controller.signal.aborted &&
          current(workspace) &&
          version === generation.current
        ) {
          setInvitation(value)
          setInvitationError('')
          if (value.state !== 'available') {
            setCode('')
            setReadRevision((before) => before + 1)
          }
        }
      } catch (reason) {
        if (
          controller.signal.aborted ||
          !current(workspace) ||
          version !== generation.current
        )
          return
        if (hardFailure(reason)) clearPrivate()
        setInvitationError(
          t(
            '邀请状态暂不可确认。',
            'The invitation status could not be confirmed.',
          ),
        )
      } finally {
        inFlight = false
      }
    }
    const timer = setInterval(() => void read(), 5000)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [supported, invitationId, invitationState, data.workspace])
  useEffect(() => {
    const pending = pageFocus.current
    if (!pending || readBusy || (!directory && !readError)) return
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    if (readError) {
      retryTrigger.current?.focus()
      return
    }
    const allowed = ':not(:disabled):not([aria-disabled="true"])'
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-device-page="${pending.direction}"]${allowed}`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      `[data-device-page]${allowed}`,
    )
    ;(preferred ?? fallback)?.focus()
  }, [directory, readBusy, readError])

  const stampRequest = (id?: string) => {
    internalNavigation.current = true
    try {
      const params = new URLSearchParams()
      if (location.taskId) params.set('task', location.taskId)
      if (id) params.set('deviceRequest', id)
      return pushWorkbenchNavigation(
        `#devices${params.size ? `?${params}` : ''}`,
        {
          replace: true,
        },
      )
    } finally {
      internalNavigation.current = false
    }
  }
  const acceptReceipt = (receipt: DeviceReceipt, command?: DeviceCommand) => {
    cancelWorkbenchNavigation()
    if (!stampRequest()) {
      const pending = operationState.current
      if (pending.phase !== 'idle')
        setOperation({ ...pending, phase: 'unknown' })
      setNotice({
        tone: 'error',
        text: t(
          '回执已确认，但页面状态未更新。请保留原请求继续核对。',
          'The receipt was confirmed, but page state did not update. Keep the original request and check again.',
        ),
      })
      return
    }
    if (receipt.kind === 'pair') {
      setInvitation(receipt.result)
      setInvitationError('')
      initialTask.current = receipt.result.task_id
      setTaskId(receipt.result.task_id)
      setLabel('')
      if (command?.kind === 'pair') {
        setCode(`${receipt.result.id}.${command.pair_secret}`)
        setNotice({
          tone: 'info',
          text: t(
            '配对邀请已创建，十分钟内一次使用。',
            'Pairing invitation created. It can be used once within ten minutes.',
          ),
        })
      } else {
        setCode('')
        setNotice({
          tone: 'info',
          text: t(
            '邀请回执已确认；原配对码未保存在浏览器，无法恢复。',
            'Invitation receipt confirmed. The original pairing code was not stored in the browser and cannot be recovered.',
          ),
        })
      }
    } else {
      setNotice({
        tone: 'info',
        text: t(
          '设备访问已撤销。已保存消息仍然保留。',
          'Device access revoked. Previously saved messages remain.',
        ),
      })
    }
    setOperation({ phase: 'idle' })
    operationState.current = { phase: 'idle' }
    setConsent(false)
    setGrant(undefined)
    setSelectedDevice(undefined)
    setReadRevision((value) => value + 1)
  }
  const send = async (command: DeviceCommand, retry = false) => {
    const before = operationState.current
    if (
      operationBusy.current ||
      !supported ||
      !directory ||
      readBusy ||
      readError ||
      (retry
        ? before.phase !== 'missing' ||
          before.command !== command ||
          before.requestId !== command.request_id
        : before.phase !== 'idle' || Boolean(location.error))
    )
      return
    operationBusy.current = true
    const workspace = data.workspace
    const version = generation.current
    if (!stampRequest(command.request_id)) {
      operationBusy.current = false
      setNotice({
        tone: 'error',
        text: t(
          '原请求标识未能保留，尚未发送。',
          'The original request ID could not be retained. Nothing was sent.',
        ),
      })
      return
    }
    const sending: Operation = {
      phase: 'sending',
      requestId: command.request_id,
      command,
    }
    operationState.current = sending
    setOperation(sending)
    setNotice(undefined)
    setConsent(false)
    mutationRequest.current?.abort()
    const controller = new AbortController()
    mutationRequest.current = controller
    try {
      const receipt =
        command.kind === 'pair'
          ? await createDevicePairing(
              {
                request_id: command.request_id,
                task_id: command.task_id,
                label: command.label,
                pair_secret: command.pair_secret,
                consent: true,
              },
              controller.signal,
            )
          : await revokeDevice(
              command.device_id,
              {
                request_id: command.request_id,
                expected_revision: command.expected_revision,
                consent: true,
              },
              controller.signal,
            )
      if (
        !current(workspace) ||
        controller.signal.aborted ||
        version !== generation.current
      )
        return
      acceptReceipt(receipt, command)
    } catch (reason) {
      if (!current(workspace) || version !== generation.current) return
      setGrant(undefined)
      setSelectedDevice(undefined)
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        if (hardFailure(reason)) {
          clearPrivate()
          setReadError(
            t(
              '设备授权访问已失效，请重新确认登录。',
              'Device management access is unavailable. Check your sign-in again.',
            ),
          )
          return
        }
        if (stampRequest()) {
          setOperation({ phase: 'idle' })
          operationState.current = { phase: 'idle' }
        } else setOperation({ ...sending, phase: 'unknown' })
        setNotice({
          tone: 'error',
          text:
            reason.status === 409
              ? t(
                  '设备或邀请状态已改变，请重新读取后确认。输入已保留。',
                  'The device or invitation state changed. Reload and review; your input is retained.',
                )
              : t(
                  '请求被拒绝，未确认授权变更。',
                  'The request was rejected. No access change was confirmed.',
                ),
        })
      } else {
        setOperation({ ...sending, phase: 'unknown' })
        setNotice({
          tone: 'error',
          text: t(
            '写入结果尚未确认。请核对原请求，不会自动重发。',
            'The write outcome is unconfirmed. Check the original request; it will not be resent automatically.',
          ),
        })
      }
    } finally {
      if (current(workspace) && version === generation.current)
        operationBusy.current = false
    }
  }
  const preparePair = async () => {
    if (
      !admission.current.ready ||
      operationBusy.current ||
      validating ||
      !validPairingDraft(taskId, label)
    )
      return
    if (data.capabilities.task_detail !== true) {
      setNotice({
        tone: 'error',
        text: t(
          '当前服务无法确认任务资料，尚未创建邀请。',
          'This server cannot confirm Task details. No invitation was created.',
        ),
      })
      return
    }
    const workspace = data.workspace
    const version = generation.current
    const candidate = latestFingerprint.current
    operationBusy.current = true
    setValidating(true)
    setNotice(undefined)
    validationRequest.current?.abort()
    const controller = new AbortController()
    validationRequest.current = controller
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const value = await fetchTaskDetail(
        { taskId: taskId.trim(), page: 1, pageSize: 20 },
        controller.signal,
      )
      if (
        controller.signal.aborted ||
        !current(workspace) ||
        version !== generation.current ||
        latestFingerprint.current !== candidate
      )
        return
      setGrant({
        task: value.item.task,
        label: label.trim(),
        fingerprint: candidate,
      })
      setConsent(false)
    } catch (reason) {
      if (!current(workspace) || version !== generation.current) return
      if (
        hardFailure(reason) &&
        reason instanceof ApiError &&
        reason.status === 401
      )
        clearPrivate()
      setNotice({
        tone: 'error',
        text: t(
          '任务资料确认失败，尚未创建邀请。输入已保留。',
          'Task details could not be confirmed. No invitation was created; your input is retained.',
        ),
      })
    } finally {
      clearTimeout(timer)
      if (current(workspace) && version === generation.current) {
        operationBusy.current = false
        setValidating(false)
      }
    }
  }
  const reconcile = async () => {
    const before = operationState.current
    if (
      !supported ||
      operationBusy.current ||
      before.phase === 'idle' ||
      before.phase === 'sending' ||
      before.phase === 'checking'
    )
      return
    operationBusy.current = true
    const workspace = data.workspace
    const version = generation.current
    setOperation({ ...before, phase: 'checking' })
    setNotice(undefined)
    mutationRequest.current?.abort()
    const controller = new AbortController()
    mutationRequest.current = controller
    try {
      const receipt = await fetchDeviceOperation(
        before.requestId,
        controller.signal,
        before.command,
      )
      if (
        !current(workspace) ||
        controller.signal.aborted ||
        version !== generation.current
      )
        return
      acceptReceipt(receipt, before.command)
    } catch (reason) {
      if (!current(workspace) || version !== generation.current) return
      if (reason instanceof ApiError && reason.status === 404) {
        setOperation({
          ...before,
          phase: before.command ? 'missing' : 'unknown',
        })
        setNotice({
          tone: 'error',
          text: before.command
            ? t(
                '暂未找到回执，可手动重试相同内容和请求标识，配置仍锁定。',
                'No receipt was found yet. You may retry the identical command and request ID; configuration stays locked.',
              )
            : t(
                '暂未找到原请求，先前写入仍可能在途。原内容未在浏览器持久保存，请继续核对。',
                'The original request was not found yet; its write may still be in flight. Its content was not stored in the browser. Keep checking the original request.',
              ),
        })
      } else {
        if (hardFailure(reason)) {
          clearPrivate()
          setReadError(
            t(
              '设备授权访问已失效，请重新确认登录。',
              'Device management access is unavailable. Check your sign-in again.',
            ),
          )
          return
        }
        setOperation({ ...before, phase: 'unknown' })
        setNotice({
          tone: 'error',
          text: t(
            '回执无法确认，原请求仍待核对。',
            'The receipt could not be confirmed. The original request remains unresolved.',
          ),
        })
      }
    } finally {
      if (current(workspace) && version === generation.current)
        operationBusy.current = false
    }
  }
  const changePage = (candidate: number, direction: 'previous' | 'next') => {
    if (
      !directory ||
      readBusy ||
      readError ||
      validating ||
      locked ||
      candidate < 1 ||
      candidate > directory.total_pages
    )
      return
    pageFocus.current = { origin: document.activeElement, direction }
    setDirectory(undefined)
    setPage(candidate)
  }
  const when = (value: string) =>
    new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  const stampExecution = (deviceId?: string, operationId?: string) => {
    const query = new URLSearchParams(
      window.location.href.split('#')[1]?.split('?')[1] ?? '',
    )
    query.delete('executionDevice')
    query.delete('executionOperation')
    if (deviceId) query.set('executionDevice', deviceId)
    if (operationId) query.set('executionOperation', operationId)
    internalNavigation.current = true
    try {
      return pushWorkbenchNavigation(
        `#devices${query.size ? `?${query}` : ''}`,
        { replace: true },
      )
    } finally {
      internalNavigation.current = false
    }
  }

  return (
    <section ref={root} className="wb-devices-page" data-testid="devices-page">
      <header className="wb-devices-heading">
        <div>
          <h1>{t('设备接续', 'Device continuation')}</h1>
          <p>
            {t(
              '按任务授权的配对设备',
              'Paired devices authorized for individual Tasks',
            )}
          </p>
        </div>
        <AppButton
          label={t('刷新设备', 'Refresh devices')}
          icon={<RefreshCw size={16} />}
          onClick={() => setReadRevision((value) => value + 1)}
          disabled={
            !supported ||
            readBusy ||
            validating ||
            operation.phase === 'sending'
          }
          busy={readBusy && Boolean(directory)}
        />
      </header>
      {!supported && (
        <p className="wb-devices-message" role="status">
          {t(
            '当前服务未启用设备接续。',
            'Device continuation is not enabled on this server.',
          )}
        </p>
      )}
      {location.error && (
        <p className="wb-error wb-devices-message" role="alert">
          {t(
            '设备页面标识无效，配置操作已锁定。',
            'Device page identifiers are invalid. Configuration actions are locked.',
          )}
        </p>
      )}
      {notice && (
        <p
          className={`${notice.tone === 'error' ? 'wb-error' : 'wb-notice'} wb-devices-message`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}
      {operation.phase !== 'idle' && (
        <div className="wb-devices-pending" role="status">
          <div>
            <strong>
              {t('原请求等待确认', 'Original request awaiting confirmation')}
            </strong>
            <code>{operation.requestId}</code>
          </div>
          <div className="wb-devices-actions">
            <AppButton
              label={t('核对原请求', 'Check original request')}
              icon={<RefreshCw size={16} />}
              busy={operation.phase === 'checking'}
              disabled={!supported || operation.phase === 'sending'}
              onClick={() => void reconcile()}
            />
            {operation.phase === 'missing' && operation.command && (
              <AppButton
                label={t('用原请求重试', 'Retry original request')}
                icon={<Link2 size={16} />}
                disabled={readBusy || Boolean(readError)}
                onClick={() => {
                  const pending = operationState.current
                  if (pending.phase === 'missing' && pending.command)
                    void send(pending.command, true)
                }}
              />
            )}
          </div>
        </div>
      )}
      {supported && (
        <section
          className="wb-devices-invitation"
          aria-label={t('配对邀请', 'Pairing invitation')}
        >
          <div className="wb-devices-section-heading">
            <h2>
              <MonitorSmartphone size={18} />
              {t('授权另一台设备', 'Authorize another device')}
            </h2>
            <a
              className="wb-text-link"
              href="#pair"
              target="_blank"
              rel="noreferrer"
            >
              <Link2 size={15} />
              {t('配对入口', 'Pairing entry')}
            </a>
          </div>
          <div className="wb-devices-grant-scope">
            <ShieldCheck size={18} />
            <div>
              <strong>
                {t(
                  '查看指定任务与保存补充要求',
                  'Read one Task and save supplemental requirements',
                )}
              </strong>
              <p>
                {t(
                  '启动模型、修改配置和执行控制仍需主工作台确认。',
                  'Starting models, changing configuration and execution control still require the main workbench.',
                )}
              </p>
            </div>
          </div>
          <div
            className="wb-devices-invite-fields"
            inert={locked || validating || undefined}
          >
            <AppInput
              label={t('任务 ID', 'Task ID')}
              value={taskId}
              onChange={(value) => {
                if (
                  operationBusy.current ||
                  operationState.current.phase !== 'idle' ||
                  location.error
                )
                  return
                setTaskId(value)
                setGrant(undefined)
                setConsent(false)
                setNotice(undefined)
              }}
              maxLength={100}
              isRequired
              autoComplete="off"
            />
            <AppInput
              label={t('邀请名称', 'Invitation label')}
              value={label}
              onChange={(value) => {
                if (
                  operationBusy.current ||
                  operationState.current.phase !== 'idle' ||
                  location.error
                )
                  return
                setLabel(value)
                setGrant(undefined)
                setConsent(false)
                setNotice(undefined)
              }}
              maxLength={80}
              isRequired
              autoComplete="off"
            />
            <AppButton
              label={t('创建配对码', 'Create pairing code')}
              icon={<KeyRound size={16} />}
              tone="primary"
              disabled={
                !admission.current.ready ||
                !validPairingDraft(taskId, label) ||
                validating
              }
              busy={validating}
              onClick={() => void preparePair()}
            />
          </div>
          {invitation && (
            <div
              className="wb-devices-code"
              data-testid="device-pairing-result"
            >
              <div className="wb-devices-section-heading">
                <strong>{invitation.label}</strong>
                <AppBadge
                  tone={
                    invitation.state === 'claimed'
                      ? 'success'
                      : invitation.state === 'expired'
                        ? 'neutral'
                        : 'info'
                  }
                >
                  {invitation.state === 'claimed'
                    ? t('已配对', 'Paired')
                    : invitation.state === 'expired'
                      ? t('已过期', 'Expired')
                      : t('等待配对', 'Awaiting pairing')}
                </AppBadge>
              </div>
              <p className="wb-muted">
                {t('邀请到期', 'Invitation expires')}:{' '}
                {when(invitation.expires_at)}
              </p>
              {code ? (
                <>
                  <AppInput
                    label={t('配对码', 'Pairing code')}
                    value={code}
                    onChange={() => {}}
                    isReadOnly
                    type="password"
                    autoComplete="off"
                  />
                  <div className="wb-devices-actions">
                    <AppButton
                      label={t('复制配对码', 'Copy pairing code')}
                      icon={<CopyIcon size={16} />}
                      busy={copying}
                      disabled={copying || invitation.state !== 'available'}
                      onClick={async () => {
                        if (
                          !code ||
                          copying ||
                          invitation.state !== 'available'
                        )
                          return
                        setCopying(true)
                        try {
                          await navigator.clipboard.writeText(code)
                          if (mounted.current)
                            setNotice({
                              tone: 'info',
                              text: t('配对码已复制。', 'Pairing code copied.'),
                            })
                        } catch {
                          if (mounted.current)
                            setNotice({
                              tone: 'error',
                              text: t(
                                '配对码无法复制，请保留当前页面。',
                                'The pairing code could not be copied. Keep this page open.',
                              ),
                            })
                        } finally {
                          if (mounted.current) setCopying(false)
                        }
                      }}
                    />
                    <AppButton
                      label={t('关闭配对码', 'Close code')}
                      icon={<X size={16} />}
                      tone="ghost"
                      disabled={copying}
                      onClick={() => setCode('')}
                    />
                  </div>
                  <p className="wb-hint">
                    {t(
                      '配对码仅保留在当前页面，关闭后无法恢复。',
                      'The pairing code exists only on this page and cannot be recovered after closing it.',
                    )}
                  </p>
                </>
              ) : (
                <p className="wb-hint">
                  {t(
                    '原配对码未保留在当前页面。',
                    'The original pairing code is not retained on this page.',
                  )}
                </p>
              )}
              {invitationError && (
                <p className="wb-error" role="alert">
                  {invitationError}
                </p>
              )}
            </div>
          )}
        </section>
      )}
      <section
        className="wb-devices-directory"
        aria-label={t('已配对设备', 'Paired devices')}
      >
        <div className="wb-devices-section-heading">
          <h2>{t('已配对设备', 'Paired devices')}</h2>
          {directory && (
            <span className="wb-muted">
              {directory.total} {t('台设备', 'devices')}
            </span>
          )}
        </div>
        {readError && (
          <div className="wb-error wb-devices-message" role="alert">
            <p>{readError}</p>
            <AppButton
              ref={retryTrigger}
              label={t('重试读取设备', 'Retry devices')}
              icon={<RefreshCw size={16} />}
              onClick={() => setReadRevision((value) => value + 1)}
              disabled={readBusy}
            />
          </div>
        )}
        {supported && readBusy && !directory && (
          <AppLoading label={t('正在读取设备', 'Loading devices')} />
        )}
        {supported && directory && (
          <div aria-busy={readBusy || undefined}>
            {directory.total === 0 ? (
              <p className="wb-devices-empty">
                {t('尚无已配对设备', 'No devices have been paired')}
              </p>
            ) : (
              <ul className="wb-devices-list">
                {directory.items.map((device) => {
                  const state = deviceAccessState(device)
                  return (
                    <li key={device.id} data-device-id={device.id}>
                      <div className="wb-devices-device-name">
                        <MonitorSmartphone size={18} />
                        <div>
                          <strong>{device.name}</strong>
                          <code>{device.id}</code>
                        </div>
                      </div>
                      <div className="wb-devices-device-scope">
                        <a
                          className="wb-text-link"
                          href={taskWorkspaceHref(device.task_id)}
                          aria-disabled={
                            readBusy || Boolean(readError) || undefined
                          }
                          onClick={(event) => {
                            if (readBusy || readError) event.preventDefault()
                          }}
                        >
                          {t('任务', 'Task')} <code>{device.task_id}</code>
                        </a>
                        <span>
                          {t('查看 · 补充要求', 'Read · supplemental messages')}
                        </span>
                      </div>
                      <div className="wb-devices-device-state">
                        <AppBadge
                          tone={state === 'authorized' ? 'info' : 'neutral'}
                        >
                          {state === 'revoked'
                            ? t('已撤销', 'Revoked')
                            : state === 'expired'
                              ? t('已过期', 'Expired')
                              : t('已授权', 'Authorized')}
                        </AppBadge>
                        <time dateTime={device.expires_at}>
                          {t('到期', 'Expires')}: {when(device.expires_at)}
                        </time>
                      </div>
                      {data.capabilities.device_execution_delegation ===
                        true && (
                        <AppButton
                          label={t('执行委托', 'Execution delegation')}
                          icon={<ShieldCheck size={16} />}
                          tone="ghost"
                          disabled={
                            !admission.current.ready ||
                            validating ||
                            state !== 'authorized'
                          }
                          onClick={() => {
                            if (
                              !admission.current.ready ||
                              operationBusy.current ||
                              data.capabilities.device_execution_delegation !==
                                true ||
                              admission.current.devices.get(device.id) !==
                                JSON.stringify(device) ||
                              deviceAccessState(device) !== 'authorized'
                            )
                              return
                            if (stampExecution(device.id))
                              setExecutionDevice(device.id)
                          }}
                        />
                      )}
                      <AppButton
                        label={t('撤销设备', 'Revoke device')}
                        icon={<ShieldX size={16} />}
                        tone="ghost"
                        disabled={
                          !admission.current.ready ||
                          validating ||
                          state !== 'authorized'
                        }
                        onClick={() => {
                          if (
                            !admission.current.ready ||
                            operationBusy.current ||
                            admission.current.devices.get(device.id) !==
                              JSON.stringify(device) ||
                            deviceAccessState(device) !== 'authorized'
                          )
                            return
                          setSelectedDevice(device)
                          setConsent(false)
                        }}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
            <footer className="wb-devices-pagination">
              <span>
                {directory.total === 0 ? 0 : (directory.page - 1) * 20 + 1}–
                {Math.min(directory.page * 20, directory.total)} /{' '}
                {directory.total}
              </span>
              <div>
                <AppButton
                  label={t('上一页设备', 'Previous devices')}
                  icon={<ChevronLeft size={16} />}
                  iconOnly
                  tone="ghost"
                  data-device-page="previous"
                  disabled={
                    readBusy ||
                    Boolean(readError) ||
                    locked ||
                    directory.page <= 1
                  }
                  onClick={() => changePage(directory.page - 1, 'previous')}
                />
                <span>
                  {directory.page} / {directory.total_pages}
                </span>
                <AppButton
                  label={t('下一页设备', 'Next devices')}
                  icon={<ChevronRight size={16} />}
                  iconOnly
                  tone="ghost"
                  data-device-page="next"
                  disabled={
                    readBusy ||
                    Boolean(readError) ||
                    locked ||
                    !directory.has_more
                  }
                  onClick={() => changePage(directory.page + 1, 'next')}
                />
              </div>
            </footer>
          </div>
        )}
      </section>
      {executionDevice &&
        data.capabilities.device_execution_delegation === true && (
          <OwnerDeviceExecution
            key={executionDevice}
            deviceId={executionDevice}
            operationId={location.executionOperation}
            t={t}
            stamp={(id) => stampExecution(executionDevice, id)}
            close={() => {
              if (stampExecution()) setExecutionDevice(undefined)
            }}
          />
        )}
      {executionDevice &&
        data.capabilities.device_execution_delegation !== true && (
          <p role="alert" className="wb-error">
            {t(
              '当前服务未提供执行委托，原请求保持锁定。',
              'This server does not provide execution delegation. The original request remains locked.',
            )}
          </p>
        )}
      {grant && (
        <AppDialog
          title={t('授权任务设备', 'Authorize task device')}
          closeLabel={t('取消', 'Cancel')}
          busy={operation.phase === 'sending'}
          onClose={() => {
            if (operationBusy.current) return
            setGrant(undefined)
            setConsent(false)
          }}
        >
          <div className="wb-form wb-devices-confirmation">
            <strong>{grant.task.title}</strong>
            <code>{grant.task.id}</code>
            <p>{grant.label}</p>
            <details className="wb-disclosure">
              <summary>
                {t('任务目标与验收', 'Task goal and acceptance')}
              </summary>
              <p>{grant.task.goal}</p>
              <p>{grant.task.acceptance}</p>
            </details>
            <p>
              {t(
                '此设备可查看该任务目标、验收、最近消息、最新运行与报告，并保存补充要求；授权三十天。配对码十分钟内一次使用。',
                'This device may read this Task’s goal, acceptance, recent messages, latest Run and report, and save supplemental requirements for thirty days. The pairing code is single-use within ten minutes.',
              )}
            </p>
            <AppCheckbox
              label={t('我确认授权此设备范围', 'I authorize this device scope')}
              value={consent}
              isDisabled={locked}
              onChange={setConsent}
            />
            <div className="wb-form-actions">
              <AppButton
                label={t('确认创建配对码', 'Confirm pairing')}
                tone="primary"
                icon={<Check size={16} />}
                busy={operation.phase === 'sending'}
                disabled={
                  !consent ||
                  locked ||
                  !admission.current.ready ||
                  grant.fingerprint !== latestFingerprint.current
                }
                onClick={() => {
                  if (
                    !consent ||
                    !grant ||
                    !admission.current.ready ||
                    grant.fingerprint !== latestFingerprint.current
                  )
                    return
                  void send({
                    kind: 'pair',
                    request_id: crypto.randomUUID(),
                    task_id: grant.task.id,
                    label: grant.label,
                    pair_secret: makePairSecret(),
                    consent: true,
                  })
                }}
              />
            </div>
          </div>
        </AppDialog>
      )}
      {selectedDevice && (
        <AppDialog
          title={t('撤销设备访问', 'Revoke device access')}
          closeLabel={t('取消', 'Cancel')}
          busy={operation.phase === 'sending'}
          onClose={() => {
            if (operationBusy.current) return
            setSelectedDevice(undefined)
            setConsent(false)
          }}
        >
          <div className="wb-form wb-devices-confirmation">
            <strong>{selectedDevice.name}</strong>
            <code>{selectedDevice.id}</code>
            <p>
              {t(
                '撤销后此设备不能再读取或保存要求；此前保存的消息和运行仍然保留。',
                'Revocation blocks future reads and supplemental messages from this device. Previously saved messages and Runs remain.',
              )}
            </p>
            <AppCheckbox
              label={t(
                '我确认撤销此设备访问',
                'I confirm revocation of this device access',
              )}
              value={consent}
              isDisabled={locked}
              onChange={setConsent}
            />
            <div className="wb-form-actions">
              <AppButton
                label={t('确认撤销', 'Confirm revocation')}
                icon={<ShieldX size={16} />}
                tone="destructive"
                busy={operation.phase === 'sending'}
                disabled={
                  !consent ||
                  locked ||
                  !admission.current.ready ||
                  admission.current.devices.get(selectedDevice.id) !==
                    JSON.stringify(selectedDevice)
                }
                onClick={() => {
                  if (
                    !consent ||
                    !selectedDevice ||
                    !admission.current.ready ||
                    admission.current.devices.get(selectedDevice.id) !==
                      JSON.stringify(selectedDevice)
                  )
                    return
                  void send({
                    kind: 'revoke',
                    request_id: crypto.randomUUID(),
                    device_id: selectedDevice.id,
                    expected_revision: selectedDevice.revision,
                    consent: true,
                  })
                }}
              />
            </div>
          </div>
        </AppDialog>
      )}
      {discard && (
        <AppDraftGuard
          title={t('离开设备管理？', 'Leave device management?')}
          description={t(
            '未提交的邀请资料和当前页面中的配对码将丢失。',
            'Unsubmitted invitation details and any pairing code on this page will be lost.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃修改', 'Discard changes')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            setDiscard(false)
          }}
          onDiscard={() => {
            if (guardState.current.busy) return
            setCode('')
            setLabel('')
            initialTask.current = taskId
            setDiscard(false)
            confirmWorkbenchNavigation()
          }}
        />
      )}
    </section>
  )
}
