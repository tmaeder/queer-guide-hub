// news-link-checker — dead-link liveness sweep for live news articles.
//
// Probes article URLs (HEAD→GET, 404/410-only = dead, per _shared/link-health),
// writes a `link_health` signal to news_quality_signals (1=alive, 0=dead), and
// flags confirmed-dead articles needs_attention=true. Conservative by design:
// 401/403/405/429 are bot-walls (alive), network errors are transient — neither
// demotes. Feeds run_news_trust_recompute via the link_health signal.
//
// Auth: x-internal-secret (cron) or admin/service-role (manual).
// Body: { batch_limit?, dry_run?, concurrency? }.

import { getCorsHeaders, getServiceClient, requireInternalOrAdmin, jsonResponse } from '../_shared/supabase-client.ts'
import { probeLink, isDeadLink } from '../_shared/link-health.ts'

const DEFAULT_BATCH_LIMIT = 80
const DEFAULT_CONCURRENCY = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: getCorsHeaders(req) })

  const supabase = getServiceClient()
  const auth = await requireInternalOrAdmin(req, supabase)
  if (auth instanceof Response) return auth

  try {
    const body = await req.json().catch(() => ({}))
    const batchLimit  = Math.min(300, Math.max(1, body.batch_limit ?? DEFAULT_BATCH_LIMIT))
    const concurrency = Math.min(12, Math.max(1, body.concurrency ?? DEFAULT_CONCURRENCY))
    const dryRun      = body.dry_run === true

    // Stalest-first: never-checked, then oldest last_verified_at. Only real URLs.
    const { data: rows, error } = await supabase
      .from('news_articles')
      .select('id, url, last_verified_at')
      .is('duplicate_of_id', null)
      .not('url', 'is', null)
      .like('url', 'http%')
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .limit(batchLimit)
    if (error) return jsonResponse({ success: false, error: error.message }, 500, req)
    if (!rows || rows.length === 0) return jsonResponse({ success: true, items: 0, message: 'nothing to check' }, 200, req)

    let alive = 0, dead = 0, checked = 0
    const deadIds: string[] = []
    const signals: { article_id: string; signal_type: string; value: number; source: string; details: Record<string, unknown> }[] = []

    const checkOne = async (row: { id: string; url: string }) => {
      const status = await probeLink(row.url, { timeoutMs: 8000 })
      checked++
      const isDead = isDeadLink(status)
      if (isDead) { dead++; deadIds.push(row.id) } else { alive++ }
      signals.push({
        article_id: row.id,
        signal_type: 'link_health',
        value: isDead ? 0 : 1,
        source: 'news-link-checker',
        details: { status },
      })
    }

    for (let i = 0; i < rows.length; i += concurrency) {
      await Promise.all(rows.slice(i, i + concurrency).map(checkOne))
    }

    if (!dryRun) {
      // Append signals (drives trust recompute).
      if (signals.length > 0) {
        await supabase.from('news_quality_signals').insert(signals)
      }
      // Confirmed-dead → flag for human attention. Stamp last_verified_at on all
      // checked rows so the sweep rotates through the corpus.
      if (deadIds.length > 0) {
        await supabase.from('news_articles').update({ needs_attention: true }).in('id', deadIds)
      }
      await supabase.from('news_articles')
        .update({ last_verified_at: new Date().toISOString() })
        .in('id', rows.map((r) => r.id))
    }

    return jsonResponse({
      success: true,
      items: checked,
      checked, alive, dead,
      dead_ids: dead <= 20 ? deadIds : deadIds.slice(0, 20),
      dry_run: dryRun,
    }, 200, req)
  } catch (err) {
    return jsonResponse({ success: false, error: (err as Error).message }, 500, req)
  }
})
