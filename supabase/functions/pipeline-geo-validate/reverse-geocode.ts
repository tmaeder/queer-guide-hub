// Reverse-geocoding provider for pipeline-geo-validate.
//
// WHY PHOTON AND NOT NOMINATIM (2026-10-22): the public Nominatim endpoint
// answers Supabase's egress with HTTP 403. Measured rather than inferred —
// `geo_validations` has not taken a write since 2026-09-24 (28 days), every
// recorded run body since 2026-10-03 reads `validated: 0`, and the three runs
// of 2026-10-03..05 returned HTTP **200** with 4/8/13 errors, so the job read
// `success` while validating nothing. The same two User-Agents that 403 from
// Supabase both return 200 from a laptop, so the block is on the EGRESS IP and
// not on the UA — do not "fix" this by rewording the User-Agent.
//
// Photon is the same OSM data and is ALREADY a working dependency of this
// repo from the same egress: `backfill-venue-cities` reverse-geocodes through
// it on a cron and wrote venue postal codes as recently as the morning this
// was measured. That is the evidence that matters; a 200 from a laptop is not.
//
// `&lang=en` is REQUIRED. Without it `country` comes back as the localized
// multi-name ("Schweiz/Suisse/Svizzera/Svizra") which matches nothing in
// `countries.name`; with it, measured over CH/US/AU/AE, Photon returns
// "Switzerland" / "United States" / "Australia" / "United Arab Emirates"
// plus a clean ISO-2 `countrycode`. Same rule, same reason, as the
// `photonReverse` in backfill-venue-cities.

const PHOTON_REVERSE = (Deno.env.get('PHOTON_REVERSE_URL') || 'https://photon.komoot.io/reverse').replace(/\/$/, '')

// Politeness interval. Photon's public instance is rate-limited; the repo's
// existing Photon caller uses 1100ms and this matches it. A self-hosted
// instance can drop it via PHOTON_INTERVAL_MS.
export const PHOTON_INTERVAL_MS = Number(Deno.env.get('PHOTON_INTERVAL_MS') || 1100)

export interface ReverseResult {
  country: string | null
  countryCode: string | null
  city: string | null
  state: string | null
  address: string | null
}

/**
 * Is this upstream status "ask again later" or "this is broken"?
 *
 * 429 and 5xx are weather: the server is telling us to slow down or is having
 * a bad minute, and filing that as our failure is how a job walks itself into
 * auto-pause (auto_pause_threshold is 3 and auto-pause sets enabled=false).
 *
 * EVERY OTHER 4xx — 401, 403, 404 — is HARD, and that is the load-bearing
 * half. 403 is the upstream saying "you are forbidden", which is exactly the
 * persistent-block signal that killed the Nominatim path for 28 days while
 * nothing went red. Classifying 403 as transient would have hidden the very
 * defect this module exists to fix. Same split as `_shared/llm-router.ts`,
 * where a 429 is not a breaker failure and any other non-429 4xx is.
 */
export function classifyGeocodeStatus(status: number): 'transient' | 'hard' {
  if (status === 429) return 'transient'
  if (status >= 500) return 'transient'
  return 'hard'
}

/** A thrown fetch error (abort, DNS, reset) is absence of evidence, not a verdict. */
export function classifyGeocodeError(message: string): 'transient' | 'hard' {
  return /abort|timeout|timed out|network|connection|reset|dns|unreachable/i.test(message)
    ? 'transient'
    : 'hard'
}

interface PhotonProperties {
  country?: string
  countrycode?: string
  city?: string
  town?: string
  village?: string
  district?: string
  locality?: string
  state?: string
  name?: string
  street?: string
  postcode?: string
}

/**
 * Map one Photon reverse feature onto the fields geo_validations stores.
 *
 * `county` is deliberately NOT a fallback for `state` — Photon's county for
 * Los Angeles is "Los Angeles", which is not a state. Same refusal as the
 * existing photonReverse in backfill-venue-cities.
 */
export function parsePhotonReverse(json: unknown): ReverseResult | null {
  const feat = (json as { features?: Array<{ properties?: PhotonProperties }> })?.features?.[0]
  if (!feat) return null
  const p = feat.properties ?? {}
  const city = p.city?.trim() || p.town?.trim() || p.village?.trim() ||
               p.district?.trim() || p.locality?.trim() || null
  // Photon has no `display_name`. Compose one from most- to least-specific so
  // the stored address is still human-readable; drop the empties rather than
  // emitting a string of commas.
  const address = [p.name, p.street, p.postcode, city, p.state, p.country]
    .map((x) => x?.trim())
    .filter((x): x is string => !!x)
    .join(', ') || null
  return {
    country: p.country?.trim() || null,
    countryCode: p.countrycode?.trim().toUpperCase().slice(0, 2) || null,
    city,
    state: p.state?.trim() || null,
    address,
  }
}

export class GeocodeFailure extends Error {
  readonly kind: 'transient' | 'hard'
  constructor(message: string, kind: 'transient' | 'hard') {
    super(message)
    this.kind = kind
  }
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<ReverseResult | null> {
  const url = `${PHOTON_REVERSE}?lat=${lat}&lon=${lon}&lang=en`
  let resp: Response
  try {
    resp = await fetch(url, {
      signal,
      // A contact URL in the User-Agent is what OSM-derived services ask for.
      headers: { 'User-Agent': 'QueerGuide/1.0 (https://queer.guide)' },
    })
  } catch (e) {
    const msg = (e as Error).message
    throw new GeocodeFailure(`Reverse geocoding failed: ${msg}`, classifyGeocodeError(msg))
  }
  if (!resp.ok) {
    throw new GeocodeFailure(
      `Reverse geocoding HTTP ${resp.status}`,
      classifyGeocodeStatus(resp.status),
    )
  }
  return parsePhotonReverse(await resp.json())
}
