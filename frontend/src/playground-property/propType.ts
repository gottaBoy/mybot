// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx component-detail/parsePropType.ts.

export type EnumOptionValue = string | number | boolean

export type ElementOption = {
  label: string
  componentName: string
}

export type PropControlDescriptor =
  | {
      kind: 'enum'
      options: string[]
      allowEmpty: boolean
      optionValues?: Record<string, EnumOptionValue>
    }
  | {kind: 'boolean'}
  | {kind: 'string'}
  | {kind: 'number'}
  | {kind: 'unknown'}
  | {kind: 'element'; options: ElementOption[]}
  | {kind: 'slot-list'; options: ElementOption[]}
  | {kind: 'callback'}
  | {kind: 'input-status'; options: string[]; allowEmpty: boolean}

const STRING_LITERAL_RE = /^['"]([^'"]*)['"]$/
const NUMBER_LITERAL_RE = /^-?\d+(\.\d+)?$/
const CALLBACK_RE = /=>/
const NODE_TYPE_RE = /\b(ReactNode|ReactElement|JSX\.Element|ReactChild)\b/
const REACT_ELEMENT_RE = /ReactElement<(?:[A-Za-z_$][\w$]*\.)?([A-Z][A-Za-z0-9_$]*)Props>/g

function splitUnion(input: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  let quote: string | null = null
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote) {
      if (char === quote && input[index - 1] !== '\\') quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if ('([{<'.includes(char)) depth += 1
    else if (')]}>' .includes(char)) depth -= 1
    else if (char === '|' && depth === 0) {
      parts.push(input.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(input.slice(start).trim())
  return parts.filter(Boolean)
}

export function parsePropType(
  type: string,
  propName?: string,
  slotElements?: readonly {__element: string}[],
): PropControlDescriptor {
  const value = type.trim()
  if (!value) return {kind: 'unknown'}

  if (slotElements?.length) {
    const options = slotElements.map(element => ({
      label: element.__element.replace(/^XDS/, ''),
      componentName: element.__element,
    }))
    return propName === 'children'
      ? {kind: 'slot-list', options}
      : {kind: 'element', options}
  }

  if (CALLBACK_RE.test(value)) return {kind: 'callback'}
  if (value === 'boolean') return {kind: 'boolean'}
  if (value === 'string') return {kind: 'string'}
  if (value === 'number' || value === 'SizeValue') return {kind: 'number'}
  if (value === 'SpacingStep') {
    return {
      kind: 'enum',
      options: ['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '10'],
      allowEmpty: false,
    }
  }
  if (value === 'AppShellBreakpoint') {
    return {kind: 'enum', options: ['sm', 'md', 'lg', 'none'], allowEmpty: false}
  }
  if (value === 'ReactNode' || value === 'StyleXStyles' || value === 'AriaRole') {
    return {kind: 'unknown'}
  }

  const elementOptions: ElementOption[] = []
  REACT_ELEMENT_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = REACT_ELEMENT_RE.exec(value)) !== null) {
    elementOptions.push({
      label: match[1].replace(/^XDS/, ''),
      componentName: match[1],
    })
  }
  if (elementOptions.length) return {kind: 'element', options: elementOptions}
  if (NODE_TYPE_RE.test(value)) return {kind: 'unknown'}

  const parts = splitUnion(value)
  const nonNullish = parts.filter(part => part !== 'null' && part !== 'undefined')
  if (nonNullish.length > 0 && nonNullish.every(part => part === 'string' || part === 'number')) {
    return {kind: 'string'}
  }

  const options: string[] = []
  const optionValues: Record<string, EnumOptionValue> = {}
  let allowEmpty = false
  let onlyLiterals = true
  let hasNonBoolean = false
  let hasOptionValues = false
  const add = (option: string, value?: EnumOptionValue) => {
    if (!options.includes(option)) options.push(option)
    if (value !== undefined) {
      optionValues[option] = value
      hasOptionValues = true
    }
  }

  for (const part of parts) {
    if (part === 'null' || part === 'undefined') {
      allowEmpty = true
    } else if (part === 'boolean') {
      add('true', true)
      add('false', false)
    } else {
      const stringMatch = STRING_LITERAL_RE.exec(part)
      if (stringMatch) {
        hasNonBoolean = true
        add(stringMatch[1])
      } else if (NUMBER_LITERAL_RE.test(part)) {
        hasNonBoolean = true
        add(part, Number(part))
      } else if (part === 'true' || part === 'false') {
        add(part, part === 'true')
      } else {
        onlyLiterals = false
        break
      }
    }
  }

  if (onlyLiterals && options.length >= 2) {
    if (!hasNonBoolean) return {kind: 'boolean'}
    return {
      kind: 'enum',
      options,
      allowEmpty,
      ...(hasOptionValues ? {optionValues} : {}),
    }
  }
  return {kind: 'unknown'}
}

export function coerceEnumOption(
  control: Extract<PropControlDescriptor, {kind: 'enum'}>,
  option: string,
): EnumOptionValue {
  return control.optionValues?.[option] ?? option
}

export function coerceDefault(
  raw: string | undefined,
  control: PropControlDescriptor,
): string | number | boolean | undefined {
  if (raw == null) return undefined
  const value = raw.trim()
  if (!value || value.startsWith('the theme')) return undefined
  const stringMatch = STRING_LITERAL_RE.exec(value)
  if (stringMatch) return stringMatch[1]
  if (value === 'true') return true
  if (value === 'false') return false
  if (control.kind === 'number' && NUMBER_LITERAL_RE.test(value)) return Number(value)
  if (control.kind === 'enum' && control.optionValues?.[value] !== undefined) {
    return control.optionValues[value]
  }
  return value
}

export function isSupportedControl(control: PropControlDescriptor): boolean {
  return control.kind === 'boolean' ||
    control.kind === 'enum' ||
    control.kind === 'string' ||
    control.kind === 'number'
}
