// Unit tests for the same-name city collision guards.
// Run with: cd supabase/functions/_tests && deno test city-collision-guard.test.ts
import { assertEquals } from 'jsr:@std/assert'
import {
  cityCollisionReason,
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
