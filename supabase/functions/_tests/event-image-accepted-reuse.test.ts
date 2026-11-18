import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { sameAcceptedReuseEvidence } from '../event-image-quality/accepted-reuse.ts'

const evidence = { url: 'https://example.org/poster.jpg', content_hash: 'a'.repeat(64), event_count: 1054 }

Deno.test('accepted reuse survives population growth and decline for the same image', () => {
  for (const count of [10, 477, 1053, 1054, 2000]) {
    assertEquals(sameAcceptedReuseEvidence(evidence, { ...evidence, event_count: count }), true)
  }
})

Deno.test('different image URL or bytes remain reviewable', () => {
  assertEquals(sameAcceptedReuseEvidence(evidence, { ...evidence, url: 'https://example.org/new.jpg' }), false)
  assertEquals(sameAcceptedReuseEvidence(evidence, { ...evidence, content_hash: 'b'.repeat(64) }), false)
})

Deno.test('new material evidence and malformed evidence fail closed', () => {
  for (const change of [{ image_role: 'event_artwork' }, { event_count: null }, { event_count: 9 },
    { event_count: 10.5 }, { event_count: Number.POSITIVE_INFINITY }, { content_hash: '' }, { url: 'http://example.org/poster.jpg' }]) {
    assertEquals(sameAcceptedReuseEvidence(evidence, { ...evidence, ...change }), false)
    assertEquals(sameAcceptedReuseEvidence({ ...evidence, ...change }, evidence), false)
  }
  assertEquals(sameAcceptedReuseEvidence({}, evidence), false)
  for (const malformed of [null, undefined, [], 'accepted', 1054]) {
    assertEquals(sameAcceptedReuseEvidence(malformed, evidence), false)
    assertEquals(sameAcceptedReuseEvidence(evidence, malformed), false)
  }
})
