import {useRef, type UIEvent} from 'react'
import {CodeBlock} from '@astryxdesign/core/CodeBlock'

export function CodeEditor({value, onChange}: {value: string; onChange: (value: string) => void}) {
  const highlightRef = useRef<HTMLDivElement>(null)
  const syncScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = event.currentTarget.scrollTop
      highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
    }
  }
  return (
    <div className="pg-source-editor">
      <div ref={highlightRef} className="pg-source-highlight" aria-hidden="true">
        <CodeBlock code={value} language="typescript" container="section" hasLineNumbers hasCopyButton={false} isWrapped={false} size="sm" width="100%" />
      </div>
      <textarea className="pg-source-input" aria-label="Playground source code" spellCheck={false}
        value={value} onChange={event => onChange(event.target.value)} onScroll={syncScroll} />
    </div>
  )
}
