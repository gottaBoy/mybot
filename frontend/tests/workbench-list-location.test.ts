import { describe, expect, it } from 'vitest'
import {
  listLocationHref,
  readListLocation,
  supportedListQuery,
} from '../src/workbench/list-location'

const example =
  'jql=assignee+%3D+currentUser%28%29+ORDER+BY+created+DESC&mode=basic&view=list&groupBy=&group=none'
describe('Run history order URL state', () => {
  it('round trips runOrder independently from Task order/sorts', () => {
    const href = listLocationHref(
      'http://localhost/?source=keep#workbench?view=table&order=attempts:descending',
      {
        runOrder: 'created_at:ascending',
        page: 1,
      },
    )
    expect(readListLocation(`http://localhost${href}`)).toMatchObject({
      view: 'table',
      order: 'attempts:descending',
      runOrder: 'created_at:ascending',
      page: 1,
    })
  })
  it('preserves malformed Run sorting through unrelated presentation changes', () => {
    const next = listLocationHref(
      'http://localhost/#workbench?runOrder=attempts:ascending',
      { view: 'list' },
    )
    const state = readListLocation(`http://localhost${next}`)
    expect(state.runOrder).toBe('attempts:ascending')
    expect(state.runOrderInvalid).toBe(true)
    expect(supportedListQuery(state)).toEqual({ sort: undefined })
  })
  it('clears Run order without deleting independent Task settings', () => {
    const href = listLocationHref(
      'http://localhost/?runOrder=id:ascending#workbench?runOrder=status:descending&order=title:ascending',
      { runOrder: undefined },
    )
    expect(readListLocation(`http://localhost${href}`)).toMatchObject({
      order: 'title:ascending',
    })
    expect(readListLocation(`http://localhost${href}`)).not.toHaveProperty(
      'runOrder',
    )
    expect(new URL(href, 'http://localhost').searchParams.has('runOrder')).toBe(
      false,
    )
  })
  it('prefers hash-scoped Run sorting and keeps empty candidate explicitly invalid', () => {
    expect(
      readListLocation(
        'http://localhost/?runOrder=id:ascending#workbench?runOrder=',
      ),
    ).toMatchObject({
      runOrder: '',
      runOrderInvalid: true,
    })
  })
})
describe('shareable list URL state', () => {
  it('keeps a committed basic query separate from the JQL expression', () => {
    expect(
      readListLocation('http://localhost/#workbench?q=agent%20workflow'),
    ).toMatchObject({ query: 'agent workflow', jql: '' })
    const next = listLocationHref('http://localhost/#workbench', {
      query: 'agent workflow',
      page: 1,
    })
    expect(readListLocation(`http://localhost${next}`)).toMatchObject({
      query: 'agent workflow',
      page: 1,
    })
    const params = new URLSearchParams(
      new URL(next, 'http://localhost').hash.split('?')[1],
    )
    expect(params.get('q')).toBe('agent workflow')
    expect(params.has('query')).toBe(false)
  })
  it('accepts the old query alias but writes only canonical q', () => {
    const href =
      'http://localhost/?query=outer&source=shared#workbench?query=legacy&local=retained'
    expect(readListLocation(href).query).toBe('legacy')
    const next = new URL(listLocationHref(href, {}), 'http://localhost')
    expect(next.searchParams.has('query')).toBe(false)
    expect(next.searchParams.has('q')).toBe(false)
    const params = new URLSearchParams(next.hash.split('?')[1])
    expect(params.get('q')).toBe('legacy')
    expect(params.has('query')).toBe(false)
    expect(next.searchParams.get('source')).toBe('shared')
    expect(params.get('local')).toBe('retained')
  })
  it.each([
    ['?q=outer#workbench?q=inner', 'inner'],
    ['?q=outer#workbench?query=inner-alias', 'inner-alias'],
    ['?query=outer-alias#workbench?q=inner', 'inner'],
    ['?q=canonical&query=alias#workbench', 'canonical'],
    ['#workbench?q=canonical&query=alias', 'canonical'],
    ['?q=outer#workbench?q=', undefined],
  ])('prefers hash scope then canonical q in %s', (url, query) => {
    expect(readListLocation(`http://localhost/${url}`).query).toBe(query)
  })
  it.each(['', undefined, '   '])(
    'removes query aliases from both URL scopes when cleared with %j',
    (query) => {
      const next = new URL(
        listLocationHref(
          'http://localhost/?q=outer&query=outer-alias#workbench?q=inner&query=inner-alias',
          { query },
        ),
        'http://localhost',
      )
      expect(next.searchParams.has('q')).toBe(false)
      expect(next.searchParams.has('query')).toBe(false)
      expect(next.hash).toBe('#workbench')
      expect(readListLocation(next.href)).not.toHaveProperty('query')
    },
  )
  it('round-trips committed query, filter, project, order and numeric pagination', () => {
    const next = listLocationHref(
      'http://localhost/?source=shared&filter=active&pageSize=20#workbench?local=retained&page=4',
      {
        query: 'task 42',
        filter: 'attention',
        project: 'project-a',
        order: 'updated:descending',
        page: 2,
        pageSize: 50,
      },
    )
    expect(readListLocation(`http://localhost${next}`)).toEqual({
      query: 'task 42',
      jql: '',
      mode: 'basic',
      view: undefined,
      filter: 'attention',
      project: 'project-a',
      order: 'updated:descending',
      groupBy: '',
      group: 'none',
      page: 2,
      pageSize: 50,
    })
    const url = new URL(next, 'http://localhost')
    const params = new URLSearchParams(url.hash.split('?')[1])
    expect(url.searchParams.toString()).toBe('source=shared')
    expect(params.get('local')).toBe('retained')
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('50')
  })
  it('retains unrelated duplicate parameters and literal question marks in the hash query', () => {
    const next = new URL(
      listLocationHref(
        'http://localhost/work?tag=one&tag=two#workbench?local=a?b&local=second',
        { query: 'agent?workflow' },
      ),
      'http://localhost',
    )
    expect(next.pathname).toBe('/work')
    expect(next.searchParams.getAll('tag')).toEqual(['one', 'two'])
    const params = new URLSearchParams(
      next.hash.slice(next.hash.indexOf('?') + 1),
    )
    expect(params.getAll('local')).toEqual(['a?b', 'second'])
    expect(params.get('q')).toBe('agent?workflow')
  })
  it('prefers hash filter, project and order over plain parameters', () => {
    expect(
      readListLocation(
        'http://localhost/?filter=active&project=outer&order=id:ascending#workbench?filter=completed&project=inner&order=attempts:descending',
      ),
    ).toMatchObject({
      filter: 'completed',
      project: 'inner',
      order: 'attempts:descending',
    })
  })
  it.each(['all', 'active', 'attention', 'completed'] as const)(
    'accepts the explicit %s task filter',
    (filter) => {
      const next = listLocationHref('http://localhost/#workbench', { filter })
      expect(readListLocation(`http://localhost${next}`).filter).toBe(filter)
    },
  )
  it.each(['', 'pending', 'failed', 'All', 'active ', 'unknown'])(
    'omits unsupported task filter %j on read and canonical write',
    (filter) => {
      const href = `http://localhost/#workbench?filter=${encodeURIComponent(filter)}`
      expect(readListLocation(href)).not.toHaveProperty('filter')
      const next = new URL(listLocationHref(href, {}), 'http://localhost')
      expect(new URLSearchParams(next.hash.split('?')[1]).has('filter')).toBe(
        false,
      )
    },
  )
  it.each([
    'id',
    'title',
    'projectName',
    'status',
    'updated',
    'attempts',
    'created_at',
  ])('round-trips both strict directions for task order key %s', (key) => {
    for (const direction of ['ascending', 'descending']) {
      const order = `${key}:${direction}`
      const next = listLocationHref('http://localhost/#workbench', { order })
      expect(readListLocation(`http://localhost${next}`).order).toBe(order)
    }
  })
  it.each([
    '',
    'id',
    'id:asc',
    'id:DESC',
    'id:ascending:descending',
    'id:ascending,title:descending',
    'assignee:ascending',
    'project:ascending',
    'created:descending',
    'Title:ascending',
    ' id:ascending',
    'id:ascending ',
    'id:ascending\n',
  ])('omits invalid task order %j on read and canonical write', (order) => {
    const href = `http://localhost/#workbench?order=${encodeURIComponent(order)}`
    expect(readListLocation(href)).not.toHaveProperty('order')
    const next = new URL(listLocationHref(href, {}), 'http://localhost')
    expect(new URLSearchParams(next.hash.split('?')[1]).has('order')).toBe(
      false,
    )
  })
  it('omits empty projects and normalizes a nonempty opaque project ID', () => {
    expect(
      readListLocation('http://localhost/#workbench?project=%20%20'),
    ).not.toHaveProperty('project')
    const next = listLocationHref('http://localhost/#workbench', {
      project: ' project-a ',
    })
    expect(readListLocation(`http://localhost${next}`).project).toBe(
      'project-a',
    )
  })
  it('rejects invalid patches and removes explicitly omitted optional controls', () => {
    const next = listLocationHref(
      'http://localhost/#workbench?filter=active&project=project-a&order=id:ascending&page=2&pageSize=50',
      {
        filter: 'failed' as never,
        project: '',
        order: 'assignee:ascending',
        page: 0,
        pageSize: 25,
      },
    )
    const state = readListLocation(`http://localhost${next}`)
    for (const key of ['filter', 'project', 'order', 'page', 'pageSize'])
      expect(state).not.toHaveProperty(key)
    const cleared = listLocationHref(
      'http://localhost/#workbench?filter=active&project=project-a&order=id:ascending',
      { filter: undefined, project: undefined, order: undefined },
    )
    expect(new URL(cleared, 'http://localhost').hash).toBe('#workbench')
  })
  it('decodes the exact requested URL using URLSearchParams, not string replacement', () => {
    expect(readListLocation(`http://localhost/?${example}#workbench`)).toEqual({
      jql: 'assignee = currentUser() ORDER BY created DESC',
      mode: 'basic',
      view: 'list',
      groupBy: '',
      group: 'none',
    })
    expect(readListLocation(`http://localhost/#workbench?${example}`)).toEqual(
      readListLocation(`http://localhost/?${example}#workbench`),
    )
  })
  it('preserves query scope while switching views and normalizes owned params into the hash', () => {
    const next = listLocationHref(`http://localhost/?${example}#workbench`, {
      view: 'table',
    })
    expect(readListLocation(`http://localhost${next}`)).toMatchObject({
      jql: 'assignee = currentUser() ORDER BY created DESC',
      view: 'table',
      mode: 'basic',
      group: 'none',
    })
    expect(next).not.toContain('/?jql=')
  })
  it('preserves the existing default shape when pagination parameters are absent', () => {
    expect(readListLocation('http://localhost/#workbench')).toEqual({
      jql: '',
      mode: 'basic',
      view: undefined,
      groupBy: '',
      group: 'none',
    })
  })
  it.each([20, 50, 100])(
    'reads a safe page and supported page size %s',
    (pageSize) => {
      expect(
        readListLocation(
          `http://localhost/?page=9007199254740991&pageSize=${pageSize}#workbench`,
        ),
      ).toMatchObject({ page: Number.MAX_SAFE_INTEGER, pageSize })
    },
  )
  it.each([
    '',
    '0',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '1e2',
    '0x10',
    ' 2',
    '2\n',
    '9007199254740992',
  ])(
    'omits invalid page parameter %j without dropping a valid page size',
    (page) => {
      const state = readListLocation(
        `http://localhost/#workbench?page=${encodeURIComponent(page)}&pageSize=50`,
      )
      expect(state).not.toHaveProperty('page')
      expect(state.pageSize).toBe(50)
    },
  )
  it.each([
    '',
    '0',
    '-20',
    '25',
    '20.5',
    'Infinity',
    '2e1',
    '9007199254740992',
  ])('omits invalid page size %j without dropping a valid page', (pageSize) => {
    const state = readListLocation(
      `http://localhost/#workbench?page=3&pageSize=${encodeURIComponent(pageSize)}`,
    )
    expect(state.page).toBe(3)
    expect(state).not.toHaveProperty('pageSize')
  })
  it('keeps shared pagination, query scope and unrelated parameters when changing views', () => {
    const next = listLocationHref(
      `http://localhost/?source=shared&${example}&page=3&pageSize=50#workbench?local=retained&page=4`,
      { view: 'board' },
    )
    expect(readListLocation(`http://localhost${next}`)).toEqual({
      jql: 'assignee = currentUser() ORDER BY created DESC',
      mode: 'basic',
      view: 'board',
      groupBy: '',
      group: 'none',
      page: 4,
      pageSize: 50,
    })
    const url = new URL(next, 'http://localhost')
    expect(url.searchParams.get('source')).toBe('shared')
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('pageSize')).toBe(false)
    expect(new URLSearchParams(url.hash.split('?')[1]).get('local')).toBe(
      'retained',
    )
  })
  it('serializes numeric pagination patches and removes explicitly omitted keys', () => {
    const next = listLocationHref(
      'http://localhost/#workbench?view=list&page=3&pageSize=20',
      { page: 2, pageSize: 100 },
    )
    const params = new URLSearchParams(
      new URL(next, 'http://localhost').hash.split('?')[1],
    )
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('100')
    const cleared = listLocationHref(`http://localhost${next}`, {
      page: undefined,
      pageSize: undefined,
      view: 'table',
    })
    const state = readListLocation(`http://localhost${cleared}`)
    expect(state.view).toBe('table')
    expect(state).not.toHaveProperty('page')
    expect(state).not.toHaveProperty('pageSize')
  })
  it('supports explicit created/summary ordering without claiming arbitrary JQL', () => {
    expect(
      supportedListQuery(
        readListLocation(
          'http://localhost/#workbench?jql=ORDER+BY+created+DESC',
        ),
      ),
    ).toEqual({ sort: { key: 'created_at', descending: true } })
  })
  it('rejects assignment and currentUser semantics missing from the domain', () => {
    expect(
      supportedListQuery(readListLocation(`http://localhost/?${example}`)),
    ).toEqual({ error: 'assignee_unavailable' })
  })
  it('does not silently ignore unsupported grouping or expressions', () => {
    expect(
      supportedListQuery({
        ...readListLocation('http://localhost'),
        group: 'status',
      }),
    ).toEqual({ error: 'grouping_unavailable' })
    expect(
      supportedListQuery({
        ...readListLocation('http://localhost'),
        jql: 'project = SECRET',
      }),
    ).toEqual({ error: 'jql_unavailable' })
  })
})
