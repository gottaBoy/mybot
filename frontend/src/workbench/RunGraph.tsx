import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronRight,
  GitBranch,
  Maximize,
  Minus,
  Plus,
} from 'lucide-react'
import { AppBadge, AppButton, AppSelect } from '../components/ui'
import type { RunDetail } from './api'
import { statusText, statusTone, type Copy } from './state'
import { runStageTitle } from './run-stages'

export function RunGraph({
  detail,
  t,
  onCalls,
  onArtifact,
}: {
  detail: RunDetail
  t: Copy
  onCalls: () => void
  onArtifact: (id: string) => void
}) {
  const [selected, setSelected] = useState(
    (detail.run.context.mode === 'coding-v1'
      ? (detail.harness.stages.find((stage) => stage.status === 'running')
          ?.key ?? detail.harness.stages.at(-1)?.key)
      : detail.harness.stages.find(
          (stage) => stage.status === 'failed' || stage.status === 'running',
        )?.key) ?? detail.harness.stages[0]?.key,
  )
  const [zoom, setZoom] = useState(100)
  const stage =
    detail.harness.stages.find((stage) => stage.key === selected) ??
    detail.harness.stages[0]
  const stageNames = detail.harness.stages.map((item) => runStageTitle(item, t))
  const members = detail.agents.filter((agent) =>
    stage?.agent_ids
      ? stage.agent_ids.includes(agent.id)
      : agent.role ===
        {
          planning: 'coordinator',
          research: 'researcher',
          synthesis: 'reviewer',
        }[stage?.key ?? ''],
  )
  const outputs = detail.artifacts.filter((artifact) =>
    members.some((agent) => agent.id === artifact.agent_id),
  )
  return (
    <section
      className="wb-graph-editor"
      aria-label={t('运行工作图', 'Run work graph')}
    >
      <header className="wb-graph-tools">
        <div className="wb-inline">
          <GitBranch size={16} />
          <strong>{t('工作图', 'Work graph')}</strong>
          <AppBadge>
            {detail.run.context.mode === 'coding-v1'
              ? t(
                  '实现与验证 · 只读视图',
                  'Implementation & tests · Read-only view',
                )
              : t('固定流程 · 只读', 'Fixed flow · Read only')}
          </AppBadge>
        </div>
        <div className="wb-inline">
          <AppButton
            label={t('缩小工作图', 'Zoom out')}
            icon={<Minus size={16} />}
            iconOnly
            tone="ghost"
            disabled={zoom <= 60}
            onClick={() => setZoom(Math.max(60, zoom - 10))}
          />
          <output>{zoom}%</output>
          <AppButton
            label={t('放大工作图', 'Zoom in')}
            icon={<Plus size={16} />}
            iconOnly
            tone="ghost"
            disabled={zoom >= 140}
            onClick={() => setZoom(Math.min(140, zoom + 10))}
          />
          <AppButton
            label={t('重置缩放', 'Reset zoom')}
            icon={<Maximize size={16} />}
            iconOnly
            tone="ghost"
            onClick={() => setZoom(100)}
          />
        </div>
      </header>
      <div className="wb-graph-layout">
        <nav
          className="wb-graph-rail"
          aria-label={t('阶段导航', 'Stage navigation')}
        >
          {detail.harness.stages.map((item, index) => (
            <button
              key={item.key}
              onClick={() => setSelected(item.key)}
              aria-current={selected === item.key ? 'step' : undefined}
            >
              <span>0{index + 1}</span>
              {stageNames[index] ?? item.title}
            </button>
          ))}
        </nav>
        <div
          className="wb-graph-viewport"
          tabIndex={0}
          role="region"
          aria-label={t('工作图画布', 'Work graph canvas')}
        >
          <div
            className="wb-graph-canvas"
            style={{
              width:
                (Math.max(850, detail.harness.stages.length * 280) * zoom) /
                100,
              height: (370 * zoom) / 100,
            }}
          >
            <div
              className="wb-graph-nodes"
              style={{
                width: Math.max(850, detail.harness.stages.length * 280),
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
              }}
            >
              {detail.harness.stages.map((item, index) => (
                <div className="wb-graph-node-slot" key={item.key}>
                  <button
                    className="wb-graph-node"
                    aria-pressed={selected === item.key}
                    onClick={() => setSelected(item.key)}
                  >
                    <span className="wb-graph-node-label">
                      <span
                        className={`wb-state-mark wb-state-${statusTone(item.status)}`}
                      >
                        {item.status === 'succeeded' ? (
                          <Check size={17} />
                        ) : (
                          <GitBranch size={17} />
                        )}
                      </span>
                      <strong>{stageNames[index] ?? item.title}</strong>
                    </span>
                    <AppBadge tone={statusTone(item.status)}>
                      {statusText(item.status, t)}
                    </AppBadge>
                    <span className="wb-graph-node-facts">
                      {item.agent_count} Agent · {item.call_count}{' '}
                      {t('调用', 'calls')}
                    </span>
                    <span className="wb-graph-node-facts">
                      {item.artifact_count} {t('份成果', 'artifacts')}
                    </span>
                  </button>
                  {index < detail.harness.stages.length - 1 && (
                    <ChevronRight className="wb-graph-edge" size={20} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="wb-graph-inspector">
          <div className="wb-graph-mobile-select">
            <AppSelect
              label={t('选择阶段', 'Select stage')}
              value={selected ?? ''}
              onChange={setSelected}
              options={detail.harness.stages.map((item, index) => ({
                value: item.key,
                label: stageNames[index] ?? item.title,
              }))}
            />
          </div>
          <h2>
            {stageNames[detail.harness.stages.indexOf(stage)] ?? stage?.title}
          </h2>
          {stage && (
            <AppBadge tone={statusTone(stage.status)}>
              {statusText(stage.status, t)}
            </AppBadge>
          )}
          <dl className="wb-details">
            <dt>{t('模型调用', 'Model calls')}</dt>
            <dd>{stage?.call_count ?? 0}</dd>
            <dt>{t('成果', 'Artifacts')}</dt>
            <dd>{stage?.artifact_count ?? 0}</dd>
          </dl>
          <h3>Agent</h3>
          {members.map((agent) => (
            <div className="wb-graph-member" key={agent.id}>
              <strong>{agent.title}</strong>
              <AppBadge tone={statusTone(agent.status)}>
                {statusText(agent.status, t)}
              </AppBadge>
              <p>{agent.objective}</p>
            </div>
          ))}
          {!members.length && (
            <p className="wb-hint">
              {t('尚未分配 Agent', 'No agents assigned')}
            </p>
          )}
          {outputs.map((artifact) => (
            <AppButton
              key={artifact.id}
              label={artifact.title}
              icon={<ArrowRight size={14} />}
              size="sm"
              onClick={() => onArtifact(artifact.id)}
            />
          ))}
          <AppButton
            label={t('查看调用记录', 'Inspect calls')}
            icon={<ArrowRight size={14} />}
            tone="ghost"
            onClick={onCalls}
          />
        </aside>
      </div>
    </section>
  )
}
