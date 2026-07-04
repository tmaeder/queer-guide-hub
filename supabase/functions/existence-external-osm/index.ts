// existence-external-osm — free OpenStreetMap corroborator for venue existence.
//
// For each due venue with coordinates, queries Overpass around the point and looks
// for closure markers (disused:/was:/abandoned:/demolished:/removed: tag prefixes or
// opening_hours=closed). A match emits an `external_osm` dead signal; a clearly-alive
// amenity emits a weak alive signal; ABSENCE emits nothing (absence != closed, same
// philosophy as detect_stale_venues). external_osm is a CORROBORATOR, never in the
// strong-dead set — it can flag/support but never auto-archive alone.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role. Body: { batch_limit?, dry_run? }

import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { logPipelineError } from '../_shared/pipeline-error-log.ts'
import { insertSignals, type ExistenceSignal } from '../_shared/existence-probe.ts'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const UA = 'QueerGuideBot/1.0 (https://queer.guide; contact@queer.guide)'
const PER_CALL_MS = 25_000
const WALL_CLOCK_MS = 90_000
const BETWEEN_MS = 1_000
const DEFAULT_BATCH = 30
const CLOSURE_PREFIXES = ['disused:', 'was:', 'abandoned:', 'demolished:', 'removed:', 'razed:']

type OsmEl = { tags?: Record<string, string> }

async function overpass(lat: number, lng: number): Promise<OsmEl[] | null> {
  const q = `[out:json][timeout:25];(node(around:80,${lat},${lng});way(around:80,${lat},${lng}););out tags 60;`
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(PER_CALL_MS),
    })
    if (!res.ok) return null
    const json = await res.json() as { elements?: OsmEl[] }
    return json.elements ?? []
  } catch { return null }
}

function classify(els: OsmEl[]): { verdict: 'dead' | 'alive'; detail: Record<string, unknown> } | null {
  let aliveAmenity = false
  for (const el of els) {
    const tags = el.tags ?? {}
    for (const k of Object.keys(tags)) {
      if (CLOSURE_PREFIXES.some((p) => k.startsWith(p))) {
        return { verdict: 'dead', detail: { osm_tag: k, value: tags[k] } }
      }
    }
    if ((tags['opening_hours'] ?? '').toLowerCase() === 'closed') {
      return { verdict: 'dead', detail: { opening_hours: 'closed' } }
    }
    if (tags['amenity'] || tags['shop'] || tags['leisure'] || tags['tourism']) aliveAmenity = true
  }
  return aliveAmenity ? { verdict: 'alive', detail: { present: true } } : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const supabase = getServiceClient()
  const secret = Deno.env.get('EXISTENCE_WEBHOOK_SECRET')
  const provided = req.headers.get('X-Webhook-Secret')
  if (!(secret && provided && provided === secret)) {
    const auth = await requireInternalOrAdmin(req, supabase); if (auth instanceof Response) return auth
  }

  try {
    const body = await req.json().catch(() => ({}))
    const batch = Number(body.batch_limit ?? DEFAULT_BATCH)
    const dryRun: boolean = body.dry_run ?? false

    const { data, error } = await supabase.rpc('venues_due_for_existence_check', { p_limit: batch })
    if (error) return errorResponse(`selector: ${error.message}`, 500, req)
    const rows = (data ?? []).filter((r: { latitude: number | null; longitude: number | null }) => r.latitude != null && r.longitude != null)

    const sigs: ExistenceSignal[] = []
    const started = Date.now()
    let checked = 0, dead = 0
    for (let i = 0; i < rows.length; i++) {
      if (Date.now() - started > WALL_CLOCK_MS) break
      const r = rows[i] as { id: string; latitude: number; longitude: number }
      checked++
      const els = await overpass(Number(r.latitude), Number(r.longitude))
      if (els) {
        const c = classify(els)
        if (c) {
          if (c.verdict === 'dead') dead++
          sigs.push({
            entity_type: 'venue', entity_id: r.id, signal_kind: 'external_osm',
            verdict: c.verdict, weight: c.verdict === 'dead' ? 0.5 : 0.4,
            source: 'existence-external-osm', details: c.detail,
          })
        }
      }
      if (i < rows.length - 1) await new Promise((res) => setTimeout(res, BETWEEN_MS))
    }

    if (!dryRun) await insertSignals(supabase, sigs)
    return jsonResponse({ success: true, checked, dead, signals: sigs.length, dry_run: dryRun }, 200, req)
  } catch (error) {
    console.error('existence-external-osm:', error)
    await logPipelineError(supabase, 'existence-external-osm', error, { severity: 'warn' })
    return errorResponse((error as Error).message, 500, req)
  }
})
