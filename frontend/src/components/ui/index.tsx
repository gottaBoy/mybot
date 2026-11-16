import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Badge } from '@astryxdesign/core/Badge'
import { TextInput } from '@astryxdesign/core/TextInput'
import { TextArea } from '@astryxdesign/core/TextArea'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Dialog } from '@astryxdesign/core/Dialog'
import { Card } from '@astryxdesign/core/Card'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl'
import { Theme, type DefinedTheme } from '@astryxdesign/core/theme'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { InternationalizationProvider } from '@astryxdesign/core/i18n'
import zhCN from '@astryxdesign/core/locales/zh-CN.generated.js'
import { X } from 'lucide-react'
import { AppDensityProvider, useAppControlSize } from './DensityContext'
import {
  defaultProductTheme,
  loadProductTheme,
  type Density,
  type AccentId,
  type StyleId,
} from './themes'

export function AppButton({
  tone = 'secondary',
  busy = false,
  disabled = false,
  iconOnly = false,
  tooltip,
  ...props
}: Omit<
  ComponentProps<typeof Button>,
  'variant' | 'isLoading' | 'isDisabled' | 'isIconOnly' | 'tooltip'
> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  busy?: boolean
  disabled?: boolean
  iconOnly?: boolean
  tooltip?: string | false
}) {
  const size = useAppControlSize()
  return (
    <Button
      size={size}
      {...props}
      variant={tone}
      isLoading={busy}
      isDisabled={disabled}
      isIconOnly={iconOnly}
      tooltip={
        tooltip === false
          ? undefined
          : (tooltip ?? (iconOnly ? props.label : undefined))
      }
    />
  )
}

export function AppInput({
  maxLength,
  ...props
}: ComponentProps<typeof TextInput> & { maxLength?: number }) {
  const tooLong = maxLength !== undefined && [...props.value].length > maxLength
  const size = useAppControlSize()
  return (
    <TextInput
      width="100%"
      size={size}
      {...props}
      status={
        tooLong ? { type: 'error', message: `Max ${maxLength}` } : props.status
      }
    />
  )
}

export function AppTextArea(props: ComponentProps<typeof TextArea>) {
  const size = useAppControlSize()
  return <TextArea width="100%" size={size} {...props} />
}

export function AppNumber(props: ComponentProps<typeof NumberInput>) {
  const size = useAppControlSize()
  return (
    <NumberInput
      width="100%"
      size={size}
      isIntegerOnly
      hasNumberSteppers
      {...props}
    />
  )
}

export function AppSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  hiddenLabel = false,
  size,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
  hiddenLabel?: boolean
  size?: ComponentProps<typeof Selector>['size']
}) {
  const defaultSize = useAppControlSize()
  return (
    <Selector
      label={label}
      value={value || undefined}
      options={options}
      onChange={onChange}
      isDisabled={disabled}
      isLabelHidden={hiddenLabel}
      width="100%"
      size={size ?? defaultSize}
      presentation="adaptive"
      emptyText="暂无选项 / No options"
    />
  )
}

export function AppCheckbox(props: ComponentProps<typeof CheckboxInput>) {
  return <CheckboxInput {...props} />
}

export function AppCard(props: ComponentProps<typeof Card>) {
  return <Card padding={4} {...props} />
}

export function AppProgress({
  label,
  value,
  max,
}: {
  label: string
  value: number
  max: number
}) {
  return (
    <ProgressBar
      label={label}
      value={value}
      max={Math.max(1, max)}
      isLabelHidden
    />
  )
}

export function AppSegments({
  label,
  value,
  onChange,
  options,
  iconOnly = false,
  size,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; icon?: ReactNode }>
  iconOnly?: boolean
  size?: ComponentProps<typeof SegmentedControl>['size']
}) {
  const defaultSize = useAppControlSize()
  return (
    <SegmentedControl
      label={label}
      value={value}
      onChange={onChange}
      size={size ?? defaultSize}
    >
      {options.map((option) => (
        <SegmentedControlItem
          key={option.value}
          {...option}
          isLabelHidden={iconOnly && !!option.icon}
        />
      ))}
    </SegmentedControl>
  )
}

export function AppStylePicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: ReadonlyArray<{ value: string; label: string; swatch: string }>
  onChange: (value: string) => void
}) {
  return (
    <RadioList
      label={label}
      isLabelHidden
      value={value}
      onChange={onChange}
      controlClassName="wb-style-grid"
    >
      {options.map((option) => (
        <RadioListItem
          key={option.value}
          value={option.value}
          label={option.label}
          className="wb-style-option"
          data-selected={value === option.value}
          startContent={
            <i
              className="wb-style-swatch"
              aria-hidden="true"
              style={{ background: option.swatch }}
            />
          }
        />
      ))}
    </RadioList>
  )
}

export function AppBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'success' | 'error' | 'info' | 'warning'
}) {
  return (
    <Badge
      label={children}
      variant={tone}
      className="wb-badge"
      data-tone={tone}
    />
  )
}

export function AppDialog({
  title,
  children,
  onClose,
  closeLabel,
  busy = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  closeLabel: string
  busy?: boolean
}) {
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
      purpose={busy ? 'required' : 'form'}
      width={640}
      maxHeight="90dvh"
      padding={0}
      aria-label={title}
      className="wb-dialog"
    >
      <div className="wb-dialog-head">
        <h2>{title}</h2>
        <AppButton
          label={closeLabel}
          icon={<X size={18} />}
          iconOnly
          tone="ghost"
          tooltip={false}
          onClick={onClose}
          disabled={busy}
        />
      </div>
      <div className="wb-dialog-content">{children}</div>
    </Dialog>
  )
}

export function AppLoading({ label }: { label: string }) {
  return (
    <div
      className="wb-loading"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <Skeleton width="36%" height={25} radius={1} />
      {[0, 1, 2, 3].map((index) => (
        <div className="wb-loading-row" key={index} aria-hidden="true">
          <Skeleton width={30} height={30} radius={1} />
          <div>
            <Skeleton width="70%" height={13} index={index} radius={1} />
            <Skeleton width="35%" height={10} index={index} radius={1} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AppTheme({
  mode,
  locale = 'zh',
  styleId = 'neutral',
  density = 'comfortable',
  accentId = 'theme',
  children,
}: {
  mode: 'light' | 'dark'
  locale?: 'zh' | 'en'
  styleId?: StyleId
  density?: Density
  accentId?: AccentId
  children: ReactNode
}) {
  const [applied, setApplied] = useState<{
    id: StyleId
    accent: AccentId
    theme: DefinedTheme
  }>({
    id: 'neutral',
    accent: 'theme',
    theme: defaultProductTheme,
  })
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setError(false)
    loadProductTheme(styleId, accentId)
      .then((theme) => {
        if (active) setApplied({ id: styleId, accent: accentId, theme })
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [styleId, accentId])
  return (
    <InternationalizationProvider
      locale={locale === 'zh' ? 'zh-CN' : 'en'}
      messages={{ 'zh-CN': zhCN }}
    >
      <Theme theme={applied.theme} mode={mode}>
        <AppDensityProvider density={density}>
          <div
            className="wb-theme"
            data-mode={mode}
            data-style={applied.id}
            data-density={density}
            data-accent={applied.accent}
          >
            {error && (
              <p className="wb-error" role="alert">
                {locale === 'zh'
                  ? '主题加载失败，已保留当前样式。'
                  : 'Theme could not load. Current styling is retained.'}
              </p>
            )}
            {children}
          </div>
        </AppDensityProvider>
      </Theme>
    </InternationalizationProvider>
  )
}
