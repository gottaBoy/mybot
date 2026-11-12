/**
 * The mybot playground preview protocol.
 *
 * The preview is intentionally narrower than Astryx's arbitrary TSX runner:
 * the parent may request only a template id from the local generated registry.
 * User-authored source is never evaluated in the sandbox.
 */
import type {ThemeSnapshot} from '../playground-themes'
import {isThemeId} from '../playground-themes'

export const PREVIEW_HELLO = 'mybot-preview-hello'
export const PREVIEW_CONNECT = 'mybot-preview-connect'

export type PreviewTemplateId = 'welcome' | string

export type PreviewParentMessage =
  | {
      type: 'mybot-preview-template'
      templateId: PreviewTemplateId
      mode: 'light' | 'dark'
      theme?: ThemeSnapshot
    }
  | {
      type: 'mybot-preview-theme'
      mode: 'light' | 'dark'
      theme?: ThemeSnapshot
    }
  | {
      type: 'mybot-preview-rebuild'
      templateId: PreviewTemplateId
      mode: 'light' | 'dark'
      theme?: ThemeSnapshot
    }
  | {type: 'mybot-preview-clear'}

export type PreviewChildMessage =
  | {type: 'mybot-preview-ready'}
  | {type: 'mybot-preview-building'; templateId: PreviewTemplateId}
  | {type: 'mybot-preview-rendered'; templateId: PreviewTemplateId}
  | {
      type: 'mybot-preview-error'
      templateId?: PreviewTemplateId
      error: string
      phase: 'protocol' | 'load' | 'runtime'
    }

export type PreviewGeneration = {
  key: number
  src: string
}

const reservedKeys = new Set(['__proto__', 'constructor', 'prototype'])

function isStyleMap(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || depth > 5) return false
  return Object.entries(value).length <= 3000 && Object.entries(value).every(([key, entry]) =>
    !reservedKeys.has(key) && (
      typeof entry === 'string'
        ? entry.length <= 4096 && !/@import|url\s*\(/i.test(entry)
        : isStyleMap(entry, depth + 1)
    ),
  )
}

export function isThemeSnapshot(value: unknown): value is ThemeSnapshot {
  if (!value || typeof value !== 'object') return false
  const theme = value as ThemeSnapshot
  return isThemeId(theme.preset) && isStyleMap(theme.tokens) &&
    Object.entries(theme.tokens).every(([key, entry]) => key.startsWith('--') && typeof entry === 'string') &&
    (theme.components == null || isStyleMap(theme.components))
}

export function isPreviewParentMessage(value: unknown): value is PreviewParentMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as PreviewParentMessage
  if (message.type === 'mybot-preview-clear') return true
  if (!['mybot-preview-template', 'mybot-preview-rebuild', 'mybot-preview-theme'].includes(message.type)) return false
  if (!('mode' in message) || !['light', 'dark'].includes(message.mode)) return false
  if (message.theme != null && !isThemeSnapshot(message.theme)) return false
  return message.type === 'mybot-preview-theme' || typeof message.templateId === 'string'
}

function createNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function previewSrc(nonce: string) {
  return `/preview.html?preview=1#mybot-preview-nonce=${encodeURIComponent(nonce)}`
}

export function readPreviewNonce(hash = window.location.hash) {
  return new URLSearchParams(hash.replace(/^#/, '')).get('mybot-preview-nonce')
}

export function announcePreview(parent: Pick<Window, 'postMessage'>, nonce: string | null) {
  parent.postMessage({type: PREVIEW_HELLO, nonce}, '*')
}

function connectToPreview(frame: Pick<Window, 'postMessage'>) {
  const channel = new MessageChannel()
  frame.postMessage({type: PREVIEW_CONNECT}, '*', [channel.port2])
  return channel.port1
}

export function acceptPreviewConnect(
  event: Pick<MessageEvent, 'data' | 'source' | 'ports'>,
  parentWindow: MessageEventSource | null | undefined,
) {
  const data = event.data as {type?: unknown} | null
  if (data?.type !== PREVIEW_CONNECT || parentWindow == null || event.source !== parentWindow) {
    return null
  }
  return event.ports[0] ?? null
}

export interface PreviewConnector {
  issue(): string
  attachFrame(frame: MessageEventSource): void
  handleWindowMessage(event: MessageEvent): void
  handleFrameLoad(): void
  post(message: PreviewParentMessage): void
  isAttested(): boolean
  stop(): void
}

/**
 * A small attested channel copied from Astryx's trust model. A new nonce and
 * iframe generation are required after any navigation/reload of the preview.
 */
export function createPreviewConnector({
  onMessage,
  onAttested,
  onReplaced,
}: {
  onMessage: (event: MessageEvent<PreviewChildMessage>) => void
  onAttested?: () => void
  onReplaced: () => void
}): PreviewConnector {
  let outstanding: string | null = null
  let frame: MessageEventSource | null = null
  let port: MessagePort | null = null
  let attested = false
  let loads = 0

  const discard = () => {
    port?.close()
    port = null
    outstanding = null
    frame = null
    attested = false
    loads = 0
  }

  return {
    issue() {
      discard()
      outstanding = createNonce()
      return outstanding
    },
    attachFrame(next) {
      frame = next
    },
    handleWindowMessage(event) {
      const data = event.data as {type?: unknown; nonce?: unknown} | null
      if (
        data?.type !== PREVIEW_HELLO ||
        outstanding == null ||
        attested ||
        typeof data.nonce !== 'string' ||
        data.nonce !== outstanding ||
        frame == null ||
        event.source !== frame
      ) {
        return
      }
      attested = true
      port = connectToPreview(frame as Pick<Window, 'postMessage'>)
      port.onmessage = onMessage
      onAttested?.()
    },
    handleFrameLoad() {
      loads += 1
      if (loads === 1) return
      discard()
      onReplaced()
    },
    post(message) {
      port?.postMessage(message)
    },
    isAttested() {
      return attested
    },
    stop: discard,
  }
}
