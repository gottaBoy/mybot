import type { WorkItem } from './projections'

export type InboxSelection =
  | { kind: 'empty' }
  | { kind: 'available'; item: WorkItem }
  | { kind: 'unavailable'; id: string }

export function resolveInboxSelection(
  items: readonly WorkItem[],
  selectedId: string,
  selectFirst: boolean,
): InboxSelection {
  if (selectedId) {
    const item = items.find((candidate) => candidate.id === selectedId)
    return item
      ? { kind: 'available', item }
      : { kind: 'unavailable', id: selectedId }
  }
  return selectFirst && items[0]
    ? { kind: 'available', item: items[0] }
    : { kind: 'empty' }
}
