import { describe, expect, it } from 'vitest'
import { createNavigationHistoryController } from '../src/workbench/navigation-guard'

describe('global form admission shares the draft guard', () => {
  it('blocks form replacement while a page is dirty or its write outcome is unknown', () => {
    const entry = {
      href: 'http://localhost/#workflows',
      state: null as unknown,
    }
    const controller = createNavigationHistoryController({
      read: () => ({ ...entry }),
      push: (state, href) => Object.assign(entry, { state, href }),
      replace: (state, href) => Object.assign(entry, { state, href }),
      go: () => {},
      publish: () => {},
    })
    const protectedState = { dirty: false, busy: false }
    const unregister = controller.register({
      getState: () => protectedState,
      onBlocked: () => {},
    })
    expect(controller.canOpenForm()).toBe(true)
    protectedState.dirty = true
    expect(controller.canOpenForm()).toBe(false)
    protectedState.dirty = false
    protectedState.busy = true
    expect(controller.canOpenForm()).toBe(false)
    unregister()
    expect(controller.canOpenForm()).toBe(true)
  })
})
