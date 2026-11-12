// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx propertyEditor/componentInstances.ts, commit 5770e5b197.
import {parse} from '@babel/parser'
import {isTargetComponent, type PropertyValue, type TargetSelection} from './model'

export type SourceAttribute = {
  name: string
  start: number
  end: number
  kind: 'string' | 'number' | 'boolean' | 'expression' | 'unknown'
  value?: string | number | boolean
}

export type SourceInstance = TargetSelection & {
  openingStart: number
  nameEnd: number
  attrs: SourceAttribute[]
}

type Node = Record<string, unknown>

function readAttributeValue(attr: Node): Pick<SourceAttribute, 'kind' | 'value'> {
  const value = attr.value as Node | null | undefined
  if (value == null) return {kind: 'boolean', value: true}
  if (value.type === 'StringLiteral') return {kind: 'string', value: value.value as string}
  if (value.type === 'JSXExpressionContainer') {
    const expression = value.expression as Node | null
    if (!expression) return {kind: 'expression'}
    if (expression.type === 'BooleanLiteral') return {kind: 'boolean', value: expression.value as boolean}
    if (expression.type === 'NumericLiteral') return {kind: 'number', value: expression.value as number}
    if (expression.type === 'StringLiteral') return {kind: 'string', value: expression.value as string}
    if (
      expression.type === 'UnaryExpression' &&
      expression.operator === '-' &&
      (expression.argument as Node)?.type === 'NumericLiteral'
    ) return {kind: 'number', value: -((expression.argument as Node).value as number)}
    return {kind: 'expression'}
  }
  return {kind: 'unknown'}
}

function nameEnd(opening: Node, name: Node) {
  const typeArguments = (opening.typeArguments ?? opening.typeParameters) as Node | undefined
  return typeof typeArguments?.end === 'number' ? typeArguments.end : name.end as number
}

/**
 * Babel parsing is intentionally separate from evaluation. A failed parse
 * returns null so editors can retain their previous good analysis mid-keystroke.
 */
export function analyzeSourceResult(code: string): SourceInstance[] | null {
  let ast: Node
  try {
    ast = parse(code, {sourceType: 'module', plugins: ['jsx', 'typescript']}) as unknown as Node
  } catch {
    return null
  }
  const instances: SourceInstance[] = []
  const counts = new Map<string, number>()
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    const current = node as Node
    if (current.type === 'JSXOpeningElement') {
      const name = current.name as Node
      const component = name?.name
      if (name?.type === 'JSXIdentifier' && typeof component === 'string' && isTargetComponent(component)) {
        const attrs: SourceAttribute[] = []
        for (const attr of current.attributes as Node[] ?? []) {
          if (attr.type !== 'JSXAttribute') continue
          const attrName = (attr.name as Node)?.name
          if (typeof attrName !== 'string') continue
          attrs.push({
            name: attrName,
            start: attr.start as number,
            end: attr.end as number,
            ...readAttributeValue(attr),
          })
        }
        const index = counts.get(component) ?? 0
        counts.set(component, index + 1)
        instances.push({
          id: `${component}#${index}`,
          component,
          index,
          openingStart: current.start as number,
          nameEnd: nameEnd(current, name),
          attrs,
        })
      }
    }
    for (const [key, child] of Object.entries(current)) {
      if (key !== 'loc' && key !== 'start' && key !== 'end') walk(child)
    }
  }
  walk(ast)
  return instances
}

export function analyzeSource(code: string): SourceInstance[] {
  return analyzeSourceResult(code) ?? []
}

/** Marker injection applies to the preview copy, never the editor source. */
export function annotateSource(code: string): string {
  const instances = analyzeSourceResult(code)
  if (!instances) return code
  let output = code
  for (const instance of instances.slice().sort((a, b) => b.nameEnd - a.nameEnd)) {
    if (instance.attrs.some(attr => attr.name === 'data-mybot-pg-id')) continue
    output = `${output.slice(0, instance.nameEnd)} data-mybot-pg-id="${instance.id}"${output.slice(instance.nameEnd)}`
  }
  return output
}

export function formatSourceAttribute(name: string, value: PropertyValue): string {
  if (typeof value === 'boolean') return value ? name : `${name}={false}`
  if (typeof value === 'number') return `${name}={${value}}`
  const text = String(value ?? '')
  return /["\\\n\r]/.test(text)
    ? `${name}={${JSON.stringify(text)}}`
    : `${name}="${text}"`
}

export function patchSourceAttribute(code: string, target: TargetSelection, property: string, value: PropertyValue): string {
  const instance = analyzeSource(code).find(entry => entry.component === target.component && entry.index === target.index)
  if (!instance) return code
  const existing = instance.attrs.find(attr => attr.name === property)
  if (existing?.kind === 'expression' || existing?.kind === 'unknown') return code
  if (value == null || value === '') {
    if (!existing) return code
    let start = existing.start
    if (start > 0 && /\s/.test(code[start - 1] ?? '')) start -= 1
    return code.slice(0, start) + code.slice(existing.end)
  }
  const next = formatSourceAttribute(property, value)
  if (existing) return code.slice(0, existing.start) + next + code.slice(existing.end)
  return `${code.slice(0, instance.nameEnd)} ${next}${code.slice(instance.nameEnd)}`
}

export function readSourceValue(instance: SourceInstance | undefined, property: string, fallback?: PropertyValue): PropertyValue {
  return instance?.attrs.find(attr => attr.name === property)?.value ?? fallback ?? null
}

