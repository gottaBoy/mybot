import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultTaskColumnOrder,
  defaultTaskColumns,
  moveTaskColumn,
  normalizeTaskColumnOrder,
  normalizeTaskColumns,
  readTaskColumnOrder,
  readTaskColumns,
  taskColumnKeys,
  taskColumnOrderPreferenceKey,
  taskColumnsPreferenceKey,
} from '../src/workbench/task-table-config'

afterEach(() => vi.unstubAllGlobals())

describe('task column preferences', () => {
  it('restores defaults for a malformed preference', () => {
    expect(normalizeTaskColumns(null)).toEqual(defaultTaskColumns)
    expect(normalizeTaskColumns({ projectName: false })).toEqual(
      defaultTaskColumns,
    )
  })
  it('keeps a task entry point when every optional column is hidden', () => {
    expect(normalizeTaskColumns([])).toEqual(['title'])
    expect(normalizeTaskColumns(['unknown', 5, null])).toEqual(['title'])
  })
  it('deduplicates known keys in the canonical column order', () => {
    expect(
      normalizeTaskColumns(['status', 'id', 'status', 'created_at']),
    ).toEqual(['id', 'title', 'status', 'created_at'])
    expect(defaultTaskColumns).not.toContain('created_at')
  })
})

describe('independent task column order', () => {
  it('keeps all seven keys, including hidden columns, in a valid permutation', () => {
    const order = [...taskColumnKeys].reverse()
    expect(normalizeTaskColumnOrder(order)).toEqual(order)
    expect(normalizeTaskColumnOrder(order)).not.toBe(order)
    expect(defaultTaskColumnOrder).toEqual(taskColumnKeys)
  })
  it.each([
    undefined,
    null,
    {},
    [],
    ['title'],
    [...taskColumnKeys, 'id'],
    [...taskColumnKeys.slice(1), 'title'],
    [...taskColumnKeys.slice(1), 'unknown'],
  ])('restores a complete default order for malformed input %j', (value) => {
    expect(normalizeTaskColumnOrder(value)).toEqual(defaultTaskColumnOrder)
  })
  it('moves one column at a time without hiding columns or mutating the input', () => {
    const order = [...defaultTaskColumnOrder]
    expect(moveTaskColumn(order, 'title', -1).slice(0, 2)).toEqual([
      'title',
      'id',
    ])
    expect(moveTaskColumn(order, 'id', 1).slice(0, 2)).toEqual(['title', 'id'])
    expect(moveTaskColumn(order, 'id', -1)).toEqual(order)
    expect(moveTaskColumn(order, 'created_at', 1)).toEqual(order)
    expect(order).toEqual(defaultTaskColumnOrder)
  })
  it('reads order and legacy visibility from different unchanged storage contracts', () => {
    const order = [...taskColumnKeys].reverse()
    const values = new Map([
      [taskColumnOrderPreferenceKey, JSON.stringify(order)],
      [taskColumnsPreferenceKey, JSON.stringify(['title', 'status'])],
    ])
    const getItem = vi.fn((key: string) => values.get(key) ?? null)
    vi.stubGlobal('localStorage', { getItem })
    expect(readTaskColumnOrder()).toEqual(order)
    expect(readTaskColumns()).toEqual(['title', 'status'])
    expect(taskColumnsPreferenceKey).toBe('mybot.task-columns.v1')
    expect(taskColumnOrderPreferenceKey).not.toBe(taskColumnsPreferenceKey)
  })
  it.each([null, '{invalid', JSON.stringify(['title'])])(
    'handles missing or malformed order storage %j',
    (value) => {
      vi.stubGlobal('localStorage', { getItem: () => value })
      expect(readTaskColumnOrder()).toEqual(defaultTaskColumnOrder)
    },
  )
  it('uses defaults when preference storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked')
      },
    })
    expect(readTaskColumnOrder()).toEqual(defaultTaskColumnOrder)
  })
})
