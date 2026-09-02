#!/usr/bin/env node
/**
 * Recover migrations that are APPLIED to prod but have no repo file.
 *
 * WHY THIS EXISTS
 *
 * MCP `apply_migration` stamps a version from its own call time and commits
 * nothing. The follow-up commit is a separate, easily-skipped step, and skipping
 * it is not a private mistake: `check-migration-versions.mjs` fails on any
 * applied version with no repo file, and it runs on EVERY pr — so one uncommitted
 * migration reds a TypeScript-only change that never touched SQL. `db push` on
 * main separately refuses with "Remote migration versions not found in local
 * migrations directory", so nothing deploys either.
 *
 * On 2026-08-29 that happened FIVE times in one day. Each one halted the whole
 * repo's CI until a human noticed and hand-recovered it. The recovery is
 * entirely mechanical — read the recorded SQL, write it to a file at the exact
 * version, verify it survived transport — which is precisely the shape of thing
 * that should not depend on who happens to look at a red check first.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not push to main and it does not merge. It writes files and stops;
 * the workflow opens a PR. Recovering SQL out of prod and into the repo's
 * permanent history is a content change, and the reviewer needs to see what the
 * migration actually did — not least because a migration that landed via MCP
 * skipped review once already.
 *
 * It also never INVENTS content. If the digest does not match, that version is
 * skipped and reported. A plausible-looking file at the right version is worse
 * than a missing one: the missing one keeps failing loudly until fixed, while a
 * corrupted one passes every check and silently misrepresents what ran.
 *
 * IT CHAINS, SO IT RECOVERS ALL OF THEM AT ONCE
 *
 * `db push` reports only that SOME remote version is missing, not which or how
 * many, so hand-recovery is iterative: each orphan is invisible until the
 * previous one lands. On 2026-08-29 four were found that way, one at a time,
 * across hours. This enumerates the whole set in one pass.
 *
 * USAGE
 *   node scripts/recover-migration-drift.mjs            # report only
 *   node scripts/recover-migration-drift.mjs --write    # write the files
 *
 * Needs SUPABASE_ACCESS_TOKEN. Without it the script FAILS rather than
 * reporting a clean tree — "could not look" is not "nothing found".
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  BASELINE,
  buildRecoveredSql,
  fetchMigrationBodies,
  fetchRemoteVersions,
  normalizeMigrationName,
  resolveToken,
} from './lib/remote-migrations.mjs'

const MIGRATIONS_DIR = 'supabase/migrations'
const WRITE = process.argv.includes('--write')

const md5 = (s) => createHash('md5').update(s, 'utf8').digest('hex')

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/** Versions that already have a file on disk. */
function repoVersions() {
  const set = new Set()
  if (!existsSync(MIGRATIONS_DIR)) return set
  for (const f of readdirSync(MIGRATIONS_DIR)) {
    const m = f.match(/^(\d{14})_.*\.sql$/)
    if (m) set.add(m[1])
  }
  return set
}

/**
 * A file for this version on SOME branch, if one exists.
 *
 * This is the case where the author did write the migration and it is simply
 * not on main yet — a stranded branch, or a rename that lost the applied
 * version. Recovering from their commit keeps the real file, comments and all.
 *
 * Reconstructing from `statements` instead would produce a DIFFERENT file that
 * is equally valid SQL: `statements` holds the parsed statements, so this
 * codebase's long comment headers are gone. Measured once at 6,300 bytes on
 * disk against 5,670 recorded. Preferring the commit keeps the reasoning that
 * makes these migrations reviewable.
 */
function findOnAnyBranch(version) {
  const out = git(['log', '--all', '--diff-filter=A', '--format=%H', '--name-only', '--', `${MIGRATIONS_DIR}/${version}_*.sql`])
  const path = out.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`${MIGRATIONS_DIR}/`))
  if (!path) return null
  const sha = out.split('\n')[0]?.trim()
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return null
  const content = git(['show', `${sha}:${path}`])
  return content ? { path, sha, content } : null
}

const token = resolveToken()
if (!token) {
  console.error('✗ SUPABASE_ACCESS_TOKEN is required.')
  console.error('  Refusing to run: with no token this script cannot tell "no drift" from')
  console.error('  "could not look", and reporting the first when it means the second is how')
  console.error('  drift goes unnoticed in the first place.')
  process.exit(2)
}

const applied = await fetchRemoteVersions(token)
if (applied === null) {
  console.error('✗ Could not read remote migration history.')
  process.exit(2)
}

const repo = repoVersions()
const orphans = [...applied].filter((v) => !repo.has(v) && !BASELINE.has(v)).sort()

if (orphans.length === 0) {
  console.log(`✓ No migration drift (${applied.size} applied, ${repo.size} files).`)
  process.exit(0)
}

console.log(`Found ${orphans.length} applied version(s) with no repo file:\n`)

const bodies = await fetchMigrationBodies(orphans, token)
const recovered = []
const skipped = []

for (const version of orphans) {
  const body = bodies?.get(version)
  if (!body) {
    skipped.push({ version, why: 'no row returned for this version' })
    continue
  }

  const name = normalizeMigrationName(body.name) || 'recovered_migration'
  const file = `${MIGRATIONS_DIR}/${version}_${name}.sql`

  // Prefer the author's own file when it exists on a branch — see findOnAnyBranch.
  const onBranch = findOnAnyBranch(version)
  if (onBranch) {
    recovered.push({ version, file: onBranch.path, source: `commit ${onBranch.sha.slice(0, 9)}`, content: onBranch.content, verified: 'content from the authoring commit' })
    continue
  }

  if (body.statements.length === 0) {
    // An empty `statements` array is NOT proof the migration did nothing — it is
    // what a row recorded by an out-of-band path looks like. Reconstructing an
    // empty file would assert "this migration was a no-op" on no evidence.
    skipped.push({ version, why: 'statements is empty — nothing recorded to recover; needs a human' })
    continue
  }

  // Prove the text survived JSON transport. The server computed this digest
  // over the same join, so a mismatch means corruption, not a content
  // disagreement — and a corrupted migration must never be written.
  const local = md5(body.joined)
  if (body.digest && local !== body.digest) {
    skipped.push({ version, why: `digest mismatch (server ${body.digest}, local ${local}) — refusing to write` })
    continue
  }

  const content = buildRecoveredSql(version, body.statements)
  if (content === null) {
    skipped.push({ version, why: 'statements held nothing usable' })
    continue
  }

  recovered.push({
    version,
    file,
    source: `schema_migrations.statements (${body.statements.length} statement(s))`,
    content,
    verified: body.digest ? `md5 ${local}` : 'no server digest returned',
  })
}

for (const r of recovered) {
  console.log(`  ${r.version}  ->  ${r.file}`)
  console.log(`      source: ${r.source}`)
  console.log(`      verify: ${r.verified}`)
}
for (const s of skipped) {
  console.log(`  ${s.version}  SKIPPED: ${s.why}`)
}

if (!WRITE) {
  console.log('\n(report only — pass --write to create the files)')
  process.exit(recovered.length > 0 || skipped.length > 0 ? 1 : 0)
}

for (const r of recovered) writeFileSync(r.file, r.content)
console.log(`\n✓ Wrote ${recovered.length} file(s).`)

if (skipped.length > 0) {
  console.error(`\n✗ ${skipped.length} version(s) could NOT be recovered automatically:`)
  for (const s of skipped) console.error(`    - ${s.version}: ${s.why}`)
  console.error('  These still need a human. CI stays red until they are resolved.')
  process.exit(1)
}
