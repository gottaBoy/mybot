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
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import {
  AppButton,
  AppBadge,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppLoading,
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
import {
  executeTaskTurn,
  fetchTaskTurn,
  prepareTaskTurn,
  previewTaskTurn,
  assertTaskTurnReceipt,
  discardTaskTurn,
  type TaskTurn,
  type TurnPreparation,
} from './task-turns'
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
import { useRunWorkflow } from './useRunWorkflow'
import { TaskArtifactPicker } from './TaskArtifactPicker'
import { artifactRefs } from './task-artifacts'
import { useTaskPlan } from './useTaskPlan'
import { admitTaskPlanScope, sameTaskPlanScope } from './task-plan-scope'

export type FormState =
  | { kind: 'project' }
  | { kind: 'task'; projectId?: string }
  | { kind: 'model' }
  | { kind: 'backend' }
  | { kind: 'run'; task: Task; snapshot: Snapshot; turn?: TaskTurn }
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
  const [modelKind, setModelKind] = useState<'chat_completions' | 'pi_sdk'>(
    'chat_completions',
  )
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
  const [turn, setTurn] = useState<TaskTurn | undefined>(
    state.kind === 'run' ? state.turn : undefined,
  )
  const [turnUncertain, updateTurnUncertainty] = useState(false)
  const turnUncertainRef = useRef(false)
  function setTurnUncertain(value: boolean) {
    turnUncertainRef.current = value
    updateTurnUncertainty(value)
  }
  const [prepareOnly, setPrepareOnly] = useState(false)
  const [checkingTurn, setCheckingTurn] = useState(false)
  const turnLocked = Boolean(turn?.candidate || turnUncertain)
  const workflowEnabled =
    state.kind === 'run' && data.capabilities.workflow_versions === true
  const workflow = useRunWorkflow({
    enabled: workflowEnabled,
    locked: turnLocked,
    initial:
      state.kind === 'run'
        ? state.turn?.candidate?.snapshot.workflow
        : undefined,
  })
  useEffect(() => {
    if (state.kind !== 'run' || !state.turn?.candidate) return
    const config = state.turn.candidate.config
    setRouting({
      coordinator_model: config.coordinator_model,
      researcher_model: config.researcher_model,
      reviewer_model: config.reviewer_model,
    })
    setLimits({
      max_calls: config.max_calls,
      parallel: config.parallel,
      minutes: config.minutes,
      max_output_tokens: config.max_output_tokens,
    })
  }, [])
  const [consent, setConsent] = useState(false)
  const [runSnapshot, setRunSnapshot] = useState(
    state.kind === 'run' ? state.snapshot : undefined,
  )
  const [artifactSelectionPending, setArtifactSelectionPending] =
    useState(false)
  const referencesUnsupported =
    Boolean(runSnapshot?.artifacts?.length) &&
    data.capabilities.task_artifact_references !== true
  const [contextChanged, setContextChanged] = useState(false)
  const [scopeRefresh, setScopeRefresh] = useState(0)
  const [discardTurnOpen, setDiscardTurnOpen] = useState(false)
  const planScopeRead = useTaskPlan(
    state.kind === 'run' ? state.task.id : '',
    state.kind === 'run' && data.capabilities.nested_task_plans === true,
    scopeRefresh,
    data.capabilities.task_plan_revisions === true,
    data.capabilities.nested_task_plans === true,
  )
  useEffect(() => {
    setScopeRefresh((value) => value + 1)
  }, [data])
  const snapshotScope = runSnapshot?.task_plan_scope
  const currentScope =
    planScopeRead.value?.schema_version === 3
      ? {
          schema_version: 1 as const,
          task_id: planScopeRead.value.task_id,
          scope_hash: planScopeRead.value.gate.scope_hash,
        }
      : undefined
  const planScopeMismatch = Boolean(
    planScopeRead.value && !sameTaskPlanScope(snapshotScope, currentScope),
  )
  const planScopeBlocked =
    state.kind === 'run' &&
    ((snapshotScope !== undefined &&
      data.capabilities.nested_task_plans !== true) ||
      (planScopeRead.enabled &&
        (planScopeRead.busy ||
          !!planScopeRead.error ||
          !planScopeRead.value ||
          planScopeRead.blocked ||
          planScopeMismatch)))
  useEffect(() => {
    if (planScopeMismatch) {
      setConsent(false)
      if (!turn?.candidate) setContextChanged(true)
    }
  }, [planScopeMismatch])
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
  const turnReceiptRequest = useRef<AbortController | null>(null)
  const pendingPreparation = useRef<TurnPreparation | null>(null)
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
    modelKind,
    keyEnv,
    routing,
    limits,
    consent,
    snapshotHash: runSnapshot?.context_hash ?? '',
    workflowVersion: workflow.version,
  }
  const fingerprint = formDraftFingerprint(state.kind, draft)
  const latestFingerprint = useRef(fingerprint)
  latestFingerprint.current = fingerprint
  const initialFingerprint = useRef(fingerprint)
  const dirty =
    !saved.current &&
    (fingerprint !== initialFingerprint.current ||
      (state.kind === 'test' &&
        ['running', 'unknown'].includes(modelTest.phase)) ||
      turnUncertain ||
      artifactSelectionPending)
  const guardState = useRef({ dirty, busy })
  guardState.current = { dirty, busy: busy || turnUncertain }
  function setFormBusy(value: boolean) {
    operationBusy.current = value
    guardState.current.busy = value || turnUncertainRef.current
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
        busy:
          !saved.current && (operationBusy.current || turnUncertainRef.current),
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
      turnReceiptRequest.current?.abort()
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
    if (state.kind === 'run' && turnUncertain) return
    if (state.kind === 'run' && workflow.blocked) return
    if (
      state.kind === 'run' &&
      (planScopeBlocked || turn?.state === 'discarded')
    )
      return
    if (
      state.kind === 'run' &&
      (artifactSelectionPending || referencesUnsupported)
    )
      return
    if (prepareOnly && data.capabilities.device_execution_delegation !== true)
      return
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
    if (
      state.kind === 'model' &&
      modelKind === 'pi_sdk' &&
      data.capabilities.pi_sdk !== true
    )
      validation.kind = t(
        'Pi SDK 运行环境不可用。',
        'The Pi SDK runtime is unavailable.',
      )
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
        if (modelKind === 'pi_sdk' && data.capabilities.pi_sdk !== true)
          throw new Error('pi_sdk_not_available')
        await post('/models', {
          name,
          endpoint,
          model,
          key_env: keyEnv,
          kind: modelKind,
        })
      } else if (state.kind === 'backend') {
        await post('/backends', { name, endpoint })
      } else if (state.kind === 'run') {
        if (!consent) return
        if (turn) {
          setConsent(false)
          let preparedTurn = turn
          try {
            if (!preparedTurn.candidate) {
              setTurnUncertain(true)
              const preparation = {
                ...routing,
                ...limits,
                context_hash: (runSnapshot ?? state.snapshot).context_hash,
                ...((runSnapshot ?? state.snapshot).artifacts?.length
                  ? {
                      artifact_refs: artifactRefs(
                        (runSnapshot ?? state.snapshot).artifacts,
                      ),
                    }
                  : {}),
                ...(workflowEnabled
                  ? { workflow_version: workflow.version }
                  : {}),
              }
              pendingPreparation.current = preparation
              preparedTurn = await prepareTaskTurn(
                state.task.id,
                turn.id,
                preparation,
              )
              assertTaskTurnReceipt(preparedTurn, turn, preparation)
              setTurn(preparedTurn)
              pendingPreparation.current = null
              setTurnUncertain(false)
            }
            if (!preparedTurn.candidate)
              throw new Error('task_turn_preparation_missing')
            if (preparedTurn.state === 'discarded') {
              await onSaved()
              saved.current = true
              onClose()
              return
            }
            if (prepareOnly) {
              await onSaved()
              saved.current = true
              confirmWorkbenchNavigation()
              onClose()
              return
            }
            setTurnUncertain(true)
            const applied = await executeTaskTurn(state.task.id, turn.id, {
              candidate_hash: preparedTurn.candidate.candidate_hash,
              consent: true,
            })
            assertTaskTurnReceipt(applied, preparedTurn)
            if (applied.state !== 'applied' || !applied.run_id)
              throw new Error('task_turn_execution_unconfirmed')
            setTurn(applied)
            setTurnUncertain(false)
            await onSaved()
            saved.current = true
            if (!confirmWorkbenchNavigation()) onRun(applied.run_id)
            onClose()
            return
          } catch (reason) {
            if (
              reason instanceof ApiError &&
              [404, 409, 422].includes(reason.status) &&
              reason.details &&
              typeof reason.details === 'object' &&
              [
                'task_artifact_changed',
                'task_artifact_unavailable',
                'task_artifact_too_large',
              ].includes(String((reason.details as { code?: unknown }).code))
            ) {
              setTurnUncertain(false)
              pendingPreparation.current = null
              setStep(0)
              throw new Error(
                t(
                  '引用成果已变化或不可用，请刷新成果并重新选择、核对。',
                  'A referenced artifact changed or is unavailable. Refresh, reselect and review it.',
                ),
              )
            }
            // A rejected HTTP response is confirmed; transport/invalid receipt
            // remains locked until the exact durable turn can be read.
            if (
              reason instanceof ApiError &&
              [400, 403, 404, 422].includes(reason.status)
            )
              setTurnUncertain(false)
            throw reason
          }
        }
        const run = await post<{ id: string }>(`/tasks/${state.task.id}/runs`, {
          ...routing,
          ...limits,
          consent: true,
          context_hash: (runSnapshot ?? state.snapshot).context_hash,
          request_id: requestId,
          ...(workflowEnabled ? { workflow_version: workflow.version } : {}),
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
      if (turnLocked) return
      const snapshot = turn
        ? await previewTaskTurn(
            state.task.id,
            turn.id,
            undefined,
            artifactRefs((runSnapshot ?? state.snapshot).artifacts),
          )
        : admitTaskPlanScope(
            await post<Snapshot>(`/tasks/${state.task.id}/preview`),
            state.task.id,
          )
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
  async function reconcileTurn() {
    if (!turn || state.kind !== 'run' || operationBusy.current) return
    setFormBusy(true)
    setCheckingTurn(true)
    setError('')
    setConsent(false)
    turnReceiptRequest.current?.abort()
    const controller = new AbortController()
    turnReceiptRequest.current = controller
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
      const current = await fetchTaskTurn(
        state.task.id,
        turn.id,
        controller.signal,
      )
      if (!mounted.current || controller.signal.aborted) return
      assertTaskTurnReceipt(
        current,
        turn,
        pendingPreparation.current ?? undefined,
      )
      setTurn(current)
      pendingPreparation.current = null
      setTurnUncertain(false)
      if (current.candidate) {
        const config = current.candidate.config
        setRouting({
          coordinator_model: config.coordinator_model,
          researcher_model: config.researcher_model,
          reviewer_model: config.reviewer_model,
        })
        setLimits({
          max_calls: config.max_calls,
          parallel: config.parallel,
          minutes: config.minutes,
          max_output_tokens: config.max_output_tokens,
        })
        setRunSnapshot(current.candidate.snapshot)
        workflow.restore(current.candidate.snapshot.workflow)
      }
      if (current.state === 'applied' && current.run_id) {
        await onSaved()
        saved.current = true
        if (!confirmWorkbenchNavigation()) onRun(current.run_id)
        onClose()
      } else if (current.state === 'discarded') {
        await onSaved()
        saved.current = true
        onClose()
      }
    } catch (reason) {
      if (!mounted.current) return
      setTurnUncertain(true)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      clearTimeout(timer)
      if (mounted.current) {
        setCheckingTurn(false)
        setFormBusy(false)
      }
    }
  }
  async function discardPreparedTurn() {
    if (
      state.kind !== 'run' ||
      !turn?.candidate ||
      turn.state !== 'prepared' ||
      turnUncertain ||
      operationBusy.current ||
      data.capabilities.task_turn_discard !== true
    )
      return
    setFormBusy(true)
    setDiscardTurnOpen(false)
    setConsent(false)
    setTurnUncertain(true)
    try {
      const discarded = await discardTaskTurn(state.task.id, turn)
      if (!mounted.current) return
      setTurn(discarded)
      setTurnUncertain(false)
      await onSaved()
      saved.current = true
      onClose()
    } catch (reason) {
      if (!mounted.current) return
      setTurnUncertain(true)
      setError(
        t(
          '放弃结果仍待核对，请按原消息读取，不会重发。',
          'The discard outcome is unresolved. Check the original message; it will not be resent.',
        ),
      )
    } finally {
      if (mounted.current) setFormBusy(false)
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
    submitLabel = t('保存并打开任务', 'Save task & open workspace')
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
        {fieldBlock(
          'kind',
          <AppSelect
            label={t('执行方式', 'Execution adapter')}
            value={modelKind}
            options={[
              { value: 'chat_completions', label: 'Chat Completions' },
              ...(data.capabilities.pi_sdk === true || modelKind === 'pi_sdk'
                ? [{ value: 'pi_sdk', label: 'Pi · SDK' }]
                : []),
            ]}
            disabled={busy}
            onChange={(value) => {
              if (
                value === 'chat_completions' ||
                (value === 'pi_sdk' && data.capabilities.pi_sdk === true)
              ) {
                clearFieldError('kind')
                setModelKind(value)
              }
            }}
          />,
        )}
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
    submitLabel = prepareOnly
      ? t('确认并准备下一轮', 'Confirm & prepare next run')
      : t('确认并开始运行', 'Confirm & start run')
    disabled =
      contextChanged ||
      turnUncertain ||
      workflow.blocked ||
      artifactSelectionPending ||
      referencesUnsupported ||
      planScopeBlocked ||
      turn?.state === 'discarded' ||
      (prepareOnly && data.capabilities.device_execution_delegation !== true)
    const used = data.models.filter((item) =>
      Object.values(routing).includes(item.id),
    )
    content = (
      <>
        <div className="wb-notice">
          <ShieldCheck size={18} />
          <span>
            {t(
              '本次为只读研究，不修改代码或执行测试。',
              'This run is read-only research. It does not change code or execute tests.',
            )}
          </span>
        </div>
        {planScopeBlocked && (
          <p role="alert" className="wb-error">
            {t(
              '任务树条件尚未确认或已变化，请重新核对。已准备的原候选只能按原消息核对或显式放弃。',
              'Task tree conditions are unresolved or changed. Review again. A prepared candidate retains its original message identity and can be checked or explicitly discarded.',
            )}
          </p>
        )}
        {turn?.state === 'prepared' &&
          data.capabilities.task_turn_discard === true && (
            <AppButton
              label={t('放弃此轮准备', 'Discard prepared turn')}
              icon={<Trash2 size={15} />}
              disabled={busy || turnUncertain}
              onClick={() => setDiscardTurnOpen(true)}
            />
          )}
        {!workflowEnabled && workflow.blocked && (
          <p role="alert" className="wb-error">
            {t(
              '当前服务未提供已选工作流版本所需能力，执行已暂停。请恢复连接后重新核对。',
              'This server cannot execute the selected workflow version. Execution is paused; restore the connection and review again.',
            )}
          </p>
        )}
        {turn && (
          <div
            className={`wb-turn-context ${turnUncertain ? 'wb-error' : 'wb-notice'}`}
            role="status"
          >
            <strong>
              {t('本轮补充要求', 'Selected supplemental message')}
            </strong>
            <p className="wb-wrap">{turn.content}</p>
            <p>
              {turnUncertain
                ? t(
                    '请求结果未确认。请查询原记录，勿重复发送。',
                    'The request outcome is unconfirmed. Check the original receipt before sending again.',
                  )
                : turn.candidate
                  ? t(
                      '本轮资料与资源已锁定；开始前仍需确认。',
                      'This turn context and resources are locked. Fresh execution consent is still required.',
                    )
                  : t(
                      '仅发送这条补充要求及下方资料；其他历史消息不会自动发送。',
                      'Only this message and the context below will be sent. Other conversation messages are not automatically included.',
                    )}
            </p>
            <AppButton
              label={t('核对本轮记录', 'Check turn receipt')}
              icon={<RefreshCw size={15} />}
              onClick={() => void reconcileTurn()}
              busy={checkingTurn}
              disabled={busy}
            />
          </div>
        )}
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
          {referencesUnsupported && (
            <p role="alert" className="wb-error">
              {t(
                '服务未提供本轮引用成果所需能力，请恢复连接后核对。',
                'This server cannot admit the selected artifact references. Restore the connection and review again.',
              )}
            </p>
          )}
          {turn && data.capabilities.task_artifact_references === true && (
            <TaskArtifactPicker
              taskId={state.task.id}
              turnId={turn.id}
              turnContent={turn.content}
              snapshot={snapshot}
              locked={turnLocked || busy}
              t={t}
              onBlockedChange={setArtifactSelectionPending}
              onApplied={(next) => {
                setRunSnapshot(next)
                setConsent(false)
                setContextChanged(false)
                clearFieldError('context_hash')
              }}
            />
          )}
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
        <div
          hidden={step !== 1}
          className="wb-wizard-section"
          inert={turnLocked || undefined}
        >
          {workflowEnabled && (
            <div className="wb-workflow-run-binding">
              <AppSelect
                label={t('工作流版本', 'Workflow version')}
                value={
                  workflow.version === null
                    ? 'builtin'
                    : String(workflow.version)
                }
                options={[
                  {
                    value: 'builtin',
                    label: t(
                      '内置流程 · 本次配置',
                      'Built-in flow · run configuration',
                    ),
                  },
                  ...workflow.versions.map((item) => ({
                    value: String(item.version),
                    label: `v${item.version} · ${item.definition.name}`,
                  })),
                  ...(workflow.version !== null &&
                  !workflow.versions.some(
                    (item) => item.version === workflow.version,
                  )
                    ? [
                        {
                          value: String(workflow.version),
                          label: `v${workflow.version} · ${workflow.definition?.name ?? ''}`,
                        },
                      ]
                    : []),
                ]}
                disabled={
                  turnLocked || workflow.busy || Boolean(workflow.error)
                }
                onChange={(value) => {
                  const selected = workflow.choose(value)
                  if (!selected) return
                  if (selected.config) {
                    const config = selected.config
                    setRouting({
                      coordinator_model: config.coordinator_model,
                      researcher_model: config.researcher_model,
                      reviewer_model: config.reviewer_model,
                    })
                    setLimits({
                      max_calls: config.max_calls,
                      parallel: config.parallel,
                      minutes: config.minutes,
                      max_output_tokens: config.max_output_tokens,
                    })
                  }
                  setConsent(false)
                  setFieldErrors({})
                }}
              />
              {workflow.busy && (
                <AppLoading
                  label={t('正在读取发布版本', 'Loading published versions')}
                />
              )}
              {!turnLocked && workflow.total !== undefined && (
                <div
                  className="wb-inline"
                  data-testid="run-workflow-version-pages"
                >
                  <span className="wb-muted">
                    {t('发布版本', 'Published versions')} {workflow.page} /{' '}
                    {workflow.totalPages}
                    {' · '}
                    {workflow.total} {t('项', 'total')}
                  </span>
                  <AppButton
                    label={t('上一页工作流版本', 'Previous workflow versions')}
                    icon={<ChevronLeft size={15} />}
                    iconOnly
                    tone="ghost"
                    disabled={
                      workflow.busy ||
                      Boolean(workflow.error) ||
                      workflow.page <= 1
                    }
                    onClick={() => workflow.changePage(workflow.page - 1)}
                  />
                  <AppButton
                    label={t('下一页工作流版本', 'Next workflow versions')}
                    icon={<ChevronRight size={15} />}
                    iconOnly
                    tone="ghost"
                    disabled={
                      workflow.busy ||
                      Boolean(workflow.error) ||
                      !workflow.hasMore
                    }
                    onClick={() => workflow.changePage(workflow.page + 1)}
                  />
                </div>
              )}
              {workflow.error && (
                <div className="wb-error" role="alert">
                  <p>{workflow.error}</p>
                  <AppButton
                    label={t('重试读取版本', 'Retry versions')}
                    icon={<RefreshCw size={15} />}
                    onClick={workflow.retry}
                  />
                </div>
              )}
              {workflow.definition && (
                <p className="wb-hint">
                  {workflow.definition.name} ·{' '}
                  {t('研究任务上限', 'Research task limit')}:{' '}
                  {workflow.definition.limits.research_tasks}
                </p>
              )}
            </div>
          )}
          <div inert={workflow.version !== null || undefined}>
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
        </div>
        <div hidden={step !== 2} className="wb-wizard-section">
          {turn && data.capabilities.device_execution_delegation === true && (
            <AppSelect
              label={t('本次安排', 'Run arrangement')}
              value={prepareOnly ? 'prepare' : 'start'}
              onChange={(value) => {
                setPrepareOnly(value === 'prepare')
                setConsent(false)
              }}
              options={[
                {
                  value: 'start',
                  label: t('确认后立即启动', 'Start after confirmation'),
                },
                {
                  value: 'prepare',
                  label: t(
                    '仅准备，稍后委托设备或继续确认',
                    'Prepare only; delegate or confirm later',
                  ),
                },
              ]}
            />
          )}
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
            {workflowEnabled && (
              <>
                <dt>{t('工作流', 'Workflow')}</dt>
                <dd>
                  {workflow.version === null
                    ? t(
                        '内置流程 · 本次配置',
                        'Built-in flow · run configuration',
                      )
                    : `v${workflow.version} · ${workflow.definition?.name ?? ''}`}
                </dd>
              </>
            )}
            <dt>{t('文件', 'Files')}</dt>
            <dd>{snapshot.evidence.length}</dd>
            <dt>{t('引用成果', 'Referenced artifacts')}</dt>
            <dd>{snapshot.artifacts?.length ?? 0}</dd>
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
              label={
                prepareOnly
                  ? t(
                      '我确认冻结上述资料与资源，暂不调用模型。',
                      'I confirm freezing this context and these resources without calling a model.',
                    )
                  : t(
                      '我确认将上述资料发送给所选模型，可能产生费用。金额未知不等于免费。',
                      'I consent to sending this context to the selected models. Charges may apply; unknown cost is not free.',
                    )
              }
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
        busy={busy || turnUncertain || discardOpen || discardTurnOpen}
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
                disabled={busy || turnLocked}
              />
            </div>
          )}
          <div className="wb-form-actions">
            <AppButton
              label={t('关闭', 'Close')}
              tone="ghost"
              onClick={requestClose}
              disabled={busy || turnUncertain}
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
      {discardTurnOpen && (
        <AppDialog
          title={t('放弃已准备的下一轮？', 'Discard the prepared next run?')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setDiscardTurnOpen(false)}
        >
          <p>
            {t(
              '消息和原候选凭据会保留，本轮不会执行。后续运行需要新的明确候选。',
              'The message and original candidate receipt remain. This turn will not execute; later work needs a new explicit candidate.',
            )}
          </p>
          <div className="wb-form-actions">
            <AppButton
              label={t('保留准备', 'Keep preparation')}
              onClick={() => setDiscardTurnOpen(false)}
            />
            <AppButton
              label={t('确认放弃此轮准备', 'Confirm prepared turn discard')}
              icon={<Trash2 size={15} />}
              tone="destructive"
              disabled={busy || turnUncertain}
              onClick={() => void discardPreparedTurn()}
            />
          </div>
        </AppDialog>
      )}
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
