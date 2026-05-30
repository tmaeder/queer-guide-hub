// event-corroboration — multi-source field fusion for events.
// For every event with >=2 source payloads, compares each field across sources.
// Agreement raises per-field confidence; conflict on an important field lowers it
// and flags the event for triage (needs_attention=true). Writes events.field_provenance
// (per-field {value, confidence, sources, corroborated/conflict}) and a `corroboration`
// quality signal (mean field confidence). No LLM.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, event_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'

const DEFAULT_BATCH_LIMIT = 100
const GEO_AGREE_M = 500           // lat/lng within 500m counts as agreement
const PRICE_TOL = 0.10            // 10% price tolerance
// Only a title disagreement means the sources fundamentally describe different
// events — that warrants human review. Date/city/geo differences are usually
// formatting/timezone noise; they're still recorded in field_provenance.
const IMPORTANT = new Set(['title'])

interface Norm { name?: string; dates?: { start?: string; end?: string }; location?: { lat?: number; lng?: number; city?: string; address?: string }; metadata?: { venue_name?: string; price_min?: number; price_max?: number; event_type?: string }; description?: string; urls?: string[] }

function norm(s: unknown): string { return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }
function dayOf(d: unknown): string | null { const s = String(d ?? ''); return s ? s.slice(0, 10) : null }
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// One field's value from one source.
type Cell = { slug: string; value: unknown; key: string } // key = comparison key

function extract(n: Norm): Record<string, { value: unknown; key: string }> {
  const out: Record<string, { value: unknown; key: string }> = {}
  const put = (field: string, value: unknown, key: string | null) => { if (value != null && key) out[field] = { value, key } }
  put('title', n.name, norm(n.name) || null)
  put('start_day', n.dates?.start, dayOf(n.dates?.start))
  put('end_day', n.dates?.end, dayOf(n.dates?.end))
  put('city', n.location?.city, norm(n.location?.city) || null)
  put('venue_name', n.metadata?.venue_name, norm(n.metadata?.venue_name) || null)
  put('address', n.location?.address, norm(n.location?.address) || null)
  put('event_type', n.metadata?.event_type, norm(n.metadata?.event_type) || null)
  put('price_min', n.metadata?.price_min, n.metadata?.price_min != null ? String(n.metadata.price_min) : null)
  put('price_max', n.metadata?.price_max, n.metadata?.price_max != null ? String(n.metadata.price_max) : null)
  put('url', n.urls?.[0], n.urls?.[0] ? norm(n.urls[0]) : null)
  if (typeof n.location?.lat === 'number' && typeof n.location?.lng === 'number')
    out['geo'] = { value: { lat: n.location.lat, lng: n.location.lng }, key: `${n.location.lat},${n.location.lng}` }
  return out
}

// Group cells for one field and decide agreement.
function fuseField(field: string, cells: Cell[]): { value: unknown; confidence: number; sources: string[]; corroborated: boolean; conflict: boolean } | null {
  const present = cells.filter(c => c.value != null && c.key)
  if (present.length === 0) return null

  // Build clusters of mutually-agreeing cells.
  const clusters: Cell[][] = []
  for (const c of present) {
    const hit = clusters.find(cl => agree(field, cl[0], c))
    if (hit) hit.push(c); else clusters.push([c])
  }
  clusters.sort((a, b) => b.length - a.length)
  const top = clusters[0]
  const single = clusters.length === 1
  const count = top.length
  // confidence: strong when all present sources agree, weaker on partial, low on conflict.
  let confidence: number
  if (single && present.length >= 2) confidence = Math.min(0.98, 0.7 + 0.1 * Math.min(count, 3))
  else if (present.length === 1) confidence = 0.6                       // uncorroborated single source
  else confidence = Math.max(0.25, count / present.length * 0.6)        // contested
  return {
    value: top[0].value,
    confidence: Math.round(confidence * 1000) / 1000,
    sources: top.map(c => c.slug),
    corroborated: single && present.length >= 2,
    conflict: clusters.length > 1,
  }
}

function agree(field: string, a: Cell, b: Cell): boolean {
  if (field === 'geo') {
    const av = a.value as { lat: number; lng: number }, bv = b.value as { lat: number; lng: number }
    return haversine([av.lat, av.lng], [bv.lat, bv.lng]) <= GEO_AGREE_M
  }
  if (field === 'price_min' || field === 'price_max') {
    const x = Number(a.key), y = Number(b.key)
    if (!isFinite(x) || !isFinite(y)) return a.key === b.key
    const m = Math.max(Math.abs(x), Math.abs(y), 1)
    return Math.abs(x - y) / m <= PRICE_TOL
  }
  if (field === 'title') { return tokenSim(a.key, b.key) >= 0.6 }
  return a.key === b.key
}

function tokenSim(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean)), tb = new Set(b.split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return a === b ? 1 : 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter) // Jaccard
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
  const dryRun: boolean = body.dry_run ?? false
  let eventIds: string[] | undefined = body.event_ids

  // Discover events with >=2 payloads (unless explicit ids given).
  if (!eventIds?.length) {
    const { data: rows, error } = await supabase
      .from('event_sources').select('event_id').not('payload', 'is', null)
    if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
    const tally = new Map<string, number>()
    for (const r of rows ?? []) tally.set(r.event_id, (tally.get(r.event_id) ?? 0) + 1)
    eventIds = [...tally.entries()].filter(([, n]) => n >= 2).map(([id]) => id).slice(0, batchLimit)
  }
  if (!eventIds.length) return jsonResponse({ processed: 0, message: 'no multi-source events' }, 200, req)

  const { data: sources, error: srcErr } = await supabase
    .from('event_sources').select('event_id, source_slug, payload, confidence').in('event_id', eventIds).not('payload', 'is', null)
  if (srcErr) return jsonResponse({ error: srcErr.message, success: false }, 500, req)

  const byEvent = new Map<string, Array<{ slug: string; norm: Norm }>>()
  for (const s of sources ?? []) {
    const n = (s.payload as Record<string, unknown>)?.normalized as Norm | undefined
    if (!n) continue
    if (!byEvent.has(s.event_id)) byEvent.set(s.event_id, [])
    byEvent.get(s.event_id)!.push({ slug: s.source_slug, norm: n })
  }

  let processed = 0, flagged = 0
  const results: Array<Record<string, unknown>> = []

  for (const [eventId, srcs] of byEvent) {
    if (srcs.length < 2) continue
    // collect cells per field
    const fields = new Map<string, Cell[]>()
    for (const s of srcs) {
      const ex = extract(s.norm)
      for (const [field, { value, key }] of Object.entries(ex)) {
        if (!fields.has(field)) fields.set(field, [])
        fields.get(field)!.push({ slug: s.slug, value, key })
      }
    }
    const provenance: Record<string, unknown> = {}
    const confidences: number[] = []
    let conflictImportant = false
    for (const [field, cells] of fields) {
      const fused = fuseField(field, cells)
      if (!fused) continue
      provenance[field] = fused
      confidences.push(fused.confidence)
      if (fused.conflict && IMPORTANT.has(field)) conflictImportant = true
    }
    const corrobValue = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.5

    if (!dryRun) {
      await supabase.from('event_quality_signals').insert({
        event_id: eventId, signal_type: 'corroboration', value: Math.round(corrobValue * 10000) / 10000,
        source: 'event-corroboration', details: { sources: srcs.length, fields: Object.keys(provenance).length, conflict_important: conflictImportant },
      })
      const update: Record<string, unknown> = { field_provenance: provenance, last_verified_at: new Date().toISOString() }
      if (conflictImportant) update.needs_attention = true
      await supabase.from('events').update(update).eq('id', eventId)
    }
    if (conflictImportant) flagged++
    processed++
    results.push({ id: eventId, sources: srcs.length, fields: Object.keys(provenance).length, corroboration: Math.round(corrobValue * 100) / 100, flagged: conflictImportant })
  }

  return jsonResponse({ processed, flagged, dry_run: dryRun, results }, 200, req)
})
