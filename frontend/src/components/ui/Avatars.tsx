import { Avatar, AvatarStatusDot } from '@astryxdesign/core/Avatar'
import {
  AvatarGroup,
  AvatarGroupOverflow,
} from '@astryxdesign/core/AvatarGroup'

export function AppAvatarGroup({
  label,
  items,
  onExpand,
  max = 3,
}: {
  label: string
  items: Array<{ id: string; name: string; status: string; stateLabel: string }>
  onExpand: () => void
  max?: number
}) {
  return (
    <AvatarGroup size="sm" shape="rounded" aria-label={label}>
      {items.slice(0, max).map((item) => (
        <Avatar
          key={item.id}
          name={item.name}
          tooltip={`${item.name} · ${item.stateLabel}`}
          status={
            <AvatarStatusDot
              label={item.stateLabel}
              variant={
                item.status === 'succeeded'
                  ? 'success'
                  : ['failed', 'interrupted', 'canceled'].includes(item.status)
                    ? 'error'
                    : 'neutral'
              }
            />
          }
        />
      ))}
      {items.length > max && (
        <AvatarGroupOverflow
          count={items.length - max}
          onClick={onExpand}
          aria-label={label}
        />
      )}
    </AvatarGroup>
  )
}
