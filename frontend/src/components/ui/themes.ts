import { defineTheme, type DefinedTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

export const styleOptions = [
  { value: 'neutral', label: 'Neutral', swatch: '#4265cc' },
  { value: 'zira', label: 'Zira', swatch: '#3568e8' },
  { value: 'gothic', label: 'Gothic', swatch: '#3f526c' },
  { value: 'matcha', label: 'Matcha', swatch: '#5e7550' },
  { value: 'stone', label: 'Stone', swatch: '#817d75' },
  { value: 'butter', label: 'Butter', swatch: '#d8b93e' },
  { value: 'chocolate', label: 'Chocolate', swatch: '#785348' },
  { value: 'y2k', label: 'Y2K', swatch: '#c65b91' },
] as const
export type StyleId = (typeof styleOptions)[number]['value']
export const styleIds = styleOptions.map((style) => style.value)
export type { Density } from './DensityContext'
export const accentOptions = [
  { value: 'theme', zh: '跟随样式', en: 'Follow style', swatch: '#6b7280' },
  { value: 'blue', zh: '蓝色', en: 'Blue', swatch: '#285bd4' },
  { value: 'teal', zh: '青色', en: 'Teal', swatch: '#0f766e' },
  { value: 'green', zh: '绿色', en: 'Green', swatch: '#237346' },
  { value: 'rose', zh: '玫红', en: 'Rose', swatch: '#b91c4d' },
  { value: 'amber', zh: '琥珀', en: 'Amber', swatch: '#996000' },
] as const
export type AccentId = (typeof accentOptions)[number]['value']
export const accentIds = accentOptions.map((option) => option.value)
const accentColors = {
  blue: ['#285bd4', '#9abaff'],
  teal: ['#0f766e', '#5eead4'],
  green: ['#237346', '#86efac'],
  rose: ['#b91c4d', '#fda4af'],
  amber: ['#996000', '#fcd34d'],
} as const
const loaders: Record<StyleId, () => Promise<DefinedTheme>> = {
  neutral: () => Promise.resolve(neutralTheme),
  zira: () => Promise.resolve(neutralTheme),
  gothic: () =>
    import('@astryxdesign/theme-gothic/built').then(
      (module) => module.gothicTheme,
    ),
  matcha: () =>
    import('@astryxdesign/theme-matcha/built').then(
      (module) => module.matchaTheme,
    ),
  stone: () =>
    import('@astryxdesign/theme-stone/built').then(
      (module) => module.stoneTheme,
    ),
  butter: () =>
    import('@astryxdesign/theme-butter/built').then(
      (module) => module.butterTheme,
    ),
  chocolate: () =>
    import('@astryxdesign/theme-chocolate/built').then(
      (module) => module.chocolateTheme,
    ),
  y2k: () =>
    import('@astryxdesign/theme-y2k/built').then((module) => module.y2kTheme),
}
export function productTheme(
  base: DefinedTheme,
  id: StyleId,
  accent: AccentId = 'theme',
) {
  const colors = accent === 'theme' ? undefined : accentColors[accent]
  return defineTheme({
    name: `mybot-${id}`,
    extends: base,
    tokens: {
      '--radius-element': id === 'gothic' ? '3px' : '6px',
      '--radius-container': id === 'gothic' ? '4px' : '8px',
      '--size-element-sm': '28px',
      '--size-element-md': '32px',
      '--size-element-lg': '40px',
      ...(id === 'neutral'
        ? {
            '--color-accent': ['#285bd4', '#9abaff'],
            '--color-background-body': ['#f6f7f8', '#151719'],
            '--color-background-surface': ['#ffffff', '#1c1f22'],
          }
        : {}),
      ...(id === 'zira'
        ? {
            '--color-accent': ['#3568e8', '#5b87f5'],
            '--color-accent-hover': ['#2453c7', '#78a0f7'],
            '--color-background-body': ['#f7f8fa', '#0e1116'],
            '--color-background-surface': ['#ffffff', '#161a22'],
            '--color-background-card': ['#ffffff', '#161a22'],
            '--color-background-popover': ['#ffffff', '#1e242e'],
            '--color-background-muted': ['#f1f2f4', '#1c212b'],
            '--color-text-primary': ['#172b4d', '#e6e9ef'],
            '--color-text-secondary': ['#5e6c84', '#a6aebb'],
            '--color-border': ['#dfe1e6', '#2a3140'],
            '--color-text-info': ['#2453c7', '#85b8ff'],
            '--color-text-success': ['#1f845a', '#4cbb87'],
            '--color-text-warning': ['#b38600', '#e2b203'],
            '--color-text-error': ['#c9372c', '#f87168'],
            '--color-success-muted': ['#e3fcef', '#1c3329'],
            '--color-warning-muted': ['#fff7d6', '#3a2f10'],
            '--color-error-muted': ['#ffedeb', '#3d1f1e'],
            '--font-family-body':
              '"Inter var", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
            '--font-family-heading':
              '"Inter var", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
          }
        : {}),
      ...(colors
        ? {
            '--color-accent': [...colors],
            '--color-text-accent': [...colors],
            '--color-icon-accent': [...colors],
            '--color-accent-hover': [...colors],
            '--color-on-accent': ['#ffffff', '#111111'],
          }
        : {}),
    },
  })
}
export const defaultProductTheme = productTheme(neutralTheme, 'neutral')
const cache = new Map<string, Promise<DefinedTheme>>([
  ['neutral:theme', Promise.resolve(defaultProductTheme)],
])
export function loadProductTheme(id: StyleId, accent: AccentId = 'theme') {
  const key = `${id}:${accent}`
  const existing = cache.get(key)
  if (existing) return existing
  const loading = loaders[id]()
    .then((base) => productTheme(base, id, accent))
    .catch((error) => {
      cache.delete(key)
      throw error
    })
  cache.set(key, loading)
  return loading
}
