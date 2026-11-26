import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileCheck2, RefreshCw } from 'lucide-react'
import { AppBadge, AppButton, AppLoading } from '../components/ui'
import { ApiError } from './api'
import {
  fetchDeviceRun,
  fetchDeviceRuns,
  DeviceResponseError,
  type Device,
  type DeviceRunDetail,
  type DeviceRunPage,
} from './devices'
import type { PairedLocation } from './pair-location'
import { statusText, statusTone, type Copy } from './state'

type Read<T> = { key: string; value?: T; error?: boolean; missing?: boolean }
export function PairedRunHistory({
  device,
  location,
  revision,
  disabled,
  t,
  navigate,
  onScopeFailure,
}: {
  device: Device
  location: PairedLocation
  revision: number
  disabled: boolean
  t: Copy
  navigate: (next: Partial<PairedLocation>) => void
  onScopeFailure: (reason: unknown) => void
}) {
  const [page, setPage] = useState<Read<DeviceRunPage>>()
  const [detail, setDetail] = useState<Read<DeviceRunDetail>>()
  const [retry, setRetry] = useState(0)
  const [pageRevision, setPageRevision] = useState(revision)
  const [detailRevision, setDetailRevision] = useState(revision)
  const root = useRef<HTMLElement>(null)
  const focus = useRef<{ origin: Element | null; page: number } | undefined>(
    undefined,
  )
  const pageKey = JSON.stringify([device.id, device.task_id, location.page])
  const detailKey = JSON.stringify([device.id, device.task_id, location.runId])
  const latest = useRef({ page, detail, retry, failure: onScopeFailure })
  latest.current = { page, detail, retry, failure: onScopeFailure }
  const attempt = useRef({ pageRetry: -1, detailRetry: -1 })
  const fatal = (reason: unknown) =>
    reason instanceof DeviceResponseError ||
    (reason instanceof ApiError && [401, 403, 409].includes(reason.status))
  useEffect(() => {
    if (latest.current.page?.key === pageKey && latest.current.page.value)
      setPageRevision(revision)
    if (latest.current.detail?.key === detailKey && latest.current.detail.value)
      setDetailRevision(revision)
  }, [revision])
  useEffect(() => {
    if (
      latest.current.page?.key === pageKey &&
      latest.current.page.error &&
      attempt.current.pageRetry === retry
    )
      return
    const controller = new AbortController()
    attempt.current.pageRetry = retry
    setPage({ key: pageKey })
    void fetchDeviceRuns(device, location.page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setPage({ key: pageKey, value })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setPage({ key: pageKey, error: true })
        if (fatal(reason)) latest.current.failure(reason)
      })
    return () => controller.abort()
  }, [pageKey, pageRevision, retry])
  useEffect(() => {
    if (!location.runId) {
      setDetail(undefined)
      return
    }
    if (
      latest.current.detail?.key === detailKey &&
      latest.current.detail.error &&
      attempt.current.detailRetry === retry
    )
      return
    const controller = new AbortController()
    attempt.current.detailRetry = retry
    setDetail({ key: detailKey })
    void fetchDeviceRun(device, location.runId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetail({ key: detailKey, value })
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setDetail({
          key: detailKey,
          error: true,
          missing: reason instanceof ApiError && reason.status === 404,
        })
        if (fatal(reason)) latest.current.failure(reason)
      })
    return () => controller.abort()
  }, [detailKey, detailRevision, retry])
  const visiblePage = page?.key === pageKey ? page : undefined
  const visibleDetail = detail?.key === detailKey ? detail : undefined
  const busy = !visiblePage?.value && !visiblePage?.error
  const selected = visibleDetail?.value
  useEffect(() => {
    const pending = focus.current
    if (!pending || pending.page !== location.page || busy) return
    focus.current = undefined
    if (
      document.activeElement !== document.body &&
      document.activeElement !== pending.origin
    )
      return
    root.current
      ?.querySelector<HTMLButtonElement>(
        '[data-device-history-page]:not(:disabled):not([aria-disabled="true"])',
      )
      ?.focus()
  }, [location.page, busy])
  const paginate = (next: number) => {
    if (disabled || busy) return
    focus.current = { origin: document.activeElement, page: next }
    navigate({ page: next })
  }
  return (
    <section
      ref={root}
      className="wb-pair-section wb-pair-history"
      aria-label={t('运行记录', 'Run history')}
    >
      <h2>{t('运行记录', 'Run history')}</h2>
      {busy && (
        <AppLoading label={t('正在读取运行记录', 'Loading run history')} />
      )}
      {visiblePage?.error && (
        <div role="alert" className="wb-error">
          <p>{t('运行记录读取失败。', 'Run history could not be read.')}</p>
          <AppButton
            label={t('重试运行记录', 'Retry run history')}
            icon={<RefreshCw size={16} />}
            onClick={() => setRetry((value) => value + 1)}
            disabled={disabled}
          />
        </div>
      )}
      {visiblePage?.value && (
        <>
          <ul className="wb-pair-runs">
            {visiblePage.value.items.map((run) => (
              <li key={run.id}>
                <AppButton
                  label={run.id}
                  icon={<FileCheck2 size={15} />}
                  tone="ghost"
                  aria-pressed={location.runId === run.id}
                  disabled={disabled || busy}
                  onClick={() => navigate({ runId: run.id, view: 'review' })}
                />
                <AppBadge tone={statusTone(run.status)}>
                  {statusText(run.status, t)}
                </AppBadge>
              </li>
            ))}
          </ul>
          {!visiblePage.value.total && <p>{t('尚无运行', 'No runs yet')}</p>}
          <div className="wb-pair-actions">
            <span>
              {t(
                `${visiblePage.value.total} 次运行`,
                `${visiblePage.value.total} runs`,
              )}
            </span>
            <AppButton
              label={t('上一页运行', 'Previous runs')}
              iconOnly
              icon={<ArrowLeft size={16} />}
              data-device-history-page="previous"
              disabled={disabled || busy || visiblePage.value.page <= 1}
              onClick={() => paginate(visiblePage.value!.page - 1)}
            />
            <span>
              {visiblePage.value.page} / {visiblePage.value.total_pages}
            </span>
            <AppButton
              label={t('下一页运行', 'Next runs')}
              iconOnly
              icon={<ArrowRight size={16} />}
              data-device-history-page="next"
              disabled={disabled || busy || !visiblePage.value.has_more}
              onClick={() => paginate(visiblePage.value!.page + 1)}
            />
          </div>
        </>
      )}
      {location.runId && (
        <section
          className="wb-pair-selected-run"
          aria-label={t('选中运行', 'Selected run')}
        >
          <h3>{t('选中运行', 'Selected run')}</h3>
          <code>{location.runId}</code>
          {!visibleDetail?.value && !visibleDetail?.error && (
            <AppLoading label={t('正在读取选中运行', 'Loading selected run')} />
          )}
          {visibleDetail?.error && (
            <div className="wb-error" role="alert">
              <p>
                {visibleDetail.missing
                  ? t(
                      '选中运行不存在或不在授权任务内。',
                      'The selected run is missing or outside this task.',
                    )
                  : t(
                      '选中运行读取失败。',
                      'The selected run could not be read.',
                    )}
              </p>
              <AppButton
                label={t('重试选中运行', 'Retry selected run')}
                icon={<RefreshCw size={16} />}
                disabled={disabled}
                onClick={() => setRetry((value) => value + 1)}
              />
            </div>
          )}
          {selected && (
            <>
              <AppBadge tone={statusTone(selected.run.status)}>
                {statusText(selected.run.status, t)}
              </AppBadge>
              {selected.report ? (
                <>
                  <h3>{selected.report.title}</h3>
                  <AppBadge tone={statusTone(selected.report.decision)}>
                    {selected.report.decision === 'pending'
                      ? t('待人工审查', 'Awaiting human review')
                      : statusText(selected.report.decision, t)}
                  </AppBadge>
                  <p className="wb-pair-prose">{selected.report.content}</p>
                  {selected.report.truncated && (
                    <p className="wb-hint">
                      {t(
                        '正文已截断，请在主工作台查看完整成果。',
                        'The report is truncated. Read the complete report in the workbench.',
                      )}
                    </p>
                  )}
                </>
              ) : (
                <p>{t('此运行尚无报告成果。', 'This run has no report.')}</p>
              )}
            </>
          )}
        </section>
      )}
    </section>
  )
}
