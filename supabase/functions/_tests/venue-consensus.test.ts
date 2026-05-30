/**
 * Unit tests for the pure venue consensus voting logic.
 * No network — imports the module directly. Run with `deno test`.
 */
import { assertEquals } from 'jsr:@std/assert'
import {
  decideField,
  runConsensus,
  evaluateClosure,
  closureSignal,
  sourceWeight,
  type SourceRecord,
} from '../_shared/venue-consensus.ts'

Deno.test('two agreeing sources beat the auto-commit threshold', () => {
  const d = decideField(
    { field: 'name', path: 'name', kind: 'identity' },
    [
      { source: 'google', value: 'Berghain' },
      { source: 'osm', value: 'berghain' }, // normalizes equal
    ],
    0.85,
  )
  assertEquals(d?.agreeing.length, 2)
  assertEquals(d?.action, 'auto_commit')
  assertEquals(d!.confidence >= 0.85, true)
})

Deno.test('single source stays below auto threshold for risky scalar', () => {
  const d = decideField(
    { field: 'name', path: 'name', kind: 'identity' },
    [{ source: 'osm', value: 'Some Bar' }], // osm weight 0.7
    0.85,
  )
  assertEquals(d?.agreeing, ['osm'])
  assertEquals(d?.action, 'triage')
})

Deno.test('conflict picks the higher-trust group and flags conflicting sources', () => {
  const d = decideField(
    { field: 'website', path: 'contacts.website', kind: 'url' },
    [
      { source: 'google', value: 'https://berghain.berlin' },
      { source: 'admin', value: 'http://www.berghain.berlin/club' }, // same domain → agrees
      { source: 'osm', value: 'https://wrong-site.example' },
    ],
    0.85,
  )
  // admin + google share the domain; osm conflicts
  assertEquals(d?.conflicting, ['osm'])
  assertEquals(d?.winningSource, 'admin')
})

Deno.test('array fields union across all contributing sources', () => {
  const d = decideField(
    { field: 'tags', path: 'tags', kind: 'array' },
    [
      { source: 'osm', value: ['gay', 'club'] },
      { source: 'google', value: ['club', 'techno'] },
    ],
    0.85,
  )
  const winner = d?.winner as string[]
  assertEquals(winner.length, 3) // gay, club, techno (deduped)
  assertEquals(d?.conflicting.length, 0)
})

Deno.test('numeric fields average within tolerance', () => {
  const d = decideField(
    { field: 'lgbti_relevance_score', path: 'lgbti_relevance_score', kind: 'number', tolerance: 0.15 },
    [
      { source: 'google', value: 0.8 },
      { source: 'osm', value: 0.9 }, // within 0.15 → agree
    ],
    0.85,
  )
  assertEquals(d!.winner as number >= 0.8 && (d!.winner as number) <= 0.9, true)
  assertEquals(d?.conflicting.length, 0)
})

Deno.test('runConsensus reconciles a full venue across sources + existing', () => {
  const sources: SourceRecord[] = [
    { source: 'google', data: { name: 'Pride Bar', contacts: { website: 'https://pridebar.com' }, location: { lat: 52.5, lng: 13.4 } } },
    { source: 'osm', data: { name: 'pride bar', location: { lat: 52.5001, lng: 13.4001 } } },
    { source: 'existing', data: { name: 'Pride Bar', tags: ['lgbtq'] } },
  ]
  const decisions = runConsensus(sources, 0.85)
  const nameDecision = decisions.find((d) => d.field === 'name')
  assertEquals(nameDecision?.agreeing.length, 3)
  assertEquals(nameDecision?.action, 'auto_commit')
})

Deno.test('closure: two independent signals auto-close, one only flags', () => {
  const sigs = [
    closureSignal('google', { metadata: { business_status: 'CLOSED_PERMANENTLY' } }),
    closureSignal('website', { metadata: { url_status: '404' } }),
  ].filter(Boolean) as { source: string; reason: string }[]
  assertEquals(evaluateClosure(sigs).closed, true)

  const one = [closureSignal('google', { metadata: { business_status: 'CLOSED_PERMANENTLY' } })].filter(Boolean) as { source: string; reason: string }[]
  const v = evaluateClosure(one)
  assertEquals(v.closed, false)
  assertEquals(v.needsAttention, true)
})

Deno.test('source weights: admin outranks discovery sources', () => {
  assertEquals(sourceWeight('admin') > sourceWeight('google'), true)
  assertEquals(sourceWeight('google') > sourceWeight('osm'), true)
  assertEquals(sourceWeight('unknown-source'), 0.5)
})
