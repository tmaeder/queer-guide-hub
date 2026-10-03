// Guard for accessibility-evidence.ts.
//
// EVERY FIXTURE IS A REAL ROW. The `LIVE_QUEUE` block is the complete set of
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

type Cite = { field?: string; quote: string }

interface Row {
  name: string
  src: string
  slugs: string[]
  /** Slugs whose own citation holds up. Hand-read. */
  keep: string[]
  /** Expected refusal reason per refused slug. Hand-read. */
  why: Record<string, string>
  citations: Cite[]
}

const LIVE_QUEUE: Row[] = [
  {
    name: 'Bar Phoebe',
    src: 'Could be easy to slip in, but the host/bartenders are also right there when you walk in. Shared sinks and individual rooms. There is a handicap sign on the restroom door but I wasn’t sure where the elevator was to get up to the bar.  - Look for the door that says Phoebe, up the concrete stairs and immediately on left. ',
    slugs: ['wide-doorways', 'ramp-access', 'elevator-access', 'accessible-restroom'],
    citations: [
      { quote: 'There is a handicap sign on the restroom door' },
      { quote: 'up the concrete stairs and immediately on left' },
    ],
    // The handicap sign is real evidence of an accessible restroom. The other
    // three are invented, and "up the concrete stairs" actively refutes the two
    // mobility ones. `elevator` DOES appear in the source — inside "I wasn't
    // sure where the elevator was", which the negation window catches, so it
    // must NOT come back as `miscited`.
    keep: ['accessible-restroom'],
    why: { 'wide-doorways': 'no_evidence', 'ramp-access': 'no_evidence', 'elevator-access': 'no_evidence' },
  },
  {
    name: 'Bar59',
    src: 'Small gay bar in a quiet side alley of the historical center of Nuremberg. Friendly, intimate atmosphere. Mixed ages. queer-friendly',
    slugs: ['service-animals-welcome'],
    citations: [{ quote: 'Friendly, intimate atmosphere.' }],
    keep: [],
    why: { 'service-animals-welcome': 'no_evidence' },
  },
  {
    name: 'Chestnut Beach',
    src: "Looks like a standard pit toilet but has running water with flush toilets. Park locked dusk to 7:30 AM. Not sure of the seasonality of park as it's primarily a swimming location. - At the very end of the Chestnut Beach parking lot is a restroom. Two unisex rooms. ",
    slugs: ['gender-neutral-restroom'],
    citations: [
      { quote: 'running water with flush toilets' },
      { quote: 'Two unisex rooms' },
    ],
    // Two citations, one irrelevant and one decisive. One good quote is enough.
    keep: ['gender-neutral-restroom'],
    why: {},
  },
  {
    name: 'Chicken Salad Chick',
    src: 'When you go in the front door, stay to the left and go down the hall past the registers. Single stall men/ women’s bathrooms ',
    slugs: ['wide-doorways'],
    citations: [{ quote: 'Single stall men/ women’s bathrooms' }],
    keep: [],
    why: { 'wide-doorways': 'no_evidence' },
  },
  {
    name: 'Clinton Market/Conoco Gas Station',
    src: 'Very inclusive signs - just wash your hands - Back of the market - two gender neutral, single stall, accessible restrooms ',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Very inclusive signs - just wash your hands - Back of the market - two gender neutral, single stall, accessible restrooms' }],
    keep: ['gender-neutral-restroom'],
    why: {},
  },
  {
    name: 'El Burro',
    src: "not sure if you have to buy something to use the restrooms, always end up doing so when we've gone to eat there :< Seems to be accessible but I'm not a wheelchair user so don't want to mislead anyone. - Down past the counter and towards the back patio ",
    slugs: ['wheelchair-accessible'],
    citations: [{ quote: 'Seems to be accessible' }],
    // "Seems to be" is a hedge the model promoted to a definite claim, and the
    // very next clause is "I'm not a wheelchair user so don't want to mislead
    // anyone" — the contributor explicitly declining to make this claim.
    keep: [],
    why: { 'wheelchair-accessible': 'no_evidence' },
  },
  {
    name: 'Gais Positius',
    src: 'Association of gay and bisexual men with HIV working for the LGTBI community with a rights-based approach since 1994. Its services include legal information, psychological support, treatment counseling and rapid tests. queer-friendly',
    slugs: ['ramp-access', 'elevator-access', 'wide-doorways'],
    citations: [
      { quote: 'ramp-access since 1994' },
      { quote: 'elevator-access' },
      { quote: 'wide-doorways' },
    ],
    // The worst row in the set, at confidence 1.00: the "quotes" are the slugs
    // themselves echoed back. Corroboration alone would ADOPT all three, because
    // a slug trivially contains its own vocabulary. Only grounding catches it.
    keep: [],
    why: { 'ramp-access': 'ungrounded', 'elevator-access': 'ungrounded', 'wide-doorways': 'ungrounded' },
  },
  {
    name: 'HamMan',
    src: 'Only exclusive gay sauna in Panamá City. Mostly locals with some foreigners, popular 18-21h. queer-friendly sauna',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'mostly locals with some foreigners' }],
    keep: [],
    why: { 'gender-neutral-restroom': 'no_evidence' },
  },
  {
    name: 'Indy Clover',
    src: 'A nice single bathroom with changing table and hand rails.  - Back of store by dressing rooms, ask an employee to unlock it for you. ',
    slugs: ['wide-doorways', 'ramp-access'],
    citations: [{ quote: 'hand rails' }, { quote: 'changing table' }],
    // Hand rails are a real accessibility feature and evidence for NEITHER of
    // the two slugs proposed. Adjacent is not the same as supported.
    keep: [],
    why: { 'wide-doorways': 'no_evidence', 'ramp-access': 'no_evidence' },
  },
  {
    name: 'Midtowne Spa',
    src: 'Located in an old warehouse built in 1910. Lots of fantasy rooms and beautiful rooftop with view of downtown. queer-friendly sauna',
    slugs: ['wide-doorways', 'ramp-access'],
    citations: [
      { quote: 'Lots of fantasy rooms and beautiful rooftop with view of downtown' },
      { quote: 'Located in an old warehouse built in 1910' },
    ],
    keep: [],
    why: { 'wide-doorways': 'no_evidence', 'ramp-access': 'no_evidence' },
  },
  {
    name: 'Millenium Sauna in Millennium Hotel Sirih',
    src: 'Sauna and steam room is very popular especially among Chinese men. Located in Millennium Hotel Sirih. queer-friendly sauna',
    slugs: ['wheelchair-accessible'],
    citations: [{ quote: 'especially among Chinese men' }],
    keep: [],
    why: { 'wheelchair-accessible': 'no_evidence' },
  },
  {
    name: 'Mobil - Rosemont',
    src: 'Probably not wheelchair accessible but gender neutral with a single, clean, restroom ',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Probably not wheelchair accessible' }],
    // The CLAIM IS TRUE — the description says "gender neutral" — and the model
    // cited the one clause that does not support it. Refused (an unevidenced
    // access claim may not publish) but reported as `miscited`, because the
    // remedy is to re-cite rather than discard. This is the row that justifies
    // the verdict existing.
    keep: [],
    why: { 'gender-neutral-restroom': 'miscited' },
  },
  {
    name: 'Mutschmanns',
    src: 'Especially popular with the leather & fetish crowd. Special theme parties. Entrance free. queer-friendly sauna',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Especially popular with the leather & fetish crowd.' }],
    keep: [],
    why: { 'gender-neutral-restroom': 'no_evidence' },
  },
  {
    name: 'North Spokane Library',
    src: 'First stall has a very low toilet, be aware if you have mobility issues getting back up OR if you have kids who need the lower seat - Directly inside the lobby, look for the green wall ',
    slugs: ['wide-doorways'],
    citations: [{ quote: 'if you have mobility issues getting back up' }],
    // A warning to people with mobility issues, read as a positive claim.
    keep: [],
    why: { 'wide-doorways': 'no_evidence' },
  },
  {
    name: 'ParlamentsBuchhandlung',
    src: 'Large selection of political literature, a wide selection of daily newspapers and last-minute gifts. Cigarettes and postcards... queer-friendly',
    slugs: ['service-animals-welcome'],
    citations: [{ field: 'Tags', quote: 'queer-friendly' }],
    // A human has already rejected this exact shape three times on other rows:
    // "a queer-friendly tag does not evidence an accessibility feature".
    keep: [],
    why: { 'service-animals-welcome': 'no_evidence' },
  },
  {
    name: 'RE/MAX field',
    src: 'Visited during edmonton riverhawks baseball game. Unsure of availability outside game time - Second floor, near section I/H ',
    slugs: ['wide-doorways', 'elevator-access'],
    citations: [
      { quote: 'Second floor, near section I/H' },
      { quote: 'Second floor, near section I/H' },
    ],
    // "It is on the second floor" is not evidence of how you get there.
    keep: [],
    why: { 'wide-doorways': 'no_evidence', 'elevator-access': 'no_evidence' },
  },
  {
    name: "Sara's Tearooms",
    src: 'No purchase necessarily. Radar key needed. Blue key available from staff at counter.  - Door opens out onto the path around our Tearooms. There is a sign that reads`accessibile toilet above it. ',
    slugs: ['ramp-access'],
    citations: [{ quote: 'There is a sign that reads`accessibile toilet above it.' }],
    // The citation is good evidence — for a DIFFERENT slug. The venue has an
    // accessible toilet and a RADAR key; nothing says ramp. Wrong slug, not a
    // miscitation, so `no_evidence` is the right verdict and `accessible-restroom`
    // is what a re-run should propose.
    keep: [],
    why: { 'ramp-access': 'no_evidence' },
  },
  {
    name: 'The Sauna @ Flower Hotel',
    src: 'Japanese-style bathhouse on the first floor of the hotel. Some locals go here to meet visitors. Be discreet! queer-friendly sauna',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Japanese-style bathhouse' }],
    // A bathhouse is not a restroom, and a Japanese one is conventionally
    // sex-segregated — if anything the citation points the other way.
    keep: [],
    why: { 'gender-neutral-restroom': 'no_evidence' },
  },
  {
    name: 'Tilt Studio',
    src: 'Hours: Sunday 11am to 8pm. \r\nMonday-Thursday 10am to 9pm\r\nFriday-Saturday 10am to 10pm - Family restroom located in northeast corner of building. ',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'Family restroom located in northeast corner of building.' }],
    // A family restroom is single-occupancy and not sex-designated.
    keep: ['gender-neutral-restroom'],
    why: {},
  },
  {
    name: 'West Side Club',
    src: 'Located on the 3rd floor. No signs. Ask the concierge. Steam room and finnish sauna closed. Cabins only for club members with annual pass. We received bad reports. queer-friendly sauna',
    slugs: ['ramp-access', 'elevator-access'],
    citations: [{ quote: 'Located on the 3rd floor.' }, { quote: 'Ask the concierge.' }],
    keep: [],
    why: { 'ramp-access': 'no_evidence', 'elevator-access': 'no_evidence' },
  },
  {
    name: 'WNB Factory',
    src: 'They are gendered bathrooms but they are single stalls. Staff don’t care and it’s pretty quiet most the time. - To the right of the counter ',
    slugs: ['gender-neutral-restroom'],
    citations: [{ quote: 'They are gendered bathrooms but they are single stalls.' }],
    // The citation REFUTES the proposal in its own first clause. Single-occupancy
    // and gender-neutral are independent properties; this is why bare "single
    // stall" is deliberately absent from the evidence vocabulary.
    keep: [],
    why: { 'gender-neutral-restroom': 'no_evidence' },
  },
]

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
