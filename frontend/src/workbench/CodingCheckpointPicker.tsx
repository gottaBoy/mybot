import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { AppButton, AppLoading, AppSelect } from '../components/ui'
import {
  fetchCodingCheckpoints,
  type CodingCheckpointPage,
  type CodingConfig,
} from './coding'
import { statusText, type Copy } from './state'

export function CodingCheckpointPicker({
  taskId,
  selected,
  disabled,
  t,
  onChange,
}: {
  taskId: string
  selected: CodingConfig['continuation']
  disabled: boolean
  t: Copy
  onChange: (checkpoint: { id: string; sha256: string }) => void
}) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<CodingCheckpointPage>()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    setResult(undefined)
    setError(false)
    setLoading(true)
    void fetchCodingCheckpoints(taskId, page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted && !disposed) setResult(value)
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
      controller.abort()
    }
  }, [taskId, page, revision])
  const option = result?.items.find(
    (item) => item.id === selected?.checkpoint.id,
  )
  const stale =
    option !== undefined && option.sha256 !== selected?.checkpoint.sha256
  return (
    <section aria-label={t('前轮代码检查点', 'Prior code checkpoints')}>
      <div className="wb-inline">
        <strong>{t('前轮代码检查点', 'Prior code checkpoints')}</strong>
        <AppButton
          label={t('刷新检查点', 'Refresh checkpoints')}
          icon={<RefreshCw size={15} />}
          iconOnly
          disabled={disabled || loading}
          onClick={() => setRevision((value) => value + 1)}
        />
      </div>
      {loading ? (
        <AppLoading label={t('正在读取检查点', 'Loading checkpoints')} />
      ) : error ? (
        <p role="alert" className="wb-error">
          {t(
            '检查点读取失败，请刷新。',
            'Checkpoints could not be read. Refresh to retry.',
          )}
        </p>
      ) : (
        result && (
          <>
            <AppSelect
              label={t('代码起点', 'Code starting point')}
              value={selected?.checkpoint.id ?? ''}
              disabled={disabled}
              options={[
                { value: '', label: t('请选择检查点', 'Choose a checkpoint') },
                ...result.items
                  .filter((item) => item.sha256)
                  .map((item) => ({
                    value: item.id,
                    label: `${item.title} · ${statusText(item.source_status, t)} · Run ${item.run_id.slice(0, 8)}`,
                  })),
                ...(selected &&
                !result.items.some((item) => item.id === selected.checkpoint.id)
                  ? [
                      {
                        value: selected.checkpoint.id,
                        label: selected.checkpoint.id,
                      },
                    ]
                  : []),
              ]}
              onChange={(id) => {
                if (disabled) return
                const item = result.items.find((item) => item.id === id)
                if (item?.sha256) onChange({ id: item.id, sha256: item.sha256 })
              }}
            />
            {!result.total && (
              <p>
                {t(
                  '尚无可接续的代码检查点。',
                  'No prior code checkpoints are available.',
                )}
              </p>
            )}
            {result.items.some((item) => !item.sha256) && (
              <p className="wb-error" role="status">
                {t(
                  '部分检查点无效，不能选择。',
                  'Some checkpoints are invalid and cannot be selected.',
                )}
              </p>
            )}
            {stale && (
              <p className="wb-error" role="alert">
                {t(
                  '所选检查点已变化，请重新选择并核对。',
                  'The selected checkpoint changed. Select and review it again.',
                )}
              </p>
            )}
            <div className="wb-artifact-reference-tools">
              <span>
                {result.page} / {result.total_pages} · {result.total}
              </span>
              <div>
                <AppButton
                  label={t('上一页检查点', 'Previous checkpoints')}
                  icon={<ChevronLeft size={15} />}
                  iconOnly
                  disabled={disabled || result.page <= 1}
                  onClick={() => setPage(result.page - 1)}
                />
                <AppButton
                  label={t('下一页检查点', 'Next checkpoints')}
                  icon={<ChevronRight size={15} />}
                  iconOnly
                  disabled={disabled || !result.has_more}
                  onClick={() => setPage(result.page + 1)}
                />
              </div>
            </div>
          </>
        )
      )}
      {selected && (
        <p className="wb-wrap">
          <code>{selected.checkpoint.id}</code>
          <br />
          SHA-256 <code>{selected.checkpoint.sha256}</code>
        </p>
      )}
    </section>
  )
}
