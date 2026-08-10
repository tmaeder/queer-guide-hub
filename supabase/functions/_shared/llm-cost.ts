/**
 * Workers AI unit prices, and cost estimation from token counts.
 *
 * Prices are USD per MILLION tokens, transcribed from
 * https://developers.cloudflare.com/workers-ai/platform/pricing/ (read
 * 2026-08-10). They are a snapshot of a page Cloudflare edits — see the
 * `null` contract below for how that is handled honestly.
 *
 * THE NULL CONTRACT. estimateCostUsd returns null for a model it has no price
 * for, and the caller stores that null. It does NOT fall back to a "close
 * enough" price or to zero.
 *
 * That matters because a fabricated zero is indistinguishable from "this model
 * is free" and silently under-reports spend — which is the precise shape of the
 * problem this logging exists to fix. A null with the token counts still
 * recorded is fully recoverable: the price can be backfilled later with one
 * UPDATE. A zero cannot be told apart from a real one.
 *
 * The 2026-05-30 deprecations are deliberately still listed. A retired model
 * should never be called, but if one is, its cost must still be attributable
 * rather than silently null.
 */

interface Price {
  /** USD per million input tokens. */
  in: number
  /** USD per million output tokens. */
  out: number
}

const PRICES: Record<string, Price> = {
  // Active
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { in: 0.293, out: 2.253 },
  '@cf/meta/llama-3.1-70b-instruct-fp8-fast': { in: 0.293, out: 2.253 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { in: 0.045, out: 0.384 },
  '@cf/meta/llama-3.1-8b-instruct-fp8': { in: 0.152, out: 0.287 },
  '@cf/meta/llama-3.2-1b-instruct': { in: 0.027, out: 0.201 },
  '@cf/meta/llama-3.2-3b-instruct': { in: 0.051, out: 0.335 },
  '@cf/meta/llama-3.2-11b-vision-instruct': { in: 0.049, out: 0.676 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { in: 0.351, out: 0.555 },
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b': { in: 0.497, out: 4.881 },

  // Retired 2026-05-30. Kept so a stray call is still costed, not hidden.
  '@cf/meta/llama-3.1-8b-instruct': { in: 0.282, out: 0.827 },
  '@cf/meta/llama-3.1-8b-instruct-awq': { in: 0.12, out: 0.27 },
  '@cf/mistral/mistral-7b-instruct-v0.1': { in: 0.11, out: 0.19 },
}

/**
 * `@cf/meta/llama-3.1-8b-instruct-fast` — the fleet default — is NOT on the
 * pricing page under that exact id; the page lists `-fp8-fast`. Cloudflare's
 * deprecation notice lists `-fast` as an active variant, and it demonstrably
 * works (pipeline-safety-relevance scored 19 submissions on it with 0 errors
 * on 2026-08-10), so the id is real. Its price is simply not published under
 * that name.
 *
 * Rather than guess, it resolves to the `-fp8-fast` price and is flagged as an
 * ASSUMPTION here so the number can be corrected in one place if Cloudflare
 * publishes it separately. This is the one place a price is inferred, and it is
 * inferred between two variants of the same 8B model rather than across tiers.
 */
const ASSUMED_ALIASES: Record<string, string> = {
  '@cf/meta/llama-3.1-8b-instruct-fast': '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
}

export function priceFor(model: string): Price | null {
  return PRICES[model] ?? PRICES[ASSUMED_ALIASES[model] ?? ''] ?? null
}

/**
 * USD cost of a call, or null when the model has no known price.
 *
 * Null is a real answer here, not a failure — see the null contract above.
 */
export function estimateCostUsd(
  model: string | null | undefined,
  tokensIn: number | null | undefined,
  tokensOut: number | null | undefined,
): number | null {
  if (!model) return null
  const p = priceFor(model)
  if (!p) return null
  const tin = Number(tokensIn ?? 0)
  const tout = Number(tokensOut ?? 0)
  if (!Number.isFinite(tin) || !Number.isFinite(tout)) return null
  const cost = (tin / 1e6) * p.in + (tout / 1e6) * p.out
  // 6dp: a single cheap 8B call costs ~$0.00002, so fewer decimals would round
  // the common case to zero and re-create the "everything is free" illusion.
  return Math.round(cost * 1e6) / 1e6
}
