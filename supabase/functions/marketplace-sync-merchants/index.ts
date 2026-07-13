import { getServiceClient, jsonResponse, errorResponse, corsResponse, requireInternalOrAdmin } from '../_shared/supabase-client.ts'
import { withErrorReporting } from '../_shared/report-api-error.ts'

// ============================================================
// marketplace-sync-merchants — registry-driven recurring vendor sync
//
// Makes the dormant `marketplace_merchants` registry live. Selects the
// least-recently-synced enabled public-feed merchants (merchants_due_for_sync),
// and for each invokes the matching public source function
// (source-shopify-public / source-woocommerce-public) with `refresh: true` so
// changed products re-flow (see writeToStaging refresh mode + the commit RPC's
// price/stock UPDATE + price_history path). Stamps last_sync_* per merchant.
//
// Runs hourly (wf-marketplace-sync-merchants); the small per-run batch cycles
// all enabled merchants through within a day without blowing the function
// timeout on large catalogs. 'crawl' merchants are skipped (no public feed).
//
// Wall-clock budget: the Supabase gateway 504s responses at ~150s, and the
// workflow-dispatcher dead-letters on that 504 even though merchants were
// synced (236 dead letters 07-03→07-13). So the run stops picking up new
// merchants once the budget is spent and returns 200 with `remaining` —
// merchants_due_for_sync is LRU-ordered, the next hourly run continues.
//
// Body: { limit?, provider?, dry_run?, pipeline_run_id?, max_pages? }
// ============================================================

const PROVIDER_FN: Record<string, string> = {
  'shopify-public': 'source-shopify-public',
  'woocommerce-public': 'source-woocommerce-public',
}

const RUN_BUDGET_MS = 120_000 // respond well before the ~150s gateway 504
const MIN_MERCHANT_MS = 20_000 // don't start a merchant with less than this left

interface DueMerchant {
  provider: string
  slug: string
  display_name: string
  shop_domain: string
  config: Record<string, unknown> | null
}

Deno.serve(withErrorReporting('marketplace-sync-merchants', async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req)

  const supabase = getServiceClient()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // verify_jwt=false at the gateway — enforce internal-secret / service-role /
  // admin here (mirrors pipeline-executor).
  const authResult = await requireInternalOrAdmin(req, supabase)
  if (authResult instanceof Response) return authResult

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.max(1, Number(body.limit ?? 6))
    const provider = body.provider as string | undefined
    const dryRun = body.dry_run === true
    const pipelineRunId = body.pipeline_run_id as string | undefined
    const maxPages = body.max_pages as number | undefined

    const { data: due, error: dueErr } = await supabase.rpc('merchants_due_for_sync', { p_limit: limit })
    if (dueErr) return errorResponse(`merchants_due_for_sync: ${dueErr.message}`, 500, req)

    let merchants = (due ?? []) as DueMerchant[]
    if (provider) merchants = merchants.filter(m => m.provider === provider)

    const runStarted = Date.now()
    const results: Array<Record<string, unknown>> = []
    let remaining = 0
    for (const m of merchants) {
      const budgetLeft = RUN_BUDGET_MS - (Date.now() - runStarted)
      if (budgetLeft < MIN_MERCHANT_MS) { remaining++; continue }

      const fn = PROVIDER_FN[m.provider]
      if (!fn) { results.push({ slug: m.slug, provider: m.provider, status: 'skipped', reason: 'no_public_feed' }); continue }

      const currency = (m.config && typeof m.config === 'object') ? (m.config as Record<string, unknown>).currency : undefined
      const started = Date.now()
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), budgetLeft)
        let payload: Record<string, unknown>
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: {
              'content-type': 'application/json',
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              shop_domain: m.shop_domain,
              source_slug: m.slug,
              currency,
              refresh: true,
              dry_run: dryRun,
              pipeline_run_id: pipelineRunId,
              ...(maxPages ? { max_pages: maxPages } : {}),
            }),
          })
          const text = await res.text()
          payload = text ? JSON.parse(text) : {}
          if (!res.ok) throw new Error(`${fn} ${res.status}: ${text.slice(0, 200)}`)
        } finally { clearTimeout(timer) }

        const items = Number(payload.items ?? payload.items_succeeded ?? 0)
        if (!dryRun) {
          await supabase.from('marketplace_merchants')
            .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'ok', last_sync_items: items })
            .eq('provider', m.provider).eq('slug', m.slug)
        }
        results.push({ slug: m.slug, provider: m.provider, status: 'ok', items, ms: Date.now() - started })
      } catch (err) {
        const message = (err as Error).message.slice(0, 300)
        if (!dryRun) {
          await supabase.from('marketplace_merchants')
            .update({ last_sync_at: new Date().toISOString(), last_sync_status: `error: ${message.slice(0, 120)}` })
            .eq('provider', m.provider).eq('slug', m.slug)
        }
        results.push({ slug: m.slug, provider: m.provider, status: 'error', error: message, ms: Date.now() - started })
      }
    }

    const synced = results.filter(r => r.status === 'ok').length
    const staged = results.reduce((n, r) => n + (Number(r.items) || 0), 0)
    return jsonResponse({
      success: true, dry_run: dryRun,
      merchants: results.length, synced, remaining,
      budget_ms_used: Date.now() - runStarted,
      items: staged, items_processed: staged, items_succeeded: staged,
      items_failed: results.filter(r => r.status === 'error').length,
      results,
    }, 200, req)
  } catch (error) {
    return errorResponse((error as Error).message, 500, req)
  }
}))
