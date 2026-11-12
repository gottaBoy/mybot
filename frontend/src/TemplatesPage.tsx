import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react'
import {ChevronDown, Code2, Copy, Expand, ExternalLink, Monitor, Moon, Palette, Smartphone, Sparkles, Sun} from 'lucide-react'
import {Button} from '@astryxdesign/core/Button'
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog'
import {HStack, Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout'
import {ResizeHandle, useResizable} from '@astryxdesign/core/Resizable'
import {Theme, tokenDefaults, type DefinedTheme} from '@astryxdesign/core/theme'
import {neutralTheme} from '@astryxdesign/theme-neutral/built'
import {ThemeEditor} from './theme-editor/ThemeEditor'
import {generateThemeCode} from './theme-editor/helpers'
import {initialPreviewTheme, loadTheme, themeOptions, type ThemeId, type ThemeSnapshot} from './playground-themes'
import {SandboxTemplatePreview} from './playground-preview/SandboxTemplatePreview'
import {templateLoaders, type TemplateId} from './templates/template-loaders'
import manifest from './templates/generated/manifest.json'
import {readPlaygroundCodeFromHash, readTemplateFromHash, updatePlaygroundCodeInUrl} from './playground-code'
import {DEFAULT_CODE} from './playground/defaultCode'
import {CodeEditor} from './playground/CodeEditor'

type Mode = 'light' | 'dark'
type Template = TemplateId | 'welcome'
type View = 'code' | 'theme'

const sourceLoaders = import.meta.glob<string>('./templates/generated/*.tsx', {query: '?raw', import: 'default'})

function download(source: string, filename: string) {
  const url = URL.createObjectURL(new Blob([source], {type: 'text/typescript;charset=utf-8'}))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function templateInUrl(): Template {
  const id = readTemplateFromHash()
  return id && Object.hasOwn(templateLoaders, id) ? id as TemplateId : 'welcome'
}

export function TemplatesPage({onBack, mode = 'light', onModeChange}: {
  onBack: () => void
  mode?: Mode
  onModeChange?: (mode: Mode) => void
}) {
  const [previewMode, setPreviewMode] = useState<Mode>(mode)
  const [view, setView] = useState<View>('code')
  const [mobileTab, setMobileTab] = useState<'preview' | View>('code')
  const [viewport, setViewport] = useState<'desktop' | 'phone'>('desktop')
  const [selectedId, setSelectedId] = useState<Template>(templateInUrl)
  const [code, setCode] = useState(DEFAULT_CODE)
  const [committedCode, setCommittedCode] = useState(DEFAULT_CODE)
  const [hydrated, setHydrated] = useState(false)
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [presetId, setPresetId] = useState<ThemeId>('neutral')
  const [preset, setPreset] = useState<DefinedTheme>(initialPreviewTheme)
  const [themeVersion, setThemeVersion] = useState(0)
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>()
  const [themeDirty, setThemeDirty] = useState(false)
  const [themeName, setThemeName] = useState('mybot')
  const [pendingTheme, setPendingTheme] = useState<ThemeId>()
  const [pendingTemplate, setPendingTemplate] = useState<Template>()
  const [status, setStatus] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resizing, setResizing] = useState(false)
  const baseline = useRef<string | undefined>(undefined)
  const themeRequest = useRef(0)
  const sourceRequest = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const editorPanel = useResizable({defaultSize: 440, minSize: 340, maxSize: 760})

  const templateItems = useMemo(() => manifest.slice().sort((a, b) => {
    if (a.id === 'theme-showcase') return -1
    if (b.id === 'theme-showcase') return 1
    return `${a.category} ${a.name}`.localeCompare(`${b.category} ${b.name}`)
  }), [])

  const onThemeChange = useCallback((theme: DefinedTheme) => {
    const signature = JSON.stringify([theme.tokens, theme.components])
    baseline.current ??= signature
    setThemeDirty(signature !== baseline.current)
    setSnapshot({preset: presetId, tokens: theme.tokens, components: theme.components})
  }, [presetId])

  const changePreset = async (id: ThemeId) => {
    const request = ++themeRequest.current
    try {
      const next = await loadTheme(id)
      if (request !== themeRequest.current) return
      baseline.current = undefined
      setThemeDirty(false)
      setSnapshot(undefined)
      setPresetId(id)
      setPreset(next)
      setThemeVersion(value => value + 1)
      setStatus('')
    } catch {
      setStatus('Could not load the selected theme. Your edits have been retained.')
    }
  }

  const selectTheme = (id: ThemeId) => {
    setThemeMenuOpen(false)
    if (id === presetId) return
    if (themeDirty) setPendingTheme(id)
    else void changePreset(id)
  }

  const changeTemplate = async (id: Template) => {
    const request = ++sourceRequest.current
    try {
      const source = id === 'welcome' ? DEFAULT_CODE : await sourceLoaders[`./templates/generated/${id}.tsx`]()
      if (request !== sourceRequest.current) return
      setCode(source)
      setCommittedCode(source)
      setSelectedId(id)
    } catch {
      setStatus('Could not load template source. Try selecting it again.')
    }
  }

  const selectTemplate = (id: Template) => {
    setTemplateMenuOpen(false)
    if (id === selectedId) return
    if (code !== committedCode) setPendingTemplate(id)
    else void changeTemplate(id)
  }

  useEffect(() => {
    let active = true
    const hydrate = async () => {
      try {
        const initial = templateInUrl()
        const sharedCode = await readPlaygroundCodeFromHash()
        const source = sharedCode ?? (initial === 'welcome'
          ? DEFAULT_CODE
          : await sourceLoaders[`./templates/generated/${initial}.tsx`]())
        if (!active) return
        setCode(source)
        setCommittedCode(source)
        setSelectedId(initial)
      } catch {
        if (active) setStatus('Could not restore the shared source.')
      } finally {
        if (active) setHydrated(true)
      }
    }
    void hydrate()
    window.addEventListener('hashchange', hydrate)
    return () => { active = false; window.removeEventListener('hashchange', hydrate) }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const timer = setTimeout(() => {
      void updatePlaygroundCodeInUrl(code, selectedId === 'welcome' ? null : selectedId)
    }, 400)
    return () => clearTimeout(timer)
  }, [code, selectedId, hydrated])

  useEffect(() => {
    if (!templateMenuOpen && !themeMenuOpen) return
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.pg-dropdown, .pg-top-menu')) {
        setTemplateMenuOpen(false)
        setThemeMenuOpen(false)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setTemplateMenuOpen(false); setThemeMenuOpen(false) }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [templateMenuOpen, themeMenuOpen])

  useEffect(() => {
    if (!resizing) return
    const stop = () => setResizing(false)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => { window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
  }, [resizing])

  useEffect(() => {
    const change = () => setIsFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', change)
    return () => document.removeEventListener('fullscreenchange', change)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await rootRef.current?.requestFullscreen()
    } catch { setStatus('Fullscreen is not available in this browser.') }
  }

  const exportCurrent = () => {
    if (view === 'theme') {
      const current = snapshot ?? {tokens: preset.tokens, components: preset.components}
      download(generateThemeCode(themeName, current.tokens, tokenDefaults, 14, 1.2, [], current.components),
        `${themeName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'mybot'}-theme.ts`)
    } else download(code, `${selectedId}.tsx`)
  }

  const share = async () => {
    try {
      await updatePlaygroundCodeInUrl(code, selectedId === 'welcome' ? null : selectedId)
      await navigator.clipboard.writeText(window.location.href)
      setStatus('Source link copied. Custom themes are shared using Export.')
    } catch { setStatus('Could not copy the source link. You can copy it from the address bar.') }
  }

  const toggleMode = () => {
    const next = previewMode === 'light' ? 'dark' : 'light'
    setPreviewMode(next)
    onModeChange?.(next)
  }

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div ref={rootRef} className={`pg-root ${mode === 'dark' ? 'pg-dark' : ''} ${resizing ? 'pg-resizing' : ''}`}
        style={{'--pg-editor-width': `${editorPanel.size}px`} as CSSProperties}>
        <header className="pg-mobile-nav">
          <button className="pg-brand" aria-label="Back to Workbench" onClick={onBack}><Sparkles size={20} /></button>
          <div className="pg-mobile-tabs" role="group" aria-label="Playground mobile views">
            {(['preview', 'code', 'theme'] as const).map(tab => <button key={tab} aria-label={tab === 'preview' ? 'Preview' : tab === 'code' ? 'Code' : 'Theme'} aria-pressed={mobileTab === tab}
              className={mobileTab === tab ? 'is-active' : ''} onClick={() => { setMobileTab(tab); if (tab !== 'preview') setView(tab) }}>
              {tab === 'preview' ? <Monitor size={16} /> : tab === 'code' ? <Code2 size={16} /> : <Palette size={16} />}
            </button>)}
          </div>
          <Button label="Export" size="sm" variant="primary" onClick={exportCurrent} />
        </header>
        <aside className="pg-rail" aria-label="Playground views">
          <button className="pg-brand" aria-label="Back to Workbench" title="Back to Workbench" onClick={onBack}><Sparkles size={20} /></button>
          <button className={`pg-rail-action ${view === 'code' ? 'is-active' : ''}`} aria-label="Code Editor" title="Code Editor" aria-pressed={view === 'code'} onClick={() => setView('code')}><Code2 size={18} /></button>
          <button className={`pg-rail-action ${view === 'theme' ? 'is-active' : ''}`} aria-label="Theme Editor" title="Theme Editor" aria-pressed={view === 'theme'} onClick={() => setView('theme')}><Palette size={18} /></button>
        </aside>
        <section className={`pg-left-panel ${mobileTab === 'preview' ? 'pg-mobile-hidden' : ''}`} aria-label="Playground editor">
          <header className="pg-left-header">
            <strong className="pg-playground-title">Playground</strong>
            <div className="pg-editor-menus">
              <button className="pg-top-menu" aria-expanded={themeMenuOpen} aria-controls="theme-menu" onClick={() => {setThemeMenuOpen(!themeMenuOpen); setTemplateMenuOpen(false)}}>Themes <ChevronDown size={14} /></button>
              <button className="pg-top-menu" aria-expanded={templateMenuOpen} aria-controls="template-menu" onClick={() => {setTemplateMenuOpen(!templateMenuOpen); setThemeMenuOpen(false)}}>Templates <ChevronDown size={14} /></button>
            </div>
          </header>
          {themeMenuOpen && <div id="theme-menu" className="pg-dropdown pg-theme-dropdown" aria-label="Theme presets">
            {themeOptions.map(option => <button key={option.value} aria-pressed={presetId === option.value} onClick={() => selectTheme(option.value)}>{option.label}</button>)}
          </div>}
          {templateMenuOpen && <div id="template-menu" className="pg-dropdown pg-template-dropdown" aria-label="Page templates">
            <button onClick={() => selectTemplate('welcome')}>Welcome starter</button>
            {templateItems.map(item => <button key={item.id} onClick={() => selectTemplate(item.id as TemplateId)}>{item.category.split(' - ')[0]} · {item.name}</button>)}
          </div>}
          <div className="pg-left-content">
            <div className={`pg-editor-pane ${view !== 'code' ? 'pg-pane-hidden' : ''}`}><CodeEditor value={code} onChange={setCode} /></div>
            <div className={`pg-theme-pane ${view !== 'theme' ? 'pg-pane-hidden' : ''}`}>
              <ThemeEditor key={`${presetId}:${themeVersion}`} mode={previewMode} initialTheme={preset} onThemeChange={onThemeChange} />
            </div>
          </div>
          {view === 'theme' && <footer className="pg-theme-footer">
            <label htmlFor="theme-name">Theme name</label>
            <input id="theme-name" value={themeName} maxLength={80} onChange={event => setThemeName(event.target.value)} />
            <Button label="Reset theme" variant="ghost" size="sm" onClick={() => {if (themeDirty) setPendingTheme(presetId)}} isDisabled={!themeDirty} />
          </footer>}
        </section>
        <div className="pg-splitter" onPointerDownCapture={() => setResizing(true)}>
          <ResizeHandle label="Resize editor panel" hasDivider resizable={editorPanel.props} />
        </div>
        <section className={`pg-right-panel ${mobileTab !== 'preview' ? 'pg-mobile-hidden' : ''}`} aria-label="Playground preview">
          <header className="pg-preview-toolbar">
            <button className="pg-icon-button" aria-label="Copy source link" title="Copy source link" onClick={share}><Copy size={17} /></button>
            <div className="pg-preview-controls">
              <button className="pg-icon-button" aria-label="Toggle theme" title={previewMode === 'light' ? 'Dark preview' : 'Light preview'} onClick={toggleMode}>{previewMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
              <div className="pg-viewport-switch" role="group" aria-label="Viewport size">
                <button className={viewport === 'desktop' ? 'is-active' : ''} aria-label="Desktop" aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}><Monitor size={17} /></button>
                <button className={viewport === 'phone' ? 'is-active' : ''} aria-label="Phone" aria-pressed={viewport === 'phone'} onClick={() => setViewport('phone')}><Smartphone size={17} /></button>
              </div>
              <button className="pg-icon-button" aria-label={isFullscreen ? 'Exit fullscreen preview' : 'Fullscreen preview'} title="Fullscreen preview" onClick={toggleFullscreen}><Expand size={17} /></button>
              <Button label="Export" variant="primary" size="md" onClick={exportCurrent} endContent={<ExternalLink size={14} />} />
            </div>
          </header>
          {status && <p className="pg-status" role="status">{status}</p>}
          <div className={`pg-preview-area ${viewport === 'phone' ? 'is-phone' : ''}`}>
            <div className="pg-preview-card"><SandboxTemplatePreview templateId={selectedId} mode={previewMode} theme={snapshot} /></div>
          </div>
        </section>
        <Dialog isOpen={pendingTheme != null || pendingTemplate != null} purpose="info" onOpenChange={open => {if (!open) {setPendingTheme(undefined); setPendingTemplate(undefined)}}}>
          <Layout header={<DialogHeader title={pendingTheme ? 'Replace theme?' : 'Load template?'} />}
            content={<LayoutContent>Your unsaved edits will be lost. Discard them and continue?</LayoutContent>}
            footer={<LayoutFooter hasDivider><HStack gap={2} hAlign="end">
              <Button label="Cancel" onClick={() => {setPendingTheme(undefined); setPendingTemplate(undefined)}} />
              <Button label="Discard and switch" variant="primary" onClick={() => {
                if (pendingTheme) void changePreset(pendingTheme)
                if (pendingTemplate) void changeTemplate(pendingTemplate)
                setPendingTheme(undefined); setPendingTemplate(undefined)
              }} />
            </HStack></LayoutFooter>} />
        </Dialog>
      </div>
    </Theme>
  )
}
