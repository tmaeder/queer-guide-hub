import tzlookup from 'npm:tz-lookup@6.1.25'
import { getServiceClient, requireAdmin, corsResponse, jsonResponse, errorResponse, pgrstValue } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { canQueryNamedPlace, selectFeature, type Feature } from './evidence.ts'
import { fetchOfficialAddress } from './official-address.ts'
import { countryContradicts, postalContradicts } from '../backfill-venue-cities/geocode-guard.ts'

const BASE = (Deno.env.get('LOCATION_PHOTON_URL') || 'https://photon.komoot.io').replace(/\/$/, '')
const delay = () => new Promise(r => setTimeout(r, 1100))
const must = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message) }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const db = getServiceClient()
  if (!hasValidWebhookSecret(req, 'WEBHOOK_SECRET') && !await requireAdmin(req, db).catch(() => false)) return errorResponse('Unauthorized', 401, req)
  const request = await req.json().catch(() => ({}))
  const bulk = request.bulk === true
  const budgetMs = bulk ? 100000 : 40000
  const started = Date.now()
  const counts = { processed: 0, filled: 0, no_match: 0, failed: 0, stale: 0 }
  // 21 keeps the bulk lease at three minutes while fitting the 100-second budget.
  const claim = await db.rpc('claim_entity_location_jobs', { p_limit: bulk ? 21 : 20 })
  if (claim.error) {
    // PostgREST can briefly lose its schema cache during maintenance. Cron will
    // retry next minute; a 500 here makes the automation circuit breaker
    // unschedule the only durable backfill runner.
    if (/could not query the database for the schema cache/i.test(claim.error.message)) {
      return jsonResponse({ success: true, retryable: true, reason: 'temporary_database_unavailable', ...counts }, 200, req)
    }
    return errorResponse(claim.error.message, 500, req)
  }
  const jobs = claim.data || []
  for (const job of jobs) {
    if (Date.now() - started > budgetMs) {
      must(await db.from('entity_location_jobs').update({ status: 'pending' }).eq('entity_table', job.entity_table).eq('entity_id', job.entity_id).eq('fingerprint', job.fingerprint).eq('status', 'running'))
      continue
    }
    counts.processed++
    const finish = async (patch: Record<string, unknown>) => {
      must(await db.from('entity_location_jobs').update({ ...patch, updated_at: new Date().toISOString() })
        .eq('entity_table', job.entity_table).eq('entity_id', job.entity_id).eq('fingerprint', job.fingerprint))
    }
    try {
      const loaded = await db.from(job.entity_table).select('*').eq('id', job.entity_id).maybeSingle()
      must(loaded)
      const row = loaded.data
      if (!row || row.duplicate_of_id) { await finish({ status: 'done' }); continue }
      for (const key of ['address','postal_code','timezone','website','city','country']) {
        if (typeof row[key] === 'string' && !row[key].trim()) row[key] = null
      }
      const patch: Record<string, unknown> = {}
      let cityName = row.city || null
      let code: string | null = null
      if (row.city_id) {
        const city = await db.from('cities').select('name, country_id, timezone, latitude, longitude').eq('id', row.city_id).maybeSingle()
        must(city)
        cityName ||= city.data?.name
        if (!row.country_id && city.data?.country_id) patch.country_id = city.data.country_id
        if (!row.timezone && city.data?.timezone) patch.timezone = city.data.timezone
        if (!row.timezone && !patch.timezone && city.data?.latitude != null && city.data?.longitude != null
          && !(Number(city.data.latitude) === 0 && Number(city.data.longitude) === 0)) {
          patch.timezone = tzlookup(Number(city.data.latitude), Number(city.data.longitude))
        }
      }
      if (!row.country_id && !patch.country_id && row.country) {
        const resolved = await db.rpc('resolve_country_from_text', { p_country: row.country, p_city: cityName })
        must(resolved); if (resolved.data) patch.country_id = resolved.data
      }
      const countryId = row.country_id || patch.country_id
      if (countryId) {
        const co = await db.from('countries').select('code').eq('id', countryId).maybeSingle()
        must(co); code = co.data?.code || null
      }
      const coords = row.latitude != null && row.longitude != null
      if (coords && !row.timezone) patch.timezone = tzlookup(Number(row.latitude), Number(row.longitude))
      let official = null
      if (!row.address && !coords && row.website) {
        official = await fetchOfficialAddress(row.website)
        if (official) {
          const co = await db.from('countries').select('id,code').or(`code.eq.${official.country.toUpperCase().replace(/[^A-Z]/g, '')},name.eq.${pgrstValue(official.country)}`).is('duplicate_of_id', null).maybeSingle()
          must(co)
          if (!co.data || countryContradicts(code, co.data.code) || postalContradicts(row.postal_code, official.postal_code)
            || cityName && cityName.toLowerCase() !== official.city.toLowerCase()) official = null
          else {
            patch.address = official.address
            if (!row.postal_code && official.postal_code) patch.postal_code = official.postal_code
            if (!row.country_id) patch.country_id = co.data.id
            code ||= co.data.code; cityName ||= official.city
          }
        }
      }
      const input = { ...row, address: row.address || official?.address, postal_code: row.postal_code || official?.postal_code, city: cityName }
      let matched = false
      if (!row.city_id || !row.country_id || !row.postal_code || !coords) {
        const query = [input.address, input.postal_code, cityName].filter(Boolean).join(', ')
        if (coords || canQueryNamedPlace(input, code)
          || (input.address && /\d/.test(input.address) && (cityName || input.postal_code || input.address.includes(',')))) {
          const url = coords
            ? `${BASE}/reverse?lat=${row.latitude}&lon=${row.longitude}&lang=en&limit=5`
            : `${BASE}/api?q=${encodeURIComponent(query)}&lang=en&limit=5${code ? `&countrycode=${code.toLowerCase()}` : ''}`
          const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'QueerGuide/1.0 (https://queer.guide)' } })
          if (!res.ok) throw new Error(`photon_${res.status}`)
          const body = await res.json() as { features?: Feature[] }
          const hit = selectFeature(input, code, body.features || [], coords)
          if (hit) {
            matched = true
            const p = hit.properties!
            const [lon, lat] = hit.geometry!.coordinates!
            if (!coords) { patch.latitude = lat; patch.longitude = lon; patch.timezone ||= tzlookup(lat, lon) }
            if (!row.postal_code && p.postcode) patch.postal_code = p.postcode
            if (!row.state && p.state) patch.state = p.state
            if (!row.country_id) {
              const co = await db.from('countries').select('id').eq('code', p.countrycode.toUpperCase()).is('duplicate_of_id', null).maybeSingle()
              must(co); if (co.data) patch.country_id = co.data.id
            }
            if (!row.city_id && p.city) {
              const city = await db.rpc('city_resolve_or_create', { p_name: p.city, p_country_code: p.countrycode.toUpperCase(),
                p_lat: coords ? Number(row.latitude) : lat, p_lng: coords ? Number(row.longitude) : lon,
                p_source_slug: 'photon-location', p_actor: 'entity-location-completion' })
              must(city)
              const result = Array.isArray(city.data) ? city.data[0] : city.data
              if (result?.city_id && result.action !== 'refused') patch.city_id = result.city_id
            }
          }
          await delay()
        }
      }
      const applied = await db.rpc('apply_entity_location', { p_table: job.entity_table, p_id: job.entity_id,
        p_fingerprint: job.fingerprint, p_patch: patch, p_source: official ? `official-website:${row.website};photon-openstreetmap` : matched ? 'photon-openstreetmap' : 'city/timezone-boundaries' })
      must(applied)
      if (applied.data?.stale) {
        counts.stale++
        const refreshed = await db.rpc('refresh_stale_entity_location_job', {
          p_table: job.entity_table, p_id: job.entity_id, p_fingerprint: job.fingerprint,
        })
        must(refreshed)
        continue
      }
      counts.filled += applied.data?.filled || 0
      const completed = applied.data?.row || row
      const state = completed.city_id && completed.country_id && completed.postal_code?.trim()
        && completed.latitude != null && completed.longitude != null && completed.timezone?.trim() ? 'done' : 'no_match'
      if (state === 'no_match') counts.no_match++
      // Applying the patch fires the enqueue trigger with a new fingerprint. Complete that new job only
      // when its row equals the original snapshot plus our patch; concurrent edits remain pending.
      must(await db.from('entity_location_jobs').update({ status: state, last_error: state === 'no_match'
        ? applied.data?.blocked ? 'blocked_by_existing_location_policy' : 'insufficient_or_unmatched_address_evidence'
        : null, updated_at: new Date().toISOString() })
        .eq('entity_table', job.entity_table).eq('entity_id', job.entity_id).in('fingerprint', [job.fingerprint, applied.data?.fingerprint || job.fingerprint]))
    } catch (e) {
      counts.failed++
      await finish({ status: 'error', attempts: job.attempts + 1, last_error: String(e).slice(0, 500),
        next_attempt_at: new Date(Date.now() + 60000 * 2 ** job.attempts).toISOString() })
    }
  }
  if (jobs.length) {
    const released = await db.rpc('release_entity_location_lease', { p_claimed_at: jobs[0].updated_at })
    if (released.error) {
      if (/could not query the database for the schema cache/i.test(released.error.message)) {
        return jsonResponse({ success: true, retryable: true, reason: 'temporary_database_unavailable', ...counts }, 200, req)
      }
      return errorResponse(released.error.message, 500, req)
    }
  }
  return jsonResponse({ success: true, ...counts }, 200, req)
})
