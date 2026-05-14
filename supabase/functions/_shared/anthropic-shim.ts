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

  const result = await llmAnthropicStyle({
    system: input.system,
    messages: input.messages,
    max_tokens: input.max_tokens,
    temperature: input.temperature,
    timeoutMs: input.timeoutMs,
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
