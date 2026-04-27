import { getServiceClient, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { rpcWithBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'

// ============================================================
// Pipeline Deduplicate (venue / event / hotel / city / country / news)
// - Wraps every dedup RPC in a circuit breaker (rpcWithBreaker)
// - Records EVERY decision (including 'unique') to scraper_dedupe_decisions
//   via the record_dedup_decision RPC for full audit trail
// - Hard-fails review_queue inserts (no more swallowed errors)
// - Honors news_articles fingerprint (always non-null after migration
//   20260415170400_news_fingerprint_hardening.sql)
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
    const autoMergeMin  = Math.max(body.auto_merge_min ?? 0.90, 0.5)
    const reviewMin     = Math.min(body.review_min ?? 0.75, autoMergeMin)
    const batchSize     = body.batch_size || 50
    const dryRun        = body.dry_run || false
    const entityType    = body.entityType as string | undefined

    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table')
      .eq('ai_validation_status', 'approved')
      .eq('dedup_status', 'pending')
      .eq('disposition', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    if (entityType) query = query.eq('entity_type', entityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to dedup' }, 200, req)
    }

    let unique = 0, duplicates = 0, flagged = 0
    let circuitTripped = 0, hardFailures = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const table = item.target_table
      const isVenue = table === 'venues' || item.entity_type === 'venue'
      const isEvent = table === 'events' || item.entity_type === 'event'
      const entityType = isEvent ? 'event' : isVenue ? 'venue' : (item.entity_type ?? 'unknown')

      let matchId: string | null = null
      let matchScore = 0
      let matchType = ''
      let rulesFired: DedupCandidate[] = []
      let circuitOpenForThisItem = false

      try {
        if (isEvent) {
          const loc = (n.location ?? {}) as Record<string, unknown>
          const dates = (n.dates ?? {}) as Record<string, unknown>
          const startDate = (n.start_date as string) ?? (dates.start as string) ?? null
          if (startDate) {
            const r = await rpcWithBreaker<DedupCandidate[]>(
              supabase,
              'rpc.find_event_duplicate_candidates',
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
            if (r.circuitOpen) { circuitOpenForThisItem = true; circuitTripped++ }
            else if (r.error) console.error(`dedup-event ${item.id}:`, r.error.message)
            else if (r.data && r.data.length > 0) {
              rulesFired = r.data
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
          const breakerName = `rpc.${rpcName}`
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

          const r = await rpcWithBreaker<DedupCandidate[]>(supabase, breakerName, rpcName, rpcArgs)
          if (r.circuitOpen) { circuitOpenForThisItem = true; circuitTripped++ }
          else if (r.error) console.error(`dedup-venue ${item.id}:`, r.error.message)
          else if (r.data && r.data.length > 0) {
            rulesFired = r.data
            const best = rulesFired[0]
            matchId    = best.venue_id ?? null
            matchScore = Number(best.score)
            matchType  = best.match_type
          }
        } else if (table === 'countries' || item.entity_type === 'country') {
          const meta = (n.metadata ?? {}) as Record<string, unknown>
          const code = (n.code ?? meta.code ?? meta.cca2 ?? meta.iso_a2) as string | null
          const r = await rpcWithBreaker<Array<{country_id: string, match_type: string, score: number}>>(
            supabase,
            'rpc.find_country_duplicate_candidates',
            'find_country_duplicate_candidates',
            { p_name: String(n.name ?? ''), p_code: code ?? null, p_limit: 5 },
          )
          if (r.circuitOpen) { circuitOpenForThisItem = true; circuitTripped++ }
          else if (r.error) console.error(`dedup-country ${item.id}:`, r.error.message)
          else if (r.data && r.data.length > 0) {
            const cast = r.data.map(c => ({ venue_id: c.country_id, match_type: c.match_type, score: c.score, distance_m: null as number | null }))
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

          const r = await rpcWithBreaker<Array<{city_id: string, match_type: string, score: number, distance_m: number | null}>>(
            supabase,
            'rpc.find_city_duplicate_candidates',
            'find_city_duplicate_candidates',
            {
              p_name:       String(n.name ?? ''),
              p_country_id: countryId,
              p_lat:        loc.lat ?? null,
              p_lng:        loc.lng ?? null,
              p_limit:      5,
            },
          )
          if (r.circuitOpen) { circuitOpenForThisItem = true; circuitTripped++ }
          else if (r.error) console.error(`dedup-city ${item.id}:`, r.error.message)
          else if (r.data && r.data.length > 0) {
            const cast = r.data.map(c => ({ venue_id: c.city_id, match_type: c.match_type, score: c.score, distance_m: c.distance_m }))
            rulesFired = cast as unknown as DedupCandidate[]
            matchId    = cast[0].venue_id
            matchScore = Number(cast[0].score)
            matchType  = cast[0].match_type
          }
        } else if (table === 'news_articles' || item.entity_type === 'news_articles') {
          // News dedup: fingerprint > url. Fingerprint is now NEVER null after migration
          // 20260415170400_news_fingerprint_hardening.sql.
          const title = String(n.title ?? '').trim()
          const url = (n.url as string) ?? null
          const sourceId = (n.source_id as string) ?? null
          const publishedAt = (n.published_at as string) ?? new Date().toISOString()

          const fpRes = await supabase.rpc('news_compute_fingerprint', {
            p_title: title, p_published_at: publishedAt, p_source_id: sourceId, p_url: url,
          })
          const fp = (fpRes.data as string | null) ?? null

          let strategy: 'fingerprint' | 'url' | 'unique' = 'unique'
          if (fp) {
            const { data: existing } = await supabase
              .from('news_articles').select('id').eq('fingerprint', fp).limit(1).maybeSingle()
            if (existing) { matchId = existing.id; matchScore = 1.0; matchType = 'fingerprint'; strategy = 'fingerprint' }
          }
          if (!matchId && url) {
            const { data: existing } = await supabase
              .from('news_articles').select('id').eq('url', url).limit(1).maybeSingle()
            if (existing) { matchId = existing.id; matchScore = 0.98; matchType = 'url'; strategy = 'url' }
          }

          const { error: auditErr } = await supabase.from('news_dedup_audit').insert({
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
          if (auditErr) console.error(`news_dedup_audit ${item.id}:`, auditErr.message)
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
      } catch (e) {
        if (e instanceof CircuitOpenError) {
          circuitOpenForThisItem = true
          circuitTripped++
        } else {
          console.error(`dedup unexpected ${item.id}:`, (e as Error).message)
          hardFailures++
        }
      }

      // If breaker is open, leave item in 'pending' so a later run retries.
      if (circuitOpenForThisItem) {
        await supabase.from('ingestion_events').insert({
          staging_id: item.id, stage: 'deduplicate', new_status: 'pending',
          actor: 'pipeline-deduplicate',
          payload: { skipped: true, reason: 'circuit_open' },
        })
        continue
      }

      // Decide
      let dedupStatus: 'unique' | 'duplicate' | 'merge_candidate'
      let disposition: 'pending' | 'skipped'
      let reviewStatus: 'auto' | 'pending_review'

      if (!matchId) {
        dedupStatus = 'unique'; disposition = 'pending'; reviewStatus = 'auto'; unique++
      } else if (matchScore >= autoMergeMin) {
        dedupStatus = 'duplicate'; disposition = 'pending'; reviewStatus = 'auto'; duplicates++
      } else if (matchScore >= reviewMin) {
        dedupStatus = 'merge_candidate'; disposition = 'pending'; reviewStatus = 'pending_review'; flagged++
      } else {
        dedupStatus = 'unique'; disposition = 'pending'; reviewStatus = 'auto'; unique++
      }

      if (dryRun) continue

      const action = dedupStatus === 'duplicate' ? 'auto_merge'
                   : dedupStatus === 'merge_candidate' ? 'flag_review'
                   : 'no_match'

      // Record EVERY decision via RPC (writes to scraper_dedupe_decisions
      // with staging_id + pipeline_run_id linkage — full audit trail).
      const { error: decisionErr } = await supabase.rpc('record_dedup_decision', {
        p_entity_type: entityType,
        p_staging_id: item.id,
        p_pipeline_run_id: pipelineRunId ?? null,
        p_match_id: matchId,
        p_match_method: matchType || 'none',
        p_confidence: matchScore,
        p_decision: dedupStatus,
        p_action: action,
        p_rules: { candidates: rulesFired },
        p_decided_by: 'pipeline-deduplicate',
      })
      if (decisionErr) {
        console.error(`record_dedup_decision ${item.id}:`, decisionErr.message)
        hardFailures++
        continue
      }

      const { error: updErr } = await supabase.from('ingestion_staging').update({
        dedup_status:      dedupStatus,
        dedup_match_id:    matchId,
        dedup_match_table: table ?? null,
        dedup_match_score: matchScore,
        dedup_details:     { match_type: matchType, rules: rulesFired },
        disposition,
        review_status:     reviewStatus,
        updated_at:        new Date().toISOString(),
      }).eq('id', item.id)

      if (updErr) {
        console.error(`staging update ${item.id}:`, updErr.message)
        hardFailures++
        continue
      }

      // Hard-fail review_queue insert (was previously a swallowed catch
      // hiding silent backlog growth).
      if (dedupStatus === 'merge_candidate') {
        const { error: rqErr } = await supabase.from('review_queue').insert({
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
        if (rqErr) {
          // Critical: human review backlog must remain visible. Roll back
          // dedup status so the next run retries.
          console.error(`review_queue insert ${item.id}:`, rqErr.message)
          await supabase.from('ingestion_staging').update({
            dedup_status: 'pending',
            error_message: `review_queue insert failed: ${rqErr.message}`,
            updated_at: new Date().toISOString(),
          }).eq('id', item.id)
          hardFailures++
          flagged--
          continue
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
      items_failed: hardFailures,
      unique, duplicates, merge_candidates: flagged,
      circuit_tripped: circuitTripped,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-deduplicate:', error)
    await logPipelineError(supabase, 'pipeline-deduplicate', error, { severity: 'fatal' })
    return errorResponse((error as Error).message, 500, req)
  }
})
