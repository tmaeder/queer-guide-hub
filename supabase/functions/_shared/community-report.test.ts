import { assertEquals } from 'jsr:@std/assert'
import { validateCommunityReportBody } from './community-report.ts'

function jpegBase64(): string {
  const bytes = new Uint8Array(120)
  bytes.set([0xff, 0xd8, 0xff])
  return btoa(String.fromCharCode(...bytes))
}

Deno.test('accepts safety feedback and a valid automatically captured screenshot', () => {
  const result = validateCommunityReportBody({
    kind: 'feedback',
    payload: {
      category: 'safety',
      title: 'Dangerous listing',
      description: 'This listing needs moderation.',
      contact_email: 'reader@example.com',
    },
    context: {
      url: 'https://queer.guide/venues/example',
      viewport: { width: 390, height: 844 },
      errors: Array.from({ length: 25 }, (_, i) => ({ message: `error-${i}` })),
      network_failures: Array.from({ length: 15 }, (_, i) => ({ url: `/failed-${i}` })),
    },
    screenshot: { contentType: 'image/jpeg', base64: jpegBase64() },
  })

  assertEquals(result.ok, true)
  if (!result.ok) return
  assertEquals(result.value.kind, 'feedback')
  assertEquals(result.value.sourceUrl, 'https://queer.guide/venues/example')
  assertEquals(result.value.screenshot?.contentType, 'image/jpeg')
  assertEquals((result.value.data.context as { errors: unknown[] }).errors.length, 20)
  assertEquals(
    (result.value.data.context as { network_failures: unknown[] }).network_failures.length,
    10,
  )
})

Deno.test('rejects attempts to turn the endpoint into an anonymous entity writer', () => {
  const result = validateCommunityReportBody({
    kind: 'venue',
    payload: { title: 'Unreviewed venue' },
    context: {},
  })
  assertEquals(result, { ok: false, error: 'Report type must be feedback or correction' })
})

Deno.test('accepts a page correction with entity and diagnostic context', () => {
  const result = validateCommunityReportBody({
    kind: 'correction',
    payload: {
      title: 'Correction: Example Bar',
      description: 'The address is wrong.',
      proposed_correction: 'Use 12 New Street.',
      page_url: 'https://queer.guide/venues/example',
      entity: {
        content_type: 'venues',
        content_id: 'venue-1',
        content_name: 'Example Bar',
      },
    },
    context: { user_agent: 'test-browser' },
  })

  assertEquals(result.ok, true)
  if (!result.ok) return
  assertEquals(result.value.kind, 'correction')
  assertEquals(result.value.data.entity, {
    content_type: 'venues',
    content_id: 'venue-1',
    content_name: 'Example Bar',
  })
})

Deno.test('drops a malformed screenshot without dropping the textual report', () => {
  const result = validateCommunityReportBody({
    kind: 'feedback',
    payload: { category: 'bug', title: 'Broken map', description: 'The map is blank.' },
    context: { url: 'https://queer.guide/map' },
    screenshot: { contentType: 'image/jpeg', base64: btoa('not really a jpeg') },
  })

  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.value.screenshot, null)
})

Deno.test('silently discards honeypot submissions before any write', () => {
  const result = validateCommunityReportBody({ honeypot: 'spam.example', kind: 'feedback' })
  assertEquals(result.ok, true)
  if (result.ok) assertEquals(result.value.discard, true)
})
