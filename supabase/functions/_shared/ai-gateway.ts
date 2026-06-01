/**
 * Cloudflare AI Gateway URL helpers.
 *
 * When `AI_GATEWAY_NAME` (+ a CF account id) is set, edge-function model traffic
 * is routed through the gateway for caching, rate-limiting, retries, and
 * cost/latency observability behind a single egress point — matching the four
 * Workers (assistant, submit, ingest, search-proxy) that already use it.
 *
 * Falls back to the provider's direct endpoint when unset, so importing this is
 * a no-op until the gateway is configured. Set `AI_GATEWAY_TOKEN` for an
 * authenticated gateway.
 */

export type AiProvider = 'openai' | 'workers-ai'

function account(): string | undefined {
  return Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || undefined
}

export function aiGatewayName(): string | undefined {
  return Deno.env.get('AI_GATEWAY_NAME') || undefined
}

/**
 * Base URL for an OpenAI-compatible provider behind the gateway, or null when
 * the gateway is not configured. Append `/chat/completions` to the result.
 */
export function gatewayBaseUrl(provider: AiProvider): string | null {
  const gw = aiGatewayName()
  const acct = account()
  if (!gw || !acct) return null
  const root = `https://gateway.ai.cloudflare.com/v1/${acct}/${gw}`
  return provider === 'openai' ? `${root}/openai` : `${root}/workers-ai/v1`
}

/**
 * Extra request headers for the gateway: authenticated-gateway token plus
 * optional metadata for log filtering. Empty when the gateway is not configured.
 */
export function gatewayHeaders(meta?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {}
  if (!aiGatewayName()) return h
  const token = Deno.env.get('AI_GATEWAY_TOKEN')
  if (token) h['cf-aig-authorization'] = `Bearer ${token}`
  if (meta && Object.keys(meta).length) h['cf-aig-metadata'] = JSON.stringify(meta)
  return h
}
