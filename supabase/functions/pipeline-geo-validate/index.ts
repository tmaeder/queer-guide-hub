import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { buildCountryCanon, canonCountry } from '../_shared/geo-normalize.ts'

// Geo-validation worker. Reverse-geocodes a small batch of venues via
// Nominatim and writes to geo_validations. Country mismatch is the primary
// signal — distance-based detection is intentionally out of scope (too many
// false positives for venues vs. their administrative city).
//
// COMPARISON BUG, fixed 20270501: this compared two different representations
// of the same fact and called the difference a finding. `normalizeCountry` was
// a local trim().toLowerCase(), so the stored ISO-2 code 'US' was compared
// against Nominatim's English country name 'United States' and disagreed —
// always. Measured before the fix: 692 of 985 rows carried has_mismatch.
// Recomputing every verdict by canonicalising both sides through the
// `countries` table leaves 41 — so the signal was ~6% precision, and 652 rows
// were pure artifact.
//
// Do NOT restate that as "it never found anything". It did: A-House (filed
// Eastham, Massachusetts) reverse-geocoded to Hobart, Australia, and several
// more of the 670 known antipodal venues are in the surviving 41. The defect
// was that ~16 real findings sat under 652 identical-looking false ones, so
// nobody could read the queue — not that the queue was empty.
//
// (An earlier draft of this comment claimed zero real findings, from a regex
// that matched the *message shape* `Stored country '<X>' ≠ geocoded '<Y>'`.
// Every row has that shape, the true positives included, so the test measured
// formatting and not content. Compare canonical values, never rendered text.)
//
// The fix is to canonicalise both sides before comparing. buildCountryCanon()
// derives the lookup from the live `countries` table (all 250 name+code pairs)
// plus the shared alias map, so this needs no hand-maintained ISO list. We
// prefer Nominatim's `address.country_code` — an unambiguous ISO-2 that was
// already declared in the local response type and never read — over the
// localized `address.country` string.
//
// KNOWN REMAINING FALSE POSITIVE: dependent territories. A venue in Guam
// stored as 'US' reverse-geocodes to country_code 'gu' and will still be
// flagged. `countries` has no sovereign/parent column, so sovereignty is not
// representable in this function at all. It becomes representable with
// geo_boundaries.sovereign_iso_a2 (Natural Earth) and is resolved there, in
// the containment validator. Flagging a handful of territory venues is a much
// smaller and more honest error than flagging every US venue, which is what
// this function did until now.
//
// Rate limit: Nominatim asks for ≤1 req/sec. We sleep 1100ms between calls.
// Batch size 30 → ~33 sec runtime, well under the edge-function timeout.
//
// Run daily via cron OR manually with {batch_size, only_new} body.

// Self-host: set NOMINATIM_URL=https://nominatim.queer.guide and
// optional NOMINATIM_BASIC_AUTH=user:pass to bypass the 1 req/sec
// public-Nominatim limit. With self-host we drop sleep to 50ms.
const NOMINATIM_BASE = (Deno.env.get('NOMINATIM_URL') || 'https://nominatim.openstreetmap.org').replace(/\/$/, '')
const NOMINATIM = `${NOMINATIM_BASE}/reverse`
const NOMINATIM_AUTH = Deno.env.get('NOMINATIM_BASIC_AUTH') || ''
const SLEEP_MS = Deno.env.get('NOMINATIM_URL') ? 50 : 1100

interface VenueRow {
  id: string
  latitude: number | null
  longitude: number | null
  country: string | null
  city: string | null
}

interface NominatimResult {
  display_name?: string
  address?: {
    country?: string
    country_code?: string
    city?: string
    town?: string
    village?: string
    state?: string
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// canonCountry lives in _shared/geo-normalize.ts so the containment validator
// and this function cannot drift into two different ideas of what "same
// country" means — the mistake that put one city-collision rule in a SQL
// runner and a subtly different one in an edge function.

Deno.serve(withErrorReporting('pipeline-geo-validate', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(body.batch_size ?? 30, 50)
    const onlyNew = body.only_new ?? true

    // One read, reused for the whole batch. Without it every comparison below
    // is between an ISO-2 code and an English name — see the header.
    const { data: countryRows, error: countryErr } = await supabase
      .from('countries')
      .select('name, code') as { data: Array<{ name: string | null, code: string | null }> | null, error: { message: string } | null }
    if (countryErr) return errorResponse(`countries: ${countryErr.message}`, 500, req)
    // Fail closed. With an empty canon map every canonCountry() returns '',
    // every comparison is skipped, and the run reports "0 mismatches" over a
    // corpus it never actually checked — a clean bill of health from a
    // validator that did nothing. That reads identically to success, so it
    // must be an error instead.
    if (!countryRows || countryRows.length === 0) {
      return errorResponse('countries table empty or unreadable — refusing to validate with no canon map', 500, req)
    }
    const countryCanon = buildCountryCanon(countryRows)

    // Pick venues missing or with stale geo_validations rows.
    // only_new=true → just last 24h of updates; else oldest unvalidated.
    const cutoff = onlyNew
      ? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      : '1970-01-01'
    const { data: venues, error: loadErr } = await supabase
      .from('venues')
      .select('id, latitude, longitude, country, city, updated_at')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .is('closed_at', null)
      .gte('updated_at', cutoff)
      .limit(batchSize) as { data: VenueRow[] | null, error: { message: string } | null }
    if (loadErr) return errorResponse(`load: ${loadErr.message}`, 500, req)
    if (!venues || venues.length === 0) {
      return jsonResponse({ success: true, validated: 0, message: 'no venues to validate' }, 200, req)
    }

    // Skip venues already validated recently (within 30 days)
    const venueIds = venues.map((v) => v.id)
    // `.eq('source','nominatim')` is load-bearing since 20270501174245 added
    // source to the unique key. geo_containment_check writes a row for EVERY
    // venue it sweeps, so without this filter the freshness check would see
    // those rows, conclude every venue was validated recently, and skip the
    // whole batch — starving this path to zero while reporting success.
    const { data: existingValidations } = await supabase
      .from('geo_validations')
      .select('content_id, last_validated_at')
      .eq('content_type', 'venue')
      .eq('source', 'nominatim')
      .in('content_id', venueIds)
      .gte('last_validated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    const skipSet = new Set((existingValidations ?? []).map((r: { content_id: string }) => r.content_id))
    const toValidate = venues.filter((v) => !skipSet.has(v.id))

    let validated = 0, mismatches = 0, errors = 0

    for (const v of toValidate) {
      if (v.latitude == null || v.longitude == null) continue
      try {
        const url = `${NOMINATIM}?format=json&lat=${v.latitude}&lon=${v.longitude}&zoom=10&addressdetails=1`
        const headers: Record<string, string> = {
          'User-Agent': 'queer.guide geo-validator',
          'Accept-Language': 'en',
        }
        if (NOMINATIM_AUTH) {
          headers['Authorization'] = `Basic ${btoa(NOMINATIM_AUTH)}`
        }
        const resp = await fetch(url, { headers })
        if (!resp.ok) { errors++; await sleep(SLEEP_MS); continue }
        const json = await resp.json() as NominatimResult
        const addr = json.address || {}
        const geocodedCountry = addr.country || null
        const geocodedCity = addr.city || addr.town || addr.village || null
        const geocodedAddress = json.display_name || null

        // Prefer the ISO-2 code over the localized country name. Both sides go
        // through the same canon map, so 'US' / 'us' / 'United States' all
        // collapse to one value and only a real disagreement survives.
        const geocodedCode = addr.country_code || null
        const expected = canonCountry(countryCanon, v.country)
        const actual   = canonCountry(countryCanon, geocodedCode) ||
                         canonCountry(countryCanon, geocodedCountry)
        // '' on either side means "unrecognised or absent" — no opinion, not a
        // mismatch. Never let an unknown spelling contradict a known one.
        const hasMismatch = expected !== '' && actual !== '' && expected !== actual
        if (hasMismatch) mismatches++

        await supabase.from('geo_validations').upsert({
          content_type: 'venue',
          content_id: v.id,
          original_lat: v.latitude,
          original_lng: v.longitude,
          validated_lat: v.latitude,
          validated_lng: v.longitude,
          geocoded_address: geocodedAddress,
          country: geocodedCountry,
          city: geocodedCity,
          // Carry the admin-1 name through. Nominatim already returns it and
          // it was being discarded; the containment validator needs a stored
          // admin-1 to check the same-name-twin case (Portland ME vs OR).
          region: addr.state ?? null,
          confidence: hasMismatch ? 0.4 : 0.9,
          has_mismatch: hasMismatch,
          // Record the canonical forms that were actually compared, not the
          // raw strings. The old message showed `'US' ≠ 'United States'`,
          // which looks like a finding and was an artifact.
          mismatch_details: hasMismatch
            ? `Coordinate resolves to ${actual}${geocodedCode ? ` (${geocodedCode.toUpperCase()})` : ''} but venue is filed under ${expected} (stored '${v.country}')`
            : null,
          source: 'nominatim',
          last_validated_at: new Date().toISOString(),
        }, { onConflict: 'content_type,content_id,source' })
        // `source` joined the unique key in 20270501174245 so this
        // function and geo_containment_check stop overwriting each
        // other's verdicts. ON CONFLICT must name the index's columns
        // exactly, so this list is not optional.

        validated++
      } catch (e) {
        console.error(`validate ${v.id}:`, (e as Error).message)
        errors++
      }
      await sleep(SLEEP_MS)
    }

    return jsonResponse({
      success: true,
      validated, mismatches, errors,
      candidates: venues.length,
      skipped_recent: skipSet.size,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-geo-validate:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
