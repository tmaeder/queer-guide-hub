import type { AiProvider, AiCheckResult } from '../types'
import { SYSTEM_PROMPT, buildUserPrompt, parseFindings } from '../prompt'

// Anthropic Messages API, called DIRECTLY from the browser.
// No backend exists (standalone read-only tool), so the operator pastes their
// own Anthropic key; it lives only in this browser's localStorage. The
// `anthropic-dangerous-direct-browser-access` header is what unlocks CORS for
// a browser origin — required for any client-side call to api.anthropic.com.
const ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

export const claudeProvider: AiProvider = {
  id: 'claude',
  label: 'Claude (Anthropic)',
  defaultModel: 'claude-opus-4-8',
  keyPlaceholder: 'sk-ant-…',
  keyHint: 'Key: console.anthropic.com → API Keys',

  async check(person, { apiKey, model, signal }): Promise<AiCheckResult> {
    const useModel = model || this.defaultModel
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(person) }],
      }),
    })

    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = j?.error?.message ? ` — ${j.error.message}` : ''
      } catch { /* body not JSON */ }
      throw new Error(`Anthropic ${res.status}${detail}`)
    }

    const data = await res.json()
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b: { type?: string }) => b?.type === 'text')
          .map((b: { text?: string }) => b.text ?? '')
          .join('\n')
          .trim()
      : ''
    if (!text) throw new Error('Anthropic: leere Antwort.')

    const { findings, summary, raw } = parseFindings(text, useModel)
    return { findings, summary, model: data?.model ?? useModel, raw }
  },
}
