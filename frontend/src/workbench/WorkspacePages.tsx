import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CircleAlert,
  FileSearch,
  FolderGit2,
  GitBranch,
  Inbox,
  Plus,
  Search,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppDialog,
  AppInput,
  AppProgress,
  AppSegments,
} from '../components/ui'
import { AppTreeTable, type AppColumn } from '../components/ui/DataTable'
import { useCompactTaskList } from '../components/ui/useViewport'
import type { Bootstrap, Task } from './api'
import {
  projectProgress,
  taskItems,
  workTree,
  type WorkTreeRow,
} from './projections'
import {
  changeHierarchyExpansion,
  hierarchyExpandedIds,
  initialHierarchyExpansion,
  pruneHierarchyExpansion,
} from './hierarchy-state'
import { errorText, statusText, statusTone, type Copy } from './state'
import { resolveInboxSelection } from './inbox-selection'

type Props = {
  data: Bootstrap
  t: Copy
  onNewTask: () => void
  onPrepare: (task: Task) => void
}

export function Overview({ data, t, onNewTask }: Props) {
  const items = taskItems(data)
  const progress = projectProgress(data)
  const alerts = items.filter((item) => item.column === 'attention')
  const complete = items.filter((item) => item.column === 'completed').length
  const active = items.filter((item) => item.column === 'active').length
  return (
    <>
      <div className="wb-page-heading">
        <div>
          <div className="wb-eyebrow">WORKSPACE</div>
          <h1>{t('工作总览', 'Workspace overview')}</h1>
        </div>
        <AppButton
          label={t('新建任务', 'New task')}
          icon={<Plus size={16} />}
          tone="primary"
          onClick={onNewTask}
        />
      </div>
      <div className="wb-overview-facts">
        {[
          [items.length, t('任务', 'Tasks')],
          [active, t('运行中', 'Active')],
          [complete, t('执行完成', 'Executed')],
          [alerts.length, t('需处理', 'Attention')],
        ].map(([value, label]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="wb-overview-grid">
        <div>
          <section className="wb-overview-section">
            <div className="wb-section-title">
              <h2>{t('项目执行进度', 'Project execution')}</h2>
              <a className="wb-text-link" href="#projects">
                {t('全部项目', 'All projects')}
                <ArrowRight size={14} />
              </a>
            </div>
            {progress.map((item) => (
              <div className="wb-project-progress" key={item.project.id}>
                <div>
                  <a href={`#project/${item.project.id}`}>
                    {item.project.name}
                  </a>
                  <span>
                    {item.complete} / {item.total}
                  </span>
                </div>
                <AppProgress
                  label={`${item.project.name} ${t('执行完成任务', 'executed tasks')}`}
                  value={item.complete}
                  max={item.total}
                />
                <small>
                  {item.active} {t('运行中', 'active')} · {item.attention}{' '}
                  {t('需处理', 'need attention')}
                </small>
              </div>
            ))}
            {!progress.length && (
              <div className="wb-empty">
                <FolderGit2 size={25} />
                <h2>{t('尚无项目', 'No projects')}</h2>
                <AppButton
                  label={t('创建第一个任务', 'Create first task')}
                  onClick={onNewTask}
                />
              </div>
            )}
            <p className="wb-hint">
              {t(
                '按每项任务的最近运行统计；执行完成不代表测试通过或人工验收。',
                'Counts the latest run of each task. Execution completion is not test or human acceptance.',
              )}
            </p>
          </section>
          <section className="wb-overview-section">
            <div className="wb-section-title">
              <h2>{t('最近任务动态', 'Recent task activity')}</h2>
              <a className="wb-text-link" href="#workbench">
                {t('查看全部', 'View all')}
                <ArrowRight size={14} />
              </a>
            </div>
            {[...items]
              .filter((item) => item.run)
              .sort((a, b) =>
                b.run!.created_at.localeCompare(a.run!.created_at),
              )
              .slice(0, 5)
              .map((item) => (
                <a
                  className="wb-overview-run"
                  href={`#run/${item.run!.id}`}
                  key={item.id}
                >
                  <GitBranch size={17} />
                  <div>
                    <strong>{item.task.title}</strong>
                    <small>
                      {item.projectName} · {item.attempts} {t('次运行', 'runs')}
                    </small>
                  </div>
                  <AppBadge tone={statusTone(item.run!.status)}>
                    {statusText(item.run!.status, t)}
                  </AppBadge>
                </a>
              ))}
            {!data.runs.length && (
              <p className="wb-hint">{t('尚未发起运行', 'No runs yet')}</p>
            )}
          </section>
        </div>
        <aside className="wb-alert-rail">
          <div className="wb-section-title">
            <h2>
              <CircleAlert size={16} />
              {t('需要关注', 'Needs attention')}
            </h2>
            <span>{alerts.length}</span>
          </div>
          {alerts.map((item) => (
            <article key={item.id}>
              <AppBadge tone={statusTone(item.run!.status)}>
                {statusText(item.run!.status, t)}
              </AppBadge>
              <h3>{item.task.title}</h3>
              <p>
                {item.run?.error
                  ? errorText(item.run.error, t)
                  : item.projectName}
              </p>
              <a href={`#run/${item.run!.id}`} className="wb-text-link">
                {t('检查运行', 'Inspect run')}
                <ArrowRight size={14} />
              </a>
            </article>
          ))}
          {!alerts.length && (
            <div className="wb-rail-empty">
              <CircleAlert size={24} />
              <p>{t('当前没有待处理异常', 'No current exceptions')}</p>
            </div>
          )}
          <a className="wb-text-link" href="#inbox">
            {t('打开待处理', 'Open inbox')}
            <ArrowRight size={14} />
          </a>
        </aside>
      </div>
    </>
  )
}

export function WorkInbox({ data, t, onPrepare }: Props) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const compact = useCompactTaskList()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const items = taskItems(data)
    .filter((item) => ['pending', 'attention'].includes(item.column))
    .filter((item) => filter === 'all' || item.column === filter)
    .filter((item) =>
      `${item.task.title} ${item.projectName}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
  const selection = resolveInboxSelection(items, selected, !compact)
  const current = selection.kind === 'available' ? selection.item : undefined
  useEffect(() => {
    if (!compact) setMobileDetailOpen(false)
  }, [compact])
  const closeDetail = () => {
    setMobileDetailOpen(false)
    requestAnimationFrame(() => {
      if (
        trigger.current?.isConnected &&
        trigger.current.getClientRects().length
      )
        trigger.current.focus()
      else heading.current?.focus()
    })
  }
  const taskDetail = current ? (
    <>
      <div className="wb-eyebrow">{current.projectName}</div>
      <h2>{current.task.title}</h2>
      <AppBadge tone={current.run ? statusTone(current.run.status) : 'neutral'}>
        {current.run
          ? statusText(current.run.status, t)
          : t('未运行', 'Not started')}
      </AppBadge>
      <p>{current.task.goal}</p>
      <dl className="wb-details">
        <dt>{t('验收要求', 'Acceptance')}</dt>
        <dd>{current.task.acceptance || t('未填写', 'Not provided')}</dd>
        <dt>{t('显式文件', 'Explicit files')}</dt>
        <dd>{current.task.files.join(', ') || t('未选择', 'None selected')}</dd>
        <dt>{t('历史运行', 'Run history')}</dt>
        <dd>{current.attempts}</dd>
      </dl>
      {current.run?.error && (
        <div className="wb-error">
          {errorText(current.run.error, t)}
          <code>{current.run.error}</code>
        </div>
      )}
      <div className="wb-inline">
        {current.run ? (
          <AppButton
            label={t('打开运行', 'Open run')}
            tone="primary"
            icon={<ArrowRight size={15} />}
            href={`#run/${current.run.id}`}
          />
        ) : (
          <AppButton
            label={t('检查并运行', 'Review & run')}
            tone="primary"
            icon={<FileSearch size={15} />}
            onClick={() => {
              if (compact) closeDetail()
              onPrepare(current.task)
            }}
          />
        )}
        <AppButton
          label={t('打开项目', 'Open project')}
          tone="ghost"
          href={`#project/${current.task.project_id}`}
        />
      </div>
    </>
  ) : selection.kind === 'unavailable' ? (
    <div className="wb-empty" role="status">
      <Inbox size={25} />
      <h2>
        {t(
          '所选任务已不在当前结果中',
          'Selected task is no longer in these results',
        )}
      </h2>
    </div>
  ) : null
  return (
    <>
      <div className="wb-page-heading">
        <div>
          <div className="wb-eyebrow">INBOX</div>
          <h1 ref={heading} tabIndex={-1}>
            {t('待处理', 'Inbox')}
          </h1>
        </div>
        <span className="wb-muted">
          {items.length} {t('项', 'items')}
        </span>
      </div>
      <div className="wb-list-toolbar">
        <AppSegments
          label={t('待处理类型', 'Inbox type')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('全部', 'All') },
            { value: 'attention', label: t('异常 / 暂停', 'Attention') },
            { value: 'pending', label: t('未运行', 'Not started') },
          ]}
        />
        <div className="wb-search">
          <AppInput
            label={t('搜索待处理任务', 'Search inbox')}
            type="search"
            isLabelHidden
            value={query}
            onChange={setQuery}
            startIcon={<Search size={15} />}
            placeholder={t('搜索任务', 'Search tasks')}
          />
        </div>
      </div>
      {items.length ? (
        <div className="wb-inbox-layout">
          <section
            className="wb-inbox-list"
            aria-label={t('待处理任务', 'Inbox items')}
          >
            {items.map((item) => (
              <AppButton
                key={item.id}
                label={item.task.title}
                tone="ghost"
                className="wb-inbox-item"
                aria-pressed={current?.id === item.id}
                aria-haspopup={compact ? 'dialog' : undefined}
                aria-expanded={
                  compact ? mobileDetailOpen && selected === item.id : undefined
                }
                onClick={(event) => {
                  trigger.current = event.currentTarget
                  setSelected(item.id)
                  if (compact) setMobileDetailOpen(true)
                }}
              >
                <span className="wb-inbox-item-content">
                  <span className="wb-inbox-item-meta">
                    <AppBadge
                      tone={item.run ? statusTone(item.run.status) : 'neutral'}
                    >
                      {item.run
                        ? statusText(item.run.status, t)
                        : t('未运行', 'Not started')}
                    </AppBadge>
                    <small>{item.projectName}</small>
                  </span>
                  <strong className="wb-inbox-item-title">
                    {item.task.title}
                  </strong>
                  <span className="wb-inbox-item-summary">
                    {item.run?.error
                      ? errorText(item.run.error, t)
                      : item.task.goal}
                  </span>
                </span>
              </AppButton>
            ))}
          </section>
          {!compact && (
            <section
              className="wb-inbox-detail"
              aria-label={t('任务详情', 'Task details')}
            >
              {taskDetail}
            </section>
          )}
        </div>
      ) : (
        <div className="wb-empty">
          <Inbox size={30} />
          <h2>{t('没有待处理任务', 'Inbox is clear')}</h2>
        </div>
      )}
      {compact && mobileDetailOpen && selected && (
        <AppDialog
          title={
            current
              ? `${t('任务详情', 'Task details')} · ${current.task.title}`
              : t('任务详情', 'Task details')
          }
          closeLabel={t('关闭', 'Close')}
          onClose={closeDetail}
        >
          <div className="wb-inbox-dialog-detail">{taskDetail}</div>
        </AppDialog>
      )}
    </>
  )
}

export function ProjectHierarchy({ data, t }: Props) {
  const [query, setQuery] = useState('')
  const allRows = useMemo(() => workTree(data, ''), [data])
  const rows = useMemo(() => workTree(data, query), [data, query])
  const [expansion, setExpansion] = useState(() =>
    initialHierarchyExpansion(allRows),
  )
  const expandedIds = hierarchyExpandedIds(expansion, rows, query)
  useEffect(() => {
    setExpansion((current) => pruneHierarchyExpansion(current, allRows))
  }, [allRows])
  const columns: AppColumn<WorkTreeRow>[] = [
    {
      key: 'title',
      title: t('项目 / 任务 / 运行', 'Project / task / run'),
      minWidth: 330,
      render: (row) => (
        <a className="wb-table-task" href={row.href}>
          {row.kind === 'project' ? (
            <FolderGit2 size={16} />
          ) : (
            <GitBranch size={14} />
          )}
          {row.title}
        </a>
      ),
    },
    {
      key: 'kind',
      title: t('类型', 'Type'),
      width: 110,
      render: (row) =>
        row.kind === 'project'
          ? t('项目', 'Project')
          : row.kind === 'task'
            ? t('任务', 'Task')
            : 'Run',
    },
    {
      key: 'status',
      title: t('执行状态', 'Execution'),
      width: 130,
      render: (row) =>
        row.status ? (
          <AppBadge tone={statusTone(row.status)}>
            {statusText(row.status, t)}
          </AppBadge>
        ) : (
          <span className="wb-muted">-</span>
        ),
    },
    {
      key: 'count',
      title: t('直接子项', 'Children'),
      width: 90,
      render: (row) => row.children?.length ?? 0,
    },
  ]
  return (
    <>
      <div className="wb-page-heading">
        <h1>{t('项目层级', 'Project hierarchy')}</h1>
        <AppButton
          label={t('项目列表', 'Project list')}
          href="#projects"
          tone="ghost"
        />
      </div>
      <div className="wb-list-toolbar">
        <p className="wb-hint">
          {t('项目 → 任务 → 历史运行', 'Projects → Tasks → Run history')}
        </p>
        <div className="wb-search">
          <AppInput
            label={t('搜索项目层级', 'Search hierarchy')}
            type="search"
            isLabelHidden
            value={query}
            onChange={setQuery}
            startIcon={<Search size={15} />}
            placeholder={t('搜索名称或 ID', 'Search name or ID')}
            hasClear
          />
        </div>
      </div>
      <AppTreeTable
        rows={rows}
        columns={columns}
        label={t('项目任务层级', 'Project task hierarchy')}
        expandedIds={expandedIds}
        onExpandedIdsChange={(ids) =>
          setExpansion((current) =>
            changeHierarchyExpansion(current, ids, rows, query),
          )
        }
        empty={
          <p className="wb-empty">
            {t('没有匹配的项目或任务', 'No matching projects or tasks')}
          </p>
        }
      />
    </>
  )
}
