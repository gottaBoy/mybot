import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRunWorkflow } from '../src/workbench/useRunWorkflow'
import type {
  WorkflowDefinition,
  WorkflowSnapshot,
  WorkflowVersions,
} from '../src/workbench/workflows'

const runtime = vi.hoisted(() => ({
  cells: [] as any[],
  cursor: 0,
  dirty: false,
  pending: [] as Array<() => void>,
  fetchVersions: vi.fn(),
}))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = runtime.cursor++
    runtime.cells[index] ??= { value: initial }
    return [
      runtime.cells[index].value,
      (next: unknown) => {
        const previous = runtime.cells[index].value
        const value = typeof next === 'function' ? next(previous) : next
        if (!Object.is(value, previous)) {
          runtime.cells[index].value = value
          runtime.dirty = true
        }
      },
    ]
  },
  useRef: (initial: unknown) => {
    const index = runtime.cursor++
    runtime.cells[index] ??= { current: initial }
    return runtime.cells[index]
  },
  useEffect: (
    setup: () => (() => void) | undefined,
    dependencies: unknown[],
  ) => {
    const index = runtime.cursor++
    const previous = runtime.cells[index]
    if (
      !previous ||
      dependencies.some(
        (value, position) => !Object.is(value, previous.dependencies[position]),
      )
    ) {
      runtime.pending.push(() => {
        previous?.cleanup?.()
        runtime.cells[index] = { dependencies, cleanup: setup() }
      })
    }
  },
}))

vi.mock('../src/workbench/workflows', async () => ({
  ...(await vi.importActual<typeof import('../src/workbench/workflows')>(
    '../src/workbench/workflows',
  )),
  fetchWorkflowVersions: (...args: unknown[]) => runtime.fetchVersions(...args),
}))

const definition: WorkflowDefinition = {
  schema_version: 1,
  name: 'Published workflow',
  harness: 'local-superagent',
  stages: [
    {
      id: 'planning',
      role: 'coordinator',
      model_id: 'model-a',
      instructions: '',
    },
    {
      id: 'research',
      role: 'researcher',
      model_id: 'model-b',
      instructions: '',
    },
    {
      id: 'synthesis',
      role: 'reviewer',
      model_id: 'model-a',
      instructions: '',
    },
  ],
  limits: {
    max_calls: 4,
    parallel: 2,
    minutes: 10,
    max_output_tokens: 1800,
    research_tasks: 2,
  },
  review: 'human',
}
const page = (requestedPage: number): WorkflowVersions => ({
  schema_version: 1,
  workflow_id: 'local-research',
  items: Array.from({ length: requestedPage === 1 ? 20 : 1 }, (_, index) => ({
    workflow_id: 'local-research',
    version: requestedPage === 1 ? 21 - index : 1,
    definition_hash: 'a'.repeat(64),
    definition: structuredClone(definition),
    created_at: '2026-11-23T00:00:00Z',
  })),
  total: 21,
  requested_page: requestedPage,
  page: requestedPage,
  page_size: 20,
  total_pages: 2,
  has_more: requestedPage === 1,
})

let args: Parameters<typeof useRunWorkflow>[0]
let value: ReturnType<typeof useRunWorkflow>
function render(next = args) {
  args = next
  do {
    runtime.dirty = false
    runtime.cursor = 0
    value = useRunWorkflow(args)
    for (const effect of runtime.pending.splice(0)) effect()
  } while (runtime.dirty)
  return value
}
async function settle() {
  for (let round = 0; round < 8; round++) {
    await Promise.resolve()
    if (runtime.dirty) render()
  }
  return value
}
beforeEach(() => {
  runtime.cells = []
  runtime.pending = []
  runtime.cursor = 0
  runtime.dirty = false
  runtime.fetchVersions.mockReset()
  args = { enabled: true, locked: false }
})
afterEach(() => {
  for (const cell of runtime.cells) cell?.cleanup?.()
})

describe('Run workflow version selection', () => {
  it('paginates past the first20 published versions and retains the exact selected definition', async () => {
    runtime.fetchVersions.mockImplementation(async (number: number) =>
      page(number),
    )
    render()
    await settle()
    expect(value.versions).toHaveLength(20)
    expect(value.total).toBe(21)
    expect(value.choose('1')).toBeUndefined()
    value.changePage(2)
    render()
    expect(value.busy).toBe(true)
    expect(value.versions).toEqual([])
    await settle()
    expect(value.page).toBe(2)
    expect(value.versions.map((item) => item.version)).toEqual([1])
    expect(value.choose('1')).toMatchObject({
      version: 1,
      config: { coordinator_model: 'model-a', researcher_model: 'model-b' },
    })
    render()
    value.changePage(1)
    render()
    await settle()
    expect(value.version).toBe(1)
    expect(value.definition).toEqual(definition)
    expect(runtime.fetchVersions.mock.calls.map(([number]) => number)).toEqual([
      1, 2, 1,
    ])
  })

  it('rejects obsolete picker callbacks while the next bounded page is loading', async () => {
    let complete!: (value: WorkflowVersions) => void
    runtime.fetchVersions.mockResolvedValueOnce(page(1)).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    render()
    await settle()
    const oldChoose = value.choose
    const oldChange = value.changePage
    value.changePage(2)
    render()
    expect(oldChoose('21')).toBeUndefined()
    oldChange(1)
    complete(page(2))
    await settle()
    expect(value.page).toBe(2)
    expect(value.version).toBeNull()
    expect(oldChoose('21')).toBeUndefined()
    expect(value.choose('1')).toMatchObject({ version: 1 })
  })

  it('treats an advertised read failure as blocked instead of falling back to built-in', async () => {
    runtime.fetchVersions.mockRejectedValue(
      new Error('workflow read unavailable'),
    )
    render()
    await settle()
    expect(value.busy).toBe(false)
    expect(value.blocked).toBe(true)
    expect(value.error).toBe('workflow read unavailable')
    expect(value.choose('builtin')).toBeUndefined()
    value.changePage(2)
    expect(runtime.fetchVersions).toHaveBeenCalledTimes(1)
    runtime.fetchVersions.mockResolvedValue(page(1))
    value.retry()
    render()
    await settle()
    expect(value.blocked).toBe(false)
    expect(value.error).toBe('')
  })

  it('never reads the catalog for a frozen prepared snapshot', () => {
    const initial: WorkflowSnapshot = {
      workflow_id: 'local-research',
      version: 1,
      definition_hash: 'a'.repeat(64),
      definition: structuredClone(definition),
    }
    render({ enabled: true, locked: true, initial })
    expect(value.version).toBe(1)
    expect(value.definition).toEqual(definition)
    expect(value.busy).toBe(false)
    expect(value.choose('builtin')).toBeUndefined()
    value.changePage(2)
    expect(runtime.fetchVersions).not.toHaveBeenCalled()
  })

  it('does not overwrite selected state on an unrelated rerender', async () => {
    runtime.fetchVersions.mockResolvedValue(page(1))
    render()
    await settle()
    value.choose('20')
    render({ ...args })
    expect(value.version).toBe(20)
    expect(value.definition).toEqual(definition)
    expect(runtime.fetchVersions).toHaveBeenCalledTimes(1)
  })

  it('discards a late read across capability loss and rereads on reenable', async () => {
    let complete!: (value: WorkflowVersions) => void
    runtime.fetchVersions.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    render()
    const signal = runtime.fetchVersions.mock.calls[0][1] as AbortSignal
    render({ enabled: false, locked: false })
    expect(signal.aborted).toBe(true)
    complete(page(1))
    await settle()
    expect(value.versions).toEqual([])
    expect(value.choose('21')).toBeUndefined()
    runtime.fetchVersions.mockResolvedValue(page(2))
    render({ enabled: true, locked: false })
    expect(value.busy).toBe(true)
    expect(value.versions).toEqual([])
    await settle()
    expect(runtime.fetchVersions).toHaveBeenCalledTimes(2)
  })

  it('does not silently downgrade an existing published selection when capability is lost', async () => {
    runtime.fetchVersions.mockResolvedValue(page(1))
    render()
    await settle()
    value.choose('21')
    render({ enabled: false, locked: false })
    expect(value.version).toBe(21)
    expect(value.definition).toEqual(definition)
    expect(value.blocked).toBe(true)
    expect(value.error).toBe('workflow_version_capability_unavailable')
    expect(value.choose('builtin')).toBeUndefined()
  })

  it('blocks a published prepared snapshot on a server without the version capability', () => {
    render({
      enabled: false,
      locked: true,
      initial: {
        workflow_id: 'local-research',
        version: 1,
        definition_hash: 'a'.repeat(64),
        definition: structuredClone(definition),
      },
    })
    expect(value.blocked).toBe(true)
    expect(value.error).toBe('workflow_version_capability_unavailable')
    expect(runtime.fetchVersions).not.toHaveBeenCalled()
  })
})
