import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataTable } from '../src/components/ui/DataTable'

const vendor = vi.hoisted(() => ({
  table: vi.fn((_props: Record<string, unknown>) => null),
  state: vi.fn((props: Record<string, unknown>) => ({
    sortedData: [...(props.data as unknown[])].reverse(),
    sortConfig: { sort: props.sort, onSortChange: props.onSortChange },
  })),
  sortable: vi.fn((props: Record<string, unknown>) => props),
}))
vi.mock('@astryxdesign/core/Table', () => ({
  Table: vendor.table,
  pixel: (value: number) => value,
  proportional: () => 1,
  useTableSortableState: vendor.state,
  useTableSortable: vendor.sortable,
  useTableTreeData: vi.fn(),
  useTableTreeState: vi.fn(),
}))
const rows = [
  { id: 'b', title: 'Research 2' },
  { id: 'a', title: 'Research 10' },
]
const sort = [{ sortKey: 'title', direction: 'ascending' as const }]

describe('Astryx server-page table wrapper', () => {
  beforeEach(() => vi.clearAllMocks())
  it('does not sort or paginate a server page again and exposes global row coordinates', () => {
    const onSortChange = vi.fn()
    renderToStaticMarkup(
      createElement(AppDataTable, {
        rows,
        columns: [{ key: 'title', title: 'Task' }],
        label: 'Tasks',
        empty: null,
        sorting: { sort, onSortChange },
        serverSorted: true,
        totalRows: 45,
        rowStart: 21,
      }),
    )
    expect(vendor.state.mock.calls[0][0].sort).toEqual([])
    expect(vendor.table.mock.calls[0][0]).toMatchObject({
      data: rows,
      rowCount: 45,
      rowIndexStart: 21,
    })
    expect(vendor.sortable.mock.calls[0][0]).toMatchObject({
      sort,
      onSortChange,
    })
  })
  it('does not slice a server page when legacy pagination props are also present', () => {
    renderToStaticMarkup(
      createElement(AppDataTable, {
        rows,
        columns: [{ key: 'title', title: 'Task' }],
        label: 'Tasks',
        empty: null,
        serverSorted: true,
        page: 2,
        pageSize: 20,
        totalRows: 45,
        rowStart: 21,
      }),
    )
    expect(vendor.table.mock.calls[0][0]).toMatchObject({
      data: rows,
      rowCount: 45,
      rowIndexStart: 21,
    })
  })
  it('keeps the existing local ordering and pagination path for old backends', () => {
    renderToStaticMarkup(
      createElement(AppDataTable, {
        rows,
        columns: [{ key: 'title', title: 'Task' }],
        label: 'Tasks',
        empty: null,
        sorting: { sort, onSortChange: vi.fn() },
        page: 2,
        pageSize: 1,
      }),
    )
    expect(vendor.state.mock.calls[0][0].sort).toEqual(sort)
    expect(vendor.table.mock.calls[0][0]).toMatchObject({
      data: [rows[0]],
      rowCount: 2,
      rowIndexStart: 2,
    })
  })
})
