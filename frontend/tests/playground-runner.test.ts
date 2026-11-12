import {describe, expect, it} from 'vitest'
import {readdirSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {runCode} from '../src/playground-preview/runner'
import {annotateSource} from '../src/playground-property/sourcePatch'

describe('isolated TSX runner', () => {
  it('compiles the edited TSX rather than selecting a template module', () => {
    const result = runCode('export default function Demo() { return <p>Edited locally</p> }')
    expect(result.error).toBeUndefined()
    expect(result.Component).toBeTypeOf('function')
  })

  it('resolves the public Astryx component subpaths', () => {
    const result = runCode(`
      import {Button} from '@astryxdesign/core/Button';
      export default function Demo() { return <Button label="Save" /> }
    `)
    expect(result.error).toBeUndefined()
  })

  it('supports React hooks without requiring a React namespace import', () => {
    const result = runCode(`
      import {useState} from 'react';
      export default function Demo() { const [count] = useState(0); return <p>{count}</p> }
    `)
    expect(result.error).toBeUndefined()
  })

  it('rejects modules outside the bundled allowlist', () => {
    const result = runCode(`import fs from 'node:fs'; export default function Demo() { return null }`)
    expect(result.phase).toBe('compile')
    expect(result.error).toContain('not allowed')
  })

  it('reports syntactically invalid TSX as a compile error', () => {
    const result = runCode('export default function Demo( { return <p>broken')
    expect(result.phase).toBe('compile')
    expect(result.error).toBeTypeOf('string')
  })

  it('reports missing default exports as a runtime error', () => {
    const result = runCode('export const title = "Example"')
    expect(result.phase).toBe('runtime')
    expect(result.error).toContain('No default export')
  })

  it('does not expose storage, parent window, or network globals', () => {
    const result = runCode(`
      if (typeof fetch !== 'undefined' || typeof parent !== 'undefined' ||
          typeof localStorage !== 'undefined' || typeof WebSocket !== 'undefined') {
        throw new Error('forbidden global');
      }
      export default function Demo() { return <p>Isolated</p> }
    `)
    expect(result.error).toBeUndefined()
  })

  it('compiles every generated Astryx page source in the same path as edits', () => {
    const directory = resolve(process.cwd(), 'src/templates/generated')
    const failures: string[] = []
    for (const file of readdirSync(directory).filter(value => value.endsWith('.tsx'))) {
      const result = runCode(annotateSource(readFileSync(resolve(directory, file), 'utf8')))
      if (result.error) failures.push(`${file}: ${result.phase}: ${result.error}`)
    }
    expect(failures, failures.join('\n')).toEqual([])
  })

  it('renders every generated page component through React after compilation', () => {
    const directory = resolve(process.cwd(), 'src/templates/generated')
    const failures: string[] = []
    for (const file of readdirSync(directory).filter(value => value.endsWith('.tsx'))) {
      const result = runCode(annotateSource(readFileSync(resolve(directory, file), 'utf8')))
      if (!result.Component) {
        failures.push(`${file}: ${result.phase}: ${result.error}`)
        continue
      }
      try {
        renderToStaticMarkup(React.createElement(result.Component))
      } catch (error) {
        failures.push(`${file}: render: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    expect(failures, failures.join('\n')).toEqual([])
  })
})
