#!/usr/bin/env node
/**
 * One-shot backfill: rewrite every stored phone on venues / organizations /
 * hotels into E.164 (+<calling code><number>, no separators).
 *
 * The conversion itself lives in the database (canonicalize_phone() +
 * phone_canonical_guard, migration 99991790877996); this script only pages
 * public.run_phone_canonical_backfill() through each table in batches, because
 * a venues UPDATE runs the spine/search chain per row and one big statement
 * would hold row locks for ~15 s. New writes need nothing — the trigger formats
 * them as they land — so this runs once and is safe to re-run (rows already in
 * canonical form are skipped).
 *
 * Numbers that cannot be converted are cleared from `phone`; the original is
 * kept at enrichment_status.phone_rejected {raw, reason, country, at}.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/data-quality/backfill-phone-canonical.mjs [--batch 300]
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(2)
}

const args = process.argv.slice(2)
const batchIdx = args.indexOf('--batch')
const BATCH = batchIdx >= 0 ? Number(args[batchIdx + 1]) : 300

async function rpc(name, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

for (const table of ['hotels', 'organizations', 'venues']) {
  let after = null
  let updated = 0
  let batches = 0
  for (;;) {
    const r = await rpc('run_phone_canonical_backfill', { p_table: table, p_after: after, p_batch: BATCH })
    if (r.done) break
    updated += r.updated
    batches += 1
    after = r.next
  }
  console.log(`${table}: ${updated} rewritten over ${batches} batches`)
}

const sig = await rpc('phone_format_signals', {})
console.log(JSON.stringify(sig.tables, null, 2))
const bad = Object.values(sig.tables ?? {}).reduce((n, t) => n + Number(t.non_e164 ?? 0), 0)
if (bad > 0) {
  console.error(`✗ ${bad} phone values are still not E.164`)
  process.exit(1)
}
console.log('✓ every stored phone is E.164')
