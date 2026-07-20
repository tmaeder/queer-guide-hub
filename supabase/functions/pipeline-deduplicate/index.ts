import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { rpcWithBreaker, withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import {
  DEDUP_REGISTRY,
  decideCandidate,
  composeStagingEmbedText,
  type EntityType,
  type RawCandidate,
  type GuardContext,
} from '../_shared/dedup-engine.ts'

// ============================================================
// Pipeline Deduplicate — unified, config-driven (2026-06-23)
//
// Per-type matching now flows through ONE path:
//   1. deterministic blocker RPC (find_*_duplicate_candidates) — precision
//   2. generic semantic KNN blocker (find_semantic_duplicate_candidates) — recall
//   3. pure engine (_shared/dedup-engine.ts) fuses the signals + applies
//      geo/time/country conflict guards and decides duplicate / merge_candidate
//      / unique. Semantic can RAISE recall but NEVER auto-merges alone.
//
// Preserved from the previous implementation:
//   * every dedup RPC wrapped in a circuit breaker; circuit-open ⇒ leave the
//     item 'pending' for a later retry.
//   * EVERY decision (incl. 'unique') journaled to scraper_dedupe_decisions via
//     record_dedup_decision; news ALSO keeps its news_dedup_audit row.
//   * review_queue insert is hard-failed (rolls dedup_status back to pending).
//   * news fingerprint short-circuit (always non-null after 20260415170400).
// ============================================================

const CF_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || ''
const CF_API_TOKEN = Deno.env.get('CLOUDFLARE_API_TOKEN') || ''
const EMBED_MODEL = '@cf/baai/bge-m3' // 1024-d, must match workers/ingest stored vectors

interface SemRow { entity_id: string; score: number; distance_m: number | null; country: string | null; title?: string | null }

/** Resolve the registry entity type from a staging row. */
function resolveEntityType(item: { target_table?: string | null; entity_type?: string | null }): EntityType | 'unknown' {
  const table = item.target_table
  const et = item.entity_type
  if (table === 'events' || et === 'event') return 'event'
  if (table === 'venues' || et === 'venue') return 'venue'
  if (table === 'cities' || et === 'city') return 'city'
  if (table === 'countries' || et === 'country') return 'country'
  if (table === 'news_articles' || et === 'news_articles' || et === 'news') return 'news'
  if (table === 'marketplace_listings' || et === 'marketplace') return 'marketplace'
  if (table === 'personalities' || et === 'personality') return 'personality'
  if (table === 'organizations' || et === 'organization') return 'organization'
  return 'unknown'
}

/** Build the deterministic blocker RPC args for a type from normalized_data. */
function buildDetArgs(type: EntityType, n: Record<string, unknown>, isHotel: boolean): Record<string, unknown> | null {
  const loc = (n.location ?? {}) as Record<string, unknown>
  const c = (n.contacts ?? {}) as Record<string, unknown>
  const meta = (n.metadata ?? {}) as Record<string, unknown>
  switch (type) {
    case 'event': {
      const dates = (n.dates ?? {}) as Record<string, unknown>
      const startDate = (n.start_date as string) ?? (dates.start as string) ?? null
      if (!startDate) return null
      return {
        p_title: String(n.title ?? n.name ?? ''),
        p_start_date: startDate,
        p_venue_id: (n.venue_id as string) ?? null,
        p_city: (loc.city as string) ?? (n.city as string) ?? null,
        p_lat: loc.lat ?? n.latitude ?? null,
        p_lng: loc.lng ?? n.longitude ?? null,
        p_edition: (n.edition as string) ?? null,
        p_limit: 10,
      }
    }
    case 'venue':
    case 'hotel': {
      const args: Record<string, unknown> = {
        p_name: String(n.name ?? ''),
        p_phone_e164: (c.phone_e164 as string) ?? null,
        p_email: (c.email_lower as string) ?? null,
        p_website_domain: (c.website_domain as string) ?? null,
        p_lat: loc.lat ?? null,
        p_lng: loc.lng ?? null,
        p_city_id: null,
        p_limit: 10,
      }
      if (isHotel) {
        args.p_platform_ids = (n.platform_ids as Record<string, unknown>) ?? {}
        args.p_booking_url = (n.booking_url as string) ?? null
      }
      return args
    }
    case 'country': {
      const code = (n.code ?? meta.code ?? meta.cca2 ?? meta.iso_a2) as string | null
      return { p_name: String(n.name ?? ''), p_code: code ?? null, p_limit: 5 }
    }
    case 'marketplace':
      return {
        p_title: String(n.title ?? n.name ?? ''),
        p_source_slug: (n.source_slug as string) ?? (n.source_type as string) ?? null,
        p_source_entity_id: (n.source_entity_id as string) ?? null,
        p_merchant_domain: (n.merchant_domain as string) ?? null,
        p_external_url: (n.external_url as string) ?? (n.url as string) ?? null,
        p_brand: (n.brand as string) ?? null,
        p_limit: 10,
      }
    case 'organization':
      return {
        p_name: String(n.name ?? n.title ?? ''),
        p_website_domain: (c.website_domain as string) ?? (n.website_domain as string) ?? null,
        p_limit: 10,
      }
    default:
      return null
  }
}

/** City needs its country_id resolved before calling the deterministic RPC. */
async function buildCityArgs(
  supabase: ReturnType<typeof getServiceClient>,
  n: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const loc = (n.location ?? {}) as Record<string, unknown>
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
  return {
    p_name: String(n.name ?? ''),
    p_country_id: countryId,
    p_lat: loc.lat ?? null,
    p_lng: loc.lng ?? null,
    p_limit: 5,
  }
}

/** Embed the staging item with bge-m3 (same space as stored vectors). Circuit-broken. */
async function embedStagingItem(
  supabase: ReturnType<typeof getServiceClient>,
  n: Record<string, unknown>,
): Promise<number[] | null> {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return null
  const text = composeStagingEmbedText(n)
  if (!text) return null
  try {
    return await withCircuitBreaker(supabase, 'cf.embed.dedup', async () => {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [text] }),
        },
      )
      if (!res.ok) throw new Error(`CF embed ${res.status}: ${(await res.text()).slice(0, 200)}`)
      const j = await res.json()
      const vec = j?.result?.data?.[0]
      if (!Array.isArray(vec)) throw new Error('CF embed: no vector in response')
      return vec as number[]
    })
  } catch (e) {
    if (!(e instanceof CircuitOpenError)) console.error('dedup embed:', (e as Error).message)
    return null
  }
}

Deno.serve(withErrorReporting('pipeline-deduplicate', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const _auth = await requireInternalOrAdmin(req, getServiceClient()); if (_auth instanceof Response) return _auth
  const supabase = getServiceClient()

  try {
    const body = await req.json().catch(() => ({}))
    const pipelineRunId = body.pipeline_run_id as string
    const batchSize = body.batch_size || 50
    const dryRun = body.dry_run || false
    const filterEntityType = body.entityType as string | undefined
    // Per-run cap on embeddings (bge-m3 is cheap; circuit breaker bounds outages).
    const embedCap = Math.max(0, body.embed_cap ?? batchSize)

    let query = supabase
      .from('ingestion_staging')
      .select('id, normalized_data, entity_type, target_table, dedup_details')
      .eq('ai_validation_status', 'approved')
      .eq('dedup_status', 'pending')
      .eq('disposition', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize)

    if (pipelineRunId) query = query.eq('pipeline_run_id', pipelineRunId)
    if (filterEntityType) query = query.eq('entity_type', filterEntityType)

    const { data: items, error } = await query
    if (error) return errorResponse(`load: ${error.message}`, 500, req)
    if (!items || items.length === 0) {
      return jsonResponse({ success: true, items: 0, message: 'nothing to dedup' }, 200, req)
    }

    let unique = 0, duplicates = 0, flagged = 0
    let circuitTripped = 0, hardFailures = 0, embedded = 0

    for (const item of items) {
      const n = (item.normalized_data ?? {}) as Record<string, unknown>
      const table = item.target_table
      const baseType = resolveEntityType(item)

      let circuitOpenForThisItem = false
      const raws: RawCandidate[] = []
      let semanticCosine = 0

      // ---- Legacy fallback: unrecognized table with a name → exact name match.
      if (baseType === 'unknown') {
        if (table && n.name) {
          const name = String(n.name).trim().toLowerCase()
          const { data: existing } = await supabase.from(table)
            .select('id, name').ilike('name', name).limit(1)
          if (existing && existing.length) {
            raws.push({ entity_id: existing[0].id, match_type: 'name_exact_legacy', score: 1.0 })
          }
        }
        await persistVerdict(supabase, {
          item, table, entityType: (item.entity_type ?? 'unknown'),
          verdict: decideCandidate(
            { entityType: 'venue', candidateRpc: null, idField: 'id',
              semantic: { enabled: false, minCosine: 1, confirmWeight: 0, standaloneReviewCosine: 1 },
              thresholds: { autoMerge: 0.90, review: 0.75 }, guards: [] },
            raws, {},
          ),
          pipelineRunId, dryRun, semanticCosine: 0,
          counters: { onUnique: () => unique++, onDup: () => duplicates++, onFlag: () => flagged++, onHardFail: () => hardFailures++ },
        })
        continue
      }

      const isHotel = baseType === 'venue' && !!n.accommodation_type
      const effType: EntityType = isHotel ? 'hotel' : baseType
      const cfg = DEDUP_REGISTRY[effType]
      // search_documents stores hotels under 'venue'.
      const semType = effType === 'hotel' ? 'venue' : effType
      const loc = (n.location ?? {}) as Record<string, unknown>
      const lat = (loc.lat ?? n.latitude ?? null) as number | null
      const lng = (loc.lng ?? n.longitude ?? null) as number | null
      const guardCtx: GuardContext = {
        itemCountry: ((loc.country ?? n.country ?? (n.metadata as Record<string, unknown> | undefined)?.country) as string | null) ?? null,
      }

      try {
        // ---- News: fingerprint > url short-circuit (kept ahead of the generic path).
        if (baseType === 'news') {
          const title = String(n.title ?? '').trim()
          const url = (n.url as string) ?? null
          const sourceId = (n.source_id as string) ?? null
          const publishedAt = (n.published_at as string) ?? new Date().toISOString()

          const fpRes = await supabase.rpc('news_compute_fingerprint', {
            p_title: title, p_published_at: publishedAt, p_source_id: sourceId, p_url: url,
          })
          const fp = (fpRes.data as string | null) ?? null

          let nsMatchId: string | null = null
          let nsStrategy: 'fingerprint' | 'url' | 'unique' = 'unique'
          let nsScore = 0
          if (fp) {
            const { data: ex } = await supabase.from('news_articles').select('id').eq('fingerprint', fp).limit(1).maybeSingle()
            if (ex) { nsMatchId = ex.id; nsScore = 1.0; nsStrategy = 'fingerprint' }
          }
          if (!nsMatchId && url) {
            const { data: ex } = await supabase.from('news_articles').select('id').eq('url', url).limit(1).maybeSingle()
            if (ex) { nsMatchId = ex.id; nsScore = 0.98; nsStrategy = 'url' }
          }
          if (nsMatchId) raws.push({ entity_id: nsMatchId, match_type: nsStrategy, score: nsScore })

          const { error: auditErr } = await supabase.from('news_dedup_audit').insert({
            staging_id: item.id, pipeline_run_id: pipelineRunId ?? null, source_id: sourceId,
            candidate_url: url, candidate_title: title.slice(0, 500), candidate_published_at: publishedAt,
            candidate_fingerprint: fp, match_strategy: nsStrategy, match_score: nsScore,
            match_decision: nsMatchId ? (nsScore >= cfg.thresholds.autoMerge ? 'duplicate' : 'merge_candidate') : 'unique',
            matched_article_id: nsMatchId, details: { match_type: nsStrategy },
          })
          if (auditErr) console.error(`news_dedup_audit ${item.id}:`, auditErr.message)
        }

        // ---- Deterministic blocker RPC.
        if (cfg.candidateRpc) {
          const args = baseType === 'city' ? await buildCityArgs(supabase, n) : buildDetArgs(effType, n, isHotel)
          if (args) {
            const r = await rpcWithBreaker<Array<Record<string, unknown>>>(
              supabase, `rpc.${cfg.candidateRpc}`, cfg.candidateRpc, args,
            )
            if (r.circuitOpen) { circuitOpenForThisItem = true; circuitTripped++ }
            else if (r.error) console.error(`dedup-${effType} ${item.id}:`, r.error.message)
            else if (r.data) {
              for (const c of r.data) {
                const id = (c[cfg.idField] ?? c.venue_id ?? c.event_id ?? c.id) as string | undefined
                if (!id) continue
                raws.push({
                  entity_id: id,
                  match_type: String(c.match_type ?? 'unknown'),
                  score: Number(c.score ?? 0),
                  distance_m: (c.distance_m as number | null) ?? null,
                  time_diff_hours: (c.time_diff_hours as number | null) ?? null,
                })
              }
            }
          }
        }

        // ---- Semantic blocker (recall). Skipped on circuit-open / dry-run / cap.
        if (!circuitOpenForThisItem && cfg.semantic.enabled && !dryRun && embedded < embedCap) {
          const cached = ((item.dedup_details as Record<string, unknown> | null)?.embedding as number[] | undefined)
          const vec = Array.isArray(cached) && cached.length > 0 ? cached : await embedStagingItem(supabase, n)
          if (vec) {
            if (!Array.isArray(cached)) embedded++
            const r = await rpcWithBreaker<SemRow[]>(
              supabase, 'rpc.find_semantic_duplicate_candidates', 'find_semantic_duplicate_candidates',
              {
                p_entity_type: semType,
                p_query_vec: `[${vec.join(',')}]`,
                p_min_cosine: cfg.semantic.minCosine,
                p_limit: 10,
                p_lat: lat, p_lng: lng, p_exclude_id: null,
              },
            )
            if (r.circuitOpen) circuitTripped++
            else if (r.error) console.error(`dedup-semantic ${item.id}:`, r.error.message)
            else if (r.data) {
              for (const c of r.data) {
                semanticCosine = Math.max(semanticCosine, Number(c.score ?? 0))
                raws.push({
                  entity_id: c.entity_id, match_type: 'semantic', score: Number(c.score ?? 0),
                  distance_m: (c.distance_m as number | null) ?? null, country: c.country ?? null,
                })
              }
            }
            // Cache the vector so a retry (e.g. after circuit-open) doesn't re-embed.
            if (!Array.isArray(cached) && !dryRun) {
              await supabase.from('ingestion_staging').update({
                dedup_details: { ...((item.dedup_details as Record<string, unknown> | null) ?? {}), embedding: vec },
              }).eq('id', item.id)
            }
          }
        }
      } catch (e) {
        if (e instanceof CircuitOpenError) { circuitOpenForThisItem = true; circuitTripped++ }
        else { console.error(`dedup unexpected ${item.id}:`, (e as Error).message); hardFailures++ }
      }

      // Circuit open ⇒ leave pending for a later retry.
      if (circuitOpenForThisItem) {
        await supabase.from('ingestion_events').insert({
          staging_id: item.id, stage: 'deduplicate', new_status: 'pending',
          actor: 'pipeline-deduplicate', payload: { skipped: true, reason: 'circuit_open' },
        })
        continue
      }

      const verdict = decideCandidate(cfg, raws, guardCtx)

      await persistVerdict(supabase, {
        item, table, entityType: effType, verdict, pipelineRunId, dryRun, semanticCosine,
        isVenue: effType === 'venue' || effType === 'hotel',
        counters: { onUnique: () => unique++, onDup: () => duplicates++, onFlag: () => flagged++, onHardFail: () => hardFailures++ },
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
      embedded,
      dry_run: dryRun,
    }, 200, req)
  } catch (error) {
    console.error('pipeline-deduplicate:', error)
    await logPipelineError(supabase, 'pipeline-deduplicate', error, { severity: 'fatal' })
    return errorResponse((error as Error).message, 500, req)
  }
}))

// ── Persistence (unchanged semantics; shared by the generic + legacy paths) ──

interface PersistArgs {
  item: { id: string; dedup_details?: unknown }
  table: string | null | undefined
  entityType: string
  verdict: ReturnType<typeof decideCandidate>
  pipelineRunId: string
  dryRun: boolean
  semanticCosine: number
  isVenue?: boolean
  counters: { onUnique: () => void; onDup: () => void; onFlag: () => void; onHardFail: () => void }
}

async function persistVerdict(supabase: ReturnType<typeof getServiceClient>, a: PersistArgs): Promise<void> {
  const { item, table, entityType, verdict, pipelineRunId, dryRun, semanticCosine, counters } = a
  if (verdict.decision === 'duplicate') counters.onDup()
  else if (verdict.decision === 'merge_candidate') counters.onFlag()
  else counters.onUnique()

  if (dryRun) return

  const matchId = verdict.matchId
  const reviewStatus = verdict.decision === 'merge_candidate' ? 'pending_review' : 'auto'

  const { error: decisionErr } = await supabase.rpc('record_dedup_decision', {
    p_entity_type: entityType,
    p_staging_id: item.id,
    p_pipeline_run_id: pipelineRunId ?? null,
    p_match_id: matchId,
    p_match_method: verdict.matchType || 'none',
    p_confidence: verdict.score,
    p_decision: verdict.decision,
    p_action: verdict.action,
    p_rules: { signals: verdict.signals, guards_fired: verdict.guardsFired, semantic_cosine: semanticCosine },
    p_decided_by: 'pipeline-deduplicate',
  })
  if (decisionErr) { console.error(`record_dedup_decision ${item.id}:`, decisionErr.message); counters.onHardFail(); return }

  const existingDetails = (item.dedup_details as Record<string, unknown> | null) ?? {}
  const { error: updErr } = await supabase.from('ingestion_staging').update({
    dedup_status: verdict.decision,
    dedup_match_id: matchId,
    dedup_match_table: table ?? null,
    dedup_match_score: verdict.score,
    dedup_details: {
      ...existingDetails,
      match_type: verdict.matchType,
      fused_score: verdict.score,
      semantic_cosine: semanticCosine,
      signals: verdict.signals,
      guards_fired: verdict.guardsFired,
    },
    disposition: 'pending',
    review_status: reviewStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', item.id)
  if (updErr) { console.error(`staging update ${item.id}:`, updErr.message); counters.onHardFail(); return }

  if (verdict.decision === 'merge_candidate') {
    const { error: rqErr } = await supabase.from('review_queue').insert({
      entity_type: 'ingestion_staging', entity_id: item.id, review_type: 'merge_candidate', status: 'pending',
      details: { target_table: table, match_id: matchId, match_type: verdict.matchType, score: verdict.score, signals: verdict.signals, guards_fired: verdict.guardsFired },
    })
    if (rqErr) {
      // Human review backlog must stay visible — roll back so the next run retries.
      console.error(`review_queue insert ${item.id}:`, rqErr.message)
      await supabase.from('ingestion_staging').update({
        dedup_status: 'pending', error_message: `review_queue insert failed: ${rqErr.message}`, updated_at: new Date().toISOString(),
      }).eq('id', item.id)
      counters.onHardFail()
      return
    }
  }

  await supabase.from('ingestion_events').insert({
    staging_id: item.id,
    venue_id: a.isVenue ? matchId : null,
    stage: 'deduplicate',
    new_status: verdict.decision,
    actor: 'pipeline-deduplicate',
    payload: { target_table: table, match_id: matchId, match_score: verdict.score, match_type: verdict.matchType, signals: verdict.signals, guards_fired: verdict.guardsFired },
  })
}
