import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type { ProjectReferences } from '../src/workbench/project-references'
import {
  ProjectReferenceDirectory,
  type ProjectReferenceDirectoryProps,
} from '../src/workbench/ProjectReferenceDirectory'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  buttons: [] as Record<string, unknown>[],
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
          'aria-pressed': props['aria-pressed'],
          'aria-disabled': props.disabled || undefined,
          'data-project-reference': props['data-project-reference'],
          'data-project-page': props['data-project-page'],
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
    AppLoading: (props: Record<string, unknown>) =>
      element('div', { role: 'status', 'aria-label': props.label }),
  }
})

const english = (_zh: string, en: string) => en
const item = (id: number) => ({
  project: { id: `project-${id}`, name: `Server project ${id}` },
  task_count: 2,
  run_count: 3,
})
function value(): ProjectReferences {
  return {
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
    selected_ids: ['project-45'],
    selected: [item(45)],
    missing_ids: [],
    totals: { projects: 45, tasks: 90, runs: 135 },
    items: Array.from({ length: 20 }, (_, index) => item(index + 1)),
  }
}
const data = {
  workspace: 'test-workspace',
  projects: [
    {
      id: 'project-45',
      name: 'Bootstrap project',
      goal: 'PRIVATE GOAL',
      directory: 'PRIVATE PATH',
      notes: 'PRIVATE NOTES',
    },
  ],
  tasks: [],
  runs: [],
  capabilities: { project_references: true, backend_sync: false },
} as unknown as Bootstrap

function render(props: Partial<ProjectReferenceDirectoryProps> = {}) {
  const onSelect = vi.fn()
  const html = renderToStaticMarkup(
    createElement(ProjectReferenceDirectory, {
      data,
      refreshRevision: 4,
      selectedIds: ['project-45'],
      t: english,
      variant: 'scope',
      includeAll: true,
      onSelect,
      ...props,
    }),
  )
  return { html, onSelect }
}
function button(id: string) {
  return mocks.buttons.find((props) => props['data-project-reference'] === id)!
}
function click(props: Record<string, unknown>) {
  ;(props.onClick as () => void)()
}

describe('bounded project reference directory', () => {
  beforeEach(() => {
    mocks.buttons.length = 0
    mocks.hook.mockReset()
    mocks.hook.mockReturnValue({
      remote: true,
      value: value(),
      busy: false,
      error: undefined,
      retry: vi.fn(),
    })
  })

  it('uses bounded page and selected hydration without Bootstrap project details', () => {
    const { html } = render()
    expect(mocks.hook).toHaveBeenCalledWith({
      data,
      refreshRevision: 4,
      request: {
        query: '',
        page: 1,
        pageSize: 20,
        selectedIds: ['project-45'],
      },
    })
    expect(html).toContain('Server project 45')
    expect(html).not.toContain('Bootstrap project')
    expect(html).not.toContain('PRIVATE')
    expect(html).toContain('1-20 / 45')
    expect(html).toContain('data-testid="project-directory-scope"')
  })

  it('shows selected off-page projects separately and lets the parent admit selection', () => {
    const { html, onSelect } = render()
    expect(html).toContain('data-testid="project-directory-selected"')
    expect(button('project-45')['aria-pressed']).toBe(true)
    click(button('project-45'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('project-45')
  })

  it('does not duplicate hydrated selected projects already on the page', () => {
    const result = value()
    result.selected_ids = ['project-1']
    result.selected = [result.items[0]]
    mocks.hook.mockReturnValue({
      remote: true,
      value: result,
      busy: false,
      retry: vi.fn(),
    })
    const { html } = render({ selectedIds: ['project-1'] })
    expect(html).not.toContain('data-testid="project-directory-selected"')
    expect(
      mocks.buttons.filter(
        (props) => props['data-project-reference'] === 'project-1',
      ),
    ).toHaveLength(1)
  })

  it.each([
    ['tasks', 90, 2],
    ['runs', 135, 3],
  ] as const)(
    'uses the %s denominator and workspace total rather than a page sum',
    (countUnit, total, count) => {
      const { html, onSelect } = render({ countUnit })
      expect(html).toContain(`>${total}</span>`)
      expect(html).toContain(`>${count}</span>`)
      click(button('all'))
      expect(onSelect).toHaveBeenCalledExactlyOnceWith('all')
    },
  )

  it('keeps validated rows during same-key refresh but blocks their actions', () => {
    mocks.hook.mockReturnValue({
      remote: true,
      value: value(),
      busy: true,
      retry: vi.fn(),
    })
    const { html, onSelect } = render()
    expect(html).toContain('Server project 1')
    expect(html).toContain('aria-busy="true"')
    expect(button('project-1').disabled).toBe(true)
    click(button('project-1'))
    click(button('all'))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows loading without invented rows or zero totals for a new request', () => {
    mocks.hook.mockReturnValue({
      remote: true,
      busy: true,
      retry: vi.fn(),
    })
    const { html } = render()
    expect(html).toContain('Loading project directory')
    expect(html).not.toContain('Server project')
    expect(html).not.toContain('No projects yet')
    expect(html).toContain('>-</span>')
  })

  it.each([
    ['forbidden', 'Project directory access is forbidden.'],
    ['unavailable', 'Project directory is unavailable.'],
    ['timeout', 'Reading project directory timed out.'],
    ['invalid', 'Project directory could not be read or validated.'],
  ])(
    'renders %s as failure with explicit retry, without a success-shaped empty state',
    (error, message) => {
      const retry = vi.fn()
      mocks.hook.mockReturnValue({ remote: true, busy: false, error, retry })
      const { html } = render()
      expect(html).toContain(message)
      expect(html).toContain('role="alert"')
      expect(html).not.toContain('No projects yet')
      expect(html).not.toContain('Unavailable project')
      expect(html).not.toContain('Bootstrap project')
      click(
        mocks.buttons.find(
          (props) => props.label === 'Retry project directory',
        )!,
      )
      expect(retry).toHaveBeenCalledOnce()
    },
  )

  it('distinguishes a missing selected project from an off-page project', () => {
    const result = value()
    result.selected = []
    result.missing_ids = ['project-45']
    mocks.hook.mockReturnValue({
      remote: true,
      value: result,
      busy: false,
      retry: vi.fn(),
    })
    const { html } = render()
    expect(html).toContain('Unavailable project · project-45')
    expect(html).not.toContain('Server project 45')
    expect(button('project-45')).toBeUndefined()
  })

  it('uses only selected hydration on fixed routes without a no-op control', () => {
    const { html, onSelect } = render({ fixedProjectId: 'project-45' })
    expect(html).toContain('data-project-reference="project-45"')
    expect(html).toContain('Server project 45')
    expect(html).not.toContain('data-project-reference="project-1"')
    expect(html).not.toContain('Search projects')
    expect(html).not.toContain('Next project page')
    expect(html).not.toContain('All projects')
    expect(mocks.buttons).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it.each([
    [0, 'No projects yet'],
    [45, 'No matching projects'],
  ])(
    'distinguishes empty workspace from zero matches with %s real projects',
    (projects, message) => {
      const result = value()
      result.items = []
      result.total = 0
      result.total_pages = 1
      result.has_more = false
      result.totals.projects = projects
      mocks.hook.mockReturnValue({
        remote: true,
        value: result,
        busy: false,
        retry: vi.fn(),
      })
      const { html } = render()
      expect(html).toContain(message)
      expect(html).toContain('0-0 / 0')
    },
  )

  it('leaves legacy presentation to its caller when capability is absent', () => {
    mocks.hook.mockReturnValue({ remote: false, busy: false, retry: vi.fn() })
    expect(render().html).toBe('')
    expect(mocks.buttons).toHaveLength(0)
  })

  it('shares the same component and localized controls in the sidebar', () => {
    const { html } = render({
      variant: 'sidebar',
      includeAll: false,
      t: (zh) => zh,
    })
    expect(html).toContain('data-testid="project-directory-sidebar"')
    expect(html).toContain('搜索项目')
    expect(html).toContain('上一页项目')
    expect(html).not.toContain('全部项目')
  })
})
