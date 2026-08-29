/**
 * Records every LLM call into `llm_call_log` so spend is observable.
 *
 * The table has existed with cost_usd / tokens_in / tokens_out columns and had
 * ZERO rows — nothing ever wrote it. Workers AI spend was therefore visible
 * only in the Cloudflare dashboard, which is how a $765 bill (invoice
 * IN-72568830) and a 17-day dead safety pipeline both went unnoticed from
 * inside the system.
 *
 * THREE RULES, all of them about not making things worse:
 *
 * 1. NEVER THROW. Telemetry that can break inference is a liability. Every
 *    path is wrapped; a logging failure is swallowed after one console.warn.
 *    An LLM call must not fail because we could not describe it.
 *
 * 2. NEVER BLOCK. The insert is fire-and-forget. Awaiting a DB round-trip on
 *    every completion would add latency to user-facing trip flows for the sake
 *    of a metric.
 *
 * 3. NEVER INVENT A COST. Unknown model ⇒ cost_usd NULL, tokens still stored.
 *    See the null contract in llm-cost.ts.
 */

import { estimateCostUsd } from './llm-cost.ts'

export interface LlmUsageRecord {
  /** Edge function name — `function` column. Required by the schema. */
  fn: string
  model: string | null | undefined
  tokensIn: number | null | undefined
  tokensOut: number | null | undefined
  /** Optional grouping key (pipeline run, entity id, caller slug). */
  contextKey?: string | null
  userId?: string | null
  /**
   * Which backend served the call: 'cloudflare' | 'nvidia' | 'openai'.
   *
   * NVIDIA is not one of AI Gateway's supported providers, so for that provider
   * this column is the ONLY record anywhere that the call happened — the
   * Cloudflare dashboard cannot see it and neither can the gateway. It is also
   * what makes rule 3 below survivable: an NVIDIA row has a NULL cost because
   * llm-cost.ts prices only `@cf/` models, and without a provider it would be
   * indistinguishable from a Cloudflare call whose model we failed to price.
   */
  provider?: string | null
}

/** Set false in tests to make the write synchronous and assertable. */
let fireAndForget = true

/** Test seam. Returns the previous value so a test can restore it. */
export function setLlmUsageFireAndForget(v: boolean): boolean {
  const prev = fireAndForget
  fireAndForget = v
  return prev
}

async function insert(rec: LlmUsageRecord): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  // No service credentials (local dev, unit tests) — nothing to do, and
  // certainly nothing to fail over.
  if (!url || !key) return

  const cost = estimateCostUsd(rec.model, rec.tokensIn, rec.tokensOut)

  // PostgREST directly rather than the supabase-js client: this module is
  // imported by llm-client.ts, which is imported by nearly every edge function.
  // Pulling the client SDK in here would add it to every cold start for one
  // INSERT.
  const res = await fetch(`${url}/rest/v1/llm_call_log`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      function: rec.fn,
      model: rec.model ?? null,
      tokens_in: rec.tokensIn ?? null,
      tokens_out: rec.tokensOut ?? null,
      cost_usd: cost,
      context_key: rec.contextKey ?? null,
      user_id: rec.userId ?? null,
      provider: rec.provider ?? null,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn(`llm_call_log insert failed (${res.status}): ${body.slice(0, 200)}`)
  }
}

/**
 * Record one call. Safe to call from any success path.
 *
 * Returns a promise ONLY so tests can await it; production callers ignore it.
 */
export function recordLlmUsage(rec: LlmUsageRecord): Promise<void> {
  const run = insert(rec).catch((e) => {
    console.warn(`llm_call_log insert threw: ${e instanceof Error ? e.message : String(e)}`)
  })
  // Fire-and-forget in production: returning an unawaited promise is the point.
  return fireAndForget ? Promise.resolve() : run
}
