// Unit tests for PII redaction helpers.
// Run with: cd supabase/functions && deno test _shared/pii-redact.test.ts
import { assertEquals } from 'jsr:@std/assert'
import { redactPII, redactMessages } from './pii-redact.ts'

Deno.test('redacts email addresses', () => {
  assertEquals(redactPII('contact me at jo.user+tag@example.co.uk please'),
    'contact me at [email] please')
})

Deno.test('redacts phone numbers (intl + grouped)', () => {
  assertEquals(redactPII('call +41 79 123 45 67 now'), 'call [phone] now')
  assertEquals(redactPII('ring (079) 123-4567'), 'ring [phone]')
})

Deno.test('leaves non-PII text untouched', () => {
  const s = 'Gay bars in Zurich open after 22:00'
  assertEquals(redactPII(s), s)
})

Deno.test('handles empty / falsy input', () => {
  assertEquals(redactPII(''), '')
})

Deno.test('redactMessages maps content and preserves role + extra fields', () => {
  const out = redactMessages([
    { role: 'user', content: 'mail me a@b.com', extra: 1 } as { role: string; content: string; extra: number },
  ])
  assertEquals(out[0].content, 'mail me [email]')
  assertEquals(out[0].role, 'user')
  assertEquals((out[0] as { extra: number }).extra, 1)
})
