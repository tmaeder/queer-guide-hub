// Unit tests for the same-name city collision guards.
// Run with: cd supabase/functions/_tests && deno test city-collision-guard.test.ts
import { assertEquals } from 'jsr:@std/assert'
import type { CollisionCandidate } from '../_shared/city-collision-guard.ts'
import {
  cityCollisionReason,
  claimedStatesFromText,
  proseStateContradiction,
  claimedStateFromMetroSlug,
  normalizeRegion,
  regionsContradict,
} from '../_shared/city-collision-guard.ts'

const PORTLAND_OR = { name: 'Portland', region_name: 'Oregon' }
const CHARLESTON_IL = { name: 'Charleston', region_name: 'Illinois' }
const SPRINGFIELD_VT = { name: 'Springfield', region_name: 'Vermont' }

// ── The three confirmed mis-links ────────────────────────────────────

Deno.test('guard B: portland-maine does not link to Portland, Oregon', () => {
  const r = cityCollisionReason(PORTLAND_OR, null, 'portland-maine', 'Portland')
  assertEquals(typeof r, 'string')
})

Deno.test('guard B: charlestonsc does not link to Charleston, Illinois', () => {
  const r = cityCollisionReason(CHARLESTON_IL, null, 'charlestonsc', 'Charleston')
  assertEquals(typeof r, 'string')
})

Deno.test('guard B: springfieldmo does not link to Springfield, Vermont', () => {
  const r = cityCollisionReason(SPRINGFIELD_VT, null, 'springfieldmo', 'Springfield')
  assertEquals(typeof r, 'string')
})

// ── Guard B must not block the correct city ──────────────────────────

Deno.test('guard B: a metro slug agreeing with the candidate links', () => {
  assertEquals(cityCollisionReason(PORTLAND_OR, null, 'portlandor', 'Portland'), null)
})

Deno.test('guard B: a slug with no state suffix is inert', () => {
  assertEquals(cityCollisionReason(PORTLAND_OR, null, 'portland', 'Portland'), null)
})

Deno.test('guard B: a non-US metro slug is inert', () => {
  const berlin = { name: 'Berlin', region_name: 'Berlin' }
  assertEquals(cityCollisionReason(berlin, null, 'berlin', 'Berlin'), null)
})

Deno.test('guard B: a slug that is not this city is inert', () => {
  // "sanfrancisco" does not start with "portland" — nothing is claimed.
  assertEquals(cityCollisionReason(PORTLAND_OR, null, 'sanfrancisco', 'Portland'), null)
})

Deno.test('guard B: multi-word city names normalize past spaces and dots', () => {
  const stLouis = { name: 'St. Louis', region_name: 'Missouri' }
  assertEquals(claimedStateFromMetroSlug('stlouismo', 'St. Louis'), 'Missouri')
  assertEquals(cityCollisionReason(stLouis, null, 'stlouismo', 'St. Louis'), null)
})

Deno.test('guard B: an unverifiable claim against an empty region blocks', () => {
  // Cannot corroborate — and the whole point is to stop guessing.
  const unknown = { name: 'Portland', region_name: null }
  assertEquals(typeof cityCollisionReason(unknown, null, 'portland-maine', 'Portland'), 'string')
})

// ── Guard A ──────────────────────────────────────────────────────────

Deno.test('guard A: a contradicting row state blocks', () => {
  assertEquals(typeof cityCollisionReason(PORTLAND_OR, 'Maine', null, 'Portland'), 'string')
})

Deno.test('guard A: a 2-letter state code is expanded before comparing', () => {
  // "OR" vs "Oregon" is agreement, not a contradiction — the SQL runner's raw
  // string compare would have blocked this one.
  assertEquals(cityCollisionReason(PORTLAND_OR, 'OR', null, 'Portland'), null)
  assertEquals(typeof cityCollisionReason(PORTLAND_OR, 'ME', null, 'Portland'), 'string')
})

Deno.test('guard A: an empty state on either side is inert', () => {
  assertEquals(cityCollisionReason(PORTLAND_OR, '', null, 'Portland'), null)
  assertEquals(cityCollisionReason(PORTLAND_OR, '   ', null, 'Portland'), null)
  assertEquals(cityCollisionReason({ name: 'Portland', region_name: null }, 'Maine', null, 'Portland'), null)
})

Deno.test('guard A: comparison is case- and whitespace-insensitive', () => {
  assertEquals(cityCollisionReason(PORTLAND_OR, '  oregon ', null, 'Portland'), null)
})

// ── Guard A false positives, measured on prod ────────────────────────
//
// Across the 114 already-linked events whose `state` disagreed with
// cities.region_name, 113 were these three shapes and only ONE was real. A
// guard that blocks them refuses correct links for Australia and Spain.

Deno.test('guard A: an opaque numeric region_name is not a contradiction', () => {
  // Melbourne, state "VIC", cities.region_name "07" — 27 events.
  assertEquals(cityCollisionReason({ name: 'Melbourne', region_name: '07' }, 'VIC', null, 'Melbourne'), null)
  assertEquals(cityCollisionReason({ name: 'Sydney', region_name: '02' }, 'NSW', null, 'Sydney'), null)
})

Deno.test('guard A: AU and CA codes expand, so they agree instead of blocking', () => {
  assertEquals(cityCollisionReason({ name: 'Byron Bay', region_name: 'New South Wales' }, 'NSW', null, 'Byron Bay'), null)
  assertEquals(cityCollisionReason({ name: 'Daylesford', region_name: 'Victoria' }, 'VIC', null, 'Daylesford'), null)
  assertEquals(cityCollisionReason({ name: 'Toronto', region_name: 'Ontario' }, 'ON', null, 'Toronto'), null)
})

Deno.test('guard A: administrative wording is agreement, not contradiction', () => {
  assertEquals(cityCollisionReason({ name: 'Madrid', region_name: 'Community of Madrid' }, 'Madrid', null, 'Madrid'), null)
  assertEquals(cityCollisionReason({ name: 'Valencia', region_name: 'Valencian Community' }, 'Valencia', null, 'Valencia'), null)
  assertEquals(cityCollisionReason({ name: 'Gijón', region_name: 'Principality of Asturias' }, 'Asturias', null, 'Gijón'), null)
})

Deno.test('guard A: an unrecognized short code carries no signal', () => {
  assertEquals(regionsContradict('XYZ', 'Oregon'), false)
})

Deno.test('guard A: a code claimed by two countries carries no signal', () => {
  // WA = Washington and Western Australia; NT = Northern Territory and
  // Northwest Territories. Resolving either way would be a guess.
  assertEquals(normalizeRegion('WA'), '')
  assertEquals(regionsContradict('WA', 'Western Australia'), false)
  assertEquals(regionsContradict('NT', 'Washington'), false)
})

Deno.test('guard A still has teeth: the one real mis-link in that cohort', () => {
  // A Durango, COLORADO event attached to Durango, Durango — in MEXICO.
  const durangoMx = { name: 'Durango', region_name: 'Durango' }
  assertEquals(typeof cityCollisionReason(durangoMx, 'Colorado', null, 'Durango'), 'string')
})

Deno.test('guard B is unaffected by the guard A relaxation', () => {
  // An opaque region_name still cannot corroborate an explicit metro claim.
  const r = cityCollisionReason({ name: 'Portland', region_name: '07' }, null, 'portland-maine', 'Portland')
  assertEquals(typeof r, 'string')
})

// ── Helpers ──────────────────────────────────────────────────────────

Deno.test('normalizeRegion expands codes and passes full names through', () => {
  assertEquals(normalizeRegion('ME'), 'maine')
  assertEquals(normalizeRegion('maine'), 'maine')
  assertEquals(normalizeRegion('Bavaria'), 'bavaria')
  assertEquals(normalizeRegion(null), '')
})

Deno.test('claimedStateFromMetroSlug reads the suffix, hyphenated or not', () => {
  assertEquals(claimedStateFromMetroSlug('portland-maine', 'Portland'), 'Maine')
  assertEquals(claimedStateFromMetroSlug('portlandme', 'Portland'), 'Maine')
  assertEquals(claimedStateFromMetroSlug('portland', 'Portland'), null)
  assertEquals(claimedStateFromMetroSlug(null, 'Portland'), null)
  assertEquals(claimedStateFromMetroSlug('portlandzz', 'Portland'), null)
})

// ── Guard C: corroboration from prose (the news path) ────────────────
//
// Titles below are real rows from `news_article_cities`, all 13 of which were
// attached to Portland, Oregon while naming Maine.

Deno.test('guard C: a Maine article does not link to Portland, Oregon', () => {
  for (const title of [
    "Maine's Highest Court Keeps Trans Athlete Referendum Off Ballot",
    "Maine Senate candidate Troy Jackson's greatest political asset may be that he's boring",
    // This row's TITLE says "Mainers", which \bMaine\b deliberately does not
    // match — demonyms are left alone to keep the rule conservative. It is
    // caught by its excerpt, which is why both call sites pass title+excerpt.
    'Trans Mainers Fight Back Against ICE. Jesse Holleran does coms for Equality Maine by day.',
    "Paganism's Growing Popularity in Maine",
  ]) {
    assertEquals(typeof proseStateContradiction(PORTLAND_OR, title), 'string', title)
  }
})

Deno.test('guard C: the other measured collision pairs block', () => {
  const cases: [CollisionCandidate, string][] = [
    [CHARLESTON_IL, 'Trans girl wins West Virginia state championship'],
    [SPRINGFIELD_VT, 'Anti-trans bill advances in Missouri'],
    [{ name: 'Columbia', region_name: 'Missouri' }, "Lindsey Graham's sister eyes a South Carolina Senate seat"],
    [{ name: 'Dover', region_name: 'New Hampshire' }, 'Delaware Governor Signs Parentage Bill'],
    [{ name: 'Glendale', region_name: 'California' }, 'The Heartbreaking Mystery of Jhessye Shockley in Arizona'],
    [{ name: 'Jackson', region_name: 'Wyoming' }, 'A Mississippi clinic closes its doors'],
  ]
  for (const [city, text] of cases) {
    assertEquals(typeof proseStateContradiction(city, text), 'string', `${city.name}: ${text}`)
  }
})

Deno.test('guard C: naming the candidate own state clears it', () => {
  // Corroboration outranks a competing mention.
  assertEquals(proseStateContradiction(PORTLAND_OR, 'Portland, Oregon opens a new shelter'), null)
  assertEquals(
    proseStateContradiction(PORTLAND_OR, 'Oregon and Maine both expanded trans healthcare'),
    null,
  )
})

Deno.test('guard C: a text naming no state is inert', () => {
  assertEquals(proseStateContradiction(PORTLAND_OR, 'Portland Pride draws record crowds'), null)
  assertEquals(proseStateContradiction(PORTLAND_OR, ''), null)
  assertEquals(proseStateContradiction(PORTLAND_OR, null), null)
})

// ── Guard C false positives, measured on prod ────────────────────────
//
// The unnarrowed rule ("any disagreeing state blocks") fired on 873 of 9,538 US
// city links and was overwhelmingly wrong. These are the shapes that killed it.

Deno.test('guard C: an unambiguous city name is never blocked by a passing mention', () => {
  // Seattle has no twin, so an article referencing Indiana is not evidence.
  assertEquals(
    proseStateContradiction({ name: 'Seattle', region_name: 'Washington' },
      "Stefanie Dolson's message to Sophie Cunningham: 'Trans rights are human rights' (Indiana)"), null,
  )
  // A SCOTUS roundup naming several states must not unlink Detroit.
  assertEquals(
    proseStateContradiction({ name: 'Detroit', region_name: 'Michigan' },
      'SCOTUS Summary: LGBTQ Rights Cases from Iowa and New York'), null,
  )
})

Deno.test('guard C: a state inside the city own name is not a contradiction', () => {
  // "Kansas City, Missouri" vs every mention of Kansas — the largest
  // false-positive group before the substring exclusion.
  assertEquals(
    proseStateContradiction({ name: 'Kansas City', region_name: 'Missouri' },
      "Kansas Revokes Driver's Licenses from Trans Residents"), null,
  )
  assertEquals(claimedStatesFromText('Kansas voids licenses', 'Kansas City'), [])
})

Deno.test('guard C: Washington is not a claimed-state signal', () => {
  // State, city, and the everyday name for DC. It produced false blocks on
  // Arlington, Virginia, a DC-metro city.
  assertEquals(claimedStatesFromText('Lawmakers Honored at AIDSWatch in Washington', 'Arlington'), [])
  assertEquals(
    proseStateContradiction({ name: 'Alexandria', region_name: 'Virginia' },
      'Rally in Washington draws hundreds'), null,
  )
})

Deno.test('guard C: an empty region_name cannot be corroborated against', () => {
  assertEquals(proseStateContradiction({ name: 'Portland', region_name: null }, 'A Maine story'), null)
})

Deno.test('guard C: state matching is word-bounded', () => {
  // "Indianapolis" contains "Indiana"; "Delaware County" is a real trap only
  // if we match loosely.
  assertEquals(claimedStatesFromText('Indianapolis hosts the finals', 'Aurora'), [])
  assertEquals(claimedStatesFromText('Ohioans rally downtown', 'Aurora'), [])
})
