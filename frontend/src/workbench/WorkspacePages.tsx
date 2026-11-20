import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileSearch,
  FolderGit2,
  GitBranch,
  Inbox,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import {
  AppBadge,
  AppButton,
  AppDialog,
  AppInput,
  AppLoading,
  AppProgress,
  AppSegments,
  AppSelect,
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
import type { ListLocation } from './list-location'
import { parseInboxType, prepareInboxRequest } from './inbox-query'
import { useInboxQuery } from './useInboxQuery'
import { useInboxDetail } from './useInboxDetail'
import './inbox.css'

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

type InboxProps = Props & {
  refreshRevision?: number
  location?: ListLocation
  onLocationChange?: (patch: Partial<ListLocation>) => boolean | void
  resetKey?: number
}

export function WorkInbox({
  data,
  t,
  onPrepare,
  refreshRevision = 0,
  location,
  onLocationChange,
  resetKey,
}: InboxProps) {
  const remote = data.capabilities.task_query === true
  const committedQuery = location?.query ?? ''
  const inboxType = parseInboxType(location?.inboxType)
  const page = location?.page ?? 1
  const pageSize = location?.pageSize ?? 20
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState(remote ? committedQuery : '')
  const [inputError, setInputError] = useState(false)
  const [selected, setSelected] = useState({ key: '', id: '' })
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const compact = useCompactTaskList()
  const root = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const retryTrigger = useRef<HTMLButtonElement | null>(null)
  const pageFocus = useRef<{
    key: string
    direction: 'previous' | 'next'
    origin: Element | null
  }>(undefined)
  const admission = useRef({
    list: false,
    detail: false,
    key: '',
    ids: new Set<string>(),
    detailIdentity: '',
  })
  const request = {
    query: committedQuery,
    type: inboxType ?? 'all',
    page,
    pageSize,
  }
  let invalidQuery = false
  let prepared
  try {
    prepared = prepareInboxRequest(request)
  } catch {
    invalidQuery = true
  }
  const unsupportedConditions = Boolean(
    location?.jql ||
    location?.project ||
    location?.projects?.length ||
    location?.states?.length ||
    (location?.filter && location.filter !== 'all') ||
    location?.groupBy ||
    (location?.group && location.group !== 'none') ||
    location?.conditionsInvalid,
  )
  const problem =
    remote && (!inboxType || invalidQuery || unsupportedConditions)
  const read = useInboxQuery({
    data,
    refreshRevision,
    request,
    enabled: !problem,
  })
  const value = remote && !problem ? read.value : undefined
  const listBusy = remote && !problem && read.busy
  const listError = remote && !problem ? read.error : undefined
  const selectionKey = remote
    ? JSON.stringify([data.workspace, prepared ?? request])
    : 'legacy'
  const selectedId = selected.key === selectionKey ? selected.id : ''
  const dialogOpen =
    mobileDetailOpen && selected.key === selectionKey && Boolean(selectedId)
  const items = remote
    ? (value?.items ?? [])
    : taskItems(data)
        .filter((item) => ['pending', 'attention'].includes(item.column))
        .filter((item) => filter === 'all' || item.column === filter)
        .filter((item) =>
          `${item.task.title} ${item.projectName}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
        )
  const selection = resolveInboxSelection(items, selectedId, !compact)
  const current = selection.kind === 'available' ? selection.item : undefined
  const detail = useInboxDetail({
    data,
    refreshRevision,
    item: current,
    enabled:
      remote &&
      Boolean(value && !problem && !listError && current) &&
      (!compact || dialogOpen),
  })
  const display = remote && detail.remote ? detail.value : current
  const detailBusy = remote && detail.remote && detail.busy
  const detailError = remote && detail.remote ? detail.error : undefined
  const outsideInbox = Boolean(
    remote &&
    display &&
    (!['pending', 'attention'].includes(display.column) ||
      (inboxType !== 'all' && display.column !== inboxType)),
  )
  const detailIdentity = JSON.stringify([
    display?.task,
    display?.projectName,
    display?.run,
    display?.attempts,
  ])
  admission.current = {
    key: selectionKey,
    ids: new Set(items.map((item) => item.id)),
    detailIdentity,
    list: !remote || Boolean(value && !listBusy && !problem && !listError),
    detail:
      !remote ||
      Boolean(
        value &&
        display &&
        !listBusy &&
        !detailBusy &&
        !detailError &&
        !problem &&
        !listError &&
        !outsideInbox,
      ),
  }
  const canAct = () =>
    admission.current.detail &&
    admission.current.key === selectionKey &&
    admission.current.detailIdentity === detailIdentity
  useEffect(() => {
    if (remote) {
      setQuery(committedQuery)
      setInputError(false)
    }
  }, [remote, committedQuery, resetKey])
  useEffect(() => {
    setMobileDetailOpen(false)
  }, [selectionKey])
  useEffect(() => {
    if (!compact) setMobileDetailOpen(false)
  }, [compact])
  useEffect(() => {
    const pending = pageFocus.current
    if (!pending) return
    if (pending.key !== selectionKey) {
      pageFocus.current = undefined
      return
    }
    if (listBusy || (!value && !problem && !listError)) return
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    if (listError) {
      retryTrigger.current?.focus()
      return
    }
    const available = ':not(:disabled):not([aria-disabled="true"])'
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-inbox-page="${pending.direction}"]${available}`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      `[data-inbox-page]${available}`,
    )
    ;(preferred ?? fallback)?.focus()
  }, [selectionKey, listBusy, listError, problem, value])
  const closeDetail = () => {
    const dialog =
      root.current
        ?.querySelector('.wb-inbox-dialog-detail')
        ?.closest('[role="dialog"]') ??
      document
        .querySelector('.wb-inbox-dialog-detail')
        ?.closest('[role="dialog"]')
    setMobileDetailOpen(false)
    requestAnimationFrame(() => {
      const focused = document.activeElement
      if (
        focused !== document.body &&
        focused !== trigger.current &&
        !dialog?.contains(focused)
      )
        return
      if (
        trigger.current?.isConnected &&
        trigger.current.getClientRects().length &&
        !trigger.current.disabled &&
        trigger.current.getAttribute('aria-disabled') !== 'true'
      )
        trigger.current.focus()
      else heading.current?.focus()
    })
  }
  const submit = () => {
    try {
      const candidate = prepareInboxRequest({ ...request, query, page: 1 })
      if (
        onLocationChange?.({
          query: candidate.query.text || undefined,
          page: 1,
        }) === false
      )
        return
      setQuery(candidate.query.text)
      setInputError(false)
    } catch {
      setInputError(true)
    }
  }
  const clear = () => {
    if (
      onLocationChange?.({
        query: undefined,
        inboxType: undefined,
        page: 1,
        jql: '',
        project: undefined,
        projects: undefined,
        states: undefined,
        filter: undefined,
        groupBy: '',
        group: 'none',
      }) === false
    )
      return
    setQuery('')
    setInputError(false)
  }
  const changePage = (candidate: number, direction: 'previous' | 'next') => {
    if (
      !admission.current.list ||
      admission.current.key !== selectionKey ||
      !value ||
      candidate < 1 ||
      candidate > value.total_pages
    )
      return
    const next = prepareInboxRequest({ ...request, page: candidate })
    pageFocus.current = {
      key: JSON.stringify([data.workspace, next]),
      direction,
      origin: document.activeElement,
    }
    if (onLocationChange?.({ page: candidate }) === false)
      pageFocus.current = undefined
  }
  const unavailable = (
    <div className="wb-empty" role="status">
      <Inbox size={25} />
      <h2>
        {t(
          '所选任务已不在当前结果中',
          'Selected task is no longer in these results',
        )}
      </h2>
    </div>
  )
  const taskDetail =
    selection.kind === 'unavailable' ? (
      unavailable
    ) : detailError ? (
      <div className="wb-error" role="alert">
        <p>
          {detailError === 'forbidden'
            ? t('没有读取任务详情的权限。', 'Task details access is forbidden.')
            : detailError === 'unavailable'
              ? t(
                  '任务详情不可用或已移除。',
                  'Task details are unavailable or removed.',
                )
              : detailError === 'timeout'
                ? t('读取任务详情超时。', 'Reading task details timed out.')
                : t(
                    '任务详情未通过验证，未显示内容。',
                    'Task details could not be validated. No content was shown.',
                  )}
        </p>
        <AppButton
          label={t('重试待处理详情', 'Retry inbox details')}
          icon={<RefreshCw size={15} />}
          onClick={detail.retry}
        />
      </div>
    ) : outsideInbox ? (
      <div className="wb-empty" role="status">
        <Inbox size={25} />
        <h2>
          {t(
            '所选任务已不在当前待处理中',
            'Selected task is no longer in this inbox',
          )}
        </h2>
        <AppButton
          label={t('刷新待处理', 'Refresh inbox')}
          icon={<RefreshCw size={15} />}
          disabled={listBusy}
          onClick={read.retry}
        />
      </div>
    ) : current && remote && detail.remote && !display ? (
      <AppLoading label={t('正在读取任务详情', 'Loading task details')} />
    ) : display ? (
      <>
        <div className="wb-eyebrow">{display.projectName}</div>
        <h2>{display.task.title}</h2>
        <AppBadge
          tone={display.run ? statusTone(display.run.status) : 'neutral'}
        >
          {display.run
            ? statusText(display.run.status, t)
            : t('未运行', 'Not started')}
        </AppBadge>
        <p>{display.task.goal}</p>
        <dl className="wb-details">
          <dt>{t('验收要求', 'Acceptance')}</dt>
          <dd>{display.task.acceptance || t('未填写', 'Not provided')}</dd>
          <dt>{t('显式文件', 'Explicit files')}</dt>
          <dd>
            {display.task.files.join(', ') || t('未选择', 'None selected')}
          </dd>
          <dt>{t('历史运行', 'Run history')}</dt>
          <dd>{display.attempts}</dd>
        </dl>
        {!remote && display.run?.error && (
          <div className="wb-error">
            {errorText(display.run.error, t)}
            <code>{display.run.error}</code>
          </div>
        )}
        <div className="wb-inline">
          {display.run ? (
            <AppButton
              label={t('打开运行', 'Open run')}
              tone="primary"
              icon={<ArrowRight size={15} />}
              href={`#run/${display.run.id}`}
              disabled={!admission.current.detail}
              onClick={(event) => {
                if (!canAct()) {
                  event.preventDefault()
                  event.stopPropagation()
                }
              }}
            />
          ) : (
            <AppButton
              label={t('检查并运行', 'Review & run')}
              tone="primary"
              icon={<FileSearch size={15} />}
              disabled={!admission.current.detail}
              onClick={() => {
                if (!canAct()) return
                if (compact) closeDetail()
                onPrepare(display.task)
              }}
            />
          )}
          <AppButton
            label={t('打开项目', 'Open project')}
            tone="ghost"
            href={`#project/${display.task.project_id}`}
            disabled={!admission.current.detail}
            onClick={(event) => {
              if (!canAct()) {
                event.preventDefault()
                event.stopPropagation()
              }
            }}
          />
        </div>
      </>
    ) : null
  return (
    <section
      ref={root}
      className={remote ? 'wb-inbox-view wb-inbox-remote' : 'wb-inbox-view'}
      data-testid="inbox-view"
    >
      <div className="wb-page-heading">
        <div>
          <div className="wb-eyebrow">INBOX</div>
          <h1 ref={heading} tabIndex={-1}>
            {t('待处理', 'Inbox')}
          </h1>
        </div>
        <span className="wb-muted">
          {remote && (problem || listError || !value)
            ? '-'
            : (value?.total ?? items.length)}{' '}
          {t('项', 'items')}
        </span>
      </div>
      <div className="wb-list-toolbar wb-inbox-query">
        <AppSegments
          label={t('待处理类型', 'Inbox type')}
          value={remote ? (inboxType ?? 'all') : filter}
          onChange={(value) =>
            remote
              ? onLocationChange?.({ inboxType: value, page: 1 })
              : setFilter(value)
          }
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
            onEnter={remote ? submit : undefined}
            startIcon={<Search size={15} />}
            placeholder={t('搜索任务', 'Search tasks')}
          />
        </div>
        {remote && (
          <>
            <AppButton
              label={t('搜索', 'Search')}
              tone="primary"
              icon={<Search size={15} />}
              iconOnly
              onClick={submit}
            />
            <AppButton
              label={t('清除待处理筛选', 'Clear inbox')}
              tone="ghost"
              icon={<X size={15} />}
              iconOnly
              disabled={
                !query &&
                !committedQuery &&
                (inboxType === 'all' || !location?.inboxType) &&
                !problem &&
                !inputError
              }
              onClick={clear}
            />
          </>
        )}
      </div>
      {remote && (problem || inputError) && (
        <div className="wb-error" role="alert">
          <p>
            {!inboxType
              ? t('待处理类型无效。', 'Invalid inbox type.')
              : unsupportedConditions
                ? t(
                    '待处理不支持这些查询条件，未显示结果。',
                    'These query conditions are not supported in the inbox. No results were shown.',
                  )
                : t(
                    '待处理搜索无效，请检查输入。',
                    'Invalid inbox search. Review the input.',
                  )}
          </p>
          {problem && (
            <AppButton
              label={t('清除待处理筛选', 'Clear inbox')}
              onClick={clear}
            />
          )}
        </div>
      )}
      {listError && (
        <div className="wb-error" role="alert">
          <p>
            {listError === 'forbidden'
              ? t('没有读取待处理的权限。', 'Inbox access is forbidden.')
              : listError === 'timeout'
                ? t('读取待处理超时。', 'Reading the inbox timed out.')
                : t(
                    '待处理读取失败，未显示结果。',
                    'The inbox could not be read. No results were shown.',
                  )}
          </p>
          <AppButton
            ref={retryTrigger}
            label={t('重试待处理', 'Retry inbox')}
            icon={<RefreshCw size={15} />}
            onClick={read.retry}
          />
        </div>
      )}
      {listBusy && !value ? (
        <AppLoading label={t('正在读取待处理', 'Loading inbox')} />
      ) : !problem &&
        !listError &&
        (items.length || selection.kind === 'unavailable') ? (
        <div className="wb-inbox-layout" aria-busy={listBusy || undefined}>
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
                data-inbox-task={item.id}
                disabled={!admission.current.list}
                aria-pressed={current?.id === item.id}
                aria-haspopup={compact ? 'dialog' : undefined}
                aria-expanded={
                  compact ? dialogOpen && selectedId === item.id : undefined
                }
                onClick={(event) => {
                  if (
                    !admission.current.list ||
                    admission.current.key !== selectionKey ||
                    !admission.current.ids.has(item.id)
                  )
                    return
                  trigger.current = event.currentTarget
                  setSelected({ key: selectionKey, id: item.id })
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
                    {!remote && item.run?.error
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
              aria-busy={detailBusy || listBusy || undefined}
            >
              {taskDetail}
            </section>
          )}
        </div>
      ) : !problem && !listError ? (
        <div className="wb-empty">
          <Inbox size={30} />
          <h2>{t('没有待处理任务', 'Inbox is clear')}</h2>
        </div>
      ) : null}
      {remote && value && !problem && !listError && (
        <footer
          className="wb-inbox-pagination"
          aria-label={t('待处理分页', 'Inbox pagination')}
        >
          <span data-testid="inbox-range" role="status">
            {value.total
              ? `${(value.page - 1) * value.page_size + 1}-${Math.min(value.page * value.page_size, value.total)}`
              : '0-0'}{' '}
            / {value.total}
          </span>
          <div className="wb-inbox-page-tools">
            <div className="wb-inbox-capacity">
              <AppSelect
                label={t('每页待处理数', 'Inbox items per page')}
                hiddenLabel
                value={String(value.page_size)}
                disabled={listBusy}
                options={[20, 50, 100].map((size) => ({
                  value: String(size),
                  label: t(`每页 ${size}`, `${size} / page`),
                }))}
                onChange={(value) => {
                  const size = Number(value)
                  if (
                    !admission.current.list ||
                    admission.current.key !== selectionKey ||
                    ![20, 50, 100].includes(size)
                  )
                    return
                  onLocationChange?.({ pageSize: size, page: 1 })
                }}
              />
            </div>
            <AppButton
              label={t('上一页待处理', 'Previous inbox page')}
              icon={<ChevronLeft size={16} />}
              iconOnly
              tone="ghost"
              data-inbox-page="previous"
              disabled={listBusy || value.page <= 1}
              onClick={() => changePage(value.page - 1, 'previous')}
            />
            <span>
              {value.page} / {value.total_pages}
            </span>
            <AppButton
              label={t('下一页待处理', 'Next inbox page')}
              icon={<ChevronRight size={16} />}
              iconOnly
              tone="ghost"
              data-inbox-page="next"
              disabled={listBusy || !value.has_more}
              onClick={() => changePage(value.page + 1, 'next')}
            />
          </div>
        </footer>
      )}
      {compact && dialogOpen && !problem && !listError && (
        <AppDialog
          title={
            current
              ? `${t('任务详情', 'Task details')} · ${current.task.title}`
              : t('任务详情', 'Task details')
          }
          closeLabel={t('关闭', 'Close')}
          onClose={closeDetail}
        >
          <div
            className="wb-inbox-dialog-detail"
            aria-busy={detailBusy || listBusy || undefined}
          >
            {taskDetail}
          </div>
        </AppDialog>
      )}
    </section>
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
