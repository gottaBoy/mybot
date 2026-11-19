import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import {
  AppButton,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppLoading,
} from '../components/ui'
import { useAppControlSize } from '../components/ui/DensityContext'
import type { Bootstrap } from './api'
import type { ProjectReferenceItem } from './project-references'
import type { Copy } from './state'
import { stripQueryWhitespace } from './task-query'
import { useProjectReferences } from './useProjectReferences'
import './project-query-picker.css'

export type ProjectQueryPickerProps = {
  data: Bootstrap
  refreshRevision: number
  value: string[]
  onChange: (ids: string[]) => void
  t: Copy
  hiddenLabel?: boolean
}

type SelectionRead = ReturnType<typeof useProjectReferences>

export function projectPickerSelection(
  selected: string[],
  id: string,
  checked: boolean,
) {
  if (!checked) return selected.filter((candidate) => candidate !== id)
  if (selected.includes(id) || selected.length >= 100) return [...selected]
  return [...selected, id]
}

function readError(error: SelectionRead['error'], t: Copy, selected = false) {
  if (error === 'forbidden')
    return t('没有读取项目的权限。', 'Project access is forbidden.')
  if (error === 'unavailable')
    return t('项目引用接口不可用。', 'Project references are unavailable.')
  if (error === 'timeout')
    return t('读取项目超时。', 'Reading projects timed out.')
  return selected
    ? t('所选项目暂未验证。', 'Selected projects could not be verified.')
    : t(
        '项目目录读取失败或响应无效。',
        'Project directory could not be read or validated.',
      )
}

export function ProjectQueryPicker(props: ProjectQueryPickerProps) {
  const { data, refreshRevision, value, t, hiddenLabel = false } = props
  const [open, setOpen] = useState(false)
  const selection = useProjectReferences({
    data,
    refreshRevision,
    enabled: value.length > 0,
    request: { query: '', page: 1, pageSize: 20, selectedIds: value },
  })
  const resolved =
    value.length === 1
      ? selection.value?.selected.find((item) => item.project.id === value[0])
      : undefined
  const label = t('项目', 'Project')
  const summary = resolved
    ? resolved.project.name
    : value.length
      ? `${label} (${value.length})`
      : label
  if (!selection.remote) return null

  return (
    <div className="wb-project-picker-field">
      {!hiddenLabel && (
        <span className="wb-project-picker-field-label">{label}</span>
      )}
      <AppButton
        label={label}
        width="100%"
        className="wb-project-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="project-query-picker-trigger"
        endContent={<ChevronDown size={15} />}
        onClick={() => setOpen(true)}
      >
        <span className="wb-project-picker-summary" title={summary}>
          {summary}
        </span>
      </AppButton>
      {open && (
        <AppDialog
          title={t('选择项目', 'Choose projects')}
          closeLabel={t('关闭项目选择', 'Close project selection')}
          onClose={() => setOpen(false)}
        >
          <ProjectQueryPickerPanel
            {...props}
            selection={selection}
            onClose={() => setOpen(false)}
          />
        </AppDialog>
      )}
    </div>
  )
}

export function ProjectQueryPickerPanel({
  data,
  refreshRevision,
  value,
  onChange,
  t,
  selection,
  onClose,
}: ProjectQueryPickerProps & {
  selection: SelectionRead
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [inputError, setInputError] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const pageFocus = useRef<{
    direction: 'previous' | 'next'
    origin: Element | null
  }>(undefined)
  const controlSize = useAppControlSize()
  const directory = useProjectReferences({
    data,
    refreshRevision,
    request: { query, page, pageSize: 20, selectedIds: [] },
  })
  const result = directory.value
  const admission = useRef({ allowed: false, ids: new Set<string>(), value })
  admission.current = {
    allowed: Boolean(result && !directory.busy && !directory.error),
    ids: new Set(result?.items.map((item) => item.project.id)),
    value,
  }
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
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-project-picker-page="${direction}"]:not(:disabled):not([aria-disabled="true"])`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      '[data-project-picker-page]:not(:disabled):not([aria-disabled="true"])',
    )
    ;(preferred ?? fallback)?.focus()
  }, [directory.busy, directory.error, result])

  const submit = () => {
    if ([...draft].length > 2000) {
      setInputError(true)
      return
    }
    setInputError(false)
    const next = stripQueryWhitespace(draft)
    if (next === query && page === 1) directory.retry()
    else {
      setQuery(next)
      setPage(1)
    }
  }
  const toggle = (id: string, checked: boolean) => {
    const current = admission.current
    if (!current.allowed || !current.ids.has(id)) return
    if (checked && !current.value.includes(id) && current.value.length >= 100)
      return
    onChange(projectPickerSelection(current.value, id, checked))
  }
  const pageIds = new Set(result?.items.map((item) => item.project.id))
  const selectedById = new Map(
    selection.value?.selected.map((item) => [item.project.id, item]),
  )
  const missing = new Set(selection.value?.missing_ids)
  const offPage = value.filter((id) => !pageIds.has(id))
  const remove = (id: string) => {
    onChange(admission.current.value.filter((item) => item !== id))
  }
  const renderSelected = (id: string) => {
    const item = selectedById.get(id)
    const unavailable = missing.has(id)
    const name =
      item?.project.name ??
      `${
        unavailable
          ? t('不可用项目', 'Unavailable project')
          : t('项目尚未验证', 'Project reference pending')
      } · ${id}`
    return (
      <div
        className="wb-project-picker-selected-row"
        data-project-picker-id={id}
        key={id}
      >
        <span className="wb-project-picker-name" title={name}>
          {name}
        </span>
        <AppButton
          label={`${t('移除项目', 'Remove project')}: ${id}`}
          icon={<X size={14} />}
          iconOnly
          tone="ghost"
          onClick={() => remove(id)}
        />
      </div>
    )
  }
  const renderOption = (item: ProjectReferenceItem) => {
    const checked = value.includes(item.project.id)
    return (
      <div
        className="wb-project-picker-option"
        data-project-picker-id={item.project.id}
        key={item.project.id}
      >
        <AppCheckbox
          label={item.project.name}
          value={checked}
          size={controlSize === 'sm' ? 'sm' : 'md'}
          width="100%"
          isDisabled={directory.busy || (!checked && value.length >= 100)}
          onChange={(next) => toggle(item.project.id, next)}
        />
      </div>
    )
  }
  const rangeStart = result?.total
    ? (result.page - 1) * result.page_size + 1
    : 0
  const rangeEnd = result
    ? Math.min(result.page * result.page_size, result.total)
    : 0

  return (
    <div
      ref={root}
      className="wb-project-picker"
      data-testid="project-query-picker-dialog"
      aria-busy={directory.busy || undefined}
    >
      <div
        className="wb-project-picker-search"
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.nativeEvent.keyCode !== 229 &&
            !event.defaultPrevented &&
            (event.target as HTMLInputElement).type === 'text'
          ) {
            event.preventDefault()
            submit()
          }
        }}
      >
        <AppInput
          label={t('查找项目', 'Find projects')}
          isLabelHidden
          placeholder={t('查找项目', 'Find projects')}
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setInputError(false)
          }}
          maxLength={2000}
        />
        <AppButton
          label={t('搜索项目', 'Search projects')}
          icon={<Search size={16} />}
          iconOnly
          tone="secondary"
          onClick={submit}
        />
      </div>
      {inputError && (
        <p className="wb-project-picker-error" role="alert">
          {t(
            '搜索内容最多 2000 个字符。',
            'Search is limited to 2000 characters.',
          )}
        </p>
      )}
      {value.length >= 100 && (
        <p className="wb-project-picker-feedback" role="status">
          {t('最多选择 100 个项目。', 'Select up to 100 projects.')}
        </p>
      )}
      {selection.error && value.length > 0 && (
        <div className="wb-project-picker-error" role="alert">
          <span>{readError(selection.error, t, true)}</span>
          <AppButton
            label={t('重试所选项目', 'Retry selected projects')}
            icon={<RefreshCw size={15} />}
            iconOnly
            tone="ghost"
            onClick={selection.retry}
          />
        </div>
      )}
      {offPage.length > 0 && (
        <section
          className="wb-project-picker-selected"
          aria-label={t('已选项目', 'Selected projects')}
        >
          <div className="wb-project-picker-section-label">
            {t('已选项目', 'Selected projects')} ({value.length})
          </div>
          <div
            className="wb-project-picker-selected-items"
            aria-busy={selection.busy || undefined}
          >
            {offPage.map(renderSelected)}
          </div>
        </section>
      )}
      {directory.error && (
        <div className="wb-project-picker-error" role="alert">
          <span>{readError(directory.error, t)}</span>
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
      {directory.busy && !result && (
        <div className="wb-project-picker-loading">
          <AppLoading label={t('正在读取项目', 'Loading projects')} />
        </div>
      )}
      {result && (
        <>
          {result.items.length ? (
            <div className="wb-project-picker-options">
              {result.items.map(renderOption)}
            </div>
          ) : (
            <p className="wb-project-picker-feedback" role="status">
              {result.totals.projects === 0
                ? t('尚无项目', 'No projects yet')
                : t('没有匹配的项目', 'No matching projects')}
            </p>
          )}
          <div className="wb-project-picker-pagination">
            <span
              data-testid="project-picker-range"
              role="status"
              aria-live="polite"
            >
              {rangeStart}-{rangeEnd} / {result.total}
            </span>
            <div className="wb-project-picker-page-actions">
              <AppButton
                label={t('上一页项目', 'Previous project page')}
                icon={<ChevronLeft size={16} />}
                iconOnly
                tone="ghost"
                data-project-picker-page="previous"
                disabled={directory.busy || result.page <= 1}
                onClick={() => {
                  if (!admission.current.allowed || result.page <= 1) return
                  pageFocus.current = {
                    direction: 'previous',
                    origin: document.activeElement,
                  }
                  setPage(result.page - 1)
                }}
              />
              <AppButton
                label={t('下一页项目', 'Next project page')}
                icon={<ChevronRight size={16} />}
                iconOnly
                tone="ghost"
                data-project-picker-page="next"
                disabled={directory.busy || !result.has_more}
                onClick={() => {
                  if (!admission.current.allowed || !result.has_more) return
                  pageFocus.current = {
                    direction: 'next',
                    origin: document.activeElement,
                  }
                  setPage(result.page + 1)
                }}
              />
            </div>
          </div>
        </>
      )}
      <div className="wb-project-picker-actions">
        <AppButton
          label={t('清空项目选择', 'Clear project selection')}
          icon={<X size={15} />}
          tone="ghost"
          disabled={value.length === 0}
          onClick={() => onChange([])}
        />
        <AppButton label={t('完成', 'Done')} tone="primary" onClick={onClose} />
      </div>
    </div>
  )
}
