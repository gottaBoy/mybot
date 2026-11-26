import { useEffect, useRef, useState } from 'react'
import { Check, FileSearch, Plus, RefreshCw, Trash2, X } from 'lucide-react'
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
  type PlanPreview,
  type PlanReceipt,
} from './task-plans'
import type { Copy } from './state'
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
  task,
  initial,
  enabled,
  t,
  onClose,
  onCreated,
}: {
  task: Task
  initial?: string
  enabled: boolean
  t: Copy
  onClose: () => void
  onCreated: (receipt: PlanReceipt) => void
}) {
  const [definition, setDefinition] = useState<PlanDefinition>({
    items: [blank('step1'), blank('step2')],
  })
  const [preview, setPreview] = useState<PlanPreview>()
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
  const latest = useRef({ definition, preview, pending, phase, consent })
  latest.current = { definition, preview, pending, phase, consent }
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
    setPreview(undefined)
    setConsent(false)
    setError('')
    setPhase('edit')
  }
  function complete(receipt: PlanReceipt) {
    cancelWorkbenchNavigation()
    if (!stamp()) throw new Error('task_plan_navigation_unconfirmed')
    released.current = true
    setPending(undefined)
    onCreated(receipt)
  }
  async function inspect() {
    if (operation.current || latest.current.pending || !enabled) return
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
    try {
      const result = await previewTaskPlan(task, admitted, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setPreview(result)
      setPhase('preview')
    } catch {
      if (!mounted.current) return
      setPhase('edit')
      setPreview(undefined)
      setError(
        t(
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
      !enabled
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
      const receipt = await createTaskPlan(
        task,
        id,
        state.preview,
        controller.signal,
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
        title={t('拆分任务', 'Break down task')}
        closeLabel={t('关闭', 'Close')}
        busy={busy}
        onClose={close}
      >
        <div
          className="wb-form wb-task-plan-editor"
          data-testid="task-plan-editor"
        >
          <strong>{task.title}</strong>
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
                  onClick={() =>
                    edit({
                      items: [
                        ...definition.items,
                        blank(`step${sequence.current++}`),
                      ],
                    })
                  }
                />
                <AppButton
                  label={t('核对任务拆解', 'Review task breakdown')}
                  icon={<FileSearch size={16} />}
                  disabled={busy || !enabled}
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
                      {t('将创建的任务', 'Tasks to create')} ·{' '}
                      {preview.definition.items.length}
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
                  <AppCheckbox
                    label={t(
                      '确认创建这些任务及固定依赖，不启动模型。',
                      'Confirm creating these tasks and fixed dependencies without starting a model.',
                    )}
                    value={consent}
                    isDisabled={busy || !enabled}
                    onChange={setConsent}
                  />
                  <AppButton
                    label={t('确认创建子任务', 'Confirm subtask creation')}
                    icon={<Check size={16} />}
                    tone="primary"
                    disabled={busy || !consent || !enabled}
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
