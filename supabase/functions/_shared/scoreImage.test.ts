import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  isAcceptable,
  minScoreForRole,
  pickBest,
  QUEER_PLACE_MIN,
  scoreImage,
  scoreQueerPlaceImage,
} from './scoreImage.ts'

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

// ── Queer-place dual-gate scorer ────────────────────────────────────────────

Deno.test('real Pride photo naming the city clears the queer-place bar', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Berlin Christopher Street Day pride parade with rainbow flags',
    width: 1600, height: 1000, source: 'wikimedia',
    name: 'Berlin', country: 'Germany',
  })
  // queer 30 + subject 40 + wikimedia 15 + ratio 10 + width 5 = 100
  assertEquals(s, 100)
  assert(s >= QUEER_PLACE_MIN)
})

Deno.test('generic rainbow stock with no place name is rejected', () => {
  const s = scoreQueerPlaceImage({
    alt: 'a rainbow pride flag waving against a blue sky',
    width: 1600, height: 1000, source: 'pexels',
    name: 'Ljubljana', country: 'Slovenia',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY) // queer but not place-connected
})

Deno.test('city skyline with no queer token is rejected by the queer gate', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Berlin skyline at sunset over the river Spree',
    width: 1600, height: 1000, source: 'unsplash',
    name: 'Berlin', country: 'Germany',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY) // place but not queer
})

Deno.test('queer photo connected via country/capital only still passes (lower)', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Pride march through the streets of Ljubljana, Slovenia',
    width: 1400, height: 900, source: 'wikimedia',
    name: 'Metelkova', country: 'Slovenia', capital: 'Ljubljana',
  })
  // queer 30 + context(capital/country) 20 + wikimedia 15 + ratio 10 + width 5 = 80
  assertEquals(s, 80)
  assert(s >= QUEER_PLACE_MIN)
})

Deno.test('queer-place scorer still hard-rejects wildlife', () => {
  const s = scoreQueerPlaceImage({
    alt: 'a flamingo bird at Barcelona pride',
    width: 1600, height: 1000, source: 'wikimedia',
    name: 'Barcelona', country: 'Spain',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

// ── False positives the curated whole-word vocab must reject ─────────────────

Deno.test('military parade is not queer (bare "parade" dropped)', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Syrian army soldiers in a parade in Damascus',
    width: 1600, height: 1000, source: 'pexels',
    name: 'Syria', capital: 'Damascus',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

Deno.test('horse parade is not queer', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Horses parade in front of the hotel Uzbekistan',
    width: 1600, height: 1000, source: 'unsplash',
    name: 'Uzbekistan', capital: 'Tashkent',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

Deno.test('rainbow-coloured building is not queer (bare "rainbow" dropped)', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Vibrant rainbow-colored glass facade of a museum in Kuala Lumpur',
    width: 1600, height: 1000, source: 'pexels',
    name: 'Malaysia', capital: 'Kuala Lumpur',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

Deno.test('"gay" does not substring-match the city Gaya', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Sunrise over the temples of Gaya',
    width: 1600, height: 1000, source: 'wikimedia',
    name: 'Gaya', country: 'India',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

Deno.test('city Nice does not match a Venice photo', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Gondola on a canal in Venice at sunset',
    width: 1600, height: 1000, source: 'unsplash',
    name: 'Nice', country: 'France',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY) // no queer token anyway, but also no place bleed
})

Deno.test('army parade with "national pride" caption is rejected', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Syrian army soldiers in a parade in Damascus, showcasing unity and national pride',
    width: 1600, height: 1000, source: 'pexels',
    name: 'Syria', capital: 'Damascus',
  })
  assertEquals(s, Number.NEGATIVE_INFINITY)
})

Deno.test('drag show phrase still qualifies', () => {
  const s = scoreQueerPlaceImage({
    alt: 'Colorful Pride festival with drag performers in Utrecht',
    width: 1600, height: 1000, source: 'pexels',
    name: 'Utrecht', country: 'Netherlands',
  })
  assert(s >= QUEER_PLACE_MIN)
})
