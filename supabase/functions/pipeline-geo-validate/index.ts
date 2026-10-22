import { workBudget, boundedBatch } from '../_shared/work-budget.ts'
import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { buildCountryCanon, canonCountry } from '../_shared/geo-normalize.ts'
import { reverseGeocode, GeocodeFailure, PHOTON_INTERVAL_MS } from './reverse-geocode.ts'

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
// Rate limit: the public Photon instance is rate-limited, so we sleep
// PHOTON_INTERVAL_MS (1100ms) between calls, matching the repo's other Photon
// caller. Batch size 30 → ~33 sec runtime, well under the edge timeout.
//
// Run daily via cron OR manually with {batch_size, only_new} body.

// PROVIDER MOVED NOMINATIM → PHOTON, 2026-10-22. The public Nominatim endpoint
// answers Supabase's egress with 403 and this validator had written nothing
// since 2026-09-24 as a result. Rationale, evidence and the 403-is-hard /
// 429-is-transient split all live in ./reverse-geocode.ts — read that before
// changing the provider again. Self-host via PHOTON_REVERSE_URL.
const SLEEP_MS = PHOTON_INTERVAL_MS

interface VenueRow {
  id: string
  latitude: number | null
  longitude: number | null
  country: string | null
  city: string | null
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
    const batchSize = boundedBatch(body.batch_size, 5, 10)
    const budget = workBudget(45000)
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
    const { data: existingValidations } = await supabase
      .from('geo_validations')
      .select('content_id, last_validated_at')
      .eq('content_type', 'venue')
      .in('content_id', venueIds)
      .gte('last_validated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    const skipSet = new Set((existingValidations ?? []).map((r: { content_id: string }) => r.content_id))
    const toValidate = venues.filter((v) => !skipSet.has(v.id))

    let validated = 0, mismatches = 0, errors = 0
    // Split the error count by cause. Without this, "the upstream asked us to
    // slow down" and "the upstream is refusing us" are one number, and the
    // first one walks a working job into auto-pause while the second reads
    // exactly like weather. See ./reverse-geocode.ts for the split.
    let transientErrors = 0, hardErrors = 0
    let firstError: string | null = null

    for (const v of toValidate) {
      if (!budget.canStart(10000)) break
      if (v.latitude == null || v.longitude == null) continue
      try {
        const geo = await reverseGeocode(v.latitude, v.longitude, budget.signal(8000))
        // A 200 that resolves to nothing is not a failure and not a verdict:
        // it means the provider has no feature at this point. Skip the row
        // rather than storing a row of nulls that reads like a checked venue.
        if (!geo) { await sleep(SLEEP_MS); continue }
        const geocodedCountry = geo.country
        const geocodedCity = geo.city
        const geocodedAddress = geo.address

        // Prefer the ISO-2 code over the localized country name. Both sides go
        // through the same canon map, so 'US' / 'us' / 'United States' all
        // collapse to one value and only a real disagreement survives.
        const geocodedCode = geo.countryCode
        const expected = canonCountry(countryCanon, v.country)
        const actual   = canonCountry(countryCanon, geocodedCode) ||
                         canonCountry(countryCanon, geocodedCountry)
        // '' on either side means "unrecognised or absent" — no opinion, not a
        // mismatch. Never let an unknown spelling contradict a known one.
        const hasMismatch = expected !== '' && actual !== '' && expected !== actual
        if (hasMismatch) mismatches++

        const { error: writeError } = await supabase.from('geo_validations').upsert({
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
          region: geo.state,
          confidence: hasMismatch ? 0.4 : 0.9,
          has_mismatch: hasMismatch,
          // Record the canonical forms that were actually compared, not the
          // raw strings. The old message showed `'US' ≠ 'United States'`,
          // which looks like a finding and was an artifact.
          mismatch_details: hasMismatch
            ? `Coordinate resolves to ${actual}${geocodedCode ? ` (${geocodedCode.toUpperCase()})` : ''} but venue is filed under ${expected} (stored '${v.country}')`
            : null,
          source: 'photon',
          last_validated_at: new Date().toISOString(),
        }, { onConflict: 'content_type,content_id' })

        if (writeError) throw writeError
        validated++
      } catch (e) {
        const msg = (e as Error).message
        console.error(`validate ${v.id}:`, msg)
        errors++
        if (e instanceof GeocodeFailure && e.kind === 'transient') transientErrors++
        else hardErrors++
        firstError ??= msg
      }
      await sleep(SLEEP_MS)
    }

    // A BUSY UPSTREAM IS NOT OUR FAILURE, but a PERMANENT one must still go
    // red. This function has no recordRun() — the pg_net reaper derives the
    // run status from this HTTP status (a non-2xx is a bad response and feeds
    // consecutive_failures against auto_pause_threshold=3), so the status code
    // below IS the health signal.
    //
    // Hard errors (403/401/404) are always red, which is the half that matters:
    // the 403 that killed the Nominatim path would have gone red on its first
    // run under this rule instead of hiding for 28 days behind `validated: 0`.
    //
    // An all-transient wipeout (429/5xx/abort) is weather and returns 200 —
    // unless the previous 3 runs were also all-transient wipeouts, at which
    // point it is not weather any more. At a daily cron that is 4 days of
    // continuous rate-limiting before the job goes red, and 6 before it could
    // auto-pause: long past transient, and still bounded.
    const wipedOut = validated === 0 && errors > 0
    let upstreamBusy = wipedOut && hardErrors === 0 && transientErrors > 0
    let escalated = false
    if (upstreamBusy) {
      const { data: recent } = await supabase
        .from('admin_automation_runs')
        .select('summary')
        .eq('automation_slug', 'pipeline_geo_validate')
        .order('started_at', { ascending: false })
        .limit(3)
      // The reaper stores this response body under summary.requests[0].body as
      // a STRING, so the flag has to be read back out of that JSON rather than
      // addressed as a jsonb key. Verified against live rows before relying on
      // it; a shape change here fails closed (escalate stays false) rather than
      // silently keeping a dead upstream green, because `hardErrors` still
      // reds any non-429 refusal on the very first run.
      escalated = (recent?.length ?? 0) >= 3 && recent!.every((r) => {
        const raw = (r.summary as { requests?: Array<{ body?: string }> } | null)?.requests?.[0]?.body
        if (!raw) return false
        try { return (JSON.parse(raw) as { upstream_busy?: boolean }).upstream_busy === true }
        catch { return false }
      })
      if (escalated) upstreamBusy = false
    }
    const status = hardErrors > 0 || escalated ? 502 : (errors > 0 && !upstreamBusy ? 502 : 200)
    return jsonResponse({
      success: status === 200,
      validated, mismatches, errors,
      transient_errors: transientErrors,
      hard_errors: hardErrors,
      upstream_busy: upstreamBusy,
      escalated,
      error: firstError,
      deferred: Math.max(0, toValidate.length - validated - errors),
      candidates: venues.length,
      skipped_recent: skipSet.size,
    }, status, req)
  } catch (error) {
    console.error('pipeline-geo-validate:', error)
    return errorResponse((error as Error).message, 500, req)
  }
}))
