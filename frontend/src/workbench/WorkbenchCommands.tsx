import { useCallback, useMemo } from 'react'
import {
  AppCommands,
  type AppCommandSearchResult,
} from '../components/ui/Commands'
import { AppButton } from '../components/ui'
import { RefreshCw } from 'lucide-react'
import { ApiError } from './api'
import {
  fetchWorkspaceSearch,
  type WorkspaceSearchItem,
} from './workspace-reads'
import {
  buildWorkbenchCommands,
  buildWorkbenchNavigationCommands,
} from './commands-source'
import type { Bootstrap } from './api'
import type { Copy } from './state'
import { taskWorkspaceHref } from './task-workspace-location'

function domainCommand(
  item: WorkspaceSearchItem,
  t: Copy,
  onNavigate: (href: string) => void,
) {
  if (item.kind === 'project')
    return {
      id: `project:${item.project.id}`,
      label: `${item.project.name} · ${item.project.id}`,
      group: t('项目', 'Projects'),
      keywords: [item.project.id, item.project.name],
      href: `#project/${item.project.id}`,
      onSelect: () => onNavigate(`#project/${item.project.id}`),
    }
  if (item.kind === 'task') {
    const href = taskWorkspaceHref(item.task.id)
    return {
      id: `task:${item.task.id}`,
      label: `${item.task.title} · ${item.task.id}`,
      group: t('任务', 'Tasks'),
      keywords: [item.task.id, item.task.title, item.project.name],
      href,
      onSelect: () => onNavigate(href),
    }
  }
  return {
    id: `run:${item.run.id}`,
    label: `${t('运行记录', 'Run record')} · ${item.task.title} · ${item.run.id}`,
    group: t('运行记录', 'Run records'),
    keywords: [item.run.id, item.task.id, item.task.title, item.project.name],
    href: `#run/${item.run.id}`,
    onSelect: () => onNavigate(`#run/${item.run.id}`),
  }
}

export function WorkbenchCommands({
  data,
  t,
  onClose,
  onNavigate,
}: {
  data: Bootstrap
  t: Copy
  onClose: () => void
  onNavigate: (href: string) => void
}) {
  const local = useMemo(
    () =>
      buildWorkbenchNavigationCommands(t).map((item) => ({
        ...item,
        onSelect: () => onNavigate(item.href),
      })),
    [t, onNavigate],
  )
  const legacy = useMemo(
    () =>
      data.capabilities.workspace_search === true
        ? []
        : buildWorkbenchCommands(data, t).map((item) => ({
            ...item,
            onSelect: () => onNavigate(item.href),
          })),
    [data, t, onNavigate],
  )
  const search = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<AppCommandSearchResult> => {
      const result = await fetchWorkspaceSearch({ query, limit: 20 }, signal)
      const domain = result.items.map((item) =>
        domainCommand(item, t, onNavigate),
      )
      return {
        items: [
          ...local.filter((item) => {
            const term = query.trim().toLowerCase()
            return (
              !term ||
              [item.label, ...item.keywords].some((value) =>
                value.toLowerCase().includes(term),
              )
            )
          }),
          ...domain,
        ],
        total: result.total,
        count: result.items.length,
        hasMore: result.has_more,
      }
    },
    [local, onNavigate, t],
  )
  return (
    <AppCommands
      items={data.capabilities.workspace_search === true ? local : legacy}
      search={data.capabilities.workspace_search === true ? search : undefined}
      label={t('快速查找', 'Quick find')}
      placeholder={t('搜索页面、项目或任务', 'Search pages, projects or tasks')}
      empty={t('没有匹配项', 'No matches')}
      onClose={onClose}
      renderSearchStatus={(status, retry) => {
        if (status.kind === 'loading')
          return (
            <p
              role="status"
              style={{ margin: 0, padding: 12, overflowWrap: 'anywhere' }}
            >
              {t('正在读取搜索结果', 'Loading search results')}
            </p>
          )
        if (status.kind === 'ready')
          return (
            <p
              role="status"
              style={{ margin: 0, padding: 12, overflowWrap: 'anywhere' }}
            >
              {t('已显示', 'Showing')} {status.count} / {status.total}{' '}
              {t('项项目、任务或运行记录', 'project, task or run results')}
              {status.hasMore
                ? t('，请缩小搜索范围。', '. Refine your search.')
                : ''}
            </p>
          )
        const message =
          status.error instanceof ApiError && status.error.status === 403
            ? t('没有读取搜索结果的权限。', 'Search access is forbidden.')
            : status.error instanceof ApiError && status.error.status === 404
              ? t('服务端搜索接口不可用。', 'The server search is unavailable.')
              : status.error instanceof Error &&
                  status.error.message === 'workspace_search_timeout'
                ? t('读取搜索结果超时。', 'Reading search results timed out.')
                : t(
                    '搜索结果未通过验证。',
                    'Search results could not be validated.',
                  )
        return (
          <div
            role="alert"
            style={{
              padding: 12,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <p
              style={{ margin: 0, flex: '1 1 220px', overflowWrap: 'anywhere' }}
            >
              {message}
            </p>
            <AppButton
              label={t('重试搜索', 'Retry search')}
              icon={<RefreshCw size={15} />}
              size="sm"
              onClick={retry}
            />
          </div>
        )
      }}
    />
  )
}
