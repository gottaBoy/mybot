import { api } from './api'
import type { ModelTestReceipt } from './model-test-state'

async function boundedTestRequest(
  path: string,
  options: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await api<ModelTestReceipt>(path, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
export function startModelTest(
  modelId: string,
  requestId: string,
  timeoutMs = 15_000,
) {
  return boundedTestRequest(
    `/models/${encodeURIComponent(modelId)}/test`,
    {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, consent: true }),
    },
    timeoutMs,
  )
}
export function readModelTest(
  modelId: string,
  requestId: string,
  timeoutMs = 15_000,
) {
  return boundedTestRequest(
    `/models/${encodeURIComponent(modelId)}/tests/${encodeURIComponent(requestId)}`,
    { method: 'GET' },
    timeoutMs,
  )
}
