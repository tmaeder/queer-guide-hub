/**
 * Best-effort PII redaction for text sent to external model providers.
 *
 * Strips emails, phone numbers, and long digit runs. Intended for prompts in
 * user-identifiable flows (trip concierge, free-text submissions, cms-ai). Do
 * NOT apply to public-catalog enrichment where the content itself is the
 * payload (venue/event/news text) — redaction would degrade output.
 */

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
// +41 79 123 45 67, (079) 123-4567, 0791234567 …
const PHONE = /\+?\d[\d ().-]{7,}\d/g

export function redactPII(text: string): string {
  if (!text) return text
  return text.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
}

export function redactMessages<T extends { content: string }>(messages: T[]): T[] {
  return messages.map((m) => ({ ...m, content: redactPII(m.content) }))
}
