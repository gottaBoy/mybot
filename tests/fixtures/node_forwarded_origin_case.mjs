import assert from 'node:assert/strict'
import test from 'node:test'
import { forwardedOrigin } from './forwarded-origin.mjs'

const origin = 'http://localhost:5176'
const host = 'localhost:5176'

test('forwards the browser own origin to the configured backend origin', () => {
  assert.equal(forwardedOrigin(origin, host, 'http://127.0.0.1:4187/'), 'http://127.0.0.1:4187')
})

test('preserves a foreign origin for the backend rejection boundary', () => {
  const foreign = 'https://foreign.example'
  assert.equal(forwardedOrigin(foreign, host, 'http://127.0.0.1:4187/'), foreign)
})

test('does not rewrite an origin for a backend target containing credentials', () => {
  assert.equal(forwardedOrigin(origin, host, 'http://user:pass@127.0.0.1:4187/'), origin)
})

test('does not rewrite an origin for a backend target containing a path', () => {
  assert.equal(forwardedOrigin(origin, host, 'http://127.0.0.1:4187/private'), origin)
})
