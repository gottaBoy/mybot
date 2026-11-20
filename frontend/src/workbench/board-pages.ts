import { maxTaskQueryPage } from './task-query'
import {
  queryStateCategories,
  type QueryStateCategory,
} from './query-conditions'

export type BoardPages = Record<QueryStateCategory, number>

export function defaultBoardPages(): BoardPages {
  return { pending: 1, active: 1, attention: 1, completed: 1, other: 1 }
}

export function parseBoardPages(value: unknown): BoardPages | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return undefined
  const keys = Reflect.ownKeys(value)
  if (
    keys.length !== queryStateCategories.length ||
    !queryStateCategories.every((state) =>
      Object.prototype.hasOwnProperty.call(value, state),
    )
  )
    return undefined
  const record = value as Record<string, unknown>
  const pages = defaultBoardPages()
  for (const state of queryStateCategories) {
    const page = record[state]
    if (
      typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > maxTaskQueryPage
    )
      return undefined
    pages[state] = page
  }
  return pages
}

export function boardPagesFromRaw(
  raw: string | undefined,
): BoardPages | undefined {
  if (raw === undefined) return defaultBoardPages()
  try {
    const pages = parseBoardPages(JSON.parse(raw))
    const strings = /"(?:[^"\\]|\\.)*"/g
    // The admitted shape has only numeric values: every JSON string token is
    // therefore a key. Extra tokens expose duplicates discarded by JSON.parse;
    // decimal/exponent tokens are floats under the server's strict integer schema.
    if (
      !pages ||
      raw.match(strings)?.length !== queryStateCategories.length ||
      /[.eE]/.test(raw.replace(strings, ''))
    )
      return undefined
    return pages
  } catch {
    return undefined
  }
}
