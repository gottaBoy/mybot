import rawDocs from './prop-docs.generated.json'
import {
  coerceDefault,
  isSupportedControl,
  parsePropType,
  type PropControlDescriptor,
} from './propType'

export type PropDoc = {
  name: string
  type: string
  required?: boolean
  default?: string
  slotElements?: readonly {__element: string}[]
}

type ComponentPropDocs = {
  displayName: string
  props: PropDoc[]
}

const registry = rawDocs.components as Record<string, ComponentPropDocs>

export const PROP_DOC_COMPONENTS = new Set(Object.keys(registry))

export function propDocsFor(component: string): readonly PropDoc[] {
  return registry[component]?.props ?? []
}

export function displayNameFor(component: string): string {
  return registry[component]?.displayName ?? component
}

export type EditablePropDoc = PropDoc & {
  control: PropControlDescriptor
}

export function editablePropsFor(component: string): readonly EditablePropDoc[] {
  return propDocsFor(component)
    .map(prop => ({...prop, control: parsePropType(prop.type, prop.name, prop.slotElements)}))
    .filter(prop => isSupportedControl(prop.control))
}

export function defaultValueFor(prop: EditablePropDoc) {
  return coerceDefault(prop.default, prop.control)
}
