import { describe, expect, it } from 'vitest'
import {
  parseRunSort,
  runOrderSort,
  runSortKeys,
} from '../src/workbench/run-sort'

describe('run sort', () => {
  it('accepts at most one supported rule', () => {
    expect(
      parseRunSort([{ sortKey: 'created_at', direction: 'descending' }]),
    ).toEqual([{ sortKey: 'created_at', direction: 'descending' }])
    expect(
      parseRunSort([{ sortKey: 'attempts' as never, direction: 'descending' }]),
    ).toBeUndefined()
    expect(
      parseRunSort([
        { sortKey: 'id', direction: 'ascending' },
        { sortKey: 'status', direction: 'ascending' },
      ]),
    ).toBeUndefined()
  })
  it('round trips URL order candidates without making invalid values valid', () => {
    expect(runOrderSort(undefined)).toEqual([])
    expect(runOrderSort('title:ascending')).toEqual([
      { sortKey: 'title', direction: 'ascending' },
    ])
    expect(runOrderSort('updated:ascending')).toBeUndefined()
  })
  it.each(runSortKeys)('accepts only known directions for %s', (sortKey) => {
    for (const direction of ['ascending', 'descending'] as const)
      expect(runOrderSort(`${sortKey}:${direction}`)).toEqual([
        { sortKey, direction },
      ])
    expect(parseRunSort([{ sortKey, direction: 'desc' }])).toBeUndefined()
  })
  it.each([
    null,
    {},
    'id:ascending',
    [null],
    [true],
    [['id', 'ascending']],
    [{ sortKey: 'id' }],
    [{ direction: 'ascending' }],
    [{ sortKey: 'id', direction: 'ascending', extra: true }],
    [{ sortKey: 'updated', direction: 'ascending' }],
    [{ sortKey: 'Title', direction: 'ascending' }],
    [{ sortKey: 'id', direction: 'ascending ' }],
  ])('rejects malformed rules %j', (value) => {
    expect(parseRunSort(value)).toBeUndefined()
  })
  it.each([
    '',
    'id:asc',
    ' title:ascending',
    'title:ascending ',
    'id:ascending:extra',
  ])('preserves invalid URL candidate %j as invalid', (value) =>
    expect(runOrderSort(value)).toBeUndefined(),
  )
  it('copies a rule instead of retaining mutable caller configuration', () => {
    const input = [{ sortKey: 'title', direction: 'ascending' }]
    const parsed = parseRunSort(input)!
    input[0].sortKey = 'id'
    expect(parsed).toEqual([{ sortKey: 'title', direction: 'ascending' }])
  })
})
