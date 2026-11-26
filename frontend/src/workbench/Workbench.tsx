import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  Command,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Inbox,
  Languages,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Moon,
  MonitorSmartphone,
  Network,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Terminal,
  Workflow,
  X,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppDialog,
  AppLoading,
  AppSegments,
  AppStylePicker,
  AppTheme,
} from '../components/ui'
import {
  styleIds,
  styleOptions,
  accentIds,
  accentOptions,
  type AccentId,
  type Density,
  type StyleId,
} from '../components/ui/themes'
import {
  api,
  post,
  type Bootstrap,
  type Model,
  type Snapshot,
  type Task,
} from './api'
import { WorkbenchForm, type FormState } from './Forms'
import {
  activeStatuses,
  readPreference,
  routeFromHash,
  savePreference,
  type Copy,
  type Filter,
  type Locale,
} from './state'
import './workbench.css'
import './template-surfaces.css'
import { LoginPage } from './LoginPage'
import { taskItems } from './projections'
import {
  listLocationHref,
  readListLocation,
  type ListLocation,
} from './list-location'
import {
  canOpenWorkbenchCommands,
  hasBlockingCommandOverlay,
} from './commands-source'
import { useWorkspaceCounts } from './useWorkspaceCounts'
import { ProjectReferenceDirectory } from './ProjectReferenceDirectory'
import { useProjectDetail } from './useProjectDetail'
import { useDockedWorkbenchNavigation } from '../components/ui/useViewport'
import { projectWorkspaceLocation } from './project-workspace'
import { taskWorkspaceHref } from './task-workspace-location'
import type { TaskTurn } from './task-turns'
import { clearModelTests } from './model-test-state'
import { clearListContinuityCache } from './list-continuity'
import {
  allowWorkbenchNavigation,
  canOpenWorkbenchForm,
  readWorkbenchNavigationKind,
  pushWorkbenchNavigation,
  resetWorkbenchNavigation,
  WORKBENCH_NAVIGATION_EVENT,
} from './navigation-guard'

const RunWorkspace = lazy(() =>
  import('./RunWorkspace').then((module) => ({ default: module.RunWorkspace })),
)
const TaskWorkspace = lazy(() =>
  import('./TaskWorkspace').then((module) => ({
    default: module.TaskWorkspace,
  })),
)
const WorkflowPage = lazy(() =>
  import('./WorkflowPage').then((module) => ({
    default: module.WorkflowPage,
  })),
)
const DevicesPage = lazy(() =>
  import('./DevicesPage').then((module) => ({ default: module.DevicesPage })),
)
const Overview = lazy(() =>
  import('./WorkspacePages').then((module) => ({ default: module.Overview })),
)
const WorkInbox = lazy(() =>
  import('./WorkspacePages').then((module) => ({ default: module.WorkInbox })),
)
const ProjectHierarchy = lazy(() =>
  import('./WorkspacePages').then((module) => ({
    default: module.ProjectHierarchy,
  })),
)
const ProjectDocuments = lazy(() =>
  import('./ProjectDocuments').then((module) => ({
    default: module.ProjectDocuments,
  })),
)
const FocusedWorkbench = lazy(() =>
  import('./FocusedWorkbench').then((module) => ({
    default: module.FocusedWorkbench,
  })),
)
const ProjectResourceList = lazy(() =>
  import('./ProjectResourceList').then((module) => ({
    default: module.ProjectResourceList,
  })),
)
const WorkbenchCommands = lazy(() =>
  import('./WorkbenchCommands').then((module) => ({
    default: module.WorkbenchCommands,
  })),
)
export const legacyUrl = (
  (import.meta.env.VITE_LEGACY_URL as string | undefined) ??
  'http://127.0.0.1:4180'
).replace(/\/$/, '')

export function Workbench() {
  const [route, setRoute] = useState(() => routeFromHash(location.hash))
  const [locale, setLocale] = useState<Locale>(() =>
    readPreference('mybot.locale', ['zh', 'en'], 'zh'),
  )
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    readPreference('mybot.mode', ['light', 'dark'], 'light'),
  )
  const [styleId, setStyleId] = useState<StyleId>(() =>
    readPreference('mybot.style', styleIds, 'neutral'),
  )
  const [density, setDensity] = useState<Density>(() =>
    readPreference<Density>(
      'mybot.density',
      ['comfortable', 'compact', 'touch'],
      'comfortable',
    ),
  )
  const [accentId, setAccentId] = useState<AccentId>(() =>
    readPreference('mybot.accent', accentIds, 'theme'),
  )
  const t: Copy = (zh, en) => (locale === 'zh' ? zh : en)
  const [data, setData] = useState<Bootstrap | null>(null)
  const [queryRefreshRevision, setQueryRefreshRevision] = useState(0)
  const [auth, setAuth] = useState({ authenticated: true, required: false })
  const [authChecked, setAuthChecked] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState(false)
  const dockedNavigation = useDockedWorkbenchNavigation()
  const [preferences, setPreferences] = useState(false)
  const [preferenceTab, setPreferenceTab] = useState('appearance')
  const [commands, setCommands] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [formBlocked, setFormBlocked] = useState(false)
  const initialListLocation = readListLocation(location.href)
  const [query, setQuery] = useState(initialListLocation.query ?? '')
  const [filter, setFilter] = useState<Filter>(
    initialListLocation.filter ?? 'all',
  )
  const [projectFilter, setProjectFilter] = useState(
    initialListLocation.project ?? 'all',
  )
  const [listLocation, setListLocation] = useState(initialListLocation)
  const [queryDraftResetKey, setQueryDraftResetKey] = useState(0)
  const [jqlDraft, setJqlDraft] = useState(listLocation.jql)
  const committedJql = useRef(listLocation.jql)
  const [workView, setWorkView] = useState<'list' | 'table' | 'board'>(
    () =>
      readListLocation(location.href).view ??
      readPreference<'list' | 'table' | 'board'>(
        'mybot.work-view',
        ['list', 'table', 'board'],
        'list',
      ),
  )
  const [actionBusy, setActionBusy] = useState('')
  useEffect(() => {
    if (dockedNavigation) setMenu(false)
  }, [dockedNavigation])
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const workspaceCounts = useWorkspaceCounts({
    data,
    refreshRevision: queryRefreshRevision,
  })
  const projectDetail = useProjectDetail({
    data,
    refreshRevision: queryRefreshRevision,
    projectId: route.page === 'project' ? route.id : undefined,
  })
  const refresh = useCallback(
    async (cause: 'explicit' | 'poll' = 'explicit') => {
      const version = ++generation.current
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setLoading(true)
      try {
        const state = await api<{ authenticated: boolean; required: boolean }>(
          '/auth/state',
          { signal: controller.signal },
        )
        if (version !== generation.current) return
        setAuth(state)
        setAuthChecked(true)
        if (!state.authenticated) {
          resetWorkbenchNavigation()
          clearModelTests()
          clearListContinuityCache()
          setData(null)
          return
        }
        const next = await api<Bootstrap>('/bootstrap', {
          signal: controller.signal,
        })
        if (version === generation.current) {
          setData(next)
          if (cause === 'explicit')
            setQueryRefreshRevision((revision) => revision + 1)
          setError('')
        }
      } catch (reason) {
        if (!controller.signal.aborted && version === generation.current)
          setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (version === generation.current) setLoading(false)
      }
    },
    [],
  )
  useEffect(() => {
    const sync = (event?: Event) => {
      if (event && !allowWorkbenchNavigation(event)) return
      const next = readListLocation(location.href)
      setListLocation(next)
      setQuery(next.query ?? '')
      setFilter(next.filter ?? 'all')
      setProjectFilter(next.project ?? 'all')
      const traversed = Boolean(
        event && readWorkbenchNavigationKind(event) === 'traverse',
      )
      if (traversed) setQueryDraftResetKey((key) => key + 1)
      if (traversed || next.jql !== committedJql.current) {
        committedJql.current = next.jql
        setJqlDraft(next.jql)
      }
      setWorkView((current) => next.view ?? (event ? 'list' : current))
    }
    window.addEventListener(WORKBENCH_NAVIGATION_EVENT, sync)
    // An admitted URL change can precede the initial React subscription.
    sync()
    return () => {
      window.removeEventListener(WORKBENCH_NAVIGATION_EVENT, sync)
    }
  }, [])
  function updateListLocation(patch: Partial<ListLocation>) {
    const scopedPatch = projectWorkspaceLocation(
      patch,
      route.page === 'project' ? route.id : undefined,
      listLocation.boardPages,
    )
    return pushWorkbenchNavigation(listLocationHref(location.href, scopedPatch))
  }
  useEffect(() => {
    void refresh()
    const change = (event?: Event) => {
      if (event && !allowWorkbenchNavigation(event)) return
      setRoute(routeFromHash(location.hash))
      setMenu(false)
      setPreferences(false)
      setCommands(false)
      setForm(null)
    }
    const unauthorized = () => {
      resetWorkbenchNavigation()
      clearModelTests()
      clearListContinuityCache()
      ++generation.current
      request.current?.abort()
      setData(null)
      setForm(null)
      setMenu(false)
      setPreferences(false)
      setCommands(false)
      setQuery('')
      setFilter('all')
      setProjectFilter('all')
      setAuth({ authenticated: false, required: true })
      setAuthChecked(true)
      setLoading(false)
    }
    window.addEventListener(WORKBENCH_NAVIGATION_EVENT, change)
    window.addEventListener('mybot:unauthorized', unauthorized)
    change()
    return () => {
      ++generation.current
      request.current?.abort()
      window.removeEventListener(WORKBENCH_NAVIGATION_EVENT, change)
      window.removeEventListener('mybot:unauthorized', unauthorized)
    }
  }, [refresh])
  useEffect(() => {
    if (
      !(workspaceCounts.remote
        ? workspaceCounts.value?.run_counts.active !== 0
        : data?.runs.some((run) => activeStatuses.has(run.status)))
    )
      return
    const timer = window.setInterval(() => {
      if (!document.hidden && !loading && !form && !commands)
        void refresh('poll')
    }, 6000)
    return () => clearInterval(timer)
  }, [
    data,
    workspaceCounts.value,
    workspaceCounts.remote,
    refresh,
    loading,
    form,
    commands,
  ])
  useEffect(() => {
    savePreference('mybot.locale', locale)
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }, [locale])
  useEffect(() => {
    savePreference('mybot.mode', mode)
  }, [mode])
  useEffect(() => {
    savePreference('mybot.work-view', workView)
  }, [workView])
  useEffect(() => {
    savePreference('mybot.style', styleId)
  }, [styleId])
  useEffect(() => {
    savePreference('mybot.density', density)
  }, [density])
  useEffect(() => {
    savePreference('mybot.accent', accentId)
  }, [accentId])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        canOpenWorkbenchCommands(event, {
          hasData: !!data,
          formOpen: !!form,
          menuOpen: menu,
          preferencesOpen: preferences,
          commandsOpen: commands,
          overlayOpen: hasBlockingCommandOverlay(document),
          textEditing: !!(event.target as HTMLElement | null)?.closest?.(
            'input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])',
          ),
        })
      ) {
        event.preventDefault()
        setCommands(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [data, form, menu, preferences, commands])
  function openCommands() {
    if (
      data &&
      !form &&
      !menu &&
      !preferences &&
      !commands &&
      !hasBlockingCommandOverlay(document)
    )
      setCommands(true)
  }
  async function action(
    key: string,
    fn: () => Promise<unknown>,
    message?: string,
  ) {
    if (actionBusy) return
    setActionBusy(key)
    setNotice('')
    setError('')
    try {
      await fn()
      if (key === 'logout') {
        clearModelTests()
        clearListContinuityCache()
      }
      if (message) setNotice(message)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setActionBusy('')
    }
  }
  async function prepare(task: Task) {
    if (actionBusy) return
    setActionBusy(task.id)
    setError('')
    try {
      const snapshot = await post<Snapshot>(`/tasks/${task.id}/preview`)
      setForm({ kind: 'run', task, snapshot })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setActionBusy('')
    }
  }
  const newTask = () => {
    if (data)
      openGlobalForm(
        data.capabilities.project_references === true || data.projects.length
          ? {
              kind: 'task',
              projectId: route.page === 'project' ? route.id : undefined,
            }
          : { kind: 'project' },
      )
  }
  const openGlobalForm = (next: FormState) => {
    if (!canOpenWorkbenchForm()) {
      setFormBlocked(true)
      return
    }
    setFormBlocked(false)
    setForm(next)
  }
  const active = workspaceCounts.remote
    ? workspaceCounts.value?.run_counts.active
    : (data?.runs.filter((run) => activeStatuses.has(run.status)).length ?? 0)
  const inboxCount = workspaceCounts.remote
    ? workspaceCounts.value
      ? workspaceCounts.value.task_counts.pending +
        workspaceCounts.value.task_counts.attention
      : undefined
    : data
      ? taskItems(data).filter(
          (item) => item.column === 'pending' || item.column === 'attention',
        ).length
      : 0
  const project =
    route.page === 'project' && projectDetail.remote
      ? projectDetail.value?.project
      : data?.projects.find((item) => item.id === route.id)
  const pageTitle =
    route.page === 'overview'
      ? t('工作总览', 'Workspace overview')
      : route.page === 'inbox'
        ? t('待处理', 'Inbox')
        : route.page === 'hierarchy'
          ? t('项目层级', 'Project hierarchy')
          : route.page === 'documents'
            ? t('项目资料', 'Project documents')
            : route.page === 'login'
              ? t('连接工作空间', 'Connect workspace')
              : route.page === 'projects'
                ? t('项目', 'Projects')
                : route.page === 'project'
                  ? (project?.name ?? t('项目', 'Project'))
                  : route.page === 'models'
                    ? t('模型与资源', 'Models & resources')
                    : route.page === 'workflows'
                      ? t('工作流', 'Workflows')
                      : route.page === 'devices'
                        ? t('设备接续', 'Device continuation')
                        : route.page === 'backends'
                          ? t('会话后端', 'Conversation backends')
                          : route.page === 'run'
                            ? t('运行工作区', 'Run workspace')
                            : route.page === 'task'
                              ? t('任务工作区', 'Task workspace')
                              : route.page === 'missing'
                                ? t('页面不存在', 'Page not found')
                                : t('工作台', 'Workbench')
  useEffect(() => {
    document.title = `${pageTitle} · mybot`
  }, [pageTitle])
  const nav = () => (
    <>
      <a className="wb-brand" href="#workbench">
        <span className="wb-brand-symbol">
          <Command size={21} />
        </span>
        <strong>mybot</strong>
        <span className="wb-brand-tag">WORKSPACE</span>
      </a>
      <div className="wb-space-label">
        <span className="wb-space-avatar">
          <Box size={17} />
        </span>
        <div>
          <strong>{t('研发工作空间', 'R&D workspace')}</strong>
          <small>{t('本机 · 单用户', 'Local · Single user')}</small>
        </div>
      </div>
      <AppButton
        label={t('新建任务', 'New task')}
        icon={<Plus size={17} />}
        tone="primary"
        width="100%"
        onClick={() => {
          setMenu(false)
          newTask()
        }}
        disabled={!data}
      />
      <nav className="wb-nav" aria-label={t('主导航', 'Main navigation')}>
        {(
          [
            ['overview', 'overview', t('总览', 'Overview'), LayoutDashboard],
            ['workbench', 'work', t('工作台', 'Workbench'), Activity],
            ['inbox', 'inbox', t('待处理', 'Inbox'), Inbox],
            ['projects', 'projects', t('项目', 'Projects'), FolderGit2],
            ['documents', 'documents', t('项目资料', 'Documents'), BookOpen],
            ['workflows', 'workflows', t('工作流', 'Workflows'), Workflow],
            [
              'devices',
              'devices',
              t('设备接续', 'Device continuation'),
              MonitorSmartphone,
            ],
            [
              'models',
              'models',
              t('模型与资源', 'Models & resources'),
              SlidersHorizontal,
            ],
            [
              'backends',
              'backends',
              t('会话后端', 'Conversation backends'),
              Network,
            ],
          ] as const
        ).map(([hash, page, label, Icon]) => (
          <a
            key={hash}
            href={`#${hash}`}
            aria-current={
              route.page === page ||
              (page === 'work' && route.page === 'task') ||
              (page === 'projects' &&
                ['project', 'hierarchy'].includes(route.page))
                ? 'page'
                : undefined
            }
          >
            <Icon size={17} />
            <span>{label}</span>
            {page === 'work' && (active === undefined || active > 0) && (
              <span
                className="wb-count"
                aria-label={t('活跃运行数', 'Active run count')}
                aria-busy={workspaceCounts.busy || undefined}
              >
                {active ?? '-'}
              </span>
            )}
            {page === 'inbox' &&
              (inboxCount === undefined || inboxCount > 0) && (
                <span
                  className="wb-count"
                  aria-label={t('待处理任务数', 'Inbox task count')}
                  aria-busy={workspaceCounts.busy || undefined}
                >
                  {inboxCount ?? '-'}
                </span>
              )}
          </a>
        ))}
      </nav>
      <div className="wb-side-projects">
        <div className="wb-side-label">
          <span>{t('项目', 'PROJECTS')}</span>
          <AppButton
            label={t('创建项目', 'Create project')}
            icon={<Plus size={15} />}
            iconOnly
            size="sm"
            tone="ghost"
            disabled={!data}
            onClick={() => {
              setMenu(false)
              openGlobalForm({ kind: 'project' })
            }}
          />
        </div>
        {data?.capabilities.project_references === true ? (
          <ProjectReferenceDirectory
            data={data}
            refreshRevision={queryRefreshRevision}
            selectedIds={route.page === 'project' && route.id ? [route.id] : []}
            t={t}
            variant="sidebar"
            onSelect={(id) => {
              if (pushWorkbenchNavigation(`#project/${id}`)) setMenu(false)
            }}
          />
        ) : (
          data?.projects.slice(0, 8).map((item) => (
            <a
              href={`#project/${item.id}`}
              key={item.id}
              aria-current={route.id === item.id ? 'page' : undefined}
            >
              <span className="wb-project-dot" />
              <span>{item.name}</span>
            </a>
          ))
        )}
        {data?.capabilities.project_references !== true &&
          !data?.projects.length && (
            <p className="wb-hint">{t('尚无项目', 'No projects yet')}</p>
          )}
      </div>
      <div className="wb-sidebar-bottom">
        <AppButton
          label={t('偏好设置', 'Preferences')}
          icon={<SlidersHorizontal size={16} />}
          tone="ghost"
          size="sm"
          onClick={() => {
            setMenu(false)
            setPreferences(true)
          }}
        />
        <a href="#templates">
          <LayoutTemplate size={16} />
          {t('组件实验室', 'Component lab')}
          <ExternalLink size={13} />
        </a>
        <a href={`${legacyUrl}/`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          {t('旧版工作台', 'Classic workbench')}
        </a>
        <div className="wb-scope">
          <ShieldCheck size={16} />
          <span>
            {data?.capabilities.isolated_coding === true
              ? t('受控研发', 'Controlled R&D')
              : t('只读研究', 'Read-only research')}
          </span>
        </div>
      </div>
    </>
  )
  if (!authChecked && loading)
    return (
      <AppTheme
        mode={mode}
        locale={locale}
        styleId={styleId}
        density={density}
        accentId={accentId}
      >
        <div className="wb-main">
          <AppLoading label={t('正在确认访问状态', 'Checking access')} />
        </div>
      </AppTheme>
    )
  if (!auth.authenticated || route.page === 'login')
    return (
      <AppTheme
        mode={mode}
        locale={locale}
        styleId={styleId}
        density={density}
        accentId={accentId}
      >
        <LoginPage
          t={t}
          mode={mode}
          authenticated={auth.authenticated && authChecked}
          onModeChange={() => setMode(mode === 'light' ? 'dark' : 'light')}
          onLanguageChange={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          onLogin={refresh}
        />
      </AppTheme>
    )
  return (
    <AppTheme
      mode={mode}
      locale={locale}
      styleId={styleId}
      density={density}
      accentId={accentId}
    >
      <div className="wb-shell">
        <a
          className="wb-skip"
          href="#wb-main"
          onClick={(event) => {
            event.preventDefault()
            const main = document.getElementById('wb-main')
            main?.focus()
            main?.scrollIntoView({ block: 'start' })
          }}
        >
          {t('跳到主要内容', 'Skip to content')}
        </a>
        <aside className="wb-sidebar">{dockedNavigation ? nav() : null}</aside>
        <div className="wb-main-column">
          <header className="wb-topbar">
            <div className="wb-inline">
              <span className="wb-mobile-menu">
                <AppButton
                  label={t('打开导航', 'Open navigation')}
                  icon={<Menu size={18} />}
                  iconOnly
                  tone="ghost"
                  onClick={() => setMenu(true)}
                />
              </span>
              <span className="wb-muted">{t('工作空间', 'Workspace')}</span>
              <ChevronRight size={13} />
              <strong>{pageTitle}</strong>
            </div>
            <div className="wb-topbar-search">
              <AppButton
                label={t('快速查找', 'Quick find')}
                icon={<Search size={16} />}
                tone="secondary"
                width="100%"
                onClick={openCommands}
                disabled={!data}
              >
                <span className="wb-search-label">
                  {t('快速查找', 'Quick find')}
                </span>
              </AppButton>
            </div>
            <div className="wb-inline">
              <span
                className={`wb-sync ${error ? 'is-error' : ''}`}
                role="status"
              >
                <span />
                {error
                  ? t('同步失败', 'Sync failed')
                  : loading
                    ? t('同步中', 'Syncing')
                    : auth.authenticated
                      ? t('已同步', 'Synced')
                      : t('未登录', 'Signed out')}
              </span>
              <AppButton
                label={t('Switch to English', '切换为中文')}
                icon={<Languages size={17} />}
                iconOnly
                tone="ghost"
                onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
              />
              <AppButton
                label={
                  mode === 'light'
                    ? t('切换深色', 'Dark mode')
                    : t('切换浅色', 'Light mode')
                }
                icon={mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
                iconOnly
                tone="ghost"
                onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
              />
              <AppButton
                className="wb-header-refresh"
                label={t('刷新', 'Refresh')}
                icon={<RefreshCw size={16} />}
                iconOnly
                tone="ghost"
                busy={loading}
                onClick={() => void refresh()}
              />
              {auth.required && auth.authenticated && (
                <AppButton
                  label={t('退出登录', 'Sign out')}
                  icon={<LogOut size={17} />}
                  iconOnly
                  tone="ghost"
                  onClick={() => void action('logout', () => post('/logout'))}
                />
              )}
            </div>
          </header>
          <main
            id="wb-main"
            className={`wb-main ${route.page === 'run' ? 'wb-main-run' : ''} ${route.page === 'work' || (route.page === 'project' && project) ? 'wb-main-work' : ''} ${route.page === 'inbox' && data?.capabilities.task_query === true ? 'wb-main-inbox' : ''}`}
            tabIndex={-1}
          >
            {error && (
              <div className="wb-error wb-banner" role="alert">
                <span>{error}</span>
                <AppButton
                  label={t('重试连接', 'Reconnect')}
                  size="sm"
                  onClick={() => void refresh()}
                />
              </div>
            )}
            {formBlocked && (
              <div className="wb-error wb-banner" role="alert">
                <span>
                  {t(
                    '当前页面有未保存内容或待核对请求，请先处理后再新建。',
                    'This page has unsaved content or an unresolved request. Resolve it before creating another item.',
                  )}
                </span>
                <AppButton
                  label={t('关闭提示', 'Dismiss')}
                  icon={<X size={15} />}
                  iconOnly
                  tone="ghost"
                  onClick={() => setFormBlocked(false)}
                />
              </div>
            )}
            {data && workspaceCounts.remote && workspaceCounts.error && (
              <div className="wb-error wb-banner" role="alert">
                <span>
                  {workspaceCounts.error === 'forbidden'
                    ? t(
                        '没有读取工作区计数的权限。',
                        'Workspace count access is forbidden.',
                      )
                    : t(
                        '工作区计数不可用，未显示数值。',
                        'Workspace counts are unavailable. Values were not shown.',
                      )}
                </span>
                <AppButton
                  label={t('重试计数', 'Retry counts')}
                  icon={<RefreshCw size={15} />}
                  size="sm"
                  onClick={workspaceCounts.retry}
                />
              </div>
            )}
            {notice && (
              <div className="wb-notice wb-banner" role="status">
                <span>{notice}</span>
                <AppButton
                  label={t('关闭提示', 'Dismiss')}
                  tone="ghost"
                  icon={<X size={16} />}
                  iconOnly
                  onClick={() => setNotice('')}
                />
              </div>
            )}
            {route.page === 'project' &&
              projectDetail.remote &&
              projectDetail.value &&
              projectDetail.error && (
                <div className="wb-error" role="alert">
                  <span>
                    {t(
                      '项目刷新失败，当前显示上次确认的资料。',
                      'Project refresh failed. Showing the last validated details.',
                    )}
                  </span>
                  <AppButton
                    label={t('重试项目', 'Retry project')}
                    icon={<RefreshCw size={16} />}
                    onClick={projectDetail.retry}
                  />
                </div>
              )}
            {!data ? (
              loading ? (
                <AppLoading
                  label={t('正在读取工作空间', 'Loading workspace')}
                />
              ) : (
                <div className="wb-empty">
                  <Box size={32} />
                  <h1>{t('工作空间尚未连接', 'Workspace unavailable')}</h1>
                </div>
              )
            ) : ['overview', 'inbox', 'hierarchy', 'documents'].includes(
                route.page,
              ) ? (
              <Suspense
                fallback={
                  <AppLoading label={t('正在读取视图', 'Loading view')} />
                }
              >
                {route.page === 'overview' ? (
                  <Overview
                    data={data}
                    t={t}
                    onNewTask={newTask}
                    onPrepare={(task) => void prepare(task)}
                  />
                ) : route.page === 'inbox' ? (
                  <WorkInbox
                    data={data}
                    t={t}
                    onNewTask={newTask}
                    onPrepare={(task) => void prepare(task)}
                    refreshRevision={queryRefreshRevision}
                    location={listLocation}
                    onLocationChange={updateListLocation}
                    resetKey={queryDraftResetKey}
                  />
                ) : route.page === 'hierarchy' ? (
                  <ProjectHierarchy
                    data={data}
                    t={t}
                    onNewTask={newTask}
                    onPrepare={(task) => void prepare(task)}
                  />
                ) : (
                  <ProjectDocuments data={data} t={t} />
                )}
              </Suspense>
            ) : route.page === 'devices' ? (
              <Suspense
                fallback={
                  <AppLoading label={t('正在读取设备', 'Loading devices')} />
                }
              >
                <DevicesPage
                  data={data}
                  refreshRevision={queryRefreshRevision}
                  t={t}
                  locale={locale}
                />
              </Suspense>
            ) : route.page === 'workflows' ? (
              <Suspense
                fallback={
                  <AppLoading label={t('正在读取工作流', 'Loading workflow')} />
                }
              >
                <WorkflowPage
                  data={data}
                  refreshRevision={queryRefreshRevision}
                  t={t}
                  locale={locale}
                />
              </Suspense>
            ) : route.page === 'task' ? (
              <Suspense
                fallback={
                  <AppLoading label={t('正在读取任务', 'Loading task')} />
                }
              >
                <TaskWorkspace
                  onChanged={refresh}
                  key={route.id}
                  taskId={route.id}
                  data={data}
                  refreshRevision={queryRefreshRevision}
                  t={t}
                  locale={locale}
                  legacyUrl={legacyUrl}
                  preparing={Boolean(actionBusy)}
                  onPrepare={(task) => void prepare(task)}
                  onPrepareTurn={(
                    task: Task,
                    turn: TaskTurn,
                    snapshot: Snapshot,
                  ) => {
                    setForm({ kind: 'run', task, turn, snapshot })
                  }}
                  onOpenPreparedTurn={(task: Task, turn: TaskTurn) => {
                    if (turn.candidate)
                      setForm({
                        kind: 'run',
                        task,
                        turn,
                        snapshot: turn.candidate.snapshot,
                      })
                  }}
                />
              </Suspense>
            ) : route.page === 'run' ? (
              <Suspense
                fallback={
                  <p role="status">{t('正在读取运行', 'Loading run')}</p>
                }
              >
                <RunWorkspace
                  key={route.id}
                  runId={route.id || data.runs[0]?.id}
                  t={t}
                  locale={locale}
                  legacyUrl={legacyUrl}
                />
              </Suspense>
            ) : route.page === 'project' && projectDetail.remote && !project ? (
              <div
                className="wb-project-resource-state"
                data-testid="project-resource-state"
              >
                {projectDetail.error ? (
                  <div className="wb-empty">
                    <FolderGit2 size={30} />
                    <h1>
                      {projectDetail.error === 'missing'
                        ? t('项目不存在', 'Project not found')
                        : projectDetail.error === 'forbidden'
                          ? t('无权读取项目', 'Project access forbidden')
                          : t('项目读取失败', 'Project unavailable')}
                    </h1>
                    <p role="alert">
                      {projectDetail.error === 'missing'
                        ? t(
                            '该项目已不存在或不可用。',
                            'This project is missing or unavailable.',
                          )
                        : projectDetail.error === 'timeout'
                          ? t(
                              '读取项目超时。',
                              'Reading the project timed out.',
                            )
                          : projectDetail.error === 'unavailable'
                            ? t(
                                '项目详情接口不可用。',
                                'The project detail endpoint is unavailable.',
                              )
                            : t(
                                '项目详情未通过读取或验证。',
                                'Project details could not be read or validated.',
                              )}
                    </p>
                    <AppButton
                      label={t('重试项目', 'Retry project')}
                      icon={<RefreshCw size={16} />}
                      onClick={projectDetail.retry}
                    />
                  </div>
                ) : (
                  <AppLoading label={t('正在读取项目', 'Loading project')} />
                )}
              </div>
            ) : route.page === 'work' ||
              (route.page === 'project' && project) ? (
              <Suspense
                fallback={
                  <AppLoading label={t('正在读取任务', 'Loading tasks')} />
                }
              >
                <FocusedWorkbench
                  data={data}
                  refreshRevision={queryRefreshRevision}
                  t={t}
                  locale={locale}
                  contextProject={
                    route.page === 'project' ? project : undefined
                  }
                  contextProjectBusy={
                    route.page === 'project' && projectDetail.busy
                  }
                  query={query}
                  filter={filter}
                  onFilterChange={(value) =>
                    updateListLocation({
                      filter: value,
                      states: undefined,
                      page: 1,
                    })
                  }
                  projectFilter={projectFilter}
                  onProjectFilterChange={(value) =>
                    updateListLocation({
                      project: value === 'all' ? undefined : value,
                      projects: undefined,
                      page: 1,
                    })
                  }
                  view={workView}
                  onViewChange={(value) => {
                    setWorkView(value)
                    updateListLocation({ view: value, page: 1 })
                  }}
                  location={listLocation}
                  queryDraftResetKey={queryDraftResetKey}
                  onLocationChange={updateListLocation}
                  jqlDraft={jqlDraft}
                  onJqlDraftChange={setJqlDraft}
                  onNewTask={newTask}
                  onPrepare={(task) => void prepare(task)}
                />
              </Suspense>
            ) : route.page === 'projects' ? (
              <>
                <div className="wb-page-heading">
                  <h1>{pageTitle}</h1>
                  <div className="wb-inline">
                    <AppButton
                      label={t('层级视图', 'Hierarchy')}
                      icon={<GitBranch size={16} />}
                      href="#hierarchy"
                    />
                    <AppButton
                      label={t('创建项目', 'Create project')}
                      tone="primary"
                      icon={<Plus size={17} />}
                      onClick={() => setForm({ kind: 'project' })}
                    />
                  </div>
                </div>
                {data.capabilities.project_query === true ? (
                  <Suspense
                    fallback={
                      <AppLoading
                        label={t('正在读取项目', 'Loading projects')}
                      />
                    }
                  >
                    <ProjectResourceList
                      data={data}
                      refreshRevision={queryRefreshRevision}
                      t={t}
                      location={listLocation}
                      resetKey={queryDraftResetKey}
                      onLocationChange={updateListLocation}
                    />
                  </Suspense>
                ) : (
                  <>
                    <div className="wb-project-list">
                      {data.projects.map((item) => (
                        <a href={`#project/${item.id}`} key={item.id}>
                          <span className="wb-project-tile">
                            <FolderGit2 size={21} />
                          </span>
                          <div>
                            <h2>{item.name}</h2>
                            <p>{item.goal || item.directory}</p>
                            <small>
                              {
                                data.tasks.filter(
                                  (task) => task.project_id === item.id,
                                ).length
                              }{' '}
                              {t('项任务', 'tasks')} ·{' '}
                              <code>{item.directory}</code>
                            </small>
                          </div>
                          <ChevronRight size={18} />
                        </a>
                      ))}
                    </div>
                    {!data.projects.length && (
                      <div className="wb-empty">
                        <FolderGit2 size={30} />
                        <h2>{t('尚未创建项目', 'No projects yet')}</h2>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : route.page === 'models' ? (
              <>
                <div className="wb-page-heading">
                  <div>
                    <div className="wb-eyebrow">CONFIGURATION</div>
                    <h1>{pageTitle}</h1>
                  </div>
                  <AppButton
                    label={t('添加模型', 'Add model')}
                    tone="primary"
                    icon={<Plus size={17} />}
                    onClick={() => setForm({ kind: 'model' })}
                  />
                </div>
                <section className="wb-settings-section">
                  <div className="wb-section-title">
                    <h2>{t('本地 Harness', 'Local harnesses')}</h2>
                    <small>
                      {t(
                        '可执行文件发现 · 认证未验证',
                        'Binary discovery · Authentication unverified',
                      )}
                    </small>
                  </div>
                  {data.local_harnesses
                    .filter((item) => item.available)
                    .map((item) => (
                      <div className="wb-settings-row" key={item.id}>
                        <span className="wb-project-tile">
                          <Terminal size={19} />
                        </span>
                        <div className="wb-settings-copy">
                          <strong>{item.label}</strong>
                          <p>
                            {t(
                              '已发现，认证未验证',
                              'Found, authentication unverified',
                            )}
                          </p>
                        </div>
                        {item.id === 'codex' ? (
                          <AppButton
                            label={
                              data.models.some(
                                (model) => model.kind === 'codex_cli',
                              )
                                ? t('已启用配置', 'Configuration enabled')
                                : t(
                                    '启用 Codex Adapter',
                                    'Enable Codex Adapter',
                                  )
                            }
                            icon={
                              data.models.some(
                                (model) => model.kind === 'codex_cli',
                              ) ? (
                                <Check size={16} />
                              ) : (
                                <Plus size={16} />
                              )
                            }
                            disabled={data.models.some(
                              (model) => model.kind === 'codex_cli',
                            )}
                            busy={actionBusy === 'codex'}
                            onClick={() =>
                              void action(
                                'codex',
                                () => post('/models/enable-codex'),
                                t(
                                  '已保存配置，未发起模型请求',
                                  'Configuration saved. No model request made.',
                                ),
                              )
                            }
                          />
                        ) : (
                          <AppBadge>{t('尚无适配器', 'No adapter')}</AppBadge>
                        )}
                      </div>
                    ))}
                  {!data.local_harnesses.some((item) => item.available) && (
                    <p className="wb-hint">
                      {t('未发现本地 Harness', 'No local harness found')}
                    </p>
                  )}
                </section>
                <section className="wb-settings-section">
                  <div className="wb-section-title">
                    <h2>{t('模型连接', 'Model connections')}</h2>
                    <small>
                      {t(
                        '保存配置不等于连接验证',
                        'Saving is not connection verification',
                      )}
                    </small>
                  </div>
                  {data.models.map((item) => (
                    <ModelRow
                      key={item.id}
                      model={item}
                      data={data}
                      t={t}
                      busy={actionBusy === item.id}
                      onTest={() => setForm({ kind: 'test', model: item })}
                      onDefault={() =>
                        void action(item.id, () =>
                          post('/settings/default-model', {
                            model_id: item.id,
                          }),
                        )
                      }
                    />
                  ))}
                  {!data.models.length && (
                    <div className="wb-empty">
                      <SlidersHorizontal size={28} />
                      <h2>{t('尚无模型配置', 'No model configurations')}</h2>
                      <AppButton
                        label={t('添加模型', 'Add model')}
                        onClick={() => setForm({ kind: 'model' })}
                        icon={<Plus size={16} />}
                      />
                    </div>
                  )}
                </section>
              </>
            ) : route.page === 'backends' ? (
              <>
                <div className="wb-page-heading">
                  <div>
                    <div className="wb-eyebrow">CONNECTIONS</div>
                    <h1>{pageTitle}</h1>
                  </div>
                  <AppButton
                    label={t('添加后端', 'Add backend')}
                    tone="primary"
                    icon={<Plus size={17} />}
                    onClick={() => setForm({ kind: 'backend' })}
                  />
                </div>
                {!data.capabilities.backend_sync && (
                  <div className="wb-notice">
                    <ShieldCheck size={18} />
                    <span>
                      {t(
                        '会话同步未启用：读取权限尚未通过验收。可保存本机连接或显式检查健康状态。',
                        'Conversation sync is disabled pending read-permission verification. Local configuration and explicit health checks are available.',
                      )}
                    </span>
                  </div>
                )}
                <div className="wb-settings-section">
                  {data.backends.map((item) => (
                    <div className="wb-settings-row" key={item.id}>
                      <span className="wb-project-tile">
                        <Network size={19} />
                      </span>
                      <div className="wb-settings-copy">
                        <strong>{item.name}</strong>
                        <code>{item.endpoint}</code>
                        <small>
                          {item.revoked_at
                            ? t('已撤销', 'Revoked')
                            : `${t('健康检查', 'Health check')}: ${item.test_status ?? t('未检查', 'Not checked')}`}{' '}
                          ·{' '}
                          {t(
                            '认证与读取权限未验证',
                            'Auth & read access unverified',
                          )}
                        </small>
                      </div>
                      <div className="wb-inline">
                        <AppButton
                          label={t('检查', 'Check')}
                          disabled={!!item.revoked_at}
                          onClick={() =>
                            setForm({ kind: 'check', backend: item })
                          }
                        />
                        <AppButton
                          label={t('撤销', 'Revoke')}
                          tone="ghost"
                          disabled={!!item.revoked_at}
                          onClick={() =>
                            setForm({ kind: 'revoke', backend: item })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {!data.backends.length && (
                  <div className="wb-empty">
                    <Network size={30} />
                    <h2>{t('尚无会话后端', 'No conversation backends')}</h2>
                    <AppButton
                      label={t('添加后端', 'Add backend')}
                      icon={<Plus size={16} />}
                      onClick={() => setForm({ kind: 'backend' })}
                    />
                  </div>
                )}
                <a
                  className="wb-text-link"
                  href={`${legacyUrl}/#backends`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(
                    '在旧版查看会话缓存',
                    'View cached conversations in classic',
                  )}
                  <ExternalLink size={14} />
                </a>
              </>
            ) : (
              <div className="wb-empty">
                <h1>
                  {t('找不到这个页面或项目', 'Page or project not found')}
                </h1>
                <AppButton
                  label={t('返回工作台', 'Back to workbench')}
                  href="#workbench"
                />
              </div>
            )}
          </main>
        </div>
      </div>
      {menu && !dockedNavigation && (
        <AppDialog
          title={t('工作空间导航', 'Workspace navigation')}
          closeLabel={t('关闭导航', 'Close navigation')}
          onClose={() => setMenu(false)}
        >
          <div
            className="wb-mobile-nav"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) setMenu(false)
            }}
          >
            {nav()}
          </div>
        </AppDialog>
      )}
      {preferences && (
        <AppDialog
          title={t('偏好设置', 'Preferences')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setPreferences(false)}
        >
          <div className="wb-preferences">
            <AppSegments
              label={t('设置分类', 'Settings section')}
              value={preferenceTab}
              onChange={setPreferenceTab}
              options={[
                { value: 'appearance', label: t('外观', 'Appearance') },
                { value: 'language', label: t('语言', 'Language') },
                { value: 'connections', label: t('连接', 'Connections') },
              ]}
            />
            {preferenceTab === 'appearance' ? (
              <div className="wb-form">
                <h3>{t('界面样式', 'Interface style')}</h3>
                <AppStylePicker
                  label={t('界面样式', 'Interface style')}
                  value={styleId}
                  options={styleOptions}
                  onChange={(value) => setStyleId(value as StyleId)}
                />
                <h3>{t('主色', 'Accent color')}</h3>
                <AppStylePicker
                  label={t('主色', 'Accent color')}
                  value={accentId}
                  options={accentOptions.map((option) => ({
                    value: option.value,
                    label: t(option.zh, option.en),
                    swatch: option.swatch,
                  }))}
                  onChange={(value) => setAccentId(value as AccentId)}
                />
                <h3>{t('明暗模式', 'Color mode')}</h3>
                <AppSegments
                  label={t('明暗模式', 'Color mode')}
                  value={mode}
                  onChange={(value) => setMode(value as 'light' | 'dark')}
                  options={[
                    {
                      value: 'light',
                      label: t('浅色', 'Light'),
                      icon: <Sun size={15} />,
                    },
                    {
                      value: 'dark',
                      label: t('深色', 'Dark'),
                      icon: <Moon size={15} />,
                    },
                  ]}
                />
                <h3>{t('信息密度', 'Density')}</h3>
                <AppSegments
                  label={t('信息密度', 'Density')}
                  value={density}
                  onChange={(value) => setDensity(value as Density)}
                  options={[
                    { value: 'comfortable', label: t('舒适', 'Comfortable') },
                    { value: 'compact', label: t('紧凑', 'Compact') },
                    { value: 'touch', label: t('触控', 'Touch') },
                  ]}
                />
              </div>
            ) : preferenceTab === 'language' ? (
              <div className="wb-form">
                <h3>{t('显示语言', 'Display language')}</h3>
                <AppSegments
                  label={t('显示语言', 'Display language')}
                  value={locale}
                  onChange={(value) => setLocale(value as Locale)}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' },
                  ]}
                />
              </div>
            ) : (
              <div className="wb-form">
                <AppButton
                  label={t('模型与资源', 'Models & resources')}
                  href="#models"
                  icon={<ArrowRight size={15} />}
                />
                <AppButton
                  label={t('会话后端', 'Conversation backends')}
                  href="#backends"
                  icon={<ArrowRight size={15} />}
                />
                <AppButton
                  label={t('登录与会话', 'Sign-in & session')}
                  href="#login"
                  icon={<ShieldCheck size={15} />}
                />
              </div>
            )}
          </div>
        </AppDialog>
      )}
      {commands && data && (
        <Suspense
          fallback={
            <AppLoading label={t('正在打开快速查找', 'Opening quick find')} />
          }
        >
          <WorkbenchCommands
            data={data}
            t={t}
            onClose={() => setCommands(false)}
            onNavigate={(href) => {
              pushWorkbenchNavigation(href)
            }}
          />
        </Suspense>
      )}
      {form && data && (
        <WorkbenchForm
          key={`${form.kind}-${'task' in form ? form.task.id : 'model' in form ? form.model.id : 'backend' in form ? form.backend.id : ''}-${form.kind === 'run' ? (form.turn?.id ?? 'ordinary') : ''}`}
          state={form}
          data={data}
          refreshRevision={queryRefreshRevision}
          t={t}
          onClose={() => setForm(null)}
          onSaved={refresh}
          onCreateProject={() => setForm({ kind: 'project' })}
          onTask={(task) => {
            pushWorkbenchNavigation(taskWorkspaceHref(task.id))
          }}
          onRun={(id) => {
            pushWorkbenchNavigation(
              form.kind === 'run' && route.page === 'task'
                ? taskWorkspaceHref(form.task.id, { tab: 'work', runId: id })
                : `#run/${id}`,
            )
          }}
        />
      )}
    </AppTheme>
  )
}

function ModelRow({
  model,
  data,
  t,
  busy,
  onTest,
  onDefault,
}: {
  model: Model
  data: Bootstrap
  t: Copy
  busy: boolean
  onTest: () => void
  onDefault: () => void
}) {
  return (
    <div className="wb-settings-row">
      <span className="wb-project-tile">
        <Box size={19} />
      </span>
      <div className="wb-settings-copy">
        <div className="wb-inline">
          <strong>{model.name}</strong>
          {data.default_model_id === model.id && (
            <AppBadge tone="info">{t('默认', 'Default')}</AppBadge>
          )}
        </div>
        <code>
          {model.model} · {model.endpoint}
        </code>
        <small>
          {model.tested_at
            ? `${t('最近测试', 'Last test')}: ${model.test_status} · ${model.tested_at.slice(0, 16).replace('T', ' ')}`
            : t('尚未测试连接', 'Connection not tested')}
          {model.kind !== 'codex_cli' && !model.key_available
            ? ` · ${t('密钥环境变量缺失', 'Key environment variable missing')}`
            : ''}
        </small>
      </div>
      <div className="wb-inline">
        <AppButton
          label={t('设为默认', 'Set default')}
          size="sm"
          disabled={data.default_model_id === model.id}
          busy={busy}
          onClick={onDefault}
        />
        <AppButton
          label={t('测试连接', 'Test connection')}
          size="sm"
          onClick={onTest}
        />
      </div>
    </div>
  )
}
