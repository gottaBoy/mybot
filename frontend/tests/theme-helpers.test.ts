import {describe, expect, it} from 'vitest'
import ts from 'typescript'

import {
  buildComponentOverrides,
  buildSpacingScale,
  colorWithAlphaToString,
  generateThemeCode,
  getConcentricityWarning,
  mergeComponentStyleMaps,
  parseColorWithAlpha,
  parseLightDark,
  spacingToPx,
} from '../src/theme-editor/helpers'
import {readLiveNumberDraft} from '../src/theme-editor/useLiveNumberInput'

function evaluateThemeExport(source: string) {
  const parsed = ts.createSourceFile('theme.ts', source, ts.ScriptTarget.ES2022, true)
  const declaration = parsed.statements.find(ts.isVariableStatement)?.declarationList.declarations[0]
  const exportName = declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null
  expect(exportName, 'Theme export must have a valid JavaScript identifier').toBeTruthy()
  const result = ts.transpileModule(
    source.replace(/^import .+;\s*$/m, '').replace(/^export const /m, 'const '),
    {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  expect(
    (result.diagnostics ?? [])
      .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
      .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
  ).toEqual([])
  return new Function(
    'defineTheme',
    `${result.outputText}\nreturn ${exportName};`,
  )((value: unknown) => value) as {
    name: string
    tokens?: Record<string, string>
    typography?: {scale: {base: number; ratio: number}}
    components?: Record<string, unknown>
  }
}

describe('theme spacing and concentricity', () => {
  it.each([
    ['0px', 0],
    ['12px', 12],
    ['0.5rem', 8],
    [' 1.25rem ', 20],
    ['.25rem', 4],
  ])('converts %s to %s default-root pixels', (input, expected) => {
    expect(spacingToPx(input)).toBe(expected)
  })

  it.each([undefined, '', 'auto', '1em', 'var(--spacing-1)', '12'])(
    'rejects non-concrete spacing %s',
    value => {
      expect(spacingToPx(value)).toBeNaN()
    },
  )

  it('reproduces the 4px spacing ramp, including fractional steps', () => {
    expect(buildSpacingScale(4)).toEqual({
      '--spacing-0': '0rem',
      '--spacing-0-5': '0.125rem',
      '--spacing-1': '0.25rem',
      '--spacing-1-5': '0.375rem',
      '--spacing-2': '0.5rem',
      '--spacing-3': '0.75rem',
      '--spacing-4': '1rem',
      '--spacing-5': '1.25rem',
      '--spacing-6': '1.5rem',
      '--spacing-7': '1.75rem',
      '--spacing-8': '2rem',
      '--spacing-9': '2.25rem',
      '--spacing-10': '2.5rem',
      '--spacing-11': '2.75rem',
      '--spacing-12': '3rem',
    })
  })

  it('rounds pixel steps before converting to rem', () => {
    const ramp = buildSpacingScale(3)
    expect(ramp['--spacing-0-5']).toBe('0.125rem')
    expect(ramp['--spacing-1-5']).toBe('0.3125rem')
    expect(spacingToPx(ramp['--spacing-12'])).toBe(36)
  })

  it('has no concentricity warning for matching or invalid scales', () => {
    expect(getConcentricityWarning('radius', 4, 4)).toBeNull()
    expect(getConcentricityWarning('spacing', Number.NaN, 4)).toBeNull()
    expect(getConcentricityWarning('spacing', 4, Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('suggests changing the edited control to restore concentricity', () => {
    expect(getConcentricityWarning('radius', 4, 6)?.description).toContain('Set radius to 6px')
    expect(getConcentricityWarning('spacing', 4, 6)?.description).toContain('Set spacing to 4px')
  })
})

describe('theme colors', () => {
  it('splits light and dark branches without changing either value', () => {
    expect(parseLightDark('light-dark(#123456, #ABCDEF80)')).toEqual({
      light: '#123456',
      dark: '#ABCDEF80',
    })
    expect(parseLightDark('#123456')).toBeNull()
    expect(parseLightDark('var(--color-accent)')).toBeNull()
  })

  it.each([
    ['#abc', {hex: '#aabbcc', alpha: 1}],
    ['#123456', {hex: '#123456', alpha: 1}],
    ['#12345680', {hex: '#123456', alpha: 0.5}],
    ['#12345600', {hex: '#123456', alpha: 0}],
    ['rgb(17, 34, 51)', {hex: '#112233', alpha: 1}],
    ['rgba(17, 34, 51, 0.25)', {hex: '#112233', alpha: 0.25}],
  ])('parses %s with alpha', (input, expected) => {
    expect(parseColorWithAlpha(input)).toEqual(expected)
  })

  it.each(['transparent', 'var(--color-accent)', '#12', ''])('rejects nonliteral color %s', value => {
    expect(parseColorWithAlpha(value)).toBeNull()
  })

  it('serializes opaque and transparent colors consistently', () => {
    expect(colorWithAlphaToString('#aabbcc', 1)).toBe('#AABBCC')
    expect(colorWithAlphaToString('#aabbcc', 0.5)).toBe('#AABBCC80')
    expect(colorWithAlphaToString('#aabbcc', 0)).toBe('#AABBCC00')
  })
})

describe('component override composition', () => {
  it('maps synthetic component tokens to all matching components', () => {
    expect(buildComponentOverrides({
      '--button-radius': '5px',
      '--input-radius': '6px',
      '--color-accent': '#123456',
      '--unknown-token': 'ignored',
    })).toEqual({
      button: {base: {borderRadius: '5px'}},
      'text-input': {base: {'--_field-radius': '6px'}},
      'text-area': {base: {'--_field-radius': '6px'}},
      selector: {base: {'--_field-radius': '6px'}},
    })
  })

  it('preserves nested preset selectors while later leaves win', () => {
    const preset = {
      button: {
        base: {borderRadius: '8px', padding: '4px'},
        'variant:ghost': {':hover': {color: 'red', backgroundColor: 'white'}},
      },
    }
    const tokens = {button: {base: {borderRadius: '12px'}}}
    const custom = {button: {'variant:ghost': {':hover': {color: 'green'}}}}
    const result = mergeComponentStyleMaps(undefined, preset, tokens, custom)

    expect(result).toEqual({
      button: {
        base: {borderRadius: '12px', padding: '4px'},
        'variant:ghost': {':hover': {color: 'green', backgroundColor: 'white'}},
      },
    })
    ;(result.button as typeof preset.button).base.padding = '99px'
    expect(preset.button.base.padding).toBe('4px')
    expect(tokens.button.base.borderRadius).toBe('12px')
  })
})

describe('theme source export', () => {
  it('omits defaults and preserves changed scale settings', () => {
    const exported = evaluateThemeExport(generateThemeCode(
      'mybot',
      {'--color-accent': '#123456', '--spacing-1': '0.25rem'},
      {'--color-accent': '#FFFFFF', '--spacing-1': '0.25rem'},
      16,
      1.25,
    ))
    expect(exported.name).toBe('mybot')
    expect(exported.tokens).toEqual({'--color-accent': '#123456'})
    expect(exported.typography).toEqual({scale: {base: 16, ratio: 1.25}})
  })

  it('exports the same preset, token and custom component layers as live preview', () => {
    const exported = evaluateThemeExport(generateThemeCode(
      'mybot',
      {'--button-radius': '12px'},
      {},
      14,
      1.2,
      [{component: 'button', property: 'padding', value: '16px'}],
      {
        button: {
          base: {borderRadius: '8px', padding: '4px'},
          'variant:ghost': {':hover': {color: 'green'}},
        },
      },
    ))
    expect(exported.components).toEqual({
      button: {
        base: {borderRadius: '12px', padding: '16px'},
        'variant:ghost': {':hover': {color: 'green'}},
      },
    })
    expect(exported.tokens).toBeUndefined()
  })

  it('escapes theme names, token values and nested selectors without corrupting source', () => {
    const name = 'my team\'s\n"theme"'
    const tokenName = '--font-\'custom'
    const tokenValue = "'My Font',\nmonospace\\fallback"
    const selector = "variant:team's"
    const overrideValue = "url('/team\\'s-image')\nnone"
    const exported = evaluateThemeExport(generateThemeCode(
      name,
      {[tokenName]: tokenValue},
      {},
      14,
      1.2,
      [{component: 'button', property: 'backgroundImage', value: overrideValue}],
      {button: {[selector]: {':hover': {content: "'hello'"}}}},
    ))
    expect(exported.name).toBe(name)
    expect(exported.tokens).toEqual({[tokenName]: tokenValue})
    expect(exported.components).toEqual({
      button: {
        [selector]: {':hover': {content: "'hello'"}},
        base: {backgroundImage: overrideValue},
      },
    })
  })

  it.each(['123 mybot', '', 'my-bot', 'class', '主题'])(
    'generates an executable export for the display name %j',
    name => {
      expect(evaluateThemeExport(generateThemeCode(name, {}, {}, 14, 1.2)).name).toBe(name)
    },
  )
})

describe('live numeric drafts', () => {
  it.each(['', ' ', '-', '.', 'NaN', 'Infinity', '-Infinity', '2px'])(
    'does not apply incomplete or nonfinite draft %j',
    text => {
      expect(readLiveNumberDraft(text, {min: 0, max: 16})).toBeNull()
    },
  )

  it.each([
    ['0', 0],
    ['16', 16],
    [' 4 ', 4],
    ['1.5', 1.5],
  ])('accepts valid bounded draft %j', (text, expected) => {
    expect(readLiveNumberDraft(text, {min: 0, max: 16})).toBe(expected)
  })

  it('rejects out-of-range or fractional integer-only values', () => {
    expect(readLiveNumberDraft('-1', {min: 0})).toBeNull()
    expect(readLiveNumberDraft('17', {max: 16})).toBeNull()
    expect(readLiveNumberDraft('1.5', {isIntegerOnly: true})).toBeNull()
    expect(readLiveNumberDraft('2.0', {isIntegerOnly: true})).toBe(2)
  })
})
