import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { logoMirrorConfigured } from '../_shared/logo-mirror.ts'
import { processQualityLogoJobs } from '../_shared/logo-quality-worker.ts'

// New logos and existing repairs use the same quality gates and review workflow.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return corsResponse(req)
  const db = getServiceClient()
  const auth = await requireInternalOrAdmin(req, db)
  if (auth instanceof Response) return auth
  try {
    const body = await req.json().catch(() => ({}))
    const table = typeof body.table === 'string' ? body.table : 'all'
    const tables = ['venues', 'events', 'organizations', 'marketplace_brands']
    if (table !== 'all' && !tables.includes(table)) return errorResponse('invalid_logo_table', 400, req)
    const batchSize = Math.max(1, Math.min(4, Math.trunc(Number(body.batch_size) || 4)))
    const dryRun = body.dry_run === true
    if (!dryRun && !logoMirrorConfigured()) return errorResponse('logo_mirror_unconfigured', 503, req)
    const results: Record<string, unknown> = {}
    const selectedTables = tables.filter(t => table === 'all' || t === table)
    const perTable = Math.max(1, Math.floor(batchSize / selectedTables.length))
    for (const t of selectedTables) {
      if (!dryRun) {
        // Include pre-existing missing logos, while the database trigger captures
        // future writes. Existing jobs are not reset or repeatedly re-reviewed.
        let missing = db.from(t).select('*').is('logo_url', null).is('logo_fetched_at', null)
          .not('website', 'is', null)
        if (t === 'venues' || t === 'events') missing = missing.is('duplicate_of_id', null)
        const query = await missing.order('created_at').limit(perTable)
        if (query.error) throw new Error(query.error.message)
        const seeds = (query.data ?? []).map(row => ({
          entity_table: t, entity_id: row.id, entity_name: row.name ?? row.title ?? row.display_name ?? '',
          expected_url: row.logo_url, expected_website: row.website,
        }))
        if (t === 'marketplace_brands') {
          const candidates = await db.rpc('marketplace_brand_logo_candidates', { p_limit: perTable })
          if (candidates.error) throw new Error(candidates.error.message)
          for (const row of candidates.data ?? []) {
            // The RPC corroborates the merchant's domain against the brand name.
            // Keep the actual database website separate for optimistic locking.
            const actual = await db.from(t).select('website,logo_url').eq('id', row.id).single()
            if (actual.error) throw new Error(actual.error.message)
            if (!actual.data.logo_url) seeds.push({
              entity_table: t, entity_id: row.id, entity_name: row.display_name,
              expected_url: null, expected_website: actual.data.website,
              ...{ evidence: { discovered_website: row.domain ? `https://${row.domain}/` : null, domain_evidence: row.evidence } },
            })
          }
        }
        const unique = [...new Map(seeds.map(row => [row.entity_id, row])).values()]
        if (unique.length) {
          const inserted = await db.from('logo_quality_jobs').upsert(unique, { onConflict: 'entity_table,entity_id', ignoreDuplicates: true })
          if (inserted.error) throw new Error(inserted.error.message)
        }
      }
      results[t] = await processQualityLogoJobs(db, t, perTable, dryRun)
    }
    return jsonResponse({ success: true, dry_run: dryRun, ...results }, 200, req)
  } catch (e) {
    console.error('enrich-logos', (e as Error).message)
    return errorResponse('logo_enrichment_failed', 500, req)
  }
})
