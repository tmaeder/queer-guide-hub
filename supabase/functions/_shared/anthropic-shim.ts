/**
 * Anthropic-shaped wrapper that routes to Cloudflare Workers AI
 * (OpenAI-compat endpoint) via llm-client.
 *
 * Accepts the same input shape callers were passing to
 * https://api.anthropic.com/v1/messages and returns Anthropic-shape
 * output `{ content: [{ type: 'text', text }], model, usage }` so the
 * downstream `body?.content?.[0]?.text` parse keeps working unchanged.
 *
 * Set USE_ANTHROPIC=1 to bypass the shim and hit the real Anthropic
 * API (requires ANTHROPIC_API_KEY).
 */

import { llmAnthropicStyle } from './llm-client.ts'

export interface AnthropicMessagesInput {
  model: string
  max_tokens: number
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  timeoutMs?: number
  /**
   * Edge function name, for llm_call_log attribution AND for the provider
   * router's pacing decision. Optional only so this stays source-compatible;
   * every caller should pass it — without it the spend lands under the
   * anonymous `'llmChatCompletion'` fallback, which is how the entire trip
   * surface was unattributable until 2026-08-29.
   */
  callerFn?: string
  contextKey?: string | null
}

export interface AnthropicMessagesOutput {
  content: Array<{ type: 'text'; text: string }>
  model: string
  usage?: { input_tokens?: number; output_tokens?: number }
  stop_reason?: string
}

export async function anthropicMessages(
  input: AnthropicMessagesInput,
): Promise<AnthropicMessagesOutput> {
  if (Deno.env.get('USE_ANTHROPIC') === '1') {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(input),
    })
    if (!resp.ok) {
      throw new Error(`anthropic ${resp.status}: ${await resp.text()}`)
    }
    return await resp.json()
  }

  // Forward the model. It was silently dropped here, so mapToCfModel() never saw
  // the caller's choice and every shim call got the fleet default regardless of
  // what it asked for — `translate-i18n-batch` requested claude-sonnet-4-6 for
  // translation quality and ran on the 8B for its whole life.
  //
  // The name is NOT sent to Workers AI as-is (there is no `claude-*` model
  // there); mapToCfModel translates it to a CF id by tier. That mapping had to
  // be made tier-aware in the same change — it treated every `claude-` name as
  // a request for the 70B, so forwarding without fixing it would have promoted
  // the ten haiku callers to the expensive model.
  const result = await llmAnthropicStyle({
    system: input.system,
    messages: input.messages,
    max_tokens: input.max_tokens,
    temperature: input.temperature,
    timeoutMs: input.timeoutMs,
    model: input.model,
    callerFn: input.callerFn,
    contextKey: input.contextKey,
  })

  return {
    content: [{ type: 'text', text: result.content }],
    model: result.model,
    usage: result.usage
      ? {
          input_tokens: result.usage.prompt_tokens,
          output_tokens: result.usage.completion_tokens,
        }
      : undefined,
  }
}
