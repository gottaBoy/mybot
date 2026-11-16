import { describe, expect, it } from 'vitest'
import { resolveAppTableDensity } from '../src/components/ui/DataTable'

describe('shared table density', () => {
  it.each([
    ['comfortable', 'balanced'],
    ['compact', 'compact'],
    ['touch', 'spacious'],
  ] as const)(
    'maps global %s density to %s without a local override',
    (density, expected) => {
      expect(resolveAppTableDensity(density)).toBe(expected)
    },
  )

  it.each(['comfortable', 'compact', 'touch'] as const)(
    'honors both explicit compact overrides under global %s density',
    (density) => {
      expect(resolveAppTableDensity(density, true)).toBe('compact')
      expect(resolveAppTableDensity(density, false)).toBe('balanced')
    },
  )
})
