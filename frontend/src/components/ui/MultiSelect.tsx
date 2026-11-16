import { type ComponentProps } from 'react'
import { MultiSelector } from '@astryxdesign/core/MultiSelector'
import { useAppControlSize } from './DensityContext'

export type AppMultiSelectProps = {
  label: string
  value: string[]
  options: Array<{ value: string; label: string }>
  onChange: (value: string[]) => void
  hiddenLabel?: boolean
  disabled?: boolean
  readOnly?: boolean
  hasSearch?: boolean
  searchPlaceholder?: string
  emptyText?: string
  size?: ComponentProps<typeof MultiSelector>['size']
}

export function AppMultiSelect({
  label,
  value,
  options,
  onChange,
  hiddenLabel = false,
  disabled = false,
  readOnly = false,
  hasSearch = false,
  searchPlaceholder,
  emptyText = '暂无选项 / No options',
  size,
}: AppMultiSelectProps) {
  const defaultSize = useAppControlSize()
  return (
    <MultiSelector
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      isLabelHidden={hiddenLabel}
      isDisabled={disabled}
      isReadOnly={readOnly}
      hasSearch={hasSearch}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      emptySearchText={emptyText}
      placeholder={label}
      size={size ?? defaultSize}
      width="100%"
      presentation="adaptive"
      hasClear
      triggerDisplay="count"
      formatValue={(items) =>
        items.length === 1 ? items[0].label : `${label} (${items.length})`
      }
      controlStyle={{ minWidth: 0, whiteSpace: 'nowrap' }}
    />
  )
}
