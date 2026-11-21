import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Task } from '../src/workbench/api'
import type { TaskTurn, TaskTurnPage } from '../src/workbench/task-turns'
import { TaskConversation } from '../src/workbench/TaskWorkspace'

const mocks = vi.hoisted(() => ({
  buttons: [] as Record<string, any>[],
  areas: [] as Record<string, any>[],
  slots: [] as any[],
  cursor: 0,
  updates: [] as { slot: number; value: any }[],
  refs: [] as { current: any }[],
  refCursor: 0,
  save: vi.fn(),
  receipt: vi.fn(),
  preview: vi.fn(),
  push: vi.fn(() => true),
  cancel: vi.fn(),
  confirm: vi.fn(),
  prepare: vi.fn(),
  openPrepared: vi.fn(),
  retry: vi.fn(),
  page: vi.fn(),
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useState: (initial: unknown) => {
      const slot = mocks.cursor++
      return [
        slot < mocks.slots.length
          ? mocks.slots[slot]
          : typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial,
        (value: unknown) => {
          mocks.updates.push({ slot, value })
        },
      ]
    },
    useRef: (value: unknown) => {
      const slot = mocks.refCursor++
      mocks.refs[slot] ??= { current: value }
      return mocks.refs[slot]
    },
  }
})
vi.mock('../src/components/ui', () => ({
  AppButton: (props: Record<string, any>) => {
    mocks.buttons.push(props)
    return createElement(
      props.href ? 'a' : 'button',
      {
        'aria-label': props.label,
        disabled: props.disabled,
        href: props.href,
        'data-task-turn-page': props['data-task-turn-page'],
      },
      props.children as ReactNode,
    )
  },
  AppTextArea: (props: Record<string, any>) => {
    mocks.areas.push(props)
    return createElement('textarea', {
      'aria-label': props.label,
      readOnly: true,
      value: props.value,
      disabled: props.isDisabled,
    })
  },
  AppBadge: ({ children }: { children: ReactNode }) =>
    createElement('span', null, children),
  AppLoading: ({ label }: { label: string }) =>
    createElement('p', { role: 'status' }, label),
}))
vi.mock('../src/components/ui/DraftGuard', () => ({
  AppDraftGuard: () => null,
}))
vi.mock('../src/workbench/task-turns', () => ({
  saveTaskTurn: (...args: unknown[]) => mocks.save(...args),
  fetchTaskTurnRequest: (...args: unknown[]) => mocks.receipt(...args),
  previewTaskTurn: (...args: unknown[]) => mocks.preview(...args),
}))
vi.mock('../src/workbench/navigation-guard', () => ({
  pushWorkbenchNavigation: (...args: unknown[]) => mocks.push(...args),
  cancelWorkbenchNavigation: () => mocks.cancel(),
  confirmWorkbenchNavigation: () => mocks.confirm(),
  registerWorkbenchNavigationBlocker: () => () => {},
}))

const task: Task = {
  id: 'conversation-task',
  project_id: 'project',
  title: 'Real Task',
  goal: 'Original task goal',
  acceptance: 'Original acceptance',
  files: [],
}
const config = {
  coordinator_model: 'model',
  researcher_model: 'model',
  reviewer_model: 'model',
  max_calls: 4,
  parallel: 2,
  minutes: 10,
  max_output_tokens: 1800,
}
function turn(state: TaskTurn['state'] = 'saved', id = 'message-1'): TaskTurn {
  return {
    id,
    task_id: task.id,
    request_id: `request-${id}`,
    content: `Exact saved requirement ${id}`,
    created_at: '2026-11-21T00:00:00Z',
    state,
    run_id: state === 'applied' ? 'actual-run' : null,
    candidate:
      state === 'saved'
        ? null
        : {
            candidate_hash: 'a'.repeat(64),
            config,
            snapshot: {
              context_hash: 'b'.repeat(64),
              goal: task.goal,
              acceptance: task.acceptance,
              notes: '',
              text: '',
              bytes: 0,
              evidence: [],
              access: 'read_only',
              tools: [],
              supplement: { id, content: `Exact saved requirement ${id}` },
            },
          },
  }
}
function page(
  items: TaskTurn[] = [turn()],
  prepared: TaskTurn | null = null,
): TaskTurnPage {
  return {
    schema_version: 1,
    unit: 'task_turns',
    task_id: task.id,
    items,
    prepared,
    total: items.length,
    requested_page: 1,
    page: 1,
    page_size: 20,
    total_pages: 1,
    has_more: false,
    order: 'turns-created-v1',
  }
}
function render(
  overrides: Partial<Parameters<typeof TaskConversation>[0]> = {},
) {
  mocks.buttons = []
  mocks.areas = []
  mocks.cursor = 0
  mocks.refCursor = 0
  return renderToStaticMarkup(
    createElement(TaskConversation, {
      task,
      t: (_zh, en) => en,
      locale: 'en',
      remote: true,
      value: page(),
      busy: false,
      error: undefined,
      retry: mocks.retry,
      preparing: false,
      onPrepareTurn: mocks.prepare,
      onOpenPreparedTurn: mocks.openPrepared,
      onPageChange: mocks.page,
      ...overrides,
    }),
  )
}
const button = (name: string) =>
  mocks.buttons.find((entry) => entry.label === name)!
async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.stubGlobal('document', { activeElement: null })
  mocks.slots = []
  mocks.refs = []
  mocks.updates = []
  for (const call of [
    mocks.save,
    mocks.receipt,
    mocks.preview,
    mocks.prepare,
    mocks.openPrepared,
    mocks.retry,
    mocks.push,
    mocks.cancel,
    mocks.confirm,
    mocks.page,
  ])
    call.mockReset()
  mocks.push.mockReturnValue(true)
  mocks.save.mockResolvedValue(turn())
  mocks.receipt.mockResolvedValue(turn())
  mocks.preview.mockResolvedValue({
    context_hash: 'b'.repeat(64),
    supplement: { id: turn().id, content: turn().content },
  })
})

describe('Task conversation facts and action boundaries', () => {
  it('shows saved text and distinguishes saved/prepared/applied without an invented assistant response', () => {
    const html = render({
      value: page([turn(), turn('prepared', 'two'), turn('applied', 'three')]),
    })
    expect(html).toContain('Exact saved requirement message-1')
    expect(html).toContain('Saved, not executed')
    expect(html).toContain('Prepared, awaiting consent')
    expect(html).toContain('Run linked')
    expect(html).not.toContain('assistant')
    expect(html).not.toContain('Execution completed')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })
  it('keeps draft text separate and never saves as a consequence of typing', () => {
    mocks.slots = ['Unsaved local requirements']
    render()
    expect(mocks.areas[0].value).toBe('Unsaved local requirements')
    expect(button('Save message').disabled).toBe(false)
    expect(button('Arrange next run').disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('counts message limits as Unicode codepoints without a second UTF16 textarea limit', () => {
    mocks.slots = ['😀'.repeat(8000)]
    const html = render()
    expect(mocks.areas[0].maxLength).toBeUndefined()
    expect(html).toContain('8000 / 8000')
    expect(button('Save message').disabled).toBe(false)
    mocks.slots = ['😀'.repeat(8001)]
    render()
    expect(button('Save message').disabled).toBe(true)
  })
  it('stamps only request identity in the URL before a stable save and blocks duplicate callbacks', async () => {
    mocks.slots = ['  Preserve this exact supplemental message  ']
    render()
    const action = button('Save message').onClick
    action()
    action()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    const [id, body] = mocks.save.mock.calls[0]
    expect(id).toBe(task.id)
    expect(body.content).toBe('Preserve this exact supplemental message')
    expect(body.request_id).toMatch(/^[A-Za-z0-9_-]{8,100}$/)
    expect(mocks.push.mock.calls[0][0]).toContain('taskSend=')
    expect(mocks.push.mock.calls[0][0]).not.toContain(body.content)
    await settle()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.retry).toHaveBeenCalled()
  })
  it('does not POST when the exact request stamp is rejected by navigation admission', () => {
    mocks.slots = ['Unsaved requirement']
    mocks.push.mockReturnValue(false)
    render()
    button('Save message').onClick()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('preserves an uncertain create candidate and offers GET receipt checking without resending', async () => {
    const candidate = {
      phase: 'unknown',
      requestId: 'request-original',
      content: 'Exact original',
    }
    mocks.slots = ['Exact original', candidate]
    mocks.receipt.mockResolvedValue({
      ...turn(),
      request_id: candidate.requestId,
      content: candidate.content,
    })
    const html = render({ pendingRequestId: candidate.requestId })
    expect(html).toContain('request-original')
    expect(mocks.areas[0].isDisabled).toBe(true)
    expect(button('Save message').disabled).toBe(true)
    button('Check save receipt').onClick()
    await settle()
    expect(mocks.receipt.mock.calls[0].slice(0, 2)).toEqual([
      task.id,
      candidate.requestId,
    ])
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.retry).toHaveBeenCalled()
  })
  it('retries a confirmed-missing create with the same immutable request and content', async () => {
    const candidate = {
      phase: 'missing',
      requestId: 'request-original',
      content: 'Exact original',
    }
    mocks.slots = ['Later text must not replace candidate', candidate]
    render()
    button('Retry original message').onClick()
    await settle()
    expect(mocks.save.mock.calls[0].slice(0, 2)).toEqual([
      task.id,
      { request_id: candidate.requestId, content: candidate.content },
    ])
  })
  it('unknown state recovered from URL has no automatic mutation', () => {
    render({ pendingRequestId: 'request-after-reload' })
    expect(button('Check save receipt')).toBeDefined()
    expect(button('Save message').disabled).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })
  it('does not clear a reloaded request or permit a new message after a temporary404 receipt', async () => {
    mocks.receipt.mockRejectedValue(new ApiError(404, 'not found'))
    render({ pendingRequestId: 'request-after-reload' })
    button('Check save receipt').onClick()
    await settle()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(
      mocks.updates.some(
        ({ value }) =>
          value?.phase === 'unknown' &&
          value.requestId === 'request-after-reload',
      ),
    ).toBe(true)
    expect(mocks.updates.some(({ value }) => value?.phase === 'idle')).toBe(
      false,
    )
  })
  it('previews only an explicitly selected saved message then passes exact Task/turn to the existing wizard', async () => {
    const message = turn()
    render()
    button('Arrange next run').onClick()
    await settle()
    expect(mocks.preview.mock.calls[0].slice(0, 2)).toEqual([
      task.id,
      message.id,
    ])
    expect(mocks.prepare).toHaveBeenCalledWith(
      task,
      message,
      expect.objectContaining({
        supplement: { id: message.id, content: message.content },
      }),
    )
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects a mismatched preview supplement instead of authorizing another message', async () => {
    mocks.preview.mockResolvedValue({
      supplement: { id: 'different-message', content: 'Different' },
    })
    render()
    button('Arrange next run').onClick()
    await settle()
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.updates.some(({ value }) => value?.tone === 'error')).toBe(
      true,
    )
  })
  it('hydrates a prepared candidate outside the current page and opens it with no execution', () => {
    const prepared = turn('prepared', 'off-page')
    const html = render({ value: page([turn()], prepared) })
    expect(html).toContain('data-task-turn="off-page"')
    expect(button('Arrange next run').disabled).toBe(true)
    button('Continue prepared run').onClick()
    expect(mocks.openPrepared).toHaveBeenCalledWith(task, prepared)
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('blocks retained message callbacks after a busy refresh', () => {
    render({ value: page([turn('prepared')], turn('prepared')) })
    const retained = button('Continue prepared run').onClick
    render({ busy: true, value: page([turn('prepared')], turn('prepared')) })
    retained()
    expect(mocks.openPrepared).not.toHaveBeenCalled()
  })
  it('links applied turns to the exact Task Run views without executing', () => {
    render({ value: page([turn('applied')]) })
    button('View Agent work').onClick()
    expect(mocks.push).toHaveBeenCalledWith(
      '#task/conversation-task?taskTab=work&taskRun=actual-run',
    )
    button('Review artifacts').onClick()
    expect(mocks.push).toHaveBeenCalledWith(
      '#task/conversation-task?taskTab=review&taskRun=actual-run',
    )
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
  })
  it('keeps remote read failures distinct from a real empty conversation', () => {
    const failed = render({ value: undefined, error: 'forbidden' })
    expect(failed).toContain('Task conversation access is forbidden')
    expect(failed).not.toContain('No supplemental messages yet')
    const empty = render({ value: page([]) })
    expect(empty).toContain('No supplemental messages yet')
    expect(empty).toContain('0-0')
  })
  it('does not fabricate a conversation when the capability is missing', () => {
    const html = render({ remote: false, value: undefined })
    expect(html).toContain('Task conversation is not enabled on this server')
    expect(mocks.areas).toHaveLength(0)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('uses real bounded page metadata and refuses out-of-range or blocked pagination', () => {
    const current = { ...page(), total: 21, total_pages: 2, has_more: true }
    render({ value: current })
    expect(button('Previous messages').disabled).toBe(true)
    button('Next messages').onClick()
    expect(mocks.page).toHaveBeenCalledWith(2)
    render({ busy: true, value: current })
    button('Next messages').onClick()
    expect(mocks.page).toHaveBeenCalledTimes(1)
  })
})
