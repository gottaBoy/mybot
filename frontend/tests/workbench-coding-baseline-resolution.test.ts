import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodingBaselineResolution } from '../src/workbench/CodingBaselineResolution'
import { reconciliationComparison as comparison } from './coding-reconciliation-fixture'
const m = vi.hoisted(() => ({ selects: [] as any[], areas: [] as any[] }))
vi.mock('../src/components/ui', () => ({
  AppBadge: ({ children }: any) => createElement('span', null, children),
  AppSelect: (props: any) => {
    m.selects.push(props)
    return createElement('select', {
      'aria-label': props.label,
      disabled: props.disabled,
    })
  },
  AppTextArea: (props: any) => {
    m.areas.push(props)
    return createElement('textarea', {
      'aria-label': props.label,
      readOnly: true,
      value: props.value,
    })
  },
}))
beforeEach(() => {
  m.selects = []
  m.areas = []
})
const english = (_zh: string, en: string) => en
function render(overrides: Record<string, any> = {}) {
  return renderToStaticMarkup(
    createElement(CodingBaselineResolution, {
      comparison,
      drafts: {},
      disabled: false,
      stale: false,
      t: english,
      onChange: vi.fn(),
      ...overrides,
    }),
  )
}
describe('three-file baseline resolution controls', () => {
  it('shows all three exact sources and keeps tests current without a resolution control', () => {
    const html = render()
    expect(html).toContain('Old project base')
    expect(html).toContain('Checkpoint code')
    expect(html).toContain('Current project file')
    expect(html).toContain('x=0')
    expect(html).toContain('x=1')
    expect(html).toContain('x=2')
    expect(html).toContain(
      'Tests and read-only sources use current project content',
    )
    expect(m.selects.map((select) => select.label)).toEqual([
      'Starting content · code.py',
    ])
    expect(m.selects[0].options.map((option: any) => option.value)).toEqual([
      '',
      'current',
      'checkpoint',
      'manual',
    ])
  })
  it('accepts a manually chosen empty file without copying a source implicitly', () => {
    const onChange = vi.fn()
    render({ onChange })
    m.selects[0].onChange('manual')
    expect(onChange).toHaveBeenCalledWith('code.py', {
      source: 'manual',
      content: '',
    })
  })
  it('keeps retained manual content visible and escapes source markup', () => {
    const escaped = structuredClone(comparison)
    escaped.current_files[0].content = '<script>untrusted()</script>'
    const html = render({
      comparison: escaped,
      drafts: { 'code.py': { source: 'current', content: 'saved draft' } },
    })
    expect(html).toContain('&lt;script&gt;untrusted()&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Retained manual draft')
    expect(html).toContain('saved draft')
    expect(m.areas).toHaveLength(0)
  })
  it.each([{ stale: true }, { disabled: true }])(
    'blocks stale or busy handlers %j',
    (state) => {
      const onChange = vi.fn()
      render({
        ...state,
        onChange,
        drafts: { 'code.py': { source: 'manual', content: 'x=3\n' } },
      })
      expect(m.selects[0].disabled).toBe(true)
      expect(m.areas[0].isDisabled).toBe(true)
      m.selects[0].onChange('checkpoint')
      m.areas[0].onChange('changed')
      expect(onChange).not.toHaveBeenCalled()
    },
  )
  it('shows UTF8 byte limits for manual drafts', () => {
    const html = render({
      drafts: { 'code.py': { source: 'manual', content: '中'.repeat(11000) } },
    })
    expect(html).toContain('33000 / 32768 bytes')
    expect(html).toContain('wb-error')
  })
})
