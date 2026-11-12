import {describe, expect, it} from 'vitest'
import {generatePlaygroundTypes, monacoAssetPath} from '../scripts/monaco-assets'

describe('self-hosted Monaco assets', () => {
  it('allows only files under the Monaco vs root', () => {
    expect(monacoAssetPath('/tmp/monaco/vs', '/monaco/vs/loader.js')).toBe(
      '/tmp/monaco/vs/loader.js',
    )
    expect(monacoAssetPath('/tmp/monaco/vs', '/monaco/vs/../package.json')).toBeNull()
    expect(monacoAssetPath('/tmp/monaco/vs', '/other/loader.js')).toBeNull()
  })

  it('generates the installed Astryx and React declaration bundle', async () => {
    const bundle = await generatePlaygroundTypes(process.cwd())
    expect(bundle.schemaVersion).toBe(1)
    expect(bundle.packages['@astryxdesign/core']).toBeTruthy()
    expect(bundle.packages['@types/react']).toBeTruthy()
    expect(bundle.files['/node_modules/@astryxdesign/core/index.d.ts']).toBeTruthy()
    expect(bundle.files['/node_modules/react/jsx-runtime.d.ts']).toContain(
      '@types/react/jsx-runtime',
    )
  })
})
