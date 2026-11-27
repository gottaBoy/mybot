import { AppBadge, AppSelect, AppTextArea } from '../components/ui'
import type {
  CodingComparison,
  CodingResolution,
} from './coding-reconciliation'
import type { Copy } from './state'
import './coding-results.css'

export type CodingResolutionDrafts = Record<
  string,
  {
    source?: CodingResolution['source']
    content: string
  }
>

export function CodingBaselineResolution({
  comparison,
  drafts,
  disabled,
  stale,
  t,
  onChange,
}: {
  comparison: CodingComparison
  drafts: CodingResolutionDrafts
  disabled: boolean
  stale: boolean
  t: Copy
  onChange: (path: string, draft: CodingResolutionDrafts[string]) => void
}) {
  return (
    <section
      className="wb-baseline-resolution"
      aria-label={t('基线比较与人工解决', 'Baseline comparison & resolution')}
    >
      <h3>{t('基线比较与人工解决', 'Baseline comparison & resolution')}</h3>
      <p className="wb-wrap">
        {t('当前项目指纹', 'Current project fingerprint')} ·{' '}
        <code>{comparison.current_hash}</code>
      </p>
      {stale && (
        <p role="alert" className="wb-error">
          {t(
            '比较已失效，原选择和手工内容仍保留。请显式重新比较，再核对每个选择。',
            'This comparison is stale. Choices and manual content are retained. Compare again and review every choice.',
          )}
        </p>
      )}
      <p className="wb-hint">
        {t(
          '以下选择只确定下一次隔离运行的起点，尚未修改文件或运行测试。',
          'These choices define the next isolated Run starting point. No files have been changed or tests run.',
        )}
      </p>
      {comparison.current_files.map((file, index) => {
        const change = comparison.changes[index]
        const draft = drafts[file.path] ?? { content: '' }
        const size = new TextEncoder().encode(draft.content).length
        const sources = [
          [t('旧项目基线', 'Old project base'), comparison.origin_files[index]],
          [
            t('检查点代码', 'Checkpoint code'),
            comparison.checkpoint_files[index],
          ],
          [t('当前项目文件', 'Current project file'), file],
        ] as const
        return (
          <section
            key={file.path}
            className="wb-baseline-file"
            aria-label={file.path}
          >
            <div className="wb-inline">
              <strong>
                <code>{file.path}</code>
              </strong>
              <AppBadge>
                {change.writable
                  ? t('可修改', 'Editable')
                  : t('固定当前内容', 'Current content required')}
              </AppBadge>
            </div>
            <p className="wb-muted">
              {change.current_changed
                ? t('项目已变化', 'Project changed')
                : t('项目未变化', 'Project unchanged')}
              {' · '}
              {change.checkpoint_changed
                ? t('检查点有修改', 'Checkpoint changed')
                : t('检查点无修改', 'Checkpoint unchanged')}
            </p>
            {change.inherited_discarded && (
              <p role="status" className="wb-notice">
                {t(
                  '此路径不可修改，将采用当前内容，舍弃该路径的旧检查点修改。',
                  'This path is read-only. Current content replaces its prior checkpoint changes.',
                )}
              </p>
            )}
            <div className="wb-baseline-sources">
              {sources.map(([label, source]) => (
                <details className="wb-disclosure" key={label}>
                  <summary>
                    {label} · {source.bytes} bytes
                  </summary>
                  <pre className="wb-coding-log">
                    {source.content || t('（空文件）', '(Empty file)')}
                  </pre>
                </details>
              ))}
            </div>
            {change.writable ? (
              <>
                <AppSelect
                  label={`${t('起点内容', 'Starting content')} · ${file.path}`}
                  value={draft.source ?? ''}
                  disabled={disabled || stale}
                  options={[
                    { value: '', label: t('请选择内容', 'Choose content') },
                    {
                      value: 'current',
                      label: t(
                        '采用当前项目内容',
                        'Use current project content',
                      ),
                    },
                    {
                      value: 'checkpoint',
                      label: t('采用检查点内容', 'Use checkpoint content'),
                    },
                    {
                      value: 'manual',
                      label: t(
                        '手工填写完整内容',
                        'Enter complete content manually',
                      ),
                    },
                  ]}
                  onChange={(source) => {
                    if (
                      disabled ||
                      stale ||
                      !['current', 'checkpoint', 'manual'].includes(source)
                    )
                      return
                    onChange(file.path, {
                      ...draft,
                      source: source as CodingResolution['source'],
                    })
                  }}
                />
                {draft.source === 'manual' && (
                  <>
                    <AppTextArea
                      label={`${t('手工完整内容', 'Complete manual content')} · ${file.path}`}
                      value={draft.content}
                      rows={8}
                      isDisabled={disabled || stale}
                      onChange={(content) => {
                        if (!disabled && !stale)
                          onChange(file.path, { ...draft, content })
                      }}
                    />
                    <small className={size > 32768 ? 'wb-error' : 'wb-muted'}>
                      {size} / 32768 bytes
                    </small>
                  </>
                )}
                {draft.source !== 'manual' && draft.content && (
                  <details className="wb-disclosure">
                    <summary>
                      {t('保留的手工草稿', 'Retained manual draft')}
                    </summary>
                    <pre className="wb-coding-log">{draft.content}</pre>
                  </details>
                )}
              </>
            ) : (
              <p>
                {t(
                  '测试和只读资料采用当前项目内容。',
                  'Tests and read-only sources use current project content.',
                )}
              </p>
            )}
          </section>
        )
      })}
    </section>
  )
}
