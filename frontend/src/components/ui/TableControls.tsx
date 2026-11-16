import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuDivider,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSubMenu,
} from '@astryxdesign/core/DropdownMenu'
import {
  Columns3,
  ArrowDownWideNarrow,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { useAppControlSize } from './DensityContext'

export type AppTableControlColumn = {
  key: string
  label: string
  required?: boolean
}

export function AppTableControls({
  label,
  sortLabel,
  columnsLabel,
  resetLabel,
  sort,
  sortOptions,
  onSortChange,
  columns,
  visible,
  onVisibleChange,
  onReset,
  sortLocked = false,
  iconOnly = false,
  configureLabel = 'Manage columns & sorting',
  onConfigure,
  sortSummary,
}: {
  label: string
  sortLabel: string
  columnsLabel: string
  resetLabel: string
  sort: string
  sortOptions: Array<{ value: string; label: string }>
  onSortChange: (value: string) => void
  columns: AppTableControlColumn[]
  visible: readonly string[]
  onVisibleChange: (keys: string[]) => void
  onReset: () => void
  sortLocked?: boolean
  iconOnly?: boolean
  configureLabel?: string
  onConfigure?: () => void
  sortSummary?: string
}) {
  const size = useAppControlSize()
  const currentSort =
    sortSummary ??
    sortOptions.find((option) => option.value === sort)?.label ??
    sort
  return (
    <DropdownMenu
      button={{
        label,
        icon: <Columns3 size={16} />,
        variant: 'secondary',
        size,
        isIconOnly: iconOnly,
      }}
      menuWidth={264}
    >
      <DropdownMenuSubMenu
        label={`${sortLabel}: ${currentSort}`}
        icon={<ArrowDownWideNarrow size={15} />}
        isDisabled={sortLocked}
        menuWidth={240}
      >
        <DropdownMenuRadioGroup
          label={sortLabel}
          value={sort}
          onChange={onSortChange}
        >
          {sortOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              label={option.label}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubMenu>
      <DropdownMenuDivider />
      <DropdownMenuGroup title={columnsLabel}>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            label={column.label}
            value={column.required || visible.includes(column.key)}
            isDisabled={column.required}
            onChange={(checked) =>
              onVisibleChange(
                checked
                  ? [...visible, column.key]
                  : visible.filter((key) => key !== column.key),
              )
            }
          />
        ))}
      </DropdownMenuGroup>
      <DropdownMenuDivider />
      <DropdownMenuItem
        label={resetLabel}
        icon={<RotateCcw size={15} />}
        onClick={onReset}
      />
      {onConfigure && (
        <>
          <DropdownMenuDivider />
          <DropdownMenuItem
            label={configureLabel}
            icon={<SlidersHorizontal size={15} />}
            onClick={onConfigure}
          />
        </>
      )}
    </DropdownMenu>
  )
}
