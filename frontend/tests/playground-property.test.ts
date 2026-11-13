import {describe, expect, it} from 'vitest'
import {analyzeSource, annotateSource, patchSourceAttribute, readSourceValue} from '../src/playground-property/sourcePatch'
import {CORE_COMPONENTS} from '../src/playground-property/model'
import {editablePropsFor, PROP_DOC_COMPONENTS} from '../src/playground-property/propDocs'

const source = `
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
export default function Example() {
  return <Card padding={4}><Text color="secondary">Hello</Text><Button label="Go" variant="primary" /></Card>;
}
`

describe('playground property source patching', () => {
  it('detects stable component instances and literal props', () => {
    const instances = analyzeSource(source)
    expect(instances.map(instance => instance.id)).toEqual(['Card#0', 'Text#0', 'Button#0'])
    expect(readSourceValue(instances[0], 'padding')).toBe(4)
    expect(readSourceValue(instances[1], 'color')).toBe('secondary')
    expect(readSourceValue(instances[2], 'label')).toBe('Go')
  })

  it('patches an existing literal without changing surrounding source', () => {
    const next = patchSourceAttribute(source, {id: 'Button#0', component: 'Button', index: 0}, 'variant', 'secondary')
    expect(next).toContain('<Button label="Go" variant="secondary" />')
    expect(next).toContain('<Card padding={4}>')
  })

  it('inserts and removes safe literal props', () => {
    const withDisabled = patchSourceAttribute(source, {id: 'Button#0', component: 'Button', index: 0}, 'isDisabled', true)
    expect(withDisabled).toContain('<Button isDisabled label="Go" variant="primary" />')
    const withoutPadding = patchSourceAttribute(source, {id: 'Card#0', component: 'Card', index: 0}, 'padding', null)
    expect(withoutPadding).toContain('<Card>')
  })

  it('annotates a preview copy without mutating the source', () => {
    const annotated = annotateSource(source)
    expect(annotated).toContain('<Card data-mybot-pg-id="Card#0"')
    expect(annotated).toContain('<Text data-mybot-pg-id="Text#0"')
    expect(annotated).toContain('<Button data-mybot-pg-id="Button#0"')
    expect(source).not.toContain('data-mybot-pg-id')
  })

  it('keeps expression-backed props safe and read-only', () => {
    const dynamic = source.replace('padding={4}', 'padding={padding}')
    const instance = analyzeSource(dynamic).find(item => item.component === 'Card')
    expect(instance?.attrs.find(attr => attr.name === 'padding')?.kind).toBe('expression')
    expect(readSourceValue(instance, 'padding')).toBeNull()
  })

  it('uses Babel JSX ranges for generic and non-three-component Core tags', () => {
    const generic = `
      import {Table} from '@astryxdesign/core/Table';
      export default function Example() {
        return <Table<Item> density="compact" rows={rows} />;
      }
    `
    const instances = analyzeSource(generic)
    expect(instances).toHaveLength(1)
    expect(instances[0].component).toBe('Table')
    expect(instances[0].attrs.find(attr => attr.name === 'density')?.value).toBe('compact')
    expect(instances[0].attrs.find(attr => attr.name === 'rows')?.kind).toBe('expression')
    const next = patchSourceAttribute(generic, {id: 'Table#0', component: 'Table', index: 0}, 'density', 'comfortable')
    expect(next).toContain('<Table<Item> density="comfortable" rows={rows} />')
  })

  it('keeps the targeting registry aligned with the pinned Core package', () => {
    expect(CORE_COMPONENTS.has('Button')).toBe(true)
    expect(CORE_COMPONENTS.has('Chat')).toBe(true)
    expect(CORE_COMPONENTS.has('Resizable')).toBe(true)
    expect(CORE_COMPONENTS.has('NotAComponent')).toBe(false)
  })

  it('loads the pinned Astryx PropDoc registry instead of a hand-written subset', () => {
    const button = editablePropsFor('Button')
    const card = editablePropsFor('Card')
    expect(button.map(prop => prop.name)).toContain('elevation')
    expect(button.map(prop => prop.name)).toContain('isInterruptible')
    expect(card.map(prop => prop.name)).toContain('maxWidth')
    expect(card.length).toBeGreaterThan(3)
    expect(PROP_DOC_COMPONENTS.size).toBeGreaterThan(150)
  })
})
