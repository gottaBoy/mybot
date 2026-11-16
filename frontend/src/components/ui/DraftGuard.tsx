import { AppButton, AppDialog } from './index'

export function AppDraftGuard({
  title,
  description,
  keepLabel,
  discardLabel,
  onKeep,
  onDiscard,
}: {
  title: string
  description: string
  keepLabel: string
  discardLabel: string
  onKeep: () => void
  onDiscard: () => void
}) {
  return (
    <AppDialog title={title} closeLabel={keepLabel} onClose={onKeep}>
      <div className="wb-form">
        <p>{description}</p>
        <div className="wb-form-actions">
          <AppButton label={keepLabel} tone="secondary" onClick={onKeep} />
          <AppButton
            label={discardLabel}
            tone="destructive"
            onClick={onDiscard}
          />
        </div>
      </div>
    </AppDialog>
  )
}
