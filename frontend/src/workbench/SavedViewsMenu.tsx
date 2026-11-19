import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bookmark,
  Check,
  Copy,
  Download,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { AppButton, AppDialog, AppInput } from '../components/ui'
import { AppActionMenu, type AppMenuEntry } from '../components/ui/ActionMenu'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { ApiError } from './api'
import {
  ProjectSelectionChangedError,
  ProjectSelectionUnavailableError,
} from './project-selection'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  refreshWorkbenchNavigationBlocker,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import { parseSavedViewDefinition } from './saved-view-definition'
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  newSavedViewId,
  normalizeSavedViewName,
  readSavedView,
  savedViewErrorCode,
  savedViewMutationUnknown,
  savedViewScopeKey,
  updateSavedView,
  type SavedView,
  type SavedViewDefinition,
  type SavedViewPage,
  type SavedViewScope,
} from './saved-views'
import type { Copy as Translate } from './state'
import './saved-views.css'

export type SavedViewsMenuProps = {
  scope: SavedViewScope
  current: SavedViewDefinition | null
  hasPendingQuery: boolean
  t: Translate
  onApply: (record: SavedView) => void
  onValidateApply?: (record: SavedView, signal: AbortSignal) => Promise<void>
  iconOnly?: boolean
  feedbackContainer?: HTMLElement | null
}
type Editor = {
  kind: 'create' | 'update' | 'delete'
  id: string
  name: string
  definition: SavedViewDefinition
  record?: SavedView
  baseline: string
  unknown: boolean
  conflict: boolean
  reconciled?: SavedView | 'missing'
}
type Prompt =
  | { kind: 'close' | 'navigation' }
  | { kind: 'apply'; record: SavedView }
  | { kind: 'reload'; record: SavedView }

const signature = (name: string, definition: SavedViewDefinition) =>
  JSON.stringify([name, definition])
const aborted = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

export function savedViewProblemMessage(error: unknown, t: Translate) {
  if (error instanceof ApiError) {
    if (error.status === 401) return t('会话已失效。', 'Your session expired.')
    if (error.status === 403)
      return t('没有访问保存视图的权限。', 'Saved views are forbidden.')
  }
  const code = savedViewErrorCode(error)
  if (code === 'saved_view_revision_conflict')
    return t(
      '视图版本已变更；你的草稿和原修订号已保留。',
      'The view changed. Your draft and original revision are kept.',
    )
  if (code === 'saved_view_create_superseded')
    return t(
      '此创建 ID 已有更新版本，不能当作原创建回执。',
      'This ID has a newer version and is not an original create receipt.',
    )
  if (code === 'saved_view_deleted' || code === 'saved_view_not_found')
    return t(
      '此视图当前不存在，未加载任何替代记录。',
      'This view is currently missing. No substitute was loaded.',
    )
  if (code === 'saved_view_id_conflict')
    return t(
      '此 ID 已用于不同内容，未覆盖已有视图。',
      'This ID belongs to different content. Nothing was overwritten.',
    )
  if (
    code === 'saved_view_scope_invalid' ||
    code === 'saved_view_project_unavailable'
  )
    return t(
      '视图的项目或作用域不可用。',
      'The view project or scope is unavailable.',
    )
  if (error instanceof ApiError) {
    if (error.status === 404)
      return t(
        '此后端尚未提供保存视图接口。',
        'Saved views are unavailable on this backend.',
      )
    if (error.status === 422)
      return t(
        '视图内容未通过验证；输入已保留。',
        'The view was rejected by validation. Your input is kept.',
      )
    if (error.status === 409)
      return t(
        '视图发生冲突；输入和原修订号已保留。',
        'The view conflicts with current state. Your input and original revision are kept.',
      )
  }
  return t(
    '读取或验证保存视图失败。',
    'The saved view could not be read or validated.',
  )
}
export function savedViewValidationMessage(error: unknown, t: Translate) {
  if (error instanceof ProjectSelectionUnavailableError)
    return t(
      '视图引用的项目不可用；当前查询和草稿已保留。',
      'A project referenced by the view is unavailable. Your query and drafts are kept.',
    )
  if (error instanceof ProjectSelectionChangedError)
    return t(
      '校验期间查询或草稿已变更，请重新加载视图。',
      'The query or draft changed during validation. Load the view again.',
    )
  if (error instanceof ApiError && error.status === 401)
    return t('会话已失效。', 'Your session expired.')
  if (error instanceof ApiError && error.status === 403)
    return t(
      '没有读取项目引用的权限；未加载视图。',
      'Project reference access is forbidden. The view was not loaded.',
    )
  if (error instanceof ApiError && error.status === 404)
    return t(
      '项目引用接口不可用；未加载视图。',
      'Project references are unavailable. The view was not loaded.',
    )
  return t(
    '项目引用校验失败；当前查询和草稿已保留。',
    'Project references could not be validated. Your query and drafts are kept.',
  )
}
function editorFor(
  kind: Editor['kind'],
  definition: SavedViewDefinition,
  record?: SavedView,
): Editor {
  const name = kind === 'create' ? '' : record!.name
  return {
    kind,
    id: kind === 'create' ? newSavedViewId() : record!.id,
    name,
    definition: parseSavedViewDefinition(definition),
    record,
    baseline: signature(
      name,
      kind === 'update' ? record!.definition : definition,
    ),
    unknown: false,
    conflict: false,
  }
}

export function SavedViewsMenu({
  scope,
  current,
  hasPendingQuery,
  t,
  onApply,
  onValidateApply,
  iconOnly = false,
  feedbackContainer,
}: SavedViewsMenuProps) {
  const scopeKey = savedViewScopeKey(scope)
  const [menuOpen, setMenuOpen] = useState(false)
  const [directory, setDirectory] = useState<SavedViewPage | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [validationBusy, setValidationBusy] = useState(false)
  const [selected, setSelected] = useState<SavedView | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [nameError, setNameError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [latest, setLatest] = useState<SavedView | null>(null)
  const epoch = useRef(0)
  const mounted = useRef(true)
  const operationBusy = useRef(false)
  const loadBusy = useRef(false)
  const pendingQuery = useRef(hasPendingQuery)
  pendingQuery.current = hasPendingQuery
  const listRequest = useRef<AbortController | null>(null)
  const detailRequest = useRef<AbortController | null>(null)
  const mutationRequest = useRef<AbortController | null>(null)
  const guardState = useRef({ dirty: false, busy: false })
  const formRef = useRef<HTMLFormElement>(null)
  const triggerRoot = useRef<HTMLDivElement>(null)
  const dirty = Boolean(
    editor &&
    (editor.unknown ||
      (editor.kind !== 'delete' &&
        signature(editor.name, editor.definition) !== editor.baseline)),
  )
  guardState.current = { dirty, busy: busy || validationBusy }
  const valid = (generation: number) =>
    mounted.current && epoch.current === generation
  function focusTrigger() {
    requestAnimationFrame(() =>
      triggerRoot.current?.querySelector<HTMLButtonElement>('button')?.focus(),
    )
  }
  function closeEditor(clear = true) {
    setEditorOpen(false)
    if (clear) setEditor(null)
    setError('')
    setNameError('')
    setLatest(null)
    setPrompt(null)
    focusTrigger()
  }
  function clearPrivate() {
    epoch.current++
    listRequest.current?.abort()
    detailRequest.current?.abort()
    mutationRequest.current?.abort()
    operationBusy.current = false
    loadBusy.current = false
    guardState.current = { dirty: false, busy: false }
    setMenuOpen(false)
    setDirectory(null)
    setListBusy(false)
    setListError('')
    setDetailBusy(false)
    setValidationBusy(false)
    setSelected(null)
    setEditor(null)
    setEditorOpen(false)
    setBusy(false)
    setError('')
    setNameError('')
    setFeedback('')
    setPrompt(null)
    setLatest(null)
  }
  useEffect(() => {
    mounted.current = true
    clearPrivate()
    return () => {
      mounted.current = false
      epoch.current++
      listRequest.current?.abort()
      detailRequest.current?.abort()
      mutationRequest.current?.abort()
    }
  }, [scopeKey])
  useEffect(() => {
    window.addEventListener('mybot:unauthorized', clearPrivate)
    return () => window.removeEventListener('mybot:unauthorized', clearPrivate)
  }, [])
  useEffect(() => {
    if (!editor && !validationBusy) return
    const release = registerWorkbenchNavigationBlocker({
      getState: () => guardState.current,
      onBlocked: () => setPrompt({ kind: 'navigation' }),
      onReset: () =>
        setPrompt((value) => (value?.kind === 'navigation' ? null : value)),
    })
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!guardState.current.dirty && !guardState.current.busy) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      release()
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [Boolean(editor), validationBusy])
  useEffect(
    () => refreshWorkbenchNavigationBlocker(),
    [busy, dirty, validationBusy],
  )

  async function loadDirectory(more = false, force = false) {
    if ((listBusy && !force) || (more && !directory?.has_more)) return
    listRequest.current?.abort()
    const request = new AbortController()
    listRequest.current = request
    const generation = epoch.current
    const previous = directory
    setListBusy(true)
    setListError('')
    try {
      const page = await listSavedViews(scope, {
        offset: more ? previous!.items.length : 0,
        limit: 20,
        signal: request.signal,
      })
      if (!valid(generation) || request.signal.aborted) return
      if (more && previous) {
        const items = [...previous.items, ...page.items]
        if (
          new Set(items.map((item) => item.id)).size !== items.length ||
          items.length > page.total
        )
          throw new Error('saved_view_directory_changed')
        setDirectory({ ...page, offset: 0, items })
      } else setDirectory(page)
    } catch (caught) {
      if (valid(generation) && !aborted(caught))
        setListError(savedViewProblemMessage(caught, t))
    } finally {
      if (valid(generation) && listRequest.current === request)
        setListBusy(false)
    }
  }
  function apply(record: SavedView) {
    try {
      // Applying is a synchronous URL/preferences commit, not an API mutation.
      guardState.current = { dirty: false, busy: false }
      onApply(record)
      setSelected(record)
      setFeedback(t('已加载视图快照。', 'View snapshot loaded.'))
      setPrompt(null)
      focusTrigger()
    } catch {
      setError(t('视图应用尚未确认。', 'View application was not confirmed.'))
    }
  }
  async function chooseRecord(
    source: string | SavedView,
    replaceDraft = false,
  ) {
    if (operationBusy.current || loadBusy.current || editor?.unknown) return
    detailRequest.current?.abort()
    const request = new AbortController()
    detailRequest.current = request
    const generation = epoch.current
    loadBusy.current = true
    guardState.current = { dirty, busy }
    setDetailBusy(true)
    setValidationBusy(false)
    setError('')
    setFeedback('')
    let validation = false
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      request.abort()
    }, 15_000)
    try {
      const record =
        typeof source === 'string'
          ? await readSavedView(source, scope, request.signal)
          : source
      if (!valid(generation) || request.signal.aborted) return
      if (!replaceDraft && pendingQuery.current)
        setPrompt({ kind: 'apply', record })
      else {
        if (onValidateApply) {
          validation = true
          guardState.current = { dirty, busy: true }
          setValidationBusy(true)
          setPrompt(null)
          await onValidateApply(record, request.signal)
          if (!valid(generation) || request.signal.aborted) return
        }
        apply(record)
      }
    } catch (caught) {
      if (valid(generation) && (timedOut || !aborted(caught)))
        setError(
          timedOut
            ? t(
                '读取或校验视图超时；当前查询和草稿已保留。',
                'Loading or validating the view timed out. Your query and drafts are kept.',
              )
            : validation
              ? savedViewValidationMessage(caught, t)
              : savedViewProblemMessage(caught, t),
        )
    } finally {
      clearTimeout(timer)
      if (valid(generation) && detailRequest.current === request) {
        if (validation) cancelWorkbenchNavigation()
        loadBusy.current = false
        guardState.current = { ...guardState.current, busy: false }
        setDetailBusy(false)
        setValidationBusy(false)
      }
    }
  }
  function openEditor(kind: Editor['kind']) {
    if (operationBusy.current || loadBusy.current || editor?.unknown) return
    if (
      (kind !== 'delete' && (!current || hasPendingQuery)) ||
      (kind !== 'create' && !selected)
    )
      return
    const next = editorFor(
      kind,
      kind === 'delete' ? selected!.definition : current!,
      kind === 'create' ? undefined : selected!,
    )
    setEditor(next)
    setEditorOpen(true)
    setMenuOpen(false)
    setError('')
    setNameError('')
    setLatest(null)
    setFeedback('')
  }
  function saveAsDraft() {
    if (!editor || editor.unknown || operationBusy.current) return
    const next = editorFor('create', editor.definition)
    next.name = `${[...editor.name].slice(0, 90).join('')}${t(' 副本', ' copy')}`
    setEditor(next)
    setLatest(null)
    setError('')
    setNameError('')
  }
  function requestClose() {
    if (operationBusy.current) return
    if (editor?.unknown) closeEditor(false)
    else if (dirty) setPrompt({ kind: 'close' })
    else closeEditor()
  }
  async function submit() {
    if (!editor || editor.unknown || editor.conflict || operationBusy.current)
      return
    if (editor.kind !== 'delete') {
      try {
        normalizeSavedViewName(editor.name)
      } catch {
        setNameError(
          t('名称需为 1-100 个字符。', 'Use 1-100 characters for the name.'),
        )
        formRef.current?.querySelector<HTMLInputElement>('input')?.focus()
        return
      }
    }
    const candidate = editor
    const generation = epoch.current
    const request = new AbortController()
    mutationRequest.current = request
    operationBusy.current = true
    guardState.current = { dirty, busy: true }
    setBusy(true)
    setError('')
    setNameError('')
    const timer = setTimeout(() => request.abort(), 15_000)
    try {
      if (candidate.kind === 'delete') {
        await deleteSavedView(candidate.record!, request.signal)
        if (!valid(generation)) return
        setSelected(null)
        setFeedback(t('视图已删除。', 'View deleted.'))
      } else {
        const record =
          candidate.kind === 'create'
            ? await createSavedView(
                {
                  id: candidate.id,
                  name: candidate.name,
                  definition: candidate.definition,
                  scope,
                },
                request.signal,
              )
            : await updateSavedView(
                candidate.record!,
                {
                  name: candidate.name,
                  definition: candidate.definition,
                },
                request.signal,
              )
        if (!valid(generation)) return
        setSelected(record)
        setFeedback(t('视图已保存。', 'View saved.'))
      }
      guardState.current = { dirty: false, busy: false }
      confirmWorkbenchNavigation()
      closeEditor()
      void loadDirectory(false, true)
    } catch (caught) {
      if (!valid(generation)) return
      const unknown = savedViewMutationUnknown(caught)
      setEditor(
        (value) =>
          value && {
            ...value,
            unknown,
            conflict: caught instanceof ApiError && caught.status === 409,
          },
      )
      setError(
        unknown
          ? t(
              '变更结果未知，未自动重试。请读取原 ID 的当前资源状态。',
              'The change outcome is unknown. Nothing was retried. Read the original ID for current resource state.',
            )
          : savedViewProblemMessage(caught, t),
      )
      if (caught instanceof ApiError && caught.fieldErrors.name)
        setNameError(caught.fieldErrors.name)
    } finally {
      clearTimeout(timer)
      if (valid(generation)) {
        operationBusy.current = false
        guardState.current = { ...guardState.current, busy: false }
        setBusy(false)
      }
    }
  }
  async function readCurrent() {
    if (!editor || operationBusy.current || detailBusy) return
    const candidate = editor
    const request = new AbortController()
    detailRequest.current?.abort()
    detailRequest.current = request
    const generation = epoch.current
    setDetailBusy(true)
    try {
      const record = await readSavedView(candidate.id, scope, request.signal)
      if (!valid(generation) || request.signal.aborted) return
      if (candidate.unknown) {
        setEditor((value) => value && { ...value, reconciled: record })
      } else setLatest(record)
    } catch (caught) {
      if (!valid(generation) || aborted(caught)) return
      if (
        candidate.unknown &&
        caught instanceof ApiError &&
        caught.status === 404 &&
        savedViewErrorCode(caught) === 'saved_view_not_found'
      )
        setEditor((value) => value && { ...value, reconciled: 'missing' })
      else setError(savedViewProblemMessage(caught, t))
    } finally {
      if (valid(generation) && detailRequest.current === request)
        setDetailBusy(false)
    }
  }
  const unavailableReason = editor?.unknown
    ? t('先核对未确认的变更。', 'Review the unresolved change first.')
    : hasPendingQuery
      ? t('请先应用查询草稿。', 'Apply the query draft first.')
      : !current
        ? t(
            '仅能保存有效的任务列表查询。',
            'Only a valid task-list query can be saved.',
          )
        : listError || !directory
          ? t(
              '请先读取可用的视图目录。',
              'Read an available view directory first.',
            )
          : undefined
  const saveDisabled = Boolean(unavailableReason || busy || detailBusy)
  const items: AppMenuEntry[] = [
    {
      id: 'create',
      label: t('保存当前视图', 'Save current view'),
      icon: <Save size={16} />,
      description: unavailableReason,
      disabled: saveDisabled,
      onSelect: () => openEditor('create'),
    },
    {
      id: 'update',
      label: t('更新所选视图', 'Update selected view'),
      icon: <RefreshCw size={16} />,
      description:
        unavailableReason ??
        (!selected
          ? t('先加载一个保存的视图。', 'Load a saved view first.')
          : selected.name),
      disabled: saveDisabled || !selected,
      onSelect: () => openEditor('update'),
    },
    {
      id: 'save-as',
      label: t('另存为', 'Save as new view'),
      icon: <Copy size={16} />,
      description: unavailableReason,
      disabled: saveDisabled,
      onSelect: () => openEditor('create'),
    },
    {
      id: 'delete',
      label: t('删除所选视图', 'Delete selected view'),
      icon: <Trash2 size={16} />,
      destructive: true,
      description: !selected
        ? t('先加载一个保存的视图。', 'Load a saved view first.')
        : selected.name,
      disabled: !selected || busy || detailBusy || Boolean(editor?.unknown),
      onSelect: () => openEditor('delete'),
    },
    { type: 'divider' },
    {
      type: 'section',
      id: 'records',
      title: t('保存的视图', 'Saved views'),
      items: (directory?.items ?? []).map((record) => ({
        id: record.id,
        label: record.name,
        icon:
          record.id === selected?.id ? (
            <Check size={16} />
          ) : (
            <Bookmark size={16} />
          ),
        disabled: busy || detailBusy || Boolean(editor?.unknown),
        onSelect: () => {
          void chooseRecord(record.id)
        },
      })),
    },
    { type: 'divider' },
    {
      id: 'refresh',
      label: t('刷新目录', 'Refresh views'),
      icon: <RefreshCw size={16} />,
      disabled: listBusy || busy,
      keepOpen: true,
      onSelect: () => {
        void loadDirectory(false, true)
      },
    },
  ]
  if (editor?.unknown)
    items.unshift({
      id: 'unresolved',
      label: t('核对未确认变更', 'Review unresolved change'),
      icon: <RefreshCw size={16} />,
      onSelect: () => {
        setEditorOpen(true)
        setMenuOpen(false)
      },
    })
  const feedbackContent = (
    <>
      {!editorOpen && error && (
        <span className="sv-feedback" role="alert">
          {error}
        </span>
      )}
      {!menuOpen && detailBusy && (
        <span className="sv-feedback" role="status">
          {validationBusy
            ? t('正在校验视图引用…', 'Validating view references...')
            : t('正在读取视图快照…', 'Loading view snapshot...')}
        </span>
      )}
      {feedback && (
        <span className="sv-feedback" role="status">
          {feedback}
        </span>
      )}
    </>
  )
  return (
    <div className="sv-control" ref={triggerRoot}>
      <AppActionMenu
        label={t('视图', 'Views')}
        icon={<Bookmark size={16} />}
        iconOnly={iconOnly}
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open)
          if (open && !directory && !listError && !listBusy)
            void loadDirectory()
        }}
        items={items}
        header={
          <div className="sv-menu-meta">
            {listBusy && (
              <span role="status">
                {t('正在读取视图…', 'Loading views...')}
              </span>
            )}
            {detailBusy && (
              <span role="status">
                {validationBusy
                  ? t('正在校验视图引用…', 'Validating view references...')
                  : t('正在读取视图快照…', 'Loading view snapshot...')}
              </span>
            )}
            {listError && <span role="alert">{listError}</span>}
            {!listBusy && !listError && directory?.items.length === 0 && (
              <span>
                {t('此作用域没有保存的视图。', 'No saved views in this scope.')}
              </span>
            )}
            {directory && (
              <span>
                {listError
                  ? t('上次读取', 'Previously loaded')
                  : t('已显示', 'Showing')}{' '}
                {directory.items.length} / {directory.total}
              </span>
            )}
          </div>
        }
        footer={
          directory?.has_more ? (
            <div className="sv-menu-meta">
              <AppButton
                label={t('加载更多视图', 'Load more views')}
                icon={<Download size={15} />}
                busy={listBusy}
                onClick={() => {
                  void loadDirectory(true)
                }}
              />
            </div>
          ) : undefined
        }
      />
      {feedbackContainer
        ? createPortal(feedbackContent, feedbackContainer)
        : feedbackContent}
      {editor && editorOpen && (
        <AppDialog
          title={
            editor.kind === 'delete'
              ? t('删除保存的视图', 'Delete saved view')
              : editor.kind === 'update'
                ? t('更新保存的视图', 'Update saved view')
                : t('保存视图', 'Save view')
          }
          closeLabel={t('关闭', 'Close')}
          onClose={requestClose}
          busy={busy}
        >
          <form
            className="wb-form sv-form"
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            {editor.kind === 'delete' ? (
              <p>{editor.name}</p>
            ) : (
              <AppInput
                label={t('视图名称', 'View name')}
                value={editor.name}
                onChange={(name) => {
                  setEditor((value) => value && { ...value, name })
                  setNameError('')
                }}
                isDisabled={busy || editor.unknown}
                maxLength={100}
                status={
                  nameError ? { type: 'error', message: nameError } : undefined
                }
                isRequired
              />
            )}
            <dl className="sv-summary">
              <dt>{t('作用域', 'Scope')}</dt>
              <dd>
                {scope.scope_type === 'workspace'
                  ? t('单用户工作区', 'Single-user workspace')
                  : scope.project_id}
              </dd>
              {editor.record && (
                <>
                  <dt>{t('修订号', 'Revision')}</dt>
                  <dd>{editor.record.revision}</dd>
                </>
              )}
              <dt>{t('文本查询', 'Text query')}</dt>
              <dd>{editor.definition.query.text || '-'}</dd>
              <dt>{t('项目 / 状态', 'Projects / states')}</dt>
              <dd>
                {editor.definition.query.projects.length} /{' '}
                {editor.definition.query.states.length}
              </dd>
            </dl>
            {error && (
              <p className="wb-error" role="alert">
                {error}
              </p>
            )}
            {editor.conflict && (
              <div className="sv-resolution">
                <AppButton
                  label={t('读取最新版本', 'Read latest version')}
                  icon={<RefreshCw size={15} />}
                  busy={detailBusy}
                  onClick={() => {
                    void readCurrent()
                  }}
                />
                {editor.kind !== 'delete' && (
                  <AppButton
                    label={t('另存为新视图', 'Save draft as new view')}
                    icon={<Copy size={15} />}
                    onClick={saveAsDraft}
                  />
                )}
                {latest && (
                  <>
                    <p>
                      {t('当前资源修订号', 'Current resource revision')}:{' '}
                      {latest.revision}
                    </p>
                    <AppButton
                      label={t(
                        '用最新版本替换草稿',
                        'Replace draft with latest',
                      )}
                      onClick={() =>
                        setPrompt({ kind: 'reload', record: latest })
                      }
                    />
                  </>
                )}
              </div>
            )}
            {editor.unknown && (
              <div className="sv-resolution">
                <AppButton
                  label={t('读取当前资源', 'Read current resource')}
                  icon={<RefreshCw size={15} />}
                  busy={detailBusy}
                  onClick={() => {
                    void readCurrent()
                  }}
                />
                {editor.reconciled && (
                  <>
                    <p role="status">
                      {editor.reconciled === 'missing'
                        ? t(
                            '此 ID 当前不存在；这不是原请求结果的精确回执。',
                            'This ID is currently missing. This is not an exact receipt for the original request.',
                          )
                        : `${editor.reconciled.name} · ${t('当前修订号', 'Current revision')} ${editor.reconciled.revision}. ${t('这是当前资源状态，不是原请求精确回执。', 'This is current resource state, not an exact receipt for the original request.')}`}
                    </p>
                    <AppButton
                      label={t('确认当前状态', 'Acknowledge current state')}
                      onClick={() => {
                        setSelected(
                          editor.reconciled === 'missing'
                            ? null
                            : editor.reconciled!,
                        )
                        setFeedback(
                          t(
                            '已确认当前资源状态；原请求结果未被独立证明。',
                            'Current resource state acknowledged; the original request outcome was not independently verified.',
                          ),
                        )
                        guardState.current = { dirty: false, busy: false }
                        closeEditor()
                        void loadDirectory()
                      }}
                    />
                  </>
                )}
              </div>
            )}
            <div className="wb-form-actions">
              <AppButton
                label={t('取消', 'Cancel')}
                disabled={busy}
                onClick={requestClose}
              />
              <AppButton
                label={
                  editor.kind === 'delete'
                    ? t('删除视图', 'Delete view')
                    : t('保存视图', 'Save view')
                }
                icon={
                  editor.kind === 'delete' ? (
                    <Trash2 size={16} />
                  ) : (
                    <Save size={16} />
                  )
                }
                tone={editor.kind === 'delete' ? 'destructive' : 'primary'}
                type="submit"
                busy={busy}
                disabled={editor.unknown || editor.conflict}
              />
            </div>
          </form>
        </AppDialog>
      )}
      {prompt && (
        <AppDraftGuard
          title={
            prompt.kind === 'apply'
              ? t('替换查询草稿？', 'Replace query draft?')
              : prompt.kind === 'reload'
                ? t('替换视图编辑草稿？', 'Replace view draft?')
                : t('放弃视图更改？', 'Discard view changes?')
          }
          description={
            prompt.kind === 'apply'
              ? t(
                  '未提交的 Basic/JQL 草稿将被已读取的视图快照替换。',
                  'The unsubmitted Basic/JQL draft will be replaced by the loaded view snapshot.',
                )
              : prompt.kind === 'reload'
                ? t(
                    '编辑中的名称、快照和修订号将替换为已读取的最新资源。',
                    'The draft name, snapshot and revision will be replaced by the latest resource you read.',
                  )
                : editor?.unknown
                  ? t(
                      '变更结果仍未知；离开不代表撤销或证明原请求结果。',
                      'The change outcome is still unknown. Leaving neither undoes nor proves the original request.',
                    )
                  : t(
                      '尚未保存的视图更改将被放弃。',
                      'Unsaved view changes will be discarded.',
                    )
          }
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={
            prompt.kind === 'apply'
              ? t('加载视图', 'Load view')
              : prompt.kind === 'reload'
                ? t('替换草稿', 'Replace draft')
                : t('放弃更改', 'Discard changes')
          }
          onKeep={() => {
            if (prompt.kind === 'navigation') cancelWorkbenchNavigation()
            setPrompt(null)
          }}
          onDiscard={() => {
            if (prompt.kind === 'apply') void chooseRecord(prompt.record, true)
            else if (prompt.kind === 'reload' && editor) {
              const next = editorFor(
                editor.kind,
                prompt.record.definition,
                prompt.record,
              )
              setEditor(next)
              setError('')
              setNameError('')
              setLatest(null)
              setPrompt(null)
            } else {
              guardState.current = { dirty: false, busy: false }
              if (prompt.kind === 'navigation') confirmWorkbenchNavigation()
              closeEditor()
            }
          }}
        />
      )}
    </div>
  )
}
