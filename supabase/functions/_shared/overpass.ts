// Overpass API — response classification and element matching. Pure. No I/O.
//
// Both traps below are MEASURED and each cost a full run when ignored. They are
// modelled here as separate verdicts rather than a boolean, because collapsing
// them is precisely how the damage happened.

import { normalizeName } from './venue-pipeline-utils.ts'

/**
 * Planet mirrors only.
 *
 * `overpass.osm.ch` is a SWITZERLAND-ONLY extract that returns a clean
 * `200 {"elements":[]}` for the rest of the world with no `remark` at all.
 * Nothing in the response says "I am a regional extract". Pinned to a third of a
 * 487-city run it cached "no network" for ~450 cities and the run reported its
 * yield as if that were data. Never add a regional extract here, and never trust
 * an endpoint that has not passed `isPlanetControlResult`.
 */
export const OVERPASS_ENDPOINTS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/**
 * A control query the whole planet agrees on: Berlin's U-Bahn route relations.
 * An endpoint that cannot answer this is either regional or broken, and must be
 * dropped before the real run starts rather than diagnosed from its results.
 */
export const CONTROL_QUERY = `[out:json][timeout:25];
relation["route"="subway"](52.40,13.20,52.60,13.60);
out ids;`

export const CONTROL_QUERY_MIN_ELEMENTS = 5

export type OverpassVerdict = 'ok' | 'timeout' | 'regional' | 'busy' | 'error'

interface OverpassBody {
  elements?: unknown[]
  remark?: string
}

/**
 * Classify one Overpass response.
 *
 * - `timeout`  — HTTP 200 with a `remark`. Overpass reports a query that ran out
 *                of time or memory as a SUCCESS with an empty (or partial)
 *                element list plus a remark. A bare `res.ok` check cached
 *                "Madrid has no metro". Retryable; the result means UNKNOWN, and
 *                unknown must never be recorded as absent.
 * - `regional` — HTTP 200, no remark, zero elements. Either a genuinely empty
 *                area or a regional extract, and the response cannot tell you
 *                which — so for a PROBE it condemns the endpoint immediately
 *                (no backoff would ever fix it). For a real per-venue query the
 *                caller reads this as "nothing mapped here", which is safe only
 *                because the endpoint already passed the control query.
 * - `busy`     — 429/5xx. After a few thousand requests both real mirrors 504
 *                for a while; retry with backoff rather than condemning.
 */
export function classifyOverpassResponse(status: number, body: OverpassBody | null): OverpassVerdict {
  if (status === 429 || status >= 500) return 'busy'
  if (status !== 200) return 'error'
  const b = body ?? {}
  // The remark is checked BEFORE the element count: a partial result carrying a
  // remark is still a truncated answer, not a complete one.
  if (typeof b.remark === 'string' && b.remark.trim() !== '') return 'timeout'
  return (b.elements?.length ?? 0) > 0 ? 'ok' : 'regional'
}

/** True only if this endpoint answered the planet control query with real data. */
export function isPlanetControlResult(status: number, body: OverpassBody | null): boolean {
  if (classifyOverpassResponse(status, body) !== 'ok') return false
  return (body?.elements?.length ?? 0) >= CONTROL_QUERY_MIN_ELEMENTS
}

export interface OverpassElement {
  type?: string
  id?: number
  tags?: Record<string, string>
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
}

export interface ElementMatch {
  element?: OverpassElement
  reason?: 'no_match' | 'ambiguous'
}

/**
 * Choose the element that IS this venue, or refuse.
 *
 * PROXIMITY ALONE MAY NEVER ATTRIBUTE AN ACCESS CLAIM. A 60 m radius around a
 * bar in Berlin returns dozens of features; taking the wheelchair tag off
 * whichever came back first would publish the pharmacy next door's front step as
 * our venue's. So identity needs a second, independent signal — the name — and
 * where the reference cannot distinguish two candidates we BLOCK rather than
 * guess: a null result is recoverable, a wrong one is not.
 *
 * @param osmRef optional `type/id` we already hold for this venue (venue_sources
 *               or platform_ids.osm). Identity is then known and nothing is
 *               inferred. A stale ref simply falls through to the name arm.
 */
export function pickMatchingElement(
  elements: OverpassElement[],
  venueName: string,
  osmRef?: string | null,
): ElementMatch {
  if (osmRef) {
    const hit = elements.find((e) => `${e.type}/${e.id}` === osmRef)
    if (hit) return { element: hit }
  }

  const want = normalizeName(venueName)
  if (!want) return { reason: 'no_match' }

  const named = elements.filter((e) => {
    const n = e.tags?.name ?? e.tags?.['name:en'] ?? ''
    return n && normalizeName(n) === want
  })

  if (named.length === 1) return { element: named[0] }
  if (named.length > 1) return { reason: 'ambiguous' }
  return { reason: 'no_match' }
}

/** Query A from docs/architecture/open-data-integration.md §3.2, radius in metres. */
export function buildAroundQuery(lat: number, lon: number, radiusM: number, timeoutS = 60): string {
  return `[out:json][timeout:${timeoutS}];
(
  nwr(around:${radiusM},${lat},${lon})["amenity"];
  nwr(around:${radiusM},${lat},${lon})["tourism"];
  nwr(around:${radiusM},${lat},${lon})["leisure"];
);
out tags center;`
}
