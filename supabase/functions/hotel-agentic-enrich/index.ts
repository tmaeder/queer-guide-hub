// hotel-agentic-enrich — the moat for accommodation. For un-enriched hotels,
// fetch the property's own page (or fall back to its existing listing text when
// the page can't be fetched, e.g. bot-blocked misterb&b), extract grounded
// LGBTQ+ travel fields (editorial description, amenities, queer safety notes,
// star/price when stated), and apply hybrid-by-confidence: high confidence fills
// empty / templated fields; low confidence stores the extraction for admin review
// without overwriting. LLM-gated: circuit-broken + per-day cap.
//
// Auth: X-Webhook-Secret (cron, reuses EVENT_QUALITY_WEBHOOK_SECRET) or admin/service-role.
// Body: { batch_limit?, dry_run?, hotel_ids?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { hasValidWebhookSecret } from '../_shared/webhook-auth.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { fetchPageText } from '../_shared/enrich-harness.ts'
import { researchEnrichHotelFromPage, type HotelMoatEnrichment } from '../_shared/ai-enrichment.ts'

const DEFAULT_BATCH_LIMIT = 5
const DEFAULT_DAILY_CAP = 50
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 500_000
const AUTO_APPLY_CONFIDENCE = 0.8
const STEP = 'agentic-enrich'

const fetchHotelPage = (url: string) =>
  fetchPageText(url, {
    userAgent: 'Mozilla/5.0 (compatible; QueerGuide-HotelEnrich/1.0)',
    maxBytes: MAX_BODY_BYTES,
    timeoutMs: GET_TIMEOUT,
  })

function arr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const out = v.filter(x => typeof x === 'string' && x.trim()).map(x => (x as string).trim().toLowerCase())
  return out.length ? out : null
}

// A description is "templated" (safe to replace) if it's a scraper boilerplate string.
function isTemplated(desc: string | null | undefined): boolean {
  if (!desc) return true
  const d = desc.trim()
  if (d.length < 100) return true
  return /^(Private room|Entire|Shared room|Room) in /i.test(d)
    || /Listed on misterb&b/i.test(d)
    || /Guest rating:\s*[\d.]+\/5/i.test(d)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  if (!hasValidWebhookSecret(req, 'EVENT_QUALITY_WEBHOOK_SECRET')) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const hotelIds: string[] | undefined = body.hotel_ids

  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('entity_type', 'hotel').eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!hotelIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ enriched: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = hotelIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  let query = supabase
    .from('hotels')
    .select('id, name, description, hotel_type, city, country, country_id, website, booking_url, amenities, queer_safety_notes, star_rating, price_range, lgbtq_friendly, enrichment_status')
  if (hotelIds?.length) {
    query = query.in('id', hotelIds)
  } else {
    query = query
      .is('enrichment_status', null)
      // Reachable if we can ground on a fetchable page OR the existing listing text.
      .or('website.not.is.null,booking_url.not.is.null,description.not.is.null')
      .order('created_at', { ascending: true })
      .limit(remaining)
  }
  const { data: hotels, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!hotels?.length) return jsonResponse({ enriched: 0, message: 'no hotels to enrich' }, 200, req)

  let enriched = 0, flagged = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const h of hotels) {
    const started = Date.now()
    let status = 'skipped'
    try {
      // Prefer the property's own page; fall back to its existing listing text
      // (bot-blocked sources like misterb&b still get a grounded rewrite).
      const ownSitePage = h.website ? await fetchHotelPage(h.website) : null
      const page = ownSitePage
        || (h.booking_url ? await fetchHotelPage(h.booking_url) : null)
      const sourceText = page || h.description || ''
      if (sourceText.trim().length < 60) { skipped++; results.push({ id: h.id, status: 'no_source' }); await logStep(supabase, h.id, status, started, dryRun); continue }

      let safetyContext: string | undefined
      if (h.country_id) {
        const { data: c } = await supabase.from('countries').select('name, equality_score, lgbti_criminalization').eq('id', h.country_id).maybeSingle()
        if (c) {
          const crim = (c.lgbti_criminalization ?? {}) as Record<string, unknown>
          const legalStatus = crim.legal === false
            ? `criminalized${typeof crim.penalty === 'string' && crim.penalty ? ` (${crim.penalty})` : ''}`
            : crim.legal === true ? 'legal' : 'n/a'
          safetyContext = `${c.name}: equality_score=${c.equality_score ?? 'n/a'}, legal_status=${legalStatus}`
        }
      }

      let ai: HotelMoatEnrichment | null = null
      try {
        ai = await withCircuitBreaker(supabase, 'llm.openai.agentic-enrich', () =>
          researchEnrichHotelFromPage(supabase, {
            name: h.name, city: h.city, country: h.country, hotel_type: h.hotel_type,
            existingDescription: h.description, sourceText, safetyContext,
          }))
      } catch (e) {
        if (e instanceof CircuitOpenError) {
          return jsonResponse({ enriched, flagged, skipped, circuit_open: true, results }, 200, req)
        }
        throw e
      }
      if (!ai) { skipped++; results.push({ id: h.id, status: 'no_ai' }); await logStep(supabase, h.id, status, started, dryRun); continue }

      const confidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5
      const highConf = confidence >= AUTO_APPLY_CONFIDENCE
      const grounded = page ? 'page' : 'existing_text'

      const update: Record<string, unknown> = {}
      if (highConf) {
        // description: replace only templated/boilerplate strings, never curated prose.
        if (ai.description && ai.description.length >= 40 && isTemplated(h.description)) update.description = ai.description
        // amenities: union with existing (additive, deduped) — never drop curated flags.
        const aiAmen = arr(ai.amenities)
        if (aiAmen) {
          const existing = (h.amenities ?? []).map((x: string) => x.toLowerCase())
          const merged = Array.from(new Set([...existing, ...aiAmen]))
          if (merged.length > existing.length) update.amenities = merged
        }
        if (ai.queer_safety_notes && (!h.queer_safety_notes || h.queer_safety_notes.trim().length === 0)) update.queer_safety_notes = ai.queer_safety_notes
        // star_rating: only when grounded in the hotel's OWN website text. From the
        // listing-text fallback or a third-party booking page the model can echo an
        // unverified/invented star class — never store that.
        if (typeof ai.star_rating === 'number' && ai.star_rating >= 1 && ai.star_rating <= 5 && h.star_rating == null && ownSitePage) update.star_rating = ai.star_rating
        if (typeof ai.price_range === 'number' && ai.price_range >= 1 && ai.price_range <= 4 && h.price_range == null) update.price_range = ai.price_range
        if (typeof ai.lgbtq_relevance_score === 'number' && ai.lgbtq_relevance_score >= 0.7 && h.lgbtq_friendly !== true) update.lgbtq_friendly = true
      }
      update.enrichment_status = { ...(h.enrichment_status ?? {}), agentic: { at: new Date().toISOString(), confidence, grounded, ...ai } }
      update.last_verified_at = new Date().toISOString()

      if (!dryRun) {
        await supabase.from('hotels').update(update).eq('id', h.id)
      }
      status = 'done'
      if (highConf && Object.keys(update).length > 2) enriched++; else flagged++
      results.push({ id: h.id, status: highConf ? 'applied' : 'flagged', confidence, grounded, fields: Object.keys(update).filter(k => k !== 'enrichment_status' && k !== 'last_verified_at') })
    } catch (e) {
      status = 'failed'
      results.push({ id: h.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, h.id, status, started, dryRun)
  }

  return jsonResponse({ enriched, flagged, skipped, dry_run: dryRun, results }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, hotelId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'hotel', entity_id: hotelId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
