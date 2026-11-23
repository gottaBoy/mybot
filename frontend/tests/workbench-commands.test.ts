import { describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import {
  buildWorkbenchCommands,
  buildWorkbenchNavigationCommands,
  canOpenWorkbenchCommands,
  commandOverlaySelectors,
  hasBlockingCommandOverlay,
  type CommandScope,
} from '../src/workbench/commands-source'

const english = (_: string, en: string) => en
function fixture(): Bootstrap {
  return {
    projects: [
      { id: 'p1', name: 'Research lab', goal: '', directory: '', notes: '' },
    ],
    tasks: Array.from({ length: 45 }, (_, index) => ({
      id: `task-${index}`,
      project_id: 'p1',
      title: `Research ${index}`,
      goal: '',
      acceptance: '',
      files: [],
    })),
    runs: Array.from({ length: 40 }, (_, index) => ({
      id: `run-${index}`,
      task_id: `task-${index}`,
      status: 'succeeded',
      created_at: `2026-11-14T00:${String(index).padStart(2, '0')}:00Z`,
    })),
    models: [],
    backends: [],
    workspace: '',
    default_model_id: '',
    local_harnesses: [],
    capabilities: { backend_sync: false },
  }
}
const scope: CommandScope = {
  hasData: true,
  formOpen: false,
  menuOpen: false,
  preferencesOpen: false,
  commandsOpen: false,
  overlayOpen: false,
  textEditing: false,
}
const shortcut = {
  key: 'k',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  isComposing: false,
  repeat: false,
}

describe('global command source', () => {
  it('builds navigation without accessing Bootstrap domain arrays', () => {
    const commands = buildWorkbenchNavigationCommands(english)
    expect(commands).toHaveLength(12)
    expect(commands.every((item) => item.id.startsWith('nav:'))).toBe(true)
    expect(commands.map((item) => item.href)).toContain('#workbench')
  })
  it('includes every real task, including never-run IDs beyond the Run cap', () => {
    const commands = buildWorkbenchCommands(fixture(), english)
    expect(commands.filter((item) => item.id.startsWith('task:'))).toHaveLength(
      45,
    )
    expect(commands.find((item) => item.id === 'task:task-44')).toMatchObject({
      label: 'Research 44 · task-44',
      group: 'Tasks',
      keywords: ['task-44', 'Research 44', 'p1', 'Research lab'],
    })
  })
  it('opens the exact task workspace without a provider or execution action', () => {
    const commands = buildWorkbenchCommands(fixture(), english)
    const task = commands.find((item) => item.id === 'task:task-44')!
    expect(task.href).toBe('#task/task-44')
    expect(task.href).not.toContain('run')
    expect(commands.every((item) => item.href.startsWith('#'))).toBe(true)
    expect(commands.every((item) => !('onSelect' in item))).toBe(true)
  })
  it('includes all real page destinations and projects without invented recents', () => {
    const commands = buildWorkbenchCommands(fixture(), english)
    expect(
      commands
        .filter((item) => item.id.startsWith('nav:'))
        .map((item) => item.href),
    ).toEqual([
      '#overview',
      '#workbench',
      '#inbox',
      '#projects',
      '#hierarchy',
      '#documents',
      '#models',
      '#workflows',
      '#devices',
      '#backends',
      '#login',
      '#templates',
    ])
    expect(commands.find((item) => item.id === 'project:p1')).toMatchObject({
      group: 'Projects',
      href: '#project/p1',
    })
    expect(commands.some((item) => /recent|user/i.test(item.group))).toBe(false)
  })
  it('caps only Run records at the latest 30 and distinguishes their labels', () => {
    const records = buildWorkbenchCommands(fixture(), english).filter((item) =>
      item.id.startsWith('run:'),
    )
    expect(records).toHaveLength(30)
    expect(records[0]).toMatchObject({
      id: 'run:run-39',
      label: 'Run record · Research 39 · run-39',
      group: 'Run records',
      href: '#run/run-39',
    })
    expect(records.at(-1)?.id).toBe('run:run-10')
  })
  it('builds and searches local commands without networking or mutating inputs', () => {
    const data = fixture()
    const before = structuredClone(data)
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      const commands = buildWorkbenchCommands(data, english)
      expect(
        commands.filter((item) =>
          item.keywords.some((keyword) =>
            keyword.toLowerCase().includes('task-44'),
          ),
        ),
      ).toHaveLength(1)
      expect(fetch).not.toHaveBeenCalled()
      expect(data).toEqual(before)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('command keyboard scope', () => {
  it('accepts Ctrl+K and Meta+K without changing the event or scope', () => {
    expect(canOpenWorkbenchCommands(shortcut, scope)).toBe(true)
    expect(
      canOpenWorkbenchCommands(
        { ...shortcut, key: 'K', ctrlKey: false, metaKey: true },
        scope,
      ),
    ).toBe(true)
    expect(shortcut.defaultPrevented).toBe(false)
    expect(scope.commandsOpen).toBe(false)
  })
  it.each([
    { defaultPrevented: true },
    { isComposing: true },
    { repeat: true },
    { altKey: true },
    { ctrlKey: false },
    { key: 'j' },
  ])('ignores handled, composing, repeated or unrelated input %j', (patch) => {
    expect(canOpenWorkbenchCommands({ ...shortcut, ...patch }, scope)).toBe(
      false,
    )
  })
  it.each([
    { hasData: false },
    { formOpen: true },
    { menuOpen: true },
    { preferencesOpen: true },
    { commandsOpen: true },
    { overlayOpen: true },
    { textEditing: true },
  ])('does not layer commands over an occupied scope %j', (patch) => {
    expect(canOpenWorkbenchCommands(shortcut, { ...scope, ...patch })).toBe(
      false,
    )
  })
})

describe('semantic overlay guard', () => {
  function rootWith(
    target: string,
    visible = true,
    hidden = false,
  ): Pick<Document, 'querySelectorAll'> {
    return {
      querySelectorAll: vi.fn((selector: string) =>
        selector === target
          ? [
              {
                closest: () => (hidden ? {} : null),
                getClientRects: () => (visible ? [{}] : []),
              },
            ]
          : [],
      ),
    } as unknown as Pick<Document, 'querySelectorAll'>
  }
  it.each(commandOverlaySelectors)(
    'blocks a visible active semantic overlay %s',
    (selector) => {
      expect(hasBlockingCommandOverlay(rootWith(selector))).toBe(true)
    },
  )
  it('ignores hidden or non-rendered mounted overlays', () => {
    expect(hasBlockingCommandOverlay(rootWith('[role="menu"]', false))).toBe(
      false,
    )
    expect(
      hasBlockingCommandOverlay(rootWith('[role="dialog"]', true, true)),
    ).toBe(false)
  })
  it('supports browsers without native popover selectors', () => {
    const root = {
      querySelectorAll: vi.fn((selector: string) => {
        if (selector.includes(':popover-open'))
          throw new DOMException('Unsupported selector', 'SyntaxError')
        return []
      }),
    } as unknown as Pick<Document, 'querySelectorAll'>
    expect(() => hasBlockingCommandOverlay(root)).not.toThrow()
    expect(hasBlockingCommandOverlay(root)).toBe(false)
  })
})
