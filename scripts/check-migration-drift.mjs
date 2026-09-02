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

// version -> the `name` remote history recorded for it. Populated ONLY on the
// token path; the git fallback knows versions and nothing else, so the name
// check below is skipped when degraded rather than guessing.
const remoteNames = new Map()

// A migration applied via MCP is stamped with the call time, and the repair-shim
// convention puts the INTENDED version in the name (`20260618100000_foo` in a
// file called `foo.sql`). Stripping a leading 14-digit prefix from both sides is
// what separates that benign shape from a real mismatch: measured on this repo it
// takes the disagreements from 23 to 6, with no allowlist doing the work.
const stripShimPrefix = (s) => s.replace(/^\d{14}_/, '')

// The 6 that survive normalization, recorded 2026-09-02. This list may only
// SHRINK: if a version here stops mismatching, the check fails and tells you to
// delete the entry, so it cannot rot into an allowlist nobody re-reads.
// Three look like genuinely different migrations and are worth a human look —
// the repo file at that version may never have run.
const KNOWN_NAME_MISMATCHES = new Set([
  '20260418101929', // file is the `remote_applied` recovery placeholder
  '20260530130000', // remote personality_tag_cron vs file news_feedback_events_spine — investigate
  '20260601072108', // …_admincheck_fix vs … — same work, renamed
  '20260619180000', // remote extract_worker_circuit_breakers vs file search_documents_… — investigate
  '20260704102951', // …_and_facets vs …_functions — same work, renamed
])

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
          'select version, name from supabase_migrations.schema_migrations order by version',
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
  for (const r of rows) {
    const v = String(r.version)
    if (v && !BASELINE.has(v)) remoteNames.set(v, String(r.name ?? ''))
  }
  return new Set(rows.map((r) => String(r.version)).filter((v) => v && !BASELINE.has(v)))
}

/** version -> the name part of each committed file at that version. */
function repoFileNames() {
  const out = new Map()
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    const m = f.match(VERSION_RE)
    if (!m) continue
    const name = f.replace(/^\d{14}_/, '').replace(/\.sql$/, '')
    if (!out.has(m[1])) out.set(m[1], [])
    out.get(m[1]).push(name)
  }
  return out
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

// SECOND FAILURE MODE, and the one the version check structurally cannot see:
// the version IS applied and a repo file DOES exist at it, but remote recorded a
// DIFFERENT name — meaning some other file claimed that version and the one in
// the tree never ran. That is the state a merge-time version collision leaves
// behind (PRs #3275/#3276, 2026-09-02): `select count(*) ... where version=…`
// returns 1 and reads exactly like success. Comparing `name` is the only way to
// tell your migration ran from someone else's having run instead.
//
// Only meaningful on the token path: the git fallback has no names.
if (!degraded && remoteNames.size > 0) {
  const repoNames = repoFileNames()
  const mismatched = []
  const staleBaseline = []
  for (const [version, remoteName] of remoteNames) {
    const files = repoNames.get(version)
    if (!remoteName || !files || files.length !== 1) continue // empty name predates name recording
    const agrees = stripShimPrefix(remoteName) === stripShimPrefix(files[0])
    if (!agrees && !KNOWN_NAME_MISMATCHES.has(version)) {
      mismatched.push(`${version}  remote='${remoteName}'  file='${files[0]}'`)
    } else if (agrees && KNOWN_NAME_MISMATCHES.has(version)) {
      staleBaseline.push(version)
    }
  }

  if (mismatched.length > 0) {
    console.error(`\n✗ APPLIED UNDER ANOTHER NAME: ${mismatched.length} version(s).`)
    console.error('  The version is in schema_migrations, so every count-by-version check')
    console.error('  reads as applied — but remote recorded a different file. The file in')
    console.error('  the tree at that version NEVER RAN. Usually a merge-time version')
    console.error('  collision: two PRs chose one version, the loser was skipped.')
    console.error('  Fix: rename the file that never ran to a version above the current max')
    console.error('  (safe precisely because it never applied), then let it deploy.\n')
    for (const line of mismatched) console.error(`    - ${line}`)
    process.exit(1)
  }

  if (staleBaseline.length > 0) {
    console.error(`\n✗ KNOWN_NAME_MISMATCHES is stale: ${staleBaseline.length} entr(ies) now agree.`)
    console.error('  Delete them from scripts/check-migration-drift.mjs so the list cannot')
    console.error('  rot into an allowlist nobody re-reads.\n')
    for (const v of staleBaseline) console.error(`    - ${v}`)
    process.exit(1)
  }
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
