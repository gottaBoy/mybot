import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, post } from '../src/workbench/api'

afterEach(() => vi.unstubAllGlobals())

describe('workbench API boundary', () => {
  it('sends mutations with JSON, explicit boundary and same-origin cookies', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"saved"}'))
    vi.stubGlobal('fetch', fetch)
    expect(await post('/projects', { name: 'Project' })).toEqual({
      id: 'saved',
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Project"}',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-Workbench-Request': '1',
        },
      }),
    )
  })
  it('broadcasts authentication loss instead of retaining private projections', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"detail":"Authentication required"}', { status: 401 }),
        ),
    )
    await expect(api('/bootstrap')).rejects.toMatchObject({ status: 401 })
    expect(dispatchEvent.mock.calls[0][0].type).toBe('mybot:unauthorized')
  })
  it.each(['<html>Expired session</html>', ''])(
    'clears private projections even when a 401 body is not JSON: %j',
    async (body) => {
      const dispatchEvent = vi.fn()
      const fetch = vi
        .fn()
        .mockResolvedValue(new Response(body, { status: 401 }))
      vi.stubGlobal('window', { dispatchEvent })
      vi.stubGlobal('fetch', fetch)
      await expect(api('/saved-views')).rejects.toBeInstanceOf(SyntaxError)
      expect(dispatchEvent).toHaveBeenCalledTimes(1)
      expect(dispatchEvent.mock.calls[0][0].type).toBe('mybot:unauthorized')
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )
  it('exposes structured validation errors without treating the write as successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            '{"detail":[{"loc":["body","name"],"msg":"Field required"}]}',
            { status: 422 },
          ),
        ),
    )
    await expect(post('/projects')).rejects.toThrow('name: Field required')
  })
  it('preserves abort semantics for stale route requests', async () => {
    const error = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
    await expect(api('/bootstrap')).rejects.toBe(error)
  })
  it('does not retry a network failure', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Offline'))
    vi.stubGlobal('fetch', fetch)
    await expect(post('/tasks/task/runs', {})).rejects.toBeInstanceOf(ApiError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
