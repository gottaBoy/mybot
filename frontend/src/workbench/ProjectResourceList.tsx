import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { AppButton, AppInput, AppLoading, AppSelect } from '../components/ui'
import { ApiError, type Bootstrap } from './api'
import type { ListLocation } from './list-location'
import {
  fetchProjectQuery,
  prepareProjectQueryRequest,
  type ProjectQueryPage,
  type ProjectQueryRequest,
} from './project-resources'
import { pushWorkbenchNavigation } from './navigation-guard'
import type { Copy } from './state'
import { stripQueryWhitespace } from './task-query'
import './project-resource-list.css'

export type ProjectResourceListProps = {
  data: Bootstrap
  refreshRevision: number
  t: Copy
  location: ListLocation
  onLocationChange: (patch: Partial<ListLocation>) => boolean | void
  resetKey?: number
}
type ProjectPageError = 'forbidden' | 'unavailable' | 'timeout' | 'invalid'
type ProjectPageState = {
  key: string
  kind: 'loading' | 'ready' | 'error'
  value?: ProjectQueryPage
  error?: ProjectPageError
}

export function ProjectResourceList({
  data,
  refreshRevision,
  t,
  location,
  onLocationChange,
  resetKey,
}: ProjectResourceListProps) {
  const query = location.query ?? ''
  const page = location.page ?? 1
  const pageSize = (location.pageSize ?? 20) as ProjectQueryRequest['pageSize']
  const [draft, setDraft] = useState(query)
  const [inputError, setInputError] = useState(false)
  const [state, setState] = useState<ProjectPageState>()
  const [revision, setRevision] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const retry = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<Element | null>(null)
  const observed = useRef({ data, refreshRevision })
  const request = { query, page, pageSize }
  const remote = data.capabilities.project_query === true
  const key = JSON.stringify([data.workspace, remote, request])
  const current = state?.key === key ? state : undefined
  const value = remote ? current?.value : undefined
  const busy = Boolean(remote && (!current || current.kind === 'loading'))
  const error = current?.kind === 'error' ? current.error : undefined
  const admission = useRef(false)
  admission.current = Boolean(value && !busy && !error)

  useEffect(() => {
    setDraft(query)
    setInputError(false)
  }, [query, resetKey])
  useEffect(() => {
    if (!remote) {
      setState(undefined)
      return
    }
    const controller = new AbortController()
    let live = true
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)
    setState((previous) => ({
      key,
      kind: 'loading',
      value: previous?.key === key ? previous.value : undefined,
    }))
    void fetchProjectQuery(request, controller.signal)
      .then((value) => {
        if (live && !controller.signal.aborted)
          setState({ key, kind: 'ready', value })
      })
      .catch((caught: unknown) => {
        if (!live || (controller.signal.aborted && !timedOut)) return
        setState({
          key,
          kind: 'error',
          error: timedOut
            ? 'timeout'
            : caught instanceof ApiError && caught.status === 403
              ? 'forbidden'
              : caught instanceof ApiError && caught.status === 404
                ? 'unavailable'
                : 'invalid',
        })
      })
      .finally(() => clearTimeout(timer))
    return () => {
      live = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [key, refreshRevision, revision])
  useEffect(() => {
    const previous = observed.current
    observed.current = { data, refreshRevision }
    if (
      previous.data !== data &&
      previous.refreshRevision === refreshRevision &&
      current?.kind === 'ready'
    )
      setRevision((value) => value + 1)
  }, [current, data, refreshRevision])
  useEffect(() => {
    const origin = pageFocus.current
    if (!origin || busy) return
    pageFocus.current = null
    if (
      document.activeElement !== document.body &&
      document.activeElement !== origin
    )
      return
    if (error) {
      retry.current?.focus()
      return
    }
    const originButton = origin as HTMLButtonElement
    const target =
      originButton.isConnected &&
      !originButton.disabled &&
      originButton.getAttribute('aria-disabled') !== 'true'
        ? originButton
        : root.current?.querySelector<HTMLButtonElement>(
            '[data-project-list-page]:not(:disabled):not([aria-disabled="true"])',
          )
    target?.focus()
  }, [busy, error, value])

  if (!remote) return null
  const submit = () => {
    try {
      prepareProjectQueryRequest({ query: draft, page: 1, pageSize })
      setInputError(false)
      const candidate = stripQueryWhitespace(draft)
      const admitted = onLocationChange({
        query: candidate || undefined,
        page: 1,
      })
      if (admitted !== false && candidate === query && page === 1)
        setRevision((value) => value + 1)
    } catch {
      setInputError(true)
    }
  }
  const failure =
    error === 'forbidden'
      ? t('没有读取项目的权限。', 'Project access is forbidden.')
      : error === 'unavailable'
        ? t('项目列表接口不可用。', 'Project query is unavailable.')
        : error === 'timeout'
          ? t('读取项目超时。', 'Reading projects timed out.')
          : t(
              '项目列表读取失败或响应无效。',
              'Projects could not be read or validated.',
            )
  const rangeStart = value?.total ? (value.page - 1) * value.page_size + 1 : 0
  const rangeEnd = value
    ? Math.min(value.page * value.page_size, value.total)
    : 0
  const changePage = (candidate: number) => {
    if (!admission.current) return
    pageFocus.current = document.activeElement
    if (onLocationChange({ page: candidate }) === false)
      pageFocus.current = null
  }

  return (
    <div
      ref={root}
      className="wb-project-resource-list"
      data-testid="project-resource-list"
      aria-busy={busy || undefined}
    >
      <div
        className="wb-project-resource-query"
        role="search"
        aria-label={t('项目搜索', 'Project search')}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.defaultPrevented &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229 &&
            (event.target as HTMLInputElement).type === 'search'
          ) {
            event.preventDefault()
            submit()
          }
        }}
      >
        <AppInput
          label={t('搜索项目', 'Search projects')}
          isLabelHidden
          type="search"
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setInputError(false)
          }}
          placeholder={t('搜索项目', 'Search projects')}
          maxLength={2000}
        />
        <AppButton
          label={t('搜索项目', 'Search projects')}
          icon={<Search size={16} />}
          iconOnly
          tone="primary"
          onClick={submit}
        />
      </div>
      {inputError && (
        <p className="wb-error" role="alert">
          {t(
            '项目搜索内容无效，未提交查询。',
            'Invalid project search. No query was applied.',
          )}
        </p>
      )}
      {error && (
        <div className="wb-error wb-project-resource-error" role="alert">
          <span>{failure}</span>
          <AppButton
            ref={retry}
            label={t('重试项目', 'Retry projects')}
            icon={<RefreshCw size={16} />}
            tone="ghost"
            onClick={() => setRevision((value) => value + 1)}
          />
        </div>
      )}
      {busy && !value && (
        <AppLoading label={t('正在读取项目', 'Loading projects')} />
      )}
      {value && (
        <>
          {value.items.length ? (
            <div className="wb-project-list wb-project-resource-items">
              {value.items.map((item) => (
                <AppButton
                  key={item.project.id}
                  label={item.project.name}
                  className="wb-project-resource-row"
                  tone="ghost"
                  width="100%"
                  disabled={busy}
                  endContent={<ChevronRight size={18} />}
                  onClick={() => {
                    if (admission.current)
                      pushWorkbenchNavigation(`#project/${item.project.id}`)
                  }}
                >
                  <span className="wb-project-resource-content">
                    <span className="wb-project-tile">
                      <FolderGit2 size={21} />
                    </span>
                    <span className="wb-project-resource-copy">
                      <span className="wb-project-resource-name">
                        {item.project.name}
                      </span>
                      <span>{item.project.goal || item.project.directory}</span>
                      <small>
                        {item.task_count} {t('项任务', 'tasks')} ·{' '}
                        {item.run_count} {t('次运行', 'runs')} ·{' '}
                        <code>{item.project.directory}</code>
                      </small>
                    </span>
                  </span>
                </AppButton>
              ))}
            </div>
          ) : (
            <div className="wb-empty">
              <FolderGit2 size={30} />
              <h2>
                {query
                  ? t('没有匹配的项目', 'No matching projects')
                  : t('尚未创建项目', 'No projects yet')}
              </h2>
            </div>
          )}
          <div
            className="wb-project-resource-pagination"
            aria-label={t('项目分页', 'Project pagination')}
          >
            <span role="status" data-testid="project-resource-range">
              {rangeStart}-{rangeEnd} / {value.total}
            </span>
            <div className="wb-project-resource-page-tools">
              <div className="wb-project-resource-capacity">
                <AppSelect
                  label={t('每页项目', 'Projects per page')}
                  hiddenLabel
                  value={String(pageSize)}
                  disabled={busy}
                  options={[20, 50, 100].map((size) => ({
                    value: String(size),
                    label: `${size} / ${t('页', 'page')}`,
                  }))}
                  onChange={(next) =>
                    admission.current &&
                    onLocationChange({ pageSize: Number(next), page: 1 })
                  }
                />
              </div>
              <AppButton
                label={t('上一页项目', 'Previous project page')}
                icon={<ChevronLeft size={16} />}
                iconOnly
                tone="ghost"
                data-project-list-page="previous"
                disabled={busy || value.page <= 1}
                onClick={() => changePage(value.page - 1)}
              />
              <span>
                {value.page} / {value.total_pages}
              </span>
              <AppButton
                label={t('下一页项目', 'Next project page')}
                icon={<ChevronRight size={16} />}
                iconOnly
                tone="ghost"
                data-project-list-page="next"
                disabled={busy || !value.has_more}
                onClick={() => changePage(value.page + 1)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
