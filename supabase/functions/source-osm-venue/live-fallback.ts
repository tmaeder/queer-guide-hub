import { verifiedSeeds, matchesVerifiedSeed } from './verified-seeds.ts'

// QLever is discovery only. Never stage its snapshot's tags or coordinates.
export type City = { name: string; bbox: [number, number, number, number] }
type Candidate = { id: number; lat: number; lon: number }
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const QLEVER = 'https://qlever.dev/api/osm-planet'
const QUERY = `PREFIX k: <https://www.openstreetmap.org/wiki/Key:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
SELECT DISTINCT ?node ?loc WHERE {
 { ?node k:lgbtq ?v . FILTER(?v IN ("yes","primary","only")) }
 UNION { ?node k:gay "yes" } UNION { ?node k:lesbian "yes" }
 UNION { ?node k:lgbtq:primary "yes" } UNION { ?node k:community "lgbtq" }
 FILTER(STRSTARTS(STR(?node),"https://www.openstreetmap.org/node/"))
 ?node geo:hasGeometry/geo:asWKT ?loc .
} LIMIT 10001`

async function getJson(url: string, deadline: number, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  const remaining = deadline - Date.now()
  if (remaining <= 0) throw new Error('OSM fallback deadline reached')
  const response = await fetcher(url, { redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': UA }, signal: AbortSignal.timeout(Math.min(15_000, remaining)) })
  if (!response.ok || !response.body) throw new Error(`OSM fallback HTTP ${response.status}`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2_000_000) throw new Error('OSM fallback response too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function isRelevant(tags: Record<string, string>): boolean {
  return Boolean(((['yes', 'primary', 'only'].includes(tags.lgbtq) || tags.gay === 'yes') && (tags.amenity || tags.tourism)) ||
    (tags.lesbian === 'yes' && tags.amenity) || tags['lgbtq:primary'] === 'yes' || tags.community === 'lgbtq')
}
function inside(lat: number, lon: number, city: City): boolean {
  const [south, west, north, east] = city.bbox
  return lat >= south && lat <= north && lon >= west && lon <= east
}

export async function discoverCandidates(deadline: number, fetcher: typeof fetch = fetch) {
  const stats = await getJson(`${QLEVER}?cmd=stats`, deadline, fetcher)
  const match = String(stats['name-index']).match(/planet-(\d{2})(\d{2})(\d{2})\.osm\.pbf/)
  if (!match) throw new Error('OSM discovery snapshot date missing')
  const snapshot = `20${match[1]}-${match[2]}-${match[3]}`
  const age = Date.now() - Date.parse(snapshot)
  if (!Number.isFinite(age) || age < -86_400_000 || age > 180 * 86_400_000) throw new Error('OSM discovery snapshot outside allowed age')
  const payload = await getJson(`${QLEVER}?query=${encodeURIComponent(QUERY)}`, deadline, fetcher)
  const bindings = (payload.results as { bindings?: Array<{ node?: { type?: string; value?: string }; loc?: { value?: string } }> })?.bindings
  if (!Array.isArray(bindings) || bindings.length === 0 || bindings.length >= 10001) throw new Error('OSM discovery incomplete or empty')
  const candidates: Candidate[] = []
  const seen = new Set<number>()
  for (const row of bindings) {
    const idMatch = row.node?.type === 'uri' && row.node.value?.match(/^https:\/\/www\.openstreetmap\.org\/node\/([1-9]\d*)$/)
    const point = row.loc?.value?.match(/^POINT\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i)
    if (!idMatch || !point) throw new Error('Malformed OSM discovery candidate')
    const id = Number(idMatch[1]), lat = Number(point[2]), lon = Number(point[1])
    if (!Number.isSafeInteger(id) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Invalid OSM discovery candidate')
    if (!seen.has(id)) { candidates.push({ id, lat, lon }); seen.add(id) }
  }
  return { candidates, snapshot }
}

export async function refreshCity(discovery: Awaited<ReturnType<typeof discoverCandidates>>, city: City, deadline: number, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>[] | null> {
  const indexed = discovery.candidates.filter(node => inside(node.lat, node.lon, city))
  const seeds = verifiedSeeds(city.name)
  const candidates = indexed.length ? indexed : seeds
  // No candidates is not proof of current absence in an older discovery index.
  if (!candidates.length) return null
  const selected = candidates.slice(0, 100)
  const requested = new Set(selected.map(node => node.id))
  const payload = await getJson(`https://api.openstreetmap.org/api/0.6/nodes.json?nodes=${selected.map(node => node.id).join(',')}`, deadline, fetcher)
  if (!Array.isArray(payload.elements)) throw new Error('Invalid live OSM response')
  const result: Record<string, unknown>[] = []
  const seen = new Set<number>()
  for (const el of payload.elements as Record<string, unknown>[]) {
    if (el.type !== 'node' || !requested.has(el.id as number) || seen.has(el.id as number)) throw new Error('Unexpected live OSM identity')
    seen.add(el.id as number)
    const lat = el.lat as number, lon = el.lon as number
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('Invalid live OSM coordinates')
    const tags = el.tags as Record<string, string> | undefined
    const seed = seeds.find(seed => seed.id === el.id)
    const evidence = seed && tags && matchesVerifiedSeed(tags, seed.evidence) ? seed.evidence : undefined
    if (el.visible === false || !tags || !tags.name || !inside(lat, lon, city) || (!isRelevant(tags) && !evidence)) continue
    result.push({ type: 'node', id: el.id, lat, lon, tags, timestamp: el.timestamp, version: el.version, ...(evidence ? { relevance_evidence: evidence } : {}),
      import_provenance: { discovery_provider: indexed.length ? 'qlever' : 'first-party-verified-osm-seed', discovery_snapshot: indexed.length ? discovery.snapshot : undefined, live_provider: 'openstreetmap-api', coverage: indexed.length ? 'snapshot_candidates' : 'verified_seed_candidates', fetched_at: new Date().toISOString(), candidates_truncated: candidates.length > selected.length } })
  }
  return result.length ? result : null
}
