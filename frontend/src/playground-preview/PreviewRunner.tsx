import {Component as ReactComponent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {Button} from '@astryxdesign/core/Button'
import {Card} from '@astryxdesign/core/Card'
import {HStack, Layout, LayoutContent, LayoutFooter, LayoutHeader} from '@astryxdesign/core/Layout'
import {Heading, Text} from '@astryxdesign/core/Text'
import {defineTheme, Theme} from '@astryxdesign/core/theme'
import {neutralTheme} from '@astryxdesign/theme-neutral/built'
import {loadTheme, type ThemeSnapshot} from '../playground-themes'

import {templateLoaders, type TemplateId} from '../templates/template-loaders'
import {
  acceptPreviewConnect,
  announcePreview,
  readPreviewNonce,
  isPreviewParentMessage,
  type PreviewParentMessage,
} from './protocol'

type Mode = 'light' | 'dark'

function isKnownTemplate(id: string): id is TemplateId {
  return Object.hasOwn(templateLoaders, id)
}

class PreviewErrorBoundary extends ReactComponent<{
  children: ReactNode
  onError: (error: Error) => void
}, {error: Error | null}> {
  state = {error: null as Error | null}
  static getDerivedStateFromError(error: Error) { return {error} }
  componentDidCatch(error: Error) { this.props.onError(error) }
  render() { return this.state.error ? <p role="alert">Preview failed: {this.state.error.message}</p> : this.props.children }
}

function RenderCommitted({onCommit}: {onCommit: () => void}) {
  useEffect(onCommit, [onCommit])
  return null
}

function Welcome() {
  return (
    <Card width="min(400px, 100%)" padding={4}>
      <Layout
        header={<LayoutHeader hasDivider><Heading level={2}>Welcome</Heading></LayoutHeader>}
        content={
          <LayoutContent>
            <Text type="body" color="secondary">
              Try out components in the code editor, open a ready-made template, and build your own theme in the theme editor — all in one place.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack hAlign="end"><Button label="Get started" variant="primary" /></HStack>
          </LayoutFooter>
        }
      />
    </Card>
  )
}

/**
 * This component is mounted only inside `/?preview=1`. It is deliberately
 * allowlisted: incoming messages can select a generated local template, but
 * cannot provide source text or invoke an evaluator.
 */
export function PreviewRunner() {
  const [mode, setMode] = useState<Mode>('light')
  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>()
  const [preset, setPreset] = useState(neutralTheme)
  const [renderKey, setRenderKey] = useState(0)
  const portRef = useRef<MessagePort | null>(null)
  const renderedRef = useRef(false)
  const loadRunRef = useRef(0)
  const themeRunRef = useRef(0)

  const post = useCallback((message: Record<string, unknown>) => {
    portRef.current?.postMessage(message)
  }, [])

  const loadTemplate = useCallback(
    (nextId: string, nextMode: Mode) => {
      setMode(nextMode)
      setTemplateId(nextId)
      setComponent(null)
      renderedRef.current = false
      setRenderKey(value => value + 1)
      const run = ++loadRunRef.current
      post({type: 'mybot-preview-building', templateId: nextId})

      if (nextId === 'welcome') {
        if (run !== loadRunRef.current) return
        setComponent(() => Welcome)
        return
      }
      if (!isKnownTemplate(nextId)) {
        setComponent(null)
        post({
          type: 'mybot-preview-error',
          templateId: nextId,
          error: 'This preview is not an approved local template.',
          phase: 'protocol',
        })
        return
      }

      templateLoaders[nextId]()
        .then(module => {
          if (run !== loadRunRef.current) return
          setComponent(() => module.default)
        })
        .catch((error: unknown) => {
          if (run !== loadRunRef.current) return
          setComponent(null)
          post({
            type: 'mybot-preview-error',
            templateId: nextId,
            error: error instanceof Error ? error.message : String(error),
            phase: 'load',
          })
        })
    },
    [post],
  )

  const applyTheme = useCallback((next: ThemeSnapshot | undefined) => {
    const run = ++themeRunRef.current
    setSnapshot(next)
    if (next) {
      loadTheme(next.preset).then(value => {
        if (run === themeRunRef.current) setPreset(value)
      }).catch(() => {
        if (run === themeRunRef.current) post({type: 'mybot-preview-error', error: 'Could not load theme.', phase: 'load'})
      })
    }
  }, [post])

  const previewTheme = useMemo(() => snapshot ? defineTheme({
    name: 'mybot-preview',
    extends: preset,
    tokens: snapshot.tokens,
    components: snapshot.components,
  }) : preset, [snapshot, preset])

  const committed = useCallback(() => {
    renderedRef.current = true
    post({type: 'mybot-preview-rendered', templateId: templateId ?? 'welcome'})
  }, [templateId, post])
  const renderFailed = useCallback((error: Error) => {
    post({type: 'mybot-preview-error', templateId: templateId ?? undefined, error: error.message, phase: 'runtime'})
  }, [post, templateId])

  useEffect(() => {
    function onWindowMessage(event: MessageEvent) {
      const next = acceptPreviewConnect(event, window.parent)
      if (next == null) return
      portRef.current?.close()
      portRef.current = next
      next.onmessage = (portEvent: MessageEvent<PreviewParentMessage>) => {
        const message = portEvent.data
        if (!isPreviewParentMessage(message)) {
          post({type: 'mybot-preview-error', error: 'Invalid preview message or theme value.', phase: 'protocol'})
          return
        }
        if (message?.type === 'mybot-preview-theme') {
          setMode(message.mode)
          applyTheme(message.theme)
          return
        }
        if (message?.type === 'mybot-preview-clear') {
          loadRunRef.current += 1
          setComponent(null)
          setTemplateId(null)
          return
        }
        if (
          (message?.type === 'mybot-preview-template' || message?.type === 'mybot-preview-rebuild') &&
          typeof message.templateId === 'string'
        ) {
          loadTemplate(message.templateId, message.mode)
          applyTheme(message.theme)
        }
      }
      post({type: 'mybot-preview-ready'})
    }

    window.addEventListener('message', onWindowMessage)
    announcePreview(window.parent, readPreviewNonce(window.location.hash))
    return () => {
      window.removeEventListener('message', onWindowMessage)
      portRef.current?.close()
      portRef.current = null
    }
  }, [loadTemplate, post, applyTheme])

  useEffect(() => {
    document.documentElement.dataset.mybotPreview = 'true'
    return () => { delete document.documentElement.dataset.mybotPreview }
  }, [])

  return (
    <Theme theme={previewTheme} mode={mode}>
      <main className="preview-runner-root" data-template-id={templateId ?? undefined} data-theme-preset={snapshot?.preset ?? 'neutral'}>
        <PreviewErrorBoundary key={renderKey} onError={renderFailed}>
          {Component ? <><Component /><RenderCommitted onCommit={committed} /></> : <div className="preview-runner-loading">Loading local preview…</div>}
        </PreviewErrorBoundary>
      </main>
    </Theme>
  )
}
