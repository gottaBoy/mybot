import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TaskPlanPanel,
  TaskDependencyFacts,
} from '../src/workbench/TaskPlanPanel'
import {
  nestedRead,
  containerGate,
  grandchildGates,
} from './task-plan-nesting-fixture'
const m = vi.hoisted(() => ({ buttons: [] as any[] }))
vi.mock('../src/components/ui', () => ({
  AppButton: (props: any) => {
    m.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      { href: props.href, 'aria-label': props.label, disabled: props.disabled },
      props.label,
    )
  },
  AppBadge: ({ children }: any) => createElement('span', null, children),
  AppLoading: ({ label }: any) => createElement('p', null, label),
}))
beforeEach(() => {
  m.buttons = []
})
const t = (_zh: string, en: string) => en
describe('one Task tree nested composition', () => {
  it('presents parent navigation, local children and exact review facts without a parent success claim', () => {
    const html = renderToStaticMarkup(
      createElement(TaskPlanPanel, {
        value: nestedRead,
        busy: false,
        t,
        onRefresh: vi.fn(),
        onCreate: vi.fn(),
        canCreate: true,
        nestedEnabled: true,
        revisionsEnabled: true,
        onRevise: vi.fn(),
      }),
    )
    expect(html).toContain('#task/root-a')
    expect(html).toContain('#task/grandchild-1')
    expect(html).toContain('Current plan')
    expect(html).toContain('Direct child reports accepted')
    expect(html).toContain('0 / 2')
    expect(html).not.toContain('%')
    expect(html).not.toContain('Task completed')
    expect(
      m.buttons.find((button) => button.label === 'Revise plan').disabled,
    ).toBe(false)
  })
  it('shows inherited prerequisites and their exact current reasons', () => {
    const gate = structuredClone(grandchildGates[0])
    gate.external_scopes[1].prerequisites = [
      containerGate.own_plan!.children[1],
    ]
    gate.ready = false
    const html = renderToStaticMarkup(
      createElement(TaskDependencyFacts, { gate, t }),
    )
    expect(html).toContain('Inherited ancestor prerequisites')
    expect(html).toContain('Not run')
    expect(html).toContain('Execution conditions unmet')
  })
  it('permits planning while execution is blocked but keeps the depth limit visible', () => {
    const create = vi.fn()
    const value = {
      ...nestedRead,
      plan: null,
      gate: { ...containerGate, own_plan: null },
    }
    renderToStaticMarkup(
      createElement(TaskPlanPanel, {
        value,
        busy: false,
        t,
        onRefresh: vi.fn(),
        onCreate: create,
        canCreate: true,
        nestedEnabled: true,
      }),
    )
    expect(
      m.buttons.find((button) => button.label === 'Break down task').disabled,
    ).toBe(false)
    m.buttons = []
    renderToStaticMarkup(
      createElement(TaskPlanPanel, {
        value: { ...value, depth: 2, gate: grandchildGates[0] },
        busy: false,
        t,
        onRefresh: vi.fn(),
        onCreate: create,
        canCreate: true,
        nestedEnabled: true,
      }),
    )
    expect(
      m.buttons.find((button) => button.label === 'Break down task').disabled,
    ).toBe(true)
  })
})
