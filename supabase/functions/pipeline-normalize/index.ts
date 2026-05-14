import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import {
  normalizePhone, normalizeEmail, extractDomain, normalizeName, sha256Hex,
} from '../_shared/venue-pipeline-utils.ts'
import {
  inferAccommodationType, normalizeAmenities, normalizeStarRating,
  normalizePlatformIds, detectLgbtqMarkers,
} from '../_shared/hotel-pipeline-utils.ts'
import { computeIdempotencyKey } from '../_shared/idempotency.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// Pipeline Normalize
// Reads raw_data → writes normalized_data + idempotency keys.
// Venue-aware: populates phone_e164 / website_domain / email_lower / name_normalized
// into normalized_data for downstream dedup & commit.
// ============================================================

Deno.serve(withErrorReporting('pipeline-normalize', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const entityType    = body.entityType as string
    const batchSize     = body.batch_size || 50
    const dryRun        = body.dry_run || false

    let query = supabase
      .from('ingestion_staging')
      .select('id, raw_data, source_type, source_name, entity_type, target_table, source_entity_id, payload_hash')
      .is('normalized_data', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    // Scope to current pipeline run when provided so executor invocations
    // don't get starved behind legacy backlog.
    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    if (entityType)    query = query.eq('entity_type', entityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`load staging: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to normalize' }, 200, req)
    }

    let ok = 0, failed = 0

    for (const item of items) {
      try {
        const raw  = (item.raw_data ?? {}) as Record<string, unknown>
        const type = item.entity_type || entityType || guessEntityType(item.target_table)
        const normalized = normalizeItem(raw, type)

        // Geocode enrichment: events + venues without coords but with address/city
        if ((type === 'event' || type === 'venue') && !dryRun) {
          const loc = (normalized.location as Record<string, unknown>) ?? {}
          const hasGeo = Number.isFinite(loc.lat as number) && Number.isFinite(loc.lng as number)
          const addrParts = [loc.address, loc.city, loc.country].filter(Boolean).map(String).join(', ')
          if (!hasGeo && addrParts.length > 3) {
            try {
              const geo = await geocodeAddress(addrParts)
              if (geo) {
                (normalized.location as Record<string, unknown>).lat = geo.lat
                ;(normalized.location as Record<string, unknown>).lng = geo.lng
                normalized.geocoded_by = 'photon'
                normalized.geocoded_at = new Date().toISOString()
              }
            } catch (e) {
              console.warn(`geocode ${item.id} skipped:`, (e as Error).message)
            }
          }
        }

        // Idempotency: compute source_entity_id + payload_hash
        const sourceEntityId = item.source_entity_id
          ?? (String(raw.id ?? raw.external_id ?? raw.source_id ?? raw.fsq_id ?? raw.place_id
                ?? raw.awin_id ?? raw.product_id ?? raw.listing_id ?? raw.event_id ?? raw.url ?? '')
                .trim() || null)

        const payloadHash = item.payload_hash
          ?? await sha256Hex(JSON.stringify(raw))

        // Deterministic idempotency_key shared with SQL trigger
        // (compute_staging_idempotency_key) — required to participate in the
        // ux_ingestion_staging_source_idem unique index.
        const idempotencyKey = await computeIdempotencyKey(
          item.source_name,
          sourceEntityId,
          payloadHash,
          item.id,
        )

        if (!dryRun) {
          const { error: upErr } = await supabase.from('ingestion_staging').update({
            normalized_data:   normalized,
            entity_type:       type,
            source_entity_id:  sourceEntityId,
            payload_hash:      payloadHash,
            idempotency_key:   idempotencyKey,
            updated_at:        new Date().toISOString(),
          }).eq('id', item.id)

          if (upErr) throw new Error(upErr.message)

          await supabase.from('ingestion_events').insert({
            staging_id: item.id,
            stage:      'normalize',
            new_status: 'normalized',
            actor:      'pipeline-normalize',
            payload:    { entity_type: type, source_entity_id: sourceEntityId },
          })
        }
        ok++
      } catch (e) {
        console.error(`normalize ${item.id}:`, (e as Error).message)
        if (!dryRun) {
          await supabase.from('ingestion_staging').update({
            error_message: `normalize: ${(e as Error).message}`,
            disposition:   'rejected',
            updated_at:    new Date().toISOString(),
          }).eq('id', item.id)
          await supabase.from('ingestion_events').insert({
            staging_id: item.id, stage: 'normalize', new_status: 'rejected',
            actor: 'pipeline-normalize', payload: { error: (e as Error).message },
          })
        }
        failed++
      }
    }

    return jsonResponse({
      success: true,
      items: ok,
      items_total: items.length,
      items_processed: ok + failed,
      items_succeeded: ok,
      items_failed: failed,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-normalize:', error)
    await logPipelineError(supabase, 'pipeline-normalize', error, { severity: 'fatal' })
    return errorResponse((error as Error).message, 500, req)
  }
}))

function guessEntityType(t: string | null): string {
  if (!t) return 'unknown'
  const m: Record<string, string> = {
    venues: 'venue', events: 'event', personalities: 'personality',
    news_articles: 'news_article', unified_tags: 'tag', cities: 'city',
    countries: 'country', marketplace_listings: 'marketplace', airports: 'airport',
  }
  return m[t] || t.replace(/s$/, '')
}

function normalizeItem(raw: Record<string, unknown>, entityType: string): Record<string, unknown> {
  const n: Record<string, unknown> = {
    entity_type: entityType,
    source_id: raw.id ?? raw.source_id ?? raw.external_id ?? null,
  }

  // Social ingestion rows come from community_submissions and surface their
  // signals as `_*` keys on raw_data (set by source-community-submissions).
  // Hydrate them into the standard slots before the normal field mapping
  // runs, so vision_summary / ocr_text / raw_text actually flow through.
  if (typeof raw._platform === 'string') {
    hydrateSocialSignalsIntoRaw(raw)
  }

  n.name        = cleanText(raw.name || raw.title || raw.display_name || '')
  n.description = cleanText(raw.description || raw.body || raw.content || raw.summary || '')

  // Location — also check raw.geo.lat/lng (outsavvy, gaycities scraper format)
  const loc = (raw.location ?? {}) as Record<string, unknown>
  const geo = (raw.geo ?? {}) as Record<string, unknown>
  const lat = Number(raw.lat ?? raw.latitude ?? loc.lat ?? geo.lat)
  const lng = Number(raw.lng ?? raw.longitude ?? loc.lng ?? raw.lon ?? geo.lng)
  if (Number.isFinite(lat) || Number.isFinite(lng) || raw.address || raw.city || raw.country) {
    const country = cleanText(raw.country || loc.country || '')
    n.location = {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      address: cleanText(raw.address || loc.address || ''),
      city:    cleanText(raw.city || loc.city || ''),
      country: country || null,
      country_code: String(raw.country_code || raw.countryCode || loc.country_code || '').toUpperCase().slice(0, 2) || null,
    }
  }

  // Dates (events) — also check start_datetime/end_datetime (outsavvy format)
  const startDate = raw.start_date || raw.start_datetime || raw.date || raw.created_at || raw.published_at
  const endDate = raw.end_date || raw.end_datetime
  if (startDate) {
    n.dates = {
      start: normalizeDate(startDate),
      end:   normalizeDate(endDate),
    }
  }

  // Tags
  if (raw.tags || raw.categories || raw.keywords) {
    const tags = raw.tags || raw.categories || raw.keywords
    n.tags = Array.isArray(tags)
      ? tags.map(String)
      : String(tags).split(',').map((t) => t.trim()).filter(Boolean)
  }

  // URLs
  const urls: string[] = []
  if (raw.url)     urls.push(String(raw.url))
  if (raw.website) urls.push(String(raw.website))
  if (raw.link)    urls.push(String(raw.link))
  if (urls.length) n.urls = urls

  // Images
  const images: string[] = []
  if (raw.image)     images.push(String(raw.image))
  if (raw.image_url) images.push(String(raw.image_url))
  if (raw.photo)     images.push(String(raw.photo))
  if (Array.isArray(raw.images)) images.push(...raw.images.map(String))
  if (images.length) n.images = images

  // Contacts — raw + normalized forms (needed by dedup/commit)
  if (raw.email || raw.phone || raw.website || raw.url) {
    const phone   = raw.phone ? String(raw.phone).trim() : null
    const email   = raw.email ? String(raw.email).trim() : null
    const website = raw.website ? String(raw.website).trim() : (raw.url ? String(raw.url).trim() : null)
    n.contacts = {
      phone, email, website,
      phone_e164:     normalizePhone(phone),
      email_lower:    normalizeEmail(email),
      website_domain: extractDomain(website),
    }
  }

  if (entityType === 'venue' || entityType === 'event' || entityType === 'place') {
    n.name_normalized = normalizeName(n.name as string)
    if (raw.category || raw.categories) {
      n.category = Array.isArray(raw.categories)
        ? String(raw.categories[0] ?? '').toLowerCase()
        : String(raw.category ?? '').toLowerCase()
    }
  }

  // Accommodation-aware enrichment (hotels/B&Bs).
  if (entityType === 'venue') {
    const hint = String(
      raw.accommodation_type ?? raw.subcategory ?? raw.venue_subtype ?? n.category ?? ''
    )
    const at = inferAccommodationType(String(n.name ?? ''), String(n.description ?? ''), hint)
    const platformIds = normalizePlatformIds(raw.platform_ids ?? {
      airbnb:      raw.airbnb_id,
      booking:     raw.booking_id      ?? raw.booking_com_id,
      expedia:     raw.expedia_id,
      misterbnb:   raw.misterbnb_id,
      tripadvisor: raw.tripadvisor_id  ?? raw.location_id,
      google:      raw.google_place_id ?? raw.place_id,
      foursquare:  raw.fsq_id          ?? raw.foursquare_id,
      spartacus:   raw.spartacus_id,
    })
    const stars     = normalizeStarRating(raw.star_rating ?? raw.stars ?? raw.rating)
    const amenities = normalizeAmenities(raw.amenities ?? raw.features ?? raw.facilities)
    const bookingUrl = raw.booking_url ?? raw.booking_link ?? raw.reservation_url ?? null
    const markers   = detectLgbtqMarkers(n.tags, n.description)

    if (at)                              n.accommodation_type = at
    if (Object.keys(platformIds).length) n.platform_ids       = platformIds
    if (stars != null)                   n.star_rating        = stars
    if (amenities.length)                n.amenities          = amenities
    if (bookingUrl)                      n.booking_url        = String(bookingUrl).trim()
    if (markers.length)                  n.lgbtq_markers      = markers

    if (raw.is_organizer === true) n.is_organizer = true
    const handles = raw.organizer_handles
    if (handles && typeof handles === 'object' && !Array.isArray(handles)) {
      n.organizer_handles = handles
    }
  }

  if (entityType === 'country') {
    n.name_normalized = normalizeName(n.name as string)
    const code = raw.code ?? raw.cca2 ?? raw.iso_a2 ?? raw.country_code
    if (code) n.code = String(code).trim().toUpperCase()
    if (raw.capital)    n.capital    = cleanText(Array.isArray(raw.capital) ? raw.capital[0] : raw.capital)
    if (raw.population) n.population = Number(raw.population)
    if (raw.area || raw.area_km2) n.area_km2 = Number(raw.area ?? raw.area_km2)
    if (raw.currency)   n.currency   = cleanText(typeof raw.currency === 'object'
      ? (raw.currency as Record<string, unknown>).code ?? ''
      : raw.currency)
    if (raw.languages) {
      n.languages = Array.isArray(raw.languages)
        ? (raw.languages as unknown[]).map(String)
        : typeof raw.languages === 'object'
          ? Object.values(raw.languages as Record<string, unknown>).map(String)
          : [String(raw.languages)]
    }
    if (raw.timezone || raw.timezones) {
      const tz = raw.timezone ?? (Array.isArray(raw.timezones) ? raw.timezones[0] : raw.timezones)
      n.timezone = String(tz)
    }
  }

  if (entityType === 'personality') {
    n.name_normalized = normalizeName(n.name as string)

    // Dates: accept year-only (1947), full date (1947-05-12), or ISO
    n.birth_date = normalizeBirthDate(raw.birth_date ?? raw.born ?? raw.dob)
    n.death_date = normalizeBirthDate(raw.death_date ?? raw.died ?? raw.dod)
    n.is_living  = n.death_date ? false
      : (raw.is_living != null ? Boolean(raw.is_living) : true)

    // Core fields with multi-alias fallback
    const profArr = raw.professions ?? raw.occupation ?? raw.profession
    n.profession  = Array.isArray(profArr)
      ? profArr.map(String).filter(Boolean).join(', ')
      : cleanText(profArr ?? '')
    n.nationality = cleanText(raw.nationality ?? raw.citizenship ?? raw.country_of_citizenship ?? '')
    n.birth_place = cleanText(raw.birth_place ?? raw.place_of_birth ?? raw.birthplace ?? '')
    n.pronouns    = cleanText(raw.pronouns ?? raw.gender_pronouns ?? '')
    n.bio         = cleanText(raw.bio ?? raw.biography ?? '')
    n.top_book    = cleanText(raw.top_book ?? '')

    // Image: validate scheme only
    const img = String(raw.image_url ?? raw.image ?? raw.photo ?? '').trim()
    if (img && /^https?:\/\//i.test(img)) n.image_url = img

    // Website
    const web = String(raw.website_url ?? raw.website ?? raw.url ?? '').trim()
    if (web && /^https?:\/\//i.test(web)) n.website_url = web

    // Wikidata QID — strong dedup key
    const qidRaw = String(raw.wikidata_qid ?? raw.qid ?? raw.wikidata ?? '').trim()
    const qidMatch = qidRaw.match(/Q\d+/)
    if (qidMatch) n.wikidata_qid = qidMatch[0]

    // External IDs → JSONB map
    const ext: Record<string, string> = {}
    for (const k of ['imdb_id', 'musicbrainz_id', 'isni', 'viaf', 'freebase_id', 'twitter', 'instagram', 'facebook']) {
      const v = String(raw[k as keyof typeof raw] ?? '').trim()
      if (v) ext[k] = v
    }
    if (Object.keys(ext).length) n.external_ids = ext

    // Fields (jsonb array of strings, no duplicates, trimmed)
    const fieldsRaw = raw.fields ?? raw.field ?? raw.interests
    if (fieldsRaw) {
      const arr = Array.isArray(fieldsRaw) ? fieldsRaw
        : String(fieldsRaw).split(/[,;]/)
      n.fields = [...new Set(arr.map((f) => cleanText(f)).filter(Boolean))]
    }

    // Social links
    const social: Record<string, string> = {}
    for (const k of ['twitter', 'instagram', 'facebook', 'youtube', 'tiktok', 'linkedin']) {
      const v = String((raw as Record<string, unknown>)[`${k}_url`] ?? (raw as Record<string, unknown>)[k] ?? '').trim()
      if (v && /^https?:\/\//i.test(v)) social[k] = v
    }
    if (Object.keys(social).length) n.social_links = social

    // LGBTI connection
    n.lgbti_connection = cleanText(raw.lgbti_connection ?? raw.lgbtq_connection ?? '')
    n.lgbti_details    = cleanText(raw.lgbti_details    ?? raw.lgbtq_details    ?? '')

    // Default visibility/verification (overridden by review-gate later)
    n.visibility          = raw.visibility ?? 'draft'
    n.verification_status = raw.verification_status ?? 'pending'
    n.is_featured         = Boolean(raw.is_featured ?? false)
  }

  if (entityType === 'city') {
    n.name_normalized = normalizeName(n.name as string)
    if (raw.population)  n.population  = Number(raw.population)
    if (raw.area_km2)    n.area_km2    = Number(raw.area_km2)
    if (raw.timezone)    n.timezone    = String(raw.timezone)
    if (raw.region_name || raw.state || raw.admin1) {
      n.region_name = cleanText(raw.region_name ?? raw.state ?? raw.admin1)
    }
  }

  n.metadata = { ...raw }
  return n
}

function cleanText(v: unknown): string {
  if (!v) return ''
  return String(v)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim()
}

function normalizeDate(v: unknown): string | null {
  if (!v) return null
  try {
    const d = new Date(String(v))
    return isNaN(d.getTime()) ? null : d.toISOString()
  } catch { return null }
}

/** Accept "1947", "1947-05", "1947-05-12", "+1947-05-12T00:00:00Z" (Wikidata), "-0047-01-01" (BCE → null). Returns YYYY-MM-DD. */
function normalizeBirthDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  if (!s) return null
  // BCE dates not supported by PG date type without era handling — drop.
  if (s.startsWith('-')) return null
  const stripped = s.replace(/^\+/, '').replace(/T.*$/, '')
  // Year-only → Jan 1
  const yearOnly = stripped.match(/^(\d{3,4})$/)
  if (yearOnly) return `${yearOnly[1].padStart(4, '0')}-01-01`
  // Year-month → day 1
  const ym = stripped.match(/^(\d{4})-(\d{2})$/)
  if (ym) return `${ym[1]}-${ym[2]}-01`
  // Full YYYY-MM-DD
  const ymd = stripped.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return ymd[0]
  // Fallback: Date parse
  const d = new Date(stripped)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/**
 * Heuristic extractor for social submissions. Reads vision_summary + ocr_text
 * + raw_text + transcript_text and populates title/description/dates/location/url
 * on raw, so the standard normalizer below can pick them up. Idempotent —
 * existing fields on raw are preserved.
 */
function hydrateSocialSignalsIntoRaw(raw: Record<string, unknown>): void {
  const text = [
    raw._raw_text, raw._vision_summary, raw._ocr_text, raw._transcript_text,
  ].map((v) => (typeof v === 'string' ? v : '')).join('\n').trim()
  if (!text) return

  // Title: prefer "called \"X\"" or first quoted phrase in vision_summary.
  if (!raw.title && !raw.name) {
    const m = text.match(/called\s+"([^"]{2,80})"/i)
      ?? text.match(/"([^"]{3,80})"\s+(?:is\s+)?prominently/i)
      ?? text.match(/title\s+"([^"]{3,80})"/i)
    if (m) raw.title = m[1].trim()
  }

  // Description: take first paragraph of vision_summary, stripped of markdown.
  if (!raw.description) {
    const vs = typeof raw._vision_summary === 'string' ? raw._vision_summary : ''
    const cleaned = vs
      .replace(/\*\*[^*]+\*\*/g, '')
      .replace(/[*+#]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (cleaned) raw.description = cleaned.slice(0, 2000)
  }

  // Event dates: "Month DD, YYYY" → ISO. Picks earliest as start_date.
  const months = '(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)'
  const dateRe = new RegExp(`${months}\\s+\\d{1,2},?\\s+\\d{4}`, 'gi')
  const matches = text.match(dateRe) ?? []
  const parsedDates = matches
    .map((s) => new Date(s).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (parsedDates.length && !raw.start_date) {
    raw.start_date = new Date(parsedDates[0]).toISOString()
    if (parsedDates.length > 1 && !raw.end_date) {
      raw.end_date = new Date(parsedDates[parsedDates.length - 1]).toISOString()
    }
  }

  // Location: capture city after "Month DD, YYYY: <City>" patterns. Prefer
  // first occurrence (matches first date row).
  if (!raw.city) {
    const cityRe = new RegExp(`${months}\\s+\\d{1,2},?\\s+\\d{4}\\s*[:\\-–]\\s*([A-Z][A-Za-zÀ-ÿ' .-]{2,40})`, 'i')
    const cm = text.match(cityRe)
    if (cm) raw.city = cm[1].trim().replace(/\s+/g, ' ')
  }

  // URL: first http(s) or www.X link in text → normalize to https://.
  if (!raw.url && !raw.website) {
    const um = text.match(/https?:\/\/[^\s"<>)]+/i) ?? text.match(/\bwww\.[A-Za-z0-9.-]+\.[a-z]{2,}\b/i)
    if (um) {
      const u = um[0]
      raw.url = u.startsWith('http') ? u : `https://${u}`
    }
  }
}

/** Forward-geocode a free-form address via Photon (komoot). Returns null on any failure. */
async function geocodeAddress(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=1&lang=en`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const j = await res.json() as { features?: Array<{ geometry?: { coordinates?: number[] } }> }
    const coords = j.features?.[0]?.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    const [lng, lat] = coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch { return null }
}
