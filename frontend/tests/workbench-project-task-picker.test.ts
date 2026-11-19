import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type { ProjectReferences } from '../src/workbench/project-references'
import {
  ProjectTaskPicker,
  taskProjectSummary,
} from '../src/workbench/ProjectTaskPicker'
import { WorkbenchForm } from '../src/workbench/Forms'

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  selectors: [] as Record<string, unknown>[],
}))
vi.mock('../src/workbench/useProjectReferences', () => ({
  useProjectReferences: mocks.hook,
}))
vi.mock('../src/components/ui', async () => {
  const { createElement: element } = await import('react')
  const control = (props: Record<string, unknown>) =>
    element('div', null, props.children as ReactNode)
  return {
    AppButton: (props: Record<string, unknown>) =>
      element(
        'button',
        {
          'aria-label': props.label,
          'aria-disabled': props.disabled || undefined,
          'aria-expanded': props['aria-expanded'],
          'aria-haspopup': props['aria-haspopup'],
          'data-testid': props['data-testid'],
        },
        props.children as ReactNode,
      ),
    AppInput: (props: Record<string, unknown>) =>
      element('input', {
        'aria-label': props.label,
        defaultValue: props.value,
      }),
    AppSelect: (props: Record<string, unknown>) => {
      mocks.selectors.push(props)
      return element('select', {
        'aria-label': props.label,
        defaultValue: props.value,
      })
    },
    AppDialog: (props: Record<string, unknown>) =>
      element(
        'div',
        { role: 'dialog', 'aria-label': props.title },
        props.children as ReactNode,
      ),
    AppTextArea: (props: Record<string, unknown>) =>
      element('textarea', {
        'aria-label': props.label,
        defaultValue: props.value,
      }),
    AppLoading: (props: Record<string, unknown>) =>
      element('div', { role: 'status', 'aria-label': props.label }),
    AppRadioList: control,
    AppCheckbox: control,
    AppBadge: control,
    AppNumber: control,
  }
})
const t = (_zh: string, en: string) => en
const data = {
  projects: [
    {
      id: 'bootstrap-project',
      name: 'PRIVATE BOOTSTRAP',
      goal: 'PRIVATE GOAL',
      directory: 'PRIVATE PATH',
      notes: 'PRIVATE NOTES',
    },
  ],
  tasks: [],
  runs: [],
  models: [],
  backends: [],
  local_harnesses: [],
  workspace: '/fixture',
  default_model_id: '',
  capabilities: { backend_sync: false, project_references: true },
} as Bootstrap
const page: ProjectReferences = {
  schema_version: 1,
  unit: 'project_references',
  query: '',
  requested_page: 1,
  page: 1,
  page_size: 20,
  total: 1,
  total_pages: 1,
  has_more: false,
  order: 'projects-created-v1',
  selected_ids: ['remote-project'],
  selected: [
    {
      project: { id: 'remote-project', name: 'Verified remote project' },
      task_count: 1,
      run_count: 2,
    },
  ],
  missing_ids: [],
  totals: { projects: 1, tasks: 1, runs: 2 },
  items: [],
}
function selection(patch: Record<string, unknown> = {}) {
  return {
    remote: true,
    busy: false,
    value: page,
    error: undefined,
    retry: vi.fn(),
    ...patch,
  } as ReturnType<
    typeof import('../src/workbench/useProjectReferences').useProjectReferences
  >
}
beforeEach(() => {
  mocks.hook.mockReset()
  mocks.selectors.length = 0
  mocks.hook.mockReturnValue(selection({ value: undefined }))
})
describe('task project selection boundary', () => {
  it('uses only verified reference names and does not leak full Bootstrap data', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectTaskPicker, {
        data,
        refreshRevision: 4,
        value: 'remote-project',
        onChange: vi.fn(),
        t,
        selection: selection(),
      }),
    )
    expect(html).toContain('Verified remote project')
    expect(html).not.toContain('PRIVATE')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(mocks.hook).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        request: {
          query: '',
          page: 1,
          pageSize: 20,
          selectedIds: ['remote-project'],
        },
      }),
    )
  })
  it('preserves explicit disabled and accessible closed-trigger states', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectTaskPicker, {
        data,
        refreshRevision: 4,
        value: '',
        onChange: vi.fn(),
        t,
        selection: selection({ value: undefined }),
        disabled: true,
      }),
    )
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Select a project')
    expect(html).not.toContain('No projects yet')
  })
  it('calls an unverified or failed selected ID pending rather than unavailable', () => {
    expect(
      taskProjectSummary(
        'remote-project',
        selection({ value: undefined, busy: true }),
        t,
      ),
    ).toBe('Project reference pending · remote-project')
    expect(
      taskProjectSummary(
        'remote-project',
        selection({ value: undefined, error: 'forbidden' }),
        t,
      ),
    ).toBe('Project reference pending · remote-project')
  })
  it('labels only a server-confirmed missing ID unavailable', () => {
    expect(
      taskProjectSummary(
        'missing',
        selection({
          value: {
            ...page,
            selected_ids: ['missing'],
            selected: [],
            missing_ids: ['missing'],
          },
        }),
        t,
      ),
    ).toBe('Unavailable project · missing')
    expect(taskProjectSummary('', selection(), t)).toBe('Select a project')
  })
  it('starts a remote global task with no implicit first Bootstrap project', () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchForm, {
        state: { kind: 'task' },
        data,
        t,
        onClose: vi.fn(),
        onSaved: vi.fn(),
        onTask: vi.fn(),
        onRun: vi.fn(),
        refreshRevision: 9,
      }),
    )
    expect(html).toContain('Select a project')
    expect(html).not.toContain('PRIVATE')
    expect(mocks.selectors).toHaveLength(0)
    expect(mocks.hook).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        request: { query: '', page: 1, pageSize: 20, selectedIds: [] },
      }),
    )
  })
  it('keeps a fixed route ID as an unverified candidate until its reference arrives', () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchForm, {
        state: { kind: 'task', projectId: 'route-project' },
        data,
        t,
        onClose: vi.fn(),
        onSaved: vi.fn(),
        onTask: vi.fn(),
        onRun: vi.fn(),
      }),
    )
    expect(html).toContain('Project reference pending · route-project')
    expect(html).not.toContain('Unavailable project')
    expect(mocks.hook).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        request: {
          query: '',
          page: 1,
          pageSize: 20,
          selectedIds: ['route-project'],
        },
      }),
    )
  })
  it('retains the legacy first-project default only when remote references are absent', () => {
    mocks.hook.mockReturnValue(selection({ remote: false, value: undefined }))
    const legacy = { ...data, capabilities: { backend_sync: false } }
    renderToStaticMarkup(
      createElement(WorkbenchForm, {
        state: { kind: 'task' },
        data: legacy,
        t,
        onClose: vi.fn(),
        onSaved: vi.fn(),
        onTask: vi.fn(),
        onRun: vi.fn(),
      }),
    )
    expect(mocks.selectors[0].value).toBe('bootstrap-project')
  })
})
