#!/usr/bin/env node
/**
 * Cross-PR migration-version guard (CI; needs the GitHub API).
 *
 * THE HOLE THIS CLOSES, quoted from the guard it sits beside:
 *
 *   "STILL OPEN: a branch that exists only on another machine or only on the
 *    remote. Check 5 is a no-op in CI, where there are no sibling worktrees.
 *    Closing that needs the GitHub API (open PRs and their changed files), a
 *    network dependency this guard deliberately does not have."
 *
 * So this is a SEPARATE script rather than a sixth check inside
 * check-migration-versions.mjs. That file is pure-local by design — it runs in
 * `.husky/pre-push` with no credentials and must stay fast and offline-capable.
 * Bolting a GitHub dependency into it would make the local hook either slow,
 * flaky, or quietly degraded. Two scripts, two dependency profiles.
 *
 * WHAT IT ASKS. For every OTHER open PR, which migration versions does it
 * claim? A version claimed by both this PR and another open one is fatal
 * whichever lands first: `db push` matches by version, so the loser is skipped
 * PERMANENTLY and SILENTLY if the winner applied, or aborts the WHOLE push on
 * schema_migrations_pkey if neither has — stranding every unrelated pending
 * migration in the repo while edge functions still deploy.
 *
 * Measured 2026-09-18/19, which is why this exists: #3778 and #3779
 * independently claimed 99800101100000, and #3783 later picked 99920101100000 —
 * the version #3779 had renumbered TO inside the same hour. Every existing check
 * was green in all three, because none could see the others.
 *
 * FAILS CLOSED, matching the convention of every other gate here: no token, an
 * API error, a rate limit, a truncated file list — none of them report clean.
 * They exit 2 ("could not check"), which the workflow surfaces as a warning,
 * never as a pass. The one thing this must never do is let "could not look"
 * read as "nothing found".
 *
 * REPORTS ONLY, DOES NOT RENUMBER. The fix is one command
 * (`node scripts/next-migration-version.mjs --renumber <file>`) and it is named
 * in the failure output, but which of two PRs should move is a human call.
 *
 * Usage: node scripts/check-open-pr-migrations.mjs [--pr <number>]
 * Env:   GITHUB_TOKEN (or GH_TOKEN), GITHUB_REPOSITORY (owner/repo)
 */

import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { versionsOf } from './lib/migration-versions.mjs'

const MIGRATIONS_DIR = 'supabase/migrations'
const BASE_REF = process.env.MIGRATION_BASE_REF || 'origin/main'
const API = 'https://api.github.com'

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY

/** Exit 2 = could not check. Never 0 — that would read as clean. */
function cannotCheck(why) {
  console.error(`⚠ cross-PR migration check could not run: ${why}`)
  console.error('  → This is NOT a pass. A version claimed by another open PR would be invisible.')
  process.exit(2)
}

if (!token) cannotCheck('no GITHUB_TOKEN / GH_TOKEN in the environment')
if (!repo) cannotCheck('no GITHUB_REPOSITORY in the environment')

async function gh(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'check-open-pr-migrations',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET ${path} -> ${res.status} ${res.statusText} ${body.slice(0, 200)}`)
  }
  return res.json()
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

/**
 * Versions this PR introduces — NEW files only.
 *
 * Scoping to new files is what keeps this from failing on every PR: every
 * worktree carries all ~1,800 of main's migrations, so comparing full file
 * lists would report each of them as a cross-PR "collision". Only a version
 * this branch ADDS can collide with a version another branch ADDS.
 */
function ourNewVersions() {
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  if (!git(['rev-parse', '--verify', '--quiet', `${BASE_REF}^{commit}`])) {
    cannotCheck(`base ref "${BASE_REF}" is not resolvable — cannot tell which files are new`)
  }
  const listed = git(['ls-tree', '-r', '--name-only', BASE_REF, '--', MIGRATIONS_DIR])
  if (listed === null) cannotCheck(`could not list ${MIGRATIONS_DIR} at ${BASE_REF}`)
  const base = new Set(
    listed
      .split('\n')
      .filter((p) => p.endsWith('.sql'))
      .map((p) => p.slice(MIGRATIONS_DIR.length + 1)),
  )
  const added = all.filter((f) => !base.has(f))
  return new Map(added.map((f) => [f.match(/^(\d{14})_/)?.[1], f]).filter(([v]) => v))
}

/** This PR's number, from --pr, GITHUB_REF, or the event payload. */
function selfPrNumber() {
  const i = process.argv.indexOf('--pr')
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1])
  const m = String(process.env.GITHUB_REF || '').match(/^refs\/pull\/(\d+)\//)
  return m ? Number(m[1]) : null
}

const ours = ourNewVersions()
if (ours.size === 0) {
  console.log('✓ this branch adds no migrations — nothing to compare against open PRs.')
  process.exit(0)
}

const self = selfPrNumber()
let prs
try {
  // 100 per page, up to 3 pages. A repo with >300 open PRs would silently
  // truncate, so the cap is enforced rather than assumed — see below.
  prs = []
  for (let page = 1; page <= 3; page++) {
    const batch = await gh(`/repos/${repo}/pulls?state=open&per_page=100&page=${page}`)
    prs.push(...batch)
    if (batch.length < 100) break
    if (page === 3 && batch.length === 100) {
      cannotCheck('more than 300 open PRs — the listing is truncated, so a collision could hide')
    }
  }
} catch (e) {
  cannotCheck(e.message)
}

const collisions = []
for (const pr of prs) {
  if (self !== null && pr.number === self) continue
  let files
  try {
    // A PR touching >3000 files is a different problem; 300 covers every real
    // migration PR here and the `truncated` guard below makes the limit honest
    // rather than silent.
    files = []
    for (let page = 1; page <= 3; page++) {
      const batch = await gh(`/repos/${repo}/pulls/${pr.number}/files?per_page=100&page=${page}`)
      files.push(...batch)
      if (batch.length < 100) break
      if (page === 3 && batch.length === 100) {
        cannotCheck(`PR #${pr.number} changes more than 300 files — its migration list is truncated`)
      }
    }
  } catch (e) {
    // One unreadable PR is enough to hide a collision, so this is not skippable.
    cannotCheck(`could not read files for PR #${pr.number}: ${e.message}`)
  }

  const theirs = versionsOf(
    files
      .filter((f) => f.status !== 'removed' && f.filename.startsWith(`${MIGRATIONS_DIR}/`))
      .map((f) => f.filename.slice(MIGRATIONS_DIR.length + 1)),
  )
  const theirNames = new Map(
    files
      .filter((f) => f.filename.startsWith(`${MIGRATIONS_DIR}/`))
      .map((f) => [f.filename.match(/\/(\d{14})_/)?.[1], f.filename.split('/').pop()])
      .filter(([v]) => v),
  )

  for (const v of new Set(theirs)) {
    if (!ours.has(v)) continue
    // Same FILENAME means the same migration seen twice — this PR is based on
    // or shares a commit with the other. Not a collision.
    if (theirNames.get(v) === ours.get(v)) continue
    collisions.push({
      version: v,
      ourFile: ours.get(v),
      theirFile: theirNames.get(v),
      pr: pr.number,
      title: pr.title,
    })
  }
}

if (collisions.length > 0) {
  console.error(`\n✗ ${collisions.length} migration version(s) also claimed by another open PR:`)
  for (const c of collisions) {
    console.error(
      `  - ${c.version}\n` +
        `      here: ${c.ourFile}\n` +
        `      #${c.pr}: ${c.theirFile} (${c.title})\n` +
        `      → Both cannot apply. \`db push\` matches by VERSION: whichever merges first wins, ` +
        `and the other is either skipped permanently and silently or aborts the entire push on ` +
        `schema_migrations_pkey, stranding every unrelated pending migration in the repo.\n` +
        `      → Fix: node scripts/next-migration-version.mjs --renumber ${MIGRATIONS_DIR}/${c.ourFile}`,
    )
  }
  process.exit(1)
}

console.log(
  `✓ no cross-PR version collisions (${ours.size} new migration(s) vs ${prs.length} open PR(s)).`,
)
