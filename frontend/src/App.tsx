import { lazy, Suspense, type ComponentProps, type MouseEventHandler, type ReactNode, useEffect, useMemo, useState } from 'react'

import { Badge as AstryxBadge } from '@astryxdesign/core/Badge'
import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Stack as AstryxStack } from '@astryxdesign/core/Stack'
import { Text as AstryxText } from '@astryxdesign/core/Text'
import { defineTheme, Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

import { ChatWorkspace } from './ChatWorkspace'
const TemplatesPage = lazy(() => import('./TemplatesPage').then(module => ({default: module.TemplatesPage})))
const PreviewRunner = lazy(() => import('./playground-preview/PreviewRunner').then(module => ({default: module.PreviewRunner})))

type Project = {
  id: string
  name: string
  goal?: string
  directory: string
}

type Task = {
  id: string
  project_id: string
  title: string
  goal: string
}

type Run = {
  id: string
  task_id: string
  status: string
  created_at: string
}

type AppButtonProps = {
  children?: ReactNode
  label?: string
  variant?: 'primary' | 'secondary' | 'tertiary'
  size?: 'small' | 'medium'
  fullWidth?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
}

function Button({
  children,
  label,
  variant = 'secondary',
  size = 'medium',
  fullWidth = false,
  onClick,
}: AppButtonProps) {
  const accessibleLabel = label ?? (typeof children === 'string' ? children : '操作')
  return (
    <AstryxButton
      label={accessibleLabel}
      variant={variant === 'tertiary' ? 'ghost' : variant}
      size={size === 'small' ? 'sm' : 'md'}
      width={fullWidth ? '100%' : undefined}
      onClick={onClick}
    >
      {children ?? accessibleLabel}
    </AstryxButton>
  )
}

type AppTextProps = Omit<ComponentProps<typeof AstryxText>, 'size' | 'weight' | 'color'> & {
  size?: 'small' | 'base'
  weight?: 'strong' | 'normal'
  tone?: 'primary' | 'secondary'
}

function Text({ size = 'base', weight = 'normal', tone = 'primary', ...props }: AppTextProps) {
  return (
    <AstryxText
      size={size === 'small' ? 'sm' : 'base'}
      weight={weight === 'strong' ? 'semibold' : 'normal'}
      color={tone}
      {...props}
    />
  )
}

type AppBadgeProps = {
  children: ReactNode
  color?: 'success' | 'error' | 'info' | 'neutral'
}

function Badge({ children, color = 'neutral' }: AppBadgeProps) {
  return <AstryxBadge label={children} variant={color} />
}

type AppStackProps = Omit<ComponentProps<typeof AstryxStack>, 'gap'> & {
  gap?: 'small' | 'none' | 0 | 2
}

function Stack({ gap = 'small', ...props }: AppStackProps) {
  return <AstryxStack gap={gap === 'small' ? 2 : gap === 'none' ? 0 : gap} {...props} />
}

type Bootstrap = {
  projects: Project[]
  tasks: Task[]
  runs: Run[]
}

function currentRoute() {
  const hash = window.location.hash.slice(1)
  if (hash.startsWith('code=')) return 'templates'
  return hash.split('?')[0] || 'workbench'
}

const mybotTheme = defineTheme({
  name: 'mybot',
  extends: neutralTheme,
  tokens: {
    '--color-accent': ['#315fce', '#8eb5ff'],
    '--color-background-body': ['#f6f7f9', '#11151a'],
    '--color-background-surface': ['#ffffff', '#191e25'],
  },
})

const statusLabel: Record<string, string> = {
  queued: '排队',
  running: '运行中',
  succeeded: '已完成',
  failed: '执行失败',
  paused: '已暂停',
  interrupted: '已中断',
}

async function getBootstrap(): Promise<Bootstrap> {
  const response = await fetch('/api/bootstrap', {
    headers: { 'X-Workbench-Request': '1' },
  })

  if (!response.ok) {
    throw new Error(`工作空间请求失败 (${response.status})`)
  }

  return response.json() as Promise<Bootstrap>
}

function formatDate(value: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusTone(status: string) {
  if (status === 'succeeded') return 'success'
  if (status === 'failed' || status === 'interrupted') return 'error'
  if (status === 'running' || status === 'queued') return 'info'
  return 'neutral'
}

function WorkbenchApp() {
  const [data, setData] = useState<Bootstrap | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  const [route, setRoute] = useState(currentRoute)

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    let active = true
    getBootstrap()
      .then((next) => {
        if (active) setData(next)
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '无法连接工作空间')
      })
    return () => {
      active = false
    }
  }, [])

  const activeRuns = useMemo(
    () => data?.runs.filter((run) => ['queued', 'running'].includes(run.status)) ?? [],
    [data],
  )

  if (route.startsWith('chat')) {
    const runId = route.startsWith('chat/') ? route.slice('chat/'.length) : data?.runs[0]?.id
    return (
      <Theme theme={mybotTheme} mode={mode}>
        <ChatWorkspace
          runId={runId}
          onBack={() => {
            window.location.hash = '#workbench'
          }}
        />
      </Theme>
    )
  }

  return (
    <Theme theme={mybotTheme} mode={mode}>
      <div className="migration-shell">
        <aside className="migration-sidebar" aria-label="主导航">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">
              W
            </span>
            <div>
              <Text weight="strong">Workbench</Text>
              <Text size="small" tone="secondary">
                React 迁移切片
              </Text>
            </div>
          </div>

          <Stack gap="small" className="sidebar-nav">
            <Button variant="primary" size="medium" fullWidth>
              发起工作
            </Button>
            <nav aria-label="工作区">
              <a className="nav-link is-active" href="#workbench">
                <span>工作台</span>
                <span className="nav-count">{activeRuns.length}</span>
              </a>
              <a className={`nav-link ${route.startsWith('chat') ? 'is-active' : ''}`} href={data?.runs[0] ? `#chat/${data.runs[0].id}` : '#chat'}>
                对话与成果
              </a>
              <a className={`nav-link ${route === 'templates' ? 'is-active' : ''}`} href="#templates">
                Astryx 模板
              </a>
              <a className="nav-link" href="#agent-work">
                Agent Work
              </a>
              <a className="nav-link" href="#models">
                模型与控制
              </a>
              <a className="nav-link" href="#backends">
                会话后端
              </a>
            </nav>
          </Stack>

          <div className="sidebar-foot">
            <Badge color="success">只读执行</Badge>
            <Text size="small" tone="secondary">
              React + Astryx 第一切片
            </Text>
          </div>
        </aside>

        <main className="migration-main">
          <header className="topbar">
            <div>
              <Text size="small" tone="secondary">
                研发工作空间 / 工作台
              </Text>
              <h1>让工作过程可核查</h1>
            </div>
            <div className="topbar-actions">
              <Badge color="neutral">迁移预览</Badge>
              <Button
                variant="tertiary"
                size="small"
                label={mode === 'light' ? '切换深色模式' : '切换浅色模式'}
                onClick={() => setMode((current) => (current === 'light' ? 'dark' : 'light'))}
              >
                {mode === 'light' ? '深色' : '浅色'}
              </Button>
              <Button variant="secondary" size="medium">
                连接与设置
              </Button>
            </div>
          </header>

          <div className="content">
            {error ? (
              <Card className="state-card">
                <Text weight="strong">无法连接当前工作空间</Text>
                <Text tone="secondary">{error}</Text>
                <Button variant="secondary" size="medium" onClick={() => window.location.reload()}>
                  重新连接
                </Button>
              </Card>
            ) : !data ? (
              <Card className="state-card">
                <Text weight="strong">正在连接工作空间</Text>
                <Text tone="secondary">正在读取项目、任务和运行事实。</Text>
              </Card>
            ) : (
              <>
                <section className="hero-row">
                  <div>
                    <Text size="small" tone="secondary">
                      CURRENT WORKSPACE
                    </Text>
                    <h2>研发工作台</h2>
                    <Text tone="secondary">
                      保留原有只读边界，把项目、运行和成果放进可复用的 React 组件边界。
                    </Text>
                  </div>
                  <Button variant="primary" size="medium">
                    新建项目
                  </Button>
                </section>

                <section className="metric-grid" aria-label="工作空间摘要">
                  <Card>
                    <Text size="small" tone="secondary">
                      运行中的 Work
                    </Text>
                    <strong className="metric-value">{activeRuns.length}</strong>
                    <Text size="small" tone="secondary">
                      来自持久 Run
                    </Text>
                  </Card>
                  <Card>
                    <Text size="small" tone="secondary">
                      项目
                    </Text>
                    <strong className="metric-value">{data.projects.length}</strong>
                    <Text size="small" tone="secondary">
                      当前工作空间
                    </Text>
                  </Card>
                  <Card>
                    <Text size="small" tone="secondary">
                      任务
                    </Text>
                    <strong className="metric-value">{data.tasks.length}</strong>
                    <Text size="small" tone="secondary">
                      等待执行或回顾
                    </Text>
                  </Card>
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <Text weight="strong">最近 Agent Work</Text>
                      <Text size="small" tone="secondary">
                        只呈现后端已经持久化的事实
                      </Text>
                    </div>
                    <Button variant="tertiary" size="small">
                      查看全部
                    </Button>
                  </div>
                  <Card>
                    {data.runs.length ? (
                      <Stack gap="none">
                        {data.runs.slice(0, 5).map((run, index) => {
                          const task = data.tasks.find((item) => item.id === run.task_id)
                          const project = data.projects.find((item) => item.id === task?.project_id)
                          return (
                            <div className="run-row" key={run.id}>
                              <div className="run-index">{String(index + 1).padStart(2, '0')}</div>
                              <div className="run-copy">
                                <Text weight="strong">{task?.title ?? '未命名工作'}</Text>
                                <Text size="small" tone="secondary">
                                  {project?.name ?? '未关联项目'} · {formatDate(run.created_at)}
                                </Text>
                              </div>
                              <Badge color={statusTone(run.status) as 'success' | 'error' | 'info' | 'neutral'}>
                                {statusLabel[run.status] ?? run.status}
                              </Badge>
                            </div>
                          )
                        })}
                      </Stack>
                    ) : (
                      <div className="empty-panel">
                        <Text weight="strong">还没有 Agent Work</Text>
                        <Text size="small" tone="secondary">
                          创建项目和任务后，运行事实会出现在这里。
                        </Text>
                        <Button variant="secondary" size="medium">
                          创建第一个项目
                        </Button>
                      </div>
                    )}
                  </Card>
                </section>

                <section className="section-block">
                  <div className="section-heading">
                    <div>
                      <Text weight="strong">迁移边界</Text>
                      <Text size="small" tone="secondary">
                        第一切片只替换界面层，不改变后端事实
                      </Text>
                    </div>
                  </div>
                  <Card>
                    <div className="boundary-grid">
                      <div>
                        <Text weight="strong">保留</Text>
                        <Text size="small" tone="secondary">
                          FastAPI、SQLite、只读上下文、运行/成果 API
                        </Text>
                      </div>
                      <Divider orientation="vertical" />
                      <div>
                        <Text weight="strong">替换</Text>
                        <Text size="small" tone="secondary">
                          web/ 的 shell、导航、摘要和读取态页面
                        </Text>
                      </div>
                      <Divider orientation="vertical" />
                      <div>
                        <Text weight="strong">暂不做</Text>
                        <Text size="small" tone="secondary">
                          发送、Provider、代码执行、部署权限
                        </Text>
                      </div>
                    </div>
                  </Card>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </Theme>
  )
}

function isPreviewRoute() {
  return new URLSearchParams(window.location.search).get('preview') === '1'
}

function App() {
  const [route, setRoute] = useState(currentRoute)
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const change = () => setRoute(currentRoute())
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  let page
  if (isPreviewRoute()) {
    page = <PreviewRunner />
  } else if (route === 'templates') {
    page = <TemplatesPage mode={mode} onModeChange={setMode} onBack={() => {window.location.hash = '#workbench'}} />
  } else page = <WorkbenchApp />
  return <Suspense fallback={<p role="status">Loading workbench...</p>}>{page}</Suspense>
}

export { App }
