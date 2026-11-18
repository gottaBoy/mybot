import { useMediaQuery } from '@astryxdesign/core/hooks'

export function useDockedWorkbenchNavigation() {
  return useMediaQuery('(min-width: 901px)')
}

export function useWideInspector() {
  return useMediaQuery('(min-width: 1280px)')
}

export function useDockedTaskScope() {
  return useMediaQuery('(min-width: 1280px)')
}

export function useCompactTaskList() {
  return useMediaQuery('(max-width: 650px)')
}

export function useSimultaneousTaskPanels() {
  return useMediaQuery('(min-width: 1600px)')
}
