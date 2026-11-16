import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Search } from 'lucide-react'
import { AppButton, AppInput, AppSelect } from '../components/ui'
import { AppMarkdown } from '../components/ui/Markdown'
import type { Bootstrap } from './api'
import {
  projectDocumentView,
  reconcileDocumentSelection,
  selectDocumentProject,
} from './documents-state'
import type { Copy } from './state'

export function ProjectDocuments({ data, t }: { data: Bootstrap; t: Copy }) {
  const [requested, setSelection] = useState(() =>
    selectDocumentProject(data.projects[0]?.id ?? ''),
  )
  const {
    selection,
    project,
    projectTasks,
    navigationTasks,
    current,
    content,
  } = projectDocumentView(data, requested)
  useEffect(() => {
    setSelection((previous) =>
      reconcileDocumentSelection(data.projects, previous),
    )
  }, [data.projects])
  return (
    <>
      <div className="wb-page-heading">
        <div>
          <div className="wb-eyebrow">PROJECT CONTEXT</div>
          <h1>{t('项目资料', 'Project documents')}</h1>
        </div>
        <div className="wb-document-project">
          <AppSelect
            label={t('选择项目', 'Select project')}
            hiddenLabel
            value={selection.projectId}
            disabled={!data.projects.length}
            options={data.projects.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={(id) => {
              setSelection(selectDocumentProject(id))
            }}
          />
        </div>
      </div>
      {project ? (
        <div className="wb-doc-layout">
          <aside
            className="wb-doc-nav"
            aria-label={t('资料目录', 'Document navigation')}
          >
            <AppInput
              label={t('搜索资料目录', 'Search documents')}
              type="search"
              isLabelHidden
              value={selection.query}
              onChange={(query) =>
                setSelection((previous) => ({ ...previous, query }))
              }
              startIcon={<Search size={15} />}
              placeholder={t('搜索任务资料', 'Search task context')}
            />
            <button
              type="button"
              onClick={() =>
                setSelection((previous) => ({
                  ...previous,
                  projectId: project.id,
                  chosenTask: null,
                  chosenTaskProjectId: undefined,
                }))
              }
              aria-current={selection.chosenTask === null ? 'page' : undefined}
            >
              <BookOpen size={15} />
              {t('项目背景', 'Project notes')}
            </button>
            {navigationTasks.map((task) => (
              <button
                type="button"
                key={task.id}
                onClick={() =>
                  setSelection((previous) => ({
                    ...previous,
                    projectId: project.id,
                    chosenTask: task.id,
                    chosenTaskProjectId: project.id,
                  }))
                }
                aria-current={
                  selection.chosenTask === task.id ? 'page' : undefined
                }
              >
                <span>{task.title}</span>
              </button>
            ))}
            {!navigationTasks.length && (
              <p className="wb-muted" role="status">
                {projectTasks.length
                  ? t('没有匹配的任务资料', 'No matching task documents')
                  : t('尚无任务资料', 'No task documents')}
              </p>
            )}
          </aside>
          <article className="wb-doc-content">
            <div className="wb-eyebrow">{project.name}</div>
            <h2>
              {current?.title ??
                (content === 'unavailable'
                  ? t('任务资料不可用', 'Task documents unavailable')
                  : t('项目背景', 'Project notes'))}
            </h2>
            {current ? (
              <>
                <section id="document-objective">
                  <h3>{t('任务目标', 'Objective')}</h3>
                  <p>{current.goal}</p>
                </section>
                <section id="document-acceptance">
                  <h3>{t('验收要求', 'Acceptance')}</h3>
                  {current.acceptance ? (
                    <AppMarkdown>{current.acceptance}</AppMarkdown>
                  ) : (
                    <p className="wb-muted">{t('未填写', 'Not provided')}</p>
                  )}
                </section>
                <section id="document-files">
                  <h3>{t('明确选择的文件', 'Explicit files')}</h3>
                  {current.files.map((file) => (
                    <code key={file} className="wb-doc-file">
                      {file}
                    </code>
                  ))}
                  {!current.files.length && (
                    <p className="wb-muted">
                      {t('未选择文件', 'No files selected')}
                    </p>
                  )}
                </section>
              </>
            ) : content === 'unavailable' ? (
              <div role="status">
                <p className="wb-muted">
                  {t(
                    '所选任务不在当前项目中，或资料已不可用。',
                    'The selected task is not in this project or is no longer available.',
                  )}
                </p>
                <AppButton
                  label={t('返回项目背景', 'Return to project notes')}
                  onClick={() =>
                    setSelection((previous) => ({
                      ...previous,
                      projectId: project.id,
                      chosenTask: null,
                      chosenTaskProjectId: undefined,
                    }))
                  }
                />
              </div>
            ) : (
              <>
                <section id="document-objective">
                  <h3>{t('项目目标', 'Project goal')}</h3>
                  <p>{project.goal || t('未填写', 'Not provided')}</p>
                </section>
                <section id="document-acceptance">
                  <h3>{t('允许发送的资料', 'Allowed project notes')}</h3>
                  {project.notes ? (
                    <AppMarkdown>{project.notes}</AppMarkdown>
                  ) : (
                    <p className="wb-muted">
                      {t('未填写项目资料', 'No project notes')}
                    </p>
                  )}
                </section>
                <section id="document-files">
                  <h3>{t('相对目录', 'Relative directory')}</h3>
                  <code>{project.directory}</code>
                </section>
              </>
            )}
            <AppButton
              label={t('打开项目', 'Open project')}
              icon={<ArrowRight size={15} />}
              href={`#project/${project.id}`}
            />
          </article>
          {content !== 'unavailable' && (
            <aside className="wb-doc-outline">
              <strong>{t('本页', 'On this page')}</strong>
              {[
                t('目标', 'Objective'),
                t('资料 / 验收', 'Notes / acceptance'),
                t('目录 / 文件', 'Directory / files'),
              ].map((label, index) => (
                <button
                  type="button"
                  key={label}
                  onClick={() =>
                    document
                      .getElementById(
                        [
                          'document-objective',
                          'document-acceptance',
                          'document-files',
                        ][index],
                      )
                      ?.scrollIntoView({ block: 'start' })
                  }
                >
                  {label}
                </button>
              ))}
            </aside>
          )}
        </div>
      ) : (
        <div className="wb-empty">
          <BookOpen size={28} />
          <h2>{t('尚无项目资料', 'No project documents')}</h2>
          <AppButton label={t('打开项目', 'Open projects')} href="#projects" />
        </div>
      )}
    </>
  )
}
