import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'

// ============================================================
// Pipeline Deduplicate (venue-aware, multi-signal)
// Uses find_venue_duplicate_candidates RPC (phone / email / domain+geo /
// trigram+geo). Writes decision to scraper_dedupe_decisions + ingestion_events.
// Non-venue targets fall back to legacy name+ilike matching.
// ============================================================

interface DedupCandidate {
  venue_id?: string
  event_id?: string
  match_type: string
  score: number
  distance_m: number | null
  time_diff_hours?: number | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const autoMergeMin  = body.auto_merge_min ?? 0.90  // ≥ this = auto duplicate
    const reviewMin     = body.review_min ?? 0.75      // ≥ this = flag review
    const batchSize     = body.batch_size || 50
    const dryRun        = body.dry_run || false

    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .eq('ai_validation_status', 'approved')
      .eq('dedup_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)

    const { data: items, error } = await query
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to dedup' }, 200, req)
    }

    let unique = 0, duplicates = 0, flagged = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const table = item.target_table
      const isVenue = table === 'venues' || item.entity_type === 'venue'
      const isEvent = table === 'events' || item.entity_type === 'event'
      const isPersonality = table === 'personalities' || item.entity_type === 'personality'

      let matchId: string | null = null
      let matchScore = 0
      let matchType = ''
      let rulesFired: DedupCandidate[] = []

      if (isEvent) {
        const loc = (n.location ?? {}) as Record<string, unknown>
        const dates = (n.dates ?? {}) as Record<string, unknown>
        const startDate = (n.start_date as string) ?? (dates.start as string) ?? null
        if (startDate) {
          const { data: candidates, error: rpcErr } = await supabase.rpc(
            'find_event_duplicate_candidates',
            {
              p_title:      String(n.title ?? n.name ?? ''),
              p_start_date: startDate,
              p_venue_id:   (n.venue_id as string) ?? null,
              p_city:       (loc.city as string) ?? (n.city as string) ?? null,
              p_lat:        loc.lat ?? n.latitude ?? null,
              p_lng:        loc.lng ?? n.longitude ?? null,
              p_edition:    (n.edition as string) ?? null,
              p_limit:      10,
            },
          )
          if (rpcErr) {
            console.error(`dedup-event rpc ${item.id}:`, rpcErr.message)
          } else if (candidates && candidates.length > 0) {
            rulesFired = candidates as DedupCandidate[]
            const best = rulesFired[0]
            matchId    = best.event_id ?? null
            matchScore = Number(best.score)
            matchType  = best.match_type
          }
        }
      } else if (isVenue) {
        const loc = (n.location ?? {}) as Record<string, unknown>
        const c   = (n.contacts ?? {}) as Record<string, unknown>
        const isHotel = !!n.accommodation_type
        const rpcName = isHotel ? 'find_hotel_duplicate_candidates' : 'find_venue_duplicate_candidates'
        const rpcArgs: Record<string, unknown> = {
          p_name:           String(n.name ?? ''),
          p_phone_e164:     (c.phone_e164 as string) ?? null,
          p_email:          (c.email_lower as string) ?? null,
          p_website_domain: (c.website_domain as string) ?? null,
          p_lat:            loc.lat ?? null,
          p_lng:            loc.lng ?? null,
          p_city_id:        null,
          p_limit:          10,
        }
        if (isHotel) {
          rpcArgs.p_platform_ids = (n.platform_ids as Record<string, unknown>) ?? {}
          rpcArgs.p_booking_url  = (n.booking_url as string) ?? null
        }

        const { data: candidates, error: rpcErr } = await supabase.rpc(rpcName, rpcArgs)

        if (rpcErr) {
          console.error(`dedup rpc ${item.id}:`, rpcErr.message)
        } else if (candidates && candidates.length > 0) {
          rulesFired = candidates as DedupCandidate[]
          const best = rulesFired[0]
          matchId    = best.venue_id
          matchScore = Number(best.score)
          matchType  = best.match_type
        }
      } else if (isPersonality) {
        const { data: candidates, error: rpcErr } = await supabase.rpc(
          'find_personality_duplicate_candidates',
          {
            p_name:         String(n.name ?? ''),
            p_wikidata_qid: (n.wikidata_qid as string) ?? null,
            p_birth_date:   (n.birth_date as string) ?? null,
            p_external_ids: (n.external_ids as Record<string, unknown>) ?? {},
            p_profession:   (n.profession as string) ?? null,
            p_nationality:  (n.nationality as string) ?? null,
            p_limit:        10,
          },
        )
        if (rpcErr) {
          console.error(`dedup personality rpc ${item.id}:`, rpcErr.message)
        } else if (candidates && candidates.length > 0) {
          const cast = (candidates as Array<{personality_id: string, match_type: string, score: number}>)
            .map(c => ({ venue_id: c.personality_id, match_type: c.match_type, score: c.score, distance_m: null as number | null }))
          rulesFired = cast as unknown as DedupCandidate[]
          matchId    = cast[0].venue_id
          matchScore = Number(cast[0].score)
          matchType  = cast[0].match_type
        }
      } else if (table === 'countries' || item.entity_type === 'country') {
        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const code = (n.code ?? meta.code ?? meta.cca2 ?? meta.iso_a2) as string | null
        const { data: candidates, error: rpcErr } = await supabase.rpc(
          'find_country_duplicate_candidates',
          { p_name: String(n.name ?? ''), p_code: code ?? null, p_limit: 5 },
        )
        if (rpcErr) {
          console.error(`dedup country rpc ${item.id}:`, rpcErr.message)
        } else if (candidates && candidates.length > 0) {
          const cast = (candidates as Array<{country_id: string, match_type: string, score: number}>)
            .map(c => ({ venue_id: c.country_id, match_type: c.match_type, score: c.score, distance_m: null as number | null }))
          rulesFired = cast as unknown as DedupCandidate[]
          matchId    = cast[0].venue_id
          matchScore = Number(cast[0].score)
          matchType  = cast[0].match_type
        }
      } else if (table === 'cities' || item.entity_type === 'city') {
        const loc  = (n.location ?? {}) as Record<string, unknown>
        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const countryCode = (loc.country_code ?? meta.country_code ?? meta.countryCode ?? meta.cca2) as string | null
        const countryName = (loc.country ?? meta.country) as string | null

        let countryId: string | null = null
        if (countryCode) {
          const { data } = await supabase.from('countries')
            .select('id').eq('code', String(countryCode).toUpperCase())
            .is('duplicate_of_id', null).limit(1).maybeSingle()
          countryId = (data as { id: string } | null)?.id ?? null
        }
        if (!countryId && countryName) {
          const { data } = await supabase.from('countries')
            .select('id').ilike('name', String(countryName).trim())
            .is('duplicate_of_id', null).limit(1).maybeSingle()
          countryId = (data as { id: string } | null)?.id ?? null
        }

        const { data: candidates, error: rpcErr } = await supabase.rpc(
          'find_city_duplicate_candidates',
          {
            p_name:       String(n.name ?? ''),
            p_country_id: countryId,
            p_lat:        loc.lat ?? null,
            p_lng:        loc.lng ?? null,
            p_limit:      5,
          },
        )
        if (rpcErr) {
          console.error(`dedup city rpc ${item.id}:`, rpcErr.message)
        } else if (candidates && candidates.length > 0) {
          const cast = (candidates as Array<{city_id: string, match_type: string, score: number, distance_m: number | null}>)
            .map(c => ({ venue_id: c.city_id, match_type: c.match_type, score: c.score, distance_m: c.distance_m }))
          rulesFired = cast as unknown as DedupCandidate[]
          matchId    = cast[0].venue_id
          matchScore = Number(cast[0].score)
          matchType  = cast[0].match_type
        }
      } else if (table === 'marketplace_listings' || item.entity_type === 'marketplace' || item.entity_type === 'product') {
        // Marketplace dedup: source_entity_id > external_url > domain+title > brand+title > title trigram
        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const urls = (n.urls ?? []) as string[]
        const title = String(n.name ?? n.title ?? meta.product_name ?? meta.title ?? '').trim()
        const externalUrl = String(
          meta.merchant_deep_link ??
          meta.product_url ??
          meta.website ??
          urls[0] ??
          '',
        ).trim() || null
        let merchantDomain: string | null = null
        if (externalUrl) {
          try { merchantDomain = new URL(externalUrl).hostname.replace(/^www\./, '').toLowerCase() } catch { /* ignore */ }
        }
        const sourceSlug = String(item.entity_type === 'marketplace' ? (meta.source_slug ?? '') : '').trim() || null
        const sourceEid = String(meta.aw_product_id ?? meta.product_id ?? meta.id ?? meta.external_id ?? '').trim() || null
        const brand = String(n.brand ?? meta.brand ?? meta.brand_name ?? '').trim() || null

        const { data: candidates, error: rpcErr } = await supabase.rpc(
          'find_marketplace_duplicate_candidates',
          {
            p_title:            title,
            p_source_slug:      sourceSlug,
            p_source_entity_id: sourceEid,
            p_merchant_domain:  merchantDomain,
            p_external_url:     externalUrl,
            p_brand:            brand,
            p_limit:            5,
          },
        )
        if (rpcErr) {
          console.error(`dedup marketplace rpc ${item.id}:`, rpcErr.message)
        } else if (candidates && candidates.length > 0) {
          const cast = (candidates as Array<{listing_id: string, match_type: string, score: number}>)
            .map(c => ({ venue_id: c.listing_id, match_type: c.match_type, score: c.score, distance_m: null as number | null }))
          rulesFired = cast as unknown as DedupCandidate[]
          matchId    = cast[0].venue_id
          matchScore = Number(cast[0].score)
          matchType  = cast[0].match_type
        }
      } else if (table === 'news_articles' || item.entity_type === 'news_articles' || item.entity_type === 'news_article') {
        // News dedup: fingerprint > url. Tolerant of normalize/adapter shape (title|name, url|urls[0], dates.start|published_at).
        const meta = (n.metadata ?? {}) as Record<string, unknown>
        const dates = (n.dates ?? {}) as Record<string, unknown>
        const urls = (n.urls ?? []) as string[]
        const title = String(n.title ?? n.name ?? '').trim()
        const url = (n.url as string) ?? urls[0] ?? (meta.url as string) ?? null
        const sourceId = (n.source_id as string) ?? (meta.source_id as string) ?? null
        const publishedAt = (n.published_at as string)
          ?? (dates.start as string)
          ?? (meta.published_at as string)
          ?? new Date().toISOString()

        let fp: string | null = null
        if (sourceId && title) {
          const { data: fpData } = await supabase.rpc('news_compute_fingerprint', {
            p_title: title, p_published_at: publishedAt, p_source_id: sourceId, p_url: url,
          })
          fp = (fpData as string | null) ?? null
        }

        let strategy = 'fingerprint'
        if (fp) {
          const { data: existing } = await supabase
            .from('news_articles').select('id').eq('fingerprint', fp).limit(1).maybeSingle()
          if (existing) { matchId = existing.id; matchScore = 1.0; matchType = 'fingerprint' }
        }
        if (!matchId && url) {
          const { data: existing } = await supabase
            .from('news_articles').select('id').eq('url', url).limit(1).maybeSingle()
          if (existing) { matchId = existing.id; matchScore = 0.98; matchType = 'url'; strategy = 'url' }
        }
        if (!matchId && (n.content || title)) {
          // Fallback content_hash check using server-side digest via RPC isn't necessary;
          // do a cheap title+source+date_day fuzzy via fingerprint already.
          strategy = 'unique'
        }

        // Audit
        await supabase.from('news_dedup_audit').insert({
          staging_id: item.id,
          pipeline_run_id: pipelineRunId ?? null,
          source_id: sourceId,
          candidate_url: url,
          candidate_title: title.slice(0, 500),
          candidate_published_at: publishedAt,
          candidate_fingerprint: fp,
          match_strategy: strategy,
          match_score: matchScore,
          match_decision: matchId ? (matchScore >= autoMergeMin ? 'duplicate' : 'merge_candidate') : 'unique',
          matched_article_id: matchId,
          details: { match_type: matchType },
        })
      } else if (table && n.name) {
        const name = String(n.name).trim().toLowerCase()
        const { data: existing } = await supabase.from(table)
          .select('id, name').ilike('name', name).limit(1)
        if (existing && existing.length) {
          matchId = existing[0].id
          matchScore = 1.0
          matchType = 'name_exact_legacy'
        }
      }

      // Decide
      let dedupStatus: 'unique' | 'duplicate' | 'merge_candidate'
      let disposition: 'pending' | 'skipped'
      let reviewStatus: 'auto' | 'pending_review'

      if (!matchId) {
        dedupStatus = 'unique'
        disposition = 'pending'
        reviewStatus = 'auto'
        unique++
      } else if (matchScore >= autoMergeMin) {
        dedupStatus = 'duplicate'
        disposition = 'pending'  // commit will UPDATE the existing venue
        reviewStatus = 'auto'
        duplicates++
      } else if (matchScore >= reviewMin) {
        dedupStatus = 'merge_candidate'
        disposition = 'pending'
        reviewStatus = 'pending_review'
        flagged++
      } else {
        dedupStatus = 'unique'
        disposition = 'pending'
        reviewStatus = 'auto'
        unique++
      }

      if (dryRun) continue

      await supabase.from('ingestion_staging').update({
        dedup_status:      dedupStatus,
        dedup_match_id:    matchId,
        dedup_match_table: table ?? null,
        dedup_match_score: matchScore,
        dedup_details:     { match_type: matchType, rules: rulesFired },
        disposition,
        review_status:     reviewStatus,
        updated_at:        new Date().toISOString(),
      }).eq('id', item.id)

      if (matchId) {
        const entityType = isEvent ? 'event' : isVenue ? 'venue' : isPersonality ? 'personality' : (item.entity_type ?? 'unknown')
        await supabase.from('scraper_dedupe_decisions').insert({
          entity_type:  entityType,
          entity_a_id:  item.id,
          entity_b_id:  matchId,
          match_method: matchType,
          confidence:   matchScore,
          decision:     dedupStatus,
          rules_fired:  { candidates: rulesFired },
          action:       dedupStatus === 'duplicate' ? 'auto_merge' :
                        dedupStatus === 'merge_candidate' ? 'flag_review' : 'no_match',
          decided_by:   'pipeline-deduplicate',
        })

        if (dedupStatus === 'merge_candidate') {
          await supabase.from('review_queue').insert({
            entity_type: 'ingestion_staging',
            entity_id:   item.id,
            review_type: 'merge_candidate',
            status:      'pending',
            details:     {
              target_table: table,
              match_id: matchId,
              match_type: matchType,
              score: matchScore,
              rules: rulesFired,
            },
          })
        }
      }

      await supabase.from('ingestion_events').insert({
        staging_id: item.id,
        venue_id:   isVenue ? matchId : null,
        stage:      'deduplicate',
        new_status: dedupStatus,
        actor:      'pipeline-deduplicate',
        payload:    {
          target_table: table,
          match_id: matchId,
          match_score: matchScore,
          match_type: matchType,
          rules: rulesFired,
        },
      })
    }

    return jsonResponse({
      success: true,
      items: unique + flagged,
      items_total: items.length,
      items_processed: unique + duplicates + flagged,
      items_succeeded: unique,
      unique, duplicates, merge_candidates: flagged,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-deduplicate:', error)
    return errorResponse((error as Error).message, 500, req)
  }
})
