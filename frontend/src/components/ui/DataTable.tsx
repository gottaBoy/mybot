import type { ReactNode } from 'react'
import {
  Table,
  pixel,
  proportional,
  useTableSortable,
  useTableSortableState,
  useTableTreeData,
  useTableTreeState,
  type TableDensity,
} from '@astryxdesign/core/Table'
import { densityProfiles, useAppDensity, type Density } from './DensityContext'

export function resolveAppTableDensity(
  density: Density,
  compact?: boolean,
): TableDensity {
  if (compact !== undefined) return compact ? 'compact' : 'balanced'
  return densityProfiles[density].tableDensity
}

export type AppColumn<T> = {
  key: string
  title: string
  width?: number
  minWidth?: number
  sortable?: boolean
  render?: (row: T) => ReactNode
}
export type AppTableSort = Array<{
  sortKey: string
  direction: 'ascending' | 'descending'
}>
type AppTableSorting = {
  sort: AppTableSort
  onSortChange: (sort: AppTableSort) => void
}

export function useAppTableRows<T extends Record<string, unknown>>(
  rows: T[],
  sorting: AppTableSorting,
) {
  return useTableSortableState({ data: rows, ...sorting }).sortedData
}

function columns<T extends Record<string, unknown>>(items: AppColumn<T>[]) {
  return items.map((item) => ({
    key: item.key,
    header: item.title,
    width: item.width
      ? pixel(item.width)
      : proportional(1, { minWidth: item.minWidth ?? 160 }),
    sortable: item.sortable,
    renderCell: item.render,
  }))
}

export function AppDataTable<T extends Record<string, unknown>>({
  rows,
  columns: definitions,
  label,
  empty,
  compact,
  page,
  pageSize,
  sorting,
  serverSorted = false,
  totalRows,
  rowStart,
}: {
  rows: T[]
  columns: AppColumn<T>[]
  label: string
  empty: ReactNode
  compact?: boolean
  page?: number
  pageSize?: number
  sorting?: AppTableSorting
  serverSorted?: boolean
  totalRows?: number
  rowStart?: number
}) {
  const density = useAppDensity()
  const { sortedData, sortConfig } = useTableSortableState({
    data: rows,
    ...sorting,
    ...(serverSorted ? { sort: [] } : {}),
  })
  const sortable = useTableSortable<T>(
    serverSorted
      ? {
          ...sortConfig,
          sort: sorting?.sort ?? [],
        }
      : sortConfig,
  )
  const offset = page && pageSize ? (page - 1) * pageSize : 0
  const ordered = serverSorted ? rows : sortedData
  const visible =
    !serverSorted && pageSize
      ? ordered.slice(offset, offset + pageSize)
      : ordered
  return (
    <Table<T>
      data={visible}
      columns={columns(definitions)}
      idKey="id"
      aria-label={label}
      hasHover
      density={resolveAppTableDensity(density, compact)}
      plugins={{ sortable }}
      emptyState={empty}
      rowCount={serverSorted ? totalRows : pageSize ? rows.length : undefined}
      rowIndexStart={
        serverSorted ? rowStart : pageSize ? offset + 1 : undefined
      }
    />
  )
}

export function AppTreeTable<T extends Record<string, unknown>>({
  rows,
  columns: definitions,
  label,
  expanded,
  expandedIds,
  onExpandedIdsChange,
  empty,
}: {
  rows: T[]
  columns: AppColumn<T>[]
  label: string
  expanded?: string[]
  expandedIds?: ReadonlySet<string>
  onExpandedIdsChange?: (ids: ReadonlySet<string>) => void
  empty: ReactNode
}) {
  const density = useAppDensity()
  const { visibleData, treeConfig } = useTableTreeState({
    data: rows,
    idKey: 'id',
    treeColumnKey: 'title',
    defaultExpandedIds: expanded,
    expandedIds,
    onExpandedIdsChange,
  })
  const tree = useTableTreeData({
    ...treeConfig,
    getRowLabel: (item) => String(item.title),
    hasExpandAllControl: true,
  })
  return (
    <Table<T>
      data={visibleData}
      columns={columns(definitions)}
      idKey="id"
      aria-label={label}
      hasHover
      density={resolveAppTableDensity(density)}
      plugins={{ tree }}
      emptyState={empty}
    />
  )
}
