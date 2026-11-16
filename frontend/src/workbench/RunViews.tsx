import { useState } from 'react'
import {
  ArrowRight,
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
} from '../components/ui'
import {
  AppDataTable,
  type AppColumn,
  type AppTableSort,
} from '../components/ui/DataTable'
import { useAppDensity } from '../components/ui/DensityContext'
import type { Bootstrap, Run, Task } from './api'
import { filteredItems, type BoardColumn } from './projections'
import {
  statusText,
  statusTone,
  type Copy,
  type Filter,
  type Locale,
} from './state'

export function RunsTable({
  data,
  runs,
  t,
  locale,
  querySort,
}: {
  data: Bootstrap
  runs: Run[]
  t: Copy
  locale: Locale
  querySort?: AppTableSort
}) {
  const [settings, setSettings] = useState(false)
  const [visible, setVisible] = useState({
    project: true,
    id: true,
    created_at: true,
  })
  const [compact, setCompact] = useState<boolean | undefined>(undefined)
  const density = useAppDensity()
  const rows = runs.map((run) => {
    const task = data.tasks.find((task) => task.id === run.task_id)
    return {
      ...run,
      title: task?.title ?? run.id,
      project:
        data.projects.find((project) => project.id === task?.project_id)
          ?.name ?? '',
    }
  })
  type Row = (typeof rows)[number]
  const columns: AppColumn<Row>[] = [
    {
      key: 'title',
      title: t('任务', 'Task'),
      minWidth: 260,
      sortable: !querySort,
      render: (row) => (
        <a className="wb-table-task" href={`#run/${row.id}`}>
          {row.title}
          <ArrowRight size={14} />
        </a>
      ),
    },
    ...(visible.project
      ? [
          {
            key: 'project',
            title: t('项目', 'Project'),
            minWidth: 130,
            sortable: !querySort,
          },
        ]
      : []),
    {
      key: 'status',
      title: t('执行状态', 'Execution'),
      width: 130,
      sortable: !querySort,
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
            sortable: !querySort,
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
    <section className="wb-runs-table">
      <div className="wb-table-view-bar">
        <small role="status">
          {runs.length} {t('条运行记录', 'runs')}
        </small>
        <AppButton
          label={t('表格设置', 'Table settings')}
          icon={<SlidersHorizontal size={15} />}
          tone="ghost"
          size="sm"
          onClick={() => setSettings(true)}
        />
      </div>
      <AppDataTable
        rows={rows}
        columns={columns}
        label={t('运行筛选表', 'Filtered runs')}
        compact={compact}
        sorting={
          querySort ? { sort: querySort, onSortChange: () => {} } : undefined
        }
        empty={
          <p className="wb-empty">{t('没有匹配的运行', 'No matching runs')}</p>
        }
      />
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
              onChange={setCompact}
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
                onChange={(value) => setVisible({ ...visible, [key]: value })}
              />
            ))}
          </div>
        </AppDialog>
      )}
    </section>
  )
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
}: {
  data: Bootstrap
  t: Copy
  query: string
  projectId?: string
  filter: Filter
  items?: ReturnType<typeof filteredItems>
  stateCategories?: BoardColumn[]
  onPrepare: (task: Task) => void
}) {
  const items = providedItems ?? filteredItems(data, query, projectId)
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
  const columns = definitions
    .filter(
      (column) =>
        column.id !== 'other' || items.some((item) => item.column === 'other'),
    )
    .filter((column) =>
      stateCategories
        ? stateCategories.length === 0 || stateCategories.includes(column.id)
        : filter === 'all' ||
          column.id === (filter === 'completed' ? 'completed' : filter),
    )
  return (
    <div
      className="wb-board-scroll"
      tabIndex={0}
      role="region"
      aria-label={t('任务看板', 'Task board')}
    >
      <div className="wb-board">
        {columns.map((column) => {
          const members = items.filter((item) => item.column === column.id)
          return (
            <section
              className="wb-board-column"
              key={column.id}
              aria-label={column.label}
            >
              <header>
                <AppBadge tone={column.tone}>{column.label}</AppBadge>
                <span>{members.length}</span>
              </header>
              <div className="wb-board-cards">
                {members.map((item) => (
                  <AppCard key={item.id} className="wb-work-card">
                    <div className="wb-card-meta">
                      <FolderGit2 size={13} />
                      <span>{item.projectName}</span>
                      <code>
                        {item.run?.id.slice(0, 7) ?? item.id.slice(0, 7)}
                      </code>
                    </div>
                    <h2>
                      {item.run ? (
                        <a href={`#run/${item.run.id}`}>{item.task.title}</a>
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
                        />
                      ) : (
                        <AppButton
                          label={t('检查并运行', 'Review & run')}
                          size="sm"
                          icon={<Clock3 size={14} />}
                          onClick={() => onPrepare(item.task)}
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
            </section>
          )
        })}
      </div>
    </div>
  )
}
