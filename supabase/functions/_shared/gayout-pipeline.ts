/** Batch completion is explicit: an HTTP 200 error is never an empty success. */
export interface GayOutBatchResult {
  success: boolean
  repeat: boolean
  delaySeconds: number
  itemsOut: number
  processed: number
  succeeded: number
  failed: number
  error?: string
}
function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : undefined
}
export function gayOutBatchResult(status: number, value: unknown, drain: boolean, dryRun: boolean): GayOutBatchResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {
    success: false, repeat: false, delaySeconds: 0, itemsOut: 0, processed: 0, succeeded: 0, failed: 1, error: 'Invalid pipeline step response',
  }
  const r = value as Record<string, unknown>
  if (status < 200 || status >= 300 || r.success === false || r.skipped === true) return {
    success: false, repeat: false, delaySeconds: 0, itemsOut: 0, processed: 0, succeeded: 0, failed: 1,
    error: typeof r.error === 'string' ? r.error : typeof r.reason === 'string' ? r.reason : `HTTP ${status}: required GayOut stage did not succeed`,
  }
  const itemsOut = count(r.items) ?? count(r.items_processed) ?? 0
  const processed = count(r.items_processed) ?? itemsOut
  return {
    success: true, repeat: !dryRun && (r.has_more === true || (drain && processed > 0)),
    delaySeconds: Math.max(1, Math.min(300, count(r.retry_after_seconds) ?? 1)),
    itemsOut, processed, succeeded: count(r.items_succeeded) ?? itemsOut, failed: count(r.items_failed) ?? 0,
  }
}
