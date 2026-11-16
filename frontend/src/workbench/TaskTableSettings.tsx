import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { AppButton, AppCheckbox, AppDialog, AppSelect } from '../components/ui'
import { AppDraftGuard } from '../components/ui/DraftGuard'
import {
  cancelWorkbenchNavigation,
  confirmWorkbenchNavigation,
  refreshWorkbenchNavigationBlocker,
  registerWorkbenchNavigationBlocker,
} from './navigation-guard'
import type { Copy } from './state'
import {
  defaultTaskColumnOrder,
  defaultTaskColumns,
  moveTaskColumn,
  normalizeTaskColumnOrder,
  normalizeTaskColumns,
  taskColumnKeys,
  type TaskColumnKey,
} from './task-table-config'
import { parseTaskSort, type TaskSortRule } from './task-sort'
import './task-table-settings.css'

export type TaskTableSettingsValue = {
  visible: TaskColumnKey[]
  order: TaskColumnKey[]
  sorts: TaskSortRule[]
}

export type TaskTableSettingsProps = {
  open: boolean
  value: TaskTableSettingsValue
  t: Copy
  sortLocked?: boolean
  onApply: (value: TaskTableSettingsValue) => void
  onClose: () => void
}

function copyValue(value: TaskTableSettingsValue): TaskTableSettingsValue {
  const sorts = parseTaskSort(value.sorts)
  if (!sorts) throw new Error('task_sort_invalid')
  return {
    visible: normalizeTaskColumns(value.visible),
    order: normalizeTaskColumnOrder(value.order),
    sorts,
  }
}

export function TaskTableSettings({
  open,
  value,
  t,
  sortLocked = false,
  onApply,
  onClose,
}: TaskTableSettingsProps) {
  const [draft, setDraft] = useState(() => copyValue(value))
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(copyValue(value)),
  )
  const [discardOpen, setDiscardOpen] = useState(false)
  const [error, setError] = useState('')
  const wasOpen = useRef(false)
  const applying = useRef(false)
  const navigationPending = useRef(false)
  const dirty = JSON.stringify(draft) !== baseline
  const guardState = useRef({ dirty: false, busy: false })
  guardState.current = { dirty: open && dirty, busy: applying.current }
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (wasOpen.current) return
    wasOpen.current = true
    const next = copyValue(value)
    setDraft(next)
    setBaseline(JSON.stringify(next))
    setDiscardOpen(false)
    setError('')
    applying.current = false
  }, [open, value])
  useEffect(() => {
    if (!open) return
    const release = registerWorkbenchNavigationBlocker({
      getState: () => guardState.current,
      onBlocked: () => {
        navigationPending.current = true
        setDiscardOpen(true)
      },
      onReset: () => {
        navigationPending.current = false
        setDiscardOpen(false)
      },
    })
    const unload = (event: BeforeUnloadEvent) => {
      if (!guardState.current.dirty && !guardState.current.busy) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', unload)
    return () => {
      release()
      window.removeEventListener('beforeunload', unload)
    }
  }, [open])
  useEffect(() => {
    if (open) refreshWorkbenchNavigationBlocker()
  }, [open, dirty])

  const labels: Record<TaskColumnKey, string> = {
    id: t('编号', 'ID'),
    title: t('任务', 'Task'),
    projectName: t('项目', 'Project'),
    status: t('执行状态', 'Execution'),
    updated: t('最近运行', 'Latest run'),
    attempts: t('历史', 'History'),
    created_at: t('创建时间', 'Created'),
  }
  function requestClose() {
    if (applying.current) return
    if (dirty) setDiscardOpen(true)
    else onClose()
  }
  function updateSort(index: number, patch: Partial<TaskSortRule>) {
    if (sortLocked) return
    setDraft((current) => {
      const sorts = current.sorts.map((rule, position) =>
        position === index ? { ...rule, ...patch } : rule,
      )
      return parseTaskSort(sorts) ? { ...current, sorts } : current
    })
    setError('')
  }
  function moveSort(index: number, direction: -1 | 1) {
    if (sortLocked) return
    setDraft((current) => {
      const target = index + direction
      if (target < 0 || target >= current.sorts.length) return current
      const sorts = [...current.sorts]
      ;[sorts[index], sorts[target]] = [sorts[target], sorts[index]]
      return { ...current, sorts }
    })
  }
  function apply() {
    if (applying.current) return
    applying.current = true
    // The synchronous apply callback owns its URL write; keep only the local duplicate guard.
    guardState.current = { dirty: false, busy: false }
    try {
      onApply(copyValue(draft))
      guardState.current = { dirty: false, busy: false }
      onClose()
    } catch {
      applying.current = false
      guardState.current = { dirty, busy: false }
      setError(
        t(
          '设置未能应用，更改已保留。',
          'The settings could not be applied. Your changes are kept.',
        ),
      )
    }
  }
  if (!open) return null
  return (
    <>
      <AppDialog
        title={t('管理列与排序', 'Manage columns & sorting')}
        closeLabel={t('关闭', 'Close')}
        onClose={requestClose}
      >
        <div className="wb-form wt-settings">
          {error && (
            <p className="wb-error" role="alert">
              {error}
            </p>
          )}
          <section aria-label={t('列顺序与显隐', 'Column order & visibility')}>
            <h3>{t('列', 'Columns')}</h3>
            <ol className="wt-settings-columns">
              {draft.order.map((key, index) => (
                <li key={key} data-column-key={key}>
                  <AppCheckbox
                    label={labels[key]}
                    value={key === 'title' || draft.visible.includes(key)}
                    isDisabled={key === 'title'}
                    onChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        visible: normalizeTaskColumns(
                          checked
                            ? [...current.visible, key]
                            : current.visible.filter((item) => item !== key),
                        ),
                      }))
                    }
                  />
                  <div className="wt-settings-move">
                    <AppButton
                      label={`${t('上移', 'Move up')}: ${labels[key]}`}
                      icon={<ArrowUp size={15} />}
                      iconOnly
                      tone="ghost"
                      disabled={index === 0}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          order: moveTaskColumn(current.order, key, -1),
                        }))
                      }
                    />
                    <AppButton
                      label={`${t('下移', 'Move down')}: ${labels[key]}`}
                      icon={<ArrowDown size={15} />}
                      iconOnly
                      tone="ghost"
                      disabled={index === draft.order.length - 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          order: moveTaskColumn(current.order, key, 1),
                        }))
                      }
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section aria-label={t('排序优先级', 'Sort priority')}>
            <h3>{t('排序', 'Sorting')}</h3>
            {sortLocked && (
              <p className="wb-hint" role="status">
                {t(
                  '排序由当前 JQL 查询控制。',
                  'Sorting is controlled by the active JQL query.',
                )}
              </p>
            )}
            <ol className="wt-settings-sorts">
              {draft.sorts.map((rule, index) => (
                <li key={rule.sortKey}>
                  <span className="wt-settings-rank">{index + 1}</span>
                  <AppSelect
                    label={`${t('排序字段', 'Sort field')} ${index + 1}`}
                    hiddenLabel
                    value={rule.sortKey}
                    disabled={sortLocked}
                    options={taskColumnKeys
                      .filter(
                        (key) =>
                          key === rule.sortKey ||
                          !draft.sorts.some((item) => item.sortKey === key),
                      )
                      .map((key) => ({ value: key, label: labels[key] }))}
                    onChange={(key) =>
                      updateSort(index, { sortKey: key as TaskColumnKey })
                    }
                  />
                  <AppSelect
                    label={`${t('排序方向', 'Sort direction')} ${index + 1}`}
                    hiddenLabel
                    value={rule.direction}
                    disabled={sortLocked}
                    options={[
                      { value: 'ascending', label: t('正序', 'Ascending') },
                      { value: 'descending', label: t('倒序', 'Descending') },
                    ]}
                    onChange={(direction) =>
                      updateSort(index, {
                        direction: direction as TaskSortRule['direction'],
                      })
                    }
                  />
                  <div className="wt-settings-sort-actions">
                    <AppButton
                      label={`${t('提高排序优先级', 'Move sort up')} ${index + 1}`}
                      icon={<ArrowUp size={15} />}
                      iconOnly
                      tone="ghost"
                      disabled={sortLocked || index === 0}
                      onClick={() => moveSort(index, -1)}
                    />
                    <AppButton
                      label={`${t('降低排序优先级', 'Move sort down')} ${index + 1}`}
                      icon={<ArrowDown size={15} />}
                      iconOnly
                      tone="ghost"
                      disabled={sortLocked || index === draft.sorts.length - 1}
                      onClick={() => moveSort(index, 1)}
                    />
                    <AppButton
                      label={`${t('移除排序', 'Remove sort')} ${index + 1}`}
                      icon={<Trash2 size={15} />}
                      iconOnly
                      tone="ghost"
                      disabled={sortLocked}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          sorts: current.sorts.filter(
                            (_, position) => position !== index,
                          ),
                        }))
                      }
                    />
                  </div>
                </li>
              ))}
            </ol>
            <div className="wb-inline">
              <AppButton
                label={t('添加排序', 'Add sort')}
                icon={<Plus size={15} />}
                tone="ghost"
                disabled={sortLocked || draft.sorts.length >= 3}
                onClick={() =>
                  setDraft((current) => {
                    const sortKey = taskColumnKeys.find(
                      (key) =>
                        !current.sorts.some((rule) => rule.sortKey === key),
                    )
                    return !sortLocked && current.sorts.length < 3 && sortKey
                      ? {
                          ...current,
                          sorts: [
                            ...current.sorts,
                            { sortKey, direction: 'ascending' },
                          ],
                        }
                      : current
                  })
                }
              />
              <AppButton
                label={t('清除排序', 'Clear sorting')}
                icon={<X size={15} />}
                iconOnly
                tone="ghost"
                disabled={sortLocked || !draft.sorts.length}
                onClick={() =>
                  setDraft((current) => ({ ...current, sorts: [] }))
                }
              />
            </div>
          </section>
          <div className="wb-form-actions">
            <AppButton
              label={t('恢复默认', 'Reset defaults')}
              icon={<RotateCcw size={15} />}
              tone="ghost"
              onClick={() =>
                setDraft((current) => ({
                  visible: [...defaultTaskColumns],
                  order: [...defaultTaskColumnOrder],
                  sorts: sortLocked ? current.sorts : [],
                }))
              }
            />
            <AppButton label={t('取消', 'Cancel')} onClick={requestClose} />
            <AppButton
              label={t('应用', 'Apply')}
              icon={<Check size={15} />}
              tone="primary"
              onClick={apply}
            />
          </div>
        </div>
      </AppDialog>
      {discardOpen && (
        <AppDraftGuard
          title={t('放弃表格设置更改？', 'Discard table setting changes?')}
          description={t(
            '尚未应用的列与排序更改将被放弃。',
            'Unapplied column and sorting changes will be discarded.',
          )}
          keepLabel={t('继续编辑', 'Keep editing')}
          discardLabel={t('放弃更改', 'Discard changes')}
          onKeep={() => {
            navigationPending.current = false
            cancelWorkbenchNavigation()
            setDiscardOpen(false)
          }}
          onDiscard={() => {
            guardState.current = { dirty: false, busy: false }
            if (navigationPending.current) confirmWorkbenchNavigation()
            navigationPending.current = false
            setDiscardOpen(false)
            onClose()
          }}
        />
      )}
    </>
  )
}
