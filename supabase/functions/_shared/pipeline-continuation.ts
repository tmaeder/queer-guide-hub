/** Opt-in continuation contract. A source may not claim completion before its last page. */
export function continuationResult(result: Record<string, unknown>, previous: unknown) {
  if (result.success === false || Number(result.items_failed ?? 0) > 0) throw new Error(String(result.error ?? 'Resumable node reported failure'))
  const items = Number(result.items_processed ?? result.items ?? 0)
  if (!Number.isSafeInteger(items) || items < 0) throw new Error('Invalid resumable item count')
  const more = result.has_more === true
  const cursor = result.cursor ?? null
  if (more) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) throw new Error('Continuation requires an object cursor')
    const encoded = JSON.stringify(cursor)
    if (encoded.length > 65_536) throw new Error('Continuation cursor exceeds size limit')
    if (encoded === JSON.stringify(previous)) throw new Error('Continuation cursor did not advance')
  }
  return { items, more, cursor }
}
export function resumableTimeout(config: Record<string, unknown>): number {
  const requested = Number(config.timeout_seconds)
  return Math.max(1, Math.min(Number.isFinite(requested) && requested > 0 ? requested : 90, 120)) * 1000
}
