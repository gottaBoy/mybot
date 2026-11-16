import type { ListLocation } from './list-location'
import { supportedListQuery } from './list-location'
import {
  committedQueryConditions,
  querySelectionPatch,
} from './query-selection'
import { parseSavedViewDefinition, type SavedViewDefinition } from './saved-view-definition'
import type { TaskColumnKey } from './task-table-config'

export function captureSavedViewDefinition(
  location: ListLocation,
  presentation: {
    view: 'list' | 'table' | 'board'
    columns: TaskColumnKey[]
    column_order: TaskColumnKey[]
  },
  fixedProjectId?: string,
): SavedViewDefinition | null {
  const selection = committedQueryConditions(location, fixedProjectId)
  if (presentation.view !== 'list' || supportedListQuery(location).error ||
      selection.error) return null
  try {
    const sorts = location.sorts ??
      (location.order ? [{
        sortKey: location.order.split(':')[0],
        direction: location.order.split(':')[1],
      }] : [])
    return parseSavedViewDefinition({
      schema_version: 1,
      query: {
        text: location.query?.trim() ?? '',
        ...selection.conditions,
        jql: location.jql,
        mode: location.mode,
      },
      table: {
        page_size: location.pageSize ?? 20,
        sorts,
        columns: presentation.columns,
        column_order: presentation.column_order,
      },
    })
  } catch {
    return null
  }
}

export function savedViewLocationPatch(
  value: SavedViewDefinition,
  fixedProjectId?: string,
): Partial<ListLocation> {
  const definition = parseSavedViewDefinition(value)
  return {
    ...querySelectionPatch(
      definition.query.text,
      {
        projects: definition.query.projects,
        states: definition.query.states,
      },
      fixedProjectId,
    ),
    jql: definition.query.jql,
    mode: definition.query.mode,
    view: 'list',
    groupBy: '',
    group: 'none',
    order: undefined,
    sorts: definition.table.sorts.length ? definition.table.sorts : undefined,
    page: 1,
    pageSize: definition.table.page_size,
  }
}
