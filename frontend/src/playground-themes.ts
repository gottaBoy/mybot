import {neutralTheme} from '@astryxdesign/theme-neutral'
import type {DefinedTheme} from '@astryxdesign/core/theme'

export const themeOptions = [
  {value: 'neutral', label: 'Neutral'},
  {value: 'butter', label: 'Butter'},
  {value: 'chocolate', label: 'Chocolate'},
  {value: 'gothic', label: 'Gothic'},
  {value: 'matcha', label: 'Matcha'},
  {value: 'stone', label: 'Stone'},
  {value: 'y2k', label: 'Y2K'},
] as const

export type ThemeId = (typeof themeOptions)[number]['value']
export type ThemeSnapshot = {
  preset: ThemeId
  tokens: DefinedTheme['tokens']
  components: DefinedTheme['components']
}

const themes: Record<ThemeId, () => Promise<DefinedTheme>> = {
  neutral: () => Promise.resolve(neutralTheme),
  butter: () => import('@astryxdesign/theme-butter').then(module => module.butterTheme),
  chocolate: () => import('@astryxdesign/theme-chocolate').then(module => module.chocolateTheme),
  gothic: () => import('@astryxdesign/theme-gothic').then(module => module.gothicTheme),
  matcha: () => import('@astryxdesign/theme-matcha').then(module => module.matchaTheme),
  stone: () => import('@astryxdesign/theme-stone').then(module => module.stoneTheme),
  y2k: () => import('@astryxdesign/theme-y2k').then(module => module.y2kTheme),
}

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.hasOwn(themes, value)
}

export function loadTheme(value: ThemeId) {
  return themes[value]()
}

export {neutralTheme as initialPreviewTheme}
