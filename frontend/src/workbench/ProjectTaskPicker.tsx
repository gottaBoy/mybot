import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  AppButton,
  AppDialog,
  AppInput,
  AppLoading,
  AppRadioList,
} from '../components/ui'
import type { Bootstrap } from './api'
import { useProjectReferences } from './useProjectReferences'
import type { Copy } from './state'
import { stripQueryWhitespace } from './task-query'
import './project-task-picker.css'

type SelectionRead = ReturnType<typeof useProjectReferences>

export function taskProjectSummary(
  value: string,
  selection: SelectionRead,
  t: Copy,
) {
  if (!value) return t('选择项目', 'Select a project')
  const selected = selection.value?.selected.find(
    (item) => item.project.id === value,
  )
  if (selected) return selected.project.name
  return `${
    selection.value?.missing_ids.includes(value)
      ? t('项目不可用', 'Unavailable project')
      : t('项目尚未验证', 'Project reference pending')
  } · ${value}`
}

export function ProjectTaskPicker({
  data,
  refreshRevision,
  value,
  onChange,
  t,
  disabled = false,
  onCreateProject,
  selection,
}: {
  data: Bootstrap
  refreshRevision: number
  value: string
  onChange: (value: string) => void
  t: Copy
  disabled?: boolean
  onCreateProject?: () => void
  selection: SelectionRead
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [inputError, setInputError] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const pageFocus = useRef<
    { direction: 'previous' | 'next'; origin: Element | null } | undefined
  >(undefined)
  const read = useProjectReferences({
    data,
    refreshRevision,
    enabled: Boolean(open),
    request: { query, page, pageSize: 20, selectedIds: value ? [value] : [] },
  })
  const submit = () => {
    if ([...draft].length > 2000) {
      setInputError(true)
      return
    }
    setInputError(false)
    const next = stripQueryWhitespace(draft)
    if (next === query && page === 1) read.retry()
    else {
      setQuery(next)
      setPage(1)
    }
  }
  const current = useRef({ selectable: new Set<string>(), allowed: false })
  current.current = {
    selectable: new Set(read.value?.items.map((item) => item.project.id)),
    allowed: Boolean(!disabled && read.value && !read.busy && !read.error),
  }
  useEffect(() => {
    if (!pageFocus.current || read.busy) return
    const { direction, origin } = pageFocus.current
    pageFocus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== origin
    )
      return
    const preferred = root.current?.querySelector<HTMLButtonElement>(
      `[data-task-project-page="${direction}"]:not(:disabled):not([aria-disabled="true"])`,
    )
    const fallback = root.current?.querySelector<HTMLButtonElement>(
      '[data-task-project-page]:not(:disabled):not([aria-disabled="true"]), [data-task-project-retry]',
    )
    ;(preferred ?? fallback)?.focus()
  }, [read.busy, read.error, read.value])
  return (
    <div className="wb-task-project-picker" data-testid="project-task-picker">
      <AppButton
        label={t('项目', 'Project')}
        width="100%"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="project-task-picker-trigger"
        endContent={<ChevronDown size={15} />}
        onClick={() => setOpen(true)}
      >
        <span
          className="wb-task-project-summary"
          title={taskProjectSummary(value, selection, t)}
        >
          {taskProjectSummary(value, selection, t)}
        </span>
      </AppButton>
      {open && (
        <AppDialog
          title={t('选择任务项目', 'Select task project')}
          closeLabel={t('关闭项目选择', 'Close project selection')}
          onClose={() => setOpen(false)}
        >
          <div
            ref={root}
            className="wb-task-project-picker-panel"
            data-testid="project-task-picker-dialog"
            aria-busy={read.busy || undefined}
          >
            <div
              className="wb-task-project-search"
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
                label={t('查找项目', 'Find projects')}
                value={draft}
                onChange={(next) => {
                  setDraft(next)
                  setInputError(false)
                }}
                isLabelHidden
                maxLength={2000}
              />
              <AppButton
                label={t('搜索项目', 'Search projects')}
                iconOnly
                icon={<Search size={16} />}
                onClick={submit}
              />
            </div>
            {inputError && (
              <p className="wb-task-project-error" role="alert">
                {t(
                  '搜索内容最多 2000 个字符。',
                  'Search is limited to 2000 characters.',
                )}
              </p>
            )}
            {value && (
              <p className="wb-task-project-selected" role="status">
                {t('当前项目', 'Selected project')}:{' '}
                {taskProjectSummary(value, selection, t)}
              </p>
            )}
            {read.error && (
              <div className="wb-task-project-error" role="alert">
                {read.error === 'forbidden'
                  ? t('没有读取项目的权限。', 'Project access is forbidden.')
                  : read.error === 'unavailable'
                    ? t(
                        '项目引用接口不可用。',
                        'Project references are unavailable.',
                      )
                    : read.error === 'timeout'
                      ? t('读取项目超时。', 'Reading projects timed out.')
                      : t(
                          '项目读取失败或响应无效。',
                          'Project lookup failed or returned invalid data.',
                        )}
                <AppButton
                  label={t('重试项目', 'Retry projects')}
                  data-task-project-retry
                  icon={<RefreshCw size={15} />}
                  iconOnly
                  onClick={read.retry}
                />
              </div>
            )}
            {read.busy && !read.value ? (
              <AppLoading label={t('正在读取项目', 'Loading projects')} />
            ) : read.value && read.value.items.length ? (
              <div className="wb-task-project-options">
                <AppRadioList
                  label={t('任务项目', 'Task project')}
                  value={value}
                  options={read.value.items.map((item) => ({
                    value: item.project.id,
                    label: item.project.name,
                  }))}
                  onChange={(id) => {
                    if (
                      current.current.allowed &&
                      current.current.selectable.has(id)
                    )
                      onChange(id)
                  }}
                  disabled={read.busy}
                />
              </div>
            ) : read.value ? (
              <p className="wb-task-project-feedback" role="status">
                {read.value?.totals.projects
                  ? t('没有匹配的项目', 'No matching projects')
                  : t('尚无项目', 'No projects yet')}
              </p>
            ) : null}
            {read.value && (
              <div className="wb-task-project-pagination">
                <span role="status" data-testid="task-project-picker-range">
                  {read.value.total
                    ? `${(read.value.page - 1) * read.value.page_size + 1}-${Math.min(read.value.page * read.value.page_size, read.value.total)} / ${read.value.total}`
                    : '0 / 0'}
                </span>
                <span className="wb-task-project-page-actions">
                  <AppButton
                    label={t('上一页项目', 'Previous project page')}
                    iconOnly
                    icon={<ChevronLeft size={16} />}
                    data-task-project-page="previous"
                    disabled={read.busy || read.value.page <= 1}
                    onClick={() => {
                      if (!current.current.allowed || read.value!.page <= 1)
                        return
                      pageFocus.current = {
                        direction: 'previous',
                        origin: document.activeElement,
                      }
                      setPage(read.value!.page - 1)
                    }}
                  />
                  <AppButton
                    label={t('下一页项目', 'Next project page')}
                    iconOnly
                    icon={<ChevronRight size={16} />}
                    data-task-project-page="next"
                    disabled={read.busy || !read.value.has_more}
                    onClick={() => {
                      if (!current.current.allowed || !read.value!.has_more)
                        return
                      pageFocus.current = {
                        direction: 'next',
                        origin: document.activeElement,
                      }
                      setPage(read.value!.page + 1)
                    }}
                  />
                </span>
              </div>
            )}
            {read.value?.totals.projects === 0 &&
              !read.busy &&
              onCreateProject && (
                <AppButton
                  label={t('创建项目', 'Create project')}
                  icon={<Plus size={16} />}
                  onClick={() => {
                    setOpen(false)
                    onCreateProject()
                  }}
                />
              )}
            <div className="wb-task-project-actions">
              <AppButton
                label={t('完成', 'Done')}
                tone="primary"
                onClick={() => setOpen(false)}
              />
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  )
}
