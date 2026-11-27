import { AppBadge } from '../components/ui'
import type {
  NestedGate,
  NestedOwnPlan,
  OutcomeSummary,
  TaskOutcome,
} from './task-plan-nesting'
import type { Copy } from './state'
import { taskWorkspaceHref } from './task-workspace-location'

export function NestedChildrenSummary({
  plan,
  t,
}: {
  plan: NestedOwnPlan<OutcomeSummary>
  t: Copy
}) {
  const accepted = plan.children.filter(
    (child) => child.state === 'accepted',
  ).length
  return (
    <div className="wb-nested-summary">
      <span>
        {t('直接子任务报告已接受', 'Direct child reports accepted')} {accepted}{' '}
        / {plan.children.length}
      </span>
      <span>
        {plan.ready
          ? t('子任务验收已就绪', 'Child reviews ready')
          : t('等待子任务验收', 'Awaiting child reviews')}
      </span>
      <small>
        {t(
          '本任务的运行和报告验收单独记录。',
          'This task Run and report review are recorded separately.',
        )}
      </small>
    </div>
  )
}
export function NestedGateFacts({
  gate,
  t,
  label,
  showReceipts = false,
  showOwnChildren = true,
}: {
  gate: NestedGate
  t: Copy
  label: (state: TaskOutcome['state']) => string
  showReceipts?: boolean
  showOwnChildren?: boolean
}) {
  const outcome = (item: TaskOutcome) => (
    <div className="wb-task-dependency" key={item.task_id}>
      <a
        href={taskWorkspaceHref(item.task_id, {
          tab: item.latest_run ? 'review' : 'goal',
          ...(item.latest_run ? { runId: item.latest_run.id } : {}),
        })}
      >
        {item.title}
      </a>
      <span>{label(item.state)}</span>
      {item.latest_run && <code>{item.latest_run.id}</code>}
      {item.own_plan && <NestedChildrenSummary plan={item.own_plan} t={t} />}
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
          <code className="wb-wrap">{item.completion_hash}</code>
        </details>
      )}
    </div>
  )
  return (
    <div
      className="wb-task-dependency-facts"
      data-testid="nested-task-dependencies"
    >
      <div className="wb-inline">
        <strong>{t('本任务执行条件', 'This task execution conditions')}</strong>
        <AppBadge tone={gate.ready ? 'success' : 'warning'}>
          {gate.membership === 'retired'
            ? t('所属分支已退役', 'Retired branch')
            : gate.ready
              ? t('可以安排本任务', 'Ready to arrange this task')
              : t('执行条件未满足', 'Execution conditions unmet')}
        </AppBadge>
      </div>
      {gate.membership === 'retired' && (
        <p className="wb-muted">
          {t(
            '此分支保留历史和补充记录，不能发起新执行。',
            'This branch retains history and supplemental messages and cannot start new execution.',
          )}
        </p>
      )}
      {gate.external_scopes.map((scope, index) =>
        scope.prerequisites.length || scope.membership === 'retired' ? (
          <section key={scope.task_id} className="wb-nested-scope">
            <strong>
              {index === 0
                ? t('本层前置条件', 'Prerequisites in this level')
                : t(
                    '继承的上层前置条件',
                    'Inherited ancestor prerequisites',
                  )}{' '}
              · v{scope.plan_version}
            </strong>
            {scope.membership === 'retired' && (
              <p>
                {t('该层成员已退役。', 'Membership in this level is retired.')}
              </p>
            )}
            {scope.prerequisites.map(outcome)}
          </section>
        ) : null,
      )}
      {gate.own_plan && (
        <section className="wb-nested-scope">
          <strong>
            {t('本层子任务验收', 'Child reviews in this level')} · v
            {gate.own_plan.version}
          </strong>
          <NestedChildrenSummary plan={gate.own_plan} t={t} />
          {showOwnChildren && gate.own_plan.children.map(outcome)}
        </section>
      )}
    </div>
  )
}
