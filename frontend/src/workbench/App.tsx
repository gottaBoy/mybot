import { lazy, Suspense, useEffect, useState } from 'react'

import { Workbench } from './Workbench'
import {
  allowWorkbenchNavigation,
  pushWorkbenchNavigation,
  WORKBENCH_NAVIGATION_EVENT,
} from './navigation-guard'

const TemplatesPage = lazy(() =>
  import('../TemplatesPage').then((module) => ({
    default: module.TemplatesPage,
  })),
)
const PreviewRunner = lazy(() =>
  import('../playground-preview/PreviewRunner').then((module) => ({
    default: module.PreviewRunner,
  })),
)
const PairPortal = lazy(() =>
  import('./PairPortal').then((module) => ({ default: module.PairPortal })),
)

function currentRoute() {
  const hash = window.location.hash.slice(1)
  return hash.startsWith('code=')
    ? 'templates'
    : hash.split('?')[0] || 'workbench'
}

export function App() {
  const [route, setRoute] = useState(currentRoute)
  const [mode, setMode] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const change = (event: Event) => {
      if (allowWorkbenchNavigation(event)) setRoute(currentRoute())
    }
    window.addEventListener(WORKBENCH_NAVIGATION_EVENT, change)
    return () => window.removeEventListener(WORKBENCH_NAVIGATION_EVENT, change)
  }, [])
  let page
  if (new URLSearchParams(window.location.search).get('preview') === '1') {
    page = <PreviewRunner />
  } else if (route === 'pair') {
    page = <PairPortal />
  } else if (route === 'templates') {
    page = (
      <TemplatesPage
        mode={mode}
        onModeChange={setMode}
        onBack={() => {
          pushWorkbenchNavigation('#workbench')
        }}
      />
    )
  } else {
    page = <Workbench />
  }
  return (
    <Suspense fallback={<p role="status">Loading mybot...</p>}>{page}</Suspense>
  )
}
