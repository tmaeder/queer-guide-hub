import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { decideField, runConsensus, sourceWeight, VENUE_FIELDS } from './venue-consensus.ts'

const ACCESS_SPEC = VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!

Deno.test('amenities + accessibility are voted as array union across sources', () => {
  const decisions = runConsensus([
    { source: 'google', data: { amenities: ['wifi', 'outdoor-seating'], accessibility_attributes: ['wheelchair-accessible'] } },
    { source: 'tripadvisor', data: { amenities: ['wifi', 'full-bar'], accessibility_attributes: ['wheelchair-accessible', 'accessible-restroom'] } },
  ])

  const am = decisions.find((d) => d.field === 'amenities')
  const ac = decisions.find((d) => d.field === 'accessibility_attributes')

  assertEquals((am?.winner as string[]).slice().sort(), ['full-bar', 'outdoor-seating', 'wifi'])
  assertEquals((ac?.winner as string[]).slice().sort(), ['accessible-restroom', 'wheelchair-accessible'])
  // multiple agreeing sources on an array union -> auto-committable
  assertEquals(am?.action, 'auto_commit')
  // agreement on accessibility is still agreement — the guard must not gate a
  // field merely because it is the accessibility field.
  assertEquals(ac?.action, 'auto_commit')
  assertEquals(ac?.conflicting, [])
})

// --- contradicting pairs ------------------------------------------------------
// Before this guard, `kind:'array'` unioned every contributor and reported
// `conflicting: []` unconditionally, so a venue could publish
// `wheelchair-accessible` AND `not-wheelchair-accessible` at confidence 0.96 and
// auto-commit. These tests are the precondition for writing accessibility at all.

Deno.test('OSM wheelchair=no vs Google accessible: keeps the NEGATIVE, never both', () => {
  const decisions = runConsensus([
    { source: 'osm', data: { accessibility_attributes: ['not-wheelchair-accessible'] } },
    { source: 'google', data: { accessibility_attributes: ['wheelchair-accessible', 'accessible-parking'] } },
  ])
  const ac = decisions.find((d) => d.field === 'accessibility_attributes')!

  // Union order is preserved (the pre-existing array contract) — the guard
  // filters, it does not re-sort.
  assertEquals(ac.winner, ['not-wheelchair-accessible', 'accessible-parking'])
  assertEquals((ac.winner as string[]).includes('wheelchair-accessible'), false)
})

Deno.test('a contradicted array NEVER auto-commits, however trusted the sources', () => {
  // admin (1.0) + google (0.85) is a noisy-OR of 1.0 — comfortably over any
  // threshold. The gate must come from the conflict, not from the confidence.
  const ac = decideField(
    VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!,
    [
      { source: 'admin', value: ['wheelchair-accessible'] },
      { source: 'google', value: ['not-wheelchair-accessible'] },
    ],
  )!
  assertEquals(ac.action, 'triage')
  assertEquals(ac.winner, ['not-wheelchair-accessible'])
})

Deno.test('the source whose claim was dropped is reported as conflicting', () => {
  const ac = decideField(ACCESS_SPEC, [
    { source: 'osm', value: ['not-step-free'] },
    { source: 'tripadvisor', value: ['step-free-entrance'] },
    { source: 'existing', value: ['hearing-loop'] },
  ])!
  // tripadvisor lost its only claim; osm and existing kept theirs.
  assertEquals(ac.conflicting, ['tripadvisor'])
  assertEquals(ac.agreeing.slice().sort(), ['existing', 'osm'])
  assertEquals(ac.winner, ['not-step-free', 'hearing-loop'])
})

Deno.test('a source contradicting ITSELF is caught too', () => {
  // One OSM element can carry wheelchair=no on the node and a mapper-added
  // wheelchair:description implying access. A single-source contradiction is
  // still a contradiction.
  const ac = decideField(
    VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!,
    [{ source: 'osm', value: ['wheelchair-accessible', 'not-wheelchair-accessible'] }],
  )!
  assertEquals(ac.action, 'triage')
  assertEquals(ac.winner, ['not-wheelchair-accessible'])
  assertEquals(ac.conflicting, ['osm'])
})

Deno.test('conflict scores exactly like the scalar branch: noisy-OR of survivors, then x0.7', () => {
  const clean = decideField(ACCESS_SPEC, [
    { source: 'osm', value: ['not-step-free'] },
    { source: 'tripadvisor', value: ['hearing-loop'] },
  ])!
  const conflicted = decideField(ACCESS_SPEC, [
    { source: 'osm', value: ['not-step-free'] },
    { source: 'tripadvisor', value: ['step-free-entrance'] },
  ])!

  // The penalty applies to the SURVIVING group only — tripadvisor is excluded
  // from `agreeing` before the noisy-OR, exactly as the scalar branch does.
  // (Comparing against `clean.confidence * 0.7` would be wrong: clean's
  // noisy-OR covers both sources.)
  const survivorOnly = 1 - (1 - sourceWeight('osm'))
  assertEquals(conflicted.confidence, Math.round(survivorOnly * 0.7 * 100) / 100)
  assertEquals(conflicted.confidence < clean.confidence, true)
  assertEquals(clean.action, 'auto_commit')
})

Deno.test('arrays with no declared contradictions are untouched by the guard', () => {
  // tags/images/amenities declare no pairs, so they keep the plain union path —
  // the guard must not start gating unrelated array fields.
  const tags = decideField(
    VENUE_FIELDS.find((f) => f.field === 'tags')!,
    [
      { source: 'osm', value: ['gay', 'lgbtq-primary'] },
      { source: 'google', value: ['gay'] },
    ],
  )!
  assertEquals(tags.action, 'auto_commit')
  assertEquals(tags.conflicting, [])
  assertEquals((tags.winner as string[]).slice().sort(), ['gay', 'lgbtq-primary'])
})

Deno.test('accessibility_attributes declares its contradictions in VENUE_FIELDS', () => {
  // Structural: the whole guard hangs off this one property. If a future edit
  // drops it, every test above silently starts exercising the plain union path,
  // so assert the wiring rather than only the behaviour.
  const spec = VENUE_FIELDS.find((f) => f.field === 'accessibility_attributes')!
  assertEquals(spec.kind, 'array')
  assertEquals((spec.contradictions?.length ?? 0) > 0, true)
})
