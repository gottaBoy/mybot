import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  GitBranch,
  MessageSquare,
  Pause,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Workflow,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCheckbox,
  AppDialog,
  AppSelect,
} from '../components/ui'
import { AppMarkdown } from '../components/ui/Markdown'
import { AppAvatarGroup } from '../components/ui/Avatars'
import { ApiError, api, post, type Artifact, type RunDetail } from './api'
import { resolveCallSelection } from './call-selection'
import { pushWorkbenchNavigation } from './navigation-guard'
import {
  activeStatuses,
  errorText,
  preferredArtifact,
  statusText,
  statusTone,
  usageSummary,
  type Copy,
  type Locale,
} from './state'

const RunGraph = lazy(() =>
  import('./RunGraph').then((module) => ({ default: module.RunGraph })),
)
const AppTranscript = lazy(() =>
  import('../components/ui/Transcript').then((module) => ({
    default: module.AppTranscript,
  })),
)
const RunRecovery = lazy(() =>
  import('./RunRecovery').then((module) => ({ default: module.RunRecovery })),
)

export function RunWorkspace({
  runId,
  t,
  locale,
  legacyUrl,
  embedded = false,
  expectedTaskId,
  initialTab = 'work',
}: {
  runId?: string
  t: Copy
  locale: Locale
  legacyUrl: string
  embedded?: boolean
  expectedTaskId?: string
  initialTab?: 'work' | 'artifacts'
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [tab, setTab] = useState<string>(initialTab)
  const [artifactId, setArtifactId] = useState('')
  const [callId, setCallId] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [consent, setConsent] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState<'retry' | 'resume' | null>(
    null,
  )
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [recoveryUncertain, setRecoveryUncertain] = useState(false)
  const request = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    if (!runId) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setRefreshing(true)
    try {
      const next = await api<RunDetail>(`/runs/${encodeURIComponent(runId)}`, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      if (
        !next?.run ||
        next.run.id !== runId ||
        !next.task ||
        next.run.task_id !== next.task.id ||
        (expectedTaskId !== undefined && next.task.id !== expectedTaskId) ||
        !next.project ||
        next.project.id !== next.task.project_id
      ) {
        setDetail(null)
        throw new Error(
          locale === 'zh'
            ? '运行与当前任务不匹配。'
            : 'The run does not belong to this task.',
        )
      }
      if (!controller.signal.aborted) {
        setDetail(next)
        setError('')
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (reason instanceof ApiError && [401, 403, 404].includes(reason.status))
          setDetail(null)
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (!controller.signal.aborted) setRefreshing(false)
    }
  }, [runId, expectedTaskId, locale])
  useEffect(() => {
    void refresh()
    return () => request.current?.abort()
  }, [refresh])
  useEffect(() => {
    if (!detail || !activeStatuses.has(detail.run.status)) return
    const timer = window.setInterval(() => {
      if (!document.hidden && !refreshing && !busy) void refresh()
    }, 2500)
    return () => clearInterval(timer)
  }, [detail, refresh, refreshing, busy])
  async function mutate(key: string, path: string, body: unknown) {
    if (busy) return
    setBusy(key)
    setError('')
    try {
      await post(path, body)
      setConfirmCancel(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy('')
    }
  }
  const when = (value: string) =>
    new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  const badge = (status: string) => (
    <AppBadge tone={statusTone(status)}>{statusText(status, t)}</AppBadge>
  )
  if (!runId || !detail)
    return (
      <div className="wb-empty">
        <GitBranch size={28} />
        <h1>
          {!runId
            ? t('尚无运行可查看', 'No run to view')
            : error || t('正在读取运行记录', 'Loading run')}
        </h1>
        <div className="wb-inline">
          <AppButton
            label={t('返回工作台', 'Back to workbench')}
            href="#workbench"
          />
          {runId && error && (
            <AppButton
              label={t('重新读取', 'Retry loading')}
              onClick={() => void refresh()}
            />
          )}
        </div>
      </div>
    )
  const { run, task, project, agents, calls, artifacts, events, harness } =
    detail
  const callSelection = resolveCallSelection(callId, calls)
  const artifact =
    artifacts.find((item) => item.id === artifactId) ??
    preferredArtifact(artifacts)
  const summary = usageSummary(calls)
  const report = preferredArtifact(artifacts)
  const decisionText = (value: string) =>
    value === 'pending' ? t('待审查', 'Awaiting review') : statusText(value, t)
  const artifactView = artifact ? (
    <>
      <div className="wb-artifact-toolbar">
        <FileText size={17} />
        <strong>{t('工作成果', 'Artifacts')}</strong>
        <span>{artifacts.length}</span>
      </div>
      {artifacts.length > 1 && (
        <div className="wb-artifact-select">
          <AppSelect
            label={t('选择成果', 'Select artifact')}
            hiddenLabel
            value={artifact.id}
            options={artifacts.map((item) => ({
              value: item.id,
              label: item.title,
            }))}
            onChange={setArtifactId}
          />
        </div>
      )}
      <article className="wb-artifact-content">
        <div className="wb-inline">
          <AppBadge tone={statusTone(artifact.decision)}>
            {decisionText(artifact.decision)}
          </AppBadge>
          <small className="wb-muted">{artifact.kind}</small>
        </div>
        <h2>{artifact.title}</h2>
        <p className="wb-hint">{when(artifact.created_at)}</p>
        <AppMarkdown>{artifact.content}</AppMarkdown>
      </article>
      <div className="wb-artifact-actions">
        <AppButton
          label={t('接受方案', 'Accept')}
          icon={<Check size={15} />}
          size="sm"
          disabled={!!busy || artifact.decision === 'accepted'}
          busy={busy === 'accept'}
          onClick={() =>
            void mutate('accept', `/artifacts/${artifact.id}/decision`, {
              decision: 'accepted',
            })
          }
        />
        <AppButton
          label={t('要求修改', 'Request changes')}
          icon={<Pencil size={15} />}
          size="sm"
          disabled={!!busy || artifact.decision === 'changes_requested'}
          busy={busy === 'changes'}
          onClick={() =>
            void mutate('changes', `/artifacts/${artifact.id}/decision`, {
              decision: 'changes_requested',
            })
          }
        />
        <AppButton
          label={t('下载成果', 'Download artifact')}
          icon={<Download size={16} />}
          iconOnly
          size="sm"
          tone="ghost"
          onClick={() => downloadArtifact(artifact)}
        />
      </div>
    </>
  ) : (
    <div className="wb-empty">
      <FileCheck2 size={28} />
      <h2>{t('等待研究成果', 'Waiting for artifacts')}</h2>
    </div>
  )
  return (
    <>
      {error && (
        <div role="alert" className="wb-error wb-banner">
          <span>{error}</span>
          <AppButton
            label={t('重新同步', 'Resync')}
            icon={<RefreshCw size={15} />}
            size="sm"
            onClick={() => void refresh()}
          />
        </div>
      )}
      <div
        className={`wb-run-heading${embedded ? ' wb-run-embedded-heading' : ''}`}
      >
        <div>
          <a
            className="wb-text-link"
            href={embedded ? `#run/${run.id}` : `#project/${project.id}`}
          >
            <ArrowLeft size={14} />
            {embedded
              ? t('完整运行工作区', 'Full run workspace')
              : project.name}
          </a>
          {embedded ? (
            <h2>
              {t('运行', 'Run')} {run.id.slice(0, 8)}
            </h2>
          ) : (
            <>
              <h1>{task.title}</h1>
              <p className="wb-muted">{task.goal}</p>
            </>
          )}
        </div>
        <div className="wb-inline">
          <AppButton
            label={t('刷新运行', 'Refresh run')}
            tone="ghost"
            icon={<RefreshCw size={16} />}
            iconOnly
            busy={refreshing}
            onClick={() => void refresh()}
          />
          {['queued', 'running'].includes(run.status) && (
            <AppButton
              label={t('暂停', 'Pause')}
              icon={<Pause size={16} />}
              busy={busy === 'pause'}
              disabled={!!busy}
              onClick={() => void mutate('pause', `/runs/${run.id}/pause`, {})}
            />
          )}
          {[
            'queued',
            'running',
            'paused',
            'interrupted',
            'pause_requested',
          ].includes(run.status) && (
            <AppButton
              label={t('取消', 'Cancel')}
              icon={<Square size={14} />}
              disabled={!!busy}
              onClick={() => {
                setConsent(false)
                setConfirmCancel(true)
              }}
            />
          )}
          {!['failed', 'paused', 'interrupted', 'canceled'].includes(
            run.status,
          ) && (
            <AppButton
              label={t('恢复请求记录', 'Recovery request history')}
              icon={<RotateCcw size={15} />}
              disabled={!!busy}
              onClick={() => {
                setRecoveryMode('retry')
                setRecoveryOpen(true)
              }}
            />
          )}
          {['failed', 'paused', 'interrupted', 'canceled'].includes(
            run.status,
          ) && (
            <>
              <AppButton
                label={
                  recoveryUncertain
                    ? t('核对恢复请求', 'Check recovery request')
                    : t('重试与资源', 'Retry & resources')
                }
                icon={<RotateCcw size={15} />}
                disabled={!!busy}
                onClick={() => {
                  if (!recoveryUncertain) setRecoveryMode('retry')
                  setRecoveryOpen(true)
                }}
              />
              {run.status === 'paused' &&
                !detail.retry_runs.length &&
                !recoveryUncertain && (
                  <AppButton
                    label={t('继续运行', 'Resume')}
                    icon={<ArrowRight size={15} />}
                    disabled={!!busy}
                    onClick={() => {
                      setRecoveryMode('resume')
                      setRecoveryOpen(true)
                    }}
                  />
                )}
              <AppButton
                label={t('旧版：重试与资源', 'Classic: retry & resources')}
                icon={<ExternalLink size={15} />}
                tone="ghost"
                href={`${legacyUrl}/#run/${run.id}`}
                target="_blank"
                rel="noreferrer"
              />
            </>
          )}
        </div>
      </div>
      <div className="wb-run-axes">
        <div>
          <small>{t('执行', 'Execution')}</small>
          {badge(run.status)}
        </div>
        <div>
          <small>{t('测试', 'Tests')}</small>
          <span>{t('未执行', 'Not run')}</span>
        </div>
        <div>
          <small>{t('人工审查', 'Human review')}</small>
          <span>
            {report
              ? decisionText(report.decision)
              : t('暂无成果', 'No artifact')}
          </span>
        </div>
        <AppAvatarGroup
          label={t('当前运行 Agent', 'Run agents')}
          items={agents.map((agent) => ({
            id: agent.id,
            name: agent.title,
            status: agent.status,
            stateLabel: statusText(agent.status, t),
          }))}
          onExpand={() => setTab('work')}
        />
        <code>RUN {run.id.slice(0, 8)}</code>
      </div>
      {run.error && (
        <div className="wb-error wb-run-warning" role="status">
          <strong>{errorText(run.error, t)}</strong>
          <p>
            {t(
              '已完成结果保留。未知结果或用量不等于未计费，重试前请检查预算。',
              'Completed results are retained. Unknown outcomes or usage may still be billed. Check the budget before retrying.',
            )}
          </p>
          <code>{run.error}</code>
        </div>
      )}
      {run.status === 'pause_requested' && (
        <p className="wb-notice">
          {t(
            '当前阶段及在途调用结束后暂停，不表示 Provider 立即停止。',
            'Pauses after the current stage and in-flight calls finish; the provider may still be working.',
          )}
        </p>
      )}
      {(run.source_run_id || detail.retry_runs.length > 0) && (
        <div className="wb-lineage">
          <GitBranch size={15} />
          {run.source_run_id && (
            <a href={`#run/${run.source_run_id}`}>
              {t('来源运行', 'Source run')} {run.source_run_id.slice(0, 7)}
            </a>
          )}
          {detail.retry_runs.map((item) => (
            <a href={`#run/${item.id}`} key={item.id}>
              {t('关联重试', 'Linked retry')} {item.id.slice(0, 7)}
              <ChevronRight size={13} />
            </a>
          ))}
        </div>
      )}
      <section
        className="wb-workflow"
        aria-label={t('Agent 工作阶段', 'Agent work stages')}
      >
        {harness.stages.map((stage, index) => (
          <div className="wb-stage" key={stage.key} data-status={stage.status}>
            <span className="wb-stage-number">
              {stage.status === 'succeeded' ? (
                <Check size={16} />
              ) : (
                `0${index + 1}`
              )}
            </span>
            <div>
              <div className="wb-stage-title">
                <strong>
                  {[
                    t('规划', 'Planning'),
                    t('研究', 'Research'),
                    t('汇总', 'Synthesis'),
                  ][index] ?? stage.title}
                </strong>
                {badge(stage.status)}
              </div>
              <small>
                {stage.agent_count} Agent · {stage.call_count}{' '}
                {t('调用', 'calls')} · {stage.artifact_count}{' '}
                {t('成果', 'artifacts')}
              </small>
            </div>
            {index < harness.stages.length - 1 && (
              <ChevronRight className="wb-stage-arrow" size={16} />
            )}
          </div>
        ))}
      </section>
      <div
        className="wb-run-tabs"
        role="group"
        aria-label={t('运行视图', 'Run view')}
      >
        {(
          [
            ['work', t('工作记录', 'Activity'), MessageSquare],
            ['graph', t('工作图', 'Work graph'), Workflow],
            ['chat', t('对话', 'Conversation'), MessageSquare],
            [
              'artifacts',
              `${t('成果', 'Artifacts')} ${artifacts.length}`,
              FileText,
            ],
            ['calls', `${t('调用', 'Calls')} ${calls.length}`, GitBranch],
            ['audit', t('审计', 'Audit'), ShieldCheck],
          ] as const
        ).map(([key, label, Icon]) => (
          <AppButton
            key={key}
            label={label}
            icon={<Icon size={15} />}
            tone={tab === key ? 'secondary' : 'ghost'}
            aria-pressed={tab === key}
            size="sm"
            onClick={() => setTab(key)}
          />
        ))}
        <small>
          {calls.length} / {run.config.max_calls} {t('次调用', 'calls')}
        </small>
      </div>
      {tab === 'graph' ? (
        <Suspense
          fallback={
            <p role="status">{t('正在读取工作图', 'Loading work graph')}</p>
          }
        >
          <RunGraph
            detail={detail}
            t={t}
            onCalls={() => setTab('calls')}
            onArtifact={(id) => {
              setArtifactId(id)
              setTab('artifacts')
            }}
          />
        </Suspense>
      ) : tab === 'chat' ? (
        <div className="wb-run-transcript">
          <Suspense
            fallback={
              <p role="status">{t('正在读取对话', 'Loading conversation')}</p>
            }
          >
            <AppTranscript
              items={[
                {
                  id: 'goal',
                  sender: 'user',
                  title: task.title,
                  content: task.goal,
                },
                ...[...agents].reverse().map((agent) => ({
                  id: agent.id,
                  sender: 'assistant' as const,
                  title: agent.title,
                  content: agent.output ?? agent.objective,
                  metadata: badge(agent.status),
                })),
              ]}
            />
          </Suspense>
        </div>
      ) : tab === 'work' ? (
        <div className="wb-run-studio">
          <section className="wb-activity">
            <details className="wb-disclosure">
              <summary>
                {t('已确认的上下文边界', 'Confirmed context boundary')}
              </summary>
              <p>{task.acceptance}</p>
              <p>
                {t('明确文件', 'Explicit files')}: {run.context.evidence.length}
              </p>
              {run.context.evidence.map((item) => (
                <p key={item.path}>
                  <code>{item.path}</code> · {item.bytes} bytes
                </p>
              ))}
              <p>
                {t(
                  '工作台为只读研究模式；底层 CLI 工具隔离不等于已完整验收。',
                  'Workbench uses read-only research mode; this is not full verification of underlying CLI tool isolation.',
                )}
              </p>
            </details>
            {[...agents].reverse().map((agent) => (
              <article className="wb-agent" key={agent.id}>
                <span className={`wb-agent-avatar wb-agent-${agent.role}`}>
                  <GitBranch size={17} />
                </span>
                <div className="wb-agent-body">
                  <div className="wb-agent-meta">
                    <strong>
                      {agent.role === 'coordinator'
                        ? 'Super-agent'
                        : agent.role === 'reviewer'
                          ? t('汇总 Agent', 'Synthesis agent')
                          : t('研究 Agent', 'Research agent')}
                    </strong>
                    {badge(agent.status)}
                    {agent.source_agent_id && (
                      <AppBadge>{t('复用原结果', 'Reused result')}</AppBadge>
                    )}
                  </div>
                  <h2>{agent.title}</h2>
                  <p>{agent.objective}</p>
                  {agent.output && (
                    <details className="wb-agent-output">
                      <summary>{t('查看输出', 'View output')}</summary>
                      <AppMarkdown>{agent.output}</AppMarkdown>
                    </details>
                  )}
                </div>
              </article>
            ))}
            {!agents.length && (
              <div className="wb-empty">
                <GitBranch size={25} />
                <h2>{t('等待 Worker 接收任务', 'Waiting for worker')}</h2>
              </div>
            )}
          </section>
          <aside className="wb-artifact-pane">{artifactView}</aside>
        </div>
      ) : tab === 'artifacts' ? (
        <div className="wb-artifact-full">{artifactView}</div>
      ) : tab === 'calls' ? (
        <section>
          <div className="wb-usage-strip">
            <div>
              <small>{t('已返回 Token', 'Reported tokens')}</small>
              <strong>
                {calls.length &&
                summary.incomplete === calls.length &&
                summary.knownTokens === 0
                  ? t('未知', 'Unknown')
                  : summary.knownTokens.toLocaleString()}
              </strong>
              <span>
                {summary.incomplete}{' '}
                {t('次用量不完整', 'calls with incomplete usage')}
              </span>
            </div>
            <div>
              <small>{t('金额', 'Cost')}</small>
              <strong>{t('未知', 'Unknown')}</strong>
              <span>{t('未配置价格快照', 'No pricing snapshot')}</span>
            </div>
            <div>
              <small>
                {t('研究实际并行上限', 'Effective research concurrency')}
              </small>
              <strong>{harness.parallel_limit}</strong>
            </div>
          </div>
          <div
            className="wb-table-scroll"
            tabIndex={0}
            role="region"
            aria-label={t('模型调用', 'Model calls')}
          >
            <table className="wb-table">
              <thead>
                <tr>
                  {[
                    t('调用', 'Call'),
                    'Agent',
                    t('模型', 'Model'),
                    t('状态', 'Status'),
                    t('耗时', 'Duration'),
                    t('输入', 'Input'),
                    t('输出', 'Output'),
                    t('尝试', 'Attempt'),
                  ].map((title) => (
                    <th key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calls.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <AppButton
                        label={item.id.slice(0, 7)}
                        tone="ghost"
                        size="sm"
                        onClick={() => setCallId(item.id)}
                      />
                    </td>
                    <td>
                      {agents.find((agent) => agent.id === item.agent_id)
                        ?.title ?? 'Agent'}
                    </td>
                    <td>
                      <code>{item.requested_model}</code>
                    </td>
                    <td>{badge(item.status)}</td>
                    <td>
                      {item.duration_ms == null
                        ? t('未知', 'Unknown')
                        : `${(item.duration_ms / 1000).toFixed(1)}s`}
                    </td>
                    <td>{item.input_tokens ?? t('未知', 'Unknown')}</td>
                    <td>{item.output_tokens ?? t('未知', 'Unknown')}</td>
                    <td>{item.attempt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!calls.length && (
              <div className="wb-empty">
                <h2>{t('尚无模型调用', 'No model calls')}</h2>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="wb-audit">
          {[...events].reverse().map((event) => (
            <details key={event.id}>
              <summary>
                <code>#{event.seq}</code>
                <strong>{event.kind}</strong>
                <time>{when(event.created_at)}</time>
              </summary>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </details>
          ))}
        </section>
      )}
      {callSelection.kind !== 'closed' && (
        <AppDialog
          title={`${t('调用详情', 'Call details')} · ${callId.slice(0, 7)}`}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setCallId('')}
        >
          {callSelection.kind === 'available' ? (
            <div className="wb-form">
              <div className="wb-inline">
                {badge(callSelection.call.status)}
                <code>{callSelection.call.requested_model}</code>
              </div>
              <p>
                {callSelection.call.error ??
                  t('无错误记录', 'No recorded error')}
              </p>
              <pre className="wb-call-diagnostics">
                {JSON.stringify(callSelection.call, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="wb-error" role="status">
              {t(
                '调用记录暂不可用：最新运行记录中没有此调用，请重新同步后检查。',
                'Call record unavailable: this call is absent from the latest run data. Resync to check again.',
              )}
            </p>
          )}
        </AppDialog>
      )}
      {recoveryMode && (
        <Suspense fallback={null}>
          <RunRecovery
            key={`${run.id}-${recoveryMode}`}
            source={detail}
            mode={recoveryMode}
            open={recoveryOpen}
            t={t}
            legacyUrl={legacyUrl}
            onUncertain={() => setRecoveryUncertain(true)}
            onClose={() => {
              setRecoveryOpen(false)
              if (!recoveryUncertain) setRecoveryMode(null)
            }}
            onComplete={async (id) => {
              setRecoveryOpen(false)
              setRecoveryMode(null)
              setRecoveryUncertain(false)
              if (id === run.id) await refresh()
              else pushWorkbenchNavigation(`#run/${id}`)
            }}
          />
        </Suspense>
      )}
      {confirmCancel && (
        <AppDialog
          title={t('取消当前运行', 'Cancel current run')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setConfirmCancel(false)}
          busy={!!busy}
        >
          <div className="wb-form">
            <p>
              {t(
                '将请求停止后续工作。已经完成的调用和成果保留；取消不能撤销 Provider 已处理的请求或费用。',
                'Requests stopping further work. Completed calls and artifacts are retained. Cancellation cannot undo provider processing or charges.',
              )}
            </p>
            <AppCheckbox
              label={t('确认取消此运行', 'Confirm cancellation')}
              value={consent}
              onChange={setConsent}
            />
            {error && (
              <p className="wb-error" role="alert">
                {error}
              </p>
            )}
            <AppButton
              label={t('确认取消', 'Confirm cancellation')}
              tone="destructive"
              disabled={!consent}
              busy={busy === 'cancel'}
              onClick={() =>
                void mutate('cancel', `/runs/${run.id}/cancel`, {})
              }
            />
          </div>
        </AppDialog>
      )}
    </>
  )
}

function downloadArtifact(artifact: Artifact) {
  const url = URL.createObjectURL(
    new Blob([artifact.content], { type: 'text/markdown;charset=utf-8' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `mybot-${artifact.id.slice(0, 12)}.md`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
