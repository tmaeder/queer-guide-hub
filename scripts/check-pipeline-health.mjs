#!/usr/bin/env node
/**
 * Nightly pipeline health check.
 * Called by .github/workflows/pipeline-health.yml
 * Exit 1 if any enabled pipeline only failed (no completions) in last 24h.
 */

const BASE = process.env.SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping pipeline health check')
  process.exit(0)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const since24h  = new Date(Date.now() - 86400_000).toISOString()
const since7d   = new Date(Date.now() - 7 * 86400_000).toISOString()

async function get(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json()
}

// 1. Open alerts
const alerts = await get('pipeline_health_alerts?resolved_at=is.null&select=kind,subject,first_seen_at')
if (alerts.length > 0) {
  console.warn(`⚠ ${alerts.length} open health alert(s):`)
  for (const a of alerts) console.warn(`  - [${a.kind}] ${a.subject} since ${a.first_seen_at}`)
} else {
  console.log('✓ No open health alerts')
}

// 2. Daily pipeline runs (last 24h)
const runs24h = await get(`pipeline_runs?created_at=gte.${encodeURIComponent(since24h)}&select=pipeline_name,status`)
const completed24h = new Set(runs24h.filter(r => r.status === 'completed').map(r => r.pipeline_name))
const failed24h    = new Set(runs24h.filter(r => r.status === 'failed').map(r => r.pipeline_name))
const onlyFailed   = [...failed24h].filter(n => !completed24h.has(n))

console.log(`✓ Pipelines completed in last 24h: ${[...completed24h].join(', ') || 'none'}`)

if (onlyFailed.length > 0) {
  console.error(`✗ Pipelines with ONLY failures in last 24h: ${onlyFailed.join(', ')}`)
  process.exit(1)
}

// 3. Daily pipelines — warn if missing from 24h window
const dailyExpected = [
  'news-ingestion', 'venue-ingestion-unified', 'events-ingestion-bulletproof',
  'marketplace-ingestion', 'personality-ingestion', 'hotel-ingestion-pipeline',
]
const missingDaily = dailyExpected.filter(n => runs24h.length > 0 && !completed24h.has(n) && !failed24h.has(n))
if (missingDaily.length > 0) {
  console.warn(`⚠ Daily pipelines with no runs in 24h: ${missingDaily.join(', ')}`)
}

// 4. Weekly pipelines (city, country, tags) — warn if no run in last 7 days
const runs7d = await get(`pipeline_runs?created_at=gte.${encodeURIComponent(since7d)}&select=pipeline_name,status`)
const completed7d = new Set(runs7d.filter(r => r.status === 'completed').map(r => r.pipeline_name))
const weeklyExpected = ['city-ingestion', 'country-ingestion', 'tags-ingestion']
const missingWeekly = weeklyExpected.filter(n => !completed7d.has(n))
if (missingWeekly.length > 0) {
  console.warn(`⚠ Weekly pipelines with no completed run in 7 days: ${missingWeekly.join(', ')}`)
} else {
  console.log(`✓ Weekly pipelines completed in last 7 days: ${weeklyExpected.join(', ')}`)
}

// 5. Cron + staging hygiene (P0 simplification guards, 2026-07-26)
const hygieneRes = await fetch(`${BASE}/rest/v1/rpc/pipeline_hygiene_stats`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!hygieneRes.ok) {
  console.warn(`⚠ pipeline_hygiene_stats → HTTP ${hygieneRes.status} (RPC missing?)`)
} else {
  const hygiene = await hygieneRes.json()
  const legacy = hygiene.legacy_cron_jobs ?? []
  if (legacy.length > 0) {
    console.error(`✗ Legacy pipeline crons resurrected: ${legacy.join(', ')}`)
    process.exit(1)
  }
  if ((hygiene.i18n_percombo_cron_count ?? 0) > 0) {
    console.error(`✗ Per-combo i18n crons re-appeared (${hygiene.i18n_percombo_cron_count}) — the i18n_translation_dispatch job replaced them`)
    process.exit(1)
  }
  const pending = hygiene.staging_pending_review ?? 0
  if (pending > 5000) {
    console.error(`✗ ingestion_staging pending_review backlog at ${pending} (limit 5000) — auto-triage sweeps are falling behind`)
    process.exit(1)
  }
  const unregistered = hygiene.unregistered_cron_jobs ?? []
  if (unregistered.length > 0) {
    console.error(`✗ Cron jobs with no admin_automations registry row: ${unregistered.join(', ')} — register them (P1 registry-of-record policy)`)
    process.exit(1)
  }
  // Starved-path sentinel (overhaul P2): rows stuck mid-pipeline >48h. Live
  // baseline at introduction was ~2.8k (news ~1.9k, marketplace ~0.9k, oldest
  // from June) — thresholds sit above that so only NEW starvation fails.
  const stale = hygiene.stale_pending_by_entity ?? {}
  const staleTotal = Object.values(stale).reduce((a, b) => a + Number(b), 0)
  const staleWorst = Object.entries(stale).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
  if ((staleWorst && Number(staleWorst[1]) > 5000) || staleTotal > 10000) {
    console.error(`✗ Staging starvation: ${staleTotal} rows pending >48h (${JSON.stringify(stale)}) — a drain/fill path is dead`)
    process.exit(1)
  }
  if (staleTotal > 3500) {
    console.warn(`⚠ Staging stale-pending rising: ${staleTotal} rows >48h (${JSON.stringify(stale)})`)
  }
  console.log(`✓ Cron hygiene clean (${hygiene.cron_total} active jobs); staging pending_review=${pending}, stale_pending=${staleTotal}`)
}

// 6. Search reindex queue (P1 overhaul, 2026-08): entity writes enqueue here;
//    search_reindex_drain applies them every minute. A deep AND old queue means
//    the drain is broken — search results are then frozen at their last index.
{
  const res = await fetch(`${BASE}/rest/v1/search_reindex_queue?select=created_at&order=id.asc&limit=1`, {
    headers: { ...headers, Prefer: 'count=exact' },
  })
  if (!res.ok) {
    console.warn(`⚠ search_reindex_queue probe → HTTP ${res.status} (pre-P1 schema?)`)
  } else {
    const depth = Number(res.headers.get('content-range')?.split('/')[1] ?? 0)
    const rows = await res.json()
    const oldestMin = rows.length ? (Date.now() - new Date(rows[0].created_at).getTime()) / 60000 : 0
    if (depth > 25000 && oldestMin > 60) {
      console.error(`✗ search_reindex_queue stuck: depth=${depth}, oldest=${oldestMin.toFixed(0)}min — drain cron broken?`)
      process.exit(1)
    }
    if (depth > 5000 || oldestMin > 15) {
      console.warn(`⚠ search_reindex_queue busy: depth=${depth}, oldest=${oldestMin.toFixed(0)}min (backfill in flight is normal)`)
    } else {
      console.log(`✓ search reindex queue healthy (depth=${depth})`)
    }
  }
}

console.log('✓ Pipeline health check passed')
