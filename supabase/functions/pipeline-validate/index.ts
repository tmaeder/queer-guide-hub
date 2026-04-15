import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import {
  validateVenueNormalized,
  validateCityNormalized,
  validateCountryNormalized,
} from '../_shared/venue-pipeline-utils.ts'
import {
  validateHotelNormalized, scoreHotelQuality, hotelReviewDisposition,
} from '../_shared/hotel-pipeline-utils.ts'
import { validateMarketplaceNormalized } from '../_shared/marketplace-pipeline-utils.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Pipeline Validate
// Venue-aware rule codes + quality score. Writes to ai_validation_*.
// Rejects hard errors, flags multi-warning items for review.
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const entityType    = body.entityType as string
    const batchSize     = body.batch_size || 50
    const dryRun        = body.dry_run || false
    const warnReview    = body.warn_review_threshold ?? 3  // >N warnings → review

    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .eq('ai_validation_status', 'pending')
      .not('normalized_data', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    if (entityType)    query = query.eq('entity_type', entityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to validate' }, 200, req)
    }

    let approved = 0, rejected = 0, needsReview = 0, hardFailures = 0

    for (const item of items) {
     try {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const type = item.entity_type || entityType

      let errors: string[] = []
      let warnings: string[] = []
      let quality = 100

      if (type === 'venue' || item.target_table === 'venues') {
        const isHotel = !!n.accommodation_type
        if (isHotel) {
          const r = validateHotelNormalized(n)
          errors = r.errors; warnings = r.warnings
          quality = scoreHotelQuality(n)
        } else {
          const r = validateVenueNormalized(n)
          errors = r.errors; warnings = r.warnings; quality = r.quality
        }
      } else if (type === 'country' || item.target_table === 'countries') {
        const r = validateCountryNormalized(n)
        errors = r.errors; warnings = r.warnings; quality = r.quality
      } else if (type === 'marketplace' || item.target_table === 'marketplace_listings') {
        const r = validateMarketplaceNormalized(n)
        errors = r.errors; warnings = r.warnings; quality = r.quality
      } else if (type === 'city' || item.target_table === 'cities') {
        const r = validateCityNormalized(n)
        errors = r.errors; warnings = r.warnings; quality = r.quality
      } else if (type === 'news_articles' || type === 'news_article' || item.target_table === 'news_articles') {
        // News-specific validation. Tolerant of normalize/adapter shape.
        const minContentLen = (body.min_content_length as number) ?? 120
        const rejectBelow   = (body.reject_below_score as number) ?? 60

        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const urls = (n.urls ?? []) as string[]
        const title = String(n.title ?? n.name ?? '').trim()
        const url   = String(n.url ?? urls[0] ?? meta.url ?? '').trim()
        const sourceId = (n.source_id as string) ?? (meta.source_id as string | null) ?? null
        // Strip HTML for content-length check
        const rawContent = String(n.content ?? n.description ?? '')
        const stripped = rawContent
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
          .replace(/\s+/g, ' ').trim()
        const dates = (n.dates ?? {}) as Record<string, unknown>
        const publishedAt = (n.published_at as string | undefined)
          ?? (dates.start as string | undefined)
          ?? (meta.published_at as string | undefined)

        if (title.length < 6) errors.push('E_TITLE_TOO_SHORT')
        if (title.length > 500) warnings.push('W_TITLE_TRUNCATED')
        if (!sourceId) errors.push('E_MISSING_SOURCE')
        if (!url) errors.push('E_MISSING_URL')
        else {
          try {
            const u = new URL(url)
            if (!['http:', 'https:'].includes(u.protocol)) errors.push('E_INVALID_URL_SCHEME')
          } catch { errors.push('E_INVALID_URL') }
        }
        if (stripped.length < minContentLen) {
          if (stripped.length === 0) errors.push('E_NO_CONTENT')
          else warnings.push('W_CONTENT_THIN')
        }
        // Boilerplate / paywall sniffer
        if (/subscribe|sign in to read|paywall|register to continue/i.test(stripped.slice(0, 400))) {
          warnings.push('W_PAYWALL_SUSPECTED')
        }
        // HTML residue after strip
        if (/&[a-z]+;/i.test(stripped) || /<[a-z]/i.test(stripped)) {
          warnings.push('W_HTML_RESIDUE')
        }
        // Future-dated articles (>1 day ahead) are suspicious
        if (publishedAt) {
          const t = new Date(publishedAt).getTime()
          if (!Number.isFinite(t)) warnings.push('W_INVALID_DATE')
          else if (t > Date.now() + 86400000) warnings.push('W_FUTURE_DATE')
          else if (t < Date.now() - 365 * 86400000 * 5) warnings.push('W_VERY_OLD')
        } else {
          warnings.push('W_NO_PUBLISHED_AT')
        }

        // Replace stripped content back so commit gets clean text
        if (stripped && stripped !== rawContent) {
          (n as Record<string, unknown>).content = stripped
        }

        quality = Math.max(0, 100 - warnings.length * 5 - errors.length * 50)
        if (quality < rejectBelow && errors.length === 0) {
          errors.push('E_QUALITY_BELOW_THRESHOLD')
        }
      } else if (type === 'personality' || item.target_table === 'personalities') {
        // Personality-specific validation
        const name = String(n.name ?? '').trim()
        if (name.length < 2) errors.push('E_MISSING_NAME')
        if (name.length > 200) warnings.push('W_NAME_UNUSUALLY_LONG')

        const qid = String(n.wikidata_qid ?? '').trim()
        if (qid && !/^Q\d+$/.test(qid)) errors.push('E_INVALID_WIKIDATA_QID')

        const birth = n.birth_date as string | undefined
        const death = n.death_date as string | undefined
        if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) errors.push('E_INVALID_BIRTH_DATE')
        if (death && !/^\d{4}-\d{2}-\d{2}$/.test(death)) errors.push('E_INVALID_DEATH_DATE')
        if (birth && death && birth > death) errors.push('E_BIRTH_AFTER_DEATH')
        if (birth) {
          const year = Number(birth.slice(0, 4))
          if (year < 1000 || year > new Date().getFullYear()) warnings.push('W_BIRTH_YEAR_IMPLAUSIBLE')
        }

        const image = String(n.image_url ?? '').trim()
        if (image && !/^https?:\/\//i.test(image)) errors.push('E_IMAGE_URL_SCHEME')

        const web = String(n.website_url ?? '').trim()
        if (web) {
          try {
            const u = new URL(web)
            if (!['http:', 'https:'].includes(u.protocol)) errors.push('E_WEBSITE_SCHEME')
          } catch { errors.push('E_INVALID_WEBSITE') }
        }

        if (!n.description && !n.bio) warnings.push('W_NO_DESCRIPTION')
        if (!n.profession)             warnings.push('W_NO_PROFESSION')
        if (!n.nationality)            warnings.push('W_NO_NATIONALITY')
        if (!n.image_url)              warnings.push('W_NO_IMAGE')
        if (!n.lgbti_connection)       warnings.push('W_NO_LGBTI_CONNECTION')
        if (!n.wikidata_qid)           warnings.push('W_NO_WIKIDATA_QID')

        quality = Math.max(0, 100 - warnings.length * 5 - errors.length * 40)
      } else if (type === 'event' || item.target_table === 'events') {
        // Event-specific validation: title, dates, location, time sanity
        const title = String(n.title ?? n.name ?? '').trim()
        const loc = (n.location ?? {}) as Record<string, unknown>
        const dates = (n.dates ?? {}) as Record<string, unknown>
        const startStr = String(n.start_date ?? dates.start ?? '').trim()
        const endStr   = String(n.end_date ?? dates.end ?? '').trim()

        if (title.length < 3) errors.push('E_TITLE_TOO_SHORT')
        if (title.length > 300) warnings.push('W_TITLE_TRUNCATED')
        if (!startStr) errors.push('E_MISSING_START_DATE')

        const startTs = startStr ? new Date(startStr).getTime() : NaN
        const endTs   = endStr   ? new Date(endStr).getTime()   : NaN

        if (startStr && !Number.isFinite(startTs)) errors.push('E_INVALID_START_DATE')
        if (endStr   && !Number.isFinite(endTs))   errors.push('E_INVALID_END_DATE')
        if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs < startTs) {
          errors.push('E_END_BEFORE_START')
        }
        // Past > 1yr → warn (likely already-finished archive data)
        if (Number.isFinite(startTs) && startTs < Date.now() - 365 * 86400_000) {
          warnings.push('W_EVENT_IN_PAST')
        }
        // Future > 5yr → warn (likely parse error)
        if (Number.isFinite(startTs) && startTs > Date.now() + 5 * 365 * 86400_000) {
          warnings.push('W_EVENT_TOO_FAR_FUTURE')
        }

        // Location: need either venue_id, city, or geo
        const hasVenue = !!n.venue_id
        const city = String(loc.city ?? n.city ?? '').trim()
        const lat = Number(loc.lat ?? n.latitude)
        const lng = Number(loc.lng ?? n.longitude)
        const hasGeo = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0
        if (!hasVenue && !city && !hasGeo) errors.push('E_NO_LOCATION')
        if (hasGeo && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) errors.push('E_GEO_OUT_OF_RANGE')
        if (!hasGeo && !hasVenue) warnings.push('W_NO_GEO')

        // Description length (optional but penalized)
        const desc = String(n.description ?? '').trim()
        if (desc.length < 30) warnings.push('W_DESCRIPTION_THIN')

        // URLs
        const urls = (n.urls ?? []) as string[]
        for (const u of urls) {
          try {
            const parsed = new URL(u)
            if (!['http:', 'https:'].includes(parsed.protocol)) warnings.push('W_URL_SCHEME')
          } catch { warnings.push('W_INVALID_URL') }
        }

        quality = Math.max(0, 100 - warnings.length * 5 - errors.length * 40)
      } else {
        // Minimal generic validation for remaining legacy entities
        const name = String(n.name ?? '').trim()
        if (name.length < 2) errors.push('E_MISSING_NAME')
        const urls = (n.urls ?? []) as string[]
        for (const u of urls) {
          try { new URL(u) } catch { warnings.push('W_INVALID_URL') }
        }
        quality = Math.max(0, 100 - warnings.length * 5 - errors.length * 50)
      }

      let status: 'approved' | 'rejected' | 'needs_review'
      let confidence: number

      // Hotel-aware disposition: quality-driven thresholds override warning-count rule.
      const isHotelItem = (type === 'venue' || item.target_table === 'venues') && !!n.accommodation_type
      if (isHotelItem) {
        const disp = hotelReviewDisposition({ errors, warnings, quality }, quality)
        if (disp === 'auto_reject')  { status = 'rejected';     confidence = 0 }
        else if (disp === 'auto_approve') { status = 'approved'; confidence = Math.max(0.85, quality / 100) }
        else                         { status = 'needs_review'; confidence = 0.5 }
      } else if (errors.length > 0) {
        status = 'rejected'; confidence = 0
      } else if (warnings.length >= warnReview) {
        status = 'needs_review'; confidence = 0.5
      } else {
        status = 'approved'
        confidence = warnings.length === 0 ? 1.0 : Math.max(0.7, 1 - warnings.length * 0.05)
      }

      if (!dryRun) {
        const update: Record<string, unknown> = {
          ai_validation_status: status,
          ai_confidence_score:  confidence,
          ai_validation_result: { errors, warnings, quality },
          ai_validated_at:      new Date().toISOString(),
          disposition:          status === 'rejected' ? 'rejected' : 'pending',
          review_status:        status === 'needs_review' ? 'pending_review' : 'auto',
          updated_at:           new Date().toISOString(),
        }
        // Persist any in-place normalization (e.g. HTML-stripped content for news)
        if (type === 'news_articles' || item.target_table === 'news_articles') {
          update.normalized_data = n
        }
        await supabase.from('ingestion_staging').update(update).eq('id', item.id)

        await supabase.from('ingestion_events').insert({
          staging_id: item.id,
          stage: 'validate',
          new_status: status,
          actor: 'pipeline-validate',
          payload: { errors, warnings, quality, confidence },
        })

        // Escalate rejections to review_queue so humans can rescue legitimate items
        if (status === 'needs_review') {
          await supabase.from('review_queue').insert({
            entity_type: 'ingestion_staging',
            entity_id: item.id,
            review_type: 'validate_flag',
            status: 'pending',
            details: { errors, warnings, quality, target_table: item.target_table },
          })
        }
      }

      if (status === 'approved') approved++
      else if (status === 'rejected') rejected++
      else needsReview++
     } catch (e) {
      // Per-item isolation: a single bad row (e.g. malformed nested object that
      // crashes a validator with TypeError) must NOT abort the batch.
      hardFailures++
      const msg = (e as Error).message
      console.error(`validate ${item.id}: ${msg}`)
      if (!dryRun) {
        await supabase.from('ingestion_staging').update({
          ai_validation_status: 'rejected',
          ai_confidence_score: 0,
          ai_validation_result: { errors: ['E_VALIDATOR_CRASH'], warnings: [], quality: 0, crash: msg },
          ai_validated_at: new Date().toISOString(),
          disposition: 'rejected',
          error_message: `validate crash: ${msg}`,
          updated_at: new Date().toISOString(),
        }).eq('id', item.id)
        await supabase.from('ingestion_events').insert({
          staging_id: item.id, stage: 'validate', new_status: 'rejected',
          actor: 'pipeline-validate', payload: { crash: msg },
        })
      }
      rejected++
     }
    }

    return jsonResponse({
      success: true,
      items: approved + needsReview,
      items_total: items.length,
      items_processed: approved + rejected + needsReview,
      items_failed: hardFailures,
      items_succeeded: approved,
      items_failed: rejected,
      approved, rejected, needs_review: needsReview,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-validate:', error)
    await logPipelineError(supabase, 'pipeline-validate', error, { severity: 'fatal' })
    return errorResponse((error as Error).message, 500, req)
  }
})
