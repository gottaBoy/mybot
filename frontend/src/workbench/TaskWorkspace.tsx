import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
  Play,
  RefreshCw,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react'
import { AppBadge, AppButton, AppLoading, AppSegments } from '../components/ui'
import type { Bootstrap, Task } from './api'
import { pushWorkbenchNavigation } from './navigation-guard'
import {
  readTaskWorkspaceLocation,
  taskWorkspaceHref,
  type TaskWorkspaceTab,
} from './task-workspace-location'
import { statusText, statusTone, type Copy, type Locale } from './state'
import { useProjectDetail } from './useProjectDetail'
import { useTaskWorkspace } from './useTaskWorkspace'
import './task-workspace.css'

const RunWorkspace = lazy(() =>
  import('./RunWorkspace').then((module) => ({
    default: module.RunWorkspace,
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
  preparing?: boolean
}

export function TaskWorkspace({
  taskId,
  data,
  refreshRevision,
  t,
  locale,
  legacyUrl,
  onPrepare,
  preparing = false,
}: TaskWorkspaceProps) {
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
  const tab = location.tab
  const runId = location.runId ?? item?.run?.id
  const root = useRef<HTMLElement>(null)
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
      data.models.length,
    ),
    navigate: Boolean(item && !read.busy && !read.error),
  }
  const canNavigate = () =>
    admission.current.taskId === taskId && admission.current.navigate
  const prepare = () => {
    if (
      !item ||
      !admission.current.prepare ||
      admission.current.taskId !== taskId ||
      admission.current.identity !== identity
    )
      return
    onPrepare(item.task)
  }
  const navigate = (nextTab: TaskWorkspaceTab, nextRun = location.runId) => {
    if (!canNavigate()) return
    pushWorkbenchNavigation(
      taskWorkspaceHref(taskId, { tab: nextTab, runId: nextRun }),
    )
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
              value={tab}
              onChange={(value) => navigate(value as TaskWorkspaceTab)}
              options={[
                {
                  value: 'goal',
                  label: t('目标与验收', 'Goal & acceptance'),
                  icon: <ListChecks size={16} />,
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
          {tab === 'goal' ? (
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
