import { describe, expect, it } from 'vitest'
import {
  parseSavedViewDefinition,
  type SavedViewDefinition,
} from '../src/workbench/saved-view-definition'
import {
  captureSavedViewDefinition,
  savedViewLocationPatch,
} from '../src/workbench/saved-view-projection'
import { readListLocation, listLocationHref } from '../src/workbench/list-location'
import {
  defaultTaskColumns,
  defaultTaskColumnOrder,
} from '../src/workbench/task-table-config'

function definition(): SavedViewDefinition {
  return {
    schema_version: 1,
    query: {
      text: 'release',
      projects: ['project-a', 'project-b'],
      states: ['active', 'completed'],
      jql: '',
      mode: 'basic',
    },
    table: {
      page_size: 50,
      sorts: [
        { sortKey: 'projectName', direction: 'ascending' },
        { sortKey: 'title', direction: 'descending' },
      ],
      columns: [...defaultTaskColumns],
      column_order: [...defaultTaskColumnOrder],
    },
  }
}
const presentation = {
  view: 'list' as const,
  columns: [...defaultTaskColumns],
  column_order: [...defaultTaskColumnOrder],
}
describe('saved task-view definitions', () => {
  it('validates the versioned finite definition without mutating its input', () => {
    const value = definition()
    const before = structuredClone(value)
    expect(parseSavedViewDefinition(value)).toEqual(value)
    expect(value).toEqual(before)
    expect(parseSavedViewDefinition(value)).not.toBe(value)
  })
  it.each([null, [], {}, { ...definition(), schema_version: 2 },
    { ...definition(), privateKey: 'not-allowed' }])(
    'rejects unsupported root envelopes %j', (value) => {
      expect(() => parseSavedViewDefinition(value)).toThrow('saved_view_definition_invalid')
    },
  )
  it.each([
    { text: 1 },
    { text: 'x'.repeat(2001) },
    { mode: 'board' },
    { projects: ['project-a', 'project-a'] },
    { states: ['active', 'unknown'] },
    { states: ['active', 'active'] },
    { jql: 'assignee = currentUser()' },
    { jql: 'ORDER BY unknown DESC' },
    { owner: 'invented-user' },
  ])('rejects unknown query fields or unsupported values %j', (patch) => {
    const value = definition()
    expect(() => parseSavedViewDefinition({
      ...value, query: { ...value.query, ...patch },
    })).toThrow('saved_view_definition_invalid')
  })
  it.each([
    { page_size: '20' },
    { page_size: 25 },
    { columns: ['id'] },
    { columns: ['title', 'title'] },
    { columns: ['title', 'unknown'] },
    { column_order: ['title'] },
    { column_order: ['title', 'title', 'id', 'status', 'updated', 'attempts', 'created_at'] },
    { sorts: [{ sortKey: 'assignee', direction: 'ascending' }] },
    { sorts: [{ sortKey: 'id', direction: 'desc' }] },
    { sorts: [{ sortKey: 'id', direction: 'ascending' }, { sortKey: 'id', direction: 'descending' }] },
    { theme: 'not-a-query' },
  ])('rejects lossy or unknown table settings %j', (patch) => {
    const value = definition()
    expect(() => parseSavedViewDefinition({
      ...value, table: { ...value.table, ...patch },
    })).toThrow('saved_view_definition_invalid')
  })
  it('canonicalizes set-like selections while retaining sort and column priority', () => {
    const value = definition()
    value.query.projects.reverse()
    value.query.states.reverse()
    value.query.jql = '  order   BY summary desc '
    value.table.column_order.reverse()
    const parsed = parseSavedViewDefinition(value)
    expect(parsed.query.projects).toEqual(['project-a', 'project-b'])
    expect(parsed.query.states).toEqual(['active', 'completed'])
    expect(parsed.query.jql).toBe('ORDER BY SUMMARY DESC')
    expect(parsed.table.column_order).toEqual(value.table.column_order)
    expect(parsed.table.sorts).toEqual(value.table.sorts)
  })
  it('counts text in Unicode code points rather than UTF-16 code units', () => {
    const value = definition()
    value.query.text = '\u{20000}'.repeat(2000)
    expect(parseSavedViewDefinition(value).query.text).toBe(value.query.text)
    value.query.text += 'x'
    expect(() => parseSavedViewDefinition(value)).toThrow()
  })
})
describe('committed-view capture and application', () => {
  it('captures committed URL criteria, configured sort and applied columns, not a draft', () => {
    const state = readListLocation('http://localhost/#workbench?q=release&project=project-a&filter=active&page=4&pageSize=50&order=title:descending')
    const captured = captureSavedViewDefinition(state, presentation)
    expect(captured).toMatchObject({
      query: { text: 'release', projects: ['project-a'], states: ['active'] },
      table: { page_size: 50, sorts: [{ sortKey: 'title', direction: 'descending' }] },
    })
    expect(captured).not.toHaveProperty('page')
    expect(captured).not.toHaveProperty('draft')
  })
  it.each(['board', 'table'] as const)('does not claim %s view settings are saved task columns', (view) => {
    expect(captureSavedViewDefinition(readListLocation('http://localhost/#workbench'), {
      ...presentation, view,
    })).toBeNull()
  })
  it.each([
    '?jql=assignee%20%3D%20currentUser()',
    '?states=%5B%22unknown%22%5D',
    '?sorts=not-json',
    '?group=project',
  ])('blocks capture of an unsupported committed state %s', (suffix) => {
    expect(captureSavedViewDefinition(readListLocation(`http://localhost/#workbench${suffix}`), presentation)).toBeNull()
  })
  it('keeps a fixed project above conflicting URL selections', () => {
    const state = readListLocation('http://localhost/#project/project-a?projects=%5B%22project-b%22%5D')
    expect(captureSavedViewDefinition(state, presentation, 'project-a')?.query.projects)
      .toEqual(['project-a'])
  })
  it('preserves an explicit empty sort overriding legacy order', () => {
    const state = readListLocation('http://localhost/#workbench?order=title:ascending&sorts=%5B%5D')
    expect(captureSavedViewDefinition(state, presentation)?.table.sorts).toEqual([])
  })
  it('applies a validated snapshot in one URL patch and resets stale grouping/page', () => {
    const value = definition()
    const patch = savedViewLocationPatch(value)
    const href = listLocationHref(
      'http://localhost/#workbench?q=old&project=old&filter=attention&order=id:ascending&page=9&group=project',
      patch,
    )
    expect(readListLocation(`http://localhost${href}`)).toMatchObject({
      query: 'release',
      projects: ['project-a', 'project-b'],
      states: ['active', 'completed'],
      sorts: value.table.sorts,
      view: 'list', page: 1, pageSize: 50, group: 'none',
    })
    expect(patch.order).toBeUndefined()
    expect(patch.project).toBeUndefined()
    expect(patch.filter).toBeUndefined()
  })
  it('does not let loading a definition change a fixed project route', () => {
    expect(savedViewLocationPatch(definition(), 'project-a')).toMatchObject({
      project: 'project-a', projects: undefined, page: 1,
    })
  })
})
