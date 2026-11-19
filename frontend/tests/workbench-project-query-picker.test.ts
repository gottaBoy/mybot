import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type { ProjectReferences } from '../src/workbench/project-references'
import {
  ProjectQueryPicker,
  ProjectQueryPickerPanel,
  projectPickerSelection,
  type ProjectQueryPickerProps,
} from '../src/workbench/ProjectQueryPicker'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  buttons: [] as Record<string, unknown>[],
  checkboxes: [] as Record<string, unknown>[],
}))
vi.mock('../src/workbench/useProjectReferences', () => ({
  useProjectReferences: mocks.hook,
}))
vi.mock('../src/components/ui', async () => {
  const { createElement: element } = await import('react')
  return {
    AppButton: (props: Record<string, unknown>) => {
      mocks.buttons.push(props)
      return element(
        'button',
        {
          'aria-label': props.label,
          'aria-disabled': props.disabled || undefined,
          'aria-expanded': props['aria-expanded'],
          'aria-haspopup': props['aria-haspopup'],
        },
        props.children as ReactNode,
        props.endContent as ReactNode,
      )
    },
    AppInput: (props: Record<string, unknown>) =>
      element('input', {
        'aria-label': props.label,
        defaultValue: props.value,
      }),
    AppCheckbox: (props: Record<string, unknown>) => {
      mocks.checkboxes.push(props)
      return element('input', {
        type: 'checkbox',
        'aria-label': props.label,
        'aria-disabled': props.isDisabled || undefined,
        defaultChecked: props.value === true,
      })
    },
    AppDialog: (props: Record<string, unknown>) =>
      element(
        'div',
        { role: 'dialog', 'aria-label': props.title },
        props.children as ReactNode,
      ),
    AppLoading: (props: Record<string, unknown>) =>
      element('div', { role: 'status', 'aria-label': props.label }),
  }
})

const t = (_zh: string, en: string) => en
const item = (id: number) => ({
  project: { id: `project-${id}`, name: `Remote project ${id}` },
  task_count: 2,
  run_count: 3,
})
const result = (): ProjectReferences => ({
  schema_version: 1,
  unit: 'project_references',
  query: '',
  requested_page: 1,
  page: 1,
  page_size: 20,
  total: 45,
  total_pages: 3,
  has_more: true,
  order: 'projects-created-v1',
  selected_ids: [],
  selected: [],
  missing_ids: [],
  totals: { projects: 45, tasks: 90, runs: 135 },
  items: Array.from({ length: 20 }, (_, index) => item(index)),
})
const data = {
  workspace: 'test-workspace',
  projects: [
    {
      id: 'project-44',
      name: 'PRIVATE Bootstrap name',
      goal: 'PRIVATE goal',
      directory: 'PRIVATE directory',
      notes: 'PRIVATE notes',
    },
  ],
  tasks: [],
  runs: [],
  capabilities: { project_references: true, backend_sync: false },
} as unknown as Bootstrap
const selection = (patch: Record<string, unknown> = {}) => ({
  remote: true,
  value: {
    ...result(),
    selected_ids: ['project-44'],
    selected: [item(44)],
  },
  busy: false,
  error: undefined,
  retry: vi.fn(),
  ...patch,
})
function button(label: string) {
  return mocks.buttons.find((entry) => entry.label === label)!
}
function click(label: string) {
  ;(button(label).onClick as () => void)()
}
function render(
  props: Partial<ProjectQueryPickerProps> = {},
  selected = selection(),
) {
  const onChange = vi.fn()
  const onClose = vi.fn()
  const html = renderToStaticMarkup(
    createElement(ProjectQueryPickerPanel, {
      data,
      refreshRevision: 8,
      value: ['project-44'],
      onChange,
      t,
      selection: selected,
      onClose,
      ...props,
    }),
  )
  return { html, onChange, onClose }
}
function toggle(name: string, checked: boolean) {
  const checkbox = mocks.checkboxes.find((entry) => entry.label === name)!
  ;(checkbox.onChange as (checked: boolean) => void)(checked)
}

beforeEach(() => {
  mocks.buttons.length = 0
  mocks.checkboxes.length = 0
  mocks.hook.mockReset()
  mocks.hook.mockReturnValue({
    remote: true,
    value: result(),
    busy: false,
    error: undefined,
    retry: vi.fn(),
  })
})

describe('project query picker selection contract', () => {
  it('adds without mutating the candidate and avoids duplicate IDs', () => {
    const before = ['one', 'two']
    expect(projectPickerSelection(before, 'three', true)).toEqual([
      'one',
      'two',
      'three',
    ])
    expect(projectPickerSelection(before, 'two', true)).toEqual(before)
    expect(projectPickerSelection(before, 'two', true)).not.toBe(before)
    expect(before).toEqual(['one', 'two'])
  })

  it('removes an exact candidate including an unavailable selection', () => {
    expect(
      projectPickerSelection(['missing', 'valid'], 'missing', false),
    ).toEqual(['valid'])
    expect(projectPickerSelection(['valid'], 'missing', false)).toEqual([
      'valid',
    ])
  })

  it('caps additions at100 while still permitting uncheck', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `project-${index}`)
    expect(projectPickerSelection(ids, 'new', true)).toEqual(ids)
    expect(projectPickerSelection(ids, 'project-0', false)).toHaveLength(99)
  })
})

describe('closed project picker', () => {
  it('uses selected hydration for the trigger instead of Bootstrap names', () => {
    mocks.hook.mockReturnValue(selection())
    const html = renderToStaticMarkup(
      createElement(ProjectQueryPicker, {
        data,
        refreshRevision: 8,
        value: ['project-44'],
        onChange: vi.fn(),
        t,
      }),
    )
    expect(html).toContain('Remote project 44')
    expect(html).not.toContain('PRIVATE')
    expect(html).not.toContain('Choose projects')
    expect(mocks.hook).toHaveBeenCalledWith({
      data,
      refreshRevision: 8,
      enabled: true,
      request: {
        query: '',
        page: 1,
        pageSize: 20,
        selectedIds: ['project-44'],
      },
    })
    expect(button('Project')['aria-haspopup']).toBe('dialog')
    expect(button('Project')['aria-expanded']).toBe(false)
  })

  it('makes no selected hydration read for an empty closed candidate', () => {
    mocks.hook.mockReturnValue(selection({ value: undefined }))
    renderToStaticMarkup(
      createElement(ProjectQueryPicker, {
        data,
        refreshRevision: 8,
        value: [],
        onChange: vi.fn(),
        t,
      }),
    )
    expect(mocks.hook.mock.calls[0][0].enabled).toBe(false)
  })

  it('keeps a neutral count until one selected label is verified', () => {
    mocks.hook.mockReturnValue(selection({ value: undefined, busy: true }))
    const html = renderToStaticMarkup(
      createElement(ProjectQueryPicker, {
        data,
        refreshRevision: 8,
        value: ['project-44'],
        onChange: vi.fn(),
        t,
      }),
    )
    expect(html).toContain('Project (1)')
    expect(html).not.toContain('Unavailable project')
  })

  it('returns no remote picker when the capability is absent', () => {
    mocks.hook.mockReturnValue(selection({ remote: false }))
    const html = renderToStaticMarkup(
      createElement(ProjectQueryPicker, {
        data,
        refreshRevision: 8,
        value: [],
        onChange: vi.fn(),
        t,
      }),
    )
    expect(html).toBe('')
  })
})

describe('project query picker panel', () => {
  it('reads only one directory page independently from selected hydration', () => {
    const { html } = render()
    expect(mocks.hook).toHaveBeenCalledExactlyOnceWith({
      data,
      refreshRevision: 8,
      request: { query: '', page: 1, pageSize: 20, selectedIds: [] },
    })
    expect(mocks.checkboxes).toHaveLength(20)
    expect(html).toContain('1-20 / 45')
    expect(html).toContain('Remote project 44')
    expect(html).not.toContain('PRIVATE')
    expect(html).toContain('data-testid="project-query-picker-dialog"')
    expect(button('Previous project page').disabled).toBe(true)
    expect(button('Next project page').disabled).toBe(false)
  })

  it('changes only the parent candidate when a known option is checked', () => {
    const { onChange, onClose } = render()
    toggle('Remote project 0', true)
    expect(onChange).toHaveBeenCalledExactlyOnceWith([
      'project-44',
      'project-0',
    ])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('unchecks a selected current-page option without duplicating a separate selected row', () => {
    const { html, onChange } = render({ value: ['project-0'] })
    expect(html).not.toContain('Remove project: project-0')
    expect(
      mocks.checkboxes.find((entry) => entry.label === 'Remote project 0')!
        .value,
    ).toBe(true)
    toggle('Remote project 0', false)
    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
  })

  it('blocks held option handlers during same-key directory refresh', () => {
    mocks.hook.mockReturnValue({
      remote: true,
      value: result(),
      busy: true,
      error: undefined,
      retry: vi.fn(),
    })
    const { html, onChange } = render()
    expect(html).toContain('Remote project 0')
    expect(html).toContain('aria-busy="true"')
    expect(mocks.checkboxes.every((entry) => entry.isDisabled)).toBe(true)
    toggle('Remote project 0', true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not show obsolete directory options while a changed query loads', () => {
    mocks.hook.mockReturnValue({
      remote: true,
      value: undefined,
      busy: true,
      error: undefined,
      retry: vi.fn(),
    })
    const { html } = render()
    expect(html).toContain('Loading projects')
    expect(html).not.toContain('No matching projects')
    expect(mocks.checkboxes).toHaveLength(0)
    expect(html).toContain('Remote project 44')
  })

  it.each([
    ['forbidden', 'Project access is forbidden.'],
    ['unavailable', 'Project references are unavailable.'],
    ['timeout', 'Reading projects timed out.'],
    ['invalid', 'Project directory could not be read or validated.'],
  ])(
    'reports %s without a success-shaped empty directory',
    (error, message) => {
      const retry = vi.fn()
      mocks.hook.mockReturnValue({
        remote: true,
        value: undefined,
        busy: false,
        error,
        retry,
      })
      const { html } = render()
      expect(html).toContain(message)
      expect(html).toContain('role="alert"')
      expect(html).not.toContain('No projects yet')
      expect(html).not.toContain('No matching projects')
      expect(mocks.checkboxes).toHaveLength(0)
      click('Retry project directory')
      expect(retry).toHaveBeenCalledOnce()
    },
  )

  it('keeps a failed selected reference neutral and independently retryable', () => {
    const selected = selection({ value: undefined, error: 'invalid' })
    const { html, onChange } = render({}, selected)
    expect(html).toContain('Selected projects could not be verified.')
    expect(html).toContain('Project reference pending · project-44')
    expect(html).not.toContain('Unavailable project')
    click('Retry selected projects')
    expect(selected.retry).toHaveBeenCalledOnce()
    click('Remove project: project-44')
    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
  })

  it('renders confirmed missing IDs as removable rather than silently dropping them', () => {
    const selected = selection({
      value: {
        ...result(),
        selected_ids: ['project-44'],
        selected: [],
        missing_ids: ['project-44'],
      },
    })
    const { html, onChange } = render({}, selected)
    expect(html).toContain('Unavailable project · project-44')
    click('Remove project: project-44')
    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
  })

  it('leaves unselected options disabled at the100-project limit but permits removal', () => {
    const ids = Array.from({ length: 100 }, (_, index) => `selected-${index}`)
    const { html, onChange } = render(
      { value: ids },
      selection({ value: undefined }),
    )
    expect(html).toContain('Select up to 100 projects.')
    expect(mocks.checkboxes.every((entry) => entry.isDisabled)).toBe(true)
    toggle('Remote project 0', true)
    expect(onChange).not.toHaveBeenCalled()
    click('Remove project: selected-0')
    expect(onChange.mock.calls[0][0]).toHaveLength(99)
  })

  it('clears selected candidate without closing and Done closes without applying it', () => {
    const { onChange, onClose } = render()
    click('Clear project selection')
    expect(onChange).toHaveBeenCalledExactlyOnceWith([])
    expect(onClose).not.toHaveBeenCalled()
    click('Done')
    expect(onClose).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('distinguishes a true empty workspace from a search without matches', () => {
    const empty = {
      ...result(),
      items: [],
      total: 0,
      totals: { projects: 0, tasks: 0, runs: 0 },
    }
    mocks.hook.mockReturnValue({
      remote: true,
      value: empty,
      busy: false,
      retry: vi.fn(),
    })
    expect(render({ value: [] }).html).toContain('No projects yet')
    mocks.hook.mockReturnValue({
      remote: true,
      value: { ...empty, totals: result().totals },
      busy: false,
      retry: vi.fn(),
    })
    expect(render({ value: [] }).html).toContain('No matching projects')
  })
})
