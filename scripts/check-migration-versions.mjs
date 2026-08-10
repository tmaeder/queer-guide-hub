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

import { readdirSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

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
//
//    ONE EXEMPTION — drift recovery. When a migration is applied live (Supabase
//    MCP `apply_migration`) and its file never reaches main, prod holds a version
//    with no repo file, and `check-migration-drift.mjs` then fails EVERY pull
//    request in the repo until that file is committed AT THAT EXACT VERSION. If
//    the version sorts below remote max, the two guards deadlock: drift demands
//    the file, this check forbids it, and renaming it upward would re-break the
//    file↔history match that drift is protecting. (Lived it 2026-08-10: version
//    20260810075202 was applied live and stranded in draft PR #2680, blocking
//    #2681 and #2672 as collateral.)
//
//    The premise above does not hold for such a file — prod has already applied
//    it, so `db push` never tries to insert it and has nothing to abort on. A
//    file may declare itself that case with a header line naming its OWN version:
//
//      -- drift-recovery: version 20260810075202 is already recorded in remote schema_migrations.
//
//    The version in the marker must equal the version in the filename, so the
//    marker cannot be copy-pasted onto an unrelated out-of-order migration. It
//    downgrades to a warning — visible, never silent.
const DRIFT_RECOVERY_RE = /^--\s*drift-recovery:\s*version\s*(\d{14})\b/im
function declaresDriftRecovery(file, version) {
  try {
    const src = readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
    return src.match(DRIFT_RECOVERY_RE)?.[1] === version
  } catch {
    return false
  }
}

if (base !== null) {
  const baseVersions = files
    .filter((f) => !isNew(f))
    .map((f) => f.match(VERSION_RE)?.[1])
    .filter(Boolean)
  const maxBase = baseVersions.length > 0 ? baseVersions.reduce((a, b) => (a > b ? a : b)) : null

  if (maxBase) {
    for (const f of files) {
      const v = f.match(VERSION_RE)?.[1]
      if (!v || !isNew(f)) continue
      if (v <= maxBase) {
        if (declaresDriftRecovery(f, v)) {
          warnings.push(
            `version ${v} (${f}) sorts below the highest existing version ${maxBase}, but ` +
              `declares itself a drift recovery — prod already applied this version, so ` +
              `\`db push\` will not try to insert it.`,
          )
          continue
        }
        errors.push(
          `version ${v} (${f}) is not above the highest existing version ${maxBase}.\n` +
            `    → \`supabase db push\` aborts on the first migration that sorts below ` +
            `remote history ("local migration files to be inserted before the last ` +
            `migration on remote"), taking every later migration in the same PR with it. ` +
            `Rename this file to a version greater than ${maxBase}.`,
        )
      }
    }
  }
}

if (warnings.length > 0) {
  console.log(`⚠ ${warnings.length} grandfathered / exempted version issue(s):`)
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
