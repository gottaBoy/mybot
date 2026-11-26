import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import { AppButton, AppCheckbox, AppLoading } from '../components/ui'
import type { Snapshot } from './api'
import type { Copy } from './state'
import { previewTaskTurn } from './task-turns'
import {
  artifactRefs,
  fetchTaskArtifacts,
  sameArtifactRefs,
  type ArtifactOption,
  type ArtifactPage,
} from './task-artifacts'
import './task-artifacts.css'

export function TaskArtifactPicker({
  taskId,
  turnId,
  turnContent,
  snapshot,
  locked,
  t,
  onApplied,
  onBlockedChange,
}: {
  taskId: string
  turnId: string
  turnContent: string
  snapshot: Snapshot
  locked: boolean
  t: Copy
  onApplied: (snapshot: Snapshot) => void
  onBlockedChange: (blocked: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<ArtifactPage>()
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState(false)
  const [applyError, setApplyError] = useState(false)
  const [draft, setDraft] = useState<ArtifactOption[]>(snapshot.artifacts ?? [])
  const [applying, setApplying] = useState(false)
  const previewRequest = useRef<AbortController | undefined>(undefined)
  const operation = useRef(false)
  const baseline = JSON.stringify(artifactRefs(snapshot.artifacts))
  const refs = draft.map((item) => ({ id: item.id, sha256: item.sha256! }))
  const dirty = !sameArtifactRefs(refs, artifactRefs(snapshot.artifacts))
  useEffect(() => {
    setDraft(snapshot.artifacts ?? [])
    setApplyError(false)
  }, [baseline, taskId, turnId])
  useEffect(() => {
    onBlockedChange(dirty || applying)
  }, [dirty, applying, onBlockedChange])
  useEffect(() => () => previewRequest.current?.abort(), [])
  useEffect(() => {
    if (!open || locked) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setReadError(false)
    setResult(undefined)
    void fetchTaskArtifacts(taskId, page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value)
      })
      .catch(() => {
        if (!disposed) setReadError(true)
      })
      .finally(() => {
        clearTimeout(timer)
        if (!disposed) setLoading(false)
      })
    let disposed = false
    return () => {
      disposed = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [taskId, page, revision, open, locked])
  const apply = async () => {
    if (operation.current || locked || !dirty) return
    operation.current = true
    setApplying(true)
    setApplyError(false)
    const controller = new AbortController()
    previewRequest.current = controller
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const next = await previewTaskTurn(
        taskId,
        turnId,
        controller.signal,
        refs,
      )
      controller.signal.throwIfAborted()
      if (next.supplement.content !== turnContent)
        throw new Error('task_turn_preview_candidate_mismatch')
      onApplied(next)
    } catch {
      if (previewRequest.current === controller && !disposed.current)
        setApplyError(true)
    } finally {
      clearTimeout(timer)
      if (!disposed.current) {
        operation.current = false
        setApplying(false)
      }
    }
  }
  const disposed = useRef(false)
  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
    }
  }, [])
  return (
    <section
      className="wb-artifact-references"
      aria-label={t('引用前轮成果', 'Prior work references')}
    >
      <div className="wb-artifact-reference-tools">
        <strong>
          {t('引用前轮成果', 'Prior work references')} ·{' '}
          {snapshot.artifacts?.length ?? 0}
        </strong>
        {!locked && (
          <AppButton
            label={t('选择已有成果', 'Select prior artifacts')}
            icon={<FilePlus2 size={16} />}
            disabled={applying}
            onClick={() => setOpen(true)}
          />
        )}
      </div>
      {open && !locked && (
        <>
          <div className="wb-artifact-reference-tools">
            <span>
              {t('最多 3 项，共 64 KiB', 'Up to 3 artifacts, 64 KiB total')}
            </span>
            <AppButton
              label={t('刷新成果', 'Refresh artifacts')}
              icon={<RefreshCw size={15} />}
              iconOnly
              disabled={loading || applying}
              onClick={() => setRevision((value) => value + 1)}
            />
          </div>
          {loading ? (
            <AppLoading label={t('正在读取成果', 'Loading artifacts')} />
          ) : readError ? (
            <p role="alert" className="wb-error">
              {t(
                '成果读取失败，请刷新。',
                'Artifacts could not be read. Refresh to retry.',
              )}
            </p>
          ) : (
            result && (
              <div aria-label={t('可引用成果', 'Available artifacts')}>
                {result.items.map((item) => (
                  <div className="wb-artifact-reference-option" key={item.id}>
                    <AppCheckbox
                      label={item.title}
                      value={draft.some((value) => value.id === item.id)}
                      isDisabled={
                        applying ||
                        !item.sha256 ||
                        (!draft.some((value) => value.id === item.id) &&
                          (draft.length >= 3 ||
                            draft.reduce(
                              (sum, value) => sum + value.bytes,
                              item.bytes,
                            ) > 65536))
                      }
                      onChange={(checked) => {
                        if (applying || operation.current || !item.sha256)
                          return
                        setApplyError(false)
                        setDraft((before) =>
                          checked
                            ? before.some((value) => value.id === item.id)
                              ? before
                              : [...before, item]
                            : before.filter((value) => value.id !== item.id),
                        )
                      }}
                    />
                    <small>
                      {item.kind} · {item.bytes} bytes · Run{' '}
                      <code>{item.run_id}</code>
                      {!item.sha256 &&
                        ` · ${t('空成果或超过单项 32 KiB', 'Empty or exceeds 32 KiB')}`}
                    </small>
                  </div>
                ))}
                {!result.total && (
                  <p>
                    {t(
                      '尚无已结束运行的成果。',
                      'No artifacts from completed runs yet.',
                    )}
                  </p>
                )}
                <div className="wb-artifact-reference-tools">
                  <span>
                    {result.page} / {result.total_pages} · {result.total}
                  </span>
                  <div>
                    <AppButton
                      label={t('上一页成果', 'Previous artifacts')}
                      icon={<ChevronLeft size={15} />}
                      iconOnly
                      disabled={applying || result.page <= 1}
                      onClick={() => setPage(result.page - 1)}
                    />
                    <AppButton
                      label={t('下一页成果', 'Next artifacts')}
                      icon={<ChevronRight size={15} />}
                      iconOnly
                      disabled={applying || !result.has_more}
                      onClick={() => setPage(result.page + 1)}
                    />
                  </div>
                </div>
              </div>
            )
          )}
          <div className="wb-artifact-reference-selection">
            {draft.map((item) => (
              <span key={item.id}>
                {item.title} · <code>{item.id}</code>
              </span>
            ))}
          </div>
          {dirty && (
            <div className="wb-artifact-reference-tools">
              <AppButton
                label={t('核对所选成果', 'Review selected artifacts')}
                icon={<FilePlus2 size={15} />}
                busy={applying}
                disabled={applying}
                onClick={() => void apply()}
              />
              <AppButton
                label={t('撤回引用修改', 'Reset reference changes')}
                icon={<RotateCcw size={15} />}
                disabled={applying}
                onClick={() => {
                  setDraft(snapshot.artifacts ?? [])
                  setApplyError(false)
                }}
              />
            </div>
          )}
          {applyError && (
            <p className="wb-error" role="alert">
              {t(
                '引用未核对成功。成果可能已变化或不可用，请刷新、重新选择或撤回修改。',
                'References could not be verified. An artifact may have changed or become unavailable. Refresh, reselect, or reset.',
              )}
            </p>
          )}
        </>
      )}
      {(snapshot.artifacts ?? []).map((item) => (
        <details className="wb-disclosure" key={item.id}>
          <summary>
            {item.title} · {item.kind} · {item.bytes} bytes
          </summary>
          <p>
            Run <code>{item.run_id}</code> · <code>{item.id}</code>
          </p>
          <code className="wb-wrap">SHA-256 {item.sha256}</code>
          <pre>{item.content}</pre>
        </details>
      ))}
    </section>
  )
}
