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
