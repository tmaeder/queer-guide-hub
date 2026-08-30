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
import { CF_MODEL_DEFAULT, mapToCfModel } from './cf-model-map.ts'
import { recordLlmUsage } from './llm-usage-log.ts'
import { tryNvidia } from './llm-router.ts'

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
  // Retry transient upstream failures (5xx / 429 / network errors) this many
  // times. Default 0 to preserve tight-latency batch callers. CF Workers AI +
  // AI Gateway intermittently return HTML 5xx error pages; one retry recovers
  // them. Timeouts (AbortError) are never retried — they only compound latency.
  retries?: number
  /** Edge function name, for llm_call_log attribution. */
  callerFn?: string
  /** Optional grouping key for llm_call_log (pipeline run, entity id). */
  contextKey?: string | null
  /**
   * How long this call may wait for an NVIDIA rate-limit slot before falling
   * back to Cloudflare. Omit to use the router's policy (0 for interactive
   * callers, NVIDIA_MAX_WAIT_MS otherwise).
   */
  waitMs?: number
  /** Wall-clock deadline (epoch ms) past which the router never sleeps. */
  deadlineAt?: number
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
    // Cheap 8B by default (cost control — see openai-client CF_MODEL_DEFAULT note
    // + invoice IN-72568830). Callers needing the 70B pass model explicitly.
    defaultModel: Deno.env.get('CF_AI_MODEL') || '@cf/meta/llama-3.1-8b-instruct-fast',
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
  // Kill-switch — see chatCompletion() in openai-client.ts. AI_DISABLED=1 halts spend.
  if (Deno.env.get('AI_DISABLED') === '1') {
    throw new Error('AI_DISABLED: LLM inference halted via kill-switch')
  }
  // NVIDIA first — and deliberately BEFORE readConfig(), which throws
  // LlmNotConfiguredError when Cloudflare credentials are absent. Doing it the
  // other way round would make an NVIDIA-only deployment impossible: the client
  // would throw on the way to a provider that was configured and working.
  //
  // The model name is resolved here too, without readConfig(), for the same
  // reason. CF_AI_MODEL is honoured so an operator who pinned the fleet to a
  // bigger Cloudflare model still gets the matching NVIDIA tier — the mapping
  // is by tier, and cf-model-map's strong ids are what carry that signal.
  const intendedModel =
    options.model ?? Deno.env.get('CF_AI_MODEL') ?? CF_MODEL_DEFAULT
  const nv = await tryNvidia(
    {
      messages: options.messages,
      model: intendedModel,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.max_tokens ?? 2000,
    },
    {
      callerFn: options.callerFn ?? 'llmChatCompletion',
      waitMs: options.waitMs,
      deadlineAt: options.deadlineAt,
    },
  )
  if (nv.served) {
    recordLlmUsage({
      fn: options.callerFn ?? 'llmChatCompletion',
      model: nv.model,
      tokensIn: nv.usage?.prompt_tokens,
      tokensOut: nv.usage?.completion_tokens,
      contextKey: options.contextKey ?? null,
      provider: 'nvidia',
    })
    return { content: nv.content, usage: nv.usage, model: nv.model }
  }

  const { baseUrl, apiKey, defaultModel, gatewayed } = readConfig()
  const {
    messages,
    model = defaultModel,
    temperature = 0.3,
    max_tokens = 2000,
    timeoutMs = 60_000,
    retries = 0,
  } = options

  // NB: `response_format` is intentionally NOT forwarded. The sole backend is
  // CF Workers AI (/ai/v1), and json_object guided generation hangs that
  // endpoint (mirrors the same guard in openai-client.ts). Callers must request
  // JSON via the prompt and parse defensively.
  // Map the caller's name to a real Workers AI id. This endpoint is
  // OpenAI-compat but it is still Workers AI: a `claude-*` string reaches
  // Cloudflare as a model id that does not exist. openai-client.ts mapped;
  // this client did not, and the Anthropic shim runs through THIS one — so
  // forwarding the shim's model without this line sends `claude-haiku-4-5`
  // straight to Cloudflare.
  const cfModel = mapToCfModel(model)
  const body: Record<string, unknown> = { model: cfModel, messages, temperature, max_tokens }

  // CF Workers AI / AI Gateway occasionally return a transient HTML 5xx error
  // page (or drop the connection) on an otherwise-valid request. Retry those a
  // bounded number of times with linear backoff; a single retry recovers the
  // overwhelming majority. Non-retryable client errors (4xx) and our own
  // timeout (AbortError) break out immediately.
  const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
  let lastErr: unknown

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let retryable: boolean

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

      if (response.ok) {
        const data = await response.json()
        // CF Workers AI sometimes returns message.content already parsed (object)
        // for JSON-shaped outputs. The contract here is `content: string`, so
        // stringify anything non-string — callers that want JSON re-parse it.
        const rawContent = data.choices?.[0]?.message?.content ?? ''
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent)
        // Spend telemetry. Fire-and-forget and never throws — see
        // llm-usage-log.ts. `callerFn` is the only thing the caller has to
        // supply for the row to be attributable; without it the spend is
        // recorded but not blamed on anyone, which is still better than the
        // zero rows this table had before.
        recordLlmUsage({
          fn: options.callerFn ?? 'llmChatCompletion',
          model: data.model ?? cfModel,
          tokensIn: data.usage?.prompt_tokens,
          tokensOut: data.usage?.completion_tokens,
          contextKey: options.contextKey ?? null,
          // Was omitted when the provider column landed, so every fallback
          // through THIS client logged provider NULL while the NVIDIA branch
          // above and both branches in openai-client.ts set theirs. Found on
          // prod: translate-i18n-batch rows carried a `@cf/` model and a null
          // provider, which is self-contradictory. A null here is worse than
          // cosmetic — it is indistinguishable from "written before the column
          // existed", so the provider split that this column exists to report
          // silently under-counts Cloudflare.
          provider: 'cloudflare',
        })

        return {
          content,
          usage: data.usage,
          model: data.model ?? cfModel,
        }
      }

      const errText = await response.text().catch(() => '<no body>')
      lastErr = new LlmRequestError(response.status, errText)
      retryable = RETRYABLE_STATUS.has(response.status)
    } catch (e) {
      // Our own timeout fired — retrying would only compound latency. Surface it.
      if ((e as Error)?.name === 'AbortError') throw e
      // Network-level failure (connection reset, DNS, TLS) — transient, retry.
      lastErr = e
      retryable = true
    } finally {
      clearTimeout(timer)
    }

    if (!retryable || attempt >= retries) break
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
  }

  throw lastErr ?? new LlmRequestError(0, 'LLM request failed')
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
  /**
   * Edge function name. Forwarded, and it has to be: this helper dropped it
   * until 2026-08-29, so all eleven shim callers — every trip flow,
   * generate-usernames, translate-i18n-batch — logged their spend under the
   * anonymous fallback `'llmChatCompletion'`. That is the exact state
   * llm-caller-attribution.test.ts exists to prevent, and the guard could not
   * see it because its regex looks for `llmChatCompletion(` / `chatCompletion(`
   * and these files call `anthropicMessages(`.
   *
   * It is also load-bearing for pacing: the router decides whether a caller may
   * wait for a rate slot by name, and an unnamed caller is indistinguishable
   * from a batch job.
   */
  callerFn?: string
  contextKey?: string | null
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
    callerFn: input.callerFn,
    contextKey: input.contextKey,
  })
}
