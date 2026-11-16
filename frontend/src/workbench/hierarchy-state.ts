import { treeBranchIds, type WorkTreeRow } from './projections'

export type HierarchyExpansionState = {
  userExpandedIds: ReadonlySet<string>
  search?: { query: string; expandedIds: ReadonlySet<string> }
}

function pruneIds(ids: ReadonlySet<string>, rows: WorkTreeRow[]) {
  const branches = new Set(treeBranchIds(rows))
  return new Set([...ids].filter((id) => branches.has(id)))
}

function equalIds(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

export function initialHierarchyExpansion(
  rows: WorkTreeRow[],
): HierarchyExpansionState {
  return {
    userExpandedIds: pruneIds(new Set(rows.map((row) => row.id)), rows),
  }
}

export function hierarchyExpandedIds(
  state: HierarchyExpansionState,
  rows: WorkTreeRow[],
  query: string,
): ReadonlySet<string> {
  const search = query.trim().toLocaleLowerCase()
  if (!search) return pruneIds(state.userExpandedIds, rows)
  return state.search?.query === search
    ? pruneIds(state.search.expandedIds, rows)
    : new Set(treeBranchIds(rows))
}

export function changeHierarchyExpansion(
  state: HierarchyExpansionState,
  ids: ReadonlySet<string>,
  rows: WorkTreeRow[],
  query: string,
): HierarchyExpansionState {
  const search = query.trim().toLocaleLowerCase()
  const expandedIds = pruneIds(ids, rows)
  return search
    ? { ...state, search: { query: search, expandedIds } }
    : { ...state, userExpandedIds: expandedIds }
}

export function pruneHierarchyExpansion(
  state: HierarchyExpansionState,
  rows: WorkTreeRow[],
): HierarchyExpansionState {
  const userExpandedIds = pruneIds(state.userExpandedIds, rows)
  const searchExpandedIds = state.search
    ? pruneIds(state.search.expandedIds, rows)
    : undefined
  if (
    equalIds(userExpandedIds, state.userExpandedIds) &&
    (!state.search ||
      (searchExpandedIds &&
        equalIds(searchExpandedIds, state.search.expandedIds)))
  )
    return state
  return {
    userExpandedIds,
    ...(state.search && searchExpandedIds
      ? { search: { ...state.search, expandedIds: searchExpandedIds } }
      : {}),
  }
}
