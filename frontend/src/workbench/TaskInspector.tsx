import { useEffect, useRef, useState, type Ref } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FolderGit2,
  RefreshCw,
  X,
} from 'lucide-react'
import { AppBadge, AppButton, AppLoading } from '../components/ui'
import { ApiError, type Bootstrap, type Task } from './api'
import type { WorkItem } from './projections'
import { statusText, statusTone, type Copy } from './state'
import { fetchTaskDetail, type TaskDetail } from './task-detail'
import { taskWorkspaceHref } from './task-workspace-location'

type DetailState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: TaskDetail
  error?: 'forbidden' | 'unavailable' | 'timeout' | 'invalid'
}

export function TaskInspector({
  id,
  titleRef,
  showClose,
  item,
  data,
  refreshRevision,
  scopeProjectId,
  t,
  when,
  onClose,
  onPrepare,
}: {
  id: string
  titleRef: Ref<HTMLHeadingElement>
  showClose: boolean
  item: WorkItem
  data: Bootstrap
  refreshRevision: number
  scopeProjectId?: string
  t: Copy
  when: (value?: string) => string
  onClose: () => void
  onPrepare: (task: Task) => void
}) {
  const enabled = data.capabilities.task_detail === true
  const [paging, setPaging] = useState({ taskId: item.id, page: 1 })
  const page = paging.taskId === item.id ? paging.page : 1
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<DetailState>()
  const pagerRef = useRef<HTMLElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<{
    direction: 'previous' | 'next'
    origin: HTMLElement
  }>(undefined)
  const key = JSON.stringify([
    data.workspace,
    enabled,
    item.id,
    scopeProjectId,
    page,
  ])
  const itemRevision = JSON.stringify([
    item.task,
    item.projectName,
    item.run,
    item.attempts,
  ])
  const observed = useRef({ data, refreshRevision, itemRevision })
  useEffect(() => {
    if (!enabled) {
      setState(undefined)
      return
    }
    const controller = new AbortController()
    let active = true
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)
    setState((previous) => ({
      key,
      kind: 'loading',
      value: previous?.key === key ? previous.value : undefined,
    }))
    void fetchTaskDetail(
      { taskId: item.id, scopeProjectId, page, pageSize: 20 },
      controller.signal,
    )
      .then((value) => {
        if (active && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((error: unknown) => {
        if (!active || (controller.signal.aborted && !timedOut)) return
        setState({
          key,
          kind: 'error',
          error: timedOut
            ? 'timeout'
            : error instanceof ApiError && error.status === 403
              ? 'forbidden'
              : error instanceof ApiError && error.status === 404
                ? 'unavailable'
                : 'invalid',
        })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, key, refreshRevision, retry])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision, itemRevision }
    if (
      previous.refreshRevision === refreshRevision &&
      (previous.data !== data || previous.itemRevision !== itemRevision) &&
      state?.key === key &&
      state.kind === 'ready'
    )
      setRetry((value) => value + 1)
  }, [data, refreshRevision, itemRevision, key, state])
  const current = state?.key === key ? state : undefined
  const detail = enabled ? current?.value : undefined
  const busy = enabled && (!current || current.kind === 'loading')
  const failed = enabled && current?.kind === 'error'
  useEffect(() => {
    if (
      !pageFocus.current ||
      (current?.kind !== 'ready' && current?.kind !== 'error')
    )
      return
    const { direction, origin } = pageFocus.current
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== origin
    )
      return
    if (current.kind === 'error') {
      retryRef.current?.focus()
      return
    }
    const preferred = pagerRef.current?.querySelector<HTMLButtonElement>(
      `[data-history-page="${direction}"]:not(:disabled):not([aria-disabled="true"])`,
    )
    const target =
      preferred ??
      pagerRef.current?.querySelector<HTMLButtonElement>(
        'button:not(:disabled):not([aria-disabled="true"])',
      )
    if (target) target.focus()
    else document.getElementById(`${id}-title`)?.focus()
  }, [current, id])
  const display = detail?.item ?? item
  const history = enabled
    ? (detail?.history.items ?? [])
    : data.runs
        .filter((run) => run.task_id === item.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const available = !enabled || Boolean(detail)
  const historyTotal = enabled ? detail?.history.total : history.length
  const errorText =
    current?.error === 'forbidden'
      ? t('没有读取任务详情的权限。', 'Task details access is forbidden.')
      : current?.error === 'unavailable'
        ? t(
            '任务详情不可用或已移除。',
            'Task details are unavailable or removed.',
          )
        : current?.error === 'timeout'
          ? t('读取任务详情超时。', 'Reading task details timed out.')
          : t(
              '任务详情未通过验证，未显示内容。',
              'Task details could not be validated. No content was shown.',
            )
  return (
    <div className="wf-task-inspector" id={id} aria-busy={busy || undefined}>
      <header>
        <span>{t('任务详情', 'Task details')}</span>
        {showClose && (
          <AppButton
            label={t('关闭任务详情', 'Close task details')}
            icon={<X size={16} />}
            iconOnly
            tone="ghost"
            tooltip={false}
            size="sm"
            onClick={onClose}
          />
        )}
      </header>
      <div className="wf-inspector-project">
        <FolderGit2 size={14} />
        <span>{display.projectName}</span>
        <code title={display.id}>{display.id.slice(0, 7)}</code>
      </div>
      <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1}>
        {display.task.title}
      </h2>
      {failed ? (
        <div className="wb-error wf-detail-error" role="alert">
          <p>{errorText}</p>
          <AppButton
            label={t('重试读取详情', 'Retry task details')}
            icon={<RefreshCw size={15} />}
            size="sm"
            ref={retryRef}
            onClick={(event) => {
              pageFocus.current = {
                direction: 'next',
                origin: event.currentTarget,
              }
              setRetry((value) => value + 1)
            }}
          />
        </div>
      ) : !available ? (
        <AppLoading label={t('正在读取任务详情', 'Loading task details')} />
      ) : (
        <>
          <div className="wf-inspector-action">
            <AppButton
              label={t('打开任务工作区', 'Open task workspace')}
              icon={<ArrowRight size={15} />}
              href={taskWorkspaceHref(display.id)}
              disabled={busy}
            />
            <AppBadge
              tone={display.run ? statusTone(display.run.status) : 'neutral'}
            >
              {display.run
                ? statusText(display.run.status, t)
                : t('未运行', 'Not started')}
            </AppBadge>
            {display.run ? (
              <AppButton
                label={t('打开最近运行', 'Open latest run')}
                tone="primary"
                icon={<ArrowRight size={15} />}
                href={`#run/${display.run.id}`}
                data-list-focus-key={`latest-run:${display.id}`}
              />
            ) : (
              <AppButton
                label={t('检查并运行', 'Review & run')}
                tone="primary"
                icon={<FileSearch size={15} />}
                disabled={busy}
                onClick={() => onPrepare(display.task)}
              />
            )}
          </div>
          <section className="wf-inspector-goal">
            <h3>{t('任务目标', 'Goal')}</h3>
            <p>{display.task.goal}</p>
          </section>
          {display.task.acceptance && (
            <section>
              <h3>{t('验收要求', 'Acceptance')}</h3>
              <p>{display.task.acceptance}</p>
            </section>
          )}
          <section>
            <h3>{t('明确选择的文件', 'Explicit files')}</h3>
            {display.task.files.length ? (
              display.task.files.map((file) => <code key={file}>{file}</code>)
            ) : (
              <p className="wb-hint">{t('未选择文件', 'No files selected')}</p>
            )}
          </section>
          <section>
            <h3>
              {t('历史运行', 'Run history')} <span>{historyTotal}</span>
            </h3>
            {history.map((run) => (
              <a
                className="wf-history-row"
                key={run.id}
                href={`#run/${run.id}`}
                data-list-focus-key={`history-run:${run.id}`}
              >
                <div>
                  <code>{run.id.slice(0, 7)}</code>
                  <small>{when(run.created_at)}</small>
                </div>
                <AppBadge tone={statusTone(run.status)}>
                  {statusText(run.status, t)}
                </AppBadge>
                <ChevronRight size={13} />
              </a>
            ))}
            {!history.length && (
              <p className="wb-hint">{t('尚未发起运行', 'No runs yet')}</p>
            )}
            {detail && detail.history.total_pages > 1 && (
              <nav
                ref={pagerRef}
                className="wf-history-pagination"
                aria-label={t('运行历史分页', 'Run history pagination')}
              >
                <span>
                  {(detail.history.page - 1) * 20 + 1}-
                  {Math.min(detail.history.page * 20, detail.history.total)} /{' '}
                  {detail.history.total}
                </span>
                <AppButton
                  label={t('上一页历史', 'Previous history page')}
                  icon={<ChevronLeft size={15} />}
                  iconOnly
                  tone="ghost"
                  size="sm"
                  data-history-page="previous"
                  disabled={busy || detail.history.page <= 1}
                  onClick={(event) => {
                    pageFocus.current = {
                      direction: 'previous',
                      origin: event.currentTarget,
                    }
                    setPaging({
                      taskId: item.id,
                      page: detail.history.page - 1,
                    })
                  }}
                />
                <output>
                  {detail.history.page} / {detail.history.total_pages}
                </output>
                <AppButton
                  label={t('下一页历史', 'Next history page')}
                  icon={<ChevronRight size={15} />}
                  iconOnly
                  tone="ghost"
                  size="sm"
                  data-history-page="next"
                  disabled={busy || !detail.history.has_more}
                  onClick={(event) => {
                    pageFocus.current = {
                      direction: 'next',
                      origin: event.currentTarget,
                    }
                    setPaging({
                      taskId: item.id,
                      page: detail.history.page + 1,
                    })
                  }}
                />
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  )
}
