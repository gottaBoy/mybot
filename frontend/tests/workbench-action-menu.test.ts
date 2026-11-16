import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppActionMenu } from '../src/components/ui/ActionMenu'
import { AppDensityProvider } from '../src/components/ui/DensityContext'

const vendor = vi.hoisted(() => ({
  render: vi.fn((_props: Record<string, unknown>) => null),
}))
vi.mock('@astryxdesign/core/DropdownMenu', () => ({
  DropdownMenu: vendor.render,
}))

function render(density: 'comfortable' | 'compact' | 'touch' = 'comfortable') {
  const onSelect = vi.fn()
  const onOpenChange = vi.fn()
  renderToStaticMarkup(
    createElement(AppDensityProvider, {
      density,
      children: createElement(AppActionMenu, {
        label: 'Views',
        open: true,
        onOpenChange,
        iconOnly: true,
        items: [
          {
            id: 'save',
            label: 'Save',
            disabled: true,
            description: 'Apply query first',
            onSelect,
          },
          { type: 'divider' },
          {
            type: 'section',
            id: 'records',
            title: 'Saved views',
            items: [
              {
                id: 'remove',
                label: 'Delete',
                destructive: true,
                keepOpen: true,
                onSelect,
              },
            ],
          },
        ],
      }),
    }),
  )
  return { props: vendor.render.mock.calls.at(-1)![0], onSelect, onOpenChange }
}

describe('product action menu wrapper', () => {
  beforeEach(() => vendor.render.mockClear())

  it.each([
    ['comfortable', 'md'],
    ['compact', 'sm'],
    ['touch', 'lg'],
  ] as const)(
    'uses %s density with an accessible named trigger',
    (density, size) => {
      expect(render(density).props).toMatchObject({
        presentation: 'adaptive',
        isMenuOpen: true,
        button: {
          label: 'Views',
          size,
          isIconOnly: true,
          isDisabled: false,
          isLoading: false,
        },
      })
    },
  )

  it('preserves action identity, disabled explanations and destructive commands', () => {
    const { props, onSelect, onOpenChange } = render()
    expect(props.onOpenChange).toBe(onOpenChange)
    expect(props.items).toEqual([
      expect.objectContaining({
        id: 'save',
        label: 'Save',
        isDisabled: true,
        description: 'Apply query first',
        hasCloseOnSelect: true,
        onClick: onSelect,
      }),
      { type: 'divider' },
      expect.objectContaining({
        type: 'section',
        id: 'records',
        title: 'Saved views',
        items: [
          expect.objectContaining({
            id: 'remove',
            variant: 'destructive',
            hasCloseOnSelect: false,
            onClick: onSelect,
          }),
        ],
      }),
    ])
  })
})
