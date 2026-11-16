import { createContext, useContext, type ReactNode } from 'react'

export type Density = 'comfortable' | 'compact' | 'touch'
export const densityProfiles = {
  comfortable: { controlSize: 'md', tableDensity: 'balanced' },
  compact: { controlSize: 'sm', tableDensity: 'compact' },
  touch: { controlSize: 'lg', tableDensity: 'spacious' },
} as const

const DensityContext = createContext<Density>('comfortable')

export function AppDensityProvider({
  density,
  children,
}: {
  density: Density
  children: ReactNode
}) {
  return <DensityContext value={density}>{children}</DensityContext>
}

export function useAppDensity() {
  return useContext(DensityContext)
}

export function useAppControlSize() {
  return densityProfiles[useAppDensity()].controlSize
}
