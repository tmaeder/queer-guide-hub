/**
 * LLM client — OpenAI-compatible endpoint.
 *
 * Backend: Cloudflare Workers AI — set `CF_ACCOUNT_ID` + `CF_AI_API_TOKEN`.
 *   Default model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (override with
 *   `CF_AI_MODEL`). Endpoint:
 *   `https://api.cloudflare.com/client/v4/accounts/{ACCT}/ai/v1`
 *
 * (The self-hosted EU vLLM fallback at ai.queer.guide was retired with the
 *  Infomaniak VPS — Cloudflare Workers AI is now the sole backend.)
 *
 * When `AI_GATEWAY_NAME` is set, the Cloudflare Workers AI path is routed
 * through AI Gateway. The self-hosted vLLM path stays direct (it is already an
 * EU-resident endpoint; gatewaying it is a deliberate, residency-aware step).
 */

import { gatewayBaseUrl, gatewayHeaders } from './ai-gateway.ts'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmCompletionOptions {
  messages: LlmMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' | 'text' }
  // Abort after this many milliseconds. Trip flows should pass a generous
  // value (e.g. 60_000); batch callers a tight one (e.g. 15_000).
  timeoutMs?: number
}

export interface LlmCompletionResult {
  content: string
  model: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('Cloudflare Workers AI not configured. Set CF_ACCOUNT_ID + CF_AI_API_TOKEN.')
    this.name = 'LlmNotConfiguredError'
  }
}

export class LlmRequestError extends Error {
  constructor(public status: number, public body: string) {
    super(`LLM request failed (${status}): ${body.slice(0, 500)}`)
    this.name = 'LlmRequestError'
  }
}

function readConfig() {
  // Cloudflare Workers AI is the sole inference backend (the self-hosted EU vLLM
  // fallback at ai.queer.guide was retired when the Infomaniak VPS was
  // decommissioned). Routed through AI Gateway when AI_GATEWAY_NAME is set.
  const cfAcct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!cfAcct || !cfToken) throw new LlmNotConfiguredError()
  return {
    baseUrl:
      gatewayBaseUrl('workers-ai') ??
      `https://api.cloudflare.com/client/v4/accounts/${cfAcct}/ai/v1`,
    apiKey: cfToken,
    defaultModel: Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    gatewayed: true,
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(
    (Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')) &&
    (Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN'))
  )
}

/**
 * OpenAI-compatible chat completion against the self-hosted vLLM endpoint.
 * Shape mirrors `chatCompletion()` in openai-client.ts so callsites can be
 * swapped with a single import change behind a feature flag.
 */
export async function llmChatCompletion(
  options: LlmCompletionOptions,
): Promise<LlmCompletionResult> {
  const { baseUrl, apiKey, defaultModel, gatewayed } = readConfig()
  const {
    messages,
    model = defaultModel,
    temperature = 0.3,
    max_tokens = 2000,
    timeoutMs = 60_000,
  } = options

  // NB: `response_format` is intentionally NOT forwarded. The sole backend is
  // CF Workers AI (/ai/v1), and json_object guided generation hangs that
  // endpoint (mirrors the same guard in openai-client.ts). Callers must request
  // JSON via the prompt and parse defensively.
  const body: Record<string, unknown> = { model, messages, temperature, max_tokens }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(gatewayed ? gatewayHeaders({ fn: 'llmChatCompletion', backend: 'workers-ai' }) : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '<no body>')
      throw new LlmRequestError(response.status, errText)
    }

    const data = await response.json()
    // CF Workers AI sometimes returns message.content already parsed (object)
    // for JSON-shaped outputs. The contract here is `content: string`, so
    // stringify anything non-string — callers that want JSON re-parse it.
    const rawContent = data.choices?.[0]?.message?.content ?? ''
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
    return {
      content,
      usage: data.usage,
      model: data.model ?? model,
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Anthropic-shaped wrapper. Trip-flow callsites currently pass an Anthropic
 * `messages.create` payload (system + messages). This helper adapts that shape
 * onto the OpenAI-compat endpoint so migration is a thin import swap.
 */
export async function llmAnthropicStyle(input: {
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  max_tokens?: number
  temperature?: number
  model?: string
  timeoutMs?: number
}): Promise<LlmCompletionResult> {
  const messages: LlmMessage[] = []
  if (input.system) messages.push({ role: 'system', content: input.system })
  messages.push(...input.messages)

  return llmChatCompletion({
    messages,
    model: input.model,
    temperature: input.temperature,
    max_tokens: input.max_tokens,
    timeoutMs: input.timeoutMs,
  })
}
