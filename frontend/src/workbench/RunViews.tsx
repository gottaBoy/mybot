import { useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  FolderGit2,
  GitBranch,
  SlidersHorizontal,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppCard,
  AppCheckbox,
  AppDialog,
  AppSelect,
} from '../components/ui'
import {
  AppDataTable,
  type AppColumn,
  type AppTableSort,
} from '../components/ui/DataTable'
import { useAppDensity } from '../components/ui/DensityContext'
import type { Bootstrap, Run, Task } from './api'
import type { TaskBoardPage } from './board-query'
import type { RunQueryPage } from './run-query'
import { parseRunSort, type RunSortRule } from './run-sort'
import { filteredItems, type BoardColumn } from './projections'
import {
  statusText,
  statusTone,
  type Copy,
  type Filter,
  type Locale,
} from './state'
import './run-history.css'
import './task-board.css'

export type RunHistoryRemote = {
  page: RunQueryPage
  busy: boolean
  onSortChange: (sort: RunSortRule[]) => void
  onPageChange: (page: number) => boolean | void
  onPageSizeChange: (size: 20 | 50 | 100) => void
  sortLocked?: boolean
}

export type RunTablePreferences = {
  visible: {
    project: boolean
    id: boolean
    created_at: boolean
  }
  compact: boolean | undefined
}

export function RunsTable({
  data,
  runs,
  t,
  locale,
  querySort,
  remote,
  preferences,
}: {
  data: Bootstrap
  runs: Run[]
  t: Copy
  locale: Locale
  querySort?: AppTableSort
  remote?: RunHistoryRemote
  preferences?: {
    value: RunTablePreferences
    onChange: (value: RunTablePreferences) => void
  }
}) {
  const [settings, setSettings] = useState(false)
  const [localPreferences, setLocalPreferences] = useState<RunTablePreferences>(
    {
      visible: { project: true, id: true, created_at: true },
      compact: undefined,
    },
  )
  const { visible, compact } = preferences?.value ?? localPreferences
  const changePreferences = preferences?.onChange ?? setLocalPreferences
  const density = useAppDensity()
  const busy = Boolean(remote?.busy)
  const admission = useRef(!busy)
  admission.current = !busy
  const rows = remote
    ? remote.page.items.map((item) => ({
        ...item.run,
        title: item.task.title,
        projectName: item.project.name,
        project: item.project.name,
      }))
    : runs.map((run) => {
        const task = data.tasks.find((task) => task.id === run.task_id)
        return {
          ...run,
          title: task?.title ?? run.id,
          project:
            data.projects.find((project) => project.id === task?.project_id)
              ?.name ?? '',
          projectName: '',
        }
      })
  type Row = (typeof rows)[number]
  const sortable = remote ? !remote.sortLocked && !busy : !querySort
  const changeSort = (sort: AppTableSort) => {
    if (!remote || !admission.current || remote.sortLocked) return
    const rule = sort.at(-1)
    const parsed = parseRunSort(rule ? [rule] : [])
    if (parsed) remote.onSortChange(parsed)
  }
  const changePage = (candidate: number) => {
    if (!remote || !admission.current) return
    const page = remote.page
    if (candidate < 1 || candidate > page.total_pages) return
    remote.onPageChange(candidate)
  }
  const columns: AppColumn<Row>[] = [
    {
      key: 'title',
      title: t('任务', 'Task'),
      minWidth: 260,
      sortable,
      render: (row) => (
        <a
          className="wb-table-task"
          href={`#run/${row.id}`}
          aria-disabled={busy || undefined}
          tabIndex={busy ? -1 : undefined}
          onClick={(event) => {
            if (!admission.current) {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          onKeyDown={(event) => {
            if (!admission.current && event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
        >
          {row.title}
          <ArrowRight size={14} />
        </a>
      ),
    },
    ...(visible.project
      ? [
          {
            key: remote ? 'projectName' : 'project',
            title: t('项目', 'Project'),
            minWidth: 130,
            sortable,
          },
        ]
      : []),
    {
      key: 'status',
      title: t('执行状态', 'Execution'),
      width: 130,
      sortable,
      render: (row) => (
        <AppBadge tone={statusTone(row.status)}>
          {statusText(row.status, t)}
        </AppBadge>
      ),
    },
    ...(visible.id
      ? [
          {
            key: 'id',
            title: 'Run',
            width: 100,
            sortable: remote ? sortable : undefined,
            render: (row: Row) => <code>{row.id.slice(0, 8)}</code>,
          },
        ]
      : []),
    ...(visible.created_at
      ? [
          {
            key: 'created_at',
            title: t('创建时间', 'Created'),
            width: 170,
            sortable,
            render: (row: Row) =>
              new Date(row.created_at).toLocaleString(
                locale === 'zh' ? 'zh-CN' : 'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                },
              ),
          },
        ]
      : []),
  ]
  return (
    <section
      className={`wb-runs-table${remote ? ' wb-run-history' : ''}`}
      data-testid="run-history-table"
      aria-busy={busy || undefined}
    >
      <div className="wb-table-view-bar">
        <small role="status">
          {remote ? remote.page.total : runs.length} {t('条运行记录', 'runs')}
        </small>
        <AppButton
          label={t('表格设置', 'Table settings')}
          icon={<SlidersHorizontal size={15} />}
          tone="ghost"
          size="sm"
          onClick={() => setSettings(true)}
        />
      </div>
      <div className={remote ? 'wb-run-history-body' : undefined}>
        <AppDataTable
          rows={rows}
          columns={columns}
          label={t('运行筛选表', 'Filtered runs')}
          compact={compact}
          sorting={
            remote
              ? { sort: remote.page.sorts, onSortChange: changeSort }
              : querySort
                ? { sort: querySort, onSortChange: () => {} }
                : undefined
          }
          serverSorted={Boolean(remote)}
          totalRows={remote?.page.total}
          rowStart={
            remote
              ? (remote.page.page - 1) * remote.page.page_size + 1
              : undefined
          }
          empty={
            <p className="wb-empty">
              {t('没有匹配的运行', 'No matching runs')}
            </p>
          }
        />
      </div>
      {remote && (
        <footer className="wb-run-history-pagination">
          <span
            data-testid="run-history-range"
            role="status"
            aria-live="polite"
          >
            {remote.page.total
              ? `${(remote.page.page - 1) * remote.page.page_size + 1}-${Math.min(remote.page.page * remote.page.page_size, remote.page.total)}`
              : '0-0'}{' '}
            / {remote.page.total}
          </span>
          <div className="wb-run-history-page-tools">
            <div className="wb-run-history-capacity">
              <AppSelect
                label={t('每页运行数', 'Runs per page')}
                hiddenLabel
                value={String(remote.page.page_size)}
                disabled={busy}
                options={[20, 50, 100].map((size) => ({
                  value: String(size),
                  label: t(`每页 ${size}`, `${size} / page`),
                }))}
                onChange={(value) => {
                  const size = Number(value)
                  if (
                    admission.current &&
                    (size === 20 || size === 50 || size === 100)
                  )
                    remote.onPageSizeChange(size)
                }}
              />
            </div>
            <AppButton
              label={t('上一页运行', 'Previous run page')}
              icon={<ChevronLeft size={16} />}
              iconOnly
              tone="ghost"
              data-run-history-page="previous"
              disabled={busy || remote.page.page <= 1}
              onClick={() => changePage(remote.page.page - 1)}
            />
            <span className="wb-run-history-page-position" role="status">
              {remote.page.page} / {remote.page.total_pages}
            </span>
            <AppButton
              label={t('下一页运行', 'Next run page')}
              icon={<ChevronRight size={16} />}
              iconOnly
              tone="ghost"
              data-run-history-page="next"
              disabled={busy || !remote.page.has_more}
              onClick={() => changePage(remote.page.page + 1)}
            />
          </div>
        </footer>
      )}
      {settings && (
        <AppDialog
          title={t('表格设置', 'Table settings')}
          closeLabel={t('关闭', 'Close')}
          onClose={() => setSettings(false)}
        >
          <div className="wb-form">
            <AppCheckbox
              label={t('紧凑行距', 'Compact rows')}
              value={compact ?? density === 'compact'}
              onChange={(value) =>
                changePreferences({ visible, compact: value })
              }
            />
            {(['project', 'id', 'created_at'] as const).map((key, i) => (
              <AppCheckbox
                key={key}
                label={
                  [
                    t('项目列', 'Project column'),
                    t('运行 ID 列', 'Run ID column'),
                    t('创建时间列', 'Created column'),
                  ][i]
                }
                value={visible[key]}
                onChange={(value) =>
                  changePreferences({
                    visible: { ...visible, [key]: value },
                    compact,
                  })
                }
              />
            ))}
          </div>
        </AppDialog>
      )}
    </section>
  )
}

export type TaskBoardRemote = {
  page: TaskBoardPage
  busy: boolean
  onPageChange: (state: BoardColumn, page: number) => boolean | void
}

export function TaskBoard({
  data,
  t,
  query,
  projectId,
  filter,
  items: providedItems,
  stateCategories,
  onPrepare,
  remote,
}: {
  data: Bootstrap
  t: Copy
  query: string
  projectId?: string
  filter: Filter
  items?: ReturnType<typeof filteredItems>
  stateCategories?: BoardColumn[]
  onPrepare: (task: Task) => void
  remote?: TaskBoardRemote
}) {
  const items = remote
    ? []
    : (providedItems ?? filteredItems(data, query, projectId))
  const busy = Boolean(remote?.busy)
  const admission = useRef(!busy)
  admission.current = !busy
  const definitions: Array<{
    id: BoardColumn
    label: string
    tone: 'neutral' | 'info' | 'warning' | 'success'
  }> = [
    { id: 'pending', label: t('未运行', 'Not started'), tone: 'neutral' },
    { id: 'active', label: t('运行中', 'Active'), tone: 'info' },
    { id: 'attention', label: t('需处理', 'Attention'), tone: 'warning' },
    { id: 'completed', label: t('执行完成', 'Executed'), tone: 'success' },
    {
      id: 'other',
      label: t('已取消 / 其他', 'Canceled / other'),
      tone: 'neutral',
    },
  ]
  const columns = remote
    ? definitions.filter((column) =>
        remote.page.query.states.length
          ? remote.page.query.states.includes(column.id)
          : column.id !== 'other' ||
            remote.page.columns.some(
              (page) => page.state_category === 'other' && page.total > 0,
            ),
      )
    : definitions
        .filter(
          (column) =>
            column.id !== 'other' ||
            items.some((item) => item.column === 'other'),
        )
        .filter((column) =>
          stateCategories
            ? stateCategories.length === 0 ||
              stateCategories.includes(column.id)
            : filter === 'all' ||
              column.id === (filter === 'completed' ? 'completed' : filter),
        )
  const changePage = (state: BoardColumn, candidate: number) => {
    if (!remote || !admission.current) return
    const page = remote.page.columns.find(
      (column) => column.state_category === state,
    )
    if (
      !page ||
      candidate < 1 ||
      candidate > page.total_pages ||
      candidate === page.page
    )
      return
    remote.onPageChange(state, candidate)
  }
  return (
    <div
      className={`wb-board-scroll${remote ? ' wb-task-board' : ''}`}
      data-testid="task-board"
      tabIndex={0}
      role="region"
      aria-label={t('任务看板', 'Task board')}
      aria-busy={busy || undefined}
      onClickCapture={(event) => {
        if (!admission.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onKeyDownCapture={(event) => {
        if (
          !admission.current &&
          (event.key === 'Enter' || event.key === ' ') &&
          event.target instanceof Element &&
          event.target.closest('a,button')
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div className="wb-board">
        {columns.map((column) => {
          const page = remote?.page.columns.find(
            (candidate) => candidate.state_category === column.id,
          )
          const members =
            page?.items ?? items.filter((item) => item.column === column.id)
          return (
            <section
              className="wb-board-column"
              key={column.id}
              data-board-state={column.id}
              aria-label={column.label}
            >
              <header>
                <AppBadge tone={column.tone}>{column.label}</AppBadge>
                <span>{page ? page.total : members.length}</span>
              </header>
              <div className="wb-board-cards">
                {members.map((item) => (
                  <AppCard
                    key={item.id}
                    className="wb-work-card"
                    data-board-task={item.id}
                  >
                    <div className="wb-card-meta">
                      <FolderGit2 size={13} />
                      <span>{item.projectName}</span>
                      <code>
                        {item.run?.id.slice(0, 7) ?? item.id.slice(0, 7)}
                      </code>
                    </div>
                    <h2>
                      {item.run ? (
                        <a
                          href={`#run/${item.run.id}`}
                          aria-disabled={busy || undefined}
                          tabIndex={busy ? -1 : undefined}
                          onClick={(event) => {
                            if (!admission.current) {
                              event.preventDefault()
                              event.stopPropagation()
                            }
                          }}
                          onKeyDown={(event) => {
                            if (!admission.current && event.key === 'Enter') {
                              event.preventDefault()
                              event.stopPropagation()
                            }
                          }}
                        >
                          {item.task.title}
                        </a>
                      ) : (
                        item.task.title
                      )}
                    </h2>
                    <p>{item.task.goal}</p>
                    <div className="wb-card-bottom">
                      <small>
                        <GitBranch size={13} />
                        {item.attempts} {t('次运行', 'runs')}
                      </small>
                      {item.run ? (
                        <AppButton
                          label={t('打开运行', 'Open run')}
                          icon={<ArrowRight size={14} />}
                          iconOnly
                          size="sm"
                          tone="ghost"
                          href={`#run/${item.run.id}`}
                          disabled={busy}
                          onClick={(event) => {
                            if (!admission.current) {
                              event.preventDefault()
                              event.stopPropagation()
                            }
                          }}
                        />
                      ) : (
                        <AppButton
                          label={t('检查并运行', 'Review & run')}
                          size="sm"
                          icon={<Clock3 size={14} />}
                          disabled={busy}
                          onClick={() => {
                            if (admission.current) onPrepare(item.task)
                          }}
                        />
                      )}
                    </div>
                  </AppCard>
                ))}
                {!members.length && (
                  <div className="wb-board-empty">
                    <Columns3 size={21} />
                    <span>{t('暂无任务', 'No tasks')}</span>
                  </div>
                )}
              </div>
              {page && (
                <footer className="wb-task-board-pagination">
                  <span
                    data-testid="task-board-range"
                    role="status"
                    aria-label={t(
                      `${column.label}任务范围`,
                      `${column.label} task range`,
                    )}
                  >
                    {page.total
                      ? `${(page.page - 1) * remote!.page.column_size + 1}-${Math.min(page.page * remote!.page.column_size, page.total)}`
                      : '0-0'}{' '}
                    / {page.total}
                  </span>
                  <div className="wb-task-board-page-tools">
                    <AppButton
                      label={t(
                        `${column.label}上一页任务`,
                        `${column.label}: Previous task page`,
                      )}
                      icon={<ChevronLeft size={16} />}
                      iconOnly
                      tone="ghost"
                      data-board-page="previous"
                      disabled={busy || page.page <= 1}
                      onClick={() => changePage(column.id, page.page - 1)}
                    />
                    <span className="wb-task-board-page-position" role="status">
                      {page.page} / {page.total_pages}
                    </span>
                    <AppButton
                      label={t(
                        `${column.label}下一页任务`,
                        `${column.label}: Next task page`,
                      )}
                      icon={<ChevronRight size={16} />}
                      iconOnly
                      tone="ghost"
                      data-board-page="next"
                      disabled={busy || !page.has_more}
                      onClick={() => changePage(column.id, page.page + 1)}
                    />
                  </div>
                </footer>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
