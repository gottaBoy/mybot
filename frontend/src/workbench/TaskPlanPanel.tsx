import { useState } from 'react'
import {
  ArrowRight,
  GitBranch,
  History,
  Pencil,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { AppBadge, AppButton, AppLoading } from '../components/ui'
import { taskWorkspaceHref } from './task-workspace-location'
import { type Copy } from './state'
import type { TaskPlanRead, AnyDependencyGate } from './task-plans'
import type { OutcomeState } from './task-plan-nesting'
import { NestedChildrenSummary, NestedGateFacts } from './NestedTaskPlanFacts'
import { TaskPlanHistory } from './TaskPlanHistory'
import './task-plans.css'

const directPrerequisites = (gate: AnyDependencyGate) =>
  'schema_version' in gate
    ? (gate.external_scopes[0]?.prerequisites ?? [])
    : gate.prerequisites
export function reviewLabel(state: OutcomeState, t: Copy) {
  const labels: Record<OutcomeState, string> = {
    no_run: t('尚未运行', 'Not run'),
    run_unfinished: t('运行尚未结束', 'Run unfinished'),
    run_failed: t('最近运行未成功', 'Latest run did not succeed'),
    report_missing: t('缺少最终报告', 'Final report missing'),
    report_unavailable: t('报告无法核验', 'Report unavailable'),
    review_pending: t('等待报告验收', 'Awaiting report review'),
    changes_requested: t('报告要求修改', 'Changes requested'),
    accepted: t('最近报告已接受', 'Latest report accepted'),
    children_pending: t('等待直接子任务验收', 'Awaiting direct child reviews'),
    integration_stale: t(
      '需按当前子任务证据重新收尾验收',
      'Integration review does not match current child evidence',
    ),
    retired: t('分支已退役', 'Retired branch'),
  }
  return labels[state]
}
export function TaskDependencyFacts({
  gate,
  t,
  showReceipts = false,
  showOwnChildren = true,
}: {
  gate: AnyDependencyGate
  t: Copy
  showReceipts?: boolean
  showOwnChildren?: boolean
}) {
  if ('schema_version' in gate)
    return (
      <NestedGateFacts
        gate={gate}
        t={t}
        label={(state) => reviewLabel(state, t)}
        showReceipts={showReceipts}
        showOwnChildren={showOwnChildren}
      />
    )
  return (
    <div className="wb-task-dependency-facts" data-testid="task-dependencies">
      <div className="wb-inline">
        <strong>{t('执行前置条件', 'Execution prerequisites')}</strong>
        {gate.plan_version !== undefined && <span>v{gate.plan_version}</span>}
        <AppBadge tone={gate.ready ? 'success' : 'warning'}>
          {gate.membership === 'retired'
            ? t('旧计划任务已退役', 'Retired plan task')
            : gate.ready
              ? t('前置条件已满足', 'Prerequisites satisfied')
              : t('等待前置验收', 'Waiting for prerequisite review')}
        </AppBadge>
      </div>
      {gate.membership === 'retired' && (
        <p className="wb-muted">
          {t(
            '此任务不能发起新的执行，仍可查看历史和记录补充。请从父任务打开当前计划。',
            'This task cannot start new execution. You can still view its history and save supplemental messages. Open the current plan from its parent task.',
          )}
        </p>
      )}
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
  revisionsEnabled = false,
  onRevise,
  onSuggest,
  canSuggest = false,
  suggestionPrepared = false,
  onContinueSuggest,
  nestedEnabled = false,
}: {
  value?: TaskPlanRead
  busy: boolean
  error?: string
  t: Copy
  onRefresh: () => void
  onCreate: () => void
  canCreate: boolean
  revisionsEnabled?: boolean
  onRevise?: () => void
  onSuggest?: () => void
  canSuggest?: boolean
  suggestionPrepared?: boolean
  onContinueSuggest?: () => void
  nestedEnabled?: boolean
}) {
  const [historyOpen, setHistoryOpen] = useState(false)
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
            <nav
              className="wb-plan-ancestry"
              aria-label={t('任务层级导航', 'Task ancestry')}
            >
              {value.schema_version === 3 && value.depth === 2 && (
                <>
                  <a
                    className="wb-text-link"
                    href={taskWorkspaceHref(value.root_task_id)}
                  >
                    {t('根任务', 'Root task')} · {value.root_task_id}
                  </a>
                  <ArrowRight size={13} aria-hidden />
                </>
              )}
              <a
                className="wb-inline"
                href={taskWorkspaceHref(value.parent.task_id)}
              >
                <GitBranch size={16} />
                {value.parent.title}
              </a>
            </nav>
          )}
          {value.gate && (
            <TaskDependencyFacts
              gate={value.gate}
              t={t}
              showOwnChildren={!value.plan}
            />
          )}
          {value.plan ? (
            <>
              <div className="wb-task-plan-heading">
                <strong>
                  {t('当前计划', 'Current plan')} · v{value.plan.version}
                </strong>
                {revisionsEnabled && (
                  <div className="wb-inline">
                    <AppButton
                      label={t('修订计划', 'Revise plan')}
                      icon={<Pencil size={15} />}
                      disabled={!canCreate || busy || value.plan.version >= 100}
                      onClick={onRevise}
                    />
                    <AppButton
                      label={t('版本历史', 'Version history')}
                      icon={<History size={15} />}
                      aria-expanded={historyOpen}
                      disabled={busy}
                      onClick={() => setHistoryOpen((open) => !open)}
                    />
                  </div>
                )}
                {canSuggest && onSuggest && (
                  <AppButton
                    label={t('获取AI建议', 'Get AI suggestion')}
                    icon={<Sparkles size={15} />}
                    disabled={busy}
                    onClick={onSuggest}
                  />
                )}
                {suggestionPrepared && onContinueSuggest && (
                  <AppButton
                    label={t('继续AI建议', 'Continue AI suggestion')}
                    icon={<Sparkles size={15} />}
                    disabled={busy}
                    onClick={onContinueSuggest}
                  />
                )}
              </div>
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
                        {directPrerequisites(item.gate).length
                          ? directPrerequisites(item.gate)
                              .map((dependency) => dependency.title)
                              .join(' · ')
                          : t('无', 'None')}
                      </dd>
                    </dl>
                    {'kind' in item.review && item.review.own_plan && (
                      <NestedChildrenSummary
                        plan={item.review.own_plan}
                        t={t}
                      />
                    )}
                    {!item.gate.ready && (
                      <span className="wb-muted">
                        {'schema_version' in item.gate
                          ? t(
                              '等待本层或上层执行条件，打开任务查看原因。',
                              'Waiting for local or ancestor conditions. Open the task for the reasons.',
                            )
                          : t(
                              '等待前置任务的成功运行及报告验收',
                              'Waiting for successful prerequisite runs and accepted reports',
                            )}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {historyOpen && revisionsEnabled && (
                <TaskPlanHistory
                  taskId={value.task_id}
                  currentHash={value.plan.plan_hash}
                  enabled={revisionsEnabled}
                  t={t}
                />
              )}
            </>
          ) : (
            (!value.parent ||
              (nestedEnabled &&
                value.schema_version === 3 &&
                value.gate.membership === 'current') ||
              (nestedEnabled &&
                value.schema_version !== 3 &&
                value.gate?.membership !== 'retired')) && (
              <div className="wb-inline">
                <AppButton
                  label={t('拆分任务', 'Break down task')}
                  icon={<GitBranch size={16} />}
                  disabled={
                    !canCreate ||
                    busy ||
                    (value.schema_version === 3 && value.depth >= 2)
                  }
                  onClick={onCreate}
                />
                {canSuggest && onSuggest && (
                  <AppButton
                    label={t('获取AI建议', 'Get AI suggestion')}
                    icon={<Sparkles size={15} />}
                    disabled={busy}
                    onClick={onSuggest}
                  />
                )}
                {suggestionPrepared && onContinueSuggest && (
                  <AppButton
                    label={t('继续AI建议', 'Continue AI suggestion')}
                    icon={<Sparkles size={15} />}
                    disabled={busy}
                    onClick={onContinueSuggest}
                  />
                )}
              </div>
            )
          )}
          {nestedEnabled &&
            value.schema_version === 3 &&
            value.depth >= 2 &&
            !value.plan && (
              <p className="wb-muted">
                {t(
                  '此任务已达到最大拆解层级。',
                  'This task is at the maximum breakdown depth.',
                )}
              </p>
            )}
        </>
      )}
    </section>
  )
}
