/**
 * Cross-instance rate limiting for a provider with a hard requests-per-minute
 * ceiling (NVIDIA's free tier is ~40 RPM for the whole account).
 *
 * WHY THIS IS IN THE DATABASE. Edge functions are stateless and horizontally
 * scaled, and several enrichment crons overlap in the 03:00-05:00 window. An
 * in-process counter would be per-isolate, so N concurrent isolates would each
 * happily allow the full 40. The account limit is global, so the counter has to
 * be too, and the only thing every isolate shares is Postgres.
 *
 * It is a LEAKY BUCKET, not a per-minute window. A fixed window permits 40 calls
 * in the last second of one minute and 40 more in the first second of the next
 * — 80 requests in ~2 seconds, which is exactly the burst the provider 429s.
 *
 * FAIL-OPEN, deliberately, matching llm-budget.ts. If the RPC is missing (the
 * function deployed ahead of its migration — the half-ship trap this repo has
 * hit repeatedly) or errors, callers get `false` and route to the fallback
 * provider. A limiter that cannot be read must never block inference; the worst
 * case of failing open here is that we pay Cloudflare, which is what we did
 * before this file existed.
 */

import { callRpc } from './pg-rpc.ts'

export interface SlotOptions {
  /**
   * How long the caller is willing to wait for a slot, in ms.
   *
   * 0 means "take a free slot if one exists right now, otherwise don't wait" —
   * which is what every interactive caller must pass. Pacing a user-facing chat
   * request behind a global bucket puts a queue in front of the user.
   *
   * Batch callers pass a small budget (NVIDIA_MAX_WAIT_MS, default 2000) so a
   * pool wave smooths out without the batch's total runtime depending on it.
   */
  waitMs?: number
  /**
   * Absolute wall-clock deadline (epoch ms) for the caller's whole invocation.
   * The limiter never sleeps past it.
   *
   * This is not padding. A 300-item batch paced at 32 RPM is 9.4 minutes
   * against the 546s edge-function wall, and enrichment-driver.ts records that a
   * slow sequential loop already 504'd away an entire batch once. Without a
   * deadline, pacing reproduces that failure by construction.
   */
  deadlineAt?: number
}

/** Slept-for accounting, so callers can log how much pacing actually cost. */
export interface SlotResult {
  granted: boolean
  waitedMs: number
  /** RPC missing or failed — treated as "no slot", caller falls back. */
  degraded: boolean
}

const SLEEP_FLOOR_MS = 25

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Try to take one request slot for `provider`.
 *
 * Retries while the caller's wait budget and deadline both allow it, sleeping
 * for whatever `retry_after_ms` the bucket reports (clamped to what is left).
 */
export async function acquireSlot(
  provider: string,
  opts: SlotOptions = {},
): Promise<SlotResult> {
  const waitMs = Math.max(0, opts.waitMs ?? 0)
  const startedAt = Date.now()

  for (;;) {
    const res = await callRpc<{ granted?: boolean; retry_after_ms?: number }>(
      'llm_rate_acquire',
      { p_provider: provider, p_n: 1 },
    )
    if (!res.ok || res.data == null) {
      console.warn(
        `[llm-rate] ${provider}: rpc unavailable (${res.error ?? 'null result'}) — treating as no slot`,
      )
      return { granted: false, waitedMs: Date.now() - startedAt, degraded: true }
    }
    const granted = res.data.granted === true
    const retryAfterMs =
      typeof res.data.retry_after_ms === 'number' ? res.data.retry_after_ms : 0

    if (granted) return { granted: true, waitedMs: Date.now() - startedAt, degraded: false }

    // How much longer may we wait? Bounded by BOTH the caller's budget and the
    // invocation deadline; whichever is tighter wins.
    const budgetLeft = waitMs - (Date.now() - startedAt)
    const deadlineLeft = opts.deadlineAt ? opts.deadlineAt - Date.now() : Infinity
    const allowance = Math.min(budgetLeft, deadlineLeft)

    // `retryAfterMs` can legitimately be 0 when the bucket is refilling
    // sub-millisecond; a floor keeps this from becoming a spin loop hammering
    // the RPC.
    const nap = Math.max(retryAfterMs, SLEEP_FLOOR_MS)
    if (nap > allowance) {
      return { granted: false, waitedMs: Date.now() - startedAt, degraded: false }
    }

    await sleep(nap)
  }
}
