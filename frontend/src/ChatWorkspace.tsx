import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import {
  ChatComposer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatToolCalls,
} from '@astryxdesign/core/Chat'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { HStack, VStack } from '@astryxdesign/core/Layout'
import { Layout, LayoutContent } from '@astryxdesign/core/Layout'
import { Markdown } from '@astryxdesign/core/Markdown'
import { Section } from '@astryxdesign/core/Section'
import { Text } from '@astryxdesign/core/Text'
import { Timestamp } from '@astryxdesign/core/Timestamp'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable'

type RunDetail = {
  run: {
    id: string
    status: string
    created_at: string
    ended_at?: string | null
    error?: string | null
  }
  task: {
    title: string
    goal: string
    acceptance?: string
  }
  project: {
    name: string
    directory: string
  }
  agents: Array<{
    id: string
    role: string
    title: string
    objective: string
    status: string
    output?: string | null
    started_at?: string | null
    ended_at?: string | null
  }>
  calls: Array<{
    id: string
    agent_id: string
    status: string
    requested_model?: string
    duration_ms?: number | null
  }>
  artifacts: Array<{
    id: string
    title: string
    kind: string
    content: string
    decision?: string | null
    created_at: string
    agent_id: string
  }>
}

type ChatWorkspaceProps = {
  runId?: string
  onBack: () => void
}

const rootStyle: CSSProperties = {
  height: '100dvh',
  width: '100%',
  minWidth: 0,
}

const panelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
}

const artifactStyle = (width: number): CSSProperties =>
  ({
    '--chat-artifact-width': `${width}px`,
  }) as CSSProperties

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    queued: '排队',
    running: '运行中',
    succeeded: '完成',
    failed: '失败',
    paused: '已暂停',
    interrupted: '已中断',
  }
  return labels[status] ?? status
}

function formatDuration(value?: number | null) {
  if (value == null) return undefined
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`
}

function toolStatus(status: string): 'pending' | 'running' | 'complete' | 'error' {
  if (status === 'running') return 'running'
  if (status === 'failed' || status === 'interrupted' || status === 'canceled') return 'error'
  if (status === 'queued' || status === 'pending') return 'pending'
  return 'complete'
}

function ArtifactPanel({
  detail,
  artifactId,
  onSelect,
  onClose,
}: {
  detail: RunDetail
  artifactId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const artifact = detail.artifacts.find((item) => item.id === artifactId) ?? detail.artifacts.at(-1)

  return (
    <Card variant="transparent" height="100%" className="chat-artifact-panel" style={undefined}>
      <Toolbar
        label="成果文档操作"
        dividers={['bottom']}
        startContent={
          <VStack gap={0}>
            <Text type="label" weight="semibold">
              {artifact?.title ?? '工作成果'}
            </Text>
            <Text type="supporting" color="secondary">
              {detail.project.name} · {formatStatus(detail.run.status)}
            </Text>
          </VStack>
        }
        endContent={
          <HStack gap={1}>
            <Button label="关闭成果面板" variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
          </HStack>
        }
      />
      {detail.artifacts.length > 1 ? (
        <HStack gap={1} className="chat-artifact-picker">
          {detail.artifacts.map((item) => (
            <Button
              key={item.id}
              label={`打开成果 ${item.title}`}
              variant={item.id === artifact?.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onSelect(item.id)}>
              {item.title}
            </Button>
          ))}
        </HStack>
      ) : null}
      <Section variant="transparent" className="chat-artifact-body">
        {artifact ? (
          <VStack gap={3} className="chat-artifact-copy">
            <div>
              <Text type="display-3" as="h2">
                {artifact.title}
              </Text>
              <Text type="supporting" color="secondary">
                {artifact.kind} · {artifact.decision ?? '待审查'}
              </Text>
            </div>
            <Markdown>{artifact.content}</Markdown>
          </VStack>
        ) : (
          <VStack gap={2} className="chat-artifact-empty">
            <Text type="large" weight="semibold">
              尚无成果
            </Text>
            <Text type="supporting" color="secondary">
              当前 Run 还没有持久化 Artifact。
            </Text>
          </VStack>
        )}
      </Section>
    </Card>
  )
}

function ChatConversation({ detail, onOpenArtifact }: { detail: RunDetail; onOpenArtifact: () => void }) {
  const calls = detail.calls.map((call) => {
    const agent = detail.agents.find((item) => item.id === call.agent_id)
    return {
      name: agent?.role ?? 'agent',
      target: agent?.title ?? call.requested_model ?? 'model call',
      status: toolStatus(call.status),
      duration: formatDuration(call.duration_ms),
    }
  })

  return (
    <ChatLayout
      density="spacious"
      composer={
        <ChatComposer
          onSubmit={() => undefined}
          placeholder="当前迁移切片为只读，发送能力尚未接入"
          isDisabled
          status={{ type: 'warning', message: '只读 Run：不会发送新消息或触发模型调用。' }}
          input={<ChatComposerInput label="只读消息输入" isDisabled />}
        />
      }>
      <ChatMessageList align="top">
        <ChatSystemMessage variant="divider">Run {detail.run.id.slice(0, 8)}</ChatSystemMessage>

        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata timestamp={<Timestamp value={detail.run.created_at} format="time" />} />
            }>
            <Text type="body" weight="semibold">
              {detail.task.title}
            </Text>
            <Text type="body">{detail.task.goal}</Text>
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage sender="assistant" avatar={<Avatar name="Super-agent" size="md" />}>
          <ChatMessageBubble variant="ghost">
            <Text type="body">
              这是该 Run 的持久化执行记录。下方工具调用、Agent 状态和成果均来自后端事实。
            </Text>
          </ChatMessageBubble>
          {calls.length ? <ChatToolCalls calls={calls} defaultIsExpanded /> : null}
        </ChatMessage>

        {detail.agents.map((agent) => (
          <ChatMessage key={agent.id} sender="assistant" avatar={<Avatar name={agent.title} size="md" />}>
            <ChatMessageBubble variant="ghost">
              <VStack gap={1}>
                <Text type="label" weight="semibold">
                  {agent.title}
                </Text>
                <Text type="body">{agent.objective}</Text>
                <Text type="supporting" color="secondary">
                  {formatStatus(agent.status)}
                </Text>
              </VStack>
            </ChatMessageBubble>
            {agent.output ? (
              <ChatMessageBubble variant="ghost">
                <Markdown density="compact">{agent.output}</Markdown>
              </ChatMessageBubble>
            ) : null}
          </ChatMessage>
        ))}

        {detail.artifacts.length ? (
          <ChatMessage sender="assistant" avatar={<Avatar name="成果审查" size="md" />}>
            <ChatMessageBubble variant="ghost">
              <Text type="body">
                当前 Run 已产生 {detail.artifacts.length} 份成果。打开右侧文档面板查看完整内容。
              </Text>
            </ChatMessageBubble>
            <ChatMessageBubble variant="ghost" width="100%">
              <Card variant="muted" className="chat-artifact-card">
                <VStack gap={1}>
                  <Text type="label" weight="semibold">
                    {detail.artifacts.at(-1)?.title}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {detail.artifacts.at(-1)?.decision ?? '待审查'} · 点击右侧查看
                  </Text>
                  <Button label="打开成果面板" variant="secondary" size="sm" onClick={onOpenArtifact}>
                    打开成果
                  </Button>
                </VStack>
              </Card>
            </ChatMessageBubble>
          </ChatMessage>
        ) : null}

        {detail.run.error ? (
          <ChatSystemMessage variant="default">Run 状态：{formatStatus(detail.run.status)} · {detail.run.error}</ChatSystemMessage>
        ) : null}
      </ChatMessageList>
    </ChatLayout>
  )
}

export function ChatWorkspace({ runId, onBack }: ChatWorkspaceProps) {
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [artifactId, setArtifactId] = useState<string>()
  const [isArtifactOpen, setIsArtifactOpen] = useState(true)
  const [isArtifactDialogOpen, setIsArtifactDialogOpen] = useState(false)
  const artifactResize = useResizable({
    defaultSize: 520,
    minSize: 360,
    maxSize: 760,
    autoSaveId: 'mybot-chat-artifact-panel',
  })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setError(null)
    setDetail(null)
    if (!runId) {
      return
    }
    let active = true
    fetch(`/api/runs/${encodeURIComponent(runId)}`, {
      headers: { 'X-Workbench-Request': '1' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Run 请求失败 (${response.status})`)
        return response.json() as Promise<RunDetail>
      })
      .then((next) => {
        if (!active) return
        setDetail(next)
        setArtifactId(next.artifacts.at(-1)?.id)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法读取 Run')
      })
    return () => {
      active = false
    }
  }, [runId])

  const latestArtifact = useMemo(() => detail?.artifacts.at(-1), [detail])

  if (error || !detail) {
    return (
      <VStack className="chat-loading" gap={2}>
        <Text type="display-3" as="h1">
          {error ?? '正在读取 Run'}
        </Text>
        <Text type="supporting" color="secondary">
          {error ? '返回工作台后可以重新选择一个持久化 Run。' : '正在加载 Agent、调用和成果事实。'}
        </Text>
        <Button label="返回工作台" variant="secondary" size="md" onClick={onBack}>
          返回工作台
        </Button>
      </VStack>
    )
  }

  return (
    <div ref={rootRef} className="chat-workspace" style={rootStyle}>
      <header className="chat-workspace-header">
        <HStack gap={2} vAlign="center">
          <Button label="返回工作台" variant="ghost" size="sm" onClick={onBack}>
            返回
          </Button>
          <VStack gap={0}>
            <Text type="label" weight="semibold">
              {detail.task.title}
            </Text>
            <Text type="supporting" color="secondary">
              {detail.project.name} · Run {detail.run.id.slice(0, 8)}
            </Text>
          </VStack>
        </HStack>
        <HStack gap={1}>
          <Button
            label="打开成果"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsArtifactDialogOpen(true)
            }}>
            成果
          </Button>
          <Button label="关闭成果面板" variant="ghost" size="sm" onClick={() => setIsArtifactOpen((value) => !value)}>
            {isArtifactOpen ? '隐藏成果' : '显示成果'}
          </Button>
        </HStack>
      </header>

      <div className="chat-workspace-body">
        <div className="chat-column" style={panelStyle}>
          <ChatConversation detail={detail} onOpenArtifact={() => setIsArtifactDialogOpen(true)} />
        </div>
        {isArtifactOpen ? (
          <>
            <ResizeHandle
              direction="horizontal"
              isReversed
              hasDivider
              label="调整成果面板宽度"
              resizable={artifactResize.props}
            />
            <div className="chat-artifact-host" style={artifactStyle(artifactResize.size)}>
              <ArtifactPanel
                detail={detail}
                artifactId={artifactId ?? latestArtifact?.id}
                onSelect={setArtifactId}
                onClose={() => setIsArtifactOpen(false)}
              />
            </div>
          </>
        ) : null}
      </div>

      <Dialog
        isOpen={isArtifactDialogOpen}
        onOpenChange={setIsArtifactDialogOpen}
        purpose="info"
        variant="fullscreen">
        <Layout
          header={
            <DialogHeader
              title={latestArtifact?.title ?? '工作成果'}
              subtitle={`${detail.project.name} · ${detail.run.id.slice(0, 8)}`}
              hasDivider
              onOpenChange={setIsArtifactDialogOpen}
            />
          }
          content={
            <LayoutContent padding={0}>
              <ArtifactPanel
                detail={detail}
                artifactId={artifactId ?? latestArtifact?.id}
                onSelect={setArtifactId}
                onClose={() => setIsArtifactDialogOpen(false)}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </div>
  )
}
