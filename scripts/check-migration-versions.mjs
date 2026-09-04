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
 * NO duplicate version is grandfathered any more. Both kinds are hard errors:
 *
 *   - ALREADY IN REMOTE HISTORY. `db push` matches by version and SKIPS an
 *     applied one, so exactly one file of the group ran and the other N-1 are
 *     skipped PERMANENTLY and SILENTLY — no error, no annotation, and nothing
 *     downstream ever reports that their SQL did not execute. Measured
 *     2026-08-29 on 20261011100000: `sweep_skips_namespaced_tags` applied and
 *     `tag_glossary_phase1_hygiene` never did, and this check was green about it
 *     because the pair was old. Reported per-version, not per-file: history
 *     stores the name too, but which file won is not what makes it fatal — that
 *     N-1 lost is.
 *   - NEITHER FILE APPLIED. This was a warning until 2026-08-29, on the
 *     reasoning that it is "loud" because db push aborts on
 *     schema_migrations_pkey. It is loud, and that is not the same as harmless:
 *     the abort takes down the WHOLE push, so every unrelated pending migration
 *     in the repo is stranded while edge functions still deploy and prod runs
 *     new code against the old schema. Measured the same day on 20261012100000
 *     (`sweep_skips_attribute_kind` + `news_vocab_dump_residue`), which stranded
 *     five migrations from an unrelated PR until a file was renamed by hand.
 *
 * The hole this used to leave open, and what closes HALF of it (2026-09-03):
 * a duplicate can exist in NEITHER PR alone and appear only once both land,
 * because `pull_request` CI runs against a merge commit computed before the
 * other PR merged. On main the run that would catch it can also be cancelled by
 * `cancel-in-progress` on the next push.
 *
 * That is not theoretical. FOUR migrations across four worktrees simultaneously
 * claimed 20261211100000 — tag_slug_seal,
 * event_tag_link_reads_approved_aliases, kinktionary_new_terms_sourced,
 * news_commit_requires_a_verdict — and every check here was green in all four,
 * because none could see the other three. The escape each session reaches for
 * compounds it: bump to the next day's `<day>100000` to clear the current max,
 * which becomes the next session's collision. One such bump landed on main under
 * the title "renumber off a collision that landed while this PR sat green".
 *
 * Check 5 closes the CONCURRENT-SESSIONS-ON-ONE-MACHINE half by reading sibling
 * git worktrees directly — where every measured collision in this repo came
 * from. It is fatal only when OUR file is the new one; if ours is already on the
 * base ref the sibling is the tree that must move, and that is reported as a
 * single informational line rather than one per hit (74 of them the first time
 * it ran, almost all from abandoned worktrees).
 *
 * STILL OPEN: a branch that exists only on another machine or only on the
 * remote. Check 5 is a no-op in CI, where there are no sibling worktrees.
 * Closing that needs the GitHub API (open PRs and their changed files), a
 * network dependency this guard deliberately does not have. So a green check
 * still means "no duplicate as of this base and this machine", not "no duplicate
 * after merge" — and if `db push` ever fails on schema_migrations_pkey, look for
 * a version shared by two files before anything else.
 *
 * Base ref: $MIGRATION_BASE_REF (default `origin/main`). If it can't be
 * resolved (e.g. a shallow checkout without the base), every file is treated as
 * "new" so within-tree duplicates still fail — fail-closed, never silently green.
 *
 * Usage: node scripts/check-migration-versions.mjs
 */

import { readdirSync, realpathSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fetchRemoteMigrations, findAppliedNameMismatches } from './lib/remote-migrations.mjs'
import { parseWorktreePaths, findSiblingCollisions, groupSiblingCollisions } from './lib/sibling-migrations.mjs'

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

/**
 * Migration collisions against sibling git worktrees (check 5).
 *
 * Fails OPEN throughout: no git, no worktrees, an unreadable sibling — all
 * return/skip rather than erroring. This check is additive, and a guard that
 * cannot look should not block a push over what it could not see.
 *
 * Sibling paths are realpath'd on both sides because `git worktree list` prints
 * real paths while process.cwd() can arrive through a symlink; without that the
 * current tree reads as its own sibling and every file collides with itself.
 */
function siblingCollisions() {
  let porcelain, self
  try {
    // execFileSync, not execSync: no shell, so nothing here can be interpreted
    // as a shell metacharacter even if the argument list later grows a variable.
    porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    self = realpathSync(process.cwd())
  } catch {
    return []
  }

  const siblingFiles = []
  for (const p of parseWorktreePaths(porcelain, self)) {
    let real
    try {
      real = realpathSync(p)
    } catch {
      continue
    }
    if (real === self) continue
    try {
      for (const f of readdirSync(`${real}/${MIGRATIONS_DIR}`)) {
        if (f.endsWith('.sql')) siblingFiles.push({ worktree: p, file: f })
      }
    } catch {
      // Worktree without a migrations dir, or pruned since `git worktree list`.
      continue
    }
  }
  if (siblingFiles.length === 0) return []
  return findSiblingCollisions(files, isNew, siblingFiles)
}

// Remote history, fetched ONCE and shared by checks 2 and 3. They ask opposite
// questions of the same set — check 2 "is this duplicate half-applied", check 3
// "is this low version already applied" — and two fetches could answer from two
// different snapshots while sibling sessions are landing migrations.
// `null` means "could not look", never "nothing is applied": each caller stays
// strict rather than reporting clean.
// Fetched as version -> NAME. The name is what makes check 4 possible; checks 2
// and 3 only need the key set, which `remote` exposes via .has().
let remoteMap = null
try {
  remoteMap = await fetchRemoteMigrations()
} catch (e) {
  // Reachability failure is NOT "nothing is applied". Say so and stay strict.
  console.log(`⚠ could not read remote migration history (${e.message.split('\n')[0]});`)
  console.log('  no version is treated as already-applied, so a legitimate recovery may fail here.')
}
const remote = remoteMap

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))

/**
 * `--duplicates-only` runs check 2 and nothing else.
 *
 * For the post-merge run on main (.github/workflows/migration-guard-main.yml).
 * Duplicates are unambiguously broken whenever you look at them; ordering is a
 * pre-merge question that produces false positives once a file is on main — see
 * the comment above check 3.
 */
const DUPLICATES_ONLY = process.argv.includes('--duplicates-only')

const errors = []
const warnings = []
/** Versions below max that are already in remote history — reported, never fatal. */
const applied = []
/** Violations we could NOT check against remote history (no token / API down). */
const unverified = []

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
  } else if (remote?.has(version)) {
    errors.push(
      `${line}\n    → ${version} is ALREADY IN REMOTE HISTORY, so ONE of these files ran and the ` +
        `other ${group.length - 1} ${group.length === 2 ? 'is' : 'are'} skipped permanently and ` +
        `silently — \`db push\` matches by version and treats the whole version as applied. That ` +
        `SQL has never executed and nothing will ever say so.\n` +
        `    → Establish which file is the applied one (\`select version, name from ` +
        `supabase_migrations.schema_migrations where version = '${version}'\`), then RENAME the ` +
        `others to a version above the current max — never the applied one, which would turn this ` +
        `duplicate into drift and make db push skip every migration in the repo.`,
    )
  } else if (remote) {
    // NOT a warning, and the reasoning that made it one was measured wrong on
    // 2026-08-29. It said: a duplicate where neither file is applied is "loud"
    // (db push aborts on schema_migrations_pkey) so only the applied case needs
    // escalating. Loud is correct. Harmless-because-loud is not — `db push`
    // aborts the ENTIRE push, not just the offending file:
    //
    //   Applying migration 20261012100000_sweep_skips_attribute_kind.sql...
    //   ERROR: duplicate key value violates unique constraint
    //          "schema_migrations_pkey" (SQLSTATE 23505)
    //
    // Five unrelated migrations from another PR were stranded by that, edge
    // functions deployed anyway, and prod ran new code against the old schema
    // until someone renamed a file by hand. An unapplied duplicate is not legacy
    // debt to clean up in a dedicated pass; it is an outage for every session in
    // the repo, so it fails here.
    errors.push(
      `${line}\n    → NEITHER file is applied yet, so \`supabase db push\` will abort on ` +
        `schema_migrations_pkey the next time it runs — and it aborts the WHOLE push, stranding ` +
        `every other pending migration in the repo while edge functions still deploy.\n` +
        `    → Rename all but one to a version above the current max.`,
    )
  } else {
    unverified.push(
      `${line}\n    → Could not read remote history, so it is unknown whether one of these is ` +
        `already applied. If it is, the others are being skipped silently.`,
    )
  }
}

// 3) Out-of-order versions. Skipped entirely under --duplicates-only.
//
//    THIS CHECK IS A PRE-MERGE QUESTION AND ONLY MAKES SENSE ON A PR. It asks
//    "would db push refuse this file", which stops being answerable once the file
//    is on main: `db push` applies a batch in version order, so a migration that
//    merges after a higher-versioned one has landed is applied perfectly happily
//    as long as both sort above APPLIED history. Measured 2026-08-30 —
//    20261026100000 merged after 20261027100000 was already on main, the
//    post-merge guard flagged it, and db push had in fact applied both without
//    complaint. That is a false positive, and on a repo with ~70 concurrent
//    worktrees it is the COMMON case, not a rare one. A guard that cries wolf on
//    the ordinary path gets muted, which is worse than not having it.
//
//    Check 2 (duplicates) has no such problem: two files sharing a version is
//    unambiguously broken whether it is seen before or after the merge, and it is
//    the condition that actually took `db push` down. So the post-merge workflow
//    runs duplicates only.
//
//    A migration whose version sorts BELOW the newest
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
if (base !== null && !DUPLICATES_ONLY) {
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

      const msg =
        `version ${v} (${f}) is not above the highest existing version ${maxBase}.\n` +
        `    → \`supabase db push\` aborts on the first migration that sorts below ` +
        `remote history ("local migration files to be inserted before the last ` +
        `migration on remote"), taking every later migration in the same PR with it. ` +
        `Rename this file to a version greater than ${maxBase}.`

      // Only a CONFIRMED violation blocks. When remote history is unreadable we
      // cannot tell this apart from the legitimate already-applied recovery, and
      // the repo's convention for a check that could not fully run is to warn —
      // see the drift branch of .husky/pre-push. CI has the token, so the strict
      // answer is still enforced there.
      if (remote) errors.push(msg)
      else unverified.push(msg + `\n    → Remote history unreadable; set SUPABASE_ACCESS_TOKEN to verify.`)
    }
  }
}

// 4) A repo file whose version is applied under a DIFFERENT migration's name.
//
//    This is the silent one. `db push` matches by version alone, so when two
//    files claim one version the first to apply wins and the rest are skipped
//    PERMANENTLY — green deploy, a history row that looks entirely normal, and
//    nothing anywhere saying that SQL never executed. Check 2 cannot see it
//    while the colliding file is still on another branch, which is exactly when
//    it happens: measured twice on 2026-08-29, 20261012100000 recorded as
//    `sweep_skips_attribute_kind` (so `news_vocab_dump_residue` never ran) and
//    20261019100000 as `entity_lifecycle_dispatchers` (so
//    `kinktionary_overlap_deindex_complete` never ran). Both were found only by
//    reading `name` out of schema_migrations by hand, after the fact.
//
//    Comparing NAMES catches it with no duplicate present at all.
//
//    A redundant `<14 digits>_` prefix on the remote name is normalised away —
//    that is the documented MCP-recovery shape (version stamped by the call,
//    name carrying the intended version), and 17 such rows are correct
//    recoveries, not defects.
//
//    Six PRE-EXISTING genuine mismatches remain on main (e.g. 20260619180000 is
//    applied as `extract_worker_circuit_breakers` while the repo file is
//    `search_documents_tags_facet_all_types`). They are warned about, not
//    failed: the SQL already never ran and failing every unrelated PR would not
//    change that. A NEW one is an error, because it is still recoverable by
//    renaming before merge.
for (const hit of findAppliedNameMismatches(files, remoteMap, isNew)) {
  const line =
    `version ${hit.version} is applied to prod as "${hit.remoteName}", but this repo's file at ` +
    `that version is "${hit.file}".\n` +
    `    → \`db push\` matches by version, so THIS FILE'S SQL HAS NEVER RUN and never will. ` +
    `The deploy stays green and history looks normal.\n` +
    `    → Rename it to a version above the current max, then re-run the deploy.`
  if (hit.isNew) errors.push(line)
  else warnings.push(`${line}\n    (pre-existing — clean up in a dedicated pass)`)
}

// 5) Sibling-worktree collisions — the hole this file's header has always
//    described and never closed: "a duplicate can exist in NEITHER PR alone and
//    appear only once both land". Checks 2-4 compare against remote history, so
//    a version claimed by an unmerged branch is invisible to every one of them.
//
//    Measured 2026-09-03: FOUR migrations across four worktrees simultaneously
//    claimed 20261211100000 (tag_slug_seal,
//    event_tag_link_reads_approved_aliases, kinktionary_new_terms_sourced,
//    news_commit_requires_a_verdict). All four checks were green in all four
//    trees, because none could see the other three. Whichever merges first wins;
//    the rest are skipped permanently and silently while their PRs read as
//    shipped — the same end state as check 4's applied-name mismatch, reached
//    from the other direction.
//
//    Fatal only when OUR file is the new one. If ours is already on the base ref
//    the sibling has to move, and failing our push for their unmerged branch
//    would be blaming the wrong tree.
//
//    Fails OPEN on any I/O problem. A guard that cannot enumerate worktrees
//    should say so and get out of the way; this check is an addition to the
//    existing ones, not a gate anything else depends on.
const sibling = groupSiblingCollisions(siblingCollisions())
for (const hit of sibling.blocking) {
  // Cap the path list: the actionable facts are the version and the sibling
  // FILENAME. A live run listed ten worktrees on one line, which buries both.
  const wts =
    hit.worktrees.length > 2
      ? `${hit.worktrees.slice(0, 2).join(', ')}, +${hit.worktrees.length - 2} more`
      : hit.worktrees.join(', ')
  errors.push(
    `this branch's "${hit.file}" shares version ${hit.version} with "${hit.siblingFile}" ` +
      `in ${hit.worktrees.length} sibling worktree(s): ${wts}\n` +
      `    → Both cannot apply. \`db push\` matches by version: whichever merges first wins, ` +
      `the other is skipped SILENTLY and its PR still reads as shipped.\n` +
      `    → Rename above the current max, and prefer an OFF-ROUND timestamp — every session ` +
      `picking <next-day>100000 is what produced a four-way collision on 20261211100000.`,
  )
}
// Advisory half is deliberately one line, not one per hit. It is dominated by
// abandoned worktrees carrying old branches that will never merge, and the
// sibling session is the one that has to act — it cannot read this output.
if (sibling.advisory.count > 0) {
  const shown = sibling.advisory.versions.slice(0, 3).join(', ')
  const more = sibling.advisory.versions.length > 3 ? `, +${sibling.advisory.versions.length - 3} more` : ''
  console.log(
    `ℹ ${sibling.advisory.count} sibling-worktree version overlap(s) on files already at ${BASE_REF} ` +
      `(${shown}${more}) — the sibling worktree is the one that would have to renumber, not this branch.`,
  )
}

if (applied.length > 0) {
  console.log(`✓ ${applied.length} already-applied version(s) exempted from the ordering rule:`)
  for (const a of applied) console.log(`  - ${a}`)
}

if (warnings.length > 0) {
  console.log(`⚠ ${warnings.length} pre-existing duplicate-version group(s):`)
  for (const w of warnings) console.log(`  - ${w}`)
}

if (unverified.length > 0) {
  console.error(`\n⚠ ${unverified.length} problem(s) that could NOT be verified against remote history:`)
  for (const u of unverified) console.error(`  - ${u}`)
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

// Exit 2 = "could not fully check", mirroring scripts/check-migration-drift.mjs.
// The pre-push hook and CI both treat 1 as fatal and anything else as a warning,
// so an unverifiable ordering violation cannot silently pass as OK, and cannot
// block a developer who simply has no Supabase token.
if (unverified.length > 0) {
  console.error('\n→ Could not verify against remote history. Set SUPABASE_ACCESS_TOKEN to get a definitive answer.')
  process.exit(2)
}

console.log(`✓ migration versions OK (${files.length} files, ${byVersion.size} unique versions)`)
