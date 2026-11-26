import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { AppButton, AppLoading } from '../components/ui'
import { fetchPlanVersions, type PlanVersionPage } from './task-plan-revisions'
import type { Copy } from './state'
import { taskWorkspaceHref } from './task-workspace-location'

export function TaskPlanHistory({
  taskId,
  currentHash,
  enabled = false,
  t,
}: {
  taskId: string
  currentHash: string
  enabled?: boolean
  t: Copy
}) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{
    taskId: string
    currentHash: string
    page: number
    value?: PlanVersionPage
    busy: boolean
    error: boolean
  }>()
  const generation = useRef(0)
  const root = useRef<HTMLElement>(null)
  const focus = useRef<
    { origin: Element | null; direction: 'previous' | 'next' } | undefined
  >(undefined)
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController()
    if (!enabled) return
    setState({ taskId, currentHash, page, busy: true, error: false })
    void fetchPlanVersions(taskId, page, controller.signal, enabled)
      .then((value) => {
        if (!controller.signal.aborted && version === generation.current)
          setState({
            taskId,
            currentHash,
            page,
            value,
            busy: false,
            error: false,
          })
      })
      .catch(() => {
        if (!controller.signal.aborted && version === generation.current)
          setState({ taskId, currentHash, page, busy: false, error: true })
      })
    return () => controller.abort()
  }, [taskId, currentHash, page, enabled, revision])
  const current =
    enabled &&
    state?.taskId === taskId &&
    state.currentHash === currentHash &&
    state.page === page
      ? state
      : undefined
  const busy = !current || current.busy
  useEffect(() => {
    const pending = focus.current
    if (!pending || busy) return
    focus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    const available = ':not(:disabled):not([aria-disabled="true"])'
    const target =
      root.current?.querySelector<HTMLButtonElement>(
        `[data-plan-history-page="${pending.direction}"]${available}`,
      ) ??
      root.current?.querySelector<HTMLButtonElement>(
        `[data-plan-history-retry]${available}`,
      ) ??
      root.current?.querySelector<HTMLButtonElement>(
        `[data-plan-history-page]${available}`,
      )
    target?.focus()
  }, [busy, current?.value, current?.error])
  const change = (next: number, direction: 'previous' | 'next') => {
    if (busy || !current?.value || next < 1 || next > current.value.total_pages)
      return
    focus.current = { origin: document.activeElement, direction }
    setPage(next)
  }
  return (
    <section
      ref={root}
      className="wb-plan-history"
      aria-label={t('计划版本历史', 'Plan version history')}
    >
      <div className="wb-task-plan-heading">
        <h3>{t('计划版本历史', 'Plan version history')}</h3>
        <AppButton
          label={t('刷新版本历史', 'Refresh version history')}
          icon={<RefreshCw size={15} />}
          iconOnly
          tone="ghost"
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        />
      </div>
      {!enabled ? (
        <p role="status">
          {t(
            '服务未提供计划版本历史。',
            'This server does not provide plan version history.',
          )}
        </p>
      ) : busy ? (
        <AppLoading label={t('正在读取版本历史', 'Loading version history')} />
      ) : current.error ? (
        <div role="alert" className="wb-error">
          <p>{t('版本历史读取失败。', 'Version history could not be read.')}</p>
          <AppButton
            label={t('重试版本历史', 'Retry version history')}
            icon={<RefreshCw size={15} />}
            data-plan-history-retry
            onClick={() => setRevision((value) => value + 1)}
          />
        </div>
      ) : (
        current.value && (
          <>
            <ol className="wb-plan-history-items">
              {current.value.items.map((version) => (
                <li key={version.version}>
                  <details className="wb-disclosure">
                    <summary>
                      v{version.version} · {version.created_at}
                    </summary>
                    <code className="wb-wrap">{version.plan_hash}</code>
                    <p>
                      {t(
                        '此版本的冻结任务与依赖',
                        'Frozen tasks and dependencies in this version',
                      )}
                    </p>
                    {version.bindings.map((item) => {
                      const spec = version.definition.items.find(
                        (entry) => entry.key === item.key,
                      )!
                      return (
                        <section
                          className="wb-plan-history-task"
                          key={item.key}
                        >
                          <a href={taskWorkspaceHref(item.task.id)}>
                            {item.task.title}
                          </a>{' '}
                          <code>{item.task.id}</code>
                          <p>{item.task.goal}</p>
                          <dl className="wb-details">
                            <dt>{t('验收要求', 'Acceptance')}</dt>
                            <dd>{item.task.acceptance}</dd>
                            <dt>{t('显式资料', 'Explicit files')}</dt>
                            <dd>
                              {item.task.files.join(' · ') || t('无', 'None')}
                            </dd>
                            <dt>{t('前置任务', 'Prerequisites')}</dt>
                            <dd>
                              {spec.depends_on
                                .map(
                                  (key) =>
                                    version.bindings.find(
                                      (other) => other.key === key,
                                    )!.task.title,
                                )
                                .join(' · ') || t('无', 'None')}
                            </dd>
                          </dl>
                        </section>
                      )
                    })}
                  </details>
                </li>
              ))}
            </ol>
            <div className="wb-task-plan-heading">
              <span>
                {t('版本', 'Versions')} {current.value.total} ·{' '}
                {current.value.page} / {current.value.total_pages}
              </span>
              <div className="wb-inline">
                <AppButton
                  label={t('上一页版本', 'Previous versions')}
                  icon={<ChevronLeft size={15} />}
                  data-plan-history-page="previous"
                  disabled={busy || current.value.page <= 1}
                  onClick={() => change(current.value!.page - 1, 'previous')}
                />
                <AppButton
                  label={t('下一页版本', 'Next versions')}
                  icon={<ChevronRight size={15} />}
                  data-plan-history-page="next"
                  disabled={busy || !current.value.has_more}
                  onClick={() => change(current.value!.page + 1, 'next')}
                />
              </div>
            </div>
          </>
        )
      )}
    </section>
  )
}
