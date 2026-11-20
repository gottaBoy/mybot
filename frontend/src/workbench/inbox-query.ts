import {
  fetchTaskQueryPage,
  prepareTaskQueryRequest,
  type ServerTaskQueryRequest,
} from './task-query'

export type InboxType = 'all' | 'pending' | 'attention'
export type InboxQueryRequest = {
  query: string
  type: InboxType
  page: number
  pageSize: number
}
export type InboxReadError = 'forbidden' | 'unavailable' | 'timeout' | 'invalid'

export function parseInboxType(raw: string | undefined): InboxType | undefined {
  if (raw === undefined) return 'all'
  return raw === 'all' || raw === 'pending' || raw === 'attention'
    ? raw
    : undefined
}

export class InboxQueryInputError extends Error {
  constructor() {
    super('inbox_query_input_invalid')
  }
}

export function prepareInboxRequest(
  value: InboxQueryRequest,
): ServerTaskQueryRequest {
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).length !== 4 ||
      !['query', 'type', 'page', 'pageSize'].every((key) =>
        Object.prototype.hasOwnProperty.call(value, key),
      ) ||
      typeof value.type !== 'string' ||
      parseInboxType(value.type) === undefined
    )
      throw new InboxQueryInputError()
    const prepared = prepareTaskQueryRequest({
      query: {
        text: value.query,
        projects: [],
        states: value.type === 'all' ? ['pending', 'attention'] : [value.type],
        jql: '',
        mode: 'basic',
      },
      sorts: [],
      page: value.page,
      pageSize: value.pageSize,
    })
    return {
      query: prepared.query,
      sorts: [],
      page: prepared.page,
      pageSize: prepared.pageSize,
    }
  } catch {
    throw new InboxQueryInputError()
  }
}

export async function fetchInboxPage(
  request: InboxQueryRequest,
  signal?: AbortSignal,
) {
  return fetchTaskQueryPage(prepareInboxRequest(request), signal)
}
