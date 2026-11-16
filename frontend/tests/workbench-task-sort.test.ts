import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { useAppTableRows } from '../src/components/ui/DataTable'
import { taskColumnKeys } from '../src/workbench/task-table-config'
import { parseTaskSort, type TaskSortRule } from '../src/workbench/task-sort'

describe('task sort URL candidates', () => {
  it('accepts an empty array as an explicit clear operation', () => {
    expect(parseTaskSort([])).toEqual([])
  })
  it.each(taskColumnKeys)(
    'accepts both strict directions for %s',
    (sortKey) => {
      for (const direction of ['ascending', 'descending'] as const)
        expect(parseTaskSort([{ sortKey, direction }])).toEqual([
          { sortKey, direction },
        ])
    },
  )
  it('retains the priority order of at most three unique rules', () => {
    const rules: TaskSortRule[] = [
      { sortKey: 'status', direction: 'ascending' },
      { sortKey: 'attempts', direction: 'descending' },
      { sortKey: 'title', direction: 'ascending' },
    ]
    const parsed = parseTaskSort(rules)
    expect(parsed).toEqual(rules)
    expect(parsed).not.toBe(rules)
    expect(parsed?.[0]).not.toBe(rules[0])
  })
  it.each([
    undefined,
    null,
    {},
    '[]',
    [null],
    [[]],
    [{}],
    [{ sortKey: 'title' }],
    [{ direction: 'ascending' }],
    [{ sortKey: 'unknown', direction: 'ascending' }],
    [{ sortKey: 'assignee', direction: 'ascending' }],
    [{ sortKey: 'Title', direction: 'ascending' }],
    [{ sortKey: 'title', direction: 'asc' }],
    [{ sortKey: 'title', direction: 'descending ' }],
    [{ sortKey: 'title', direction: ['ascending'] }],
    [{ sortKey: 'title', direction: 'ascending', extra: true }],
    [
      { sortKey: 'title', direction: 'ascending' },
      { sortKey: 'title', direction: 'descending' },
    ],
    [
      { sortKey: 'id', direction: 'ascending' },
      { sortKey: 'title', direction: 'ascending' },
      { sortKey: 'status', direction: 'ascending' },
      { sortKey: 'attempts', direction: 'ascending' },
    ],
    [
      { sortKey: 'title', direction: 'ascending' },
      { sortKey: 'missing', direction: 'descending' },
    ],
  ])(
    'rejects the whole malformed candidate rather than dropping rules %j',
    (value) => {
      expect(parseTaskSort(value)).toBeUndefined()
    },
  )
  it('does not bind valid hidden-column rules to visible columns', () => {
    expect(
      parseTaskSort([{ sortKey: 'created_at', direction: 'descending' }]),
    ).toEqual([{ sortKey: 'created_at', direction: 'descending' }])
  })
})

describe('published Astryx multi-sort through the project wrapper', () => {
  const rows = [
    { id: 'third', status: 'a', attempts: 1, title: 'Beta' },
    { id: 'tie-first', status: 'a', attempts: 2, title: 'Alpha' },
    { id: 'third-key', status: 'a', attempts: 2, title: 'Beta' },
    { id: 'tie-second', status: 'a', attempts: 2, title: 'Alpha' },
    { id: 'last', status: 'b', attempts: 9, title: 'Alpha' },
  ]
  function SortedRows({ sorts }: { sorts: TaskSortRule[] }) {
    const sorted = useAppTableRows(rows, {
      sort: sorts,
      onSortChange: () => {},
    })
    return createElement('output', null, sorted.map((row) => row.id).join(','))
  }
  it('applies secondary and tertiary rules while preserving input order for full ties', () => {
    const markup = renderToStaticMarkup(
      createElement(SortedRows, {
        sorts: [
          { sortKey: 'status', direction: 'ascending' },
          { sortKey: 'attempts', direction: 'descending' },
          { sortKey: 'title', direction: 'ascending' },
        ],
      }),
    )
    expect(markup).toBe(
      '<output>tie-first,tie-second,third-key,third,last</output>',
    )
    expect(rows.map((row) => row.id)).toEqual([
      'third',
      'tie-first',
      'third-key',
      'tie-second',
      'last',
    ])
  })
  it('preserves the source order when the candidate explicitly clears sorting', () => {
    expect(renderToStaticMarkup(createElement(SortedRows, { sorts: [] }))).toBe(
      '<output>third,tie-first,third-key,tie-second,last</output>',
    )
  })
})
