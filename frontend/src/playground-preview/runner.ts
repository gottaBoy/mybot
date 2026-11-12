// Copyright (c) Meta Platforms, Inc. and affiliates.
// Architecture adapted from Astryx Playground preview/runner.ts (MIT).

/**
 * Restricted in-browser TSX runner for the opaque-origin preview iframe.
 *
 * This intentionally mirrors Astryx's preview runner: TypeScript transpiles
 * source to CommonJS, then a small resolver maps only pre-bundled modules.
 * There is no network loader, filesystem access, parent-window reference, or
 * business API in this scope. The iframe's sandbox and CSP remain the primary
 * isolation boundary.
 */
import React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import * as Core from '@astryxdesign/core'
import * as CoreTheme from '@astryxdesign/core/theme'
import * as CoreTokens from '@astryxdesign/core/theme/tokens.stylex'
import * as CoreChat from '@astryxdesign/core/Chat'
import * as CoreResizable from '@astryxdesign/core/Resizable'
import * as Hooks from '@astryxdesign/core/hooks'
import * as Utils from '@astryxdesign/core/utils'
import * as Lucide from 'lucide-react'
import * as Recharts from 'recharts'
import * as HeroiconsOutline from '@heroicons/react/24/outline'
import * as HeroiconsSolid from '@heroicons/react/24/solid'
import * as ThemeNeutral from '@astryxdesign/theme-neutral/built'
import * as ThemeButter from '@astryxdesign/theme-butter/built'
import * as ThemeChocolate from '@astryxdesign/theme-chocolate/built'
import * as ThemeGothic from '@astryxdesign/theme-gothic/built'
import * as ThemeMatcha from '@astryxdesign/theme-matcha/built'
import * as ThemeStone from '@astryxdesign/theme-stone/built'
import * as ThemeY2k from '@astryxdesign/theme-y2k/built'
import * as ts from 'typescript'
import type {ComponentType} from 'react'

type RunPhase = 'compile' | 'runtime'
export type RunResult =
  | {Component: ComponentType; error?: undefined; phase?: undefined}
  | {Component?: undefined; error: string; phase: RunPhase}

type ModuleExports = Record<string, unknown>

const modules: Record<string, ModuleExports> = {
  react: {...React, default: React},
  'react/jsx-runtime': ReactJsxRuntime,
  'react-dom': ReactDom,
  '@astryxdesign/core': Core,
  '@astryxdesign/core/theme': CoreTheme,
  '@astryxdesign/core/theme/tokens.stylex': CoreTokens,
  '@astryxdesign/core/Chat': CoreChat,
  '@astryxdesign/core/Resizable': CoreResizable,
  '@astryxdesign/core/hooks': Hooks,
  '@astryxdesign/core/utils': Utils,
  '@stylexjs/stylex': {},
  stylex: {},
  'lucide-react': Lucide,
  recharts: Recharts,
  '@heroicons/react/24/outline': HeroiconsOutline,
  '@heroicons/react/24/solid': HeroiconsSolid,
  '@astryxdesign/theme-neutral/built': ThemeNeutral,
  '@astryxdesign/theme-butter/built': ThemeButter,
  '@astryxdesign/theme-chocolate/built': ThemeChocolate,
  '@astryxdesign/theme-gothic/built': ThemeGothic,
  '@astryxdesign/theme-matcha/built': ThemeMatcha,
  '@astryxdesign/theme-stone/built': ThemeStone,
  '@astryxdesign/theme-y2k/built': ThemeY2k,
}

const allowedModule = (id: string) =>
  id === 'react' ||
  id === 'react-dom' ||
  id === 'react/jsx-runtime' ||
  id === 'lucide-react' ||
  id === 'recharts' ||
  id === '@stylexjs/stylex' ||
  id === 'stylex' ||
  id === '@heroicons/react/24/outline' ||
  id === '@heroicons/react/24/solid' ||
  id === '@heroicons/react/20/solid' ||
  id === '@heroicons/react/16/solid' ||
  id === '@astryxdesign/core' ||
  (id.startsWith('@astryxdesign/core/') && (
    id === '@astryxdesign/core/theme' ||
    id === '@astryxdesign/core/theme/tokens.stylex' ||
    id === '@astryxdesign/core/hooks' ||
    id === '@astryxdesign/core/utils' ||
    CORE_SUBPATHS.has(id.slice('@astryxdesign/core/'.length))
  )) ||
  ['neutral', 'butter', 'chocolate', 'gothic', 'matcha', 'stone', 'y2k']
    .some(theme => id === `@astryxdesign/theme-${theme}/built`)

const assetImport = /\.(?:png|jpe?g|gif|svg|webp|ico|bmp|css|scss|less|sass|woff2?|ttf|eot|otf|mp4|webm|ogg|mp3|wav)$/i

// Public single-segment exports from @astryxdesign/core 0.7.x. Keeping this
// registry explicit prevents a typo or private package path from silently
// resolving to the root barrel.
const CORE_SUBPATHS = new Set([
  'BaseProps', 'AlertDialog', 'AppShell', 'AspectRatio', 'Avatar', 'AvatarGroup',
  'Badge', 'Banner', 'Blockquote', 'BottomSheet', 'Breadcrumbs', 'Button',
  'ButtonGroup', 'Calendar', 'Card', 'Carousel', 'Center', 'Chat',
  'CheckboxInput', 'CheckboxList', 'Citation', 'ClickableCard', 'Code', 'CodeBlock',
  'Collapsible', 'CommandPalette', 'ComplexSelector', 'ContextMenu', 'DateInput',
  'DateRangeInput', 'DateTimeInput', 'Dialog', 'Divider', 'Drawer', 'DropdownMenu',
  'EmptyState', 'Field', 'FieldStatus', 'FileInput', 'FormLayout', 'Grid', 'HStack',
  'Heading', 'HoverCard', 'Icon', 'IconButton', 'Indicator', 'InfoTip', 'InputGroup',
  'InteractiveRoleContext', 'Item', 'Kbd', 'Layer', 'Layout', 'Lightbox', 'Link',
  'List', 'Markdown', 'MetadataList', 'MobileNav', 'MoreMenu', 'MultiSelector',
  'NavIcon', 'NavMenu', 'NumberInput', 'Outline', 'OverflowList', 'Overlay',
  'Pagination', 'Popover', 'PowerSearch', 'ProgressBar', 'RadioList', 'Resizable',
  'ScrollableArea', 'Section', 'SegmentedControl', 'SelectableCard', 'Selector',
  'SideNav', 'SizeContext', 'Skeleton', 'Slider', 'SnapPaging', 'Spinner', 'Stack',
  'StatusDot', 'Stepper', 'Switch', 'TabList', 'Table', 'Text', 'TextArea',
  'TextInput', 'Thumbnail', 'TimeInput', 'Timer', 'Timestamp', 'Toast',
  'ToggleButton', 'Token', 'Tokenizer', 'Toolbar', 'Tooltip', 'TopNav', 'TreeList',
  'Typeahead', 'VStack', 'VisuallyHidden',
])

function moduleIds(source: string): string[] {
  const ids: string[] = []
  const file = ts.createSourceFile('mybot-playground.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !(ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) &&
      !(ts.isExportDeclaration(node) && node.isTypeOnly)
    ) {
      ids.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      ids.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return ids
}

function assertSourceAllowed(source: string) {
  const blocked = moduleIds(source).find(id => !allowedModule(id) && !assetImport.test(id))
  if (blocked) throw new Error(`Import "${blocked}" is not allowed in the local preview.`)
  if (/\b(?:globalThis|global\.process|process\.env|__dirname|__filename)\b/.test(source)) {
    throw new Error('Node and process globals are not available in the local preview.')
  }
}

type StyleValue = string | number | Record<string, string | number>
const unitless = new Set([
  'opacity', 'zIndex', 'fontWeight', 'lineHeight', 'flex', 'flexGrow',
  'flexShrink', 'order', 'gridColumn', 'gridRow', 'gridColumnStart',
  'gridColumnEnd', 'gridRowStart', 'gridRowEnd', 'columnCount',
  'aspectRatio', 'scale', 'tabSize',
])
const kebab = (name: string) => name.startsWith('--') ? name : name.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)
const cssValue = (property: string, value: string | number) =>
  typeof value === 'number' && !unitless.has(property) ? `${value}px` : String(value)
const hash = (input: string) => {
  let value = 5381
  for (let i = 0; i < input.length; i += 1) value = (value * 33) ^ input.charCodeAt(i)
  return `mybot-pg-${(value >>> 0).toString(36)}`
}
const sheetRules = new Set<string>()
let sheet: HTMLStyleElement | null = null
const inject = (rule: string) => {
  if (typeof document === 'undefined' || sheetRules.has(rule)) return
  sheetRules.add(rule)
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = 'mybot-playground-stylex'
    document.head.appendChild(sheet)
  }
  sheet.appendChild(document.createTextNode(rule))
}
const pseudo = (condition: string) =>
  condition === 'default' || condition.startsWith('@') ? '' : condition
const selector = (className: string, condition: string) => `.${className}${pseudo(condition)}`
const atRule = (condition: string, declaration: string) =>
  condition.startsWith('@') ? `${condition}{${declaration}}` : declaration
const compileStyle = (property: string, value: StyleValue) => {
  const className = hash(`${property}:${JSON.stringify(value)}`)
  if (value && typeof value === 'object') {
    for (const [condition, conditionalValue] of Object.entries(value)) {
      const declaration = `${selector(className, condition)}{${kebab(property)}:${cssValue(property, conditionalValue)}}`
      inject(atRule(condition, declaration))
    }
  } else {
    inject(`.${className}{${kebab(property)}:${cssValue(property, value)}}`)
  }
  return className
}
function compileRule(rule: Record<string, unknown>) {
  const compiled: Record<string, unknown> = {$$css: true}
  for (const [property, value] of Object.entries(rule)) {
    if (value != null && (typeof value === 'string' || typeof value === 'number' || typeof value === 'object')) {
      compiled[property] = compileStyle(property, value as StyleValue)
    }
  }
  return compiled
}
function stylexProps(...values: unknown[]) {
  const byProperty: Record<string, string> = {}
  const classes: string[] = []
  for (const value of values.flat(Infinity)) {
    if (!value || typeof value !== 'object') continue
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (key === '$$css' || typeof raw !== 'string') continue
      if (key === 'className') classes.push(raw)
      else byProperty[key] = raw
    }
  }
  return {className: [...classes, ...Object.values(byProperty)].join(' ') || undefined}
}
const stylexMock: ModuleExports = {
  create(styles: Record<string, unknown>) {
    const output: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(styles)) {
      if (typeof value === 'function') {
        output[name] = (...args: unknown[]) => compileRule((value as (...args: unknown[]) => Record<string, unknown>)(...args))
      } else if (value && typeof value === 'object') {
        output[name] = compileRule(value as Record<string, unknown>)
      } else {
        output[name] = value
      }
    }
    return output
  },
  props: stylexProps,
  defineVars: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  keyframes: (value: unknown) => value,
  defaultMarker: () => ({'--mybot-style-marker': 'default'}),
  defineMarker: () => ({'--mybot-style-marker': hash(String(Math.random()))}),
  when: {ancestor: (value: string) => value},
  types: {},
}
modules['@stylexjs/stylex'] = {...stylexMock, default: stylexMock}
modules.stylex = {...stylexMock, default: stylexMock}

const lookup = (id: string): ModuleExports => {
  if (assetImport.test(id)) return {default: '', __esModule: true}
  const exact = modules[id]
  if (exact) return {...exact, __esModule: true}
  if (id.startsWith('@astryxdesign/core/')) {
    if (id === '@astryxdesign/core/theme') return {...CoreTheme, __esModule: true}
    if (id === '@astryxdesign/core/theme/tokens.stylex') return {...CoreTokens, __esModule: true}
    if (id === '@astryxdesign/core/Chat') return {...CoreChat, __esModule: true}
    if (id === '@astryxdesign/core/Resizable') return {...CoreResizable, __esModule: true}
    if (id === '@astryxdesign/core/hooks') return {...Hooks, __esModule: true}
    if (id === '@astryxdesign/core/utils') return {...Utils, __esModule: true}
    const name = id.slice('@astryxdesign/core/'.length)
    if (Object.hasOwn(Core, name)) return {...Core, __esModule: true}
  }
  if (id === '@heroicons/react/20/solid' || id === '@heroicons/react/16/solid') return {...HeroiconsSolid, __esModule: true}
  if (id.startsWith('@astryxdesign/theme-')) {
    const theme = id.includes('neutral') ? ThemeNeutral : id.includes('butter') ? ThemeButter :
      id.includes('chocolate') ? ThemeChocolate : id.includes('gothic') ? ThemeGothic :
      id.includes('matcha') ? ThemeMatcha : id.includes('stone') ? ThemeStone : ThemeY2k
    return {...theme, __esModule: true}
  }
  throw new Error(`Module "${id}" is not available in the local preview.`)
}

const reservedGlobals = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'RegExp', 'Error', 'Function', 'Proxy', 'Reflect', 'JSON', 'Math', 'Intl', 'Image', 'Event', 'URL'])

function globals() {
  const result: Record<string, unknown> = {React}
  for (const value of Object.values(modules)) {
    for (const [key, item] of Object.entries(value)) {
      if (key !== 'default' && key !== '__esModule' && /^[$A-Z_a-z][$\w]*$/.test(key) && !reservedGlobals.has(key)) result[key] = item
    }
  }
  return result
}

const deniedWindowKeys = new Set([
  'parent', 'top', 'opener', 'fetch', 'XMLHttpRequest', 'WebSocket',
  'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'caches',
  'open',
])
const safeWindow = typeof window === 'undefined' ? undefined : new Proxy(window, {
  get(target, property) {
    if (typeof property === 'string' && deniedWindowKeys.has(property)) return undefined
    const value = Reflect.get(target, property, target)
    return typeof value === 'function' ? value.bind(target) : value
  },
})
const blockedGlobals: Record<string, unknown> = {
  globalThis: undefined,
  parent: undefined,
  top: undefined,
  opener: undefined,
  fetch: undefined,
  XMLHttpRequest: undefined,
  WebSocket: undefined,
  EventSource: undefined,
  localStorage: undefined,
  sessionStorage: undefined,
  indexedDB: undefined,
  caches: undefined,
}

function declaredIdentifiers(source: string) {
  const names = new Set<string>()
  const re = /^(?:export\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) names.add(match[1])
  return names
}

function compile(source: string) {
  assertSourceAllowed(source)
  const result = ts.transpileModule(source, {
    fileName: 'mybot-playground.tsx',
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowJs: false,
      sourceMap: false,
    },
  })
  const diagnostics = result.diagnostics ?? []
  if (diagnostics.length) {
    const message = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n')
    throw new Error(message)
  }
  return result.outputText
}

function evaluate(compiled: string): ComponentType {
  const exportsObject: ModuleExports = {}
  const moduleObject = {exports: exportsObject}
  const available: Record<string, unknown> = {...globals(), window: safeWindow, ...blockedGlobals}
  const declared = declaredIdentifiers(compiled)
  const names = Object.keys(available).filter(name => !declared.has(name) && !['module', 'exports', 'require'].includes(name))
  const require = (id: string) => lookup(id)
  const fn = new Function('module', 'exports', 'require', ...names, compiled)
  fn(moduleObject, exportsObject, require, ...names.map(name => available[name]))
  const exported = (moduleObject.exports as ModuleExports).default
  if (typeof exported !== 'function') throw new Error('No default export found. Add `export default function Component()`.')
  return exported as ComponentType
}

export function runCode(source: string): RunResult {
  let compiled: string
  try {
    compiled = compile(source)
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error), phase: 'compile'}
  }
  try {
    return {Component: evaluate(compiled)}
  } catch (error) {
    return {error: error instanceof Error ? error.message : String(error), phase: 'runtime'}
  }
}
