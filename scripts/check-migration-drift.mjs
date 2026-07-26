#!/usr/bin/env node
/**
 * Migration DRIFT monitor (remote-aware — needs SUPABASE_ACCESS_TOKEN).
 *
 * The failure mode this catches: a migration applied straight to prod via MCP
 * `apply_migration` (which stamps its OWN call-time version) or via raw
 * Management-API SQL, WITHOUT committing a matching `supabase/migrations/<version>_*.sql`
 * file. That leaves the remote `schema_migrations` history with a version the repo
 * has no file for. `supabase db push` then SKIPS entirely ("Remote migration
 * versions not found in local migrations directory") and every subsequently merged
 * migration silently never applies to prod. It went unnoticed for days because the
 * only detector was the push-triggered step in deploy-supabase-functions.yml — which
 * fires ONLY when someone pushes a migration change to main.
 *
 * This script compares the remote history against the repo files directly and fails
 * if the remote has any version with no repo file. Run it on a schedule (see
 * .github/workflows/migration-drift-monitor.yml) so drift is caught within hours,
 * regardless of push activity. The complementary pure-local guard
 * (check-migration-versions.mjs) catches duplicate/malformed versions but cannot see
 * remote — this one closes that gap.
 *
 * Detection only (deliberately): remediation stays manual per CLAUDE.md — recover the
 * orphan SQL from `schema_migrations.statements` into a file at its EXACT remote
 * version and commit it (repo == history), or `supabase migration repair` if it was
 * rolled back. Never blindly `db pull`.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  (required)  personal/CI access token
 *   SUPABASE_PROJECT_REF   (default xqeacpakadqfxjxjcewc)
 *
 * Usage: node scripts/check-migration-drift.mjs
 * Exit:  0 = no drift, 1 = drift or hard error, 2 = misconfigured (no token)
 */

import { readdirSync } from 'node:fs'

const MIGRATIONS_DIR = 'supabase/migrations'
const VERSION_RE = /^(\d{14})_.+\.sql$/
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'xqeacpakadqfxjxjcewc'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
// The all-zeros row is the CLI's schema baseline; it never has a repo file.
const BASELINE = new Set(['00000000000000'])

if (!TOKEN) {
  console.error('✗ SUPABASE_ACCESS_TOKEN is not set — cannot query remote migration history.')
  console.error('  Set it (repo secret in CI, or export locally) and re-run.')
  process.exit(2)
}

/** Remote history versions from schema_migrations via the Management API. */
async function remoteVersions() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'select version from supabase_migrations.schema_migrations order by version',
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Management API query failed: ${res.status} ${res.statusText}\n${body}`)
  }
  const body = await res.json()
  // The Management API returns a bare array of row objects; tolerate a
  // {result|rows|data: [...]} wrapper too so a CLI/API revision can't silently
  // turn drift detection into a no-op.
  const rows = Array.isArray(body)
    ? body
    : Array.isArray(body?.result)
      ? body.result
      : Array.isArray(body?.rows)
        ? body.rows
        : Array.isArray(body?.data)
          ? body.data
          : null
  if (!rows) {
    throw new Error(`Unexpected query response shape: ${JSON.stringify(body).slice(0, 200)}`)
  }
  return new Set(rows.map((r) => String(r.version)).filter((v) => v && !BASELINE.has(v)))
}

/** 14-digit versions of the migration files committed in the repo. */
function repoVersions() {
  const out = new Set()
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    const m = f.match(VERSION_RE)
    if (m) out.add(m[1])
  }
  return out
}

const remote = await remoteVersions()
const repo = repoVersions()

const remoteOnly = [...remote].filter((v) => !repo.has(v)).sort()

if (remoteOnly.length > 0) {
  console.error(
    `\n✗ MIGRATION DRIFT: ${remoteOnly.length} remote version(s) have no repo file.`,
  )
  console.error(
    '  These were applied to prod (MCP apply_migration or raw SQL) without committing a file.',
  )
  console.error('  `supabase db push` will SKIP, so merged migrations never apply. Fix each:')
  console.error('  recover the SQL from schema_migrations.statements into')
  console.error('  supabase/migrations/<version>_<name>.sql and commit it (see CLAUDE.md).\n')
  for (const v of remoteOnly) console.error(`    - ${v}`)
  process.exit(1)
}

console.log(
  `✓ no migration drift (${remote.size} remote versions all present among ${repo.size} repo files)`,
)
