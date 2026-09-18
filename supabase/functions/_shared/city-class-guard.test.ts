import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import {
  CITY_COORD_MAX_KM,
  CITY_REFRESH_SCOPES,
  cityClassVerdict,
  cityCoordVerdict,
  isCityRefreshScope,
} from './city-class-guard.ts'

// `Illinois` is the one fixture MEASURED live against Wikidata while writing this
// module: wbsearchentities("Illinois") -> Q1204, whose P31 is Q35657, labelled
// "U.S. state". It is the head of the real `qid_gap` work list. The remaining
// labels are the class vocabulary Wikidata uses for these shapes rather than rows
// re-measured one by one — the gate is fail-closed, so a label this file gets
// wrong refuses rather than adopts.

Deno.test('the head of the real qid_gap batch is refused', () => {
  assertEquals(cityClassVerdict(['U.S. state']).verdict, 'refused')
  assertEquals(cityClassVerdict(['state of Australia']).verdict, 'refused')
  assertEquals(cityClassVerdict(['sovereign state', 'island country']).verdict, 'refused')
  assertEquals(cityClassVerdict(['historical region']).verdict, 'refused')
  assertEquals(cityClassVerdict(['island']).verdict, 'refused')
})

Deno.test('genuine settlements are adopted, spelled the way Wikidata spells them', () => {
  for (const label of [
    'city', 'big city', 'city of China', 'commune of France',
    'municipality of Brazil', 'town', 'village', 'urban-type settlement',
    'human settlement', 'city with county rights',
  ]) {
    assertEquals(cityClassVerdict([label]).verdict, 'settlement', label)
  }
})

// The override disqualifies THE LABEL IT MATCHES, not the whole entity.
//
// This test asserted the opposite until 2026-09-15, and the fixtures it used
// were invented rather than measured: no entity carries `megacity` beside
// `federal entity of Mexico` (Mexico City's real P31 is the list below). The
// first live qid_gap dry run showed what the blanket veto cost, and every
// label set here was then read off Wikidata rather than reasoned about.
Deno.test('a disqualified label does not veto a different label that is clean', () => {
  // Measured 2026-09-15. Each of these was REFUSED by the blanket veto, and
  // each is a major destination on this platform.
  const adopt: Record<string, string[]> = {
    // Q4970 — refused on `\bprovince\b` matching `sub-province-level division`.
    Hangzhou: ['sub-province-level division', 'big city', 'prefecture-level city of China'],
    // Q58401 — refused on `\bprefecture\b` matching a label that says CITY.
    Shijiazhuang: ['prefecture-level city of China', 'big city'],
    Chengdu: ['sub-province-level division', 'city', 'prefecture-level city of China', 'megacity'],
    // Q64 — refused on `city-state`, though it is also a metropolis.
    Berlin: [
      'seat of government', 'metropolis', 'urban municipality in Germany', 'city-state',
      'largest city', 'federated state of Germany', 'federal capital',
    ],
    Hamburg: ['federated state of Germany', 'big city', 'city-state', 'port city'],
    Vienna: ['federal capital', 'federal state of Austria', 'metropolis', 'city-state'],
    // Q334 — a city-state IS a city, which CLAUDE.md's capital-scope work
    // already settled when it refused to delete Singapur and Luxemburg.
    Singapore: ['sovereign state', 'city-state', 'island country', 'city', 'big city'],
    // Q1489, the real label set. The invented fixture this replaces claimed
    // `federal entity of Mexico`; the live dry run adopted this QID correctly.
    'Mexico City': ['big city', 'city', 'metropolis', 'megacity'],
  }
  for (const [name, labels] of Object.entries(adopt)) {
    assertEquals(cityClassVerdict(labels).verdict, 'settlement', name)
  }
})

// The override still does the job it was built for: an entity whose ONLY
// settlement evidence is qualified away never reaches the adopt branch.
Deno.test('an entity whose only settlement evidence is disqualified still refuses', () => {
  const bare = cityClassVerdict(['city-state'])
  assertEquals(bare.verdict, 'refused')
  assertEquals(bare.reason, 'override:\\bcity-state\\b')
  assertEquals(bare.label, 'city-state')
  // Order must not decide it either.
  assertEquals(cityClassVerdict(['city-state', 'sovereign state']).verdict, 'refused')
  assertEquals(cityClassVerdict(['sovereign state', 'city-state']).verdict, 'refused')
})

// Which label gets REPORTED is load-bearing, not cosmetic: this module refuses
// an unknown class precisely so a vocabulary gap surfaces as a namable label.
// When an entity ALMOST qualified, the near-miss label is the actionable one.
Deno.test('a refusal reports the label that carried the settlement word', () => {
  const out = cityClassVerdict(['historical region', 'prefecture-level city of China'])
  assertEquals(out.verdict, 'refused')
  assertEquals(out.label, 'prefecture-level city of China')
  assertEquals(out.reason, 'override:\\bprefecture\\b')
})

// Measured 2026-09-15: the real label sets of the things this gate exists to
// keep out. None carries a settlement word at all, so the whitelist refuses
// them whether or not an override also matches.
Deno.test('countries and first-level subdivisions are still refused', () => {
  assertEquals(cityClassVerdict(['U.S. state']).verdict, 'refused')                       // Q1204 Illinois
  assertEquals(
    cityClassVerdict(['sovereign state', 'colonial power', 'republic', 'country']).verdict,
    'refused',
  )                                                                                        // Q142 France
  assertEquals(cityClassVerdict(['prefecture of Japan']).verdict, 'refused')               // Q80011 Chiba
  assertEquals(cityClassVerdict(['historical region']).verdict, 'refused')                 // Yorkshire
  assertEquals(cityClassVerdict(['state of Germany']).verdict, 'refused')                  // Hessen
  assertEquals(cityClassVerdict(['public research university']).verdict, 'refused')        // what "Illinois" resolved to
})

// THE LOAD-BEARING DISTINCTION. Both refuse to adopt, but only `refused` may
// count an attempt toward the terminal sentinel. Collapsing them lets one
// Wikidata outage permanently write off every row the sweep touched.
Deno.test('unreadable class is undetermined, not refused', () => {
  const out = cityClassVerdict(null)
  assertEquals(out.verdict, 'undetermined')
  assertEquals(out.reason, 'class_unreadable')
})

Deno.test('an entity read successfully with no P31 is refused, not undetermined', () => {
  const out = cityClassVerdict([])
  assertEquals(out.verdict, 'refused')
  assertEquals(out.reason, 'no_class')
})

// A class we do not know refuses AND names itself, so a systematic gap in the
// vocabulary shows up as a rising count of labels rather than as silence.
Deno.test('an unrecognised class is refused and reports its label verbatim', () => {
  const out = cityClassVerdict(['exoplanet'])
  assertEquals(out.verdict, 'refused')
  assertEquals(out.reason, 'unrecognised')
  assertEquals(out.label, 'exoplanet')
})

// --- Coordinate corroboration -------------------------------------------
//
// Every pair below is a REAL row and the QID the live dry run actually adopted
// for it on 2026-09-15, with the row's stored coordinates and the entity's own
// P625. The class gate passes all ten: a namesake IS a settlement, so only
// geography separates them.

Deno.test('the namesake adoptions the class gate cannot see are refused', () => {
  // Our row is Long Island, New York. Q2545992 is Long Island, KANSAS (pop ~120).
  const kansas = cityCoordVerdict(40.8, -73.3, 39.9472, -99.5362)
  assertEquals(kansas.verdict, 'disagree')
  // Our row is the US STATE of Indiana. Q1184769 is Indiana, a borough in
  // Pennsylvania — and it would have written that borough's population, area
  // and elevation onto the state row.
  const pennsylvania = cityCoordVerdict(40, -86, 40.6215, -79.1525)
  assertEquals(pennsylvania.verdict, 'disagree')
})

Deno.test('every correct adoption from the same batch still agrees', () => {
  // row lat/lng, then the entity's P625. Distances measured: 0.0-9.5 km.
  const correct: Record<string, [number, number, number, number]> = {
    London: [51.5074, -0.1278, 51.5072, -0.1275],
    Paris: [48.8566, 2.3522, 48.8567, 2.3508],
    Ahmedabad: [23.0225, 72.57138889, 23.03, 72.58],
    Khartoum: [15.6, 32.5, 15.6031, 32.5265],
    'Mexico City': [19.4326, -99.1332, 19.4326, -99.1332],
    'Saint Petersburg': [59.9606739, 30.1586551, 59.9375, 30.3086],
    'Ho Chi Minh City': [10.8231, 106.6297, 10.7756, 106.7019],
  }
  for (const [name, [a, b, c, d]] of Object.entries(correct)) {
    assertEquals(cityCoordVerdict(a, b, c, d).verdict, 'agree', name)
  }
})

// FAILS OPEN, and the caller counts it. Refusing a coordless row would gut a
// sweep whose entire purpose is a cohort that has never resolved.
Deno.test('a missing coordinate on either side says nothing either way', () => {
  assertEquals(cityCoordVerdict(null, null, 40.6215, -79.1525).verdict, 'unchecked')
  assertEquals(cityCoordVerdict(40, -86, null, null).verdict, 'unchecked')
  assertEquals(cityCoordVerdict(40, undefined, 40, -79).verdict, 'unchecked')
  assertEquals(cityCoordVerdict(NaN, -86, 40, -79).verdict, 'unchecked')
  assertEquals(cityCoordVerdict(null, null, null, null).distanceKm, null)
})

// The bound sits in a measured gap: largest correct distance 9.5 km, smallest
// wrong one 584.3 km. A threshold that drifts into that gap is a silent
// regression in one direction or the other, so it is pinned.
Deno.test('the distance bound stays inside the gap it was measured into', () => {
  assertEquals(CITY_COORD_MAX_KM, 100)
  // Just inside and just outside, on a due-north offset (~111 km per degree).
  assertEquals(cityCoordVerdict(0, 0, 0.5, 0).verdict, 'agree')    // ~55 km
  assertEquals(cityCoordVerdict(0, 0, 1.5, 0).verdict, 'disagree') // ~167 km
  // Antipodal points must not wrap around to "near".
  assertEquals(cityCoordVerdict(0, 0, 0, 180).verdict, 'disagree')
})

// The clamp inside the haversine is load-bearing, and this pair is why. For a
// near-antipodal pair the intermediate term comes out at 1.0000000000000004 in
// floating point, so an unclamped `Math.asin(Math.sqrt(h))` is NaN. The VERDICT
// would survive that by luck (`NaN <= 100` is false, so it still disagrees),
// but `distanceKm` reaches `enrichment_status` through the miss reason, which
// would read `refused_coords:nullkm` — a number that is not a number, recorded
// as the explanation for a refusal. Found by searching for a triggering input
// rather than by assuming the clamp was defensive decoration.
Deno.test('a near-antipodal pair still reports a real distance', () => {
  const out = cityCoordVerdict(
    -68.39513994981583, 113.96817295625249,
    68.39513994943619, -66.03182704409684,
  )
  assertEquals(out.verdict, 'disagree')
  assertEquals(Number.isFinite(out.distanceKm), true)
  // Half the circumference, give or take: never NaN, never past the far side.
  assertEquals((out.distanceKm ?? 0) > 20000 && (out.distanceKm ?? 0) < 20040, true)
})

Deno.test('scope list matches the selector and rejects anything else', () => {
  assertEquals([...CITY_REFRESH_SCOPES].sort(), [
    'alias_gap', 'all', 'content_first', 'content_only', 'qid_gap',
  ])
  // The two that had a cron and no seat at the table.
  assertEquals(isCityRefreshScope('qid_gap'), true)
  assertEquals(isCityRefreshScope('alias_gap'), true)
  assertEquals(isCityRefreshScope('content_first'), true)
  assertEquals(isCityRefreshScope(undefined), false)
  assertEquals(isCityRefreshScope('qid-gap'), false)
  assertEquals(isCityRefreshScope(''), false)
})
