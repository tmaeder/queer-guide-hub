/**
 * Cloudflare Workers AI model ids, and the map from a caller-supplied name.
 *
 * Extracted from openai-client.ts because there are TWO clients that talk to
 * Workers AI — openai-client.ts (native /ai/run) and llm-client.ts
 * (OpenAI-compat /ai/v1) — and only the first one mapped the model. The shim
 * path (anthropicMessages → llmAnthropicStyle → llmChatCompletion) runs through
 * the SECOND, so a `claude-*` name forwarded there went straight to Cloudflare
 * as a model id that does not exist. Both clients now share this one map, which
 * is the only way they cannot drift again.
 */

// 70B is reserved for callers that OPT IN. A one-off $765 Workers-AI bill
// (invoice IN-72568830, Jul 2026) traced back to everything silently
// defaulting to the 70B.
export const CF_MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct-fast'
export const CF_MODEL_STRONG = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

/**
 * Map a caller-supplied model name to a Cloudflare Workers AI id.
 *
 * Callers pass one of three things:
 *   - a `@cf/...` id           → passed through untouched (explicit opt-in)
 *   - an Anthropic name        → mapped BY TIER, not by vendor
 *   - anything else (legacy)   → the cheap default
 *
 * The tier distinction is load-bearing: `claude-haiku` IS Anthropic's cheap
 * tier, and ten of the eleven shim callers pass haiku. Treating every
 * `claude-` name as a request for the 70B would promote all ten to the
 * expensive model — the pattern behind the invoice cited above.
 */
export function mapToCfModel(model: string): string {
  if (model.startsWith('@cf/')) return model
  if (/^claude-(sonnet|opus)/.test(model)) {
    return Deno.env.get('CF_AI_MODEL_STRONG') || CF_MODEL_STRONG
  }
  return Deno.env.get('CF_AI_MODEL') || CF_MODEL_DEFAULT
}
