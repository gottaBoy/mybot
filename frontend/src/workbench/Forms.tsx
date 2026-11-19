import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import {
  AppButton,
  AppBadge,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppNumber,
  AppSelect,
  AppTextArea,
} from '../components/ui'
import {
  post,
  ApiError,
  type Backend,
  type Bootstrap,
  type Model,
  type Project,
  type Snapshot,
  type Task,
} from './api'
import { splitFiles, type Copy } from './state'
import { isContextChangedError, recheckedRunContext } from './run-context'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  refreshWorkbenchNavigationBlocker,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import {
  formDraftFingerprint,
  formLeaveDecision,
  firstFormError,
  serverFormErrors,
  validateFormDraft,
  type FormDraft,
  type FormFieldErrors,
} from './forms-state'
import {
  canPrepareModelTest,
  currentModelTest,
  modelTestReceipt,
  modelTestTone,
  prepareModelTest,
  rememberModelTest,
  unknownModelTest,
} from './model-test-state'
import { readModelTest, startModelTest } from './model-test-request'
import { ProjectTaskPicker } from './ProjectTaskPicker'
import { validateProjectSelection } from './project-selection'
import { useProjectReferences } from './useProjectReferences'

export type FormState =
  | { kind: 'project' }
  | { kind: 'task'; projectId?: string }
  | { kind: 'model' }
  | { kind: 'backend' }
  | { kind: 'run'; task: Task; snapshot: Snapshot }
  | { kind: 'test'; model: Model }
  | { kind: 'check' | 'revoke'; backend: Backend }

type Props = {
  state: FormState
  data: Bootstrap
  t: Copy
  onClose: () => void
  onSaved: () => Promise<void>
  onTask: (task: Task) => void
  onRun: (id: string) => void
  refreshRevision?: number
  onCreateProject?: () => void
}

export function WorkbenchForm({
  state,
  data,
  t,
  onClose,
  onSaved,
  onTask,
  onRun,
  refreshRevision = 0,
  onCreateProject,
}: Props) {
  const [busy, setBusy] = useState(false)
  const operationBusy = useRef(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [directory, setDirectory] = useState('.')
  const [goal, setGoal] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState('')
  const [acceptance, setAcceptance] = useState('')
  const [projectId, setProjectId] = useState(
    state.kind === 'task'
      ? (state.projectId ??
          (data.capabilities.project_references === true
            ? ''
            : (data.projects[0]?.id ?? '')))
      : '',
  )
  const taskProjectRefs = useProjectReferences({
    data,
    refreshRevision,
    enabled: state.kind === 'task' && Boolean(projectId),
    request: {
      query: '',
      page: 1,
      pageSize: 20,
      selectedIds: projectId ? [projectId] : [],
    },
  })
  const projectReferenceError = state.kind === 'task' && taskProjectRefs.error
  const projectReferenceBusy =
    state.kind === 'task' && taskProjectRefs.busy && !taskProjectRefs.value
  const [endpoint, setEndpoint] = useState('')
  const [model, setModel] = useState('')
  const [keyEnv, setKeyEnv] = useState('')
  const defaultModel =
    data.models.find((item) => item.id === data.default_model_id)?.id ??
    data.models[0]?.id ??
    ''
  const [routing, setRouting] = useState({
    coordinator_model: defaultModel,
    researcher_model: defaultModel,
    reviewer_model: defaultModel,
  })
  const [limits, setLimits] = useState({
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
  })
  const [consent, setConsent] = useState(false)
  const [runSnapshot, setRunSnapshot] = useState(
    state.kind === 'run' ? state.snapshot : undefined,
  )
  const [contextChanged, setContextChanged] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  // Kept stable across network errors, so explicit re-submit cannot enqueue a duplicate Run.
  const [requestId] = useState(() => crypto.randomUUID())
  const [modelTest, setModelTest] = useState(() =>
    currentModelTest(
      state.kind === 'test' ? state.model.id : '',
      () => crypto.randomUUID(),
      state.kind === 'test' ? state.model.latest_test : undefined,
      state.kind === 'test' ? state.model.test_status : undefined,
    ),
  )
  const [replayAcknowledged, setReplayAcknowledged] = useState(false)
  const [step, setStep] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({})
  const [discardOpen, setDiscardOpen] = useState(false)
  const [unmanagedNavigation, setUnmanagedNavigation] = useState(false)
  const taskValidationRequest = useRef<AbortController | null>(null)
  const [checkingTaskProject, setCheckingTaskProject] = useState(false)
  const mounted = useRef(true)
  const formRef = useRef<HTMLFormElement>(null)
  const pendingDiscard = useRef<(() => void) | null>(null)
  const saved = useRef(false)
  const draft: FormDraft = {
    name,
    directory,
    goal,
    notes,
    files,
    acceptance,
    projectId,
    endpoint,
    model,
    keyEnv,
    routing,
    limits,
    consent,
    snapshotHash: runSnapshot?.context_hash ?? '',
  }
  const fingerprint = formDraftFingerprint(state.kind, draft)
  const latestFingerprint = useRef(fingerprint)
  latestFingerprint.current = fingerprint
  const initialFingerprint = useRef(fingerprint)
  const dirty =
    !saved.current &&
    (fingerprint !== initialFingerprint.current ||
      (state.kind === 'test' &&
        ['running', 'unknown'].includes(modelTest.phase)))
  const guardState = useRef({ dirty, busy })
  guardState.current = { dirty, busy }
  function setFormBusy(value: boolean) {
    operationBusy.current = value
    guardState.current.busy = value
    setBusy(value)
    refreshWorkbenchNavigationBlocker()
  }
  useEffect(() => {
    if (state.kind === 'test') rememberModelTest(state.model.id, modelTest)
  }, [state, modelTest])
  function requestDiscard(action: () => void) {
    const decision = formLeaveDecision(guardState.current)
    if (decision === 'block') return
    if (decision === 'allow') {
      action()
      return
    }
    pendingDiscard.current = action
    setDiscardOpen(true)
  }
  function requestClose() {
    requestDiscard(onClose)
  }
  useEffect(() => {
    mounted.current = true
    const unload = (event: BeforeUnloadEvent) => {
      if (
        saved.current ||
        (!guardState.current.dirty && !guardState.current.busy)
      )
        return
      event.preventDefault()
      event.returnValue = ''
    }
    const unregister = registerWorkbenchNavigationBlocker({
      getState: () => ({
        dirty: !saved.current && guardState.current.dirty,
        busy: operationBusy.current,
      }),
      onBlocked: (intent) => {
        setUnmanagedNavigation(intent.kind === 'unmanaged')
        pendingDiscard.current = () => {
          confirmWorkbenchNavigation()
        }
        setDiscardOpen(true)
      },
      onReset: () => {
        pendingDiscard.current = null
        setDiscardOpen(false)
        setUnmanagedNavigation(false)
      },
    })
    window.addEventListener('beforeunload', unload)
    return () => {
      mounted.current = false
      taskValidationRequest.current?.abort()
      unregister()
      window.removeEventListener('beforeunload', unload)
    }
  }, [])
  function focusFirstError(errors: FormFieldErrors) {
    const key = firstFormError(errors)
    if (!key) return
    if (state.kind === 'run') {
      if (key === 'context_hash') setStep(0)
      else if (key !== 'consent') setStep(1)
    }
    requestAnimationFrame(() => {
      const row = [
        ...(formRef.current?.querySelectorAll<HTMLElement>(
          '[data-form-field]',
        ) ?? []),
      ].find((item) => item.dataset.formField === key)
      row
        ?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, select, button, summary, [tabindex]',
        )
        ?.focus()
      row?.scrollIntoView({ block: 'nearest' })
    })
  }
  function clearFieldError(key: string) {
    setFieldErrors((previous) => {
      const next = { ...previous }
      delete next[key]
      return next
    })
  }
  const fieldStatus = (key: string) =>
    fieldErrors[key]
      ? { type: 'error' as const, message: fieldErrors[key] }
      : undefined
  const fieldBlock = (key: string, children: ReactNode, hasStatus = false) => (
    <div
      data-form-field={key}
      role="group"
      aria-invalid={!!fieldErrors[key] || undefined}
    >
      {children}
      {!hasStatus && fieldErrors[key] && (
        <p className="wb-error">{fieldErrors[key]}</p>
      )}
    </div>
  )
  const titles: Record<FormState['kind'], string> = {
    project: t('创建项目', 'Create project'),
    task: t('新建任务', 'New task'),
    model: t('添加模型', 'Add model'),
    backend: t('添加会话后端', 'Add backend'),
    run: t('确认资料与运行资源', 'Review context & resources'),
    test: t('测试模型连接', 'Test model connection'),
    check: t('检查本机后端', 'Check local backend'),
    revoke: t('撤销后端连接', 'Revoke backend'),
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (operationBusy.current) return
    if (state.kind === 'test' && modelTest.phase !== 'ready') return
    if (state.kind === 'run' && contextChanged) return
    const validation = validateFormDraft(
      state.kind,
      draft,
      data,
      t,
      state.kind === 'run' ? step : 2,
      state.kind === 'task'
        ? {
            projectAvailable:
              data.capabilities.project_references === true
                ? Boolean(
                    projectId &&
                    taskProjectRefs.value?.selected.some(
                      (item) => item.project.id === projectId,
                    ) &&
                    !taskProjectRefs.error,
                  )
                : undefined,
          }
        : undefined,
    )
    if (
      state.kind === 'task' &&
      data.capabilities.project_references === true &&
      projectId
    ) {
      if (projectReferenceBusy)
        validation.project_id = t(
          '项目引用仍在读取，请稍后确认。',
          'Project references are still loading. Try again when verified.',
        )
      else if (projectReferenceError)
        validation.project_id = t(
          '项目引用尚未验证，请重试读取。',
          'Project references could not be verified. Retry the project read.',
        )
    }
    setFieldErrors(validation)
    if (Object.keys(validation).length) {
      if (state.kind === 'run' && validation.context_hash) {
        setContextChanged(true)
        setConsent(false)
      }
      setError(t('请检查标记的字段', 'Check the marked fields'))
      focusFirstError(validation)
      return
    }
    if (state.kind === 'run' && step < 2) {
      setStep(step + 1)
      return
    }
    setFormBusy(true)
    setError('')
    let taskValidationTimer: ReturnType<typeof setTimeout> | undefined
    let projectValidationFailed = false
    let projectValidationTimedOut = false
    try {
      if (state.kind === 'project') {
        await post<Project>('/projects', { name, directory, goal, notes })
      } else if (state.kind === 'task') {
        taskValidationRequest.current?.abort()
        const controller = new AbortController()
        taskValidationRequest.current = controller
        if (data.capabilities.project_references === true) {
          if (!projectId) {
            setFieldErrors((current) => ({
              ...current,
              project_id: t('请选择有效项目', 'Select an available project'),
            }))
            setError(t('请先确认项目', 'Confirm a project before saving'))
            setFormBusy(false)
            return
          }
          const baseline = latestFingerprint.current
          projectValidationFailed = true
          setCheckingTaskProject(true)
          taskValidationTimer = setTimeout(() => {
            projectValidationTimedOut = true
            controller.abort()
          }, 15_000)
          await validateProjectSelection([projectId], controller.signal)
          if (!mounted.current) return
          controller.signal.throwIfAborted()
          if (baseline !== latestFingerprint.current)
            throw new Error('task_project_candidate_changed')
          clearTimeout(taskValidationTimer)
          taskValidationTimer = undefined
          setCheckingTaskProject(false)
          projectValidationFailed = false
        }
        if (!mounted.current || controller.signal.aborted) return
        const task = await post<Task>('/tasks', {
          project_id: projectId,
          title: name,
          goal,
          acceptance,
          files: splitFiles(files),
        })
        await onSaved()
        saved.current = true
        if (confirmWorkbenchNavigation()) {
          onClose()
          return
        }
        onClose()
        onTask(task)
        return
      } else if (state.kind === 'model') {
        await post('/models', { name, endpoint, model, key_env: keyEnv })
      } else if (state.kind === 'backend') {
        await post('/backends', { name, endpoint })
      } else if (state.kind === 'run') {
        if (!consent) return
        const run = await post<{ id: string }>(`/tasks/${state.task.id}/runs`, {
          ...routing,
          ...limits,
          consent: true,
          context_hash: (runSnapshot ?? state.snapshot).context_hash,
          request_id: requestId,
        })
        await onSaved()
        saved.current = true
        if (!confirmWorkbenchNavigation()) onRun(run.id)
        onClose()
        return
      } else if (state.kind === 'test') {
        if (!consent) return
        setModelTest((previous) => ({ ...previous, phase: 'running' }))
        setConsent(false)
        const result = await startModelTest(state.model.id, modelTest.requestId)
        const next = modelTestReceipt(modelTest, result, state.model.id)
        setModelTest(next)
        saved.current = next.phase === 'succeeded' || next.phase === 'failed'
        await onSaved().catch((reason) =>
          setError(
            `${t('测试回执已确认，但列表刷新失败', 'Test receipt confirmed, but list refresh failed')}: ${reason instanceof Error ? reason.message : String(reason)}`,
          ),
        )
        if (saved.current && confirmWorkbenchNavigation()) onClose()
        return
      } else if (state.kind === 'check') {
        if (!consent) return
        await post(`/backends/${state.backend.id}/check`, { consent: true })
      } else {
        if (!consent) return
        await post(`/backends/${state.backend.id}/revoke`)
      }
      await onSaved()
      saved.current = true
      confirmWorkbenchNavigation()
      onClose()
    } catch (reason) {
      if (!mounted.current) return
      if (projectValidationFailed) {
        const message = projectValidationTimedOut
          ? t(
              '项目确认超时，任务尚未保存。请重试读取。',
              'Project validation timed out. The task was not saved. Retry the read.',
            )
          : t(
              '项目引用未通过确认，任务尚未保存，输入已保留。',
              'Project references could not be confirmed. The task was not saved; your input is kept.',
            )
        setFieldErrors((current) => ({ ...current, project_id: message }))
        setError(message)
        return
      }
      if (state.kind === 'test') {
        setModelTest((previous) => unknownModelTest(previous))
        setConsent(false)
      }
      if (reason instanceof ApiError) {
        const serverErrors = serverFormErrors(reason)
        setFieldErrors(serverErrors)
        focusFirstError(serverErrors)
      }
      if (state.kind === 'run' && isContextChangedError(reason)) {
        setContextChanged(true)
        setConsent(false)
      }
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (taskValidationTimer) clearTimeout(taskValidationTimer)
      if (mounted.current) {
        setCheckingTaskProject(false)
        setFormBusy(false)
      }
    }
  }
  async function checkModelTestReceipt() {
    if (operationBusy.current || state.kind !== 'test' || !modelTest.requestId)
      return
    setFormBusy(true)
    setError('')
    try {
      const result = await readModelTest(state.model.id, modelTest.requestId)
      const next = modelTestReceipt(modelTest, result, state.model.id)
      setModelTest(next)
      setConsent(false)
      saved.current = next.phase === 'succeeded' || next.phase === 'failed'
      await onSaved().catch((reason) =>
        setError(
          `${t('测试回执已确认，但列表刷新失败', 'Test receipt confirmed, but list refresh failed')}: ${reason instanceof Error ? reason.message : String(reason)}`,
        ),
      )
    } catch (reason) {
      setModelTest((previous) => unknownModelTest(previous))
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setFormBusy(false)
    }
  }
  async function recheckContext() {
    if (operationBusy.current || state.kind !== 'run') return
    setFormBusy(true)
    setRechecking(true)
    setError('')
    setConsent(false)
    try {
      const snapshot = await post<Snapshot>(`/tasks/${state.task.id}/preview`)
      const next = recheckedRunContext(
        {
          snapshot: runSnapshot ?? state.snapshot,
          step,
          consent,
          routing,
          limits,
          requestId,
        },
        snapshot,
      )
      setRunSnapshot(next.snapshot)
      setStep(next.step)
      setConsent(next.consent)
      setContextChanged(false)
      clearFieldError('context_hash')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRechecking(false)
      setFormBusy(false)
    }
  }
  const field = (
    key: string,
    label: string,
    value: string,
    change: (value: string) => void,
    required = true,
    maxLength = 100,
    placeholder?: string,
  ) =>
    fieldBlock(
      key,
      <AppInput
        label={label}
        value={value}
        onChange={(value) => {
          clearFieldError(key)
          change(value)
        }}
        isRequired={required}
        maxLength={maxLength}
        placeholder={placeholder}
        isDisabled={busy}
        status={fieldStatus(key)}
      />,
      true,
    )
  let content: ReactNode
  let submitLabel = t('保存', 'Save')
  let disabled = false
  if (state.kind === 'project') {
    content = (
      <>
        {field('name', t('项目名称', 'Project name'), name, setName)}
        {field(
          'directory',
          t('相对目录', 'Relative directory'),
          directory,
          setDirectory,
          false,
          400,
        )}
        <p className="wb-hint">
          {t('服务端工作区', 'Server workspace')} <code>{data.workspace}</code>
        </p>
        {fieldBlock(
          'goal',
          <AppTextArea
            label={t('项目目标', 'Project goal')}
            value={goal}
            onChange={(value) => {
              clearFieldError('goal')
              setGoal(value)
            }}
            status={fieldStatus('goal')}
            rows={2}
            maxLength={4000}
          />,
          true,
        )}
        {fieldBlock(
          'notes',
          <AppTextArea
            label={t(
              '允许提供给模型的项目资料',
              'Project notes allowed for models',
            )}
            value={notes}
            onChange={(value) => {
              clearFieldError('notes')
              setNotes(value)
            }}
            status={fieldStatus('notes')}
            rows={3}
            maxLength={16000}
          />,
          true,
        )}
      </>
    )
  } else if (state.kind === 'task') {
    submitLabel = t('保存任务并检查资料', 'Save task & review context')
    content = (
      <>
        {fieldBlock(
          'project_id',
          data.capabilities.project_references === true ? (
            <ProjectTaskPicker
              data={data}
              refreshRevision={refreshRevision}
              value={projectId}
              selection={taskProjectRefs}
              t={t}
              onChange={(value) => {
                clearFieldError('project_id')
                setProjectId(value)
              }}
              onCreateProject={
                onCreateProject
                  ? () => requestDiscard(onCreateProject)
                  : undefined
              }
              disabled={busy}
            />
          ) : (
            <AppSelect
              label={t('项目', 'Project')}
              value={projectId}
              options={data.projects.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(value) => {
                clearFieldError('project_id')
                setProjectId(value)
              }}
            />
          ),
        )}
        {data.capabilities.project_references === true && projectId && (
          <>
            {projectReferenceBusy && (
              <p className="wb-hint" role="status">
                {t('正在确认项目引用…', 'Verifying project references...')}
              </p>
            )}
            {projectReferenceError && (
              <p className="wb-error" role="alert">
                {t(
                  '项目引用尚未验证，请重试读取。',
                  'Project references could not be verified. Retry the project read.',
                )}
              </p>
            )}
            {(projectReferenceError || fieldErrors.project_id) && (
              <AppButton
                label={t('重试项目引用', 'Retry project references')}
                icon={<RefreshCw size={15} />}
                onClick={() => {
                  clearFieldError('project_id')
                  taskProjectRefs.retry()
                }}
                disabled={busy}
              />
            )}
          </>
        )}
        {field('title', t('任务名称', 'Task title'), name, setName, true, 160)}
        {fieldBlock(
          'goal',
          <AppTextArea
            label={t('任务目标', 'Objective')}
            value={goal}
            onChange={(value) => {
              clearFieldError('goal')
              setGoal(value)
            }}
            status={fieldStatus('goal')}
            rows={3}
            isRequired
            maxLength={8000}
            description={t('至少 8 个字符', 'At least 8 characters')}
          />,
          true,
        )}
        {fieldBlock(
          'acceptance',
          <AppTextArea
            label={t('验收要求', 'Acceptance criteria')}
            value={acceptance}
            onChange={(value) => {
              clearFieldError('acceptance')
              setAcceptance(value)
            }}
            status={fieldStatus('acceptance')}
            rows={2}
            maxLength={4000}
          />,
          true,
        )}
        {fieldBlock(
          'files',
          <AppTextArea
            label={t('明确选择的文件', 'Explicit file selection')}
            value={files}
            onChange={(value) => {
              clearFieldError('files')
              setFiles(value)
            }}
            status={fieldStatus('files')}
            rows={3}
            placeholder={'README.md\ndocs/IMPLEMENTATION_PLAN.md'}
            description={t(
              '相对项目目录，每行一个，最多 10 个；不会自动扫描。',
              'Relative to project directory, one per line, up to 10. No automatic scanning.',
            )}
          />,
          true,
        )}
      </>
    )
  } else if (state.kind === 'model') {
    content = (
      <>
        <div className="wb-inline">
          <AppButton
            label={t('本机推理', 'Local inference')}
            size="sm"
            onClick={() => {
              setEndpoint('http://127.0.0.1:11434/v1')
              if (!name) setName('Local model')
            }}
          />
          <AppButton
            label={t('远程 API', 'Remote API')}
            size="sm"
            onClick={() => setEndpoint('https://')}
          />
        </div>
        {field(
          'name',
          t('配置名称', 'Configuration name'),
          name,
          setName,
          true,
          80,
        )}
        {field(
          'endpoint',
          t('API 基础地址', 'API base URL'),
          endpoint,
          setEndpoint,
          true,
          500,
          'http://127.0.0.1:11434/v1',
        )}
        {field('model', t('模型标识', 'Model ID'), model, setModel, true, 150)}
        {field(
          'key_env',
          t('密钥环境变量名', 'Key environment variable'),
          keyEnv,
          setKeyEnv,
          false,
          100,
          'WORKBENCH_MODEL_REMOTE_KEY',
        )}
        <p className="wb-hint">
          {t(
            '只填变量名，不填写密钥。保存不调用模型；远程 API 必须使用 HTTPS。',
            'Enter a variable name, never the key. Saving makes no model request. Remote APIs require HTTPS.',
          )}
        </p>
      </>
    )
  } else if (state.kind === 'backend') {
    content = (
      <>
        {field(
          'name',
          t('连接名称', 'Connection name'),
          name,
          setName,
          true,
          80,
        )}
        {field(
          'endpoint',
          t('本机服务地址', 'Local service origin'),
          endpoint,
          setEndpoint,
          true,
          200,
          'http://127.0.0.1:8000',
        )}
        <p className="wb-hint">
          {t(
            '仅支持回环 IP。保存不联网、不携带凭证，也不启动上游服务。',
            'Loopback IPs only. Saving makes no network request, reads no credentials and starts no upstream service.',
          )}
        </p>
      </>
    )
  } else if (state.kind === 'run') {
    const snapshot = runSnapshot ?? state.snapshot
    submitLabel = t('确认并开始运行', 'Confirm & start run')
    disabled = contextChanged
    const used = data.models.filter((item) =>
      Object.values(routing).includes(item.id),
    )
    content = (
      <>
        <div className="wb-notice">
          <ShieldCheck size={18} />
          <span>
            {t(
              '只读研究 · 工作台未提供 Shell、代码写入或部署入口',
              'Read-only research · Workbench exposes no shell, code-write or deployment controls',
            )}
          </span>
        </div>
        <div
          className="wb-wizard-steps"
          aria-label={t('运行确认步骤', 'Run review steps')}
        >
          {[
            t('资料范围', 'Context'),
            t('模型与资源', 'Resources'),
            t('确认运行', 'Confirm'),
          ].map((label, index) => (
            <div key={label} aria-current={step === index ? 'step' : undefined}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>
        <div hidden={step !== 0} className="wb-wizard-section">
          <strong>{state.task.title}</strong>
          <p className="wb-muted">{state.task.goal}</p>
          {fieldBlock(
            'context_hash',
            <details className="wb-disclosure" open>
              <summary>
                {t('实际发送资料', 'Exact context')} ·{' '}
                {snapshot.evidence.length} {t('个文件', 'files')} ·{' '}
                {snapshot.bytes} bytes
              </summary>
              <pre>{JSON.stringify(snapshot, null, 2)}</pre>
            </details>,
          )}
          {!snapshot.evidence.length && (
            <p className="wb-hint">
              {t(
                '未选择文件，模型只能获得任务和项目资料，不能分析未提供的源码。',
                'No files selected. Models receive only the task and project notes, not repository source.',
              )}
            </p>
          )}
        </div>
        <div hidden={step !== 1} className="wb-wizard-section">
          {!data.models.length && (
            <p className="wb-error">
              {t(
                '请先保存模型配置，任务已保留。',
                'Add a model configuration first. Your task is saved.',
              )}{' '}
              <a href="#models">{t('前往模型设置', 'Open model settings')}</a>
            </p>
          )}
          {(
            [
              ['coordinator_model', t('规划', 'Planning')],
              ['researcher_model', t('研究', 'Research')],
              ['reviewer_model', t('汇总', 'Synthesis')],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              {fieldBlock(
                key,
                <AppSelect
                  label={label}
                  value={routing[key]}
                  options={data.models.map((item) => ({
                    value: item.id,
                    label: `${item.name} · ${item.model}`,
                  }))}
                  onChange={(value) => {
                    setRouting({ ...routing, [key]: value })
                    clearFieldError(key)
                    setConsent(false)
                  }}
                />,
              )}
            </div>
          ))}
          <div className="wb-form-grid">
            {fieldBlock(
              'max_calls',
              <AppNumber
                label={t('调用总上限', 'Call budget')}
                value={limits.max_calls}
                onChange={(value) => {
                  clearFieldError('max_calls')
                  setConsent(false)
                  setLimits({ ...limits, max_calls: value })
                }}
                status={fieldStatus('max_calls')}
                min={3}
                max={8}
              />,
              true,
            )}
            {fieldBlock(
              'parallel',
              <AppNumber
                label={t('研究并行上限', 'Research concurrency')}
                value={limits.parallel}
                onChange={(value) => {
                  clearFieldError('parallel')
                  setConsent(false)
                  setLimits({ ...limits, parallel: value })
                }}
                status={fieldStatus('parallel')}
                min={1}
                max={2}
              />,
              true,
            )}
            {fieldBlock(
              'minutes',
              <AppNumber
                label={t('运行时限（分钟）', 'Time limit (min)')}
                value={limits.minutes}
                onChange={(value) => {
                  clearFieldError('minutes')
                  setConsent(false)
                  setLimits({ ...limits, minutes: value })
                }}
                status={fieldStatus('minutes')}
                min={1}
                max={30}
              />,
              true,
            )}
            {fieldBlock(
              'max_output_tokens',
              <AppNumber
                label={t('每次输出 Token 上限', 'Output tokens per call')}
                value={limits.max_output_tokens}
                onChange={(value) => {
                  clearFieldError('max_output_tokens')
                  setConsent(false)
                  setLimits({ ...limits, max_output_tokens: value })
                }}
                status={fieldStatus('max_output_tokens')}
                min={256}
                max={4096}
                step={1}
              />,
              true,
            )}
          </div>
          {used.some((item) => item.kind === 'codex_cli') && (
            <p className="wb-hint">
              {t(
                'Codex CLI 实际单通道执行；输出 Token 不是 CLI 硬限制，底层工具隔离尚未完整验收。',
                'Codex CLI runs in a single channel. Output tokens are not a CLI hard ceiling; underlying tool isolation is not fully verified.',
              )}
            </p>
          )}
        </div>
        <div hidden={step !== 2} className="wb-wizard-section">
          <div className="wb-send-targets">
            <small>{t('发送目标', 'Send to')}</small>
            {used.map((item) => (
              <p key={item.id}>
                <strong>{item.name}</strong> <code>{item.endpoint}</code>
              </p>
            ))}
          </div>
          <dl className="wb-details">
            <dt>{t('任务', 'Task')}</dt>
            <dd>{state.task.title}</dd>
            <dt>{t('文件', 'Files')}</dt>
            <dd>{snapshot.evidence.length}</dd>
            <dt>{t('新增调用上限', 'Call budget')}</dt>
            <dd>{limits.max_calls}</dd>
            <dt>{t('研究并行上限', 'Research concurrency')}</dt>
            <dd>
              {used.some((item) => item.kind === 'codex_cli')
                ? 1
                : limits.parallel}
            </dd>
            <dt>{t('执行时限', 'Time limit')}</dt>
            <dd>{limits.minutes} min</dd>
          </dl>
          {fieldBlock(
            'consent',
            <AppCheckbox
              label={t(
                '我确认将上述资料发送给所选模型，可能产生费用。金额未知不等于免费。',
                'I consent to sending this context to the selected models. Charges may apply; unknown cost is not free.',
              )}
              value={consent}
              onChange={(value) => {
                clearFieldError('consent')
                setConsent(value)
              }}
            />,
          )}
        </div>
      </>
    )
  } else if (state.kind === 'test') {
    submitLabel = t('确认测试', 'Confirm test')
    disabled = !consent || modelTest.phase !== 'ready'
    content = (
      <>
        <strong>{state.model.name}</strong>
        <code className="wb-wrap">
          {state.model.endpoint} · {state.model.model}
        </code>
        <p>
          {t(
            '发送一次最小模型请求，可能产生费用。可达不代表工具能力或认证范围已通过验收。',
            'Sends one minimal model request; charges may apply. Reachability does not verify tool capability or authorization scope.',
          )}
        </p>
        <p className="wb-hint">
          {t('测试请求 ID', 'Test request ID')}{' '}
          <code>
            {modelTest.requestId ||
              t('旧记录未提供', 'Not provided by legacy record')}
          </code>
        </p>
        {modelTest.phase === 'ready' &&
          fieldBlock(
            'consent',
            <AppCheckbox
              label={t(
                '确认发起一次真实模型请求',
                'Confirm one real model request',
              )}
              value={consent}
              onChange={(value) => {
                clearFieldError('consent')
                setConsent(value)
              }}
            />,
          )}
        {modelTest.phase !== 'ready' && (
          <div role="status">
            <AppBadge tone={modelTestTone(modelTest)}>
              {modelTest.phase === 'succeeded'
                ? t('连接测试成功', 'Connection test succeeded')
                : modelTest.phase === 'failed'
                  ? t('连接测试失败', 'Connection test failed')
                  : modelTest.phase === 'running'
                    ? t('测试进行中', 'Test in progress')
                    : t('测试结果未知', 'Test outcome unknown')}
            </AppBadge>
            <p>
              <code>
                {modelTest.receipt?.status ??
                  modelTest.legacyStatus ??
                  'model_test_outcome_unknown'}
              </code>
            </p>
            <p className="wb-muted">
              {t(
                '回执检查只读取记录，不会重新调用模型。停止等待不代表服务端已停止，未知用量或金额不代表免费。',
                'Checking the receipt only reads its record; it never calls the model again. Stopping the wait does not stop the server; unknown usage or cost is not free.',
              )}
            </p>
            {modelTest.receipt && (
              <dl className="wb-details">
                <dt>{t('输入 Token', 'Input tokens')}</dt>
                <dd>
                  {modelTest.receipt.input_tokens ?? t('未知', 'Unknown')}
                </dd>
                <dt>{t('输出 Token', 'Output tokens')}</dt>
                <dd>
                  {modelTest.receipt.output_tokens ?? t('未知', 'Unknown')}
                </dd>
              </dl>
            )}
            <AppButton
              label={t('检查测试回执', 'Check test receipt')}
              icon={<RefreshCw size={16} />}
              onClick={() => void checkModelTestReceipt()}
              disabled={busy || !modelTest.requestId}
            />
            {modelTest.phase === 'unknown' && (
              <AppCheckbox
                label={t(
                  '我已知上次测试结果或费用未知，新测试可能重复计费',
                  'I understand the previous outcome or cost is unknown; a new test may incur duplicate charges',
                )}
                value={replayAcknowledged}
                onChange={setReplayAcknowledged}
              />
            )}
            <AppButton
              label={t('准备新测试', 'Prepare new test')}
              onClick={() => {
                const next = prepareModelTest(
                  modelTest,
                  crypto.randomUUID(),
                  replayAcknowledged,
                )
                saved.current = false
                setModelTest(next)
                setConsent(false)
                setReplayAcknowledged(false)
                setError('')
                setFieldErrors({})
              }}
              disabled={
                busy || !canPrepareModelTest(modelTest, replayAcknowledged)
              }
            />
          </div>
        )}
        {!!modelTest.previous.length && (
          <details className="wb-disclosure">
            <summary>
              {t('此前测试', 'Previous tests')} · {modelTest.previous.length}
            </summary>
            {modelTest.previous.map((attempt) => (
              <p key={attempt.requestId}>
                <code>{attempt.requestId}</code> · {attempt.phase}{' '}
                {attempt.status ?? ''}
              </p>
            ))}
          </details>
        )}
      </>
    )
  } else {
    const revoke = state.kind === 'revoke'
    submitLabel = revoke
      ? t('确认撤销', 'Confirm revocation')
      : t('确认检查', 'Confirm check')
    disabled = !consent
    content = (
      <>
        <strong>{state.backend.name}</strong>
        <code className="wb-wrap">{state.backend.endpoint}</code>
        <p>
          {revoke
            ? t(
                '撤销后禁止检查与读取缓存。历史连接记录保留。',
                'Revocation blocks checks and cached reads. The connection record is retained.',
              )
            : t(
                '仅发送一次 GET /api/health，不带凭证、不读取会话、不调用模型。可达不代表读取权限已验证。',
                'Sends one GET /api/health. No credentials, conversation reads or model calls. Reachability is not verified read permission.',
              )}
        </p>
        {fieldBlock(
          'consent',
          <AppCheckbox
            label={
              revoke
                ? t('确认撤销此连接', 'Confirm revoking this connection')
                : t(
                    '确认向此本机地址发送健康检查',
                    'Confirm checking this local origin',
                  )
            }
            value={consent}
            onChange={(value) => {
              clearFieldError('consent')
              setConsent(value)
            }}
          />,
        )}
      </>
    )
  }
  return (
    <>
      <AppDialog
        title={titles[state.kind]}
        onClose={requestClose}
        closeLabel={t('关闭', 'Close')}
        busy={busy || discardOpen}
      >
        <form ref={formRef} noValidate className="wb-form" onSubmit={submit}>
          <fieldset disabled={busy} className="wb-form-fields">
            {content}
          </fieldset>
          {checkingTaskProject && (
            <p className="wb-hint" role="status">
              {t('正在确认任务项目…', 'Confirming task project...')}
            </p>
          )}
          {error && (
            <p className="wb-error" role="alert">
              {error}
            </p>
          )}
          {state.kind === 'run' && contextChanged && (
            <div className="wb-notice" role="status">
              <span>
                {t(
                  '资料在预览后发生变化。模型与资源设置已保留，需重新检查资料并再次确认。',
                  'Context changed after preview. Your models and resources are preserved; recheck the context and confirm again.',
                )}
              </span>
              <AppButton
                label={t('重新检查资料', 'Recheck context')}
                icon={<RefreshCw size={16} />}
                onClick={() => void recheckContext()}
                busy={rechecking}
                disabled={busy}
              />
            </div>
          )}
          <div className="wb-form-actions">
            <AppButton
              label={t('关闭', 'Close')}
              tone="ghost"
              onClick={requestClose}
              disabled={busy}
            />
            {state.kind === 'run' && step > 0 && (
              <AppButton
                label={t('上一步', 'Back')}
                icon={<ArrowLeft size={16} />}
                onClick={() => {
                  setConsent(false)
                  setStep(step - 1)
                }}
                disabled={busy}
              />
            )}
            <AppButton
              label={
                state.kind === 'run' && step < 2
                  ? t('下一步', 'Next')
                  : submitLabel
              }
              type="submit"
              tone={state.kind === 'revoke' ? 'destructive' : 'primary'}
              busy={busy}
              disabled={disabled}
              icon={
                state.kind === 'run' || state.kind === 'task' ? (
                  <ArrowRight size={16} />
                ) : state.kind === 'test' || state.kind === 'check' ? (
                  <Check size={16} />
                ) : (
                  <Save size={16} />
                )
              }
            />
          </div>
        </form>
      </AppDialog>
      {discardOpen && (
        <AppDraftGuard
          title={t('放弃未保存的更改？', 'Discard unsaved changes?')}
          description={t(
            unmanagedNavigation
              ? '浏览器已进入未受管理的历史记录，无法安全还原其位置。草稿仍保留；继续编辑不会改写该记录，确认放弃后才显示此目标。'
              : state.kind === 'test' &&
                  ['running', 'unknown'].includes(modelTest.phase)
                ? '测试结果尚未确认。关闭不会重发请求，当前会话保留回执 ID。'
                : '当前草稿尚未保存。放弃后无法恢复这些输入。',
            unmanagedNavigation
              ? 'The browser reached an unmanaged history entry, so its position cannot be safely restored. The draft is retained. Keeping it does not rewrite that entry; discarding admits the current target.'
              : state.kind === 'test' &&
                  ['running', 'unknown'].includes(modelTest.phase)
                ? 'The test outcome is not confirmed. Closing does not resend it; this session retains the receipt ID.'
                : 'This draft has not been saved. Discarding it removes these inputs.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃更改', 'Discard changes')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            pendingDiscard.current = null
            setDiscardOpen(false)
          }}
          onDiscard={() => {
            const action = pendingDiscard.current
            pendingDiscard.current = null
            setDiscardOpen(false)
            action?.()
          }}
        />
      )}
    </>
  )
}
