import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/workbench/api'
import { savedViewProblemMessage } from '../src/workbench/SavedViewsMenu'

const en = (_zh: string, english: string) => english
const zh = (chinese: string, _en: string) => chinese

describe('saved-view error feedback', () => {
  it.each([
    [
      'saved_view_revision_conflict',
      409,
      'The view changed. Your draft and original revision are kept.',
    ],
    [
      'saved_view_create_superseded',
      409,
      'This ID has a newer version and is not an original create receipt.',
    ],
    [
      'saved_view_deleted',
      409,
      'This view is currently missing. No substitute was loaded.',
    ],
    [
      'saved_view_not_found',
      404,
      'This view is currently missing. No substitute was loaded.',
    ],
    [
      'saved_view_id_conflict',
      409,
      'This ID belongs to different content. Nothing was overwritten.',
    ],
    [
      'saved_view_scope_invalid',
      422,
      'The view project or scope is unavailable.',
    ],
    [
      'saved_view_project_unavailable',
      422,
      'The view project or scope is unavailable.',
    ],
  ])(
    'maps the actual %s API code without a success message',
    (code, status, message) => {
      expect(
        savedViewProblemMessage(new ApiError(status, code, { code }), en),
      ).toBe(message)
    },
  )

  it.each([
    [401, 'Your session expired.'],
    [403, 'Saved views are forbidden.'],
  ])(
    'gives HTTP %s authorization priority over a contradictory resource code',
    (status, message) => {
      expect(
        savedViewProblemMessage(
          new ApiError(status, 'failure', {
            code: 'saved_view_not_found',
          }),
          en,
        ),
      ).toBe(message)
    },
  )

  it('distinguishes an unsupported route from a missing resource', () => {
    expect(savedViewProblemMessage(new ApiError(404, 'Not Found'), en)).toBe(
      'Saved views are unavailable on this backend.',
    )
  })

  it('uses localized feedback without exposing arbitrary server messages', () => {
    expect(
      savedViewProblemMessage(
        new ApiError(422, 'private details', {
          code: 'saved_view_project_unavailable',
        }),
        zh,
      ),
    ).toBe('视图的项目或作用域不可用。')
    expect(savedViewProblemMessage(new Error('private details'), en)).toBe(
      'The saved view could not be read or validated.',
    )
  })
})
