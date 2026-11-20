import { describe, expect, it } from 'vitest'
import {
  boardPagesFromRaw,
  defaultBoardPages,
  parseBoardPages,
} from '../src/workbench/board-pages'
import { maxTaskQueryPage } from '../src/workbench/task-query'

describe('independent board column pages', () => {
  it('defaults only an absent candidate and returns independent values', () => {
    const first = defaultBoardPages()
    first.active = 7
    expect(defaultBoardPages().active).toBe(1)
    expect(boardPagesFromRaw(undefined)).toEqual(defaultBoardPages())
    expect(boardPagesFromRaw('')).toBeUndefined()
  })
  it('copies all five exact positive pages in canonical state order', () => {
    const source = {
      other: 5,
      completed: 4,
      attention: 3,
      active: 2,
      pending: maxTaskQueryPage,
    }
    const parsed = parseBoardPages(source)!
    expect(Object.keys(parsed)).toEqual([
      'pending',
      'active',
      'attention',
      'completed',
      'other',
    ])
    source.pending = 1
    expect(parsed.pending).toBe(maxTaskQueryPage)
  })
  it.each([
    null,
    [],
    true,
    '1',
    {},
    { ...defaultBoardPages(), extra: 1 },
    { active: 1, attention: 1, completed: 1, other: 1 },
    { ...defaultBoardPages(), pending: 0 },
    { ...defaultBoardPages(), pending: -1 },
    { ...defaultBoardPages(), pending: 1.5 },
    { ...defaultBoardPages(), pending: true },
    { ...defaultBoardPages(), pending: '2' },
    { ...defaultBoardPages(), pending: NaN },
    { ...defaultBoardPages(), pending: Infinity },
    { ...defaultBoardPages(), pending: maxTaskQueryPage + 1 },
    Object.assign(new Date(), defaultBoardPages()),
    { ...defaultBoardPages(), [Symbol('extra')]: 1 },
  ])('rejects malformed or out-of-range pages %j', (value) => {
    expect(parseBoardPages(value)).toBeUndefined()
  })
  it('accepts JSON whitespace, key order and escaped valid keys', () => {
    expect(
      boardPagesFromRaw(
        ' { "other": 5, "completed": 4, "attention": 3, "active": 2, "\\u0070ending": 1 } ',
      ),
    ).toEqual({
      pending: 1,
      active: 2,
      attention: 3,
      completed: 4,
      other: 5,
    })
  })
  it.each([
    '{"pending":1,"pending":2,"active":1,"attention":1,"completed":1,"other":1}',
    '{"pending":1,"\\u0070ending":2,"active":1,"attention":1,"completed":1,"other":1}',
    '{"pending":1,"active":1,"attention":1,"completed":1,"other":1,"unknown":1}',
    '{"pending":1,"active":1,"attention":1,"completed":1,"other":true}',
    '{"pending":1,"active":1,"attention":1,"completed":1,"other":"1"}',
    '{"pending":1.0,"active":1,"attention":1,"completed":1,"other":1}',
    '{"pending":1e0,"active":1,"attention":1,"completed":1,"other":1}',
    '{"pending":1,"active":1,"attention":1,"completed":1}',
    '{"pending":1,"active":1,"attention":1,"completed":1,"other":1,}',
    'null',
    '[]',
    'undefined',
    '{"pending":NaN}',
  ])('rejects invalid JSON or discarded duplicate keys %s', (raw) => {
    expect(boardPagesFromRaw(raw)).toBeUndefined()
  })
})
