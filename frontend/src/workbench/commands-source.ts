import type { Bootstrap } from './api'
import type { Copy } from './state'

export type WorkbenchCommand = {
  id: string
  label: string
  group: string
  keywords: string[]
  href: string
}

export function buildWorkbenchNavigationCommands(t: Copy): WorkbenchCommand[] {
  const navigation = [
    ['overview', t('总览', 'Overview')],
    ['workbench', t('工作台', 'Workbench')],
    ['inbox', t('待处理', 'Inbox')],
    ['projects', t('项目', 'Projects')],
    ['hierarchy', t('项目层级', 'Project hierarchy')],
    ['documents', t('项目资料', 'Documents')],
    ['models', t('模型与资源', 'Models & resources')],
    ['backends', t('会话后端', 'Conversation backends')],
    ['login', t('登录与会话', 'Sign-in & session')],
    ['templates', t('组件实验室', 'Component lab')],
  ]
  return navigation.map(([id, label]) => ({
    id: `nav:${id}`,
    label,
    group: t('导航', 'Navigation'),
    keywords: [id],
    href: `#${id}`,
  }))
}

export function buildWorkbenchCommands(
  data: Bootstrap,
  t: Copy,
): WorkbenchCommand[] {
  const projectNames = new Map(
    data.projects.map((project) => [project.id, project.name]),
  )
  const tasks = new Map(data.tasks.map((task) => [task.id, task]))
  return [
    ...buildWorkbenchNavigationCommands(t),
    ...data.projects.map((project) => ({
      id: `project:${project.id}`,
      label: `${project.name} · ${project.id}`,
      group: t('项目', 'Projects'),
      keywords: [project.id, project.name],
      href: `#project/${project.id}`,
    })),
    ...data.tasks.map((task) => {
      const projectName = projectNames.get(task.project_id) ?? task.project_id
      const params = new URLSearchParams({
        q: task.id,
        view: 'list',
        project: task.project_id,
        filter: 'all',
        page: '1',
      })
      return {
        id: `task:${task.id}`,
        label: `${task.title} · ${task.id}`,
        group: t('任务', 'Tasks'),
        keywords: [task.id, task.title, task.project_id, projectName],
        href: `#workbench?${params.toString()}`,
      }
    }),
    ...[...data.runs]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 30)
      .map((run) => {
        const task = tasks.get(run.task_id)
        const projectName = task
          ? (projectNames.get(task.project_id) ?? task.project_id)
          : ''
        return {
          id: `run:${run.id}`,
          label: `${t('运行记录', 'Run record')} · ${task?.title ?? run.task_id} · ${run.id}`,
          group: t('运行记录', 'Run records'),
          keywords: [run.id, run.task_id, task?.title ?? '', projectName],
          href: `#run/${run.id}`,
        }
      }),
  ]
}

type CommandShortcutEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'ctrlKey'
  | 'metaKey'
  | 'altKey'
  | 'defaultPrevented'
  | 'isComposing'
  | 'repeat'
>
export type CommandScope = {
  hasData: boolean
  formOpen: boolean
  menuOpen: boolean
  preferencesOpen: boolean
  commandsOpen: boolean
  overlayOpen: boolean
  textEditing: boolean
}

export function canOpenWorkbenchCommands(
  event: CommandShortcutEvent,
  scope: CommandScope,
) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'k' &&
    !event.altKey &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.repeat &&
    scope.hasData &&
    !scope.formOpen &&
    !scope.menuOpen &&
    !scope.preferencesOpen &&
    !scope.commandsOpen &&
    !scope.overlayOpen &&
    !scope.textEditing
  )
}

export const commandOverlaySelectors = [
  'dialog[open]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="menu"]',
  '[popover]:popover-open',
] as const

export function hasBlockingCommandOverlay(
  root: Pick<Document, 'querySelectorAll'>,
) {
  for (const selector of commandOverlaySelectors) {
    try {
      const overlays = root.querySelectorAll<HTMLElement>(selector)
      for (const overlay of overlays) {
        if (
          !overlay.closest('[hidden], [aria-hidden="true"]') &&
          overlay.getClientRects().length > 0
        )
          return true
      }
    } catch {
      // Older browsers may not support the native popover pseudo-class.
    }
  }
  return false
}
