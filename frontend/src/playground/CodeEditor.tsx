import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {WandSparkles} from 'lucide-react'
import {Button} from '@astryxdesign/core/Button'
import type * as Monaco from 'monaco-editor'

const MonacoEditor = lazy(async () => {
  const module = await import('@monaco-editor/react')
  if (typeof window !== 'undefined') {
    module.loader.config({paths: {vs: '/monaco/vs'}})
  }
  return {default: module.default}
})

type EditorInstance = Monaco.editor.IStandaloneCodeEditor
type MonacoInstance = typeof Monaco & {
  languages: typeof Monaco.languages & {
    typescript: {
      typescriptDefaults: {
        setCompilerOptions: (options: Record<string, unknown>) => void
        setDiagnosticsOptions: (options: Record<string, unknown>) => void
        addExtraLib: (content: string, filePath: string) => Monaco.IDisposable
        setEagerModelSync: (enabled: boolean) => void
      }
      ScriptTarget: Record<string, number>
      ModuleKind: Record<string, number>
      JsxEmit: Record<string, number>
      ModuleResolutionKind: Record<string, number>
    }
  }
  editor: typeof Monaco.editor & {
    defineTheme: (name: string, data: Record<string, unknown>) => void
  }
}

type CodeEditorProps = {
  value: string
  onChange: (value: string) => void
}

type FormatModule = {
  format: (source: string, options: Record<string, unknown>) => Promise<string>
}

let prettierPromise: Promise<{
  format: FormatModule['format']
  plugins: unknown[]
}> | null = null

function loadPrettier() {
  if (!prettierPromise) {
    prettierPromise = Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/typescript'),
      import('prettier/plugins/estree'),
    ])
      .then(([standalone, typescript, estree]) => ({
        format: standalone.format,
        plugins: [typescript, estree],
      }))
      .catch(error => {
        prettierPromise = null
        throw error
      })
  }
  return prettierPromise
}

async function formatSource(source: string) {
  const {format, plugins} = await loadPrettier()
  return format(source, {
    parser: 'typescript',
    plugins,
    arrowParens: 'avoid',
    bracketSameLine: true,
    bracketSpacing: false,
    trailingComma: 'all',
    singleQuote: true,
  })
}

function isSyntaxError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('loc' in error)) {
    return false
  }
  const loc = (error as {loc?: unknown}).loc
  return typeof loc === 'object' && loc !== null && 'start' in loc
}

type PlaygroundTypeBundle = {
  schemaVersion: 1
  files: Record<string, string>
}

let typeBundle: Promise<PlaygroundTypeBundle> | null = null

function loadTypeBundle() {
  if (!typeBundle) {
    typeBundle = fetch('/playground-types.json')
      .then(async response => {
        if (!response.ok) throw new Error('Editor types could not load')
        const bundle = await response.json() as PlaygroundTypeBundle
        if (bundle.schemaVersion !== 1 || !bundle.files || typeof bundle.files !== 'object') {
          throw new Error('Editor types have an unsupported format')
        }
        return bundle
      })
      .catch(error => {
        typeBundle = null
        throw error
      })
  }
  return typeBundle
}

async function configureTypeLibraries(monaco: MonacoInstance) {
  const typescript = monaco.languages.typescript.typescriptDefaults
  const registry = typescript as typeof typescript & {
    __mybotTypes?: Promise<void>
  }
  if (!registry.__mybotTypes) {
    registry.__mybotTypes = loadTypeBundle()
      .then(bundle => {
        for (const [path, content] of Object.entries(bundle.files)) {
          if (path.startsWith('/') && typeof content === 'string') {
            typescript.addExtraLib(content, `file://${path}`)
          }
        }
        typescript.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
        })
      })
      .catch(error => {
        delete registry.__mybotTypes
        throw error
      })
  }
  return registry.__mybotTypes
}

function configureMonaco(monaco: MonacoInstance) {
  const typescript = monaco.languages.typescript
  typescript.typescriptDefaults.setCompilerOptions({
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    jsx: typescript.JsxEmit.ReactJSX,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    allowJs: true,
    strict: false,
    skipLibCheck: true,
    allowNonTsExtensions: true,
  })
  typescript.typescriptDefaults.setEagerModelSync(true)
  // Start with syntax diagnostics while the installed-package types download.
  // Semantic diagnostics are enabled as soon as the real declarations arrive.
  typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  })

  monaco.editor.defineTheme('mybot-github-light', {
    base: 'vs',
    inherit: true,
    rules: [
      {token: 'comment', foreground: '6a737d'},
      {token: 'keyword', foreground: 'd73a49'},
      {token: 'string', foreground: '032f62'},
      {token: 'number', foreground: '005cc5'},
      {token: 'type', foreground: '6f42c1'},
      {token: 'tag', foreground: '22863a'},
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#24292e',
      'editorLineNumber.foreground': '#9da5ab',
      'editorLineNumber.activeForeground': '#586069',
      'editorCursor.foreground': '#166fe5',
      'editor.selectionBackground': '#b3d4fc66',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editorGutter.background': '#ffffff',
    },
  })
  monaco.editor.defineTheme('mybot-github-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      {token: 'comment', foreground: '959da5'},
      {token: 'keyword', foreground: 'ea4a5a'},
      {token: 'string', foreground: '79b8ff'},
      {token: 'number', foreground: 'c8e1ff'},
      {token: 'type', foreground: 'b392f0'},
      {token: 'tag', foreground: '7bcc72'},
    ],
    colors: {
      'editor.background': '#1d1d20',
      'editor.foreground': '#f6f8fa',
      'editorLineNumber.foreground': '#6a737d',
      'editorLineNumber.activeForeground': '#c8e1ff',
      'editorCursor.foreground': '#84b4ff',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#24292f',
      'editorGutter.background': '#1d1d20',
    },
  })
}

function registerFormatter(monaco: MonacoInstance, onFailure: () => void) {
  const registry = monaco.languages as typeof monaco.languages & {
    __mybotFormatter?: Monaco.IDisposable
  }
  if (registry.__mybotFormatter) {
    return
  }
  registry.__mybotFormatter = monaco.languages.registerDocumentFormattingEditProvider(
    'typescript',
    {
      displayName: 'Prettier',
      async provideDocumentFormattingEdits(model) {
        const original = model.getValue()
        try {
          const formatted = await formatSource(original)
          return formatted === original
            ? []
            : [{range: model.getFullModelRange(), text: formatted}]
        } catch (error) {
          // A half-written buffer is expected while typing. Monaco already
          // renders syntax markers, so only report actual formatter failures.
          if (!isSyntaxError(error)) {
            onFailure()
          }
          return []
        }
      },
    },
  )
}

const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  minimap: {enabled: false},
  fontSize: 12,
  lineHeight: 18,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  tabSize: 2,
  insertSpaces: true,
  wordWrap: 'off',
  padding: {top: 12, bottom: 20},
  lineNumbers: 'on',
  folding: true,
  renderLineHighlight: 'line',
  scrollBeyondLastLine: false,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
    useShadows: false,
  },
  suggest: {showMethods: true, showFunctions: true},
}

const fallbackStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: '100%',
  height: '100%',
  minHeight: 0,
  color: 'var(--pg-text-secondary)',
  fontSize: 12,
}

export function CodeEditor({value, onChange}: CodeEditorProps) {
  const editorRef = useRef<EditorInstance | null>(null)
  const [theme, setTheme] = useState<'mybot-github-light' | 'mybot-github-dark'>(
    'mybot-github-light',
  )
  const [errors, setErrors] = useState(0)
  const [formatting, setFormatting] = useState(false)
  const [formatError, setFormatError] = useState(false)
  const [typesError, setTypesError] = useState(false)
  const [formatShortcut] = useState(() =>
    /Macintosh|iPad|iPhone|Windows/.test(navigator.userAgent)
      ? 'Shift+Alt+F'
      : 'Ctrl+Shift+I',
  )

  // TemplatesPage owns the mode on the outer root. Observe that root instead
  // of adding another prop so this remains a drop-in controlled component.
  useEffect(() => {
    const root = document.querySelector('.pg-root')
    if (!root) return
    const sync = () => {
      setTheme(root.classList.contains('pg-dark') ? 'mybot-github-dark' : 'mybot-github-light')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, {attributes: true, attributeFilter: ['class']})
    return () => observer.disconnect()
  }, [])

  const handleBeforeMount = useCallback((monaco: MonacoInstance) => {
    configureMonaco(monaco)
  }, [])

  const handleMount = useCallback((editor: EditorInstance, monaco: MonacoInstance) => {
    editorRef.current = editor
    registerFormatter(monaco, () => setFormatError(true))
    void configureTypeLibraries(monaco).catch(() => setTypesError(true))
    editor.focus()
  }, [])

  const handleValidate = useCallback((markers: Monaco.editor.IMarker[]) => {
    setErrors(markers.filter(marker => marker.severity === 8).length)
  }, [])

  const handleFormat = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || formatting) return
    setFormatting(true)
    setFormatError(false)
    try {
      await editor.getAction('editor.action.formatDocument')?.run()
    } finally {
      setFormatting(false)
    }
  }, [formatting])

  return (
    <div className="pg-source-editor">
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 10,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
        {errors > 0 && (
          <span
            role="status"
            style={{color: 'var(--color-text-danger, #b42318)', fontSize: 11}}>
            {errors} {errors === 1 ? 'error' : 'errors'}
          </span>
        )}
        {typesError && (
          <span role="alert" style={{color: 'var(--color-text-danger, #b42318)', fontSize: 11}}>
            Editor types unavailable
          </span>
        )}
        {formatError && (
          <span role="alert" style={{color: 'var(--color-text-danger, #b42318)', fontSize: 11}}>
            Formatter unavailable
          </span>
        )}
        <Button
          label="Format code"
          tooltip={`Format code (${formatShortcut})`}
          variant="ghost"
          size="sm"
          icon={<WandSparkles size={14} />}
          isIconOnly
          isLoading={formatting}
          onClick={() => void handleFormat()}
        />
      </div>
      <Suspense fallback={<div style={fallbackStyle}>Loading code editor…</div>}>
        <MonacoEditor
          language="typescript"
          path="file:///mybot-playground.tsx"
          value={value}
          theme={theme}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          onChange={next => onChange(next ?? '')}
          onValidate={handleValidate}
          options={editorOptions}
          width="100%"
          height="100%"
          loading={<div style={fallbackStyle}>Loading code editor…</div>}
        />
      </Suspense>
    </div>
  )
}
