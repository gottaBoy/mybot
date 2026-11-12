/**
 * Small browser-only codec for Astryx playground links.
 *
 * Astryx publishes URL code as base64url encoded raw DEFLATE. Keeping the
 * codec here avoids coupling mybot's playground shell to the upstream build
 * toolchain while still allowing links copied from the official playground to
 * open locally.
 */

type DeflateFormat = 'deflate-raw' | 'deflate'

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function transformDeflate(
  bytes: Uint8Array,
  format: DeflateFormat,
  mode: 'compress' | 'decompress',
) {
  const Stream = mode === 'compress' ? CompressionStream : DecompressionStream
  const stream = new Stream(format as CompressionFormat)
  const input = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(input).arrayBuffer())
}

async function decodeCompressed(value: string) {
  const bytes = base64UrlToBytes(value)
  // Chromium supports raw DEFLATE, while some browsers only expose the zlib
  // wrapped "deflate" format. Trying both keeps shared links portable.
  for (const format of ['deflate-raw', 'deflate'] as const) {
    try {
      return new TextDecoder().decode(await transformDeflate(bytes, format, 'decompress'))
    } catch {
      // Try the next browser format.
    }
  }
  return null
}

export function readPlaygroundCodeFromHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '')
  const query = raw.startsWith('templates?') ? raw.slice('templates?'.length) : raw
  const compressed = new URLSearchParams(query).get('code')
  if (!compressed) return Promise.resolve(null)
  const plain = decodePlainPlaygroundCode(compressed)
  if (plain != null) return Promise.resolve(plain)
  return decodeCompressed(compressed)
}

export function readTemplateFromHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '')
  const query = raw.startsWith('templates?') ? raw.slice('templates?'.length) : raw
  return new URLSearchParams(query).get('template')
}

export async function compressPlaygroundCode(code: string) {
  try {
    const bytes = await transformDeflate(new TextEncoder().encode(code), 'deflate-raw', 'compress')
    return bytesToBase64Url(bytes)
  } catch {
    // A plain UTF-8 fallback is intentionally prefixed so it can never be
    // mistaken for an upstream compressed payload.
    return `plain.${bytesToBase64Url(new TextEncoder().encode(code))}`
  }
}

export function decodePlainPlaygroundCode(value: string) {
  if (!value.startsWith('plain.')) return null
  try {
    return new TextDecoder().decode(base64UrlToBytes(value.slice('plain.'.length)))
  } catch {
    return null
  }
}

export async function updatePlaygroundCodeInUrl(code: string, template?: string | null) {
  const encoded = await compressPlaygroundCode(code)
  const query = new URLSearchParams({code: encoded})
  if (template) query.set('template', template)
  const url = new URL(window.location.href)
  url.hash = `templates?${query.toString()}`
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}
