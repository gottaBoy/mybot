import {useCallback, useEffect, useRef, useState} from 'react'
import {RotateCw} from 'lucide-react'
import type {ThemeSnapshot} from '../playground-themes'

import {
  createPreviewConnector,
  previewSrc,
  type PreviewChildMessage,
  type PreviewGeneration,
  type PreviewParentMessage,
} from './protocol'

type Props = {
  templateId: string
  mode: 'light' | 'dark'
  theme?: ThemeSnapshot
}

type PreviewState = 'connecting' | 'building' | 'ready' | 'error'

export function SandboxTemplatePreview({templateId, mode, theme}: Props) {
  const [generation, setGeneration] = useState<PreviewGeneration | null>(null)
  const [state, setState] = useState<PreviewState>('connecting')
  const [error, setError] = useState<string | null>(null)
  const connectorRef = useRef<ReturnType<typeof createPreviewConnector> | null>(null)
  const desiredRef = useRef({templateId, mode, theme})
  const readyRef = useRef(false)
  const generationRef = useRef(0)
  const timeoutRef = useRef<number | null>(null)
  const buildTimeoutRef = useRef<number | null>(null)
  const restartRef = useRef<() => void>(() => {})
  const templateRef = useRef(templateId)

  const postDesired = useCallback(() => {
    connectorRef.current?.post({
      type: 'mybot-preview-template',
      templateId: desiredRef.current.templateId,
      mode: desiredRef.current.mode,
      theme: desiredRef.current.theme,
    })
  }, [])

  useEffect(() => {
    desiredRef.current = {templateId, mode, theme}
    if (readyRef.current) {
      if (templateRef.current !== templateId) {
        setState('building')
        postDesired()
      } else {
        connectorRef.current?.post({type: 'mybot-preview-theme', mode, theme})
      }
    }
    templateRef.current = templateId
  }, [mode, templateId, theme, postDesired])

  useEffect(() => {
    const issue = () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
      }
      if (buildTimeoutRef.current != null) window.clearTimeout(buildTimeoutRef.current)
      readyRef.current = false
      setState('connecting')
      setError(null)
      generationRef.current += 1
      const nonce = connectorRef.current?.issue()
      if (nonce) {
        setGeneration({key: generationRef.current, src: previewSrc(nonce)})
        timeoutRef.current = window.setTimeout(() => {
          if (!readyRef.current) {
            setState('error')
            setError('Preview runner did not become ready.')
          }
        }, 8000)
      }
    }
    const connector = createPreviewConnector({
      onAttested: () => {
        readyRef.current = false
      },
      onReplaced: issue,
      onMessage: (event: MessageEvent<PreviewChildMessage>) => {
        const message = event.data
        if (!message || typeof message !== 'object') return
        if ('templateId' in message && message.templateId != null && message.templateId !== desiredRef.current.templateId) return
        if (message.type === 'mybot-preview-ready') {
          readyRef.current = true
          if (timeoutRef.current != null) {
            window.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
          }
          setState('building')
          postDesired()
        } else if (message.type === 'mybot-preview-building') {
          setState('building')
          setError(null)
          if (buildTimeoutRef.current != null) window.clearTimeout(buildTimeoutRef.current)
          buildTimeoutRef.current = window.setTimeout(() => {
            setState('error')
            setError('The template did not finish rendering. Retry the preview.')
          }, 15000)
        } else if (message.type === 'mybot-preview-rendered') {
          if (buildTimeoutRef.current != null) window.clearTimeout(buildTimeoutRef.current)
          setState('ready')
          setError(null)
        } else if (message.type === 'mybot-preview-error') {
          if (buildTimeoutRef.current != null) window.clearTimeout(buildTimeoutRef.current)
          setState('error')
          setError(message.error)
        }
      },
    })
    connectorRef.current = connector
    restartRef.current = issue
    const onWindowMessage = (event: MessageEvent) => connector.handleWindowMessage(event)
    window.addEventListener('message', onWindowMessage)
    issue()

    return () => {
      window.removeEventListener('message', onWindowMessage)
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current)
      }
      if (buildTimeoutRef.current != null) window.clearTimeout(buildTimeoutRef.current)
      connector.stop()
      connectorRef.current = null
    }
  }, [postDesired])

  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    if (element?.contentWindow) connectorRef.current?.attachFrame(element.contentWindow)
  }, [])

  const preview = (
    <div className="pg-sandbox-preview">
      {generation && (
      <iframe
        key={generation.key}
        ref={attachFrame}
        title="Isolated local template preview"
        sandbox="allow-scripts"
        src={generation.src}
        onLoad={() => connectorRef.current?.handleFrameLoad()}
      />
      )}
      {state !== 'ready' ? (
        <div className={`pg-sandbox-status is-${state}`} role={state === 'error' ? 'alert' : 'status'}>
          {state === 'error' ? `Preview error: ${error ?? 'Unknown error'}` : state === 'building' ? 'Building local template…' : 'Connecting preview…'}
          {state === 'error' ? (
            <button type="button" onClick={() => restartRef.current()}>
              <RotateCw size={14} aria-hidden="true" /> Retry preview
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="pg-sandbox-shell">
      {preview}
    </div>
  )
}
