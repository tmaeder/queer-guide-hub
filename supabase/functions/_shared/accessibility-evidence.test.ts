// Guard for accessibility-evidence.ts.
//
// EVERY FIXTURE IS A REAL ROW. `LIVE_QUEUE` (accessibility-evidence.fixtures.ts) is the complete set of
// `accessibility_attributes` proposals open on prod on 2026-10-01, copied
// verbatim — venue name, proposed slugs, citations and the description the model
// was given. The expectations are a HAND READ of each one, made before the guard
// was written, so this file is ground truth rather than a restatement of the
// implementation.
//
// A synthetic fixture would prove nothing here: the whole defect is that
// plausible-looking model output does not survive contact with the text it was
// drawn from, and only real text carries that.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  accessibilityEvidenceVerdict,
  filterAccessibilityByEvidence,
} from './accessibility-evidence.ts'
import { LIVE_QUEUE } from './accessibility-evidence.fixtures.ts'

Deno.test('live queue: every proposal gets its hand-read verdict', () => {
  for (const row of LIVE_QUEUE) {
    const { kept, refused } = filterAccessibilityByEvidence(row.slugs, row.citations, row.src)
    assertEquals(kept, [...row.keep].sort(), `kept mismatch for ${row.name}`)
    for (const r of refused) {
      assertEquals(r.reason, row.why[r.slug], `${row.name}: ${r.slug} reason`)
    }
    assertEquals(refused.length, Object.keys(row.why).length, `${row.name}: refusal count`)
  }
})

Deno.test('live queue: the aggregate matches the measurement that motivated this', () => {
  let claims = 0, kept = 0
  const byReason: Record<string, number> = {}
  for (const row of LIVE_QUEUE) {
    const r = filterAccessibilityByEvidence(row.slugs, row.citations, row.src)
    claims += row.slugs.length
    kept += r.kept.length
    for (const x of r.refused) byReason[x.reason] = (byReason[x.reason] ?? 0) + 1
  }
  // 30 slug-claims across 21 rows; 4 survive. Quoted in the module header and in
  // the migration that dispositions these rows — if this moves, those are stale.
  assertEquals(claims, 30)
  assertEquals(kept, 4)
  assertEquals(byReason.ungrounded, 3)
  assertEquals(byReason.miscited, 1)
  assertEquals(byReason.no_evidence, 22)
  // No row in the live set is `refuted`; that arm is exercised below. Asserting
  // its absence keeps the counts honest rather than letting one reason absorb
  // another.
  assertEquals(byReason.refuted ?? 0, 0)
})

Deno.test('negation refutes a positive and supports its negative twin', () => {
  const src = 'Sadly there is no step free access to the upstairs bar.'
  const cites = [{ quote: 'there is no step free access' }]
  // This exact quote appears in the live corpus cited FOR `step-free-entrance`.
  const pos = accessibilityEvidenceVerdict('step-free-entrance', cites, src)
  assertEquals(pos.ok, false)
  assertEquals(pos.ok === false && pos.reason, 'refuted')
  // The same sentence is real evidence for the negative assertion.
  const neg = accessibilityEvidenceVerdict('not-step-free', cites, src)
  assertEquals(neg.ok, true)
})

Deno.test('"no steps" supports step-free — the negator is part of the evidence', () => {
  const src = 'Level entry, no steps at the door.'
  const v = accessibilityEvidenceVerdict('step-free-entrance', [{ quote: 'no steps at the door' }], src)
  assertEquals(v.ok, true)
})

Deno.test('a negative slug is refused when the access term is NOT negated', () => {
  const src = 'The venue is step free throughout.'
  const v = accessibilityEvidenceVerdict('not-step-free', [{ quote: 'The venue is step free throughout.' }], src)
  assertEquals(v.ok, false)
  assertEquals(v.ok === false && v.reason, 'refuted')
})

Deno.test('the vocabulary covers the spellings the corpus actually uses', () => {
  // Each of these is a real quote from the 1,036 machine-approved claims on
  // prod. A first draft written from reasoning alone refused all of them, which
  // is ~18% of that cohort false-refused.
  const cases: Array<[string, string]> = [
    ['wheelchair-accessible', 'Both are handicap-accessible'],
    ['wheelchair-accessible', 'second is disabled toilet'],
    ['wheelchair-accessible', 'Our historic building is handicapped accessible'],
    ['wheelchair-accessible', 'ADA accessible'],
    ['gender-neutral-restroom', '2 single occupancy bathrooms, not gendered.'],
    ['gender-neutral-restroom', '3 individual, ungendered stalls'],
    ['gender-neutral-restroom', 'Los baños son unisex.'],
    ['gender-neutral-restroom', 'Er zijn enkel genderneutrale wc'],
    ['gender-neutral-restroom', 'single room genderless space'],
    ['gender-neutral-restroom', 'a large bathroom with an "All Gender Restroom" sign'],
    ['accessible-restroom', 'accessible with a RADAR key'],
    ['accessible-restroom', 'Changing Places accessible facility'],
    ['accessible-restroom', 'Hay baños accesibles de un solo ocupante'],
    ['elevator-access', '3rd f.+lift'],
    ['hearing-loop', 'enhanced hearing devices'],
  ]
  for (const [slug, quote] of cases) {
    const v = accessibilityEvidenceVerdict(slug, [{ quote }], quote)
    assertEquals(v.ok, true, `${slug} should accept: ${quote}`)
  }
})

Deno.test('single-occupancy alone is NOT gender-neutral evidence', () => {
  // Both real. Conflating these is one of the live defects.
  for (const q of [
    'Gendered stalls, but they are singles with lockable doors.',
    'They are gendered bathrooms but they are single stalls.',
    'All public floors have single sex restrooms',
  ]) {
    const v = accessibilityEvidenceVerdict('gender-neutral-restroom', [{ quote: q }], q)
    assertEquals(v.ok, false, `should refuse: ${q}`)
  }
})

Deno.test('an unrecognised slug is reported, never adopted', () => {
  const v = accessibilityEvidenceVerdict('teleporter-access', [{ quote: 'has a teleporter' }], 'has a teleporter')
  assertEquals(v.ok, false)
  assertEquals(v.ok === false && v.reason, 'unrecognised_slug')
})

Deno.test('no citation at all is uncited, not supported', () => {
  for (const c of [null, undefined, [], [{ quote: '' }]]) {
    const v = accessibilityEvidenceVerdict('ramp-access', c as never, 'There is a ramp at the side door.')
    assertEquals(v.ok, false)
    assertEquals(v.ok === false && v.reason, 'uncited')
  }
})

Deno.test('an empty source skips grounding rather than failing everything closed', () => {
  // Absence of the source text is not evidence a quote was invented.
  const v = accessibilityEvidenceVerdict('ramp-access', [{ quote: 'there is a ramp at the entrance' }], '')
  assertEquals(v.ok, true)
})

Deno.test('grounding is whitespace- and curly-quote-insensitive', () => {
  const src = 'Family restroom located\n  in the northeast corner of the building.'
  const v = accessibilityEvidenceVerdict(
    'gender-neutral-restroom',
    [{ quote: 'Family restroom located in the northeast corner' }],
    src,
  )
  assertEquals(v.ok, true)
})

Deno.test('a quote taken from the venue NAME is grounded — and still needs corroboration', () => {
  // Real row: "Room+private bathr. in big flat (80sqm) in Montmartre - 3rd f.+lift".
  // The model cited "3rd f.+lift", which is absent from the description and present
  // in the NAME. The prompt's first line is `Venue: <name> | Category: …`, so the
  // quote IS grounded in what the model was shown — and `extractVenueAmenitiesFromText`
  // therefore includes the name in the haystack.
  const name = 'Room+private bathr. in big flat (80sqm) in Montmartre - 3rd f.+lift'
  const descr = 'Private room in Paris. Hosted by Greg. Guest rating: 4.97/5 (62 reviews).'
  const shown = `${name}\n${descr}`
  const cites = [{ quote: '3rd f.+lift' }]

  // A lift corroborates elevator-access.
  assertEquals(accessibilityEvidenceVerdict('elevator-access', cites, shown).ok, true)

  // It does NOT corroborate wheelchair-accessible: a lift to the third floor is not
  // a step-free entrance, and that is the distinction a disabled reader needs. This
  // is the one live row where grounding and corroboration disagree.
  const wc = accessibilityEvidenceVerdict('wheelchair-accessible', cites, shown)
  assertEquals(wc.ok, false)
  assertEquals(wc.ok === false && wc.reason, 'no_evidence')

  // Without the name in the haystack both would read as `ungrounded` — the wrong
  // reason, and it would have retracted a sound elevator claim.
  assertEquals(
    accessibilityEvidenceVerdict('elevator-access', cites, descr).ok === false &&
      (accessibilityEvidenceVerdict('elevator-access', cites, descr) as { reason: string }).reason,
    'ungrounded',
  )
})

Deno.test('a bare slug string is never its own citation', () => {
  // 243 of the 259 retracted claims cited the slug itself. Corroboration alone
  // ADOPTS these, because a slug trivially contains its own vocabulary; only
  // grounding can refuse them.
  const src = 'Atlantis Water Park is a venue in Ljubljana, Slovenia, with clothing-optional facilities.'
  for (const slug of ['not-wheelchair-accessible', 'not-step-free', 'wheelchair-accessible', 'gender-neutral-restroom']) {
    const v = accessibilityEvidenceVerdict(slug, [{ quote: slug }], src)
    assertEquals(v.ok, false, `${slug} must not cite itself`)
    assertEquals(v.ok === false && v.reason, 'ungrounded', `${slug} reason`)
  }
})
