import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bootstrap } from '../src/workbench/api'
import type { ListLocation } from '../src/workbench/list-location'
import type { ProjectQueryPage } from '../src/workbench/project-resources'
import { ProjectResourceList } from '../src/workbench/ProjectResourceList'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  buttons: [] as Record<string, unknown>[],
}))
vi.mock('../src/workbench/project-resources', async () => {
  const actual = await vi.importActual<
    typeof import('../src/workbench/project-resources')
  >('../src/workbench/project-resources')
  return { ...actual, fetchProjectQuery: mocks.fetch }
})
vi.mock('../src/components/ui', () => {
  const Button = (props: Record<string, unknown>) => {
    mocks.buttons.push(props)
    return createElement(
      'button',
      {
        'aria-label': props.label,
        'data-page': props['data-project-list-page'],
      },
      props.children as ReactNode,
    )
  }
  return {
    AppButton: Button,
    AppInput: (props: Record<string, unknown>) =>
      createElement('input', {
        type: props.type,
        'aria-label': props.label,
        defaultValue: props.value,
      }),
    AppLoading: (props: Record<string, unknown>) =>
      createElement('div', { role: 'status', 'aria-label': props.label }),
    AppSelect: (props: Record<string, unknown>) =>
      createElement('select', {
        'aria-label': props.label,
        defaultValue: props.value,
      }),
  }
})
const data = {
  workspace: '/workspace',
  projects: [],
  tasks: [],
  runs: [],
  models: [],
  backends: [],
  local_harnesses: [],
  default_model_id: '',
  capabilities: { backend_sync: false, project_query: true },
} as unknown as Bootstrap
const location: ListLocation = {
  query: '',
  jql: '',
  mode: 'basic',
  groupBy: '',
  group: 'none',
  page: 1,
  pageSize: 20,
}
const page: ProjectQueryPage = {
  schema_version: 1,
  unit: 'project_query',
  query: '',
  requested_page: 1,
  page: 1,
  page_size: 20,
  total: 1,
  total_pages: 1,
  has_more: false,
  order: 'projects-created-v1',
  items: [
    {
      project: { id: 'alpha', name: 'Alpha', goal: 'Goal', directory: '.' },
      task_count: 2,
      run_count: 4,
    },
  ],
}
describe('project resource list', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.fetch.mockResolvedValue(page)
    mocks.buttons.length = 0
  })
  it('shows initial loading without substituting Bootstrap projects or zeros', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectResourceList, {
        data,
        refreshRevision: 0,
        t: (_zh: string, en: string) => en,
        location,
        onLocationChange: vi.fn(),
      }),
    )
    expect(html).not.toContain('Alpha')
    expect(html).toContain('Loading projects')
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain('No projects yet')
    expect(html).not.toContain('notes')
    expect(html).toContain('data-testid="project-resource-list"')
  })
  it('keeps capability-gated consumers unmounted on legacy bootstrap', () => {
    const legacy = {
      ...data,
      capabilities: { backend_sync: false },
    } as unknown as Bootstrap
    expect(
      renderToStaticMarkup(
        createElement(ProjectResourceList, {
          data: legacy,
          refreshRevision: 0,
          t: (_zh: string, en: string) => en,
          location,
          onLocationChange: vi.fn(),
        }),
      ),
    ).toBe('')
  })
})
