// city-corroboration — multi-source field fusion for cities. No LLM.
// Reads the per-source candidates that city-factual-backfill recorded into
// cities.field_provenance and fuses each field: agreement raises confidence,
// conflict lowers it. A coordinate conflict between sources flags the city for
// triage (needs_attention=true). Writes the fused provenance back + a
// `corroboration` quality signal (mean field confidence).
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run?, city_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'

const DEFAULT_BATCH_LIMIT = 200
const GEO_AGREE_M = 25_000        // cities: within 25km counts as same place
const NUM_TOL = 0.10              // 10% tolerance for population/area/etc.
const IMPORTANT = new Set(['coords'])

interface Candidate { source: string; value: unknown }
interface FieldProv { candidates?: Candidate[]; value?: unknown; confidence?: number; sources?: string[]; corroborated?: boolean; conflict?: boolean }

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function norm(s: unknown): string { return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }

function agree(field: string, a: unknown, b: unknown): boolean {
  if (field === 'coords') {
    const av = a as { lat: number; lng: number }, bv = b as { lat: number; lng: number }
    if (!av || !bv) return false
    return haversine([av.lat, av.lng], [bv.lat, bv.lng]) <= GEO_AGREE_M
  }
  if (typeof a === 'number' && typeof b === 'number') {
    const m = Math.max(Math.abs(a), Math.abs(b), 1)
    return Math.abs(a - b) / m <= NUM_TOL
  }
  return norm(a) === norm(b)
}

function fuse(field: string, candidates: Candidate[]): FieldProv | null {
  const present = candidates.filter(c => c.value != null)
  if (!present.length) return null
  const clusters: Candidate[][] = []
  for (const c of present) {
    const hit = clusters.find(cl => agree(field, cl[0].value, c.value))
    if (hit) hit.push(c); else clusters.push([c])
  }
  clusters.sort((a, b) => b.length - a.length)
  const top = clusters[0]
  const single = clusters.length === 1
  let confidence: number
  if (single && present.length >= 2) confidence = Math.min(0.98, 0.7 + 0.1 * Math.min(top.length, 3))
  else if (present.length === 1) confidence = 0.6
  else confidence = Math.max(0.25, (top.length / present.length) * 0.6)
  return {
    candidates: present,
    value: top[0].value,
    confidence: Math.round(confidence * 1000) / 1000,
    sources: top.map(c => c.source),
    corroborated: single && present.length >= 2,
    conflict: clusters.length > 1,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const secret = Deno.env.get('CITY_QUALITY_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase)
    if (auth instanceof Response) return auth
  }

  const body = await req.json().catch(() => ({}))
  const batchLimit: number = Math.min(1000, body.batch_limit ?? DEFAULT_BATCH_LIMIT)
  const dryRun: boolean = body.dry_run ?? false
  const cityIds: string[] | undefined = body.city_ids

  let query = supabase
    .from('cities')
    .select('id, name, field_provenance')
    .is('duplicate_of_id', null)
    .not('field_provenance', 'eq', '{}')
  if (cityIds?.length) query = query.in('id', cityIds)
  else query = query.limit(batchLimit)

  const { data: cities, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!cities?.length) return jsonResponse({ processed: 0, message: 'no cities with provenance' }, 200, req)

  let processed = 0, flagged = 0
  const results: Array<Record<string, unknown>> = []

  for (const c of cities) {
    const prov = (c.field_provenance ?? {}) as Record<string, FieldProv>
    const fields = Object.keys(prov).filter(f => Array.isArray(prov[f]?.candidates))
    if (!fields.length) continue

    const out: Record<string, FieldProv> = { ...prov }
    const confidences: number[] = []
    let conflictImportant = false
    for (const f of fields) {
      const fused = fuse(f, prov[f].candidates!)
      if (!fused) continue
      out[f] = fused
      confidences.push(fused.confidence!)
      if (fused.conflict && IMPORTANT.has(f)) conflictImportant = true
    }
    const corrob = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.5

    if (!dryRun) {
      const update: Record<string, unknown> = { field_provenance: out }
      if (conflictImportant) update.needs_attention = true
      await supabase.from('cities').update(update).eq('id', c.id)
      await supabase.from('city_quality_signals').insert({
        city_id: c.id, signal_type: 'corroboration', value: Math.round(corrob * 10000) / 10000,
        source: 'city-corroboration', details: { fields: fields.length, conflict_important: conflictImportant },
      })
    }
    if (conflictImportant) flagged++
    processed++
    results.push({ id: c.id, name: c.name, fields: fields.length, corroboration: Math.round(corrob * 100) / 100, flagged: conflictImportant })
  }

  return jsonResponse({ processed, flagged, dry_run: dryRun, results }, 200, req)
})
