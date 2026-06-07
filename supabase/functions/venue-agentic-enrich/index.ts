// venue-agentic-enrich — fill missing venue content from FREE sources, cheapest-first.
//
// Per venue (selected by venues_due_for_refresh, prioritised + carrying routing flags):
//   • If it has a website: fetch the page ONCE and harvest
//       - structured facts (LocalBusiness JSON-LD + OpenGraph): hours, phone, email,
//         image, address — these are facts from the venue's OWN page → applied directly;
//       - grounded LLM extraction (researchEnrichVenueFromPage): description, category,
//         tags, target_groups, accessibility, relevance — applied only at high confidence.
//   • If it has no website: a conservative classification-only LLM pass (enrichVenueWithAI)
//     fills category/tags/relevance. We deliberately DO NOT generate a description without a
//     grounding page — inventing venue facts is a trust/safety risk on this platform.
//
// Writes are FILL-EMPTY ONLY (never overwrite curated data) + lossless array union, applied
// straight to `venues` with a venue_field_provenance + venue_consensus_audit trail. Single
// source vs the existing value needs no consensus conflict-resolution, so this skips the
// staging→consensus→commit path (that path, and its commit-RPC fix, still serve the daily DAG).
//
// LLM-gated: circuit breaker llm.openai.agentic-enrich + per-day cap. Auth: X-Webhook-Secret
// (cron) or admin/service-role.
// Body: { batch_limit?, dry_run?, venue_ids?, daily_cap? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { withCircuitBreaker, CircuitOpenError } from '../_shared/circuit-breaker.ts'
import { researchEnrichVenueFromPage, enrichVenueWithAI, type VenueMoatEnrichment } from '../_shared/ai-enrichment.ts'
import { probeLink, isDeadLink } from '../_shared/link-health.ts'

const DEFAULT_BATCH_LIMIT = 5
const DEFAULT_DAILY_CAP = 200
const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 600_000
const AUTO_APPLY_CONFIDENCE = 0.7
const STEP = 'venue-agentic-enrich'
const UA = 'Mozilla/5.0 (compatible; QueerGuide-VenueEnrich/1.0)'

const ISO_DAY: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
}

interface RefreshRow {
  id: string; name: string; slug: string; city: string | null; country: string | null
  category: string | null; description: string | null; website: string | null
  has_website: boolean; needs_description: boolean; needs_category: boolean
  needs_tags: boolean; needs_hours: boolean; needs_contact: boolean; needs_images: boolean
}

interface VenueStructured {
  description?: string; image?: string; phone?: string; email?: string
  address?: string; hours?: Record<string, unknown>
}

function normalizeUrl(url: string): string {
  const t = (url ?? '').trim()
  return t && !/^https?:\/\//i.test(t) ? `https://${t}` : t
}

async function fetchHtml(rawUrl: string): Promise<string | null> {
  const url = normalizeUrl(rawUrl)
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
    })
    if (!resp.ok || !resp.body) return null
    const reader = resp.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); total += value.length
    }
    reader.cancel().catch(() => {})
    const len = chunks.reduce((n, c) => n + c.length, 0)
    const buf = new Uint8Array(len); let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.length }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function metaContent(html: string, prop: string): string | undefined {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return undefined
  return tag.match(/content=["']([^"']+)["']/i)?.[1]?.trim() || undefined
}

function hhmm(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

function dayToIso(d: unknown): number | null {
  if (typeof d !== 'string') return null
  const name = d.split('/').pop()?.toLowerCase().trim() ?? ''
  return ISO_DAY[name] ?? null
}

// Parse LocalBusiness/Place JSON-LD + OpenGraph from raw HTML. extractArticle only handles
// Article-type JSON-LD, so venue structured data needs this dedicated parser.
function extractVenueStructured(html: string): VenueStructured {
  const out: VenueStructured = {}
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const nodes: Record<string, unknown>[] = []
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1].trim())
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed]
      for (const n of list) if (n && typeof n === 'object') nodes.push(n as Record<string, unknown>)
    } catch { /* ignore malformed JSON-LD */ }
  }
  const typeMatch = (t: unknown): boolean => {
    const s = Array.isArray(t) ? t.join(' ') : String(t ?? '')
    return /LocalBusiness|Restaurant|BarOrPub|NightClub|Hotel|LodgingBusiness|Store|CafeOrCoffeeShop|Place|Organization|EntertainmentBusiness|HealthAndBeautyBusiness/i.test(s)
  }
  const biz = nodes.find(n => typeMatch(n['@type']) && (n.telephone || n.openingHoursSpecification || n.openingHours || n.address || n.image))
    ?? nodes.find(n => typeMatch(n['@type']))
  if (biz) {
    if (typeof biz.telephone === 'string') out.phone = biz.telephone.trim()
    if (typeof biz.email === 'string') out.email = biz.email.replace(/^mailto:/i, '').trim()
    if (typeof biz.description === 'string' && biz.description.trim().length > 30) out.description = biz.description.trim()
    const img = Array.isArray(biz.image) ? biz.image[0] : biz.image
    if (typeof img === 'string') out.image = img.trim()
    else if (img && typeof img === 'object' && typeof (img as Record<string, unknown>).url === 'string') out.image = String((img as Record<string, unknown>).url).trim()
    const addr = biz.address
    if (typeof addr === 'string') out.address = addr.trim()
    else if (addr && typeof addr === 'object') {
      const a = addr as Record<string, unknown>
      out.address = [a.streetAddress, a.addressLocality, a.postalCode].filter(x => typeof x === 'string' && x).join(', ') || undefined
    }
    // Hours → { regular: [{day,open,close}] } (the shape VenueDetail renders).
    const spec = biz.openingHoursSpecification
    const regular: { day: number; open: string; close: string }[] = []
    if (Array.isArray(spec)) {
      for (const s of spec) {
        if (!s || typeof s !== 'object') continue
        const o = s as Record<string, unknown>
        const open = hhmm(o.opens), close = hhmm(o.closes)
        if (!open || !close) continue
        const days = Array.isArray(o.dayOfWeek) ? o.dayOfWeek : [o.dayOfWeek]
        for (const d of days) { const iso = dayToIso(d); if (iso) regular.push({ day: iso, open, close }) }
      }
    }
    if (regular.length) out.hours = { regular, source: 'website' }
    else if (Array.isArray(biz.openingHours) && biz.openingHours.length) {
      out.hours = { display: (biz.openingHours as unknown[]).filter(x => typeof x === 'string').join('; '), source: 'website' }
    } else if (typeof biz.openingHours === 'string') {
      out.hours = { display: biz.openingHours, source: 'website' }
    }
  }
  // OpenGraph fallbacks.
  if (!out.image) { const og = metaContent(html, 'og:image'); if (og) out.image = og }
  if (!out.description) { const od = metaContent(html, 'og:description'); if (od && od.length > 40) out.description = od }
  // Contact regex fallback.
  if (!out.email) { const m = html.match(/mailto:([^"'?\s>]+@[^"'?\s>]+)/i); if (m) out.email = m[1].trim() }
  if (!out.phone) { const m = html.match(/tel:([+\d][\d\s().-]{6,})/i); if (m) out.phone = m[1].trim() }
  return out
}

function cleanTags(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v
    .filter(x => typeof x === 'string')
    .map(x => (x as string).toLowerCase().trim().replace(/\s+/g, '-'))
    .filter(x => x && x.length <= 40))].slice(0, 8)
}

const VALID_CATEGORIES = new Set(['bar', 'club', 'restaurant', 'cafe', 'community-center', 'sauna', 'hotel', 'shop', 'gallery', 'other'])
function normCategory(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const c = v.toLowerCase().trim().replace(/\s+/g, '-')
  return VALID_CATEGORIES.has(c) && c !== 'other' ? c : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('EVENT_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = body.batch_limit ?? DEFAULT_BATCH_LIMIT
  const dailyCap: number = body.daily_cap ?? DEFAULT_DAILY_CAP
  const dryRun: boolean = body.dry_run ?? false
  const venueIds: string[] | undefined = body.venue_ids

  // Daily cap — count successful enrichments today.
  const since = new Date(); since.setUTCHours(0, 0, 0, 0)
  const { count: doneToday } = await supabase
    .from('enrichment_log').select('id', { count: 'exact', head: true })
    .eq('step', STEP).eq('status', 'done').gte('created_at', since.toISOString())
  if (!venueIds?.length && (doneToday ?? 0) >= dailyCap) {
    return jsonResponse({ enriched: 0, capped: true, done_today: doneToday, daily_cap: dailyCap }, 200, req)
  }
  const remaining = venueIds?.length ? batchLimit : Math.min(batchLimit, dailyCap - (doneToday ?? 0))

  // Select work. venues_due_for_refresh returns prioritised rows + routing flags.
  let rows: RefreshRow[]
  if (venueIds?.length) {
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, slug, city, country, category, description, website, phone, email, tags, hours, images, lgbti_relevance_score')
      .in('id', venueIds)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    rows = (data ?? []).map(v => ({
      id: v.id, name: v.name, slug: v.slug, city: v.city, country: v.country,
      category: v.category, description: v.description, website: v.website,
      has_website: !!(v.website && v.website.trim()),
      needs_description: (v.description?.length ?? 0) < 20,
      needs_category: ['', 'other', 'unknown'].includes((v.category ?? '').toLowerCase()),
      needs_tags: !(v.tags?.length), needs_hours: !v.hours || Object.keys(v.hours).length === 0,
      needs_contact: !v.phone && !v.email, needs_images: !(v.images?.length),
    }))
  } else {
    const { data, error } = await supabase.rpc('venues_due_for_refresh', { p_limit: remaining * 3 })
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    rows = (data ?? [])
      .filter((r: RefreshRow) => r.needs_description || r.needs_category || r.needs_tags || r.needs_hours || r.needs_contact || r.needs_images)
      .slice(0, remaining)
  }
  if (!rows.length) return jsonResponse({ enriched: 0, message: 'nothing to enrich' }, 200, req)

  let enriched = 0, flagged = 0, skipped = 0
  const results: Array<Record<string, unknown>> = []

  for (const v of rows) {
    const started = Date.now()
    let status = 'skipped'
    try {
      const patch: Record<string, unknown> = {}
      const prov: { field: string; value: unknown; source: string; confidence: number }[] = []
      let confidence = 0
      const extraction: Record<string, unknown> = {}

      if (v.has_website && v.website) {
        const html = await fetchHtml(v.website)
        if (!html) { skipped++; results.push({ id: v.id, status: 'no_page' }); await logStep(supabase, v.id, status, started, dryRun); continue }
        const text = htmlToText(html)
        const struct = extractVenueStructured(html)

        // Structured facts from the venue's own page → applied directly (high trust).
        if (v.needs_hours && struct.hours) { patch.hours = struct.hours; prov.push({ field: 'hours', value: struct.hours, source: 'website', confidence: 0.9 }) }
        if (v.needs_contact && struct.phone) { patch.phone = struct.phone; prov.push({ field: 'phone', value: struct.phone, source: 'website', confidence: 0.9 }) }
        if (v.needs_contact && struct.email) { patch.email = struct.email; prov.push({ field: 'email', value: struct.email, source: 'website', confidence: 0.9 }) }
        if (v.needs_images && struct.image) {
          const st = await probeLink(struct.image, { timeoutMs: 6000, ua: UA })
          if (!isDeadLink(st)) { patch.images = [struct.image]; prov.push({ field: 'images', value: [struct.image], source: 'website', confidence: 0.85 }) }
        }

        // Grounded LLM extraction → confidence-gated.
        let ai: VenueMoatEnrichment | null = null
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.agentic-enrich', () =>
            researchEnrichVenueFromPage(supabase, {
              name: v.name, city: v.city ?? undefined, country: v.country ?? undefined,
              category: v.category ?? undefined, existingDescription: v.description ?? undefined, pageText: text,
            }))
        } catch (e) {
          if (e instanceof CircuitOpenError) return jsonResponse({ enriched, flagged, skipped, circuit_open: true, results }, 200, req)
          throw e
        }
        if (ai) {
          Object.assign(extraction, ai)
          confidence = typeof ai.confidence === 'number' ? ai.confidence : 0.5
          if (confidence >= AUTO_APPLY_CONFIDENCE) {
            if (v.needs_description && ai.description && ai.description.length > 30) { patch.description = ai.description; prov.push({ field: 'description', value: ai.description, source: 'website', confidence }) }
            const cat = normCategory(ai.category)
            if (v.needs_category && cat) { patch.category = cat; prov.push({ field: 'category', value: cat, source: 'website', confidence }) }
            const tags = cleanTags(ai.tags)
            if (v.needs_tags && tags.length) { patch.tags = tags; prov.push({ field: 'tags', value: tags, source: 'website', confidence }) }
            const tg = cleanTags(ai.target_groups)
            if (tg.length) patch.target_groups = tg
            const acc = cleanTags(ai.accessibility_attributes)
            if (acc.length) patch.accessibility_attributes = acc
            if (typeof ai.lgbtq_relevance_score === 'number') { const s = Math.max(0, Math.min(1, ai.lgbtq_relevance_score)); patch.lgbti_relevance_score = s; prov.push({ field: 'lgbti_relevance_score', value: s, source: 'website', confidence }) }
          }
        }
      } else {
        // No website: conservative classification only (category/tags/relevance). No generated
        // description — grounding-free venue facts are a trust/safety risk.
        let ai: VenueMoatEnrichment | null = null
        try {
          ai = await withCircuitBreaker(supabase, 'llm.openai.agentic-enrich', () =>
            enrichVenueWithAI(supabase, {
              name: v.name, description: v.description ?? undefined, city: v.city ?? undefined,
              country: v.country ?? undefined, category: v.category ?? undefined,
            }) as Promise<VenueMoatEnrichment | null>)
        } catch (e) {
          if (e instanceof CircuitOpenError) return jsonResponse({ enriched, flagged, skipped, circuit_open: true, results }, 200, req)
          throw e
        }
        if (ai) {
          const a = ai as VenueMoatEnrichment & { lgbtq_relevance_score?: number; suggested_tags?: string[]; category_suggestion?: string }
          confidence = 0.5
          const cat = normCategory(a.category_suggestion)
          if (v.needs_category && cat) { patch.category = cat; prov.push({ field: 'category', value: cat, source: 'llm', confidence }) }
          const tags = cleanTags(a.suggested_tags)
          if (v.needs_tags && tags.length) { patch.tags = tags; prov.push({ field: 'tags', value: tags, source: 'llm', confidence }) }
          if (typeof a.lgbtq_relevance_score === 'number') { const s = Math.max(0, Math.min(1, a.lgbtq_relevance_score)); patch.lgbti_relevance_score = s; prov.push({ field: 'lgbti_relevance_score', value: s, source: 'llm', confidence }) }
        }
      }

      const appliedFields = prov.length
      const lowConf = v.has_website && confidence > 0 && confidence < AUTO_APPLY_CONFIDENCE
      if (appliedFields === 0 && !lowConf) { skipped++; results.push({ id: v.id, status: 'no_fields' }); await logStep(supabase, v.id, status, started, dryRun); continue }

      patch.last_refreshed_at = new Date().toISOString()
      if (Object.keys(extraction).length) {
        const { data: cur } = await supabase.from('venues').select('enrichment_status').eq('id', v.id).maybeSingle()
        patch.enrichment_status = { ...((cur?.enrichment_status as Record<string, unknown>) ?? {}), agentic: { at: patch.last_refreshed_at, confidence, ...extraction } }
      }
      if (lowConf && appliedFields === 0) patch.needs_attention = true

      if (!dryRun) {
        const { error: upErr } = await supabase.from('venues').update(patch).eq('id', v.id)
        if (upErr) throw new Error(upErr.message)
        if (prov.length) {
          await supabase.from('venue_field_provenance').upsert(
            prov.map(p => ({ venue_id: v.id, field: p.field, value: p.value, source: p.source, confidence: p.confidence, is_winning: true, observed_at: patch.last_refreshed_at })),
            { onConflict: 'venue_id,field,source' },
          )
          await supabase.from('venue_consensus_audit').insert(
            prov.map(p => ({ venue_id: v.id, field: p.field, winning_value: p.value, winning_source: p.source, confidence: p.confidence, agreeing_sources: [p.source], action: 'auto_commit', details: { via: STEP } })),
          )
        }
      }
      status = 'done'
      if (appliedFields > 0) enriched++; else flagged++
      results.push({ id: v.id, status: appliedFields > 0 ? 'applied' : 'flagged', confidence, fields: prov.map(p => p.field) })
    } catch (e) {
      status = 'failed'
      results.push({ id: v.id, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await logStep(supabase, v.id, status, started, dryRun)
  }

  return jsonResponse({ enriched, flagged, skipped, dry_run: dryRun, results }, 200, req)
})

async function logStep(supabase: ReturnType<typeof getServiceClient>, venueId: string, status: string, started: number, dryRun: boolean) {
  if (dryRun) return
  await supabase.from('enrichment_log').insert({
    entity_type: 'venue', entity_id: venueId, step: STEP, status, duration_ms: Date.now() - started,
  }).then(() => {}, () => {})
}
