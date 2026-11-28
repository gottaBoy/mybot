import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  FileSearch,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import {
  AppButton,
  AppCheckbox,
  AppDialog,
  AppInput,
  AppTextArea,
} from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import { ApiError, type Task } from './api'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  pushWorkbenchNavigation,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import {
  createTaskPlan,
  fetchPlanOperation,
  parsePlanDefinition,
  previewTaskPlan,
  type PlanDefinition,
  type AnyPlanPreview,
  type AnyPlanReceipt,
} from './task-plans'
import {
  previewPlanRevision,
  publishPlanRevision,
  type PlanRevisionPreview,
  type PlanVersion,
} from './task-plan-revisions'
import type {
  NestedCreatePreview,
  NestedRevisionPreview,
} from './task-plan-nesting'
import type { Copy } from './state'
import { taskWorkspaceHref } from './task-workspace-location'
import './task-plans.css'

const blank = (key: string) => ({
  key,
  title: '',
  goal: '',
  acceptance: '',
  files: [],
  depends_on: [],
})
export function TaskPlanEditor({
  task: initialTask,
  initial,
  initialDefinition,
  suggestionSource,
  enabled,
  baseline: initialBaseline,
  revisionsEnabled = false,
  currentPlanHash,
  nestedEnabled = false,
  currentScopeHash,
  t,
  onClose,
  onCreated,
}: {
  task: Task
  initial?: string
  initialDefinition?: PlanDefinition
  suggestionSource?: {
    artifact_id: string
    run_id: string
    candidate_hash: string
  }
  enabled: boolean
  baseline?: PlanVersion
  revisionsEnabled?: boolean
  currentPlanHash?: string
  nestedEnabled?: boolean
  currentScopeHash?: string
  t: Copy
  onClose: () => void
  onCreated: (receipt: AnyPlanReceipt) => void
}) {
  const task = useRef(initialTask).current
  const baseline = useRef(initialBaseline).current
  const [definition, setDefinition] = useState<PlanDefinition>(() =>
    initialDefinition
      ? structuredClone(initialDefinition)
      : baseline
      ? structuredClone(baseline.definition)
      : { items: [blank('step1'), blank('step2')] },
  )
  const [draftSource, setDraftSource] = useState(suggestionSource)
  const [preview, setPreview] = useState<AnyPlanPreview>()
  const [pending, setPending] = useState(initial)
  const [phase, setPhase] = useState<
    'edit' | 'preview' | 'sending' | 'unknown'
  >(initial ? 'unknown' : 'edit')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [discard, setDiscard] = useState(false)
  const sequence = useRef(3),
    mounted = useRef(true),
    operation = useRef(false),
    internal = useRef(false),
    released = useRef(false)
  const request = useRef<AbortController | undefined>(undefined)
  const initialDraft = useRef(JSON.stringify(definition))
  const previewScope = useRef(currentScopeHash)
  const stale = Boolean(
    baseline && currentPlanHash && baseline.plan_hash !== currentPlanHash,
  )
  const allowed =
    enabled &&
    (!baseline || revisionsEnabled) &&
    !stale &&
    (!(
      preview &&
      'schema_version' in preview &&
      preview.schema_version === 3
    ) ||
      nestedEnabled)
  const latest = useRef({
    definition,
    preview,
    pending,
    phase,
    consent,
    allowed,
    currentScopeHash,
    nestedEnabled,
  })
  latest.current = {
    definition,
    preview,
    pending,
    phase,
    consent,
    allowed,
    currentScopeHash,
    nestedEnabled,
  }
  const dirty =
    JSON.stringify(definition) !== initialDraft.current || Boolean(preview)
  const busy = phase === 'sending' || phase === 'unknown'
  const guard = useRef({ dirty, busy })
  guard.current = { dirty, busy }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current?.abort()
    }
  }, [])
  useEffect(() => {
    const unregister = registerWorkbenchNavigationBlocker({
      getState: () =>
        internal.current || released.current
          ? { dirty: false, busy: false }
          : guard.current,
      onBlocked: () => {
        if (!guard.current.busy) setDiscard(true)
      },
      onReset: () => setDiscard(false),
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!released.current && (guard.current.dirty || guard.current.busy)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      unregister()
      window.removeEventListener('beforeunload', unload)
    }
  }, [])
  useEffect(() => {
    if (initial) void reconcile()
  }, [])
  useEffect(() => {
    if (!allowed) setConsent(false)
  }, [allowed])
  useEffect(() => {
    if (preview && currentScopeHash !== previewScope.current && !pending) {
      setPreview(undefined)
      setConsent(false)
      setPhase('edit')
      setError(
        t(
          '任务树条件已变化，编辑已保留，请重新核对。',
          'Task tree conditions changed. Edits are retained; review again.',
        ),
      )
    }
  }, [currentScopeHash, preview, pending])
  function stamp(id?: string) {
    const url = new URL(window.location.href),
      params = new URLSearchParams(url.hash.split('?')[1] ?? '')
    params.delete('taskPlanRequest')
    if (id) params.set('taskPlanRequest', id)
    internal.current = true
    try {
      return pushWorkbenchNavigation(
        `#task/${encodeURIComponent(task.id)}${params.size ? `?${params}` : ''}`,
        { replace: true },
      )
    } finally {
      internal.current = false
    }
  }
  function edit(next: PlanDefinition) {
    if (operation.current || latest.current.pending) return
    setDefinition(next)
    setDraftSource(undefined)
    setPreview(undefined)
    setConsent(false)
    setError('')
    setPhase('edit')
  }
  function complete(receipt: AnyPlanReceipt) {
    cancelWorkbenchNavigation()
    if (!stamp()) throw new Error('task_plan_navigation_unconfirmed')
    released.current = true
    setPending(undefined)
    onCreated(receipt)
  }
  async function inspect() {
    if (operation.current || latest.current.pending || !latest.current.allowed)
      return
    let admitted: PlanDefinition
    try {
      admitted = parsePlanDefinition(latest.current.definition)
    } catch {
      setError(
        t(
          '请填写2至8个任务的目标和验收要求；前置依赖不能循环。',
          'Provide goals and acceptance for 2 to 8 tasks. Dependencies must be acyclic.',
        ),
      )
      return
    }
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    const sentScope = latest.current.currentScopeHash
    try {
      const result = baseline
        ? await previewPlanRevision(
            task,
            baseline,
            admitted,
            controller.signal,
            latest.current.nestedEnabled,
          )
        : await previewTaskPlan(
            task,
            admitted,
            controller.signal,
            latest.current.nestedEnabled,
          )
      if (!mounted.current || controller.signal.aborted) return
      if (
        sentScope !== latest.current.currentScopeHash ||
        !latest.current.allowed
      ) {
        setPhase('edit')
        setConsent(false)
        setPreview(undefined)
        return
      }
      previewScope.current = sentScope
      setPreview(result)
      setPhase('preview')
    } catch (reason) {
      if (!mounted.current) return
      setPhase('edit')
      setPreview(undefined)
      const code =
        reason instanceof ApiError &&
        reason.details &&
        typeof reason.details === 'object'
          ? (reason.details as { code?: unknown }).code
          : undefined
      setError(
        code === 'task_plan_revision_unchanged'
          ? t(
              '当前计划没有变化。请编辑后再核对修订。',
              'The plan is unchanged. Edit it before reviewing a revision.',
            )
          : code === 'task_plan_revision_conflict'
            ? t(
                '当前计划已变化，编辑已保留。请明确放弃编辑后从最新版本重开。',
                'The current plan changed. Edits are retained. Explicitly discard them before reopening the latest version.',
              )
            : code === 'task_plan_version_limit'
              ? t(
                  '该计划已达到100个版本的上限。',
                  'This plan has reached the limit of 100 versions.',
                )
              : code === 'task_plan_depth_limit'
                ? t(
                    '已达到两层子任务的深度上限。',
                    'The two-level subtask depth limit has been reached.',
                  )
                : code === 'task_plan_tree_limit'
                  ? t(
                      '当前任务树将超过73个任务的上限。',
                      'The current tree would exceed 73 tasks.',
                    )
                  : t(
                      '拆解候选未核对成功。请检查父任务资料、文件范围或已保存计划。',
                      'The breakdown could not be verified. Check the parent context, file scope or existing plan.',
                    ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function save() {
    const state = latest.current
    if (
      operation.current ||
      state.pending ||
      !state.preview ||
      !state.consent ||
      !state.allowed ||
      (state.preview &&
        'schema_version' in state.preview &&
        state.preview.schema_version === 3 &&
        !state.nestedEnabled) ||
      state.currentScopeHash !== previewScope.current ||
      ('schema_version' in state.preview &&
        state.preview.impact.blockers.length > 0)
    )
      return
    const id = crypto.randomUUID()
    if (!stamp(id)) return
    operation.current = true
    setPending(id)
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    try {
      const receipt =
        'expected_version' in state.preview
          ? await publishPlanRevision(
              task,
              id,
              state.preview,
              controller.signal,
              state.nestedEnabled,
            )
          : await createTaskPlan(
              task,
              id,
              state.preview,
              controller.signal,
              state.nestedEnabled,
            )
      if (!mounted.current || controller.signal.aborted) return
      complete(receipt)
    } catch (reason) {
      if (!mounted.current) return
      if (
        reason instanceof ApiError &&
        [400, 403, 404, 409, 422].includes(reason.status) &&
        stamp()
      ) {
        setPending(undefined)
        setPhase('edit')
        setPreview(undefined)
        setError(
          t(
            '保存未应用，编辑已保留。请重新核对；不会覆盖已有计划。',
            'The save was not applied. Edits are kept. Review again; an existing plan will not be overwritten.',
          ),
        )
      } else {
        setPhase('unknown')
        setError(
          t(
            '创建结果未知，请保留原请求核对，不要重复创建。',
            'Creation outcome is unknown. Keep and check the original request; do not repeat creation.',
          ),
        )
      }
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  async function reconcile() {
    const state = latest.current
    if (operation.current || !state.pending) return
    operation.current = true
    setPhase('sending')
    setError('')
    setConsent(false)
    const controller = new AbortController()
    request.current = controller
    try {
      const receipt = await fetchPlanOperation(
        task.id,
        state.pending,
        controller.signal,
        state.preview,
      )
      if (!mounted.current || controller.signal.aborted) return
      complete(receipt)
    } catch (reason) {
      if (!mounted.current) return
      setPhase('unknown')
      if (reason instanceof ApiError && [401, 403].includes(reason.status))
        setPreview(undefined)
      setError(
        t(
          '原请求仍待核对。404不能证明在途创建已结束，不会自动重发。',
          'The original request is unresolved. A 404 does not prove creation ended; it will not be resent.',
        ),
      )
    } finally {
      if (mounted.current) operation.current = false
    }
  }
  function close() {
    if (guard.current.busy) return
    if (!guard.current.dirty) {
      released.current = true
      onClose()
    } else setDiscard(true)
  }
  return (
    <>
      <AppDialog
        title={
          baseline
            ? t('修订任务计划', 'Revise task plan')
            : t('拆分任务', 'Break down task')
        }
        closeLabel={t('关闭', 'Close')}
        busy={busy}
        onClose={close}
      >
        <div
          className="wb-form wb-task-plan-editor"
          data-testid="task-plan-editor"
        >
          <strong>{task.title}</strong>
          {baseline && (
            <p className="wb-muted wb-wrap">
              {t('修订基线', 'Revision baseline')} · v{baseline.version}
              {' · '}
              <code>{baseline.plan_hash}</code>
            </p>
          )}
          {draftSource && (
            <div className="wb-notice">
              {t(
                '已从模型建议复制到本地草稿；编辑后将按人工计划重新核对。',
                'Copied from a model suggestion into this local draft. Editing requires a fresh plan review.',
              )}{' '}
              <code>{draftSource.artifact_id}</code>
            </div>
          )}
          {stale && (
            <p role="alert" className="wb-error">
              {t(
                '当前计划已变化，编辑仍保留。关闭并明确放弃编辑后，才能从最新版本重新修订。',
                'The current plan changed. Edits are retained. Close and explicitly discard them before starting from the latest version.',
              )}
            </p>
          )}
          {baseline && !revisionsEnabled && (
            <p role="alert" className="wb-error">
              {t(
                '服务未提供计划修订能力。',
                'This server does not provide plan revisions.',
              )}
            </p>
          )}
          {error && (
            <p role="alert" className="wb-error">
              {error}
            </p>
          )}
          {pending ? (
            <div className="wb-plan-receipt">
              <code>{pending}</code>
              <AppButton
                label={t('核对原创建请求', 'Check original creation request')}
                icon={<RefreshCw size={16} />}
                disabled={phase === 'sending'}
                onClick={() => void reconcile()}
              />
            </div>
          ) : (
            <>
              {definition.items.map((item, index) => (
                <section
                  key={item.key}
                  className="wb-plan-edit-item"
                  aria-label={`${t('子任务', 'Subtask')} ${index + 1}`}
                >
                  <div className="wb-task-plan-heading">
                    <strong>
                      {t('子任务', 'Subtask')} {index + 1}
                    </strong>
                    <code>{item.key}</code>
                    <div className="wb-inline">
                      <AppButton
                        label={t('上移子任务', 'Move subtask earlier')}
                        icon={<ArrowUp size={15} />}
                        iconOnly
                        tone="ghost"
                        disabled={busy || index === 0}
                        onClick={() => {
                          const items = [...definition.items]
                          ;[items[index - 1], items[index]] = [
                            items[index],
                            items[index - 1],
                          ]
                          edit({ items })
                        }}
                      />
                      <AppButton
                        label={t('下移子任务', 'Move subtask later')}
                        icon={<ArrowDown size={15} />}
                        iconOnly
                        tone="ghost"
                        disabled={busy || index === definition.items.length - 1}
                        onClick={() => {
                          const items = [...definition.items]
                          ;[items[index], items[index + 1]] = [
                            items[index + 1],
                            items[index],
                          ]
                          edit({ items })
                        }}
                      />
                      <AppButton
                        label={t('移除子任务', 'Remove subtask')}
                        icon={<Trash2 size={15} />}
                        iconOnly
                        tone="ghost"
                        disabled={
                          busy ||
                          definition.items.length <= 2 ||
                          definition.items.some((other) =>
                            other.depends_on.includes(item.key),
                          )
                        }
                        onClick={() =>
                          edit({
                            items: definition.items.filter(
                              (other) => other.key !== item.key,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  <AppInput
                    label={t('任务名称', 'Task title')}
                    value={item.title}
                    isDisabled={busy}
                    onChange={(title) =>
                      edit({
                        items: definition.items.map((other) =>
                          other.key === item.key ? { ...other, title } : other,
                        ),
                      })
                    }
                  />
                  <AppTextArea
                    label={t('任务目标', 'Task goal')}
                    value={item.goal}
                    rows={3}
                    isDisabled={busy}
                    onChange={(goal) =>
                      edit({
                        items: definition.items.map((other) =>
                          other.key === item.key ? { ...other, goal } : other,
                        ),
                      })
                    }
                  />
                  <AppTextArea
                    label={t('验收要求', 'Acceptance')}
                    value={item.acceptance}
                    rows={2}
                    isDisabled={busy}
                    onChange={(acceptance) =>
                      edit({
                        items: definition.items.map((other) =>
                          other.key === item.key
                            ? { ...other, acceptance }
                            : other,
                        ),
                      })
                    }
                  />
                  <fieldset className="wb-plan-files">
                    <legend>{t('显式资料', 'Explicit files')}</legend>
                    {task.files.map((file) => (
                      <AppCheckbox
                        key={file}
                        label={file}
                        value={item.files.includes(file)}
                        isDisabled={busy}
                        onChange={(selected) =>
                          edit({
                            items: definition.items.map((other) =>
                              other.key === item.key
                                ? {
                                    ...other,
                                    files: selected
                                      ? [...other.files, file]
                                      : other.files.filter(
                                          (path) => path !== file,
                                        ),
                                  }
                                : other,
                            ),
                          })
                        }
                      />
                    ))}
                  </fieldset>
                  <fieldset className="wb-plan-files">
                    <legend>{t('前置任务', 'Prerequisites')}</legend>
                    {definition.items
                      .filter((other) => other.key !== item.key)
                      .map((other) => (
                        <AppCheckbox
                          key={other.key}
                          label={
                            other.title ||
                            `${t('子任务', 'Subtask')} ${definition.items.indexOf(other) + 1}`
                          }
                          value={item.depends_on.includes(other.key)}
                          isDisabled={busy}
                          onChange={(selected) =>
                            edit({
                              items: definition.items.map((entry) =>
                                entry.key === item.key
                                  ? {
                                      ...entry,
                                      depends_on: selected
                                        ? [...entry.depends_on, other.key]
                                        : entry.depends_on.filter(
                                            (key) => key !== other.key,
                                          ),
                                    }
                                  : entry,
                              ),
                            })
                          }
                        />
                      ))}
                  </fieldset>
                </section>
              ))}
              <div className="wb-task-plan-heading">
                <AppButton
                  label={t('增加子任务', 'Add subtask')}
                  icon={<Plus size={16} />}
                  disabled={busy || definition.items.length >= 8}
                  onClick={() => {
                    let key: string
                    do {
                      key = `step${sequence.current++}`
                    } while (definition.items.some((item) => item.key === key))
                    edit({
                      items: [...definition.items, blank(key)],
                    })
                  }}
                />
                <AppButton
                  label={
                    baseline
                      ? t('核对计划修订', 'Review plan revision')
                      : t('核对任务拆解', 'Review task breakdown')
                  }
                  icon={<FileSearch size={16} />}
                  disabled={busy || !allowed}
                  onClick={() => void inspect()}
                />
              </div>
              {preview && (
                <>
                  <section
                    className="wb-plan-confirm"
                    aria-label={t('已核对拆解', 'Verified breakdown')}
                  >
                    <strong>
                      {baseline
                        ? t('修订后的计划', 'Revised plan')
                        : t('将创建的任务', 'Tasks to create')}{' '}
                      · {preview.definition.items.length}
                    </strong>
                    {preview.definition.items.map((item) => (
                      <p key={item.key}>
                        {item.title} · {t('前置', 'After')}{' '}
                        {item.depends_on.length
                          ? item.depends_on
                              .map(
                                (key) =>
                                  preview.definition.items.find(
                                    (other) => other.key === key,
                                  )!.title,
                              )
                              .join(' · ')
                          : t('无', 'None')}
                      </p>
                    ))}
                    <code className="wb-wrap">{preview.preview_hash}</code>
                  </section>
                  {'expected_version' in preview && (
                    <PlanRevisionImpact preview={preview} t={t} />
                  )}
                  {'schema_version' in preview &&
                    preview.schema_version === 3 &&
                    !('expected_version' in preview) && (
                      <NestedCreationImpact preview={preview} t={t} />
                    )}
                  <AppCheckbox
                    label={
                      baseline
                        ? t(
                            '确认发布上述修订及影响，保留旧任务与运行记录，不启动模型。',
                            'Confirm publishing this revision and its impact, preserving old tasks and runs without starting a model.',
                          )
                        : t(
                            '确认创建这些任务及固定依赖，不启动模型。',
                            'Confirm creating these tasks and fixed dependencies without starting a model.',
                          )
                    }
                    value={consent}
                    isDisabled={
                      busy ||
                      !allowed ||
                      ('schema_version' in preview &&
                        preview.impact.blockers.length > 0)
                    }
                    onChange={setConsent}
                  />
                  <AppButton
                    label={
                      baseline
                        ? t('确认发布修订', 'Confirm plan revision')
                        : t('确认创建子任务', 'Confirm subtask creation')
                    }
                    icon={<Check size={16} />}
                    tone="primary"
                    disabled={
                      busy ||
                      !consent ||
                      !allowed ||
                      ('schema_version' in preview &&
                        preview.impact.blockers.length > 0)
                    }
                    onClick={() => void save()}
                  />
                </>
              )}
            </>
          )}
          <div className="wb-form-actions">
            <AppButton
              label={t('取消编辑', 'Cancel editing')}
              icon={<X size={16} />}
              tone="ghost"
              disabled={busy}
              onClick={close}
            />
          </div>
        </div>
      </AppDialog>
      {discard && (
        <AppDraftGuard
          title={t('放弃任务拆解编辑？', 'Discard breakdown edits?')}
          description={t(
            '尚未创建的目标、验收要求和依赖会丢失。',
            'Uncreated goals, acceptance and dependencies will be lost.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃编辑', 'Discard edits')}
          onKeep={() => {
            cancelWorkbenchNavigation()
            setDiscard(false)
          }}
          onDiscard={() => {
            released.current = true
            setDiscard(false)
            if (!confirmWorkbenchNavigation()) onClose()
          }}
        />
      )}
    </>
  )
}

function PlanRevisionImpact({
  preview,
  t,
}: {
  preview: PlanRevisionPreview | NestedRevisionPreview
  t: Copy
}) {
  const title = (key: string) =>
    preview.definition.items.find((item) => item.key === key)?.title ??
    preview.baseline.definition.items.find((item) => item.key === key)?.title ??
    key
  const groups = [
    [t('复用原任务', 'Reuse existing tasks'), preview.impact.reused_keys],
    [t('新增任务', 'Create new tasks'), preview.impact.added_keys],
    [t('替换为新任务', 'Replace with new tasks'), preview.impact.replaced_keys],
    [
      t('移出当前计划', 'Remove from current plan'),
      preview.impact.removed_keys,
    ],
  ] as const
  const reasons = {
    unfinished_run: t('有未结束的运行', 'Unfinished Run'),
    prepared_turn: t('有已准备的任务消息', 'Prepared task message'),
    prepared_coding: t('有已准备的研发执行', 'Prepared implementation'),
    unresolved_recovery: t('有未解决的恢复请求', 'Unresolved recovery request'),
    unconsumed_grant: t(
      '有尚未使用的执行委托',
      'Unconsumed execution delegation',
    ),
  }
  return (
    <section
      className="wb-plan-confirm"
      aria-label={t('修订影响', 'Revision impact')}
    >
      <h3>{t('修订影响', 'Revision impact')}</h3>
      <dl className="wb-details">
        {groups.map(([label, keys]) => (
          <div className="wb-plan-impact-row" key={label}>
            <dt>{label}</dt>
            <dd>
              {keys.length ? keys.map(title).join(' · ') : t('无', 'None')}
            </dd>
          </div>
        ))}
      </dl>
      {preview.impact.retired_task_ids.length > 0 && (
        <>
          <p>
            {t(
              '以下旧任务发布后不能再发起新执行，仍可查看历史和记录补充。',
              'After publication, these old tasks cannot start new execution. Their history remains available and supplemental messages can still be saved.',
            )}
          </p>
          <ul>
            {preview.impact.retired_task_ids.map((id) => (
              <li key={id}>
                <a href={taskWorkspaceHref(id)}>
                  {preview.baseline.bindings.find((item) => item.task.id === id)
                    ?.task.title ?? id}
                </a>{' '}
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </>
      )}
      {preview.schema_version === 3 && (
        <p className="wb-wrap">
          {t('连同退役的后代任务', 'Retired tasks including descendants')} ·{' '}
          {preview.impact.subtree_retired_task_ids.length}
          {preview.impact.subtree_retired_task_ids.map((id) => (
            <span key={id}>
              {' '}
              · <code>{id}</code>
            </span>
          ))}
        </p>
      )}
      {preview.impact.blockers.length > 0 && (
        <div className="wb-error" role="alert">
          <strong>
            {t('暂不能发布修订', 'Revision publication is blocked')}
          </strong>
          {preview.impact.blockers.map((item) => (
            <p key={item.task_id}>
              <code>{item.task_id}</code>
              {' · '}
              {item.reasons.map((reason) => reasons[reason]).join(' · ')}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}

function NestedCreationImpact({
  preview,
  t,
}: {
  preview: NestedCreatePreview
  t: Copy
}) {
  const reasons = {
    unfinished_run: t('有未结束的运行', 'Unfinished Run'),
    prepared_turn: t('有已准备的任务消息', 'Prepared task message'),
    prepared_coding: t('有已准备的研发执行', 'Prepared implementation'),
    unresolved_recovery: t('有未解决的恢复请求', 'Unresolved recovery request'),
    unconsumed_grant: t(
      '有尚未使用的执行委托',
      'Unconsumed execution delegation',
    ),
  }
  return (
    <section
      className="wb-plan-confirm"
      aria-label={t('嵌套拆解影响', 'Nested breakdown impact')}
    >
      <dl className="wb-details">
        <dt>{t('根任务', 'Root task')}</dt>
        <dd>
          <code>{preview.impact.root_task_id}</code>
        </dd>
        <dt>{t('当前树内任务', 'Current tasks in tree')}</dt>
        <dd>{preview.impact.current_task_count}</dd>
        <dt>{t('本次新增', 'Tasks added')}</dt>
        <dd>{preview.impact.added_tasks}</dd>
      </dl>
      <p>
        {t(
          '子任务验收完成后仍需本任务的新收尾运行及人工报告验收。不会自动启动模型。',
          'After child reviews, this task still needs a fresh integration Run and human report acceptance. No model starts automatically.',
        )}
      </p>
      {preview.impact.blockers.length > 0 && (
        <div className="wb-error" role="alert">
          <strong>
            {t(
              '任务树仍有未结束的操作，暂不能发布。',
              'The task tree has unresolved work. Publication is blocked.',
            )}
          </strong>
          {preview.impact.blockers.map((blocker) => (
            <p key={blocker.task_id}>
              <code>{blocker.task_id}</code>
              {' · '}
              {blocker.reasons.map((reason) => reasons[reason]).join(' · ')}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
