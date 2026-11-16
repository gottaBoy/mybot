import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppButton, AppTheme } from '../components/ui'
import type { Copy } from './state'
import {
  TaskTableSettings,
  type TaskTableSettingsValue,
} from './TaskTableSettings'
import { defaultTaskColumnOrder, defaultTaskColumns } from './task-table-config'
import './workbench.css'

export function TaskTableSettingsExample({
  sortLocked = false,
  mode = 'light',
  locale = 'en',
  onApply,
}: {
  sortLocked?: boolean
  mode?: 'light' | 'dark'
  locale?: 'zh' | 'en'
  onApply?: (value: TaskTableSettingsValue) => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<TaskTableSettingsValue>({
    visible: [...defaultTaskColumns],
    order: [...defaultTaskColumnOrder],
    sorts: [{ sortKey: 'status', direction: 'ascending' }],
  })
  const [applied, setApplied] = useState(0)
  const t: Copy = (zh, en) => (locale === 'zh' ? zh : en)
  return (
    <AppTheme mode={mode} locale={locale}>
      <AppButton
        label={t('管理列与排序', 'Manage columns & sorting')}
        onClick={() => setOpen(true)}
      />
      <output
        aria-label="Applied settings"
        style={{ display: 'block', overflowWrap: 'anywhere' }}
      >
        {JSON.stringify(value)}
      </output>
      <output aria-label="Apply count">{applied}</output>
      <TaskTableSettings
        open={open}
        value={value}
        t={t}
        sortLocked={sortLocked}
        onApply={(next) => {
          onApply?.(next)
          setValue(next)
          setApplied((count) => count + 1)
        }}
        onClose={() => setOpen(false)}
      />
    </AppTheme>
  )
}

export function mountTaskTableSettingsExample(
  element: HTMLElement,
  props: Parameters<typeof TaskTableSettingsExample>[0] = {},
) {
  const root = createRoot(element)
  root.render(<TaskTableSettingsExample {...props} />)
  return () => root.unmount()
}
