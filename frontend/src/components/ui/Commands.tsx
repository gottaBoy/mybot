import { useMemo } from 'react'
import {
  CommandPalette,
  CommandPaletteInput,
} from '@astryxdesign/core/CommandPalette'
import { createStaticSource } from '@astryxdesign/core/Typeahead'

export type AppCommand = {
  id: string
  label: string
  group: string
  keywords?: string[]
  onSelect: () => void
}
export function AppCommands({
  items,
  onClose,
  label,
  placeholder,
  empty,
}: {
  items: AppCommand[]
  onClose: () => void
  label: string
  placeholder: string
  empty: string
}) {
  const source = useMemo(
    () =>
      createStaticSource(
        items.map((item) => ({
          id: item.id,
          label: item.label,
          auxiliaryData: {
            group: item.group,
            onSelect: item.onSelect,
            keywords: item.keywords ?? [],
          },
        })),
        { keywords: (item) => item.auxiliaryData.keywords },
      ),
    [items],
  )
  // Core renders CommandPaletteGroup for each auxiliaryData.group.
  return (
    <CommandPalette
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      searchSource={source}
      label={label}
      input={<CommandPaletteInput label={label} placeholder={placeholder} />}
      footer={null}
      emptySearchText={empty}
      onValueChange={(id) => {
        onClose()
        items.find((item) => item.id === id)?.onSelect()
      }}
    />
  )
}
