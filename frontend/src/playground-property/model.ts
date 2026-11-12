/** Astryx core component module name, e.g. `Button`, `DataTable`, or `Text`. */
export type TargetComponent = string

/** Core module names shipped by the pinned @astryxdesign/core package. */
export const CORE_COMPONENTS_VERSION = '0.7.13'
export const CORE_COMPONENTS = new Set([
  'AlertDialog', 'AppShell', 'AspectRatio', 'Avatar', 'AvatarGroup', 'Badge', 'Banner', 'Blockquote',
  'BottomSheet', 'Breadcrumbs', 'Button', 'ButtonGroup', 'Calendar', 'Card', 'Carousel', 'Center',
  'Chat', 'CheckboxInput', 'CheckboxList', 'Citation', 'ClickableCard', 'Code', 'CodeBlock',
  'Collapsible', 'CommandPalette', 'ComplexSelector', 'ContextMenu', 'DateInput', 'DateRangeInput',
  'DateTimeInput', 'Dialog', 'Divider', 'Drawer', 'DropdownMenu', 'EmptyState', 'Field', 'FieldStatus',
  'FileInput', 'FormLayout', 'Grid', 'HStack', 'Heading', 'HoverCard', 'Icon', 'IconButton', 'Indicator',
  'InfoTip', 'InputGroup', 'InteractiveRoleContext', 'Item', 'Kbd', 'Layer', 'Layout', 'Lightbox',
  'Link', 'List', 'Markdown', 'MetadataList', 'MobileNav', 'MoreMenu', 'MultiSelector', 'NavIcon',
  'NavItem', 'NavMenu', 'NumberInput', 'Outline', 'OverflowList', 'Overlay', 'Pagination', 'Popover',
  'PowerSearch', 'ProgressBar', 'RadioList', 'Resizable', 'ScrollableArea', 'Section', 'SegmentedControl',
  'SelectableCard', 'Selector', 'SideNav', 'SizeContext', 'Skeleton', 'Slider', 'SnapPaging', 'Spinner',
  'Stack', 'StatusDot', 'Stepper', 'Switch', 'TabList', 'Table', 'Text', 'TextArea', 'TextInput',
  'Thumbnail', 'TimeInput', 'Timer', 'Timestamp', 'Toast', 'ToggleButton', 'Token', 'Tokenizer',
  'Toolbar', 'Tooltip', 'TopNav', 'TreeList', 'Typeahead', 'VStack', 'VisuallyHidden',
])

export type TargetSelection = {
  id: string
  component: TargetComponent
  index: number
}

export type PropertyKind = 'string' | 'number' | 'boolean' | 'enum'

export type PropertyDescriptor = {
  name: string
  label: string
  kind: PropertyKind
  options?: readonly string[]
  defaultValue?: string | number | boolean
  /** A property is safe to reflect in the isolated preview DOM. */
  preview: boolean
}

export type PropertyValue = string | number | boolean | null

export type PreviewPropertyPatch = {
  id: string
  component: TargetComponent
  property: string
  value: PropertyValue
}

export const PROPERTY_DESCRIPTORS: Record<TargetComponent, readonly PropertyDescriptor[]> = {
  Button: [
    {name: 'label', label: 'Label', kind: 'string', preview: true},
    {
      name: 'variant',
      label: 'Variant',
      kind: 'enum',
      options: ['primary', 'secondary', 'ghost', 'destructive'],
      defaultValue: 'primary',
      preview: true,
    },
    {
      name: 'size',
      label: 'Size',
      kind: 'enum',
      options: ['sm', 'md', 'lg'],
      defaultValue: 'md',
      preview: true,
    },
    {name: 'isDisabled', label: 'Disabled', kind: 'boolean', defaultValue: false, preview: true},
    {name: 'isLoading', label: 'Loading', kind: 'boolean', defaultValue: false, preview: true},
  ],
  Card: [
    {
      name: 'variant',
      label: 'Variant',
      kind: 'enum',
      options: ['default', 'transparent', 'muted', 'blue', 'green', 'orange', 'red'],
      defaultValue: 'default',
      preview: true,
    },
    {
      name: 'padding',
      label: 'Padding',
      kind: 'number',
      defaultValue: 4,
      preview: true,
    },
    {name: 'width', label: 'Width', kind: 'string', preview: true},
    {name: 'height', label: 'Height', kind: 'string', preview: true},
  ],
  Text: [
    {
      name: 'type',
      label: 'Type',
      kind: 'enum',
      options: ['body', 'large', 'label', 'supporting', 'code', 'display-1', 'display-2', 'display-3'],
      defaultValue: 'body',
      preview: true,
    },
    {
      name: 'color',
      label: 'Color',
      kind: 'enum',
      options: ['primary', 'secondary', 'disabled', 'inherit'],
      defaultValue: 'primary',
      preview: true,
    },
    {
      name: 'weight',
      label: 'Weight',
      kind: 'enum',
      options: ['regular', 'medium', 'semibold', 'bold'],
      preview: true,
    },
    {name: 'maxLines', label: 'Max lines', kind: 'number', defaultValue: 0, preview: true},
  ],
}

export function isTargetComponent(value: string): value is TargetComponent {
  // The source parser accepts bare PascalCase JSX identifiers. The installed
  // Core registry and source import allowlist remain the authority for what
  // can execute; this gate only rejects HTML/custom lowercase tags.
  return CORE_COMPONENTS.has(value)
}

export function isPropertyValue(value: unknown): value is PropertyValue {
  return value == null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length <= 4096)
}

export function descriptorsFor(component: TargetComponent, attributes: readonly string[] = []): readonly PropertyDescriptor[] {
  const known = PROPERTY_DESCRIPTORS[component]
  if (known) return known
  // All other Core modules still get a safe literal editor. Prop names come
  // from AST attributes, never from untrusted DOM or a user-supplied selector;
  // expression-backed values are rendered read-only by PropertyEditorPanel.
  return attributes
    .filter(name => /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !['children', 'key', 'ref', 'className', 'style'].includes(name))
    .map(name => ({name, label: name, kind: 'string' as const, preview: false}))
}

export function isSafePropertyName(component: TargetComponent, property: string): boolean {
  return descriptorsFor(component).some(item => item.name === property) ||
    /^[A-Za-z][A-Za-z0-9_]*$/.test(property)
}
