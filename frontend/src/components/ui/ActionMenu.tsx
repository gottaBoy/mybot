import type { ReactNode } from 'react'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { useAppControlSize } from './DensityContext'

export type AppMenuAction = {
  id: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
  destructive?: boolean
  keepOpen?: boolean
  onSelect: () => void
}
export type AppMenuEntry =
  | AppMenuAction
  | { type: 'divider' }
  | { type: 'section'; id: string; title?: string; items: AppMenuAction[] }

export type AppActionMenuProps = {
  label: string
  icon?: ReactNode
  items: AppMenuEntry[]
  disabled?: boolean
  busy?: boolean
  iconOnly?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  header?: ReactNode
  footer?: ReactNode
}

const action = (item: AppMenuAction) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  icon: item.icon,
  isDisabled: item.disabled,
  variant: item.destructive ? ('destructive' as const) : ('default' as const),
  hasCloseOnSelect: !item.keepOpen,
  onClick: item.onSelect,
})

export function AppActionMenu({
  label,
  icon,
  items,
  disabled = false,
  busy = false,
  iconOnly = false,
  open,
  onOpenChange,
  header,
  footer,
}: AppActionMenuProps) {
  const size = useAppControlSize()
  return (
    <DropdownMenu
      button={{
        label,
        icon,
        size,
        variant: 'secondary',
        isDisabled: disabled,
        isLoading: busy,
        isIconOnly: iconOnly,
      }}
      items={items.map((item) =>
        'type' in item
          ? item.type === 'divider'
            ? item
            : { ...item, items: item.items.map(action) }
          : action(item),
      )}
      isMenuOpen={open}
      onOpenChange={onOpenChange}
      presentation="adaptive"
      menuWidth={300}
      header={header}
      footer={footer}
    />
  )
}
