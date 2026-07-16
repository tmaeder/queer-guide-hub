import type { AiProvider, AiCheckResult } from '../types'
import { SYSTEM_PROMPT, buildUserPrompt, parseFindings } from '../prompt'

// ChatGPT / OpenAI adapter — same contract as the Claude one, so the UI is
// unchanged. Direct browser call with the operator's own OpenAI key
// (localStorage only). `response_format: json_object` nudges pure-JSON output;
// parseFindings still guards defensively.
const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

export const openaiProvider: AiProvider = {
  id: 'openai',
  label: 'ChatGPT (OpenAI)',
  defaultModel: 'gpt-4o',
  keyPlaceholder: 'sk-…',
  keyHint: 'Key: platform.openai.com → API Keys',

  async check(person, { apiKey, model, signal }): Promise<AiCheckResult> {
    const useModel = model || this.defaultModel
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(person) },
        ],
      }),
    })

    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = j?.error?.message ? ` — ${j.error.message}` : ''
      } catch { /* body not JSON */ }
      throw new Error(`OpenAI ${res.status}${detail}`)
    }

    const data = await res.json()
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) throw new Error('OpenAI: leere Antwort.')

    const { findings, summary, raw } = parseFindings(text, useModel)
    return { findings, summary, model: data?.model ?? useModel, raw }
  },
}
