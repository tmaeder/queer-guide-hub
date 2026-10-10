/**
 * Every fixture here is a REAL row from the retired glossary photo corpus
 * (`tag_image_retirement`) or from the orphaned `image_asset_links` rows, read
 * off prod on 2026-10-10. None is invented.
 *
 * That matters because the one previous attempt at this feature was justified
 * by a fixture nobody had measured: `city-class-guard`'s blanket override was
 * defended by the pair `['megacity','federal entity of Mexico']`, which no
 * entity carries, and it went on to refuse most of China. A gate tested only
 * against strings its author imagined is a gate tested against its author.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  classifyExplicit,
  corroborates,
  despace,
  significantTokens,
  sourceAllowedForTag,
  tagImageVerdict,
  type TagImageCandidate,
} from './tag-image-guard.ts'

const licensed = (over: Partial<TagImageCandidate> = {}): TagImageCandidate => ({
  url: 'https://upload.wikimedia.org/wikipedia/commons/5/5c/Leathertools.jpg',
  source: 'wikimedia',
  sourceRef: 'File:Leathertools.jpg',
  text: 'A set of leather working tools.',
  license: 'CC BY-SA 4.0',
  attribution: 'Scott Bauer',
  width: 1807,
  height: 2700,
  ...over,
})

// ── The observed wrong-subject corpus ───────────────────────────────────────
// These five are the actual published pairs. Each must be REFUSED for want of
// corroboration — the check the retired pipeline did not have.

Deno.test('refuses the wrong-subject rows the retired corpus published', () => {
  const cases: Array<[string, string, string]> = [
    ['cum', 'File:Sca_fell_massif2010.JPG', 'Scafell massif seen from Great Moss'],
    ['harness', "File:Armures,_réserves_du_musée_de_l'Armée,_Paris.jpg", 'Armour in store'],
    ['dildo', 'File:LGBT_history_museum.jpg', 'Exhibits at an LGBT history museum'],
    ['music', 'File:Op27_1_seg_mov.png', 'Second movement, Opus 27 no 1'],
    ['hindu', 'File:India-locator-map-blank.svg', 'Blank locator map of India'],
    // `unicorn` -> Unicorn_spider_outline.jpg is deliberately NOT here: the
    // word does corroborate, so no lexical rule can refuse it. It has its own
    // test below, which asserts the weaker guarantee that is actually true.
  ]
  for (const [name, ref, text] of cases) {
    const v = tagImageVerdict({ slug: name, name }, licensed({ sourceRef: ref, text }))
    assertEquals(v.decision, 'refuse', `${name} should be refused, got ${JSON.stringify(v)}`)
  }
})

Deno.test('the word boundary is what refuses cum -> Scafell', () => {
  // The substring form that the old pipeline effectively used would accept it.
  assertEquals('sca_fell_massif2010 scafell massif'.includes('cum'), false)
  // And a genuine containment case still matches on the whole word.
  assertEquals(corroborates('cum', [], 'File:Cum_on_a_mirror.jpg'), true)
  assertEquals(corroborates('cum', [], 'File:Cumbria_landscape.jpg'), false)
  assertEquals(corroborates('cum', [], 'File:Cumulus_clouds.jpg'), false)
})

Deno.test('NAMESAKE SURVIVES CORROBORATION — which is why keyword tiers never auto-publish', () => {
  // The honest boundary: "unicorn" really is in the file name, so the gate
  // cannot refuse it on text. It must still not publish unattended.
  const v = tagImageVerdict(
    { slug: 'unicorn', name: 'Unicorn' },
    licensed({ sourceRef: 'File:Unicorn_spider_outline.jpg', text: 'A unicorn spider' }),
  )
  assertEquals(v.decision, 'review')
})

// ── Licence and attribution ─────────────────────────────────────────────────

Deno.test('refuses an unlicensed candidate — the 1,262-of-1,590 lesson', () => {
  assertEquals(tagImageVerdict({ slug: 'leather', name: 'Leather' }, licensed({ license: null })), {
    decision: 'refuse',
    why: 'no_license',
  })
  assertEquals(tagImageVerdict({ slug: 'leather', name: 'Leather' }, licensed({ license: '  ' })), {
    decision: 'refuse',
    why: 'no_license',
  })
  assertEquals(
    tagImageVerdict({ slug: 'leather', name: 'Leather' }, licensed({ attribution: null })),
    { decision: 'refuse', why: 'no_attribution' },
  )
})

Deno.test('refuses a data: URI — the 3,407 gradient placeholders', () => {
  const v = tagImageVerdict(
    { slug: 'anal', name: 'Anal', is_adult: true },
    licensed({ url: 'data:image/svg+xml;utf8,<svg/>', sourceRef: 'gradient' }),
  )
  assertEquals(v, { decision: 'refuse', why: 'not_https' })
})

// ── The stock-photography licence rule ──────────────────────────────────────

Deno.test('stock photography may not illustrate an adult or sensitive tag', () => {
  for (const source of ['pexels', 'unsplash'] as const) {
    assertEquals(sourceAllowedForTag(source, { is_adult: true }), false)
    assertEquals(sourceAllowedForTag(source, { is_sensitive: true }), false)
    assertEquals(sourceAllowedForTag(source, { is_adult: false, is_sensitive: false }), true)
  }
  // Wikimedia and P18 are exempt: there the entity IS the subject, so no
  // identifiable model is implied to endorse anything.
  assertEquals(sourceAllowedForTag('wikimedia', { is_adult: true }), true)
  assertEquals(sourceAllowedForTag('wikidata:p18', { is_adult: true }), true)

  const v = tagImageVerdict(
    { slug: 'fister', name: 'Fister', is_adult: true },
    licensed({
      source: 'pexels',
      url: 'https://images.pexels.com/photos/1/x.jpg',
      sourceRef: 'pexels:1',
      text: 'A fister portrait',
      license: 'Pexels License',
      attribution: 'A Photographer',
    }),
  )
  assertEquals(v, { decision: 'refuse', why: 'stock_on_adult:pexels' })
})

// ── Explicitness ────────────────────────────────────────────────────────────

Deno.test('the lexicon catches two of the three, and MISSES the third', () => {
  assertEquals(classifyExplicit('File:Cum_shot_on_butt.jpg'), true)
  assertEquals(classifyExplicit('File:Hairy_facesitting.jpg'), true)

  // THE MEASURED GAP, pinned so nobody later "fixes" the lexicon and assumes
  // the problem is closed. This file was published on an active tag and
  // contains no clinical term, so a word list of reasonable size cannot see it.
  // It is the reason an adult tag treats Commons candidates as explicit by
  // default rather than trusting this function.
  assertEquals(classifyExplicit('File:Slave_kicked_in_the_balls_during_demonstration.jpg'), false)

  assertEquals(classifyExplicit('File:Leathertools.jpg'), false)
  assertEquals(classifyExplicit('File:WNBR_Brighton_2015_04.jpg'), false)
})

Deno.test('the file the lexicon misses is STILL gated, via the adult-tag precaution', () => {
  const v = tagImageVerdict(
    { slug: 'ballbusting', name: 'Ballbusting', is_adult: true },
    licensed({
      source: 'wikidata:p18',
      sourceRef: 'File:Slave_kicked_in_the_balls_during_demonstration.jpg',
      text: '',
    }),
  )
  // Not published, despite being the auto-publish tier and despite the lexicon
  // saying nothing. This is the assertion that makes the gap survivable.
  assertEquals(v, { decision: 'review', explicit: true, why: 'adult_tag_precaution' })
})

Deno.test('a lexicon hit is reported as such, so the two reasons stay distinguishable', () => {
  const v = tagImageVerdict(
    { slug: 'facesitting', name: 'Facesitting', is_adult: true },
    licensed({ source: 'wikidata:p18', sourceRef: 'File:Hairy_facesitting.jpg', text: '' }),
  )
  assertEquals(v, { decision: 'review', explicit: true, why: 'explicit_lexicon' })
})

Deno.test('explicit on a non-adult tag is refused, not merely gated', () => {
  const v = tagImageVerdict(
    { slug: 'friendship', name: 'Friendship', is_adult: false },
    licensed({ sourceRef: 'File:Orgy_scene.jpg', text: 'An orgy' }),
  )
  assertEquals(v, { decision: 'refuse', why: 'explicit_on_non_adult' })
})

// ── The three verdicts are distinct ─────────────────────────────────────────

Deno.test('P18 publishes unattended; the same candidate from Commons does not', () => {
  // Non-adult, because the adult precaution above routes every adult candidate
  // to review regardless of tier.
  const tag = { slug: 'nudist', name: 'Nudist', is_adult: false }
  assertEquals(tagImageVerdict(tag, licensed({ source: 'wikidata:p18' })), {
    decision: 'publish',
    explicit: false,
  })
  const viaSearch = tagImageVerdict(
    tag,
    licensed({ source: 'wikimedia', sourceRef: 'File:Nudist_beach.jpg', text: 'A nudist beach' }),
  )
  assertEquals(viaSearch.decision, 'review')
})

Deno.test('AUTO-PUBLISH IS UNREACHABLE ON AN ADULT TAG — the stated cost of the precaution', () => {
  const v = tagImageVerdict(
    { slug: 'leather', name: 'Leather', is_adult: true },
    licensed({ source: 'wikidata:p18' }),
  )
  assertEquals(v.decision, 'review')
})

Deno.test('review is NOT refuse — a refusal writes the tag off, a review keeps it alive', () => {
  // Same candidate, two tags. The distinction has to survive, because only
  // `refuse` may count an attempt toward the terminal data_unavailable stamp.
  const review = tagImageVerdict({ slug: 'leather', name: 'Leather' }, licensed())
  const refuse = tagImageVerdict({ slug: 'espresso', name: 'Espresso' }, licensed())
  assertEquals(review.decision, 'review')
  assertEquals(refuse.decision, 'refuse')
})

// ── Dimensions ──────────────────────────────────────────────────────────────

Deno.test('refuses an image too small for a figure band, and says the size', () => {
  const v = tagImageVerdict({ slug: 'leather', name: 'Leather' }, licensed({ width: 320, height: 240 }))
  assertEquals(v, { decision: 'refuse', why: 'too_small:320x240' })
  // Unknown dimensions must NOT be read as zero and refused — Commons omits
  // them for some files and a missing measurement is not a small image.
  const unknown = tagImageVerdict(
    { slug: 'leather', name: 'Leather' },
    licensed({ width: undefined, height: undefined }),
  )
  assertEquals(unknown.decision, 'review')
})

// ── Aliases ─────────────────────────────────────────────────────────────────

Deno.test('an approved alias corroborates; the tag name need not appear', () => {
  assertEquals(
    corroborates('Box Tie', ['Takate Kote'], 'File:Takate_kote_demonstration.jpg'),
    true,
  )
  assertEquals(corroborates('Box Tie', [], 'File:Takate_kote_demonstration.jpg'), false)
})

Deno.test('multi-token names need EVERY token, not any', () => {
  assertEquals(corroborates('Rope Suspension', [], 'File:Rope_bondage_chest.jpg'), false)
  assertEquals(corroborates('Rope Suspension', [], 'File:Rope_suspension_demo.jpg'), true)
})

Deno.test('`play` is a stopword, so "Pup Play" corroborates on "pup" alone', () => {
  // Deliberate: "play" is a glossary suffix across dozens of entries (pup,
  // rope, knife, impact, primal), so requiring it would refuse every genuinely
  // relevant file. A pup hood IS evidence for pup play.
  assertEquals(significantTokens('Pup Play'), ['pup'])
  assertEquals(corroborates('Pup Play', [], 'File:Pup_hood_and_mitts.jpg'), true)
})

// ── Helpers ─────────────────────────────────────────────────────────────────

Deno.test('despace and significantTokens', () => {
  assertEquals(despace("Vilain Garçon"), 'vilaingarcon')
  assertEquals(despace('Cock & Ball Torture (CBT)'), 'cockballtorturecbt')
  assertEquals(significantTokens('The Art of Rope Play'), ['art', 'rope'])
  // Single letters drop out, so "Hepatitis A" cannot corroborate on "a".
  assertEquals(significantTokens('Hepatitis A'), ['hepatitis'])
})
