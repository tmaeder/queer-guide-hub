import { getServiceClient, requireAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import {
  buildForwardQuery,
  countryContradicts,
  haversineKm,
  hasLocalityContext,
  isBareStreetAddress,
  isLocalityFallback,
  postalContradicts,
  stampGeocode,
  type CountryRef,
  type GeoVenue,
} from './geocode-guard.ts'

// Batch geocode venues missing city data.
// Two modes controlled by `mode` param:
//   "reverse" (default) — venues with coords but no city_id → reverse geocode
//   "forward"           — venues with address but no coords → forward geocode
//
// Uses Nominatim (public or self-hosted). Public rate limit: 1 req/sec.
// Call with: { "mode": "forward", "batch_size": 25 }
// Idempotent & resumable — always picks the next unprocessed batch.

const NOMINATIM_BASE = (Deno.env.get('NOMINATIM_URL') || 'https://nominatim.openstreetmap.org').replace(/\/$/, '')
const NOMINATIM_AUTH = Deno.env.get('NOMINATIM_BASIC_AUTH') || ''
const SLEEP_MS = Deno.env.get('NOMINATIM_URL') ? 50 : 1100
// Soft deadline for a batch loop. The forward cron posts with
// timeout_milliseconds := 55000; break early and resume next tick instead of
// having the whole invocation cut off mid-write.
const MAX_RUN_MS = Number(Deno.env.get('GEOCODE_MAX_RUN_MS') || 45000)

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  postcode?: string
  country?: string
  country_code?: string
}

interface NominatimResult {
  lat?: string
  lon?: string
  class?: string
  type?: string
  addresstype?: string
  display_name?: string
  address?: NominatimAddress
}

interface VenueResult {
  id: string
  status: string
  city_name?: string
  city_id?: string
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

function nominatimHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'QueerGuide/1.0 (https://queer.guide)',
    'Accept': 'application/json',
  }
  if (NOMINATIM_AUTH) {
    h['Authorization'] = `Basic ${btoa(NOMINATIM_AUTH)}`
  }
  return h
}

// Shared: match a city name against our cities table, auto-create if missing
async function matchCity(
  supabase: ReturnType<typeof getServiceClient>,
  cityName: string,
  countryCode: string | null,
  coords?: { lat: number; lon: number } | null,
): Promise<{ id: string; country_id: string } | null> {
  // Strip parenthetical suffix: "Berlin (DE)" → "Berlin"
  const cleanName = cityName.includes('(') ? cityName.split('(')[0].trim() : cityName

  // Try name + country first. NB: cities has no `country_code` column — scope by
  // country_id (resolved from the ISO-2 code) and exclude placeholder ("tmp-")
  // stubs so we never link to a hidden bucket city.
  if (countryCode) {
    const scopedCountryId = await resolveCountryId(supabase, countryCode)
    if (scopedCountryId) {
      const { data } = await supabase
        .from('cities')
        .select('id, country_id')
        .or(`name.ilike.${cleanName},name.ilike.${cityName}`)
        .eq('country_id', scopedCountryId)
        .is('duplicate_of_id', null)
        .not('slug', 'like', 'tmp-%')
        .order('population', { ascending: false, nullsFirst: false })
        .limit(1)
        .single()
      if (data) return data
    }
  }
  // There is deliberately NO cross-country fallback here.
  //
  // This used to be "name only, largest by population", which is not a
  // fallback but an active preference for the bigger same-name city: it is
  // how Portland ME became Portland OR and Charleston SC became Charleston IL.
  // `cities` holds at most one row per (name, country), so a name-only hit
  // proves nothing — an unrepresentable twin looks exactly like a genuinely
  // unambiguous name. Refusing is the safe direction: a NULL city_id is
  // recoverable, a wrong one is not. `commit_city_staging_item` takes the same
  // position and raises `city_unresolved_country` rather than guessing.

  // Curated aliases, still scoped to the country when we know it.
  let aliasQuery = supabase
    .from('city_aliases')
    .select('city_id, cities!inner(id, country_id)')
    .or(`alias.ilike.${cleanName},alias.ilike.${cityName}`)
  if (countryCode) {
    const aliasCountryId = await resolveCountryId(supabase, countryCode)
    if (aliasCountryId) aliasQuery = aliasQuery.eq('cities.country_id', aliasCountryId)
  }
  const { data: aliasMatch } = await aliasQuery.limit(1).single()
  if (aliasMatch?.cities) {
    const c = aliasMatch.cities as unknown as { id: string; country_id: string }
    return { id: c.id, country_id: c.country_id }
  }

  // City not found — auto-create if we have a country
  if (!countryCode) return null
  const countryId = await resolveCountryId(supabase, countryCode)
  if (!countryId) return null

  const insert: Record<string, unknown> = {
    name: cleanName,
    country_id: countryId,
    data_source: 'nominatim-geocode',
  }
  if (coords?.lat && coords?.lon) {
    insert.latitude = coords.lat
    insert.longitude = coords.lon
  }

  // Plain insert, not upsert. `onConflict: 'country_id,name_normalized'` names
  // uk_cities_country_name_active, which is a PARTIAL index
  // (WHERE duplicate_of_id IS NULL); PostgREST cannot emit the predicate, so
  // arbiter inference was never guaranteed and the re-fetch below was already
  // the load-bearing path. Making that explicit removes the illusion of an
  // upsert. The re-fetch also covers the case where
  // trg_cities_aa_split_name rewrote the name onto an existing row.
  const { data: created, error: createErr } = await supabase
    .from('cities')
    .insert(insert)
    .select('id, country_id')
    .maybeSingle()

  if (createErr || !created) {
    const { data: retry } = await supabase
      .from('cities')
      .select('id, country_id')
      .or(`name.ilike.${cleanName},name.ilike.${cityName}`)
      .eq('country_id', countryId)
      .is('duplicate_of_id', null)
      .limit(1)
      .maybeSingle()
    if (retry) return retry
    if (createErr) {
      console.error(`matchCity: insert failed for "${cleanName}" (${countryCode}): ${createErr.message}`)
    }
    return null
  }

  console.log(`Auto-created city: ${cityName} (${countryCode})`)
  return created
}

async function resolveCountryId(
  supabase: ReturnType<typeof getServiceClient>,
  countryCode: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .is('duplicate_of_id', null)
    .limit(1)
    .single()
  return data?.id || null
}

function extractCity(addr: NominatimAddress): string | null {
  return addr.city || addr.town || addr.village || addr.municipality || null
}

// ── Forward geocode core: build from the whole row, refuse a contradiction ───
//
// This used to be `q=<address>` and nothing else, with the first global hit
// written unvalidated. Nominatim answers a bare street name with whatever
// street of that name it ranks highest ANYWHERE, so "Möhnestraße 59" resolved
// to Oberhausen while the venue's own postal_code said 59755 Arnsberg — 85 km
// away, with Oberhausen's coordinates and Oberhausen's city_id, and city_id
// feeds safety_gated through location_is_high_risk. The row already carried
// every fact needed to both ask the right question and catch the wrong answer;
// nothing looked at any of it.
//
// Two rules, same as the same-name city collision work (20260802090844):
// constrain the query with everything the row knows, and BLOCK rather than
// guess when the answer contradicts the row. A null coordinate is recoverable,
// a wrong one is not.
//
// The pure half (query building + the contradiction guards) lives in
// ./geocode-guard.ts so it is testable — this module calls Deno.serve.

const countryRefCache = new Map<string, CountryRef | null>()

async function countryRefById(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
): Promise<CountryRef | null> {
  if (countryRefCache.has(id)) return countryRefCache.get(id)!
  const { data } = await supabase
    .from('countries')
    .select('code')
    .eq('id', id)
    .maybeSingle()
  const ref = data?.code ? { code: String(data.code).toUpperCase() } : null
  countryRefCache.set(id, ref)
  return ref
}

// country_id is a real FK and is believed as-is. `venues.country` is free text
// that mixes ISO-2 country codes with US state / Canadian province codes (CA,
// DE, OR, ME…), so it is NEVER upper()'d into an ISO code here — it goes
// through resolve_country_from_text, which demands city corroboration for an
// ambiguous code and returns NULL rather than guessing (20260807100200).
async function resolveVenueCountry(
  supabase: ReturnType<typeof getServiceClient>,
  v: GeoVenue,
): Promise<CountryRef | null> {
  if (v.country_id) return await countryRefById(supabase, v.country_id)
  const txt = v.country?.trim()
  if (!txt) return null
  const { data } = await supabase.rpc('resolve_country_from_text', { p_country: txt, p_city: v.city })
  if (!data || typeof data !== 'string') return null
  return await countryRefById(supabase, data)
}

interface ForwardOutcome {
  ok: boolean
  reason?: string
  query?: string
  hit?: NominatimResult
  lat?: number
  lon?: number
  country?: CountryRef | null
}

async function forwardGeocode(
  supabase: ReturnType<typeof getServiceClient>,
  v: GeoVenue,
): Promise<ForwardOutcome> {
  const country = await resolveVenueCountry(supabase, v)
  if (!hasLocalityContext(v)) {
    return { ok: false, reason: 'insufficient_context', country }
  }

  const queries = [buildForwardQuery(v, true)]
  // Dropping the postcode from the free-text q is a RECALL retry, not a
  // loosening: the postal guard below still runs against whatever comes back.
  const loose = buildForwardQuery(v, false)
  if (loose !== queries[0]) queries.push(loose)

  let lastReason = 'no_results'
  let sent = 0

  for (const q of queries) {
    if (sent > 0) await sleep(SLEEP_MS)
    sent++
    // limit=5 + countrycodes: the top hit is not privileged, it is the first
    // CANDIDATE. A lower-ranked hit whose postcode matches the row is better
    // evidence than a higher-ranked one that contradicts it.
    const url = `${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`
      + (country?.code ? `&countrycodes=${country.code.toLowerCase()}` : '')
    const res = await fetch(url, { headers: nominatimHeaders() })
    if (!res.ok) return { ok: false, reason: `nominatim_error_${res.status}`, query: q, country }

    const arr = (await res.json()) as NominatimResult[]
    if (!arr?.length) continue

    for (const hit of arr) {
      const lat = hit.lat ? parseFloat(hit.lat) : NaN
      const lon = hit.lon ? parseFloat(hit.lon) : NaN
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue
      if (countryContradicts(country?.code ?? null, hit.address?.country_code ?? null)) {
        lastReason = `country_mismatch:${(hit.address?.country_code || '?').toUpperCase()}_vs_${country?.code}`
        continue
      }
      if (postalContradicts(v.postal_code, hit.address?.postcode ?? null)) {
        lastReason = `postal_mismatch:${hit.address?.postcode || '?'}_vs_${v.postal_code}`
        continue
      }
      // A settlement-level hit is in the right city and the right country, so
      // both guards above pass it — and it is a centroid, which this codebase
      // has already decided is worse than NULL.
      if (isLocalityFallback(hit)) {
        lastReason = `locality_fallback:${hit.addresstype || hit.class || '?'}`
        continue
      }
      return { ok: true, hit, lat, lon, query: q, country }
    }
  }

  return { ok: false, reason: lastReason, query: queries[queries.length - 1], country }
}

// ── Reverse geocode: coords → city ──────────────────────────────────────────

async function processReverse(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
): Promise<{ results: VenueResult[]; remaining: number }> {
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, latitude, longitude, city, country, country_id')
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('id')
    .limit(batchSize)

  if (error) throw error
  if (!venues?.length) return { results: [], remaining: 0 }

  const { count } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('city_id', null)
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  const results: VenueResult[] = []

  for (const venue of venues) {
    try {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${venue.latitude}&lon=${venue.longitude}&zoom=10&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (!res.ok) {
        results.push({ id: venue.id, status: `nominatim_error_${res.status}` })
        await sleep(SLEEP_MS)
        continue
      }

      const data = await res.json() as NominatimResult
      if (!data.address) {
        results.push({ id: venue.id, status: 'no_address' })
        await sleep(SLEEP_MS)
        continue
      }

      const cityName = extractCity(data.address)
      const countryCode = data.address.country_code?.toUpperCase() || null

      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (cityName) {
        if (!venue.city) update.city = cityName
        const cityMatch = await matchCity(supabase, cityName, countryCode, { lat: Number(venue.latitude), lon: Number(venue.longitude) })
        if (cityMatch) {
          update.city_id = cityMatch.id
          if (!venue.country_id) update.country_id = cityMatch.country_id
        }
      }

      if (!venue.country_id && countryCode) {
        const cid = await resolveCountryId(supabase, countryCode)
        if (cid) update.country_id = cid
      }
      if (!venue.country && countryCode) update.country = countryCode

      await supabase.from('venues').update(update).eq('id', venue.id)
      results.push({ id: venue.id, status: update.city_id ? 'matched' : cityName ? 'city_text_only' : 'no_city_in_response', city_name: cityName || undefined })
    } catch (err) {
      results.push({ id: venue.id, status: `error: ${(err as Error).message}` })
    }
    await sleep(SLEEP_MS)
  }

  return { results, remaining: (count || 0) - results.length }
}

// ── Forward geocode: address → coords + city ────────────────────────────────

function isUsableAddress(address: string, name: string): boolean {
  // Skip addresses that are just the venue name repeated, or too short
  const a = address.trim().toLowerCase()
  const n = name.trim().toLowerCase()
  if (a === n) return false
  if (a.length < 5) return false
  // Must contain at least a comma or number (looks like a real address)
  if (!a.includes(',') && !/\d/.test(a) && a.split(/\s+/).length < 3) return false
  return true
}

async function processForward(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
): Promise<{ results: VenueResult[]; remaining: number }> {
  // Venues with a usable address but no coordinates, not yet attempted.
  //
  // The `city_id IS NULL` filter was REMOVED. It made this pass unreachable for
  // exactly the rows the centroid repair produces: a venue that already has a
  // city_id but whose coordinates were nulled because they were a city-centroid
  // placeholder. Those rows have a real street address and are the most
  // recoverable population there is, and the filter would have stranded ~3,277
  // of them at NULL permanently — a worse state than the wrong pin they had.
  //
  // Nothing downstream depended on the exclusion: the pass fills coordinates
  // (and city_id only when absent), so a row that already has a city simply
  // keeps it.
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address, city, postal_code, country, country_id, city_id, enrichment_status')
    .is('duplicate_of_id', null)
    .or('latitude.is.null,longitude.is.null')
    .not('address', 'is', null)
    .neq('address', '')
    .or('geocode_attempted.is.null,geocode_attempted.eq.false')
    .order('id')
    .limit(batchSize * 2) // fetch extra since we skip bad addresses

  if (error) throw error
  if (!venues?.length) return { results: [], remaining: 0 }

  // Filter to usable addresses
  const usable = venues.filter(v => isUsableAddress(v.address!, v.name))
  const batch = usable.slice(0, batchSize)

  // Mark skipped venues so we don't re-fetch them (null out address for junk ones)
  const skipped = venues.filter(v => !isUsableAddress(v.address!, v.name))
  if (skipped.length > 0) {
    // Set a geocode_skipped flag via city field marker so we don't loop
    for (const v of skipped) {
      await supabase.from('venues').update({
        geocode_attempted: true,
        updated_at: new Date().toISOString(),
      }).eq('id', v.id)
    }
  }

  // Mirrors the selection above — including the dropped city_id filter. A
  // count computed over a narrower set than the one being drained reports a
  // backlog that never shrinks.
  const { count } = await supabase
    .from('venues')
    .select('id', { count: 'exact', head: true })
    .is('duplicate_of_id', null)
    .or('latitude.is.null,longitude.is.null')
    .not('address', 'is', null)
    .neq('address', '')
    .or('geocode_attempted.is.null,geocode_attempted.eq.false')

  if (!batch.length) return { results: [], remaining: count || 0 }

  const results: VenueResult[] = []
  const startedAt = Date.now()

  for (const venue of batch) {
    // The cron calls this with timeout_milliseconds := 55000. A row can now
    // cost two Nominatim requests instead of one, so stop on a deadline and
    // let the next tick resume rather than losing the whole batch's writes.
    if (Date.now() - startedAt > MAX_RUN_MS) break

    try {
      const outcome = await forwardGeocode(supabase, venue as GeoVenue)

      if (!outcome.ok && outcome.reason?.startsWith('nominatim_error')) {
        // Transport failure, not an answer. Leave geocode_attempted alone so
        // the row is retried — marking it would burn a venue on a 503.
        results.push({ id: venue.id, status: outcome.reason })
        await sleep(SLEEP_MS)
        continue
      }

      if (!outcome.ok) {
        // Refusal path. geocode_attempted is set so the row leaves the queue,
        // but latitude/longitude/city_id stay NULL and the reason is recorded.
        // Deliberately does NOT touch latitude/longitude: trg_venue_geocode is
        // AFTER UPDATE OF latitude, longitude, address, so naming those columns
        // in a no-op write re-enters this function.
        await supabase.from('venues').update({
          geocode_attempted: true,
          enrichment_status: stampGeocode(venue.enrichment_status, {
            state: 'rejected',
            reason: outcome.reason,
            query: outcome.query,
          }),
          updated_at: new Date().toISOString(),
        }).eq('id', venue.id)
        results.push({
          id: venue.id,
          status: outcome.reason === 'no_results' ? 'no_results' : `rejected_${outcome.reason}`,
        })
        await sleep(SLEEP_MS)
        continue
      }

      const hit = outcome.hit!
      const lat = outcome.lat!
      const lon = outcome.lon!
      const addr = hit.address
      const cityName = addr ? extractCity(addr) : null
      const countryCode = addr?.country_code?.toUpperCase() || null

      const update: Record<string, unknown> = {
        geocode_attempted: true,
        updated_at: new Date().toISOString(),
        enrichment_status: stampGeocode(venue.enrichment_status, {
          state: 'accepted',
          query: outcome.query,
          postcode: addr?.postcode ?? null,
          country_code: countryCode,
        }),
      }

      // Set coordinates — validated against the row before we get here.
      update.latitude = lat
      update.longitude = lon

      // Set city
      if (cityName) {
        if (!venue.city) update.city = cityName
        const fwdCoords = (lat && lon) ? { lat, lon } : null
        const cityMatch = await matchCity(supabase, cityName, countryCode, fwdCoords)
        if (cityMatch) {
          // Only ever FILL a missing city — never re-link one that exists.
          // This pass now also sees venues that already have a city_id (their
          // coordinates were nulled by the centroid repair), and re-resolving
          // a city by NAME is how Portland ME becomes Portland OR. The venue's
          // existing link is the better evidence; the geocoder is here for the
          // coordinates.
          if (!venue.city_id) update.city_id = cityMatch.id
          if (!venue.country_id) update.country_id = cityMatch.country_id
        }
      }

      // Set country
      if (!venue.country_id && countryCode) {
        const cid = await resolveCountryId(supabase, countryCode)
        if (cid) update.country_id = cid
      }
      if (!venue.country && countryCode) update.country = countryCode

      await supabase.from('venues').update(update).eq('id', venue.id)
      results.push({
        id: venue.id,
        // An accepted outcome always carries coordinates now — a hit with no
        // usable lat/lon is skipped as a candidate inside forwardGeocode — so
        // the old 'geocoded_no_city_match' / 'no_useful_data' arms are gone.
        status: update.city_id ? 'matched' : 'coords_filled',
        city_name: cityName || undefined,
        city_id: update.city_id as string | undefined,
      })
    } catch (err) {
      results.push({ id: venue.id, status: `error: ${(err as Error).message}` })
    }
    await sleep(SLEEP_MS)
  }

  return { results, remaining: (count || 0) - results.length }
}

// ── Forward audit: report the blast radius, write NOTHING ───────────────────
//
// 3,588 live venues carry geocode_attempted=true with an address holding
// neither a postal code nor a comma — i.e. they went through the old bare-street
// query. Some fraction of them are somewhere else entirely.
//
// This mode re-asks the corrected question and compares against the STORED
// coordinates. It is deliberately read-only: a large disagreement rate is a
// finding to surface, not a batch to auto-apply, and re-geocoding blind would
// also re-enter trg_venue_geocode on every row it touched.
//   { "mode": "forward_audit", "batch_size": 25, "offset": 0 }

interface AuditRow {
  id: string
  name: string
  address: string
  row_city: string | null
  row_postal: string | null
  stored: [number, number]
  regeocoded?: [number, number]
  // What the corrected query actually resolved to. Without these a
  // disagreement is unjudgeable: the question is never "did the number move"
  // but "which of the two is the venue's town".
  hit?: string
  hit_type?: string
  distance_km?: number
  verdict: string
  reason?: string
}

async function processForwardAudit(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
  offset: number,
): Promise<Record<string, unknown>> {
  const { data: venues, error } = await supabase
    .from('venues')
    .select('id, name, address, city, postal_code, country, country_id, latitude, longitude')
    .is('duplicate_of_id', null)
    .eq('geocode_attempted', true)
    .not('address', 'is', null)
    .neq('address', '')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('id')
    .range(offset, offset + batchSize * 4 - 1)

  if (error) throw error

  const scanned = venues?.length ?? 0
  const suspect = (venues ?? []).filter(v => isBareStreetAddress(v.address!)).slice(0, batchSize)

  const rows: AuditRow[] = []
  const startedAt = Date.now()
  let consumed = 0

  for (const v of suspect) {
    if (Date.now() - startedAt > MAX_RUN_MS) break
    consumed++
    const stored: [number, number] = [Number(v.latitude), Number(v.longitude)]
    const outcome = await forwardGeocode(supabase, v as GeoVenue)

    const base = {
      id: v.id,
      name: v.name,
      address: v.address!,
      row_city: v.city,
      row_postal: v.postal_code,
      stored,
    }

    if (!outcome.ok) {
      rows.push({ ...base, verdict: 'unverifiable', reason: outcome.reason })
    } else {
      const km = haversineKm(stored[0], stored[1], outcome.lat!, outcome.lon!)
      rows.push({
        ...base,
        regeocoded: [outcome.lat!, outcome.lon!],
        hit: outcome.hit!.display_name?.slice(0, 90),
        hit_type: outcome.hit!.addresstype || outcome.hit!.class,
        distance_km: Math.round(km * 10) / 10,
        verdict: km < 1 ? 'agrees' : km < 25 ? 'disagrees_near' : 'disagrees_far',
      })
    }
    await sleep(SLEEP_MS)
  }

  const by = (verdict: string) => rows.filter(r => r.verdict === verdict).length
  return {
    scanned,
    suspect_in_window: (venues ?? []).filter(v => isBareStreetAddress(v.address!)).length,
    checked: rows.length,
    agrees: by('agrees'),
    disagrees_near: by('disagrees_near'),
    disagrees_far: by('disagrees_far'),
    unverifiable: by('unverifiable'),
    next_offset: offset + (consumed >= suspect.length ? scanned : 0),
    worst: rows
      .filter(r => r.distance_km !== undefined)
      .sort((a, b) => (b.distance_km || 0) - (a.distance_km || 0))
      .slice(0, 20),
    note: 'read-only — nothing was written',
  }
}

// ── Single venue (trigger mode) ────────────────────────────────────────────

async function processSingleVenue(
  supabase: ReturnType<typeof getServiceClient>,
  venueId: string,
): Promise<{ venue_id: string; status: string; city_name?: string; city_id?: string }> {
  const { data: venue, error } = await supabase
    .from('venues')
    .select('id, name, address, latitude, longitude, city, postal_code, country, country_id, city_id, enrichment_status')
    .eq('id', venueId)
    .single()

  if (error || !venue) return { venue_id: venueId, status: 'not_found' }
  if (venue.city_id) return { venue_id: venueId, status: 'already_has_city_id' }

  const hasCoords = venue.latitude && venue.longitude && venue.latitude !== 0 && venue.longitude !== 0
  const hasAddress = venue.address && isUsableAddress(venue.address, venue.name)

  if (!hasCoords && !hasAddress) return { venue_id: venueId, status: 'no_geocodable_data' }

  try {
    let nominatimData: NominatimResult | null = null

    if (hasCoords) {
      const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${venue.latitude}&lon=${venue.longitude}&zoom=10&addressdetails=1`
      const res = await fetch(url, { headers: nominatimHeaders() })
      if (res.ok) nominatimData = await res.json() as NominatimResult
    } else if (hasAddress) {
      // Same guarded path as the batch pass. This is the call site that fired
      // from trg_venue_geocode 1.1s after the eventfrog commit and replaced a
      // correct Arnsberg row with Oberhausen's coordinates and city_id.
      const outcome = await forwardGeocode(supabase, venue as GeoVenue)
      if (outcome.ok) {
        nominatimData = outcome.hit!
      } else if (outcome.reason?.startsWith('nominatim_error')) {
        return { venue_id: venueId, status: outcome.reason }
      } else {
        await supabase.from('venues').update({
          geocode_attempted: true,
          enrichment_status: stampGeocode(venue.enrichment_status, {
            state: 'rejected',
            reason: outcome.reason,
            query: outcome.query,
          }),
          updated_at: new Date().toISOString(),
        }).eq('id', venue.id)
        return { venue_id: venueId, status: `rejected_${outcome.reason}` }
      }
    }

    if (!nominatimData?.address) return { venue_id: venueId, status: 'no_nominatim_result' }

    const cityName = extractCity(nominatimData.address)
    const countryCode = nominatimData.address.country_code?.toUpperCase() || null
    const update: Record<string, unknown> = { geocode_attempted: true, updated_at: new Date().toISOString() }

    // Set coords from forward geocode
    if (!hasCoords && nominatimData.lat && nominatimData.lon) {
      const lat = parseFloat(nominatimData.lat)
      const lon = parseFloat(nominatimData.lon)
      if (lat !== 0 && lon !== 0) { update.latitude = lat; update.longitude = lon }
    }

    if (cityName) {
      if (!venue.city) update.city = cityName
      const venueCoords = hasCoords
        ? { lat: Number(venue.latitude), lon: Number(venue.longitude) }
        : (nominatimData.lat && nominatimData.lon ? { lat: parseFloat(nominatimData.lat), lon: parseFloat(nominatimData.lon) } : null)
      const cityMatch = await matchCity(supabase, cityName, countryCode, venueCoords)
      if (cityMatch) {
        update.city_id = cityMatch.id
        if (!venue.country_id) update.country_id = cityMatch.country_id
      }
    }

    if (!venue.country_id && countryCode) {
      const cid = await resolveCountryId(supabase, countryCode)
      if (cid) update.country_id = cid
    }
    if (!venue.country && countryCode) update.country = countryCode

    const { error: updateErr } = await supabase.from('venues').update(update).eq('id', venue.id)
    if (updateErr) {
      console.error('Venue update failed:', updateErr)
      return { venue_id: venueId, status: `update_error: ${updateErr.message}` }
    }

    return {
      venue_id: venueId,
      status: update.city_id ? 'matched' : cityName ? 'geocoded_no_city_match' : 'no_city_in_response',
      city_name: cityName || undefined,
      city_id: update.city_id as string | undefined,
    }
  } catch (err) {
    return { venue_id: venueId, status: `error: ${(err as Error).message}` }
  }
}

// ── Single event (trigger mode) ────────────────────────────────────────────

async function processSingleEvent(
  supabase: ReturnType<typeof getServiceClient>,
  eventId: string,
): Promise<{ event_id: string; status: string; city_name?: string; city_id?: string }> {
  const { data: event, error } = await supabase
    .from('events')
    .select('id, title, venue_id, latitude, longitude, city_id, country_id')
    .eq('id', eventId)
    .single()

  if (error || !event) return { event_id: eventId, status: 'not_found' }
  if (event.city_id) return { event_id: eventId, status: 'already_has_city_id' }

  // Try inheriting from venue first
  if (event.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('city_id, country_id')
      .eq('id', event.venue_id)
      .single()
    if (venue?.city_id) {
      const upd: Record<string, unknown> = { city_id: venue.city_id, updated_at: new Date().toISOString() }
      if (!event.country_id && venue.country_id) upd.country_id = venue.country_id
      const { error: updateErr } = await supabase.from('events').update(upd).eq('id', event.id)
      if (updateErr) return { event_id: eventId, status: `update_error: ${updateErr.message}` }
      return { event_id: eventId, status: 'inherited_from_venue', city_id: venue.city_id }
    }
  }

  // Fall back to Nominatim reverse geocode
  const hasCoords = event.latitude && event.longitude && event.latitude !== 0 && event.longitude !== 0
  if (!hasCoords) return { event_id: eventId, status: 'no_geocodable_data' }

  try {
    const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${event.latitude}&lon=${event.longitude}&zoom=10&addressdetails=1`
    const res = await fetch(url, { headers: nominatimHeaders() })
    if (!res.ok) return { event_id: eventId, status: `nominatim_error_${res.status}` }

    const data = await res.json() as NominatimResult
    if (!data.address) return { event_id: eventId, status: 'no_nominatim_result' }

    const cityName = extractCity(data.address)
    const countryCode = data.address.country_code?.toUpperCase() || null
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (cityName) {
      const eventCoords = { lat: Number(event.latitude), lon: Number(event.longitude) }
      const cityMatch = await matchCity(supabase, cityName, countryCode, eventCoords)
      if (cityMatch) {
        update.city_id = cityMatch.id
        if (!event.country_id) update.country_id = cityMatch.country_id
      }
    }

    if (!event.country_id && !update.country_id && countryCode) {
      const cid = await resolveCountryId(supabase, countryCode)
      if (cid) update.country_id = cid
    }

    if (Object.keys(update).length > 1) {
      const { error: updateErr } = await supabase.from('events').update(update).eq('id', event.id)
      if (updateErr) return { event_id: eventId, status: `update_error: ${updateErr.message}` }
    }

    return {
      event_id: eventId,
      status: update.city_id ? 'matched' : cityName ? 'geocoded_no_city_match' : 'no_city_in_response',
      city_name: cityName || undefined,
      city_id: update.city_id as string | undefined,
    }
  } catch (err) {
    return { event_id: eventId, status: `error: ${(err as Error).message}` }
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

// ── Postal queue drain: coords → state + postal_code ────────────────────────
//
// Deliberately NOT folded into processReverse/processForward. Those two speak
// Nominatim and their matchCity() auto-create path is tuned to Nominatim's
// address.{city,town,village,municipality} shape; they are also load-bearing for
// trg_venue_geocode / trg_event_geocode. Photon has a different response shape
// (features[0].properties.{state,postcode,countrycode}) and this drain has
// different failure semantics (retry with backoff, park after 4 attempts), so it
// gets its own client.
//
// `state` is normally derived from cities.region_name by the
// derive_entity_geo_address trigger and never reaches here. This fills the
// residue: rows whose city has no region, or which have no city link at all.

const PHOTON_REVERSE = Deno.env.get('PHOTON_REVERSE_URL') || 'https://photon.komoot.io/reverse'
const PHOTON_INTERVAL_MS = Number(Deno.env.get('PHOTON_INTERVAL_MS') || 1100)

const QUEUE_TABLES: Record<string, string> = {
  venue: 'venues',
  event: 'events',
  hotel: 'hotels',
  organization: 'organizations',
}

interface PhotonReverse { state: string | null; postcode: string | null; countrycode: string | null }

async function photonReverse(lat: number, lon: number): Promise<PhotonReverse | null> {
  // &lang=en is REQUIRED — without it the same region comes back as "Bayern"
  // for some rows and "Bavaria" for others and the values will not group.
  const url = `${PHOTON_REVERSE}?lat=${lat}&lon=${lon}&lang=en`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'QueerGuide/1.0 (https://queer.guide)' },
    })
    if (res.status === 429) throw new Error('photon_rate_limited')
    if (!res.ok) throw new Error(`photon_${res.status}`)
    const j = await res.json() as { features?: Array<{ properties?: Record<string, string> }> }
    const p = j.features?.[0]?.properties ?? {}
    // `state` only. Photon's `county` for Los Angeles is "Los Angeles", which is
    // not a state — never fall back to it.
    return {
      state: p.state?.trim() || null,
      postcode: p.postcode?.trim() || null,
      countrycode: p.countrycode?.trim().toUpperCase().slice(0, 2) || null,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function processPostalQueue(
  supabase: ReturnType<typeof getServiceClient>,
  batchSize: number,
): Promise<{ processed: number; filled: number; missed: number; failed: number; remaining: number }> {
  const { data: jobs, error } = await supabase
    .from('geo_address_queue')
    .select('entity_type, entity_id, latitude, longitude, attempts')
    .lt('attempts', 4)
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(batchSize)

  if (error) throw error
  if (!jobs?.length) return { processed: 0, filled: 0, missed: 0, failed: 0, remaining: 0 }

  let filled = 0, missed = 0, failed = 0

  for (const job of jobs) {
    const table = QUEUE_TABLES[job.entity_type]
    if (!table) continue

    try {
      if (job.latitude == null || job.longitude == null) throw new Error('no_coords')
      const geo = await photonReverse(Number(job.latitude), Number(job.longitude))

      // country_id from Photon's countrycode. This is a DIFFERENT kind of answer
      // from the free-text `country` column, which needs resolve_country_from_text's
      // corroboration because a 2-letter string there might be a US state. A
      // countrycode derived from coordinates is unambiguous, so a direct lookup
      // is correct — and it is the only way ~1,000 venues that have coordinates
      // but neither a city link nor country text can ever get a country.
      let geoCountryId: string | null = null
      if (geo?.countrycode) {
        const { data: co } = await supabase
          .from('countries')
          .select('id')
          .eq('code', geo.countrycode)
          .is('duplicate_of_id', null)
          .limit(1)
          .maybeSingle()
        geoCountryId = co?.id ?? null
      }

      if (geo?.postcode || geo?.state || geoCountryId) {
        // NULL-fill only — never overwrite a value a source already supplied.
        const patch: Record<string, string> = {}
        if (geo?.postcode) patch.postal_code = geo.postcode
        if (geo?.state) patch.state = geo.state

        if (Object.keys(patch).length > 0) {
          let q = supabase.from(table).update(patch).eq('id', job.entity_id)
          if (geo?.postcode) q = q.is('postal_code', null)
          const { error: upErr } = await q
          if (upErr) throw new Error(upErr.message)
        }

        // country_id gets its OWN statement with its own `is null` guard.
        // PostgREST applies one filter set per update, so folding it into the
        // patch above would let a row that already has a country be overwritten
        // whenever it happened to be missing a postal code. Writing country_id
        // fires the derive trigger and recomputes safety_gated — which is
        // exactly why it must only ever fill a NULL.
        if (geoCountryId) {
          const { error: cErr } = await supabase
            .from(table)
            .update({ country_id: geoCountryId })
            .eq('id', job.entity_id)
            .is('country_id', null)
          if (cErr) throw new Error(cErr.message)
        }
        filled++
      } else {
        // A real answer of "this place has no postcode/state" (city-states,
        // micro-states). Not a failure — drop it so we never ask again.
        missed++
      }

      await supabase.from('geo_address_queue')
        .delete()
        .eq('entity_type', job.entity_type)
        .eq('entity_id', job.entity_id)
    } catch (e) {
      failed++
      const attempts = (job.attempts ?? 0) + 1
      // Exponential backoff; parks at attempts >= 4 where the admin panel shows it.
      const backoffHours = Math.pow(2, attempts)
      await supabase.from('geo_address_queue')
        .update({
          attempts,
          last_error: String((e as Error).message).slice(0, 500),
          next_attempt_at: new Date(Date.now() + backoffHours * 3600_000).toISOString(),
        })
        .eq('entity_type', job.entity_type)
        .eq('entity_id', job.entity_id)
    }

    await new Promise((r) => setTimeout(r, PHOTON_INTERVAL_MS))
  }

  const { count } = await supabase
    .from('geo_address_queue')
    .select('entity_id', { count: 'exact', head: true })
    .lt('attempts', 4)

  return { processed: jobs.length, filled, missed, failed, remaining: count ?? 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  try {
    const supabase = getServiceClient()
    const isAdmin = await requireAdmin(req, supabase).catch(() => false)
    // Fail-closed: no literal fallback secret — WEBHOOK_SECRET must be set.
    const isWebhook = hasValidWebhookSecret(req, 'WEBHOOK_SECRET')

    if (!isAdmin && !isWebhook) {
      return errorResponse('Unauthorized', 401, req)
    }

    const body = await req.json().catch(() => ({}))
    const mode = body.mode || 'reverse'
    const batchSize = Math.min(body.batch_size || 25, 50)
    const venueId = body.venue_id as string | undefined
    const eventId = body.event_id as string | undefined

    // Single-record mode (called from DB triggers)
    if (venueId) {
      const singleResult = await processSingleVenue(supabase, venueId)
      return jsonResponse({ success: true, mode: 'single', ...singleResult }, 200, req)
    }
    if (eventId) {
      const singleResult = await processSingleEvent(supabase, eventId)
      return jsonResponse({ success: true, mode: 'single', ...singleResult }, 200, req)
    }

    // Drain the geo_address_queue for state/postal_code. Separate from the two
    // modes below because it speaks Photon, not Nominatim, and returns its own
    // shape — see processPostalQueue.
    if (mode === 'postal') {
      const postal = await processPostalQueue(supabase, batchSize)
      return jsonResponse({ success: true, mode: 'postal', ...postal }, 200, req)
    }

    // Read-only. Reports how far the stored coordinates are from what the
    // corrected query returns; writes nothing, by design.
    if (mode === 'forward_audit') {
      const audit = await processForwardAudit(supabase, batchSize, Number(body.offset) || 0)
      return jsonResponse({ success: true, mode: 'forward_audit', ...audit }, 200, req)
    }

    let result: { results: VenueResult[]; remaining: number }

    switch (mode) {
      case 'reverse':
        result = await processReverse(supabase, batchSize)
        break
      case 'forward':
        result = await processForward(supabase, batchSize)
        break
      default:
        return errorResponse(`Unknown mode: ${mode}. Use "reverse", "forward", "forward_audit" or "postal".`, 400, req)
    }

    if (!result.results.length) {
      return jsonResponse({ success: true, mode, message: 'No venues to process', processed: 0, remaining: 0 }, 200, req)
    }

    const matched = result.results.filter(r => r.status === 'matched').length
    // 'coords_filled' MUST be in this list. It is the status for a venue that
    // already had a city and got coordinates — the entire output of the centroid
    // repair — and it was added without being tallied anywhere, so the cron
    // reported `geocoded: 0` while actually filling coordinates. Measured on the
    // first live run: processed 25, matched 0, geocoded 0, skipped 12, which
    // leaves 13 rows unaccounted for and reads as "this job does nothing".
    const geocoded = result.results.filter(r => ['geocoded_no_city_match', 'coords_only', 'city_text_only', 'coords_filled'].includes(r.status)).length
    const skipped = result.results.filter(r => ['no_results', 'no_address', 'no_city_in_response'].includes(r.status)).length
    const errors = result.results.filter(r => r.status.startsWith('error') || r.status.startsWith('nominatim_error')).length
    // Refusals are their OWN number, never folded into `skipped`. A row the
    // geocoder contradicted and a row the geocoder never heard of are different
    // findings: the first says our data disagrees with the world, and a rising
    // count there is the signal that something upstream is writing bad
    // postal codes or bad country text.
    const rejected = result.results.filter(r => r.status.startsWith('rejected_')).length

    return jsonResponse({
      success: true,
      mode,
      processed: result.results.length,
      matched,
      geocoded,
      skipped,
      rejected,
      errors,
      remaining: result.remaining,
      results: result.results,
    }, 200, req)
  } catch (error) {
    console.error('Backfill error:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
