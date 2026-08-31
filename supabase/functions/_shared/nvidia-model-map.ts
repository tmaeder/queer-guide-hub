/**
 * NVIDIA NIM model ids, and the map from a caller-supplied name.
 *
 * Sibling of cf-model-map.ts, and deliberately the same shape: callers name a
 * model in whatever vocabulary their call site grew up with (`gpt-4o-mini`, a
 * `claude-*` name via the Anthropic shim, or an explicit `@cf/...` id), and the
 * map resolves it BY TIER. Same rule as Cloudflare: tier, never vendor.
 *
 * Ids verified against https://integrate.api.nvidia.com/v1/models (83 models,
 * unauthenticated, read 2026-08-29). Note what is NOT there: plain
 * `meta/llama-3.1-8b-instruct` and `meta/llama-3.3-70b-instruct` — the obvious
 * one-to-one swaps for the two Cloudflare tiers — are absent from the
 * catalogue. Every blog post about this API names them. Do not reintroduce
 * them from memory; re-read the endpoint.
 *
 * Both tiers are env-overridable so a retirement is a secret change, not a
 * deploy.
 */

import { CF_MODEL_STRONG } from './cf-model-map.ts'

/**
 * Cheap/fast tier — the counterpart of `@cf/meta/llama-3.1-8b-instruct-fast`.
 * A 30B MoE with ~3B active parameters (the `a3b` suffix), which is the right
 * cost/latency class to stand in for an 8B dense model.
 */
export const NVIDIA_MODEL_DEFAULT = 'nvidia/nemotron-nano-3-30b-a3b'

/**
 * Strong tier — the counterpart of `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
 * ~12B active parameters, one rung above nano.
 */
export const NVIDIA_MODEL_STRONG = 'nvidia/nemotron-3-super-120b-a12b'

/**
 * Cloudflare ids that mean "strong tier".
 *
 * This set is why the map cannot just fall through to the default. Three
 * callers in ai-enrichment.ts (`researchEnrichEventFromPage`,
 * `researchEnrichCityFromSources`, `researchEnrichVillageFromSources`) pass the
 * 70B id LITERALLY rather than a `claude-*` name, because under mapToCfModel an
 * `@cf/` id is an explicit opt-in that passes through untouched. Resolving those
 * to NVIDIA's cheap tier would silently demote the only three callers that ever
 * deliberately asked for a big model — the mirror image of the invoice
 * IN-72568830 bug, and just as invisible, since the call still succeeds and
 * returns plausible JSON.
 */
const CF_STRONG_IDS = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-70b-instruct-fp8-fast',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
])

/**
 * Cloudflare ids for tasks NVIDIA must not be handed at all.
 *
 * Vision and embedding calls take a different request shape and, for
 * embeddings, live in a fixed 1024-dim vector space that the whole search index
 * is built on. Neither belongs on this path. They are supposed to reach
 * Cloudflare through their own direct-fetch call sites and never touch the
 * router, but a future caller could route one here by accident, and silently
 * answering an embedding request with chat text is the kind of failure that
 * only shows up as bad search results weeks later.
 */
function isUnsupportedByNvidia(model: string): boolean {
  return /vision|embed|bge-|reranker|whisper|nemoguard/i.test(model)
}

/**
 * Map a caller-supplied model name to an NVIDIA NIM id, or null when NVIDIA
 * must not serve this request.
 *
 * A null is not a failure — it is the honest answer for a vision or embedding
 * model, and the router reads it as "skip NVIDIA, go to Cloudflare".
 */
export function mapToNvidiaModel(model: string): string | null {
  if (isUnsupportedByNvidia(model)) return null

  const strong = Deno.env.get('NVIDIA_MODEL_STRONG') || NVIDIA_MODEL_STRONG
  const dflt = Deno.env.get('NVIDIA_MODEL') || NVIDIA_MODEL_DEFAULT

  // An explicit Cloudflare strong-tier id, or the configured CF strong model.
  if (CF_STRONG_IDS.has(model)) return strong
  if (model === (Deno.env.get('CF_AI_MODEL_STRONG') || CF_MODEL_STRONG)) return strong

  // Anthropic names, mapped by tier exactly as mapToCfModel does. `claude-haiku`
  // IS the cheap tier and ten of the eleven shim callers pass it; treating every
  // `claude-` name as a request for the big model is the documented way to
  // promote all ten by accident.
  if (/^claude-(sonnet|opus)/.test(model)) return strong

  // Any other Cloudflare id is a cheap-tier opt-in.
  if (model.startsWith('@cf/')) return dflt

  // Already an NVIDIA-style `vendor/model` id — an explicit opt-in, passed
  // through. Checked after the `@cf/` arm so a Cloudflare id (which also
  // contains a slash) can never reach this branch.
  if (model.includes('/')) return model

  return dflt
}
