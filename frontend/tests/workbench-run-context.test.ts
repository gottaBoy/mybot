import { describe, expect, it, vi } from 'vitest'
import { ApiError, type Snapshot } from '../src/workbench/api'
import {
  contextChangedDetail,
  isContextChangedError,
  recheckedRunContext,
} from '../src/workbench/run-context'

function snapshot(hash: string, text: string): Snapshot {
  return {
    context_hash: hash,
    goal: 'Research goal',
    acceptance: 'Check the source',
    notes: '',
    text,
    bytes: text.length,
    evidence: [{ path: 'README.md', bytes: text.length }],
  }
}

describe('run context conflict contract', () => {
  it('recognizes only an explicit context-change conflict', () => {
    expect(isContextChangedError(new ApiError(409, contextChangedDetail))).toBe(
      true,
    )
    expect(isContextChangedError(new ApiError(409, 'context_changed'))).toBe(
      true,
    )
  })
  it.each([
    new ApiError(409, 'An active Run already exists'),
    new ApiError(409, 'request_id_conflict'),
    new ApiError(422, contextChangedDetail),
    new ApiError(0, contextChangedDetail),
    new Error(contextChangedDetail),
    contextChangedDetail,
    undefined,
  ])(
    'does not treat unrelated or untyped errors as context change: %j',
    (error) => {
      expect(isContextChangedError(error)).toBe(false)
    },
  )
  it('replaces the snapshot, resets review and revokes consent while preserving resource drafts', () => {
    const oldSnapshot = snapshot('old-hash', 'Old selected text')
    const fresh = snapshot('new-hash', 'Fresh selected text')
    const routing = {
      coordinator_model: 'planner',
      researcher_model: 'research',
      reviewer_model: 'reviewer',
    }
    const limits = {
      max_calls: 7,
      parallel: 1,
      minutes: 23,
      max_output_tokens: 2048,
    }
    const draft = {
      snapshot: oldSnapshot,
      step: 2,
      consent: true,
      routing,
      limits,
      requestId: 'stable-request-id',
      notesDraft: 'Unsaved user context',
    }
    const next = recheckedRunContext(draft, fresh)
    expect(next.snapshot).toBe(fresh)
    expect(next.snapshot.context_hash).toBe('new-hash')
    expect(next.step).toBe(0)
    expect(next.consent).toBe(false)
    expect(next.routing).toBe(routing)
    expect(next.limits).toBe(limits)
    expect(next.requestId).toBe('stable-request-id')
    expect(next.notesDraft).toBe('Unsaved user context')
    expect(draft.snapshot).toBe(oldSnapshot)
    expect(draft.step).toBe(2)
    expect(draft.consent).toBe(true)
  })
  it('requires fresh consent even if rechecking returns an unchanged hash', () => {
    const previous = snapshot('same-hash', 'Same text')
    const next = recheckedRunContext(
      { snapshot: previous, step: 2, consent: true },
      previous,
    )
    expect(next).toMatchObject({ step: 0, consent: false })
    expect(next.snapshot).toBe(previous)
  })
  it('has no automatic preview, provider request or input mutation', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const oldSnapshot = snapshot('old-hash', 'Original')
    const fresh = snapshot('new-hash', 'Updated')
    const draft = { snapshot: oldSnapshot, step: 2, consent: true }
    const before = structuredClone({ draft, fresh })
    Object.freeze(draft)
    Object.freeze(oldSnapshot)
    Object.freeze(fresh)
    try {
      expect(
        isContextChangedError(new ApiError(409, contextChangedDetail)),
      ).toBe(true)
      recheckedRunContext(draft, fresh)
      expect(fetch).not.toHaveBeenCalled()
      expect({ draft, fresh }).toEqual(before)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
