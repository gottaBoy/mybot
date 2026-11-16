import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  FolderGit2,
  GitBranch,
  History,
  LayoutList,
  PanelLeft,
  Plus,
  Search,
  Table2,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  CircleAlert,
  CircleCheck,
  CircleDot,
  X,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppDialog,
  AppInput,
  AppLoading,
  AppSegments,
  AppSelect,
} from '../components/ui'
import {
  AppDataTable,
  useAppTableRows,
  type AppColumn,
  type AppTableSort,
} from '../components/ui/DataTable'
import { AppTableControls } from '../components/ui/TableControls'
import { AppMultiSelect } from '../components/ui/MultiSelect'
import { useAppControlSize } from '../components/ui/DensityContext'
import {
  useCompactTaskList,
  useDockedTaskScope,
  useWideInspector,
  useSimultaneousTaskPanels,
} from '../components/ui/useViewport'
import type { Bootstrap, Project, Task } from './api'
import type { ListLocation } from './list-location'
import { supportedListQuery } from './list-location'
import { filterTaskItems, type WorkItem } from './projections'
import {
  committedQueryConditions,
  querySelectionPatch,
} from './query-selection'
import {
  buildQueryFieldDirectory,
  matchesRunConditions,
  matchesTaskConditions,
  queryConditionsEqual,
  type QueryConditions,
  type QueryStateCategory,
} from './query-conditions'
import { TaskTableSettings } from './TaskTableSettings'
import { parseTaskSort } from './task-sort'
import { useListContinuity } from './list-continuity'
import { SavedViewsMenu } from './SavedViewsMenu'
import {
  captureSavedViewDefinition,
  savedViewLocationPatch,
} from './saved-view-projection'
import type { SavedViewScope } from './saved-views'
import {
  selectRuns,
  statusText,
  statusTone,
  type Copy,
  type Filter,
  type Locale,
} from './state'
import './focused-workbench.css'
import {
  defaultTaskColumns,
  defaultTaskColumnOrder,
  normalizeTaskColumns,
  normalizeTaskColumnOrder,
  readTaskColumns,
  readTaskColumnOrder,
  taskColumnsPreferenceKey,
  taskColumnOrderPreferenceKey,
} from './task-table-config'

const RunsTable = lazy(() =>
  import('./RunViews').then((module) => ({ default: module.RunsTable })),
)
const TaskBoard = lazy(() =>
  import('./RunViews').then((module) => ({ default: module.TaskBoard })),
)

type Props = {
  data: Bootstrap
  t: Copy
  locale: Locale
  query: string
  filter: Filter
  onFilterChange: (value: Filter) => void
  projectFilter: string
  onProjectFilterChange: (value: string) => void
  view: 'list' | 'table' | 'board'
  onViewChange: (value: 'list' | 'table' | 'board') => void
  location: ListLocation
  onLocationChange: (patch: Partial<ListLocation>) => void
  queryDraftResetKey: number
  jqlDraft: string
  onJqlDraftChange: (value: string) => void
  onNewTask: () => void
  onPrepare: (task: Task) => void
  contextProject?: Project
}

export function FocusedWorkbench(props: Props) {
  const {
    data,
    t,
    locale,
    query,
    filter,
    onFilterChange,
    projectFilter,
    onProjectFilterChange,
    view,
    onViewChange,
    location,
    onLocationChange,
    queryDraftResetKey,
    jqlDraft,
    onJqlDraftChange,
    onNewTask,
    onPrepare,
    contextProject,
  } = props
  const [selected, setSelected] = useState('')
  const [queryDraft, setQueryDraft] = useState(query)
  const committedSelection = committedQueryConditions(
    location,
    contextProject?.id,
  )
  const committedConditions = committedSelection.conditions
  const projectsKey = JSON.stringify(committedConditions.projects)
  const statesKey = JSON.stringify(committedConditions.states)
  const [conditionDraft, setConditionDraft] =
    useState<QueryConditions>(committedConditions)
  const [scopeRailOpen, setScopeRailOpen] = useState(true)
  const [mobileScopeOpen, setMobileScopeOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState(readTaskColumns)
  const [columnOrder, setColumnOrder] = useState(readTaskColumnOrder)
  const [tableSettingsOpen, setTableSettingsOpen] = useState(false)
  const [projectInfoOpen, setProjectInfoOpen] = useState(false)
  const [viewFeedbackContainer, setViewFeedbackContainer] =
    useState<HTMLDivElement | null>(null)
  const controlSize = useAppControlSize()
  const scopeCollapseTrigger = useRef<HTMLButtonElement>(null)
  const scopeExpandTrigger = useRef<HTMLButtonElement>(null)
  const page = location.page ?? 1
  const pageSize = location.pageSize ?? 20
  const setPage = (value: number) => onLocationChange({ page: value })
  const sort: AppTableSort =
    location.sorts ??
    (location.order
      ? [
          {
            sortKey: location.order.split(':')[0],
            direction: location.order.split(':')[1] as
              'ascending' | 'descending',
          },
        ]
      : [])
  const inspectorId = useId()
  const pageRoot = useRef<HTMLDivElement>(null)
  const listScroll = useRef<HTMLDivElement>(null)
  const inspectorTitle = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const wide = useWideInspector()
  const dockedScope = useDockedTaskScope()
  const compactList = useCompactTaskList()
  const simultaneousPanels = useSimultaneousTaskPanels()
  const scopeId = useId()
  const scope = contextProject?.id
  const scopedProjectFilter =
    contextProject?.id ??
    (committedConditions.projects.length === 1
      ? committedConditions.projects[0]
      : committedConditions.projects.length
        ? ''
        : 'all')
  const scopedStateFilter =
    committedConditions.states.length === 0
      ? 'all'
      : committedConditions.states.length === 1 &&
          ['active', 'attention', 'completed'].includes(
            committedConditions.states[0],
          )
        ? (committedConditions.states[0] as Filter)
        : undefined
  const hasFilters = Boolean(
    query ||
    committedConditions.states.length ||
    (!contextProject && committedConditions.projects.length),
  )
  const tasks = filterTaskItems(data, query, 'all', scope).filter((item) =>
    matchesTaskConditions(item, committedConditions, scope),
  )
  const unavailableProject =
    !contextProject &&
    committedConditions.projects.some(
      (id) => !data.projects.some((project) => project.id === id),
    )
  const queryPolicy = supportedListQuery(location)
  const problem =
    queryPolicy.error ??
    committedSelection.error ??
    (unavailableProject ? 'condition_value_unavailable' : undefined) ??
    (view === 'board' && location.jql ? 'jql_unavailable' : undefined)
  const runs = selectRuns(data, query, 'all', scope).filter((run) =>
    matchesRunConditions(
      run,
      data.tasks.find((task) => task.id === run.task_id),
      committedConditions,
      scope,
    ),
  )
  const active = tasks.find((item) => item.id === selected)
  const scopeVisible =
    scopeRailOpen && dockedScope && (!active || !wide || simultaneousPanels)
  const collapsedScopeVisible = dockedScope && !scopeVisible && !active
  const totalPages = Math.max(1, Math.ceil(tasks.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const continuity = useListContinuity({
    rootRef: pageRoot,
    scrollRef: listScroll,
    selected,
    onSelectedChange: setSelected,
    resultIds: tasks.map((item) => item.id),
    ready: view === 'list' && !problem,
    scopeKey: JSON.stringify([data.workspace, contextProject?.id ?? 'work']),
  })
  useEffect(() => {
    setProjectInfoOpen(false)
  }, [contextProject?.id])
  useEffect(() => {
    setQueryDraft(query)
  }, [query, queryDraftResetKey, contextProject?.id])
  useEffect(() => {
    setConditionDraft((current) => ({
      ...current,
      states: committedConditions.states,
    }))
  }, [statesKey, queryDraftResetKey, contextProject?.id])
  useEffect(() => {
    setConditionDraft((current) => ({
      ...current,
      projects: committedConditions.projects,
    }))
  }, [projectsKey, queryDraftResetKey, contextProject?.id])
  useEffect(() => {
    if (wide && selected && !continuity.consumeInspectorFocusSuppression())
      inspectorTitle.current?.focus()
  }, [selected, wide])
  useEffect(() => {
    if (continuity.unavailableSelection)
      pageRoot.current?.focus({ preventScroll: true })
  }, [continuity.unavailableSelection])
  useEffect(() => {
    if (dockedScope) setMobileScopeOpen(false)
  }, [dockedScope])
  useEffect(() => {
    try {
      localStorage.setItem(
        taskColumnsPreferenceKey,
        JSON.stringify(visibleColumns),
      )
      localStorage.setItem(
        taskColumnOrderPreferenceKey,
        JSON.stringify(columnOrder),
      )
    } catch {
      // Column preferences are optional when browser storage is blocked.
    }
  }, [visibleColumns, columnOrder])
  const when = (value?: string) =>
    value
      ? new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-'
  type Row = WorkItem & {
    title: string
    status: string
    updated: string
    created_at: string
  }
  const rows: Row[] = tasks.map((item) => ({
    ...item,
    title: item.task.title,
    status: item.run?.status ?? 'pending',
    updated: item.run?.created_at ?? '',
    created_at: item.task.created_at ?? '',
  }))
  if (queryPolicy.sort) {
    const { key, descending } = queryPolicy.sort
    const compare = (a: string, b: string) =>
      a.localeCompare(b, locale === 'zh' ? 'zh-CN' : 'en') *
      (descending ? -1 : 1)
    runs.sort((a, b) =>
      compare(
        key === 'title'
          ? (data.tasks.find((task) => task.id === a.task_id)?.title ?? '')
          : a.created_at,
        key === 'title'
          ? (data.tasks.find((task) => task.id === b.task_id)?.title ?? '')
          : b.created_at,
      ),
    )
  }
  const sorting = {
    sort: queryPolicy.sort
      ? [
          {
            sortKey: queryPolicy.sort.key,
            direction: queryPolicy.sort.descending
              ? ('descending' as const)
              : ('ascending' as const),
          },
        ]
      : sort,
    onSortChange: (value: AppTableSort) => {
      const rules = parseTaskSort(value)
      if (!rules) return
      const first = rules[0]
      onLocationChange({
        order:
          rules.length === 1
            ? `${first.sortKey}:${first.direction}`
            : undefined,
        sorts: rules.length > 1 ? rules : undefined,
        page: 1,
      })
    },
  }
  const sortedRows = useAppTableRows(rows, sorting)
  const pick = (item: WorkItem, button: HTMLButtonElement) => {
    trigger.current = button
    setSelected(item.id)
  }
  const close = () => {
    const taskId = selected
    setSelected('')
    requestAnimationFrame(() => {
      const visible = (button: HTMLButtonElement) =>
        button.isConnected && button.getClientRects().length > 0
      const original = trigger.current
      const target =
        original && visible(original)
          ? original
          : Array.from(
              pageRoot.current?.querySelectorAll<HTMLButtonElement>(
                '[data-task-trigger]',
              ) ?? [],
            ).find(
              (button) =>
                button.dataset.taskTrigger === taskId && visible(button),
            )
      target?.focus()
    })
  }
  const disclosure = (id: string) => ({
    'aria-expanded': selected === id,
    'aria-controls': selected === id ? inspectorId : undefined,
  })
  const columns: AppColumn<Row>[] = [
    {
      key: 'id',
      title: t('编号', 'ID'),
      width: 94,
      sortable: !location.jql,
      render: (row) => (
        <code className="wf-task-id" title={row.id}>
          {row.id.slice(0, 7)}
        </code>
      ),
    },
    {
      key: 'title',
      title: t('任务', 'Task'),
      minWidth: 220,
      sortable: !location.jql,
      render: (row) => (
        <div className="wf-task-name">
          <GitBranch size={15} />
          <div>
            <AppButton
              label={row.title}
              tone="ghost"
              className="wf-title-button"
              data-task-trigger={row.id}
              {...disclosure(row.id)}
              onClick={(event) => pick(row, event.currentTarget)}
            >
              <span className="wf-task-summary" title={row.title}>
                {row.title}
              </span>
            </AppButton>
          </div>
        </div>
      ),
    },
    {
      key: 'projectName',
      title: t('项目', 'Project'),
      width: 125,
      render: (row: Row) => (
        <span className="wf-project-name" title={row.projectName}>
          {row.projectName || t('项目未知', 'Unknown project')}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('执行状态', 'Execution'),
      width: 112,
      sortable: !location.jql,
      render: (row) => (
        <AppBadge tone={row.run ? statusTone(row.status) : 'neutral'}>
          {row.run ? statusText(row.status, t) : t('未运行', 'Not started')}
        </AppBadge>
      ),
    },
    {
      key: 'updated',
      title: t('最近运行', 'Latest run'),
      width: 146,
      sortable: !location.jql,
      render: (row: Row) => (
        <span className="wf-date">{when(row.updated)}</span>
      ),
    },
    {
      key: 'created_at',
      title: t('创建时间', 'Created'),
      width: 146,
      sortable: !location.jql,
      render: (row) => <span className="wf-date">{when(row.created_at)}</span>,
    },
    {
      key: 'attempts',
      title: t('历史', 'History'),
      width: 90,
      sortable: !location.jql,
      render: (row) => (
        <AppButton
          label={`${row.attempts} ${t('次运行', 'runs')}`}
          icon={<History size={13} />}
          size="sm"
          tone="ghost"
          className="wf-history-button"
          data-task-trigger={row.id}
          {...disclosure(row.id)}
          onClick={(event) => pick(row, event.currentTarget)}
        >
          <span className="wf-run-count">{row.attempts}</span>
        </AppButton>
      ),
    },
  ]
  const clear = () => {
    setQueryDraft('')
    onJqlDraftChange('')
    setConditionDraft({
      projects: contextProject ? [contextProject.id] : [],
      states: [],
    })
    onLocationChange({
      query: undefined,
      filter: undefined,
      project: contextProject?.id,
      projects: undefined,
      states: undefined,
      ...(location.sortsInvalid ? { sorts: undefined } : {}),
      jql: '',
      mode: 'basic',
      groupBy: '',
      group: 'none',
      view,
      page: 1,
    })
  }
  const submitQuery = () => {
    const patch = querySelectionPatch(
      queryDraft,
      conditionDraft,
      contextProject?.id,
    )
    setQueryDraft(patch.query ?? '')
    onLocationChange(patch)
  }
  const queryDraftPending =
    queryDraft !== query ||
    !queryConditionsEqual(conditionDraft, committedConditions)
  const canClearQuery =
    hasFilters ||
    queryDraftPending ||
    Boolean(location.jql || location.groupBy) ||
    !['', 'none'].includes(location.group) ||
    jqlDraft !== location.jql ||
    Boolean(problem)
  const projectConditions = { ...committedConditions, states: [] }
  const scopeTasks = filterTaskItems(data, '', 'all', scope).filter((item) =>
    matchesTaskConditions(item, projectConditions, scope),
  )
  const scopeRuns = selectRuns(data, '', 'all', scope).filter((run) =>
    matchesRunConditions(
      run,
      data.tasks.find((task) => task.id === run.task_id),
      projectConditions,
      scope,
    ),
  )
  const countScope = (state: Filter) =>
    view === 'table'
      ? scopeRuns.filter((run) =>
          matchesRunConditions(
            run,
            data.tasks.find((task) => task.id === run.task_id),
            { ...projectConditions, states: state === 'all' ? [] : [state] },
            scope,
          ),
        ).length
      : scopeTasks.filter((item) => state === 'all' || item.column === state)
          .length
  const scopeCounts = {
    all: countScope('all'),
    active: countScope('active'),
    attention: countScope('attention'),
    completed: countScope('completed'),
  }
  const scopeItems: Array<{ value: Filter; zh: string; en: string }> = [
    {
      value: 'all',
      zh: view === 'table' ? '所有记录' : '所有任务',
      en: view === 'table' ? 'All runs' : 'All tasks',
    },
    { value: 'active', zh: '运行中', en: 'Active' },
    { value: 'attention', zh: '需要处理', en: 'Needs attention' },
    { value: 'completed', zh: '已完成', en: 'Completed' },
  ]
  const scopeNavigation = (
    <TaskScopeNavigation
      id={scopeId}
      showHeading={dockedScope}
      collapseRef={scopeCollapseTrigger}
      onCollapse={() => {
        setScopeRailOpen(false)
        requestAnimationFrame(() => scopeExpandTrigger.current?.focus())
      }}
      data={data}
      t={t}
      filter={scopedStateFilter}
      projectFilter={scopedProjectFilter}
      contextProject={contextProject}
      view={view}
      items={scopeItems}
      counts={scopeCounts}
      onFilterChange={onFilterChange}
      onProjectChange={onProjectFilterChange}
    />
  )
  const toggleScope = () => {
    if (!dockedScope) setMobileScopeOpen(true)
    else if (active && wide && !simultaneousPanels) {
      setSelected('')
      setScopeRailOpen(true)
    } else {
      setScopeRailOpen(true)
      requestAnimationFrame(() => scopeCollapseTrigger.current?.focus())
    }
  }
  const sortOptions = [
    { value: 'default', label: t('默认顺序', 'Default order') },
    { value: 'title:ascending', label: t('名称 A-Z', 'Name A-Z') },
    { value: 'title:descending', label: t('名称 Z-A', 'Name Z-A') },
    { value: 'created_at:descending', label: t('最新创建', 'Newest created') },
    { value: 'created_at:ascending', label: t('最早创建', 'Oldest created') },
    { value: 'id:ascending', label: t('编号正序', 'ID ascending') },
    { value: 'id:descending', label: t('编号倒序', 'ID descending') },
    { value: 'status:ascending', label: t('状态正序', 'Status ascending') },
    { value: 'status:descending', label: t('状态倒序', 'Status descending') },
    { value: 'updated:ascending', label: t('最早运行', 'Oldest run') },
    { value: 'updated:descending', label: t('最近运行', 'Latest run') },
    {
      value: 'attempts:ascending',
      label: t('历史次数正序', 'Run count ascending'),
    },
    {
      value: 'attempts:descending',
      label: t('历史次数倒序', 'Run count descending'),
    },
    { value: 'projectName:ascending', label: t('项目 A-Z', 'Project A-Z') },
    { value: 'projectName:descending', label: t('项目 Z-A', 'Project Z-A') },
  ]
  const tableControls = view === 'list' && (
    <div className="wf-table-tools">
      <AppTableControls
        label={t('列设置', 'Columns')}
        sortLabel={t('排序', 'Sort')}
        columnsLabel={t('显示列', 'Visible columns')}
        resetLabel={t('重置列', 'Reset columns')}
        sort={
          sorting.sort.length
            ? `${sorting.sort[0].sortKey}:${sorting.sort[0].direction}`
            : 'default'
        }
        sortOptions={sortOptions}
        sortSummary={
          sorting.sort.length > 1
            ? `${t('多字段排序', 'Multi-sort')} (${sorting.sort.length})`
            : undefined
        }
        sortLocked={Boolean(queryPolicy.sort)}
        onSortChange={(value) =>
          onLocationChange({
            order: value === 'default' ? undefined : value,
            sorts: undefined,
            page: 1,
          })
        }
        columns={columns.map((column) => ({
          key: column.key,
          label: column.title,
          required: column.key === 'title',
        }))}
        visible={visibleColumns}
        onVisibleChange={(keys) =>
          setVisibleColumns(normalizeTaskColumns(keys))
        }
        onReset={() => {
          setVisibleColumns([...defaultTaskColumns])
          setColumnOrder([...defaultTaskColumnOrder])
        }}
        configureLabel={t('管理列与排序', 'Manage columns & sorting')}
        onConfigure={() => setTableSettingsOpen(true)}
        iconOnly={compactList}
      />
    </div>
  )
  const fieldDirectory = buildQueryFieldDirectory(data, t)
  const projectField = fieldDirectory.find((field) => field.id === 'projects')!
  const stateField = fieldDirectory.find((field) => field.id === 'states')!
  const conditionControls = (inline: boolean) => (
    <>
      {!contextProject && (
        <div className={inline ? 'wf-inline-filter' : undefined}>
          <AppMultiSelect
            label={t('项目', 'Project')}
            hiddenLabel={inline}
            size={controlSize}
            value={conditionDraft.projects}
            onChange={(projects) =>
              setConditionDraft((current) => ({ ...current, projects }))
            }
            options={[
              ...projectField.options,
              ...conditionDraft.projects
                .filter(
                  (id) =>
                    !projectField.options.some((item) => item.value === id),
                )
                .map((id) => ({
                  value: id,
                  label: `${t('不可用项目', 'Unavailable project')} · ${id}`,
                })),
            ]}
            hasSearch
            searchPlaceholder={t('查找项目', 'Find projects')}
          />
        </div>
      )}
      <div className={inline ? 'wf-inline-filter' : undefined}>
        <AppMultiSelect
          label={t('状态', 'Status')}
          hiddenLabel={inline}
          size={controlSize}
          value={conditionDraft.states}
          onChange={(states) =>
            setConditionDraft((current) => ({
              ...current,
              states: states as QueryStateCategory[],
            }))
          }
          options={stateField.options}
          hasSearch
          searchPlaceholder={t('查找状态', 'Find states')}
        />
      </div>
    </>
  )
  const viewControl = (
    <div className="wf-result-view">
      <AppSegments
        label={t('工作视图', 'Work view')}
        value={view}
        onChange={(value) => onViewChange(value as Props['view'])}
        iconOnly={compactList}
        options={[
          {
            value: 'list',
            label: t('任务列表', 'Tasks'),
            icon: <LayoutList size={14} />,
          },
          {
            value: 'board',
            label: t('看板', 'Board'),
            icon: <Columns3 size={14} />,
          },
          {
            value: 'table',
            label: t('运行记录', 'Runs'),
            icon: <Table2 size={14} />,
          },
        ]}
      />
    </div>
  )
  const resultTools = (
    <div
      className="wf-results-toolbar wf-result-toolbar"
      role="toolbar"
      aria-label={t('结果视图与表格工具', 'Result views and table tools')}
    >
      {viewControl}
      {tableControls}
    </div>
  )
  const inspector = active && (
    <TaskInspector
      id={inspectorId}
      titleRef={inspectorTitle}
      showClose={wide}
      item={active}
      data={data}
      t={t}
      when={when}
      onClose={close}
      onPrepare={onPrepare}
    />
  )
  const savedViewScope: SavedViewScope = contextProject
    ? { scope_type: 'project', project_id: contextProject.id }
    : { scope_type: 'workspace', project_id: null }
  const currentSavedDefinition = problem
    ? null
    : captureSavedViewDefinition(
        location,
        { view, columns: visibleColumns, column_order: columnOrder },
        contextProject?.id,
      )
  const savedViewsControl = (
    <SavedViewsMenu
      scope={savedViewScope}
      current={currentSavedDefinition}
      hasPendingQuery={queryDraftPending || jqlDraft !== location.jql}
      t={t}
      iconOnly={compactList}
      feedbackContainer={viewFeedbackContainer}
      onApply={(record) => {
        if (
          record.scope_type !== savedViewScope.scope_type ||
          record.project_id !== savedViewScope.project_id ||
          record.definition.query.projects.some(
            (id) => !data.projects.some((project) => project.id === id),
          )
        )
          throw new Error('saved_view_scope_unavailable')
        const patch = savedViewLocationPatch(
          record.definition,
          contextProject?.id,
        )
        setVisibleColumns([...record.definition.table.columns])
        setColumnOrder([...record.definition.table.column_order])
        setQueryDraft(patch.query ?? '')
        setConditionDraft({
          projects: [...record.definition.query.projects],
          states: [...record.definition.query.states],
        })
        onJqlDraftChange(record.definition.query.jql)
        onLocationChange(patch)
      }}
    />
  )
  return (
    <div
      className={`wf-page ${scopeVisible ? 'has-scope' : ''} ${collapsedScopeVisible ? 'has-collapsed-scope' : ''}`}
      ref={pageRoot}
      tabIndex={-1}
      role="region"
      aria-label={t('任务列表工作区', 'Task list workspace')}
    >
      {scopeVisible && (
        <aside className="wf-scope-rail">{scopeNavigation}</aside>
      )}
      {collapsedScopeVisible && (
        <aside className="wf-scope-collapsed">
          <AppButton
            label={t('展开筛选条件', 'Expand filters')}
            icon={<ChevronsRight size={16} />}
            iconOnly
            tone="ghost"
            ref={scopeExpandTrigger}
            onClick={toggleScope}
            aria-expanded={false}
          />
        </aside>
      )}
      <div className="wf-workspace">
        <header className="wf-heading">
          <div className="wf-heading-content">
            <h1>
              {contextProject?.name ??
                (view === 'table'
                  ? t('运行记录', 'Run history')
                  : t('任务', 'Tasks'))}
            </h1>
            <div className="wf-heading-meta">
              <span className="wf-heading-scope">
                {contextProject
                  ? view === 'table'
                    ? t('运行记录', 'Run history')
                    : t('任务', 'Tasks')
                  : committedConditions.projects.length === 0
                    ? t('全部项目', 'All projects')
                    : committedConditions.projects.length > 1
                      ? `${committedConditions.projects.length} ${t('个项目', 'projects')}`
                      : data.projects.find(
                          (project) =>
                            project.id === committedConditions.projects[0],
                        )?.name}
              </span>
              <span className="wf-result-count" role="status">
                <strong>
                  {problem
                    ? '-'
                    : view === 'table'
                      ? runs.length
                      : tasks.length}
                </strong>{' '}
                {view === 'table' ? t('次运行', 'runs') : t('项任务', 'tasks')}
              </span>
              {(location.mode === 'basic'
                ? queryDraftPending
                : jqlDraft !== location.jql) && (
                <span className="wf-query-draft" role="status">
                  {t('未应用', 'Not applied')}
                </span>
              )}
            </div>
          </div>
          {savedViewsControl}
          {contextProject && (
            <div className="wb-inline">
              <AppButton
                label={t('项目资料', 'Project info')}
                icon={<FolderGit2 size={15} />}
                iconOnly={compactList}
                tone="ghost"
                onClick={() => setProjectInfoOpen(true)}
              />
              <AppButton
                label={t('新建任务', 'New task')}
                icon={<Plus size={15} />}
                iconOnly={compactList}
                tone="primary"
                onClick={onNewTask}
              />
            </div>
          )}
          {!dockedScope && (
            <AppButton
              label={t('筛选条件', 'Filters')}
              icon={<PanelLeft size={16} />}
              iconOnly
              tone="ghost"
              onClick={toggleScope}
              aria-expanded={mobileScopeOpen}
              aria-controls={mobileScopeOpen ? scopeId : undefined}
            />
          )}
        </header>
        <div className="wf-view-feedback" ref={setViewFeedbackContainer} />
        {continuity.unavailableSelection && (
          <p
            className="wb-notice"
            role="status"
            data-list-unavailable={continuity.unavailableSelection}
          >
            {t(
              '此前选择的任务已不在当前结果中。',
              'The previously selected task is unavailable in these results.',
            )}
          </p>
        )}
        <section
          className="wf-querybar"
          aria-label={t('列表搜索', 'List search')}
        >
          <div className="wf-querybar-primary">
            <div className="wf-search-input">
              <AppInput
                label={
                  location.mode === 'basic'
                    ? t('搜索', 'Search')
                    : t('JQL 查询', 'JQL query')
                }
                isLabelHidden
                type={location.mode === 'basic' ? 'search' : 'text'}
                value={location.mode === 'basic' ? queryDraft : jqlDraft}
                onChange={
                  location.mode === 'basic' ? setQueryDraft : onJqlDraftChange
                }
                onEnter={
                  location.mode === 'basic'
                    ? submitQuery
                    : () => onLocationChange({ jql: jqlDraft, view, page: 1 })
                }
                startIcon={<Search size={16} />}
                placeholder={
                  location.mode === 'basic'
                    ? t('在结果中搜索', 'Search in results')
                    : 'ORDER BY created DESC'
                }
                hasClear
              />
            </div>
            {location.mode === 'basic' && conditionControls(true)}
            <div className="wf-query-mode">
              {compactList ? (
                <AppSelect
                  label={t('查询模式', 'Query mode')}
                  hiddenLabel
                  value={location.mode}
                  onChange={(value) =>
                    onLocationChange({ mode: value as 'basic' | 'jql', view })
                  }
                  options={[
                    { value: 'basic', label: t('基本', 'Basic') },
                    { value: 'jql', label: 'JQL' },
                  ]}
                />
              ) : (
                <AppSegments
                  label={t('查询模式', 'Query mode')}
                  value={location.mode}
                  onChange={(value) =>
                    onLocationChange({ mode: value as 'basic' | 'jql', view })
                  }
                  options={[
                    { value: 'basic', label: t('基本搜索', 'Basic') },
                    { value: 'jql', label: 'JQL' },
                  ]}
                />
              )}
            </div>
            <AppButton
              label={
                location.mode === 'basic'
                  ? t('搜索', 'Search')
                  : t('应用查询', 'Apply query')
              }
              icon={<Search size={15} />}
              iconOnly
              size={controlSize}
              tone="primary"
              onClick={
                location.mode === 'basic'
                  ? submitQuery
                  : () => onLocationChange({ jql: jqlDraft, view, page: 1 })
              }
            />
            <AppButton
              label={t('清除筛选', 'Clear filters')}
              tone="ghost"
              size={controlSize}
              icon={<X size={15} />}
              iconOnly
              disabled={!canClearQuery}
              onClick={clear}
            />
          </div>
          {location.mode === 'jql' && query && (
            <div className="wf-querybar-committed">
              <AppButton
                label={`${t('清除文本筛选', 'Clear text filter')}: ${query}`}
                tone="ghost"
                size="sm"
                icon={<X size={13} />}
                onClick={() => onLocationChange({ query: undefined, page: 1 })}
              >
                <span className="wf-committed-query">{query}</span>
              </AppButton>
            </div>
          )}
        </section>
        {location.jql && location.mode === 'basic' && (
          <div className="wf-query-scope">
            <code>{location.jql}</code>
            <AppButton
              label={t('编辑查询', 'Edit query')}
              tone="ghost"
              size="sm"
              onClick={() => onLocationChange({ mode: 'jql', view })}
            />
            <AppButton
              label={t('清除查询', 'Clear query')}
              icon={<X size={14} />}
              iconOnly
              size="sm"
              tone="ghost"
              onClick={() =>
                onLocationChange({
                  jql: '',
                  groupBy: '',
                  group: 'none',
                  view,
                  page: 1,
                })
              }
            />
          </div>
        )}
        {problem && (
          <div className="wb-error wf-query-error" role="alert">
            <span>
              {problem === 'assignee_unavailable'
                ? t(
                    '尚无负责人和用户模型，不能执行 assignee / currentUser() 条件。查询已保留。',
                    'Assignee/currentUser is not supported. The query is retained.',
                  )
                : problem === 'grouping_unavailable'
                  ? t(
                      '当前不支持此分组，未执行查询。',
                      'This grouping is not supported.',
                    )
                  : problem === 'conditions_invalid'
                    ? t(
                        '条件格式无效，未执行查询。',
                        'Invalid query conditions. No query was applied.',
                      )
                    : problem === 'condition_value_unavailable'
                      ? t(
                          '所选项目不可用，请重新选择条件。',
                          'A selected project is unavailable. Review the conditions.',
                        )
                      : problem === 'sort_invalid'
                        ? t(
                            '排序定义无效，未执行查询。',
                            'Invalid sort definition. No query was applied.',
                          )
                        : t(
                            '仅支持 created/summary ORDER BY 排序，其他 JQL 条件尚未实现。',
                            'Only created/summary ordering is supported.',
                          )}
            </span>
            <AppButton
              label={t('清除查询', 'Clear query')}
              size="sm"
              onClick={clear}
            />
          </div>
        )}
        {problem && resultTools}
        {!problem && (
          <div
            className={`wf-result-layout ${active && wide && view === 'list' ? 'has-inspector' : ''}`}
          >
            <section
              className="wf-results"
              aria-label={t('工作台结果', 'Workbench results')}
            >
              {resultTools}
              {view === 'list' ? (
                tasks.length ? (
                  <>
                    <div
                      className="wf-list-body"
                      ref={listScroll}
                      data-list-scroll
                    >
                      <div className="wf-desktop-table">
                        <AppDataTable
                          rows={rows}
                          columns={columnOrder
                            .filter((key) => visibleColumns.includes(key))
                            .map((key) =>
                              columns.find((column) => column.key === key)!,
                            )}
                          label={t('任务列表', 'Tasks')}
                          page={currentPage}
                          pageSize={pageSize}
                          sorting={sorting}
                          empty={null}
                        />
                      </div>
                      <div className="wf-mobile-list">
                        {sortedRows
                          .slice(
                            (currentPage - 1) * pageSize,
                            currentPage * pageSize,
                          )
                          .map((row) => (
                            <article key={row.id} className="wf-mobile-row">
                              <div className="wf-mobile-task">
                                <AppButton
                                  label={row.title}
                                  tone="ghost"
                                  className="wf-title-button"
                                  data-task-trigger={row.id}
                                  {...disclosure(row.id)}
                                  onClick={(event) =>
                                    pick(row, event.currentTarget)
                                  }
                                >
                                  <span>{row.title}</span>
                                </AppButton>
                                <AppBadge
                                  tone={
                                    row.run ? statusTone(row.status) : 'neutral'
                                  }
                                >
                                  {row.run
                                    ? statusText(row.status, t)
                                    : t('未运行', 'Not started')}
                                </AppBadge>
                              </div>
                              <div className="wf-mobile-meta">
                                <span>{row.projectName}</span>
                                <code className="wf-task-id">
                                  {row.id.slice(0, 7)}
                                </code>
                                <AppButton
                                  label={t('查看任务详情', 'Inspect task')}
                                  icon={<ChevronRight size={15} />}
                                  iconOnly
                                  tone="ghost"
                                  size="sm"
                                  data-task-trigger={row.id}
                                  {...disclosure(row.id)}
                                  onClick={(event) =>
                                    pick(row, event.currentTarget)
                                  }
                                />
                              </div>
                            </article>
                          ))}
                      </div>
                    </div>
                    <footer className="wf-pagination">
                      <span>
                        {(currentPage - 1) * pageSize + 1}-
                        {Math.min(currentPage * pageSize, tasks.length)} /{' '}
                        {tasks.length}
                      </span>
                      <div className="wf-page-size">
                        <AppSelect
                          label={t('每页任务数', 'Tasks per page')}
                          hiddenLabel
                          size="sm"
                          value={String(pageSize)}
                          options={[
                            { value: '20', label: t('每页 20', '20 / page') },
                            { value: '50', label: t('每页 50', '50 / page') },
                            {
                              value: '100',
                              label: t('每页 100', '100 / page'),
                            },
                          ]}
                          onChange={(value) =>
                            onLocationChange({
                              pageSize: Number(value),
                              page: 1,
                            })
                          }
                        />
                      </div>
                      <AppButton
                        label={t('上一页', 'Previous page')}
                        className="wf-pagination-prev"
                        icon={<ChevronLeft size={16} />}
                        iconOnly
                        tone="ghost"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setPage(currentPage - 1)}
                      />
                      <output>
                        {currentPage} / {totalPages}
                      </output>
                      <AppButton
                        label={t('下一页', 'Next page')}
                        className="wf-pagination-next"
                        icon={<ChevronRight size={16} />}
                        iconOnly
                        tone="ghost"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage(currentPage + 1)}
                      />
                    </footer>
                  </>
                ) : (
                  <div className="wf-empty">
                    <FileSearch size={27} />
                    <h2>
                      {hasFilters
                        ? t('没有匹配的任务', 'No matching tasks')
                        : t('还没有任务', 'No tasks yet')}
                    </h2>
                    <AppButton
                      label={
                        scopeCounts.all
                          ? t('清除筛选', 'Clear filters')
                          : t('新建任务', 'New task')
                      }
                      icon={
                        scopeCounts.all ? <X size={15} /> : <Plus size={15} />
                      }
                      onClick={scopeCounts.all ? clear : onNewTask}
                    />
                  </div>
                )
              ) : (
                <Suspense
                  fallback={
                    <AppLoading label={t('正在读取视图', 'Loading view')} />
                  }
                >
                  {view === 'table' ? (
                    <RunsTable
                      data={data}
                      runs={runs}
                      t={t}
                      locale={locale}
                      querySort={queryPolicy.sort ? sorting.sort : undefined}
                    />
                  ) : (
                    <TaskBoard
                      data={data}
                      t={t}
                      query={query}
                      filter={filter}
                      projectId={scope}
                      items={tasks}
                      stateCategories={committedConditions.states}
                      onPrepare={onPrepare}
                    />
                  )}
                </Suspense>
              )}
            </section>
            {active && wide && view === 'list' && (
              <aside
                className="wf-inspector"
                aria-labelledby={`${inspectorId}-title`}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && !event.defaultPrevented) {
                    event.stopPropagation()
                    close()
                  }
                }}
              >
                {inspector}
              </aside>
            )}
          </div>
        )}
      </div>
      {mobileScopeOpen && !dockedScope && (
        <AppDialog
          title={t('筛选条件', 'Filters')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setMobileScopeOpen(false)}
        >
          <div className="wb-form">
            <AppInput
              label={t('搜索', 'Search')}
              value={queryDraft}
              onChange={setQueryDraft}
              onEnter={() => {
                submitQuery()
                setMobileScopeOpen(false)
              }}
              startIcon={<Search size={16} />}
            />
            {conditionControls(false)}
            <div className="wb-form-actions">
              <AppButton
                label={t('清除筛选', 'Clear filters')}
                icon={<X size={15} />}
                iconOnly
                tone="ghost"
                disabled={!canClearQuery}
                onClick={() => {
                  clear()
                  setMobileScopeOpen(false)
                }}
              />
              <AppButton
                label={t('搜索', 'Search')}
                icon={<Search size={15} />}
                tone="primary"
                onClick={() => {
                  submitQuery()
                  setMobileScopeOpen(false)
                }}
              />
            </div>
          </div>
          {scopeNavigation}
        </AppDialog>
      )}
      <TaskTableSettings
        open={tableSettingsOpen}
        value={{
          visible: visibleColumns,
          order: columnOrder,
          sorts: parseTaskSort(sorting.sort) ?? [],
        }}
        t={t}
        sortLocked={Boolean(queryPolicy.sort)}
        onApply={({ visible, order, sorts }) => {
          setVisibleColumns(normalizeTaskColumns(visible))
          setColumnOrder(normalizeTaskColumnOrder(order))
          if (!queryPolicy.sort) {
            onLocationChange({
              order: undefined,
              sorts: sorts.length ? sorts : undefined,
              page: 1,
            })
          }
          setTableSettingsOpen(false)
        }}
        onClose={() => setTableSettingsOpen(false)}
      />
      {active && !wide && view === 'list' && (
        <AppDialog
          title={`${t('任务详情', 'Task details')} · ${active.task.title}`}
          closeLabel={t('关闭', 'Close')}
          onClose={close}
        >
          {inspector}
        </AppDialog>
      )}
      {contextProject && projectInfoOpen && (
        <AppDialog
          title={`${t('项目资料', 'Project info')} · ${contextProject.name}`}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setProjectInfoOpen(false)}
        >
          <div className="wb-form">
            <dl className="wb-details">
              <dt>{t('项目目标', 'Project goal')}</dt>
              <dd className="wb-wrap">
                {contextProject.goal || t('未填写', 'Not provided')}
              </dd>
              <dt>{t('相对目录', 'Relative directory')}</dt>
              <dd>
                <code>{contextProject.directory}</code>
              </dd>
              <dt>
                {t(
                  '允许提供给模型的项目资料',
                  'Project notes allowed for models',
                )}
              </dt>
              <dd className="wb-wrap">
                {contextProject.notes || t('未填写', 'Not provided')}
              </dd>
              <dt>{t('工作区模型配置', 'Workspace model configurations')}</dt>
              <dd>{data.models.length}</dd>
              <dt>{t('默认模型', 'Default model')}</dt>
              <dd>
                {data.models.find((model) => model.id === data.default_model_id)
                  ?.name ?? t('尚未设置', 'Not configured')}
              </dd>
            </dl>
            <AppButton
              label={t('模型与资源', 'Models & resources')}
              icon={<ArrowRight size={15} />}
              tone="ghost"
              href="#models"
            />
          </div>
        </AppDialog>
      )}
    </div>
  )
}

function TaskScopeNavigation({
  id,
  showHeading,
  collapseRef,
  onCollapse,
  data,
  t,
  filter,
  projectFilter,
  view,
  items,
  counts,
  onFilterChange,
  onProjectChange,
  contextProject,
}: {
  id: string
  showHeading: boolean
  collapseRef: React.Ref<HTMLButtonElement>
  onCollapse: () => void
  data: Bootstrap
  t: Copy
  filter: Filter | undefined
  projectFilter: string
  view: Props['view']
  items: Array<{ value: Filter; zh: string; en: string }>
  counts: Record<Filter, number>
  onFilterChange: (value: Filter) => void
  onProjectChange: (value: string) => void
  contextProject?: Project
}) {
  return (
    <nav
      id={id}
      className="wf-scope-navigation"
      aria-label={t('任务范围', 'Task scope')}
    >
      {showHeading && (
        <div className="wf-scope-header">
          <h2 className="wf-scope-heading">{t('筛选条件', 'Filters')}</h2>
          <AppButton
            label={t('收起筛选条件', 'Collapse filters')}
            icon={<ChevronsLeft size={16} />}
            iconOnly
            tone="ghost"
            onClick={onCollapse}
            ref={collapseRef}
            aria-expanded={true}
            aria-controls={id}
          />
        </div>
      )}
      <section className="wf-scope-section">
        <h3 className="wf-scope-label">
          {view === 'table'
            ? t('运行状态', 'Run status')
            : t('任务状态', 'Task status')}
        </h3>
        {items.map((item) => (
          <AppButton
            key={item.value}
            label={t(item.zh, item.en)}
            tone="ghost"
            className={`wf-scope-item ${filter === item.value ? 'is-active' : ''}`}
            onClick={() => onFilterChange(item.value)}
            aria-pressed={filter === item.value}
            icon={
              item.value === 'active' ? (
                <CircleDot size={15} />
              ) : item.value === 'attention' ? (
                <CircleAlert size={15} />
              ) : item.value === 'completed' ? (
                <CircleCheck size={15} />
              ) : (
                <LayoutList size={15} />
              )
            }
          >
            <span className="wf-scope-content">
              <span>{t(item.zh, item.en)}</span>
              <span className="wf-scope-count">{counts[item.value]}</span>
            </span>
          </AppButton>
        ))}
      </section>
      <section className="wf-scope-section">
        <h3 className="wf-scope-label">{t('项目', 'Projects')}</h3>
        {(contextProject
          ? [contextProject]
          : [
              { id: 'all', name: t('全部项目', 'All projects') },
              ...data.projects,
            ]
        ).map((project) => {
          const count =
            view === 'table'
              ? selectRuns(
                  data,
                  '',
                  'all',
                  project.id === 'all' ? undefined : project.id,
                ).length
              : data.tasks.filter(
                  (task) =>
                    project.id === 'all' || task.project_id === project.id,
                ).length
          return (
            <AppButton
              key={project.id}
              label={project.name}
              tone="ghost"
              className={`wf-scope-item ${projectFilter === project.id ? 'is-active' : ''}`}
              onClick={() => {
                if (!contextProject) onProjectChange(project.id)
              }}
              aria-pressed={projectFilter === project.id}
            >
              <span className="wf-scope-content">
                <span title={project.name}>{project.name}</span>
                <span className="wf-scope-count">{count}</span>
              </span>
            </AppButton>
          )
        })}
      </section>
    </nav>
  )
}

function TaskInspector({
  id,
  titleRef,
  showClose,
  item,
  data,
  t,
  when,
  onClose,
  onPrepare,
}: {
  id: string
  titleRef: React.Ref<HTMLHeadingElement>
  showClose: boolean
  item: WorkItem
  data: Bootstrap
  t: Copy
  when: (value?: string) => string
  onClose: () => void
  onPrepare: (task: Task) => void
}) {
  const history = data.runs
    .filter((run) => run.task_id === item.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  return (
    <div className="wf-task-inspector" id={id}>
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
        <span>{item.projectName}</span>
        <code title={item.id}>{item.id.slice(0, 7)}</code>
      </div>
      <h2 id={`${id}-title`} ref={titleRef} tabIndex={-1}>
        {item.task.title}
      </h2>
      <div className="wf-inspector-action">
        <AppBadge tone={item.run ? statusTone(item.run.status) : 'neutral'}>
          {item.run
            ? statusText(item.run.status, t)
            : t('未运行', 'Not started')}
        </AppBadge>
        {item.run ? (
          <AppButton
            label={t('打开最近运行', 'Open latest run')}
            tone="primary"
            icon={<ArrowRight size={15} />}
            href={`#run/${item.run.id}`}
            data-list-focus-key={`latest-run:${item.id}`}
          />
        ) : (
          <AppButton
            label={t('检查并运行', 'Review & run')}
            tone="primary"
            icon={<FileSearch size={15} />}
            onClick={() => onPrepare(item.task)}
          />
        )}
      </div>
      <section className="wf-inspector-goal">
        <h3>{t('任务目标', 'Goal')}</h3>
        <p>{item.task.goal}</p>
      </section>
      {item.task.acceptance && (
        <section>
          <h3>{t('验收要求', 'Acceptance')}</h3>
          <p>{item.task.acceptance}</p>
        </section>
      )}
      <section>
        <h3>{t('明确选择的文件', 'Explicit files')}</h3>
        {item.task.files.length ? (
          item.task.files.map((file) => <code key={file}>{file}</code>)
        ) : (
          <p className="wb-hint">{t('未选择文件', 'No files selected')}</p>
        )}
      </section>
      <section>
        <h3>
          {t('历史运行', 'Run history')} <span>{history.length}</span>
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
      </section>
    </div>
  )
}
