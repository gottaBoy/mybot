import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { AppButton, AppInput, AppLoading } from '../components/ui'
import type { Bootstrap } from './api'
import type { ProjectReferenceItem } from './project-references'
import { stripQueryWhitespace } from './task-query'
import { useProjectReferences } from './useProjectReferences'

export type ProjectReferenceDirectoryProps = {
  data: Bootstrap
  refreshRevision: number
  selectedIds: string[]
  t: (zh: string, en: string) => string
  variant: 'sidebar' | 'scope'
  countUnit?: 'tasks' | 'runs'
  fixedProjectId?: string
  onSelect: (id: string) => void
  includeAll?: boolean
}

export function ProjectReferenceDirectory({
  data,
  refreshRevision,
  selectedIds,
  t,
  variant,
  countUnit = 'tasks',
  fixedProjectId,
  onSelect,
  includeAll = false,
}: ProjectReferenceDirectoryProps) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [inputError, setInputError] = useState(false)
  const directory = useProjectReferences({
    data,
    refreshRevision,
    request: {
      query: fixedProjectId ? '' : query,
      page: fixedProjectId ? 1 : page,
      pageSize: 20,
      selectedIds: fixedProjectId ? [fixedProjectId] : selectedIds,
    },
  })
  const value = directory.value
  const rootRef = useRef<HTMLDivElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<{
    direction: 'previous' | 'next'
    origin: Element | null
  }>(undefined)
  const admission = useRef(false)
  admission.current = Boolean(value && !directory.busy && !directory.error)

  useEffect(() => {
    if (!pageFocus.current || directory.busy) return
    const { direction, origin } = pageFocus.current
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== origin
    )
      return
    if (directory.error) {
      retryRef.current?.focus()
      return
    }
    const root = rootRef.current
    const preferred = root?.querySelector<HTMLButtonElement>(
      `[data-project-page="${direction}"]:not(:disabled):not([aria-disabled="true"])`,
    )
    const fallback = root?.querySelector<HTMLButtonElement>(
      '[data-project-page]:not(:disabled):not([aria-disabled="true"])',
    )
    ;(preferred ?? fallback)?.focus()
  }, [directory.busy, directory.error, value])

  if (!directory.remote) return null

  const submit = () => {
    if ([...draft].length > 2000) {
      setInputError(true)
      return
    }
    setInputError(false)
    const candidate = stripQueryWhitespace(draft)
    if (candidate === query && page === 1) directory.retry()
    else {
      setQuery(candidate)
      setPage(1)
    }
  }
  const select = (id: string) => {
    if (admission.current && !fixedProjectId) onSelect(id)
  }
  const renderItem = (item: ProjectReferenceItem) => {
    const name = (
      <span className="wb-project-directory-name" title={item.project.name}>
        {item.project.name}
      </span>
    )
    const count = (
      <span
        className="wb-project-directory-count"
        data-project-reference-count
        aria-label={
          countUnit === 'runs'
            ? t('运行数', 'Run count')
            : t('任务数', 'Task count')
        }
        aria-busy={directory.busy || undefined}
      >
        {countUnit === 'runs' ? item.run_count : item.task_count}
      </span>
    )
    if (fixedProjectId)
      return (
        <div
          key={item.project.id}
          className="wb-project-directory-fixed"
          data-project-reference={item.project.id}
        >
          <span className="wb-project-directory-row-content">
            {name}
            {count}
          </span>
        </div>
      )
    return (
      <AppButton
        key={item.project.id}
        label={item.project.name}
        tone="ghost"
        endContent={count}
        className="wb-project-directory-row"
        data-project-reference={item.project.id}
        aria-pressed={selectedIds.includes(item.project.id)}
        disabled={directory.busy}
        onClick={() => select(item.project.id)}
      >
        <span className="wb-project-directory-row-label">
          {variant === 'sidebar' && <FolderGit2 size={14} />}
          {name}
        </span>
      </AppButton>
    )
  }
  const items = fixedProjectId
    ? (value?.selected.filter((item) => item.project.id === fixedProjectId) ??
      [])
    : (value?.items ?? [])
  const pageIds = new Set(items.map((item) => item.project.id))
  const selected = fixedProjectId
    ? []
    : (value?.selected.filter((item) => !pageIds.has(item.project.id)) ?? [])
  const errorText =
    directory.error === 'forbidden'
      ? t('没有读取项目目录的权限。', 'Project directory access is forbidden.')
      : directory.error === 'unavailable'
        ? t('项目目录接口不可用。', 'Project directory is unavailable.')
        : directory.error === 'timeout'
          ? t('读取项目目录超时。', 'Reading project directory timed out.')
          : t(
              '项目目录读取失败或响应无效。',
              'Project directory could not be read or validated.',
            )
  const rangeStart = value?.total ? (value.page - 1) * value.page_size + 1 : 0
  const rangeEnd = value
    ? Math.min(value.page * value.page_size, value.total)
    : 0

  return (
    <div
      ref={rootRef}
      className={`wb-project-directory wb-project-directory-${variant}`}
      data-testid={`project-directory-${variant}`}
      aria-busy={directory.busy || undefined}
    >
      {!fixedProjectId && (
        <div className="wb-project-directory-search">
          <div
            className="wb-project-directory-search-field"
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229 &&
                !event.defaultPrevented
              ) {
                event.preventDefault()
                submit()
              }
            }}
          >
            <AppInput
              label={t('搜索项目', 'Search projects')}
              isLabelHidden
              value={draft}
              onChange={(next) => {
                setDraft(next)
                setInputError(false)
              }}
              placeholder={t('搜索项目', 'Search projects')}
              maxLength={2000}
            />
          </div>
          <AppButton
            label={t('搜索项目目录', 'Search project directory')}
            icon={<Search size={15} />}
            iconOnly
            tone="ghost"
            onClick={submit}
          />
        </div>
      )}
      {inputError && (
        <p className="wb-project-directory-feedback" role="alert">
          {t(
            '搜索内容最多 2000 个字符。',
            'Search is limited to 2000 characters.',
          )}
        </p>
      )}
      {includeAll && !fixedProjectId && (
        <AppButton
          label={t('全部项目', 'All projects')}
          tone="ghost"
          className="wb-project-directory-row"
          data-project-reference="all"
          aria-pressed={selectedIds.length === 0}
          disabled={directory.busy || !value}
          onClick={() => select('all')}
          endContent={
            <span
              className="wb-project-directory-count"
              data-project-reference-count
              aria-busy={directory.busy || undefined}
            >
              {value ? value.totals[countUnit] : '-'}
            </span>
          }
        >
          <span className="wb-project-directory-name">
            {t('全部项目', 'All projects')}
          </span>
        </AppButton>
      )}
      {directory.error && (
        <div className="wb-project-directory-feedback" role="alert">
          <span>{errorText}</span>
          <AppButton
            ref={retryRef}
            label={t('重试项目目录', 'Retry project directory')}
            icon={<RefreshCw size={15} />}
            iconOnly
            tone="ghost"
            onClick={directory.retry}
          />
        </div>
      )}
      {directory.busy && !value && (
        <div className="wb-project-directory-loading">
          <AppLoading
            label={t('正在读取项目目录', 'Loading project directory')}
          />
        </div>
      )}
      {selected.length > 0 && (
        <div
          className="wb-project-directory-selected"
          data-testid="project-directory-selected"
        >
          <p className="wb-project-directory-caption">
            {t('已选项目', 'Selected projects')}
          </p>
          <div className="wb-project-directory-selected-items">
            {selected.map(renderItem)}
          </div>
        </div>
      )}
      {value?.missing_ids.map((id) => (
        <p className="wb-project-directory-feedback" role="status" key={id}>
          {t('项目不可用', 'Unavailable project')} · {id}
        </p>
      ))}
      {items.length > 0 && (
        <div className="wb-project-directory-items">
          {items.map(renderItem)}
        </div>
      )}
      {value && !items.length && !fixedProjectId && (
        <p className="wb-project-directory-feedback" role="status">
          {value.totals.projects === 0
            ? t('尚无项目', 'No projects yet')
            : t('没有匹配的项目', 'No matching projects')}
        </p>
      )}
      {!fixedProjectId && value && (
        <div className="wb-project-directory-footer">
          <span
            className="wb-project-directory-range"
            data-testid="project-directory-status"
            role="status"
            aria-live="polite"
          >
            {rangeStart}-{rangeEnd} / {value.total}
          </span>
          <div
            className="wb-project-directory-pager"
            aria-label={t('项目目录分页', 'Project directory pages')}
          >
            <AppButton
              label={t('上一页项目', 'Previous project page')}
              icon={<ChevronLeft size={15} />}
              iconOnly
              tone="ghost"
              data-project-page="previous"
              disabled={directory.busy || value.page <= 1}
              onClick={() => {
                if (!admission.current || value.page <= 1) return
                pageFocus.current = {
                  direction: 'previous',
                  origin: document.activeElement,
                }
                setPage(value.page - 1)
              }}
            />
            <AppButton
              label={t('下一页项目', 'Next project page')}
              icon={<ChevronRight size={15} />}
              iconOnly
              tone="ghost"
              data-project-page="next"
              disabled={directory.busy || !value.has_more}
              onClick={() => {
                if (!admission.current || !value.has_more) return
                pageFocus.current = {
                  direction: 'next',
                  origin: document.activeElement,
                }
                setPage(value.page + 1)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
