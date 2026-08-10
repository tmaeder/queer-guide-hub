#!/usr/bin/env node
/**
 * Migration-version guard (CI, pure-local — no DB, no secrets).
 *
 * Two things break `supabase db push` and have repeatedly regressed this repo:
 *
 *   1. Duplicate 14-digit versions across two migration files. `db push`
 *      matches files to remote history by version; duplicates break that
 *      matching globally (the failure PR #1553 fixed on 2026-06-10 — and which
 *      has since crept back in via concurrent feature merges).
 *   2. Malformed migration filenames (not `<14 digits>_<name>.sql`).
 *
 * This guard fails a PR that *introduces or widens* a duplicate version, or adds
 * a malformed filename. Pre-existing duplicates (files already on the base ref)
 * are reported as warnings and grandfathered, so legacy debt is visible without
 * blocking unrelated PRs — clean it up in a dedicated pass, then the warnings go
 * away. A within-PR collision (two newly-added files sharing a version, or a new
 * file colliding with an existing one) is a hard error.
 *
 * Base ref: $MIGRATION_BASE_REF (default `origin/main`). If it can't be
 * resolved (e.g. a shallow checkout without the base), every file is treated as
 * "new" so within-tree duplicates still fail — fail-closed, never silently green.
 *
 * Usage: node scripts/check-migration-versions.mjs
 */

import { readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fetchRemoteVersions } from './lib/remote-migrations.mjs'

const MIGRATIONS_DIR = 'supabase/migrations'
const VERSION_RE = /^(\d{14})_.+\.sql$/
const BASE_REF = process.env.MIGRATION_BASE_REF || 'origin/main'

/** Migration .sql basenames present at the base ref (empty if unresolvable). */
function baseFiles() {
  try {
    execSync(`git rev-parse --verify --quiet ${BASE_REF}^{commit}`, { stdio: 'ignore' })
  } catch {
    console.log(`ℹ base ref "${BASE_REF}" not resolvable — treating all files as new (fail-closed).`)
    return null
  }
  try {
    const out = execSync(`git ls-tree -r --name-only ${BASE_REF} -- ${MIGRATIONS_DIR}`, {
      encoding: 'utf8',
    })
    return new Set(
      out
        .split('\n')
        .filter((p) => p.endsWith('.sql'))
        .map((p) => p.slice(MIGRATIONS_DIR.length + 1)),
    )
  } catch {
    return null
  }
}

const base = baseFiles()
const isNew = (file) => base === null || !base.has(file)

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

const errors = []
const warnings = []
/** Versions below max that are already in remote history — reported, never fatal. */
const applied = []

// 1) Filename format — only enforced on newly added files (don't retroactively
//    fail PRs for historical naming).
for (const f of files) {
  if (!VERSION_RE.test(f) && isNew(f)) {
    errors.push(`malformed migration filename (expected <14 digits>_<name>.sql): ${f}`)
  }
}

// 2) Duplicate versions.
const byVersion = new Map()
for (const f of files) {
  const m = f.match(VERSION_RE)
  if (!m) continue
  const v = m[1]
  if (!byVersion.has(v)) byVersion.set(v, [])
  byVersion.get(v).push(f)
}

for (const [version, group] of byVersion) {
  if (group.length < 2) continue
  const newOnes = group.filter(isNew)
  const line = `version ${version} shared by ${group.length} files: ${group.join(', ')}`
  if (newOnes.length > 0) {
    errors.push(
      `${line}\n    → ${newOnes.length} of these are new on this branch (${newOnes.join(', ')}). ` +
        `Give each migration a unique 14-digit version.`,
    )
  } else {
    warnings.push(`${line}  (pre-existing — grandfathered; clean up in a dedicated pass)`)
  }
}

// 3) Out-of-order versions. A migration whose version sorts BELOW the newest
//    one remote history already holds makes `db push` abort with "local
//    migration files to be inserted before the last migration on remote" — and
//    it aborts on the FIRST such file, taking every later migration in the same
//    PR down with it, valid ones included. (Distinct from a DUPLICATE version,
//    which is skipped silently; that is check 2 above.)
//
//    This repo makes that the default outcome rather than a rare race:
//    measured 2026-08-06, 43 migrations are stamped ahead of wall-clock and
//    remote max is 20260815110000 — NINE DAYS in the future. So any migration
//    written this week with a natural timestamp is born invalid. Catching it
//    here turns a failed deploy on main into a failed check on the PR.
//
//    Compare against the highest PRE-EXISTING version: remote history and the
//    base ref agree once CI has pushed main, and this stays pure-local.
if (base !== null) {
  const baseVersions = files
    .filter((f) => !isNew(f))
    .map((f) => f.match(VERSION_RE)?.[1])
    .filter(Boolean)
  const maxBase = baseVersions.length > 0 ? baseVersions.reduce((a, b) => (a > b ? a : b)) : null

  if (maxBase) {
    // A version that is ALREADY in remote history is exempt. `db push` matches
    // files to history by version and SKIPS the ones already applied — it only
    // aborts on an unapplied file that sorts too low. Without this exemption the
    // check contradicts the documented recovery for an MCP-applied migration
    // ("commit the file with the SAME version — CI then skips it"): apply via
    // MCP, which stamps the version from the CALL time, and on a repo whose
    // migrations are future-dated the recovered file is born below max. The
    // drift check then demands the file and this check refuses it — the two
    // gates deadlock and NOTHING can merge, which is exactly what happened on
    // 2026-08-10 with 20260810075202_drop_unused_indexes.
    let remote = null
    try {
      remote = await fetchRemoteVersions()
    } catch (e) {
      // Reachability failure is NOT "nothing is applied". Say so and stay strict.
      console.log(`⚠ could not read remote migration history (${e.message.split('\n')[0]});`)
      console.log('  no version is treated as already-applied, so a legitimate recovery may fail here.')
    }

    for (const f of files) {
      const v = f.match(VERSION_RE)?.[1]
      if (!v || !isNew(f)) continue
      if (v > maxBase) continue

      if (remote?.has(v)) {
        applied.push(
          `version ${v} (${f}) sorts below ${maxBase} but is ALREADY APPLIED to prod — ` +
            `db push will skip it, not abort. Committing it at this exact version is the ` +
            `correct recovery for an MCP-applied migration.`,
        )
        continue
      }

      errors.push(
        `version ${v} (${f}) is not above the highest existing version ${maxBase}.\n` +
          `    → \`supabase db push\` aborts on the first migration that sorts below ` +
          `remote history ("local migration files to be inserted before the last ` +
          `migration on remote"), taking every later migration in the same PR with it. ` +
          `Rename this file to a version greater than ${maxBase}.` +
          (remote
            ? ''
            : `\n    → Remote history was unreadable, so an already-applied version could ` +
              `not be exempted. If this migration IS applied to prod, set ` +
              `SUPABASE_ACCESS_TOKEN and re-run.`),
      )
    }
  }
}

if (applied.length > 0) {
  console.log(`✓ ${applied.length} already-applied version(s) exempted from the ordering rule:`)
  for (const a of applied) console.log(`  - ${a}`)
}

if (warnings.length > 0) {
  console.log(`⚠ ${warnings.length} pre-existing duplicate-version group(s):`)
  for (const w of warnings) console.log(`  - ${w}`)
}

if (errors.length > 0) {
  console.error(`\n✗ ${errors.length} migration-version problem(s) introduced by this branch:`)
  for (const e of errors) console.error(`  - ${e}`)
  console.error(
    '\nDuplicate versions break `supabase db push` file↔history matching (see PR #1553). ' +
      'Rename so every migration has a unique version.',
  )
  process.exit(1)
}

console.log(`✓ migration versions OK (${files.length} files, ${byVersion.size} unique versions)`)
