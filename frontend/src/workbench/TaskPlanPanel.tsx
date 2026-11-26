import { ArrowRight, GitBranch, RefreshCw } from 'lucide-react'
import { AppBadge, AppButton, AppLoading } from '../components/ui'
import { taskWorkspaceHref } from './task-workspace-location'
import { type Copy } from './state'
import type { ReviewState, TaskPlanRead, DependencyGate } from './task-plans'
import './task-plans.css'

export function reviewLabel(state: ReviewState, t: Copy) {
  const labels: Record<ReviewState, string> = {
    no_run: t('尚未运行', 'Not run'),
    run_unfinished: t('运行尚未结束', 'Run unfinished'),
    run_failed: t('最近运行未成功', 'Latest run did not succeed'),
    report_missing: t('缺少最终报告', 'Final report missing'),
    report_unavailable: t('报告无法核验', 'Report unavailable'),
    review_pending: t('等待报告验收', 'Awaiting report review'),
    changes_requested: t('报告要求修改', 'Changes requested'),
    accepted: t('最近报告已接受', 'Latest report accepted'),
  }
  return labels[state]
}
export function TaskDependencyFacts({
  gate,
  t,
  showReceipts = false,
}: {
  gate: DependencyGate
  t: Copy
  showReceipts?: boolean
}) {
  return (
    <div className="wb-task-dependency-facts" data-testid="task-dependencies">
      <div className="wb-inline">
        <strong>{t('执行前置条件', 'Execution prerequisites')}</strong>
        <AppBadge tone={gate.ready ? 'success' : 'warning'}>
          {gate.ready
            ? t('前置条件已满足', 'Prerequisites satisfied')
            : t('等待前置验收', 'Waiting for prerequisite review')}
        </AppBadge>
      </div>
      {gate.prerequisites.map((item) => (
        <div key={item.task_id} className="wb-task-dependency">
          <a
            href={taskWorkspaceHref(item.task_id, {
              tab: item.latest_run ? 'review' : 'goal',
              ...(item.latest_run ? { runId: item.latest_run.id } : {}),
            })}
          >
            {item.title}
          </a>
          <span>{reviewLabel(item.state, t)}</span>
          {item.latest_run && <code>{item.latest_run.id}</code>}
          {showReceipts && item.reports.length > 0 && (
            <details className="wb-disclosure">
              <summary>{t('报告凭据', 'Report receipts')}</summary>
              {item.reports.map((report) => (
                <p key={report.id}>
                  <code>{report.id}</code>
                  <br />
                  <code>
                    {report.sha256 ?? t('内容不可核验', 'Content unavailable')}
                  </code>
                </p>
              ))}
            </details>
          )}
        </div>
      ))}
    </div>
  )
}
export function TaskPlanPanel({
  value,
  busy,
  error,
  t,
  onRefresh,
  onCreate,
  canCreate,
}: {
  value?: TaskPlanRead
  busy: boolean
  error?: string
  t: Copy
  onRefresh: () => void
  onCreate: () => void
  canCreate: boolean
}) {
  return (
    <section
      className="wb-task-plan"
      aria-label={t('任务拆解与依赖', 'Task breakdown & dependencies')}
    >
      <div className="wb-task-plan-heading">
        <h2>{t('任务拆解与依赖', 'Task breakdown & dependencies')}</h2>
        <AppButton
          label={t('刷新任务依赖', 'Refresh task dependencies')}
          icon={<RefreshCw size={16} />}
          iconOnly
          tone="ghost"
          disabled={busy}
          onClick={onRefresh}
        />
      </div>
      {error ? (
        <p className="wb-error" role="alert">
          {t(
            '任务依赖读取失败，暂不能发起新的运行。',
            'Task dependencies could not be read. New execution is blocked.',
          )}
        </p>
      ) : !value ? (
        <AppLoading
          label={t('正在核对任务依赖', 'Checking task dependencies')}
        />
      ) : (
        <>
          {value.parent && (
            <a
              className="wb-inline"
              href={taskWorkspaceHref(value.parent.task_id)}
            >
              <GitBranch size={16} />
              {value.parent.title}
            </a>
          )}
          {value.gate && <TaskDependencyFacts gate={value.gate} t={t} />}
          {value.plan ? (
            <ol className="wb-task-plan-items">
              {value.plan.items.map((item) => (
                <li key={item.task.id}>
                  <div className="wb-task-plan-item-heading">
                    <a href={taskWorkspaceHref(item.task.id)}>
                      {item.task.title}
                    </a>
                    <AppBadge
                      tone={
                        item.review.state === 'accepted'
                          ? 'success'
                          : item.gate.ready
                            ? 'neutral'
                            : 'warning'
                      }
                    >
                      {reviewLabel(item.review.state, t)}
                    </AppBadge>
                    <AppButton
                      label={t('打开子任务', 'Open subtask')}
                      icon={<ArrowRight size={15} />}
                      iconOnly
                      tone="ghost"
                      href={taskWorkspaceHref(item.task.id)}
                    />
                  </div>
                  <p>{item.task.goal}</p>
                  <dl className="wb-details">
                    <dt>{t('验收要求', 'Acceptance')}</dt>
                    <dd>{item.task.acceptance}</dd>
                    <dt>{t('前置任务', 'Prerequisites')}</dt>
                    <dd>
                      {item.gate.prerequisites.length
                        ? item.gate.prerequisites
                            .map((dependency) => dependency.title)
                            .join(' · ')
                        : t('无', 'None')}
                    </dd>
                  </dl>
                  {!item.gate.ready && (
                    <span className="wb-muted">
                      {t(
                        '等待前置任务的成功运行及报告验收',
                        'Waiting for successful prerequisite runs and accepted reports',
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            !value.parent && (
              <AppButton
                label={t('拆分任务', 'Break down task')}
                icon={<GitBranch size={16} />}
                disabled={!canCreate || busy}
                onClick={onCreate}
              />
            )
          )}
        </>
      )}
    </section>
  )
}
