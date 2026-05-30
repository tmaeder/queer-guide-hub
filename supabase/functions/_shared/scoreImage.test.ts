import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { isAcceptable, minScoreForRole, pickBest, scoreImage } from './scoreImage.ts'

// ── Hard rejects apply to every subject type ────────────────────────────────

Deno.test('bird photo is hard-rejected for a venue', () => {
  const s = scoreImage({
    alt: 'a colorful parrot bird on a branch',
    width: 1600, height: 1000, source: 'pexels',
    subject: { name: 'The Eagle' }, subjectType: 'venue',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
  assert(!isAcceptable(s, 'cover'))
})

Deno.test('stock watermark / agency tokens are hard-rejected', () => {
  for (const alt of ['gettyimages watermark', 'shutterstock stock photo', 'screenshot of a website']) {
    const s = scoreImage({ alt, width: 1600, height: 1000, source: 'pexels', subject: { name: 'Bar' }, subjectType: 'venue' })
    assertEquals(s, Number.NEGATIVE_INFINITY)
  }
})

// ── Generic venue/event scoring ─────────────────────────────────────────────

Deno.test('clean full-size landscape clears the cover bar for a venue', () => {
  const s = scoreImage({
    alt: 'people sitting at a cocktail bar in the evening',
    width: 1600, height: 1000, source: 'pexels',
    subject: { name: 'The Eagle', country: 'Berlin' }, subjectType: 'venue',
  })
  // baseline 25 + ratio 10 + width 5 = 40
  assertEquals(s, 40)
  assert(isAcceptable(s, 'cover'))
})

Deno.test('queer-relevant venue photo scores higher', () => {
  const s = scoreImage({
    alt: 'a drag performer on stage at a pride party',
    width: 1600, height: 1000, source: 'pexels',
    subject: { name: 'The Eagle' }, subjectType: 'venue',
  })
  // 25 + queer 15 + ratio 10 + width 5 = 55
  assertEquals(s, 55)
  assert(isAcceptable(s, 'cover'))
})

Deno.test('generic sky/sunset stock is rejected as a cover', () => {
  const s = scoreImage({
    alt: 'a beautiful sunset over the clouds',
    width: 1600, height: 1000, source: 'pexels',
    subject: { name: 'The Eagle' }, subjectType: 'venue',
  })
  // 25 - 25 (soft penalty) + 10 + 5 = 15
  assertEquals(s, 15)
  assert(!isAcceptable(s, 'cover'))
})

// ── Place scoring unchanged ─────────────────────────────────────────────────

Deno.test('city image naming the subject still scores by mention', () => {
  const s = scoreImage({
    alt: 'Berlin Christopher Street Day parade',
    width: 1600, height: 1000, source: 'wikimedia',
    subject: { name: 'Berlin', country: 'Germany' }, subjectType: 'city',
  })
  // 50 (subject) + 15 (wikimedia) + 10 (ratio) + 5 (width) = 80
  assertEquals(s, 80)
  assert(isAcceptable(s, 'cover'))
})

// ── Role thresholds ─────────────────────────────────────────────────────────

Deno.test('cover/hero demand 40, gallery/thumbnail demand 30', () => {
  assertEquals(minScoreForRole('cover'), 40)
  assertEquals(minScoreForRole('hero'), 40)
  assertEquals(minScoreForRole('gallery'), 30)
  assertEquals(minScoreForRole('thumbnail'), 30)
  assertEquals(minScoreForRole(undefined), 30)
  assert(isAcceptable(35, 'gallery'))
  assert(!isAcceptable(35, 'cover'))
})

Deno.test('pickBest honours the role threshold', () => {
  const cands = [{ score: 35 }, { score: 38 }]
  assertEquals(pickBest(cands, 'cover'), null) // best 38 < 40
  assertEquals(pickBest(cands, 'gallery')?.score, 38)
})
