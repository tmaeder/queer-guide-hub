// event-liveness-checker — continuous freshness/liveness sweep for events.
// Re-fetches ticket_url / website, reads JSON-LD Event.eventStatus + offers.availability,
// maps to a liveness_status, writes a `liveness` quality signal, and (hybrid-by-confidence)
// auto-applies certain changes (404 → dead_link, EventCancelled → cancelled) while routing
// ambiguous degradations to triage (needs_attention=true). No LLM.
//
// Auth: X-Webhook-Secret (cron) or admin/service-role (manual). Body: { batch_limit?, dry_run?, event_ids? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { assertPublicHttpUrl } from '../_shared/ssrf-guard.ts'

const GET_TIMEOUT = 10_000
const MAX_BODY_BYTES = 600_000
const BETWEEN_CHECK_DELAY = 400
const DEFAULT_BATCH_LIMIT = 50
const UPCOMING_WINDOW_DAYS = 60

type Liveness = 'live' | 'sold_out' | 'cancelled' | 'postponed' | 'moved_online' | 'dead_link' | 'unknown'

// Signal value per liveness state (0..1, higher = healthier).
const LIVENESS_VALUE: Record<Liveness, number> = {
  live: 1.0, sold_out: 0.7, moved_online: 0.6, postponed: 0.5, unknown: 0.5, dead_link: 0.1, cancelled: 0.0,
}
// States we are confident enough to auto-apply to events.status.
const AUTO_STATUS: Partial<Record<Liveness, string>> = { cancelled: 'cancelled', postponed: 'postponed' }
// States that warrant a human glance even when auto-applied.
const FLAG_ATTENTION: Liveness[] = ['cancelled', 'postponed', 'moved_online', 'sold_out', 'dead_link']

function normalizeUrl(url: string): string {
  const t = (url ?? '').trim()
  if (!t) return t
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

async function fetchBody(rawUrl: string): Promise<{ httpStatus: number | null; body: string | null; error: string | null }> {
  const url = normalizeUrl(rawUrl)
  if (!url) return { httpStatus: null, body: null, error: 'empty_url' }
  try {
    assertPublicHttpUrl(url)
  } catch {
    // Private/loopback/metadata target — never fetch; classify() sees a null
    // httpStatus and yields 'unknown' (inconclusive), so nothing is demoted.
    return { httpStatus: null, body: null, error: 'blocked_unsafe_url' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GET_TIMEOUT)
  try {
    const resp = await fetch(url, {
      method: 'GET', signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide-EventLiveness/1.0)', 'Accept': 'text/html,application/xhtml+xml,*/*' },
    })
    let body: string | null = null
    if (resp.body && resp.status >= 200 && resp.status < 400) {
      const reader = resp.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      while (total < MAX_BODY_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); total += value.length
      }
      reader.cancel().catch(() => {})
      body = new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks))
    }
    return { httpStatus: resp.status, body, error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { httpStatus: null, body: null, error: msg.substring(0, 200) }
  } finally {
    clearTimeout(timer)
  }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

// Pull every JSON-LD block and surface any Event eventStatus / offer availability.
function parseJsonLd(html: string): { eventStatus: string | null; availability: string | null } {
  let eventStatus: string | null = null
  let availability: string | null = null
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(m[1].trim()) } catch { continue }
    for (const node of flattenLd(parsed)) {
      const t = String((node as Record<string, unknown>)['@type'] ?? '').toLowerCase()
      if (!t.includes('event')) continue
      const es = (node as Record<string, unknown>)['eventStatus']
      if (typeof es === 'string') eventStatus = es
      const offers = (node as Record<string, unknown>)['offers']
      for (const off of Array.isArray(offers) ? offers : offers ? [offers] : []) {
        const av = (off as Record<string, unknown>)?.['availability']
        if (typeof av === 'string') availability = av
      }
    }
  }
  return { eventStatus, availability }
}

function flattenLd(parsed: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const visit = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(visit); return }
    if (n && typeof n === 'object') {
      out.push(n as Record<string, unknown>)
      const graph = (n as Record<string, unknown>)['@graph']
      if (Array.isArray(graph)) graph.forEach(visit)
    }
  }
  visit(parsed)
  return out
}

function classify(httpStatus: number | null, ld: { eventStatus: string | null; availability: string | null }): Liveness {
  const es = (ld.eventStatus ?? '').toLowerCase()
  if (es.includes('cancel')) return 'cancelled'
  if (es.includes('postpon')) return 'postponed'
  if (es.includes('movedonline') || es.includes('moved_online')) return 'moved_online'
  const av = (ld.availability ?? '').toLowerCase()
  if (av.includes('soldout') || av.includes('sold_out')) return 'sold_out'
  if (httpStatus === null) return 'unknown'        // timeout / network — inconclusive
  if (httpStatus === 404 || httpStatus === 410) return 'dead_link'
  if (httpStatus >= 200 && httpStatus < 400) return 'live'
  if (httpStatus === 401 || httpStatus === 403) return 'unknown' // blocked, not necessarily dead
  return 'unknown'
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
  const eventIds: string[] | undefined = body.event_ids

  let query = supabase
    .from('events')
    .select('id, ticket_url, website, status, start_date, liveness_status, last_verified_at')
    .is('duplicate_of_id', null)

  if (eventIds?.length) {
    query = query.in('id', eventIds)
  } else {
    query = query
      .eq('status', 'active')
      .gt('start_date', new Date().toISOString())
      .lt('start_date', new Date(Date.now() + UPCOMING_WINDOW_DAYS * 86400_000).toISOString())
      .or('ticket_url.not.is.null,website.not.is.null')
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(batchLimit)
  }

  const { data: events, error } = await query
  if (error) return jsonResponse({ error: error.message, success: false }, 500, req)
  if (!events?.length) return jsonResponse({ checked: 0, message: 'no events to check' }, 200, req)

  const counts: Record<string, number> = {}
  const results: Array<Record<string, unknown>> = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const target = ev.ticket_url || ev.website
    if (!target) continue
    try {
      const { httpStatus, body: html, error: fetchErr } = await fetchBody(target)
      const ld = html ? parseJsonLd(html) : { eventStatus: null, availability: null }
      const liveness = classify(httpStatus, ld)
      counts[liveness] = (counts[liveness] ?? 0) + 1

      const detail = { url: target, http_status: httpStatus, event_status: ld.eventStatus, availability: ld.availability, fetch_error: fetchErr }

      if (!dryRun) {
        await supabase.from('event_quality_signals').insert({
          event_id: ev.id, signal_type: 'liveness', value: LIVENESS_VALUE[liveness], source: 'event-liveness-checker', details: detail,
        })
        const update: Record<string, unknown> = { liveness_status: liveness, last_verified_at: new Date().toISOString() }
        if (AUTO_STATUS[liveness]) update.status = AUTO_STATUS[liveness]
        if (FLAG_ATTENTION.includes(liveness)) update.needs_attention = true
        await supabase.from('events').update(update).eq('id', ev.id)
      }
      results.push({ id: ev.id, liveness, http_status: httpStatus, ...(ld.eventStatus ? { event_status: ld.eventStatus } : {}) })
    } catch (e) {
      results.push({ id: ev.id, liveness: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    if (i < events.length - 1) await new Promise(r => setTimeout(r, BETWEEN_CHECK_DELAY))
  }

  return jsonResponse({ checked: results.length, dry_run: dryRun, counts, results }, 200, req)
})
