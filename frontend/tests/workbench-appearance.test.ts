import { describe, expect, it } from 'vitest'
import {
  accentIds,
  defaultProductTheme,
  loadProductTheme,
} from '../src/components/ui/themes'
import { densityProfiles } from '../src/components/ui/DensityContext'

describe('independent appearance preferences', () => {
  it('keeps the default theme identity and distinct cached accent variants', async () => {
    expect(await loadProductTheme('neutral')).toBe(defaultProductTheme)
    const teal = loadProductTheme('neutral', 'teal')
    expect(loadProductTheme('neutral', 'teal')).toBe(teal)
    expect(await teal).not.toBe(defaultProductTheme)
    expect((await teal).tokens['--color-accent']).toBe(
      'light-dark(#0f766e, #5eead4)',
    )
  })
  it('retains the Zira preset by default and permits an explicit independent accent', async () => {
    expect((await loadProductTheme('zira')).tokens['--color-accent']).toBe(
      'light-dark(#3568e8, #5b87f5)',
    )
    expect(
      (await loadProductTheme('zira', 'teal')).tokens['--color-accent'],
    ).toBe('light-dark(#0f766e, #5eead4)')
    expect(
      (await loadProductTheme('zira', 'teal')).tokens['--color-text-primary'],
    ).toBe('light-dark(#172b4d, #e6e9ef)')
  })
  it('uses one control-size profile for each density', () => {
    expect(
      Object.values(densityProfiles).map((profile) => profile.controlSize),
    ).toEqual(['md', 'sm', 'lg'])
    expect(accentIds).toHaveLength(6)
  })
  it('keeps shared control geometry across color variants', async () => {
    for (const id of accentIds) {
      const theme = await loadProductTheme('neutral', id)
      expect(theme.tokens['--size-element-sm']).toBe('28px')
      expect(theme.tokens['--size-element-md']).toBe('32px')
      expect(theme.tokens['--size-element-lg']).toBe('40px')
    }
  })
})
