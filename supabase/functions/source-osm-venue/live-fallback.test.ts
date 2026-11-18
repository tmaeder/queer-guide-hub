import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { discoverCandidates, refreshCity } from './live-fallback.ts'
const city = { name: 'Berlin', bbox: [52.338, 13.088, 52.675, 13.761] as [number, number, number, number] }
const discovery = { snapshot: '2026-09-21', candidates: [{ id: 7, lat: 52.5, lon: 13.4 }] }
const node = { id: 7, type: 'node', lat: 52.51, lon: 13.41, version: 8, tags: { name: 'Current name', amenity: 'bar', lgbtq: 'yes' } }
Deno.test('live fallback imports current tags and coordinates, never snapshot content', async () => {
  const rows = await refreshCity(discovery, city, Date.now() + 1000, ((url, init) => {
    assertEquals(String(url), 'https://api.openstreetmap.org/api/0.6/nodes.json?nodes=7')
    assertEquals((init as { redirect?: string })?.redirect, 'error')
    return Promise.resolve(Response.json({ elements: [node] }))
  }) as typeof fetch)
  assertEquals(rows?.[0].lat, 52.51)
  assertEquals(rows?.[0].tags, node.tags)
  assertEquals((rows?.[0].import_provenance as Record<string, unknown>).discovery_snapshot, '2026-09-21')
})
Deno.test('removed relevance, moved nodes and absent snapshot candidates remain unknown', async () => {
  for (const changed of [{ ...node, tags: { name: 'Now ordinary', amenity: 'bar' } }, { ...node, lat: 40 }, { ...node, visible: false }]) {
    assertEquals(await refreshCity(discovery, city, Date.now() + 1000, (() => Promise.resolve(Response.json({ elements: [changed] }))) as typeof fetch), null)
  }
  assertEquals(await refreshCity({ ...discovery, candidates: [] }, city, Date.now() + 1000, (() => { throw Error('must not fetch') }) as typeof fetch), null)
})
Deno.test('live refresh rejects unexpected identities and upstream failures', async () => {
  await assertRejects(() => refreshCity(discovery, city, Date.now() + 1000, (() => Promise.resolve(Response.json({ elements: [{ ...node, id: 8 }] }))) as typeof fetch), Error, 'Unexpected live OSM identity')
  await assertRejects(() => refreshCity(discovery, city, Date.now() + 1000, (() => Promise.resolve(Response.json({}, { status: 429 }))) as typeof fetch), Error, 'HTTP 429')
})
Deno.test('discovery rejects stale, malformed and truncated snapshots', async () => {
  const now = Date.now
  Date.now = () => Date.parse('2026-11-18T00:00:00Z')
  try {
    const binding = { node: { type: 'uri', value: 'https://www.openstreetmap.org/node/7' }, loc: { value: 'POINT(13.4 52.5)' } }
    const run = (name: string, bindings: unknown[]) => discoverCandidates(Date.now() + 1000, ((url) => Promise.resolve(Response.json(String(url).includes('cmd=stats') ? { 'name-index': name } : { results: { bindings } }))) as typeof fetch)
    assertEquals((await run('planet-260921.osm.pbf', [binding])).candidates, discovery.candidates)
    await assertRejects(() => run('planet-250921.osm.pbf', [binding]), Error, 'outside allowed age')
    await assertRejects(() => run('planet-260921.osm.pbf', Array(10001).fill(binding)), Error, 'incomplete')
    await assertRejects(() => run('planet-260921.osm.pbf', [{ ...binding, node: { type: 'uri', value: 'https://foreign.example/node/7' } }]), Error, 'Malformed')
  } finally { Date.now = now }
})

Deno.test('Cape Town uses time-limited first-party relevance evidence without inventing OSM tags', async () => {
  const now = Date.now
  Date.now = () => Date.parse('2026-11-18T06:00:00Z')
  try {
    const capeTown = { name: 'Cape Town', bbox: [-34.358, 18.295, -33.743, 18.945] as [number, number, number, number] }
    const live = { type: 'node', id: 4802447522, lat: -33.9162396, lon: 18.417165, tags: { name: 'Cafe Manhattan', amenity: 'restaurant', 'addr:housenumber': '74', 'addr:street': 'Waterkant Street' } }
    const fetcher = (() => Promise.resolve(Response.json({ elements: [live] }))) as typeof fetch
    const rows = await refreshCity({ snapshot: '2026-09-21', candidates: [] }, capeTown, Date.now() + 1000, fetcher)
    assertEquals(rows?.[0].tags, live.tags)
    assertEquals((rows?.[0].relevance_evidence as Record<string, unknown>).source_url, 'https://cafemanhattan.co.za/')
    assertEquals((rows?.[0].import_provenance as Record<string, unknown>).coverage, 'verified_seed_candidates')
    for (const changed of [{ ...live, lat: 0 }, { ...live, tags: { ...live.tags, name: 'Different business' } }, { ...live, tags: { ...live.tags, 'addr:housenumber': '75' } }]) {
      assertEquals(await refreshCity({ snapshot: '2026-09-21', candidates: [] }, capeTown, Date.now() + 1000, (() => Promise.resolve(Response.json({ elements: [changed] }))) as typeof fetch), null)
    }
    Date.now = () => Date.parse('2027-03-01T00:00:00Z')
    assertEquals(await refreshCity({ snapshot: '2026-09-21', candidates: [] }, capeTown, Date.now() + 1000, (() => { throw Error('expired evidence must not fetch') }) as typeof fetch), null)
  } finally { Date.now = now }
})
