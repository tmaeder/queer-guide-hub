// Drift guard: the TypeScript pair list and the SQL vocabulary must agree.
//
// The contradiction guard is enforced in TWO places on purpose — the comparator
// in venue-consensus.ts (so a staged conflict gates to review before it is ever
// written) and a BEFORE trigger on venues/events (so the four other writers of
// the column cannot get around it). Two enforcement points means two copies of
// the pair list, and a silent divergence would disable one half while the other
// kept reporting healthy.
//
// The migration is the single written source; this test makes the TS constant
// derive from it in CI rather than by hand. Same shape as the venueCategories
// drift test, which parses the migration carrying the latest CHECK definition.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ACCESSIBILITY_CONTRADICTIONS } from './accessibility-vocab.ts'
import { OSM_ACCESSIBILITY_SLUGS } from './osm-accessibility.ts'

// This file lives in supabase/functions/_shared/, so the migrations are two up.
const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url)

/** Newest migration whose text contains `needle` — a later migration that
 *  redefines the vocabulary is what must be checked, not the first one. */
async function latestMigrationContaining(needle: string): Promise<string> {
  const names: string[] = []
  for await (const e of Deno.readDir(MIGRATIONS_DIR)) {
    if (e.isFile && e.name.endsWith('.sql')) names.push(e.name)
  }
  names.sort()
  for (const name of names.reverse()) {
    const sql = await Deno.readTextFile(new URL(name, MIGRATIONS_DIR))
    if (sql.includes(needle)) return sql
  }
  throw new Error(`no migration contains ${needle}`)
}

Deno.test('ACCESSIBILITY_CONTRADICTIONS matches the pairs seeded into public.amenities', async () => {
  const sql = await latestMigrationContaining('WITH pairs(positive_slug, negative_slug)')
  const block = sql.slice(sql.indexOf('WITH pairs(positive_slug, negative_slug)'))
  const values = block.slice(0, block.indexOf(')\nUPDATE'))

  const seeded = [...values.matchAll(/\('([a-z0-9-]+)',\s*'([a-z0-9-]+)'\)/g)]
    .map(([, pos, neg]) => `${pos}|${neg}`)

  assertEquals(
    seeded,
    ACCESSIBILITY_CONTRADICTIONS.map(([p, n]) => `${p}|${n}`),
    'the TS pair list and the SQL seed disagree — the trigger and the comparator would enforce different rules',
  )
})

Deno.test('every slug osm-accessibility.ts can emit is asserted by the migration', async () => {
  // The migration RAISEs if any of these is missing from public.amenities. If
  // the TS list grows and the SQL assertion does not, a new slug reaches the
  // column, gets default-rejected downstream, and renders as "no data" — which
  // is indistinguishable from never having looked.
  const sql = await latestMigrationContaining('osm-accessibility.ts emits slugs absent from the vocabulary')
  const block = sql.slice(sql.indexOf("FROM unnest(array["))
  const asserted = [...block.slice(0, block.indexOf(']) s')).matchAll(/'([a-z0-9-]+)'/g)]
    .map(([, s]) => s)
    .sort()

  assertEquals(asserted, [...OSM_ACCESSIBILITY_SLUGS].sort())
})

Deno.test('both negatives and positives are present in the OSM slug list', async () => {
  // A positive-only mapper would silently collapse every `no` into absence,
  // which is the failure the whole vocabulary exists to prevent — and it would
  // still pass both tests above.
  for (const [pos, neg] of ACCESSIBILITY_CONTRADICTIONS) {
    if (!OSM_ACCESSIBILITY_SLUGS.includes(pos) && !OSM_ACCESSIBILITY_SLUGS.includes(neg)) continue
    assertEquals(
      OSM_ACCESSIBILITY_SLUGS.includes(neg), true,
      `${pos} is reachable from OSM but ${neg} is not — a 'no' would be dropped`,
    )
  }
})
