import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDensityProvider } from '../src/components/ui/DensityContext'
import {
  AppMultiSelect,
  type AppMultiSelectProps,
} from '../src/components/ui/MultiSelect'

const vendor = vi.hoisted(() => ({
  render: vi.fn((_props: Record<string, unknown>) => null),
}))
vi.mock('@astryxdesign/core/MultiSelector', () => ({
  MultiSelector: vendor.render,
}))

const defaults: AppMultiSelectProps = {
  label: 'Project',
  value: [],
  options: [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
  ],
  onChange: () => {},
}
function rendered(
  props: Partial<AppMultiSelectProps> = {},
  density: 'comfortable' | 'compact' | 'touch' = 'comfortable',
) {
  renderToStaticMarkup(
    createElement(AppDensityProvider, {
      density,
      children: createElement(AppMultiSelect, { ...defaults, ...props }),
    }),
  )
  return vendor.render.mock.calls.at(-1)![0]
}

describe('product multi-select wrapper', () => {
  beforeEach(() => vendor.render.mockClear())

  it.each([
    ['comfortable', 'md'],
    ['compact', 'sm'],
    ['touch', 'lg'],
  ] as const)('uses %s density size %s', (density, expected) => {
    expect(rendered({}, density).size).toBe(expected)
  })

  it('keeps explicit size independent of the global density', () => {
    expect(rendered({ size: 'sm' }, 'touch').size).toBe('sm')
  })

  it('uses the package-owned adaptive multiselect and a single-line count trigger', () => {
    expect(rendered()).toMatchObject({
      label: 'Project',
      placeholder: 'Project',
      triggerDisplay: 'count',
      presentation: 'adaptive',
      width: '100%',
      hasClear: true,
      controlStyle: { minWidth: 0, whiteSpace: 'nowrap' },
    })
  })

  it('formats one selection by label and several by field name plus count', () => {
    const format = rendered().formatValue as (
      items: Array<{ value: string; label: string }>,
    ) => string
    expect(format([{ value: 'alpha', label: 'Alpha' }])).toBe('Alpha')
    expect(format(defaults.options)).toBe('Project (2)')
    const localized = rendered({ label: '项目' }).formatValue as typeof format
    expect(localized(defaults.options)).toBe('项目 (2)')
  })

  it('retains controlled values, option identities and the exact change callback', () => {
    const onChange = vi.fn()
    const value = ['alpha']
    const props = rendered({ value, onChange })
    expect(props.value).toBe(value)
    expect(props.options).toBe(defaults.options)
    expect(props.onChange).toBe(onChange)
    ;(props.onChange as (next: string[]) => void)(['alpha', 'beta'])
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta'])
  })

  it('maps product readonly, disabled and hidden-label states without replacing vendor behavior', () => {
    expect(
      rendered({ hiddenLabel: true, disabled: true, readOnly: true }),
    ).toMatchObject({
      isLabelHidden: true,
      isDisabled: true,
      isReadOnly: true,
    })
    expect(rendered()).toMatchObject({
      isLabelHidden: false,
      isDisabled: false,
      isReadOnly: false,
      hasSearch: false,
    })
  })

  it('passes localized search and empty states to the selection surface', () => {
    expect(
      rendered({
        hasSearch: true,
        searchPlaceholder: 'Find projects',
        emptyText: 'No projects',
      }),
    ).toMatchObject({
      hasSearch: true,
      searchPlaceholder: 'Find projects',
      emptyText: 'No projects',
      emptySearchText: 'No projects',
    })
  })
})
