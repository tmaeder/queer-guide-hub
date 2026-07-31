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
 * Without a token (the common local case) it falls back to a DEGRADED check that
 * needs no credentials: every version present at the merge-base with origin/main
 * has, by definition, already been merged and applied to prod, so a version that
 * the working tree no longer has a file for is the same remote-only drift — just
 * self-inflicted (a delete or a rename of an already-applied migration). The
 * merge-base, not origin/main's tip, is the baseline on purpose: comparing against
 * the tip flags every migration merged while your branch was open.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  personal/CI access token (also read from .env.local/.env);
 *                          without it the degraded merge-base check runs instead
 *   SUPABASE_PROJECT_REF   (default xqeacpakadqfxjxjcewc)
 *
 * Usage: node scripts/check-migration-drift.mjs
 * Exit:  0 = no drift
 *        1 = drift — a version has been applied that the repo has no file for
 *        2 = could not check at all (no token AND no git baseline)
 *        3 = wanted the remote check but the API failed / no token; a degraded
 *            merge-base check ran and was clean. Callers that must not block on a
 *            network blip (the pre-push hook) treat this as a warning.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const MIGRATIONS_DIR = 'supabase/migrations'
const VERSION_RE = /^(\d{14})_.+\.sql$/
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'xqeacpakadqfxjxjcewc'
// The all-zeros row is the CLI's schema baseline; it never has a repo file.
const BASELINE = new Set(['00000000000000'])

/** Token from the environment, else from an uncommitted .env file. */
function resolveToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    const m = readFileSync(file, 'utf8').match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$/m)
    if (m) return m[1].replace(/^["']|["']$/g, '')
  }
  return null
}

const TOKEN = resolveToken()

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

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

/**
 * Degraded, credential-free baseline: the versions committed at the merge-base
 * with the upstream default branch. Everything there is already merged, so it is
 * already in remote history. Returns null when there is no usable git baseline.
 */
function mergeBaseVersions() {
  let base
  for (const ref of ['origin/main', 'main']) {
    try {
      base = git(['merge-base', 'HEAD', ref]).trim()
      if (base) break
    } catch {
      /* ref missing (shallow clone, no remote) — try the next one */
    }
  }
  if (!base) return null
  const out = git(['ls-tree', '-r', '--name-only', base, '--', MIGRATIONS_DIR])
  const versions = new Set()
  for (const line of out.split('\n')) {
    const m = line.split('/').pop()?.match(VERSION_RE)
    if (m) versions.add(m[1])
  }
  return versions.size > 0 ? versions : null
}

const repo = repoVersions()

let applied = null
let degraded = null // set to the reason the remote check did not run

if (TOKEN) {
  try {
    applied = await remoteVersions()
  } catch (err) {
    degraded = `remote query failed — ${err.message.split('\n')[0]}`
  }
} else {
  degraded = 'SUPABASE_ACCESS_TOKEN is not set'
}

if (!applied) {
  applied = mergeBaseVersions()
  if (!applied) {
    console.error(`✗ cannot check migration drift: ${degraded}, and no git baseline to fall back on.`)
    process.exit(2)
  }
}

const missing = [...applied].filter((v) => !repo.has(v)).sort()

if (missing.length > 0) {
  console.error(`\n✗ MIGRATION DRIFT: ${missing.length} applied version(s) have no repo file.`)
  if (degraded) {
    console.error('  (checked against the origin/main merge-base — these are already merged,')
    console.error('   so they are already in remote history. Your tree deleted or renamed them.)')
    console.error('  Restore the file at its EXACT version, or rename it back.\n')
  } else {
    console.error(
      '  These were applied to prod (MCP apply_migration or raw SQL) without committing a file.',
    )
    console.error('  `supabase db push` will SKIP, so merged migrations never apply. Fix each:')
    console.error('  recover the SQL from schema_migrations.statements into')
    console.error('  supabase/migrations/<version>_<name>.sql and commit it (see CLAUDE.md).\n')
  }
  for (const v of missing) console.error(`    - ${v}`)
  process.exit(1)
}

if (degraded) {
  console.log(
    `⚠ remote drift check skipped (${degraded}); ${applied.size} merge-base versions all still present among ${repo.size} repo files`,
  )
  process.exit(3)
}

console.log(
  `✓ no migration drift (${applied.size} remote versions all present among ${repo.size} repo files)`,
)
