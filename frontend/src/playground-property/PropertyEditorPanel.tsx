import {useEffect, useMemo, useState} from 'react'
import {Button} from '@astryxdesign/core/Button'
import {Card} from '@astryxdesign/core/Card'
import {Heading, Text} from '@astryxdesign/core/Text'
import {HStack, VStack} from '@astryxdesign/core/Layout'
import {
  descriptorsFor,
  type PropertyDescriptor,
  type PropertyValue,
  type TargetSelection,
} from './model'
import {defaultValueFor, displayNameFor, editablePropsFor} from './propDocs'
import {analyzeSource, patchSourceAttribute, readSourceValue} from './sourcePatch'
import type {PropControlDescriptor} from './propType'
import './property-editor.css'

type Props = {
  selection: TargetSelection | null
  code: string
  onCodeChange?: (code: string) => void
  onClose?: () => void
}

function valueFor(
  descriptor: PropertyDescriptor,
  selection: TargetSelection,
  code: string,
  draft: Record<string, PropertyValue>,
) {
  if (Object.hasOwn(draft, descriptor.name)) return draft[descriptor.name]
  const instance = analyzeSource(code).find(entry => entry.component === selection.component && entry.index === selection.index)
  return readSourceValue(instance, descriptor.name, descriptor.defaultValue)
}

function displayValue(value: PropertyValue) {
  return value == null ? '' : String(value)
}

function descriptorFromControl(
  prop: ReturnType<typeof editablePropsFor>[number],
): PropertyDescriptor {
  const control: PropControlDescriptor = prop.control
  if (control.kind === 'enum') {
    return {
      name: prop.name,
      label: prop.name,
      kind: 'enum',
      options: control.options,
      optionValues: control.optionValues,
      defaultValue: defaultValueFor(prop),
      required: prop.required,
      description: prop.type,
      preview: true,
    }
  }
  const kind = control.kind as 'boolean' | 'string' | 'number'
  return {
    name: prop.name,
    label: prop.name,
    kind,
    defaultValue: defaultValueFor(prop),
    required: prop.required,
    description: prop.type,
    preview: true,
  }
}

/**
 * Safe property editor for a selected local Astryx component.
 *
 * It never evaluates source. Literal values are patched with sourcePatch.ts
 * and only committed through the parent editor after Apply, which then
 * recompiles the isolated preview.
 */
export function PropertyEditorPanel({selection, code, onCodeChange, onClose}: Props) {
  const [draft, setDraft] = useState<Record<string, PropertyValue>>({})
  const [draftCode, setDraftCode] = useState(code)
  const descriptors = useMemo(() => {
    if (!selection) return []
    const instance = analyzeSource(code).find(entry => entry.component === selection.component && entry.index === selection.index)
    const documented = editablePropsFor(selection.component).map(descriptorFromControl)
    const sourceDescriptors = documented.length > 0
      ? documented
      : descriptorsFor(selection.component, instance?.attrs.map(attr => attr.name))
    return sourceDescriptors.map(descriptor => {
      const attr = instance?.attrs.find(entry => entry.name === descriptor.name)
      if (descriptor.preview || !attr || attr.kind === 'expression' || attr.kind === 'unknown') return descriptor
      return {...descriptor, kind: attr.kind}
    })
  }, [code, selection])

  useEffect(() => {
    setDraft({})
    setDraftCode(code)
  }, [code, selection?.id])

  if (!selection) {
    return (
      <Card className="pg-property-panel-empty" padding={3} variant="muted">
        <VStack gap={1}>
          <Text type="label" weight="semibold">Targeting</Text>
          <Text type="supporting" color="secondary">Enable target mode, then select an Astryx Core component in the preview.</Text>
        </VStack>
      </Card>
    )
  }

  const update = (descriptor: PropertyDescriptor, value: PropertyValue) => {
    setDraft(current => ({...current, [descriptor.name]: value}))
    const nextCode = patchSourceAttribute(draftCode, selection, descriptor.name, value)
    if (nextCode !== draftCode) setDraftCode(nextCode)
  }

  return (
    <Card className="pg-property-panel" padding={3}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center" width="100%">
          <VStack gap={0} style={{flex: 1}}>
            <Heading level={3}>{displayNameFor(selection.component)}</Heading>
            <Text type="supporting" color="secondary">Instance {selection.index + 1}</Text>
          </VStack>
          {onClose ? <Button label="Close properties" variant="ghost" size="sm" onClick={onClose} /> : null}
        </HStack>
        <div className="pg-property-fields">
          {descriptors.map(descriptor => {
            const value = valueFor(descriptor, selection, draftCode, draft)
            const instance = analyzeSource(draftCode).find(entry => entry.component === selection.component && entry.index === selection.index)
            const attribute = instance?.attrs.find(attr => attr.name === descriptor.name)
            const isExpression = attribute?.kind === 'expression' || attribute?.kind === 'unknown'
            return (
              <label className="pg-property-field" key={descriptor.name}>
                <span>{descriptor.label}</span>
                {isExpression ? <span className="pg-property-readonly">Set in code</span> : descriptor.kind === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={value === true}
                    onChange={event => update(descriptor, event.target.checked)}
                  />
                ) : descriptor.kind === 'enum' ? (
                  <select
                    value={displayValue(value)}
                    title={descriptor.description}
                    onChange={event => update(descriptor, descriptor.optionValues?.[event.target.value] ?? event.target.value)}>
                    {descriptor.options?.map(option => <option value={option} key={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    type={descriptor.kind === 'number' ? 'number' : 'text'}
                    value={displayValue(value)}
                    placeholder={descriptor.kind === 'number' ? 'unset' : 'value'}
                    title={descriptor.description}
                    onChange={event => {
                      const raw = event.target.value
                      update(descriptor, descriptor.kind === 'number' ? (raw === '' ? null : Number(raw)) : raw)
                    }}
                  />
                )}
              </label>
            )
          })}
        </div>
        <Text type="supporting" color="secondary">
          Changes are limited to literal props and are applied to the isolated local preview.
        </Text>
        <Button
          label="Apply changes"
          variant="primary"
          isDisabled={draftCode === code}
          onClick={() => {
            if (draftCode !== code) onCodeChange?.(draftCode)
            onClose?.()
          }}
        />
      </VStack>
    </Card>
  )
}
