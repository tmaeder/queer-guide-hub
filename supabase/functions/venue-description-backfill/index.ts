// venue-description-backfill — fills missing venue descriptions on existing rows.
//
// The ingest enrichment (pipeline-enrich-venue) only fires on NEW staging rows; the
// ~17.9k live venues with no description were never touched. This is the backfill
// driver: it pulls description-less venues highest-value-first (via venues_due_for_description)
// and runs the existing enrichVenueWithAI() path, which routes to the cheap CF Workers AI
// backend. Descriptions auto-apply (factual, 2-3 sentences); suggested tags union in.
// LGBTQ+ relevance is deliberately NOT written here — the dedicated classify-relevance-backfill
// owns that signal (avoids fake-default pollution).
//
// Auth: X-Webhook-Secret (cron, reuses AMENITY_QUALITY_WEBHOOK_SECRET) or admin/service-role.
// Idempotent + no-op safe. Body: { batch_limit?, daily_cap?, dry_run?, venue_ids? }
//
// Batches stay small (default 40) — venues.description UPDATE fires trg_search_documents_venue,
// so a large write storms the disk-constrained search sync. Keep well under 300/run.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'

const STEP = 'venue-description-backfill'
const MIN_DESC_LEN = 80 // a usable description is at least a sentence or two

interface VenueRow {
  id: string
  name: string
  category: string | null
  description: string | null
  address: string | null
  city: string | null
  country: string | null
  tags: string[] | null
}

function uniqSorted(...arrs: (string[] | null | undefined)[]): string[] {
  const s = new Set<string>()
  for (const a of arrs) for (const x of a ?? []) if (x) s.add(String(x).toLowerCase())
  return [...s].sort()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('AMENITY_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = Math.min(120, body.batch_limit ?? 40)
  const dailyCap: number = body.daily_cap ?? 400
  const dryRun: boolean = body.dry_run ?? false
  const venueIds: string[] | undefined = body.venue_ids

  // Daily cap (skipped for explicit venue_ids).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!venueIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ processed: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = venueIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Work-list.
  let venues: VenueRow[]
  if (venueIds?.length) {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, category, description, address, city, country, tags')
      .in('id', venueIds)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  } else {
    const { data, error } = await supabase.rpc('venues_due_for_description', { p_limit: remaining })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    venues = (data ?? []) as VenueRow[]
  }
  if (!venues.length) return jsonResponse({ processed: 0, message: 'no venues due' }, 200, req)

  let filled = 0, skipped = 0, failed = 0
  const results: Array<Record<string, unknown>> = []

  for (const v of venues) {
    const started = Date.now()
    let status = 'skipped'
    try {
      let ai
      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.venue-description', () =>
          enrichVenueWithAI(supabase, {
            name: v.name,
            description: v.description ?? undefined,
            address: v.address ?? undefined,
            city: v.city ?? undefined,
            country: v.country ?? undefined,
            category: v.category ?? undefined,
            tags: v.tags ?? undefined,
          }))
      } catch (e) {
        if (e instanceof CircuitOpenError) {
          return jsonResponse({ processed: filled + skipped + failed, filled, skipped, failed, circuit_open: true, results }, 200, req)
        }
        throw e
      }

      const desc = (ai?.description ?? '').trim()
      const nextTags = uniqSorted(v.tags, ai?.suggested_tags)
      const tagsChanged = JSON.stringify(nextTags) !== JSON.stringify(uniqSorted(v.tags))

      if (desc.length >= MIN_DESC_LEN) {
        if (!dryRun) {
          await supabase.from('venues').update({
            description: desc,
            tags: nextTags,
            last_refreshed_at: new Date().toISOString(),
          }).eq('id', v.id)

          await supabase.from('venue_field_provenance').upsert({
            venue_id: v.id, field: 'description', source: 'llm', value: [desc.slice(0, 200)],
            confidence: 0.8, is_winning: true,
          }, { onConflict: 'venue_id,field,source' }).then(() => {}, () => {})

          await supabase.from('venue_quality_signals').insert({
            venue_id: v.id, signal_type: 'description_fill', value: 1,
            source: STEP, details: { chars: desc.length, tags_added: tagsChanged, model: 'llm' },
          }).then(() => {}, () => {})
        }
        status = 'done'
        filled++
        results.push({ id: v.id, name: v.name, chars: desc.length, tags: nextTags.length })
      } else {
        skipped++
        results.push({ id: v.id, name: v.name, skipped: 'no usable description from model' })
      }
    } catch (e) {
      status = 'failed'
      failed++
      results.push({ id: v.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    if (!dryRun) {
      await supabase.from('enrichment_log').insert({
        entity_type: 'venue', entity_id: v.id, step: STEP, status, duration_ms: Date.now() - started,
      }).then(() => {}, () => {})
    }
  }

  return jsonResponse({ processed: venues.length, filled, skipped, failed, dry_run: dryRun, results }, 200, req)
})
