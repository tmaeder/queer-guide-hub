import { corsResponse, errorResponse, getServiceClient, jsonResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'
import { discover, factHash, ORIGIN, parseBusiness, parseEvent, sourceUrl, type EventContext } from '../_shared/prideplaces-parse.ts'
import { validateEventSourceContract } from '../_shared/event-source-contract.ts'
import type { NormalizedItem } from '../_shared/source-adapter.ts'

type Client = ReturnType<typeof getServiceClient>
type Json = Record<string, unknown>
interface Work { id: number; kind: 'business_index' | 'event_index' | 'business' | 'event'; url: string }
interface Claim { run_id: string; lease?: string; items: Work[] }
const UA = 'QueerGuideBot/1.0 (+https://queer.guide)'

/** Do not follow off-site redirects, login walls or fetch unlimited bodies. */
export async function getPage(url: string): Promise<string> {
  sourceUrl(url)
  const response = await fetch(url, {
    // The source advertises a five-second keep-alive window. Edge isolates can
    // resume with stale pooled sockets; close this source connection after use.
    headers: { Accept: 'text/html', 'User-Agent': UA, Connection: 'close' },
    signal: AbortSignal.timeout(20_000), redirect: 'error',
  })
  if (!response.ok) { await response.body?.cancel(); throw Error(`Source HTTP ${response.status}`) }
  if (!response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw Error('Source returned non-HTML content') }
  if (!response.body) throw Error('Empty source response')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let html = '', size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 3_000_000) throw Error('Source response exceeds size budget')
      html += decoder.decode(value, { stream: true })
    }
    return html + decoder.decode()
  } finally { await reader.cancel() }
}
async function rpc<T>(client: Client, name: string, args: Json): Promise<T> {
  const { data, error } = await client.rpc(name, args)
  if (error) throw Error(`${name}: ${error.message}`)
  return data as T
}

async function baseline(client: Client, sourceId: string): Promise<{ id: string; normalized_data: Json } | null> {
  const { data, error } = await client.from('ingestion_staging')
    .select('id,normalized_data').eq('source_name', 'prideplaces').eq('source_entity_id', sourceId)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle()
  if (error) throw Error('Could not read source baseline')
  return data
}

/** A past source occurrence identifies its venue, never its current event time. */
async function eventContext(client: Client, url: string, initial: Json): Promise<EventContext> {
  const { data: previous, error } = await client.from('ingestion_staging')
    .select('normalized_data').eq('source_name', 'prideplaces').eq('entity_type', 'event')
    .eq('normalized_data->metadata->>url', url)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw Error('Could not resolve event source history')
  const id = previous?.normalized_data?.venue_id
  if (typeof id !== 'string') return {}
  const { data: venue, error: venueError } = await client.from('venues')
    .select('id,name,city,country,timezone,latitude,longitude,review_status').eq('id', id).maybeSingle()
  if (venueError) throw Error('Could not verify event venue')
  if (!venue || venue.review_status === 'archived') return {}
  const loc = initial.location as Json
  const name = (v: unknown) => String(v ?? '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '')
  // Identity must still agree: do not attach an event that has moved to an old venue.
  const sameName = name(initial.venue_name) === name(venue.name)
  const near = typeof loc.lat === 'number' && typeof loc.lng === 'number' &&
    venue.latitude != null && venue.longitude != null &&
    Math.hypot((loc.lat - venue.latitude) * 111_000, (loc.lng - venue.longitude) * 111_000 * Math.cos(loc.lat * Math.PI / 180)) < 250
  if (!sameName || !near) return {}
  // Country-wide defaults are unsafe for countries spanning multiple time zones.
  let timezone = venue.timezone
  if (!timezone) {
    const { data: city, error: cityError } = await client.from('venues').select('cities(timezone)').eq('id', id).maybeSingle()
    if (cityError) throw Error('Could not verify event city timezone')
    const cities = city?.cities as { timezone?: string } | { timezone?: string }[] | null
    timezone = Array.isArray(cities) ? cities[0]?.timezone : cities?.timezone
  }
  return { venueId: venue.id, timezone: timezone ?? undefined, city: venue.city ?? undefined, country: venue.country ?? undefined }
}

async function observation(client: Client, work: Work): Promise<Json> {
  const html = await getPage(work.url)
  if (work.kind === 'business_index' || work.kind === 'event_index') return discover(html, work.kind === 'business_index' ? 'business' : 'event', work.url) as unknown as Json
  let normalized: Json
  if (work.kind === 'business') normalized = parseBusiness(html, work.url)
  else {
    const initial = parseEvent(html, work.url)
    normalized = parseEvent(html, work.url, await eventContext(client, work.url, initial))
    const contract = validateEventSourceContract(normalized as unknown as NormalizedItem)
    const metadata = normalized.metadata as Json
    normalized.metadata = { ...metadata, source_contract: { version: 1, ...contract }, requires_review: metadata.requires_review === true || contract.errors.length > 0 }
  }
  const prior = await baseline(client, String(normalized.sourceId))
  return {
    normalized, fact_hash: await factHash(normalized),
    ...(prior ? { baseline_id: prior.id, baseline_hash: await factHash(prior.normalized_data) } : {}),
  }
}

export const handler = withErrorReporting('source-prideplaces', async (req: Request) => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const auth = await requireInternalOrAdmin(req, getServiceClient())
  if (auth instanceof Response) return auth
  if (req.method !== 'POST') return errorResponse('Use POST', 405, req)
  try {
    const body = await req.json().catch(() => ({}))
    // Dry runs are genuinely read-only; their sample is explicitly partial coverage.
    if (body.dry_run === true || body.dryRun === true) {
      const [businesses, events] = await Promise.all([
        getPage(`${ORIGIN}/search_results`).then(html => discover(html, 'business', `${ORIGIN}/search_results`)),
        getPage(`${ORIGIN}/events`).then(html => discover(html, 'event', `${ORIGIN}/events`)),
      ])
      return jsonResponse({ success: true, dry_run: true, complete: false, coverage: 'discovery_sample_only', businesses, events }, 200, req)
    }
    const client = getServiceClient()
    const action = body.action ?? 'start'
    if (!['start', 'continue', 'status'].includes(action)) return errorResponse('Unknown action', 400, req)
    if (action !== 'start' && !/^[a-f0-9-]{36}$/i.test(body.run_id ?? '')) return errorResponse('run_id required', 400, req)
    const runId = action === 'start'
      ? await rpc<string>(client, 'prideplaces_start_scan', { p_force: body.force === true })
      : body.run_id
    if (action !== 'status') {
      const claim = await rpc<Claim>(client, 'prideplaces_claim_scan', { p_run: runId, p_batch: Number.isFinite(Number(body.batch_size)) ? Math.min(8, Math.max(1, Math.floor(Number(body.batch_size)))) : 4 })
      // Each claimed batch is bounded; a failed acknowledgement leaves durable work
      // for lease-expiry recovery rather than advancing an in-memory cursor.
      const outcomes = await Promise.allSettled(claim.items.map(async work => {
        let result: Json
        try { result = await observation(client, work) }
        catch (error) { result = { error: (error instanceof Error ? error.message : 'Source fetch failed').slice(0, 500) } }
        return await rpc(client, 'prideplaces_finish_work', { p_run: runId, p_lease: claim.lease, p_work: work.id, p_result: result })
      }))
      const rejected = outcomes.find(o => o.status === 'rejected')
      if (rejected?.status === 'rejected') throw rejected.reason
      const progress = await rpc<Json>(client, 'prideplaces_scan_progress', { p_run: runId, p_lease: claim.lease ?? null })
      const processed = Number(progress.unchanged ?? 0) + Number(progress.review ?? 0) + Number(progress.staged ?? 0)
      return jsonResponse({
        success: progress.collection_status !== 'failed', ...progress,
        items_total: processed, items_staged: progress.staged_total,
        has_more: progress.collection_status === 'running',
        continuation: progress.collection_status === 'running' ? { action: 'continue', run_id: runId } : null,
      }, 200, req)
    }
    return jsonResponse({ success: true, ...await rpc<Json>(client, 'prideplaces_scan_progress', { p_run: runId }) }, 200, req)
  } catch (error) {
    console.error('source-prideplaces:', error instanceof Error ? error.message : 'Source failure')
    return errorResponse(error instanceof Error ? error.message : 'Pride Places scan failed', 500, req)
  }
})
