import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { GayOutFetchError } from '../_shared/gayout-fetch.ts'
import { GAYOUT_COUNTRY_ALIASES, GAYOUT_SITEMAPS, parseGayOutPage, parseGayOutSeed, parseGayOutSitemap } from '../_shared/gayout-source.ts'
import type { GayOutInventory } from '../_shared/gayout-source.ts'
import { acquireGayOutDocument } from './acquire.ts'

type GayOutQueueRow = {
  url: string; lease_token: string; work_kind?: string
  document_hash?: string | null; document_offset?: number; source_lastmod?: string | null
}
type GayOutWeeklyBody = {
  inventory?: string; pipeline_run_id?: string; node_id?: string; dry_run?: unknown; batch_size?: unknown
}

/** The database owns the inventory cursor and leases; a request handles a bounded slice. */
export async function handleGayOutWeeklySource(req: Request, body: GayOutWeeklyBody): Promise<Response> {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const db = getServiceClient()
  const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  let run = '', inventory: GayOutInventory = 'places'
  let claimed: GayOutQueueRow[] = []
  async function rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.message}`)
    return data
  }
  const finish = (q: GayOutQueueRow, state: string, error: string | null = null, delay = 0) => rpc('gayout_finish_url', {
    p_run: run, p_inventory: inventory, p_url: q.url, p_token: q.lease_token, p_state: state, p_error: error, p_delay: delay,
  })
  try {
    if (!['places', 'events'].includes(body.inventory ?? '')) return errorResponse('Invalid GayOut inventory', 400, req)
    inventory = body.inventory as GayOutInventory; run = body.pipeline_run_id ?? ''
    const { data: pipeline, error } = await db.from('pipeline_runs').select('pipeline_name,status,context').eq('id', run).single()
    if (error || pipeline?.pipeline_name !== 'gayout-weekly-sync' || pipeline.status !== 'running') return errorResponse('Active GayOut pipeline run required', 400, req)
    const dryRun = pipeline.context?.dry_run === true
    if (Boolean(body.dry_run) !== dryRun) return errorResponse('Dry-run context mismatch', 400, req)
    const acquire = (url: string, sitemap: boolean) => acquireGayOutDocument(url, sitemap, name => Deno.env.get(name))
    if (dryRun) {
      const doc = await acquire(GAYOUT_SITEMAPS[inventory], true)
      const parsed = parseGayOutSitemap(doc.html || '', inventory)
      return jsonResponse({ success: true, dry_run: true, items: 0, has_more: false,
        summary: { inventory, discovered: parsed.entries.length, child_sitemaps: parsed.sitemaps.length, acquisition: doc.method } }, 200, req)
    }
    await rpc('gayout_init_cycle', { p_run: run, p_inventory: inventory })
    const { data: countries, error: countryError } = await db.from('countries').select('name,slug,code')
    if (countryError) throw countryError
    const countryMap = new Map<string, string>(Object.entries(GAYOUT_COUNTRY_ALIASES))
    for (const c of countries || []) {
      for (const key of [c.slug, c.name?.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]) {
        if (key && c.code) countryMap.set(key, c.code.toUpperCase())
      }
    }
    claimed = await rpc('gayout_claim_urls', { p_run: run, p_inventory: inventory, p_limit: Math.max(1, Math.min(5, Number(body.batch_size) || 5)) })
    const deadline = Date.now() + 50000
    let processed = 0, staged = 0, delay = claimed.length ? 1 : 60
    for (const q of [...claimed]) {
      if (Date.now() > deadline) { await finish(q, 'pending'); claimed = claimed.filter(x => x !== q); continue }
      try {
        const document = await acquire(q.url, q.work_kind === 'sitemap')
        if (q.work_kind === 'sitemap') {
          const xml = document.html || '', parsed = parseGayOutSitemap(xml, inventory)
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml)))].map(x => x.toString(16).padStart(2, '0')).join('')
          const jobs = [...parsed.sitemaps.map(url => ({ url, work_kind: 'sitemap' })), ...parsed.entries.map(s => ({
            url: s.url, work_kind: 'detail', source_entity_id: s.sourceId, target_table: s.targetTable, lastmod: s.lastmod,
          }))]
          let offset = hash === q.document_hash ? q.document_offset ?? 0 : 0
          do {
            const end = Math.min(jobs.length, offset + 500)
            await rpc('gayout_save_inventory', { p_run: run, p_inventory: inventory, p_url: q.url, p_token: q.lease_token,
              p_hash: hash, p_jobs: jobs.slice(offset, end), p_offset: end, p_done: end === jobs.length })
            offset = end
          } while (offset < jobs.length && Date.now() < deadline)
          if (offset < jobs.length) await finish(q, 'pending')
        } else {
          const seed = parseGayOutSeed(q.url, inventory, q.source_lastmod)
          if (!seed) throw new Error('E_GAYOUT_SOURCE_IDENTITY_INVALID')
          const country = countryMap.get(seed.countrySlug)
          if (!country) throw new Error(`E_GAYOUT_COUNTRY_UNRESOLVED: ${seed.countrySlug}`)
          const parsed = parseGayOutPage({ seed, country, ...document })
          const records = parsed.records.length ? parsed.records : [{
            entityType: seed.targetTable === 'organizations' ? 'organization' : seed.targetTable === 'events' ? 'event' : 'venue',
            sourceName: 'gayout', sourceId: inventory === 'events' ? seed.sourceId.replace(/^\/+/, '') + '#date-unconfirmed' : seed.sourceId,
            name: parsed.name || '', location: { country }, tags: [], urls: [seed.url],
            metadata: { url: seed.url, review_reason: parsed.reviewReason || 'E_SOURCE_FACTS_UNAVAILABLE', source_unverified: true },
          }]
          for (const record of records) {
            await rpc('gayout_stage_item', { p_run: run, p_node: body.node_id, p_target: seed.targetTable,
              p_url: q.url, p_token: q.lease_token, p_normalized: record,
              p_raw: { url: seed.url, acquisition: document.method, lastmod: seed.lastmod } })
            staged++
          }
          await finish(q, parsed.reviewReason || records.some(r => r.metadata.source_unverified) ? 'review' : 'done')
        }
        processed++; claimed = claimed.filter(x => x !== q)
      } catch (error) {
        if (error instanceof GayOutFetchError && error.code === 'E_GAYOUT_SOURCE_GONE' && q.work_kind === 'detail') {
          await finish(q, 'gone', error.message); processed++; claimed = claimed.filter(x => x !== q); continue
        }
        if (error instanceof GayOutFetchError && error.code === 'E_GAYOUT_RATE_LIMIT') {
          delay = error.retryAfterSeconds
          for (const remaining of claimed) await finish(remaining, 'retry', error.message, delay)
          claimed = []; break
        }
        throw error
      }
    }
    const summary = await rpc('gayout_cycle_summary', { p_run: run, p_inventory: inventory })
    return jsonResponse({ success: true, items: processed, items_processed: processed, items_succeeded: processed,
      staged, has_more: summary.pending > 0, retry_after_seconds: delay, summary }, 200, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GayOut run failed'
    for (const q of claimed) await finish(q, 'retry', message, 300).catch(() => undefined)
    if (run) await rpc('gayout_cycle_summary', { p_run: run, p_inventory: inventory, p_error: message }).catch(() => undefined)
    return jsonResponse({ success: false, error: message }, 503, req)
  }
}
