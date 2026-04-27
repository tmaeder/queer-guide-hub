/**
 * LLM client — OpenAI-compatible endpoint.
 *
 * Backend resolution (first match wins):
 *   1. Cloudflare Workers AI — set `CF_ACCOUNT_ID` + `CF_AI_API_TOKEN`.
 *      Default model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (override
 *      with `CF_AI_MODEL`). Endpoint:
 *      `https://api.cloudflare.com/client/v4/accounts/{ACCT}/ai/v1`
 *   2. Self-hosted Gemma — set `QG_LLM_BASE_URL` + `QG_LLM_API_KEY`
 *      (vLLM at ai.queer.guide; legacy/fallback).
 *
 * Both backends speak the OpenAI chat-completions wire format, so callers
 * stay identical. Set both and CF wins.
 */

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
    super('Self-hosted LLM not configured. Set QG_LLM_BASE_URL + QG_LLM_API_KEY.')
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
  const cfAcct = Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cfToken = Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (cfAcct && cfToken) {
    return {
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${cfAcct}/ai/v1`,
      apiKey: cfToken,
      defaultModel: Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    }
  }
  const baseUrl = Deno.env.get('QG_LLM_BASE_URL')
  const apiKey = Deno.env.get('QG_LLM_API_KEY')
  if (!baseUrl || !apiKey) throw new LlmNotConfiguredError()
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    defaultModel: Deno.env.get('QG_LLM_MODEL') || 'gemma-4-26b',
  }
}

export function isLlmConfigured(): boolean {
  return (
    Boolean(
      (Deno.env.get('CF_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID')) &&
      (Deno.env.get('CF_AI_API_TOKEN') || Deno.env.get('CLOUDFLARE_API_TOKEN'))
    ) ||
    Boolean(Deno.env.get('QG_LLM_BASE_URL') && Deno.env.get('QG_LLM_API_KEY'))
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
  const { baseUrl, apiKey, defaultModel } = readConfig()
  const {
    messages,
    model = defaultModel,
    temperature = 0.3,
    max_tokens = 2000,
    response_format,
    timeoutMs = 60_000,
  } = options

  const body: Record<string, unknown> = { model, messages, temperature, max_tokens }
  if (response_format) body.response_format = response_format

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '<no body>')
      throw new LlmRequestError(response.status, errText)
    }

    const data = await response.json()
    return {
      content: data.choices?.[0]?.message?.content ?? '',
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
