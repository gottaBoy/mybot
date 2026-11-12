import {describe, expect, it} from 'vitest'
import {isPreviewParentMessage, isThemeSnapshot} from '../src/playground-preview/protocol'
import {isThemeId} from '../src/playground-themes'

const theme = {
  preset: 'neutral',
  tokens: {'--color-accent': 'light-dark(#C92B4B, #FFE0E3)'},
  components: {button: {base: {borderRadius: '13px', ':hover': {opacity: '0.9'}}}},
}

describe('preview theme boundary', () => {
  it('accepts the complete serializable token/override contract', () => {
    expect(isThemeSnapshot(theme)).toBe(true)
    expect(isPreviewParentMessage({type: 'mybot-preview-theme', mode: 'light', theme})).toBe(true)
  })
  it.each(['constructor', '__proto__', 'toString', 'unknown'])('rejects inherited or unknown presets: %s', preset => {
    expect(isThemeId(preset)).toBe(false)
    expect(isThemeSnapshot({...theme, preset})).toBe(false)
  })
  it.each([null, [], new Date(), {'--color-accent': {}}, {'--color-accent': 42}])('requires flat string-valued token maps', tokens => {
    expect(isThemeSnapshot({...theme, tokens})).toBe(false)
  })
  it.each(['url(https://example.test/x)', '@import "https://example.test/x"', 'a'.repeat(4097)])('rejects network-capable or excessive theme values', value => {
    expect(isThemeSnapshot({...theme, tokens: {'--color-accent': value}})).toBe(false)
  })
  it('rejects nested prototype keys before they reach defineTheme', () => {
    expect(isThemeSnapshot({...theme, components: JSON.parse('{"__proto__":{"base":{"color":"red"}}}')})).toBe(false)
  })
  it('does not accept invalid modes, unexpected messages, or empty payloads', () => {
    for (const message of [null, {}, {type: 'execute-code', source: 'alert(1)'}, {type: 'mybot-preview-theme', mode: 'automatic', theme}]) {
      expect(isPreviewParentMessage(message)).toBe(false)
    }
  })
  it('permits only the template/rebuild/theme/clear message variants', () => {
    expect(isPreviewParentMessage({type: 'mybot-preview-clear'})).toBe(true)
    expect(isPreviewParentMessage({type: 'mybot-preview-rebuild', templateId: 'welcome', mode: 'dark'})).toBe(true)
    expect(isPreviewParentMessage({type: 'mybot-preview-template', mode: 'dark'})).toBe(false)
  })
})
