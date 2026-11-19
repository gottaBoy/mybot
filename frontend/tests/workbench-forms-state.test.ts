import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, type Bootstrap } from '../src/workbench/api'
import {
  backendFormEndpoint,
  firstFormError,
  formDraftFingerprint,
  formLeaveDecision,
  modelFormEndpoint,
  relativeFormPath,
  serverFormErrors,
  validateFormDraft,
  type FormDraft,
} from '../src/workbench/forms-state'

const english = (_: string, en: string) => en
const data = {
  projects: [{ id: 'p' }],
  models: [{ id: 'unverified', test_status: 'untested' }],
} as Pick<Bootstrap, 'projects' | 'models'>
function draft(): FormDraft {
  return {
    name: 'Example',
    directory: '.',
    goal: 'Research this project',
    notes: '',
    files: '',
    acceptance: '',
    projectId: 'p',
    endpoint: 'https://model.example/v1',
    model: 'model-id',
    keyEnv: '',
    routing: {
      coordinator_model: 'unverified',
      researcher_model: 'unverified',
      reviewer_model: 'unverified',
    },
    limits: { max_calls: 4, parallel: 2, minutes: 10, max_output_tokens: 1800 },
    consent: true,
    snapshotHash: 'a'.repeat(64),
  }
}
afterEach(() => vi.unstubAllGlobals())

describe('form schema validation', () => {
  it('matches trimmed required and length fields and identifies the first invalid field', () => {
    const values = {
      ...draft(),
      name: '  ',
      goal: 'x'.repeat(4001),
      notes: 'x'.repeat(16001),
    }
    const errors = validateFormDraft('project', values, data, english)
    expect(Object.keys(errors)).toEqual(['name', 'goal', 'notes'])
    expect(firstFormError(errors)).toBe('name')
    expect(firstFormError({})).toBeUndefined()
    expect(
      validateFormDraft(
        'project',
        { ...draft(), name: '字'.repeat(100) },
        data,
        english,
      ),
    ).toEqual({})
    expect(
      validateFormDraft(
        'project',
        { ...draft(), name: '字'.repeat(101) },
        data,
        english,
      ),
    ).toHaveProperty('name')
    expect(
      validateFormDraft(
        'project',
        { ...draft(), name: '😀'.repeat(100) },
        data,
        english,
      ),
    ).toEqual({})
  })
  it.each([
    '..',
    '../source',
    '/absolute',
    'src/../secret',
    'src\\file',
    'src/\0file',
  ])('rejects invalid relative path %j', (path) =>
    expect(relativeFormPath(path)).toBe(false),
  )
  it.each(['', '.', 'src/file.ts', 'docs//readme.md', './README.md'])(
    'accepts schema-supported relative path %j',
    (path) => expect(relativeFormPath(path)).toBe(true),
  )
  it('validates project and task-specific fields without removing input', () => {
    const values = {
      ...draft(),
      projectId: 'missing',
      name: '',
      goal: 'short',
      files: '../private',
    }
    const before = structuredClone(values)
    expect(
      Object.keys(validateFormDraft('task', values, data, english)),
    ).toEqual(['project_id', 'title', 'goal', 'files'])
    expect(values).toEqual(before)
    expect(
      validateFormDraft(
        'task',
        {
          ...draft(),
          files: Array.from({ length: 11 }, (_, i) => `${i}.md`).join('\n'),
        },
        data,
        english,
      ),
    ).toHaveProperty('files')
    expect(
      validateFormDraft(
        'task',
        { ...draft(), files: 'README.md\nREADME.md' },
        data,
        english,
      ),
    ).toEqual({})
    expect(
      validateFormDraft(
        'project',
        { ...draft(), directory: '../bad' },
        data,
        english,
      ),
    ).toHaveProperty('directory')
  })
  it('uses explicit verified project availability without inventing Bootstrap membership', () => {
    const values = { ...draft(), projectId: 'remote-project' }
    const empty = { ...data, projects: [] }
    expect(validateFormDraft('task', values, empty, english)).toHaveProperty(
      'project_id',
    )
    expect(
      validateFormDraft('task', values, empty, english, 2, {
        projectAvailable: true,
      }),
    ).toEqual({})
    expect(
      validateFormDraft('task', values, data, english, 2, {
        projectAvailable: false,
      }),
    ).toHaveProperty('project_id')
    expect(values.projectId).toBe('remote-project')
  })
  it('never treats an empty project candidate as available even with verified policy', () => {
    expect(
      validateFormDraft(
        'task',
        { ...draft(), projectId: '' },
        data,
        english,
        2,
        {
          projectAvailable: true,
        },
      ),
    ).toHaveProperty('project_id')
  })
  it('does not let task project availability bypass unrelated validation', () => {
    expect(
      validateFormDraft(
        'task',
        { ...draft(), name: '', goal: 'short', files: '../outside' },
        data,
        english,
        2,
        { projectAvailable: true },
      ),
    ).toMatchObject({
      title: expect.any(String),
      goal: expect.any(String),
      files: expect.any(String),
    })
    expect(
      validateFormDraft(
        'run',
        {
          ...draft(),
          routing: { ...draft().routing, coordinator_model: 'missing' },
        },
        data,
        english,
        2,
        { projectAvailable: true },
      ),
    ).toHaveProperty('coordinator_model')
  })
  it('validates configuration names, model identifiers and environment variable names', () => {
    expect(
      validateFormDraft(
        'model',
        {
          ...draft(),
          name: 'x'.repeat(81),
          model: '',
          keyEnv: 'sk-raw-secret',
        },
        data,
        english,
      ),
    ).toMatchObject({
      name: expect.any(String),
      model: expect.any(String),
      key_env: expect.any(String),
    })
    expect(
      validateFormDraft(
        'model',
        { ...draft(), keyEnv: 'WORKBENCH_MODEL_LOCAL_KEY' },
        data,
        english,
      ),
    ).toEqual({})
    expect(
      validateFormDraft(
        'backend',
        { ...draft(), endpoint: 'http://127.0.0.1:8000' },
        data,
        english,
      ),
    ).toEqual({})
  })
  it('allows saved but untested models and validates integer resources by current step', () => {
    expect(validateFormDraft('run', draft(), data, english)).toEqual({})
    const values = {
      ...draft(),
      routing: { ...draft().routing, reviewer_model: 'missing' },
      limits: { ...draft().limits, max_calls: 2, minutes: 1.5 },
      consent: false,
    }
    expect(validateFormDraft('run', values, data, english, 0)).toEqual({})
    expect(
      Object.keys(validateFormDraft('run', values, data, english, 1)),
    ).toEqual(['reviewer_model', 'max_calls', 'minutes'])
    expect(validateFormDraft('run', values, data, english, 2)).toHaveProperty(
      'consent',
    )
    expect(
      validateFormDraft(
        'run',
        { ...draft(), snapshotHash: 'unknown' },
        data,
        english,
      ),
    ).toHaveProperty('context_hash')
  })
  it.each(['test', 'check', 'revoke'] as const)(
    'requires explicit consent for %s',
    (kind) => {
      expect(
        validateFormDraft(kind, { ...draft(), consent: false }, data, english),
      ).toHaveProperty('consent')
    },
  )
})

describe('endpoint boundaries', () => {
  it.each([
    'https://model.example/v1',
    'http://localhost:11434/v1',
    'http://127.0.0.2:8080/v1',
    'http://[::1]:11434/v1',
  ])('accepts model endpoint %s', (endpoint) =>
    expect(modelFormEndpoint(endpoint)).toBe(true),
  )
  it.each([
    'http://remote.example',
    'https://user:secret@model.example/v1',
    'https://model.example/v1?token=secret',
    'https://model.example/#token',
    'http://127.1:8080',
    'http://2130706433:8080',
    'http://127.0.0.1:0',
    'codex://local',
    'https://169.254.169.254',
    'https://metadata.google.internal',
  ])('rejects model endpoint %s', (endpoint) =>
    expect(modelFormEndpoint(endpoint)).toBe(false),
  )
  it.each([
    'http://127.0.0.1:8000',
    'https://127.0.0.2/',
    'http://[::1]:8000',
    'http://[0:0:0:0:0:0:0:1]:8000',
  ])('accepts literal loopback backend %s', (endpoint) =>
    expect(backendFormEndpoint(endpoint)).toBe(true),
  )
  it.each([
    'http://localhost:8000',
    'http://127.1:8000',
    'http://127.0.0.1/api',
    'http://127.0.0.1?token=x',
    'https://remote.example',
    'http://127.0.0.1:0',
  ])('rejects unsupported backend %s', (endpoint) =>
    expect(backendFormEndpoint(endpoint)).toBe(false),
  )
})

describe('field errors and draft guards', () => {
  it('keeps server field details without changing the existing error message contract', async () => {
    const details = [
      { loc: ['body', 'name'], msg: 'Field required' },
      { loc: ['body', 'files', 0], msg: 'Invalid path' },
      { loc: ['body', 'files', 1], msg: 'Another invalid path' },
    ]
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: details }), { status: 422 }),
        ),
    )
    const error = await api('/projects').catch((reason) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe(
      'name: Field required; files.0: Invalid path; files.1: Another invalid path',
    )
    expect(error.details).toEqual(details)
    expect(serverFormErrors(error)).toEqual({
      name: 'Field required',
      files: 'Invalid path',
    })
    expect(serverFormErrors(new Error('name: fake'))).toEqual({})
  })
  it('compares only the active form draft without storing or altering it', () => {
    const original = draft()
    expect(formDraftFingerprint('project', original)).not.toBe(
      formDraftFingerprint('project', { ...original, name: 'Changed' }),
    )
    expect(formDraftFingerprint('project', original)).toBe(
      formDraftFingerprint('project', { ...original, endpoint: 'different' }),
    )
    expect(formDraftFingerprint('run', original)).not.toBe(
      formDraftFingerprint('run', { ...original, consent: false }),
    )
    expect(formDraftFingerprint('run', original)).not.toBe(
      formDraftFingerprint('run', {
        ...original,
        snapshotHash: 'b'.repeat(64),
      }),
    )
  })
  it('allows clean close, confirms dirty close and blocks any close while busy', () => {
    expect(formLeaveDecision({ dirty: false, busy: false })).toBe('allow')
    expect(formLeaveDecision({ dirty: true, busy: false })).toBe('confirm')
    expect(formLeaveDecision({ dirty: true, busy: true })).toBe('block')
    expect(formLeaveDecision({ dirty: false, busy: true })).toBe('block')
  })
})
