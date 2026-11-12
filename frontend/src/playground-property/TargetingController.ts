import {isTargetComponent, type TargetComponent} from './model'

export type TargetingMessage =
  | {type: 'mybot-targeting-hover'; id: string | null; component?: TargetComponent; index?: number}
  | {type: 'mybot-targeting-select'; id: string; component: TargetComponent; index: number}
  | {type: 'mybot-targeting-exit'}

const TARGET_SELECTOR = '[data-mybot-pg-id], [class*="astryx-"]'

function parseId(id: string) {
  const match = /^([A-Z][A-Za-z0-9]*)#(\d+)$/.exec(id)
  return match && isTargetComponent(match[1])
    ? {component: match[1], index: Number(match[2])}
    : null
}

function kebabToPascal(value: string) {
  return value.replace(/^astryx-/, '').split('-').map(part => part ? part[0].toUpperCase() + part.slice(1) : '').join('')
}

function componentFor(element: Element): TargetComponent | null {
  const stable = Array.from(element.classList).find(value => /^astryx-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
  if (!stable) return null
  const component = kebabToPascal(stable)
  return isTargetComponent(component) ? component : null
}

export function createTargetingController(post: (message: TargetingMessage) => void) {
  let enabled = false
  let overlay: HTMLDivElement | null = null
  let hovered: HTMLElement | null = null
  let selected: HTMLElement | null = null
  let frame = 0

  const targets = () => Array.from(document.querySelectorAll<HTMLElement>(TARGET_SELECTOR))
  const markTargets = () => {
    const counts = new Map<TargetComponent, number>()
    for (const element of targets()) {
      const marker = element.dataset.mybotPgId
      const markerComponent = marker?.split('#')[0]
      const component = markerComponent && isTargetComponent(markerComponent)
        ? markerComponent
        : componentFor(element)
      if (!component) continue
      const index = counts.get(component) ?? 0
      counts.set(component, index + 1)
      // Source-annotated markers are authoritative. Generated template
      // previews without source fall back to DOM order.
      if (!marker || !parseId(marker)) element.dataset.mybotPgId = `${component}#${index}`
    }
  }
  const find = (element: Element | null) => {
    let node = element
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && parseId(node.dataset.mybotPgId ?? '')) return node
      node = node.parentElement
    }
    return null
  }
  const ensureOverlay = () => {
    if (overlay) return overlay
    overlay = document.createElement('div')
    overlay.className = 'mybot-target-overlay'
    document.body.appendChild(overlay)
    return overlay
  }
  const position = (element: HTMLElement | null) => {
    if (!overlay || !element) {
      if (overlay) overlay.dataset.visible = 'false'
      return
    }
    const rect = element.getBoundingClientRect()
    overlay.style.top = `${rect.top - 2}px`
    overlay.style.left = `${rect.left - 2}px`
    overlay.style.width = `${rect.width + 4}px`
    overlay.style.height = `${rect.height + 4}px`
    overlay.dataset.visible = 'true'
    const parsed = parseId(element.dataset.mybotPgId ?? '')
    overlay.textContent = parsed ? `${parsed.component} · click to edit` : ''
  }
  const move = (event: MouseEvent) => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (overlay) overlay.style.display = 'none'
      const hit = find(document.elementFromPoint(event.clientX, event.clientY))
      if (overlay) overlay.style.display = ''
      if (hit !== hovered) {
        hovered = hit
        position(hit)
        const parsed = hit ? parseId(hit.dataset.mybotPgId ?? '') : null
        post({type: 'mybot-targeting-hover', id: hit?.dataset.mybotPgId ?? null, component: parsed?.component, index: parsed?.index})
      }
    })
  }
  const click = (event: MouseEvent) => {
    if (overlay) overlay.style.display = 'none'
    const hit = find(document.elementFromPoint(event.clientX, event.clientY))
    if (overlay) overlay.style.display = ''
    if (!hit) return
    event.preventDefault()
    event.stopPropagation()
    const parsed = parseId(hit.dataset.mybotPgId ?? '')
    if (!parsed) return
    selected = hit
    position(hit)
    post({type: 'mybot-targeting-select', id: hit.dataset.mybotPgId!, component: parsed.component, index: parsed.index})
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      disable()
      post({type: 'mybot-targeting-exit'})
    }
  }
  function enable() {
    if (enabled) return
    enabled = true
    markTargets()
    ensureOverlay()
    document.documentElement.classList.add('mybot-targeting')
    document.addEventListener('mousemove', move, true)
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', keydown, true)
  }
  function disable() {
    if (!enabled) return
    enabled = false
    cancelAnimationFrame(frame)
    document.documentElement.classList.remove('mybot-targeting')
    document.removeEventListener('mousemove', move, true)
    document.removeEventListener('click', click, true)
    document.removeEventListener('keydown', keydown, true)
    hovered = null
    selected = null
    position(null)
  }
  // Property edits intentionally do not mutate the DOM. The parent patches the
  // clean source and sends a new source revision for a full restricted recompile.
  // Kept as a no-op compatibility method while parent integrations migrate to
  // source-recompile patches. It must never mutate preview DOM directly.
  const applyPatch = (_patch: unknown) => {}
  return {enable, disable, applyPatch, refresh: markTargets}
}
