import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileSearch,
  FolderGit2,
  GitBranch,
  ListChecks,
  MessageSquare,
  MonitorSmartphone,
  Play,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Workflow,
  Link,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppLoading,
  AppSegments,
  AppTextArea,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { useCompactTaskList } from '../components/ui/useViewport'
import { ApiError, type Bootstrap, type Snapshot, type Task } from './api'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
  canOpenWorkbenchForm,
} from './navigation-guard'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
  type TaskWorkspaceTab,
} from './task-workspace-location'
import { statusText, statusTone, type Copy, type Locale } from './state'
import { useProjectDetail } from './useProjectDetail'
import { useTaskWorkspace } from './useTaskWorkspace'
import { useTaskTurns } from './useTaskTurns'
import {
  fetchTaskTurnRequest,
  previewTaskTurn,
  saveTaskTurn,
  type TaskTurn,
  type TaskTurnPage,
} from './task-turns'
import { stripQueryWhitespace } from './task-query'
import { pairedWorkspaceHref } from './pair-location'
import './task-workspace.css'
import { fetchPreparedCoding, type CodingJob } from './coding'
import { useTaskPlan } from './useTaskPlan'
import { TaskPlanPanel, TaskDependencyFacts } from './TaskPlanPanel'
import type { AnyPlanReceipt } from './task-plans'
import { planVersionFromCurrent, type PlanVersion } from './task-plan-revisions'

const RunWorkspace = lazy(() =>
  import('./RunWorkspace').then((module) => ({
    default: module.RunWorkspace,
  })),
)
const CodingRunDialog = lazy(() =>
  import('./CodingRunDialog').then((module) => ({
    default: module.CodingRunDialog,
  })),
)
const TaskPlanEditor = lazy(() =>
  import('./TaskPlanEditor').then((module) => ({
    default: module.TaskPlanEditor,
  })),
)

export type TaskWorkspaceProps = {
  taskId: string
  data: Bootstrap
  refreshRevision: number
  t: Copy
  locale: Locale
  legacyUrl: string
  onPrepare: (task: Task) => void
  onPrepareTurn?: (task: Task, turn: TaskTurn, snapshot: Snapshot) => void
  onOpenPreparedTurn?: (task: Task, turn: TaskTurn) => void
  preparing?: boolean
  onChanged?: () => Promise<void>
}

export function TaskWorkspace({
  taskId,
  data,
  refreshRevision,
  t,
  locale,
  legacyUrl,
  onPrepare,
  onPrepareTurn,
  onOpenPreparedTurn,
  preparing = false,
  onChanged,
}: TaskWorkspaceProps) {
  const compact = useCompactTaskList()
  const [paging, setPaging] = useState({ taskId, page: 1 })
  const page = paging.taskId === taskId ? paging.page : 1
  const read = useTaskWorkspace({
    data,
    refreshRevision,
    taskId,
    page,
  })
  const item = read.value?.item
  const projectRead = useProjectDetail({
    data,
    refreshRevision,
    projectId: item?.task.project_id,
    enabled: Boolean(item && !read.error),
  })
  const project = projectRead.remote
    ? projectRead.value?.project
    : data.projects.find((candidate) => candidate.id === item?.task.project_id)
  const projectUnavailable =
    Boolean(item) &&
    !projectRead.busy &&
    (Boolean(projectRead.error) || !project)
  const location = readTaskWorkspaceLocation(
    typeof window === 'undefined' ? '' : window.location.href,
  )
  const plans = useTaskPlan(
    taskId,
    data.capabilities.task_plans === true,
    refreshRevision,
    data.capabilities.task_plan_revisions === true,
  )
  const [planEditor, setPlanEditor] = useState<{
    task: Task
    baseline?: PlanVersion
  }>()
  const [planNotice, setPlanNotice] = useState('')
  const [planRefresh, setPlanRefresh] = useState(false)
  const codingEnabled = data.capabilities.isolated_coding === true
  const [codingOpen, setCodingOpen] = useState(
    Boolean(location.codingRequestId),
  )
  const [codingVersion, setCodingVersion] = useState(0)
  const [codingRead, setCodingRead] = useState<{
    taskId: string
    job: CodingJob | null
    error: boolean
  }>()
  useEffect(() => {
    if (!codingEnabled) return
    const controller = new AbortController()
    setCodingRead(undefined)
    void fetchPreparedCoding(taskId, controller.signal)
      .then((job) => {
        if (!controller.signal.aborted)
          setCodingRead({ taskId, job, error: false })
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setCodingRead({ taskId, job: null, error: true })
      })
    return () => controller.abort()
  }, [taskId, codingEnabled, codingVersion, refreshRevision])
  const codingBlocked = Boolean(
    location.codingRequestId ||
    (codingEnabled &&
      (!codingRead ||
        codingRead.taskId !== taskId ||
        codingRead.error ||
        codingRead.job)),
  )
  const tab = location.tab
  const runId = location.runId ?? item?.run?.id
  const [turnPaging, setTurnPaging] = useState({ taskId, page: 1 })
  const turnPage = turnPaging.taskId === taskId ? turnPaging.page : 1
  const turns = useTaskTurns({
    data,
    refreshRevision,
    taskId,
    page: turnPage,
    enabled: Boolean(item && !read.error),
  })
  const [composerLocked, setComposerLocked] = useState(false)
  const [copyNotice, setCopyNotice] = useState<{
    taskId: string
    error: boolean
  }>()
  const composerLock = useRef(false)
  const setConversationLock = useCallback((locked: boolean) => {
    composerLock.current = locked
    setComposerLocked(locked)
  }, [])
  const conversationLocked = Boolean(
    plans.blocked ||
    location.planRequestId ||
    codingBlocked ||
    location.pendingRequestId ||
    (turns.remote &&
      (turns.busy || turns.error || !turns.value || turns.value.prepared)),
  )
  const root = useRef<HTMLElement>(null)
  const conversationNavigation = useRef(false)
  const retryTrigger = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<{
    taskId: string
    page: number
    direction: 'previous' | 'next'
    origin: Element | null
  }>(undefined)
  const identity = JSON.stringify([taskId, item?.task])
  const admission = useRef({
    taskId,
    identity,
    prepare: false,
    navigate: false,
    prepared: '',
    pendingSave: '',
  })
  admission.current = {
    taskId,
    identity,
    prepare: Boolean(
      item &&
      !read.busy &&
      !read.error &&
      project &&
      !projectRead.busy &&
      !projectUnavailable &&
      !preparing &&
      !location.error &&
      !conversationLocked &&
      !composerLocked &&
      data.models.length,
    ),
    navigate: Boolean(item && !read.busy && !read.error),
    prepared: turns.value?.prepared ? JSON.stringify(turns.value.prepared) : '',
    pendingSave: location.pendingRequestId ?? '',
  }
  const canNavigate = () =>
    admission.current.taskId === taskId && admission.current.navigate
  const prepare = () => {
    if (
      !item ||
      !admission.current.prepare ||
      admission.current.taskId !== taskId ||
      admission.current.identity !== identity ||
      composerLock.current
    )
      return
    onPrepare(item.task)
  }
  const navigate = (nextTab: TaskWorkspaceTab, nextRun = location.runId) => {
    if (
      !canNavigate() ||
      (admission.current.pendingSave && nextTab !== 'conversation')
    )
      return
    conversationNavigation.current = true
    try {
      pushWorkbenchNavigation(
        taskWorkspaceHref(taskId, {
          tab: nextTab,
          runId: nextRun,
          pendingRequestId: location.pendingRequestId,
          codingRequestId: location.codingRequestId,
          planRequestId: location.planRequestId,
        }),
      )
    } finally {
      conversationNavigation.current = false
    }
  }
  const changePage = (candidate: number, direction: 'previous' | 'next') => {
    if (
      !canNavigate() ||
      !read.value ||
      candidate < 1 ||
      candidate > read.value.history.total_pages
    )
      return
    pageFocus.current = {
      taskId,
      page: candidate,
      direction,
      origin: document.activeElement,
    }
    setPaging({ taskId, page: candidate })
  }
  useEffect(() => {
    const pending = pageFocus.current
    if (!pending) return
    if (pending.taskId !== taskId || pending.page !== page) {
      pageFocus.current = undefined
      return
    }
    if (read.busy || (!read.value && !read.error)) return
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    if (read.error) {
      retryTrigger.current?.focus()
      return
    }
    const available = ':not(:disabled):not([aria-disabled="true"])'
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-task-history-page="${pending.direction}"]${available}`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      `[data-task-history-page]${available}`,
    )
    ;(preferred ?? fallback)?.focus()
  }, [taskId, page, read.busy, read.error, read.value])
  const when = (value: string) =>
    new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const taskError =
    read.error === 'forbidden'
      ? t('没有读取任务的权限。', 'Task access is forbidden.')
      : read.error === 'missing'
        ? t('任务不存在或已移除。', 'The task is missing or removed.')
        : read.error === 'unavailable'
          ? t('任务读取接口不可用。', 'Task details are unavailable.')
          : read.error === 'timeout'
            ? t('读取任务超时。', 'Reading the task timed out.')
            : t(
                '任务读取失败，未显示内容。',
                'The task could not be read. No content was shown.',
              )
  const arrangeLabel = t('安排执行', 'Arrange execution')
  if (read.error || !item)
    return (
      <section
        ref={root}
        className="wb-task-workspace"
        data-testid="task-workspace"
        aria-busy={read.busy || undefined}
      >
        <AppButton
          label={t('返回任务列表', 'Back to tasks')}
          icon={<ArrowLeft size={16} />}
          tone="ghost"
          href="#workbench"
        />
        {read.error ? (
          <div className="wb-task-read-state wb-error" role="alert">
            <h1>{t('任务暂不可用', 'Task unavailable')}</h1>
            <p>{taskError}</p>
            <AppButton
              ref={retryTrigger}
              label={t('重试读取任务', 'Retry task')}
              icon={<RefreshCw size={16} />}
              onClick={read.retry}
            />
          </div>
        ) : (
          <AppLoading label={t('正在读取任务', 'Loading task')} />
        )}
      </section>
    )
  const history = read.value!.history
  return (
    <section
      ref={root}
      className="wb-task-workspace"
      data-testid="task-workspace"
      aria-busy={read.busy || undefined}
    >
      <header className="wb-task-heading">
        <div className="wb-task-heading-content">
          <a
            className="wb-text-link"
            href={`#project/${encodeURIComponent(item.task.project_id)}`}
            aria-disabled={!canNavigate() || undefined}
            tabIndex={canNavigate() ? undefined : -1}
            onClick={(event) => {
              if (!canNavigate()) {
                event.preventDefault()
                event.stopPropagation()
              }
            }}
          >
            <FolderGit2 size={15} />
            {item.projectName}
          </a>
          <h1>{item.task.title}</h1>
          <div className="wb-task-identity">
            <code>{item.id}</code>
            <AppBadge tone={item.run ? statusTone(item.run.status) : 'neutral'}>
              {item.run
                ? statusText(item.run.status, t)
                : t('未运行', 'Not started')}
            </AppBadge>
            <span>
              {item.attempts} {t('次运行', 'runs')}
            </span>
          </div>
        </div>
        <div className="wb-task-heading-actions">
          {codingEnabled && (
            <AppButton
              label={t('研发实现', 'Implement & validate')}
              icon={<GitBranch size={16} />}
              disabled={
                plans.blocked ||
                Boolean(location.planRequestId) ||
                !canNavigate() ||
                composerLocked ||
                preparing ||
                Boolean(location.pendingRequestId) ||
                Boolean(location.error) ||
                turns.busy ||
                !codingRead ||
                codingRead.error ||
                Boolean(turns.value?.prepared) ||
                !data.models.length
              }
              onClick={() => {
                if (
                  canNavigate() &&
                  codingRead &&
                  !codingRead.error &&
                  !composerLock.current &&
                  !preparing &&
                  !location.pendingRequestId &&
                  !plans.blocked &&
                  !location.planRequestId &&
                  !location.error
                )
                  setCodingOpen(true)
              }}
            />
          )}
          {data.capabilities.device_run_history === true && (
            <AppButton
              label={t('复制设备接续链接', 'Copy device continuation link')}
              icon={<Link size={16} />}
              tone="ghost"
              iconOnly
              disabled={
                !canNavigate() ||
                composerLocked ||
                Boolean(location.pendingRequestId) ||
                Boolean(location.error)
              }
              onClick={async () => {
                if (
                  !canNavigate() ||
                  composerLock.current ||
                  location.pendingRequestId ||
                  location.error
                )
                  return
                try {
                  const href = pairedWorkspaceHref(taskId, {
                    view: tab,
                    ...((tab === 'work' || tab === 'review') && runId
                      ? { runId }
                      : {}),
                  })
                  await navigator.clipboard.writeText(
                    new URL(href, window.location.href).href,
                  )
                  setCopyNotice({ taskId, error: false })
                } catch {
                  setCopyNotice({ taskId, error: true })
                }
              }}
            />
          )}
          {data.capabilities.device_continuation === true && (
            <AppButton
              label={t('在其他设备继续', 'Continue on another device')}
              icon={<MonitorSmartphone size={16} />}
              tone="ghost"
              href={`#devices?task=${encodeURIComponent(taskId)}`}
              disabled={
                !canNavigate() ||
                composerLocked ||
                Boolean(location.pendingRequestId)
              }
            />
          )}
          <AppButton
            label={t('刷新任务', 'Refresh task')}
            icon={<RefreshCw size={16} />}
            iconOnly
            tone="ghost"
            busy={read.busy}
            disabled={read.busy}
            onClick={read.retry}
          />
          <AppButton
            label={arrangeLabel}
            icon={<Play size={16} />}
            tone="primary"
            busy={preparing}
            disabled={!admission.current.prepare}
            onClick={prepare}
          />
        </div>
      </header>
      {codingEnabled &&
        (codingRead?.error || codingRead?.job || location.codingRequestId) && (
          <div className="wb-task-prepared-state">
            <p>
              {codingRead?.error
                ? t(
                    '研发执行状态读取失败，其他执行已暂停。',
                    'Implementation state could not be read. Other execution is paused.',
                  )
                : t(
                    '研发实现候选已保存，请继续核对原请求。',
                    'An implementation candidate is saved. Continue checking the original request.',
                  )}
            </p>
            <AppButton
              label={t('核对研发执行', 'Check implementation')}
              icon={<RefreshCw size={16} />}
              onClick={() => {
                if (codingRead?.error) setCodingVersion((v) => v + 1)
                else setCodingOpen(true)
              }}
            />
          </div>
        )}
      {codingOpen && codingEnabled && (
        <Suspense
          fallback={
            <AppLoading
              label={t('正在读取实现配置', 'Loading implementation settings')}
            />
          }
        >
          <CodingRunDialog
            continuationEnabled={data.capabilities.coding_continuation === true}
            pytestEnabled={data.capabilities.coding_pytest === true}
            key={taskId}
            task={item.task}
            models={data.models}
            initial={location.codingRequestId ?? codingRead?.job?.request_id}
            t={t}
            onClose={() => {
              setCodingOpen(false)
              setCodingVersion((v) => v + 1)
            }}
            onStarted={(id) => {
              setCodingOpen(false)
              setCodingVersion((v) => v + 1)
              read.retry()
              pushWorkbenchNavigation(
                taskWorkspaceHref(taskId, { tab: 'work', runId: id }),
                { replace: true },
              )
            }}
          />
        </Suspense>
      )}
      {location.codingRequestId && !codingEnabled && (
        <p role="alert" className="wb-error">
          {t(
            '当前服务无法核对原研发执行，原请求保持锁定。',
            'This server cannot reconcile the original implementation. The request remains locked.',
          )}
        </p>
      )}
      {(planEditor || (location.planRequestId && item)) && (
        <Suspense
          fallback={
            <AppLoading
              label={t('正在读取任务拆解', 'Loading task breakdown')}
            />
          }
        >
          <TaskPlanEditor
            key={taskId}
            task={planEditor?.task ?? item!.task}
            baseline={planEditor?.baseline}
            revisionsEnabled={data.capabilities.task_plan_revisions === true}
            currentPlanHash={plans.value?.plan?.plan_hash}
            initial={location.planRequestId}
            enabled={plans.enabled && !plans.busy && !plans.error}
            t={t}
            onClose={() => setPlanEditor(undefined)}
            onCreated={async (receipt: AnyPlanReceipt) => {
              setPlanEditor(undefined)
              plans.retry()
              read.retry()
              turns.retry()
              setPlanRefresh(true)
              try {
                await onChanged?.()
                setPlanNotice(
                  'operation' in receipt
                    ? t(
                        '计划修订已发布，旧任务与运行记录已保留。',
                        'Plan revision published. Old tasks and runs are retained.',
                      )
                    : t(
                        '子任务与依赖已创建，未启动模型。',
                        'Subtasks and dependencies created. No model has started.',
                      ),
                )
              } catch {
                setPlanNotice(
                  t(
                    '创建已确认，但全局读取刷新失败，请重新刷新。',
                    'Creation is confirmed, but global reads could not refresh. Refresh again.',
                  ),
                )
              } finally {
                setPlanRefresh(false)
              }
            }}
          />
        </Suspense>
      )}
      {planNotice && (
        <p role="status" className="wb-notice">
          {planNotice}
        </p>
      )}
      {plans.enabled && plans.error && tab !== 'goal' && (
        <p role="alert" className="wb-error">
          {t(
            '任务依赖读取失败，暂不能发起新的运行。',
            'Task dependencies could not be read. New execution is blocked.',
          )}
          <AppButton
            label={t('刷新任务依赖', 'Refresh task dependencies')}
            icon={<RefreshCw size={15} />}
            onClick={plans.retry}
          />
        </p>
      )}
      {plans.value?.gate && tab !== 'goal' && (
        <TaskDependencyFacts gate={plans.value.gate} t={t} />
      )}
      {copyNotice?.taskId === taskId && (
        <p
          role={copyNotice.error ? 'alert' : 'status'}
          className={copyNotice.error ? 'wb-error' : 'wb-hint'}
        >
          {copyNotice.error
            ? t('链接复制失败。', 'The link could not be copied.')
            : t(
                '接续链接已复制。另一设备仍需此任务的有效配对授权。',
                'Continuation link copied. The other device still needs active pairing for this task.',
              )}
        </p>
      )}
      {!data.models.length && (
        <div className="wb-task-model-state" role="status">
          <span>{t('尚未配置模型', 'No model configured')}</span>
          <AppButton
            label={t('配置模型', 'Configure models')}
            icon={<SlidersHorizontal size={15} />}
            tone="ghost"
            href="#models"
          />
        </div>
      )}
      {turns.remote && turns.value?.prepared && (
        <div className="wb-task-prepared-state" role="status">
          <div>
            <strong>
              {t(
                '下一轮已准备，等待确认',
                'Next run prepared, awaiting confirmation',
              )}
            </strong>
            <p>{turns.value.prepared.content}</p>
          </div>
          <AppButton
            label={t('继续确认下一轮', 'Continue prepared run')}
            icon={<ArrowRight size={15} />}
            disabled={
              read.busy ||
              turns.busy ||
              preparing ||
              Boolean(location.pendingRequestId) ||
              composerLocked ||
              !onOpenPreparedTurn
            }
            onClick={() => {
              const preparedTurn = turns.value?.prepared
              if (
                preparedTurn &&
                !read.busy &&
                !turns.busy &&
                !preparing &&
                !location.pendingRequestId &&
                !composerLock.current &&
                admission.current.prepared === JSON.stringify(preparedTurn) &&
                onOpenPreparedTurn
              )
                onOpenPreparedTurn(item.task, preparedTurn)
            }}
          />
          {data.capabilities.device_execution_delegation === true && (
            <AppButton
              label={t('到设备页委托执行', 'Delegate from devices')}
              icon={<Link size={15} />}
              href={`#devices?task=${encodeURIComponent(taskId)}`}
              disabled={
                read.busy ||
                turns.busy ||
                preparing ||
                composerLocked ||
                Boolean(location.pendingRequestId)
              }
            />
          )}
        </div>
      )}
      {turns.remote && turns.error && tab !== 'conversation' && (
        <div className="wb-error" role="alert">
          <span>
            {t(
              '会话状态尚未确认，安排执行已暂停。',
              'Conversation state is unconfirmed. Arrange execution is paused.',
            )}
          </span>
          <AppButton
            label={t('重试读取会话', 'Retry conversation')}
            icon={<RefreshCw size={15} />}
            onClick={turns.retry}
          />
        </div>
      )}
      {location.pendingRequestId && tab !== 'conversation' && (
        <div className="wb-error" role="status">
          <span>
            {t(
              '消息保存结果待核对，请回到任务会话。',
              'A message save needs reconciliation. Open the task conversation.',
            )}
          </span>
          <AppButton
            label={t('打开任务会话', 'Open task conversation')}
            onClick={() => {
              navigate('conversation')
            }}
          />
        </div>
      )}
      {location.error ? (
        <div className="wb-error" role="alert">
          <p>
            {t(
              '任务视图或运行标识无效，未显示执行内容。',
              'The task view or run identifier is invalid. Execution content was not shown.',
            )}
          </p>
          <AppButton
            label={t('清除任务视图', 'Clear task view')}
            onClick={() => {
              if (canNavigate())
                pushWorkbenchNavigation(taskWorkspaceHref(taskId))
            }}
            disabled={!canNavigate()}
          />
        </div>
      ) : (
        <>
          <nav
            className="wb-task-tabs"
            aria-label={t('任务工作区视图', 'Task workspace views')}
          >
            <AppSegments
              label={t('任务视图', 'Task view')}
              iconOnly={compact}
              value={tab}
              onChange={(value) => navigate(value as TaskWorkspaceTab)}
              options={[
                {
                  value: 'goal',
                  label: t('目标与验收', 'Goal & acceptance'),
                  icon: <ListChecks size={16} />,
                },
                {
                  value: 'conversation',
                  label: t('任务会话', 'Conversation'),
                  icon: <MessageSquare size={16} />,
                },
                {
                  value: 'work',
                  label: t('Agent 执行', 'Agent work'),
                  icon: <Workflow size={16} />,
                },
                {
                  value: 'review',
                  label: t('成果审查', 'Artifact review'),
                  icon: <FileCheck2 size={16} />,
                },
              ]}
            />
          </nav>
          <div hidden={tab !== 'conversation'}>
            <TaskConversation
              key={taskId}
              task={item.task}
              t={t}
              locale={locale}
              remote={turns.remote}
              value={turns.value}
              busy={turns.busy || read.busy}
              error={turns.error}
              retry={turns.retry}
              pendingRequestId={location.pendingRequestId}
              runId={location.runId}
              preparing={preparing || codingBlocked}
              executionBlocked={
                plans.blocked || Boolean(location.planRequestId)
              }
              navigationAllowance={conversationNavigation}
              onComposerLockChange={setConversationLock}
              onPrepareTurn={onPrepareTurn}
              onOpenPreparedTurn={onOpenPreparedTurn}
              onPageChange={(next) => setTurnPaging({ taskId, page: next })}
            />
          </div>
          {tab === 'conversation' ? null : tab === 'goal' ? (
            <div className="wb-task-goal-layout">
              <div className="wb-task-brief">
                <section
                  className="wb-task-brief-section"
                  data-testid="project-goal"
                  aria-busy={projectRead.busy || undefined}
                >
                  <h2>{t('项目目标', 'Project goal')}</h2>
                  {projectRead.error || projectUnavailable ? (
                    <div className="wb-error" role="alert">
                      <p>
                        {projectRead.error === 'forbidden'
                          ? t(
                              '没有读取项目资料的权限。',
                              'Project details access is forbidden.',
                            )
                          : t(
                              '项目目标读取失败，未显示资料。',
                              'The project goal could not be read. No details were shown.',
                            )}
                      </p>
                      {projectRead.remote && (
                        <AppButton
                          label={t('重试项目资料', 'Retry project details')}
                          icon={<RefreshCw size={15} />}
                          onClick={projectRead.retry}
                        />
                      )}
                    </div>
                  ) : !project ? (
                    <AppLoading
                      label={t('正在读取项目目标', 'Loading project goal')}
                    />
                  ) : (
                    <>
                      <h3>{project.name}</h3>
                      <p>{project.goal || t('未填写', 'Not provided')}</p>
                    </>
                  )}
                </section>
                <section
                  className="wb-task-brief-section"
                  data-testid="task-goal"
                >
                  <h2>{t('任务目标', 'Task goal')}</h2>
                  <p>{item.task.goal || t('未填写', 'Not provided')}</p>
                </section>
                <section className="wb-task-brief-section">
                  <h2>{t('验收要求', 'Acceptance')}</h2>
                  <p>{item.task.acceptance || t('未填写', 'Not provided')}</p>
                </section>
                {plans.enabled && (
                  <TaskPlanPanel
                    value={plans.value}
                    busy={plans.busy}
                    error={plans.error}
                    t={t}
                    onRefresh={plans.retry}
                    revisionsEnabled={
                      data.capabilities.task_plan_revisions === true
                    }
                    canCreate={
                      !planRefresh &&
                      !conversationLocked &&
                      !composerLocked &&
                      canNavigate() &&
                      !preparing &&
                      !location.error
                    }
                    onCreate={() => {
                      if (
                        !planRefresh &&
                        !conversationLocked &&
                        !composerLock.current &&
                        canNavigate() &&
                        canOpenWorkbenchForm() &&
                        plans.value &&
                        !plans.value.plan &&
                        !plans.value.parent
                      )
                        setPlanEditor({ task: structuredClone(item.task) })
                    }}
                    onRevise={() => {
                      if (
                        data.capabilities.task_plan_revisions === true &&
                        !planRefresh &&
                        !conversationLocked &&
                        !composerLock.current &&
                        canNavigate() &&
                        canOpenWorkbenchForm() &&
                        !location.error &&
                        plans.value?.plan &&
                        !plans.value.parent
                      )
                        setPlanEditor({
                          task: structuredClone(item.task),
                          baseline: planVersionFromCurrent(plans.value.plan),
                        })
                    }}
                  />
                )}
                <section className="wb-task-brief-section">
                  <h2>{t('显式资料', 'Explicit files')}</h2>
                  {item.task.files.length ? (
                    <ul className="wb-task-files">
                      {item.task.files.map((file) => (
                        <li key={file}>
                          <code>{file}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="wb-muted">
                      {t('未选择文件', 'No files selected')}
                    </p>
                  )}
                </section>
              </div>
              <aside
                className="wb-task-run-rail"
                aria-label={t('任务运行', 'Task runs')}
              >
                <section className="wb-task-latest">
                  <h2>{t('最近运行', 'Latest run')}</h2>
                  {item.run ? (
                    <>
                      <div className="wb-task-latest-status">
                        <AppBadge tone={statusTone(item.run.status)}>
                          {statusText(item.run.status, t)}
                        </AppBadge>
                        <time dateTime={item.run.created_at}>
                          {when(item.run.created_at)}
                        </time>
                      </div>
                      <code>{item.run.id}</code>
                      <div className="wb-task-latest-actions">
                        <AppButton
                          label={t('查看 Agent 执行', 'View Agent work')}
                          icon={<Workflow size={15} />}
                          disabled={!canNavigate()}
                          onClick={() => navigate('work', item.run!.id)}
                        />
                        <AppButton
                          label={t('审查成果', 'Review artifacts')}
                          icon={<FileCheck2 size={15} />}
                          disabled={!canNavigate()}
                          onClick={() => navigate('review', item.run!.id)}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="wb-task-no-run">
                      <GitBranch size={22} />
                      <p>{t('尚未发起运行', 'No runs yet')}</p>
                    </div>
                  )}
                </section>
                <section
                  className="wb-task-history"
                  data-testid="task-history"
                  aria-label={t('运行历史', 'Run history')}
                >
                  <div className="wb-task-history-heading">
                    <h2>{t('运行历史', 'Run history')}</h2>
                    <span>{history.total}</span>
                  </div>
                  <div className="wb-task-history-items">
                    {history.items.map((run) => (
                      <AppButton
                        key={run.id}
                        label={`${t('查看运行', 'View run')} ${run.id}`}
                        className="wb-task-history-row"
                        tone="ghost"
                        width="100%"
                        disabled={!canNavigate()}
                        onClick={() => navigate('work', run.id)}
                        endContent={
                          <span className="wb-task-history-state">
                            <AppBadge tone={statusTone(run.status)}>
                              {statusText(run.status, t)}
                            </AppBadge>
                            <ChevronRight size={14} />
                          </span>
                        }
                      >
                        <span className="wb-task-history-copy">
                          <code>{run.id}</code>
                          <time dateTime={run.created_at}>
                            {when(run.created_at)}
                          </time>
                        </span>
                      </AppButton>
                    ))}
                    {!history.items.length && (
                      <p className="wb-muted">
                        {t('尚未发起运行', 'No runs yet')}
                      </p>
                    )}
                  </div>
                  {history.total_pages > 1 && (
                    <footer className="wb-task-history-pagination">
                      <span>
                        {(history.page - 1) * history.page_size + 1}-
                        {Math.min(
                          history.page * history.page_size,
                          history.total,
                        )}{' '}
                        / {history.total}
                      </span>
                      <div>
                        <AppButton
                          label={t('上一页运行历史', 'Previous task history')}
                          icon={<ChevronLeft size={15} />}
                          iconOnly
                          tone="ghost"
                          data-task-history-page="previous"
                          disabled={read.busy || history.page <= 1}
                          onClick={() =>
                            changePage(history.page - 1, 'previous')
                          }
                        />
                        <span>
                          {history.page} / {history.total_pages}
                        </span>
                        <AppButton
                          label={t('下一页运行历史', 'Next task history')}
                          icon={<ChevronRight size={15} />}
                          iconOnly
                          tone="ghost"
                          data-task-history-page="next"
                          disabled={read.busy || !history.has_more}
                          onClick={() => changePage(history.page + 1, 'next')}
                        />
                      </div>
                    </footer>
                  )}
                </section>
              </aside>
            </div>
          ) : runId ? (
            <div
              className="wb-task-execution"
              aria-busy={read.busy || undefined}
              inert={read.busy || undefined}
            >
              <div className="wb-task-execution-context">
                <code>RUN {runId}</code>
                <AppButton
                  label={t('独立打开运行', 'Open standalone run')}
                  icon={<ArrowRight size={15} />}
                  tone="ghost"
                  href={`#run/${encodeURIComponent(runId)}`}
                />
              </div>
              <Suspense
                fallback={
                  <AppLoading
                    label={t('正在读取运行工作区', 'Loading run workspace')}
                  />
                }
              >
                <RunWorkspace
                  key={`${taskId}:${runId}:${tab}`}
                  runId={runId}
                  t={t}
                  locale={locale}
                  legacyUrl={legacyUrl}
                  embedded
                  expectedTaskId={taskId}
                  initialTab={tab === 'review' ? 'artifacts' : 'work'}
                />
              </Suspense>
            </div>
          ) : (
            <div className="wb-task-empty-run">
              {tab === 'review' ? (
                <FileCheck2 size={28} />
              ) : (
                <Workflow size={28} />
              )}
              <h2>
                {tab === 'review'
                  ? t('尚无成果可审查', 'No artifacts to review')
                  : t('尚未开始 Agent 执行', 'Agent work has not started')}
              </h2>
              <AppButton
                label={arrangeLabel}
                icon={<FileSearch size={16} />}
                tone="primary"
                disabled={!admission.current.prepare}
                busy={preparing}
                onClick={prepare}
              />
            </div>
          )}
        </>
      )}
    </section>
  )
}

type ConversationReadError = ReturnType<typeof useTaskTurns>['error']
type MessageSave =
  | { phase: 'idle' }
  | {
      phase: 'saving' | 'unknown' | 'checking' | 'missing'
      requestId: string
      content?: string
    }

export function TaskConversation({
  task,
  t,
  locale,
  remote,
  value,
  busy,
  error,
  retry,
  pendingRequestId,
  runId,
  preparing,
  executionBlocked = false,
  navigationAllowance,
  onComposerLockChange,
  onPrepareTurn,
  onOpenPreparedTurn,
  onPageChange,
}: {
  task: Task
  t: Copy
  locale: Locale
  remote: boolean
  value: TaskTurnPage | undefined
  busy: boolean
  error: ConversationReadError
  retry: () => void
  pendingRequestId?: string
  runId?: string
  preparing: boolean
  executionBlocked?: boolean
  navigationAllowance?: { current: boolean }
  onComposerLockChange?: (locked: boolean) => void
  onPrepareTurn?: TaskWorkspaceProps['onPrepareTurn']
  onOpenPreparedTurn?: TaskWorkspaceProps['onOpenPreparedTurn']
  onPageChange: (page: number) => void
}) {
  const [draft, setDraft] = useState('')
  const [save, setSave] = useState<MessageSave>(
    pendingRequestId
      ? { phase: 'unknown', requestId: pendingRequestId }
      : { phase: 'idle' },
  )
  const [notice, setNotice] = useState<
    { tone: 'error' | 'info'; text: string } | undefined
  >()
  const [discardOpen, setDiscardOpen] = useState(false)
  const [previewing, setPreviewing] = useState('')
  const root = useRef<HTMLElement>(null)
  const retryTrigger = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<{
    direction: 'previous' | 'next'
    origin: Element | null
  }>(undefined)
  const request = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)
  const localInternalNavigation = useRef(false)
  const internalNavigation = navigationAllowance ?? localInternalNavigation
  const operation = useRef(false)
  const activeTask = useRef(task.id)
  activeTask.current = task.id
  const saveState = useRef(save)
  saveState.current = save
  const draftState = useRef(draft)
  draftState.current = draft
  const admission = useRef({
    taskId: task.id,
    ready: false,
    prepared: '',
    turns: new Map<string, string>(),
  })
  admission.current = {
    taskId: task.id,
    ready: Boolean(remote && value && !busy && !error && !preparing),
    prepared: value?.prepared?.id ?? '',
    turns: new Map(
      [
        ...(value?.items ?? []),
        ...(value?.prepared ? [value.prepared] : []),
      ].map((turn) => [turn.id, JSON.stringify(turn)]),
    ),
  }
  const uncertain = save.phase === 'unknown' || save.phase === 'checking'
  const saveLocked = save.phase !== 'idle'
  const guardActive = Boolean(draft || saveLocked || previewing)
  useEffect(() => {
    onComposerLockChange?.(guardActive)
    return () => onComposerLockChange?.(false)
  }, [guardActive, onComposerLockChange])
  const guard = useRef({ dirty: false, busy: false })
  guard.current = {
    dirty: Boolean(draft) || save.phase === 'missing',
    busy: saveLocked || uncertain || Boolean(previewing),
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    if (
      pendingRequestId &&
      (saveState.current.phase === 'idle' ||
        saveState.current.requestId !== pendingRequestId)
    )
      setSave({ phase: 'unknown', requestId: pendingRequestId })
  }, [pendingRequestId])
  useEffect(() => {
    if (!guardActive) return
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
  }, [guardActive])
  useEffect(() => {
    const pending = pageFocus.current
    if (!pending || busy || (!value && !error)) return
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    if (error) {
      retryTrigger.current?.focus()
      return
    }
    const available = ':not(:disabled):not([aria-disabled="true"])'
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-task-turn-page="${pending.direction}"]${available}`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      `[data-task-turn-page]${available}`,
    )
    ;(preferred ?? fallback)?.focus()
  }, [busy, error, value])
  const stampRequest = (id?: string) => {
    internalNavigation.current = true
    try {
      return pushWorkbenchNavigation(
        taskWorkspaceHref(task.id, {
          tab: 'conversation',
          runId,
          pendingRequestId: id,
        }),
        { replace: true },
      )
    } finally {
      internalNavigation.current = false
    }
  }
  const current = (taskId: string) =>
    mounted.current && activeTask.current === taskId
  const finishSave = () => {
    cancelWorkbenchNavigation()
    if (!stampRequest()) {
      const pending = saveState.current
      if (pending.phase !== 'idle') setSave({ ...pending, phase: 'unknown' })
      setNotice({
        tone: 'error',
        text: t(
          '消息已保存，但页面状态未更新。请核对保存回执。',
          'The message was saved, but navigation did not update. Check its receipt.',
        ),
      })
      return
    }
    setDraft('')
    setSave({ phase: 'idle' })
    setNotice({
      tone: 'info',
      text: t('消息已保存，尚未执行。', 'Message saved. No run has started.'),
    })
    onPageChange(1)
    retry()
  }
  const send = async (candidate?: { requestId: string; content: string }) => {
    if (
      operation.current ||
      !admission.current.ready ||
      admission.current.taskId !== task.id ||
      (!candidate && saveState.current.phase !== 'idle')
    )
      return
    const text = candidate?.content ?? stripQueryWhitespace(draftState.current)
    if (!text || [...text].length > 8000) {
      setNotice({
        tone: 'error',
        text: t(
          '补充要求须为 1 至 8000 个字符。',
          'Supplemental requirements must contain 1 to 8000 characters.',
        ),
      })
      return
    }
    const requestId = candidate?.requestId ?? crypto.randomUUID()
    const taskId = task.id
    operation.current = true
    setNotice(undefined)
    if (!stampRequest(requestId)) {
      operation.current = false
      return
    }
    setSave({ phase: 'saving', requestId, content: text })
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      await saveTaskTurn(
        taskId,
        { request_id: requestId, content: text },
        controller.signal,
      )
      if (current(taskId) && !controller.signal.aborted) finishSave()
    } catch {
      if (!current(taskId)) return
      setSave({ phase: 'unknown', requestId, content: text })
      setNotice({
        tone: 'error',
        text: t(
          '保存结果未确认，请按原请求核对回执。不会自动重发。',
          'The save outcome is unconfirmed. Check the original request receipt. It will not be resent automatically.',
        ),
      })
    } finally {
      if (current(taskId)) operation.current = false
    }
  }
  const reconcile = async () => {
    const before = saveState.current
    if (
      operation.current ||
      before.phase === 'idle' ||
      before.phase === 'saving'
    )
      return
    const taskId = task.id
    operation.current = true
    setSave({ ...before, phase: 'checking' })
    setNotice(undefined)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const receipt = await fetchTaskTurnRequest(
        taskId,
        before.requestId,
        controller.signal,
      )
      if (!current(taskId) || controller.signal.aborted) return
      if (before.content !== undefined && receipt.content !== before.content)
        throw new Error('task_turn_receipt_candidate_mismatch')
      finishSave()
    } catch (reason) {
      if (!current(taskId)) return
      if (reason instanceof ApiError && reason.status === 404) {
        if (before.content === undefined) {
          setSave({ ...before, phase: 'unknown' })
          setNotice({
            tone: 'error',
            text: t(
              '暂未找到原请求，仍不能确认此前保存是否结束。原文未保存在浏览器，请保留此请求继续核对。',
              'The original request was not found yet, but its earlier save may still be in flight. Its text was not stored in the browser. Keep this request and check again.',
            ),
          })
        } else {
          setSave({ ...before, phase: 'missing' })
          setNotice({
            tone: 'info',
            text: t(
              '暂未找到该请求。可用同一请求标识重试原消息，不会更换消息或新建请求。',
              'This request was not found yet. You may retry the original message with the same request ID; its text and identity stay fixed.',
            ),
          })
        }
      } else {
        setSave({ ...before, phase: 'unknown' })
        setNotice({
          tone: 'error',
          text: t(
            '回执读取失败，原请求仍待核对。',
            'The receipt could not be read. The original request remains unresolved.',
          ),
        })
      }
    } finally {
      clearTimeout(timeout)
      if (current(taskId)) operation.current = false
    }
  }
  const preview = async (turn: TaskTurn) => {
    if (
      operation.current ||
      !admission.current.ready ||
      admission.current.taskId !== task.id ||
      admission.current.prepared ||
      admission.current.turns.get(turn.id) !== JSON.stringify(turn) ||
      turn.state !== 'saved' ||
      draftState.current ||
      saveState.current.phase !== 'idle' ||
      !onPrepareTurn ||
      executionBlocked
    )
      return
    const taskId = task.id
    operation.current = true
    setPreviewing(turn.id)
    setNotice(undefined)
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    try {
      const snapshot = await previewTaskTurn(taskId, turn.id, controller.signal)
      if (!current(taskId) || controller.signal.aborted) return
      if (
        snapshot.supplement.id !== turn.id ||
        snapshot.supplement.content !== turn.content
      )
        throw new Error('task_turn_preview_candidate_mismatch')
      onPrepareTurn(task, turn, snapshot)
    } catch {
      if (current(taskId))
        setNotice({
          tone: 'error',
          text: t(
            '下一轮资料读取失败，尚未准备或执行。',
            'The next-run context could not be read. No candidate was prepared or executed.',
          ),
        })
    } finally {
      if (current(taskId)) {
        setPreviewing('')
        operation.current = false
      }
    }
  }
  const canUseTurn = (turn: TaskTurn) =>
    admission.current.ready &&
    admission.current.taskId === task.id &&
    admission.current.turns.get(turn.id) === JSON.stringify(turn) &&
    !operation.current &&
    !draft &&
    !saveLocked
  const when = (createdAt: string) =>
    new Date(createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
  const preparedOffPage =
    value?.prepared &&
    !value.items.some((turn) => turn.id === value.prepared!.id)
      ? value.prepared
      : undefined
  const timeline = preparedOffPage
    ? [preparedOffPage, ...(value?.items ?? [])]
    : (value?.items ?? [])
  const changePage = (page: number, direction: 'previous' | 'next') => {
    if (
      !admission.current.ready ||
      operation.current ||
      saveLocked ||
      !value ||
      page < 1 ||
      page > value.total_pages
    )
      return
    pageFocus.current = { direction, origin: document.activeElement }
    onPageChange(page)
  }
  return (
    <section
      ref={root}
      className="wb-task-conversation"
      data-testid="task-conversation"
      aria-busy={busy || undefined}
    >
      {!remote ? (
        <div className="wb-task-read-state" role="status">
          <MessageSquare size={25} />
          <h2>
            {t(
              '当前服务未启用任务会话',
              'Task conversation is not enabled on this server',
            )}
          </h2>
        </div>
      ) : (
        <>
          <div className="wb-task-conversation-heading">
            <div>
              <h2>
                {t(
                  '补充要求与下一轮工作',
                  'Supplemental requirements and next work',
                )}
              </h2>
              <p>
                {t(
                  '下一轮仅发送原任务资料和所选消息，之前的会话与模型输出不会自动附加。',
                  'The next run sends the original Task context and selected message only. Previous messages and model outputs are not appended automatically.',
                )}
              </p>
            </div>
            <AppButton
              label={t('刷新会话', 'Refresh conversation')}
              icon={<RefreshCw size={16} />}
              iconOnly
              tone="ghost"
              disabled={busy || operation.current}
              onClick={retry}
            />
          </div>
          <div className="wb-task-message-composer">
            <AppTextArea
              label={t('补充要求', 'Supplemental requirements')}
              value={draft}
              onChange={(next) => {
                if (saveState.current.phase === 'idle' && !operation.current)
                  setDraft(next)
              }}
              isDisabled={saveLocked || Boolean(previewing) || preparing}
              rows={4}
            />
            <div className="wb-task-message-composer-actions">
              <span className="wb-muted">{[...draft].length} / 8000</span>
              <AppButton
                label={t('保存消息', 'Save message')}
                icon={<Save size={16} />}
                tone="primary"
                busy={save.phase === 'saving'}
                disabled={
                  !admission.current.ready ||
                  saveLocked ||
                  Boolean(previewing) ||
                  [...draft].length > 8000 ||
                  !draft.trim()
                }
                onClick={() => void send()}
              />
            </div>
          </div>
          {notice && (
            <div
              className={notice.tone === 'error' ? 'wb-error' : 'wb-notice'}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              {notice.text}
            </div>
          )}
          {save.phase !== 'idle' && save.phase !== 'saving' && (
            <div className="wb-task-message-receipt" role="status">
              <code>{save.requestId}</code>
              <AppButton
                label={t('核对保存回执', 'Check save receipt')}
                icon={<RefreshCw size={15} />}
                busy={save.phase === 'checking'}
                disabled={operation.current}
                onClick={() => void reconcile()}
              />
              {save.phase === 'missing' && save.content !== undefined && (
                <>
                  <AppButton
                    label={t('重试原消息', 'Retry original message')}
                    disabled={!admission.current.ready || operation.current}
                    onClick={() => {
                      const candidate = saveState.current
                      if (
                        candidate.phase === 'missing' &&
                        candidate.content !== undefined
                      )
                        void send({
                          requestId: candidate.requestId,
                          content: candidate.content,
                        })
                    }}
                  />
                </>
              )}
            </div>
          )}
          {error ? (
            <div className="wb-error" role="alert">
              <p>
                {error === 'forbidden'
                  ? t(
                      '没有读取任务会话的权限。',
                      'Task conversation access is forbidden.',
                    )
                  : error === 'missing'
                    ? t(
                        '任务会话不存在或不可用。',
                        'Task conversation is missing or unavailable.',
                      )
                    : t(
                        '会话读取失败，未显示消息。',
                        'Conversation could not be read. No messages were shown.',
                      )}
              </p>
              <AppButton
                ref={retryTrigger}
                label={t('重试读取会话', 'Retry conversation')}
                icon={<RefreshCw size={15} />}
                onClick={retry}
              />
            </div>
          ) : !value ? (
            <AppLoading label={t('正在读取会话', 'Loading conversation')} />
          ) : (
            <>
              <div
                className="wb-task-message-list"
                aria-label={t('已保存消息', 'Saved messages')}
              >
                {timeline.map((turn) => (
                  <article
                    className="wb-task-message"
                    key={turn.id}
                    data-task-turn={turn.id}
                  >
                    <header>
                      <AppBadge
                        tone={
                          turn.state === 'applied'
                            ? 'info'
                            : turn.state === 'prepared'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {turn.state === 'saved'
                          ? t('已保存，未执行', 'Saved, not executed')
                          : turn.state === 'prepared'
                            ? t('已准备，待确认', 'Prepared, awaiting consent')
                            : t('已关联运行', 'Run linked')}
                      </AppBadge>
                      <time dateTime={turn.created_at}>
                        {when(turn.created_at)}
                      </time>
                    </header>
                    <p className="wb-task-message-content">{turn.content}</p>
                    {turn.state === 'prepared' && turn.candidate && (
                      <dl className="wb-task-message-budget">
                        <dt>{t('调用上限', 'Call limit')}</dt>
                        <dd>{turn.candidate.config.max_calls}</dd>
                        <dt>
                          {t('并行研究 Agent', 'Parallel research Agents')}
                        </dt>
                        <dd>{turn.candidate.config.parallel}</dd>
                        <dt>{t('时间上限', 'Time limit')}</dt>
                        <dd>{turn.candidate.config.minutes} min</dd>
                      </dl>
                    )}
                    <div className="wb-task-message-actions">
                      {turn.state === 'saved' ? (
                        <AppButton
                          label={t('安排下一轮', 'Arrange next run')}
                          icon={<Play size={15} />}
                          busy={previewing === turn.id}
                          disabled={
                            !canUseTurn(turn) ||
                            executionBlocked ||
                            Boolean(value.prepared) ||
                            !onPrepareTurn
                          }
                          onClick={() => void preview(turn)}
                        />
                      ) : turn.state === 'prepared' ? (
                        <AppButton
                          label={t('继续确认下一轮', 'Continue prepared run')}
                          icon={<ArrowRight size={15} />}
                          disabled={
                            !canUseTurn(turn) ||
                            !onOpenPreparedTurn ||
                            executionBlocked
                          }
                          onClick={() => {
                            if (
                              canUseTurn(turn) &&
                              onOpenPreparedTurn &&
                              !executionBlocked
                            )
                              onOpenPreparedTurn(task, turn)
                          }}
                        />
                      ) : turn.run_id ? (
                        <>
                          <AppButton
                            label={t('查看 Agent 执行', 'View Agent work')}
                            icon={<Workflow size={15} />}
                            disabled={!canUseTurn(turn)}
                            onClick={() => {
                              if (canUseTurn(turn))
                                pushWorkbenchNavigation(
                                  taskWorkspaceHref(task.id, {
                                    tab: 'work',
                                    runId: turn.run_id!,
                                  }),
                                )
                            }}
                          />
                          <AppButton
                            label={t('审查成果', 'Review artifacts')}
                            icon={<FileCheck2 size={15} />}
                            disabled={!canUseTurn(turn)}
                            onClick={() => {
                              if (canUseTurn(turn))
                                pushWorkbenchNavigation(
                                  taskWorkspaceHref(task.id, {
                                    tab: 'review',
                                    runId: turn.run_id!,
                                  }),
                                )
                            }}
                          />
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
                {!timeline.length && (
                  <div className="wb-task-message-empty">
                    <MessageSquare size={24} />
                    <h3>
                      {t('还没有补充消息', 'No supplemental messages yet')}
                    </h3>
                  </div>
                )}
              </div>
              <footer className="wb-task-message-pagination">
                <span data-testid="task-turn-range">
                  {value.total
                    ? `${(value.page - 1) * value.page_size + 1}-${Math.min(value.page * value.page_size, value.total)}`
                    : '0-0'}{' '}
                  / {value.total}
                </span>
                <div>
                  <AppButton
                    label={t('上一页消息', 'Previous messages')}
                    icon={<ChevronLeft size={15} />}
                    iconOnly
                    tone="ghost"
                    data-task-turn-page="previous"
                    disabled={
                      busy || operation.current || saveLocked || value.page <= 1
                    }
                    onClick={() => changePage(value.page - 1, 'previous')}
                  />
                  <span>
                    {value.page} / {value.total_pages}
                  </span>
                  <AppButton
                    label={t('下一页消息', 'Next messages')}
                    icon={<ChevronRight size={15} />}
                    iconOnly
                    tone="ghost"
                    data-task-turn-page="next"
                    disabled={
                      busy || operation.current || saveLocked || !value.has_more
                    }
                    onClick={() => changePage(value.page + 1, 'next')}
                  />
                </div>
              </footer>
            </>
          )}
        </>
      )}
      {discardOpen && (
        <AppDraftGuard
          title={t(
            '放弃未保存的补充要求？',
            'Discard unsaved supplemental requirements?',
          )}
          description={t(
            '补充要求尚未保存。',
            'These requirements have not been saved.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃更改', 'Discard changes')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            setDiscardOpen(false)
          }}
          onDiscard={() => {
            if (guard.current.busy) return
            guard.current = { dirty: false, busy: false }
            setDraft('')
            setSave({ phase: 'idle' })
            setDiscardOpen(false)
            confirmWorkbenchNavigation()
          }}
        />
      )}
    </section>
  )
}
