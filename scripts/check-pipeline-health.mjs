#!/usr/bin/env node
/**
 * Nightly pipeline health check.
 * Called by .github/workflows/pipeline-health.yml
 * Exit 1 if any enabled pipeline only failed (no completions) in last 24h.
 */

const BASE = process.env.SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!BASE || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const since = new Date(Date.now() - 86400_000).toISOString()

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

// 2. Recent runs
const runs = await get(`pipeline_runs?created_at=gte.${encodeURIComponent(since)}&select=pipeline_name,status`)
const completed = new Set(runs.filter(r => r.status === 'completed').map(r => r.pipeline_name))
const failed    = new Set(runs.filter(r => r.status === 'failed').map(r => r.pipeline_name))
const onlyFailed = [...failed].filter(n => !completed.has(n))

console.log(`✓ Pipelines completed in last 24h: ${[...completed].join(', ') || 'none'}`)

if (onlyFailed.length > 0) {
  console.error(`✗ Pipelines with ONLY failures in last 24h: ${onlyFailed.join(', ')}`)
  process.exit(1)
}

// 3. Expected pipelines ran
const expected = [
  'news-ingestion', 'venue-ingestion-unified', 'events-ingestion-bulletproof',
  'marketplace-ingestion', 'personality-ingestion', 'hotel-ingestion-pipeline',
]
// Weekly pipelines won't run daily — only check if they appear
const missing = expected.filter(n => runs.length > 0 && !completed.has(n) && !failed.has(n))
if (missing.length > 0) {
  console.warn(`⚠ Expected pipelines with no runs in 24h: ${missing.join(', ')}`)
}

console.log('✓ Pipeline health check passed')
