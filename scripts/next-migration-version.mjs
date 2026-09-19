#!/usr/bin/env node
/**
 * Allocate a migration version, or renumber an existing migration.
 *
 *   node scripts/next-migration-version.mjs                    # print a version
 *   node scripts/next-migration-version.mjs --name my_change   # print the filename
 *   node scripts/next-migration-version.mjs --create my_change # write the file
 *   node scripts/next-migration-version.mjs --renumber <path>  # move it + fix refs
 *   ... --dry-run                                              # show, change nothing
 *
 * WHY THIS EXISTS. Until now nothing in the repo answered "what version should
 * I use", so every session answered it the same way — next round number above
 * the current max — and a shared heuristic gives a shared answer. Measured
 * 2026-09-18/19: #3778 and #3779 independently claimed 99800101100000, then
 * #3783 independently picked 99920101100000, the escape #3779 had chosen inside
 * the same hour. Two of the three renumbered four times each.
 *
 * WHAT THIS FIXES AND WHAT IT DOES NOT. The collision is removed: versions come
 * from the clock (see scripts/lib/migration-versions.mjs), so two sessions
 * collide only inside a single second. Renumber-on-merge is NOT removed and
 * cannot be — `db push` aborts on a pending file sorting below applied history,
 * so of two concurrent PRs the later merge must hold the higher version, which
 * is unknowable when the file is written. `--renumber` makes that mechanical
 * instead of manual, which is the part that was actually going wrong: a version
 * lives in the filename, in the migration's own body (often several times, and
 * sometimes as a `migration:<version>` string written into PRODUCTION DATA), and
 * in a test's `MIGRATION` constant. Doing that by hand and missing one is how
 * 20260919130000_tag_uncategorized_disposition.sql ended up stamping
 * `migration:20260919110000` into `app.actor` three times.
 *
 * SCOPE OF THE REWRITE. Only this branch's own files are touched — the
 * migration itself plus anything added or modified relative to the base ref.
 * Every other occurrence in the repo is a reference to some OTHER migration's
 * history (CLAUDE.md alone cites 215 distinct versions) and rewriting those
 * would corrupt the record to fix a filename. Untouched hits are REPORTED, not
 * silently skipped.
 *
 * SAFETY. Renaming a migration that is already applied to prod is the one
 * unrecoverable mistake here: `db push` matches by version, so the file stops
 * matching its history row and `check-migration-drift.mjs` starts failing every
 * PR in the repo. Two independent refusals, and the second holds with no
 * credentials at all:
 *   1. remote history says the version is applied  -> refuse
 *   2. the file exists on the base ref             -> refuse (it may have been
 *      pushed and applied; absence from the base ref is proof it has not)
 * Both are overridable only by --force, which prints what it is overriding.
 */

import { readdirSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { allocate, versionsOf, replaceVersion } from './lib/migration-versions.mjs'
import { fetchRemoteMigrations } from './lib/remote-migrations.mjs'
import { parseWorktreePaths } from './lib/sibling-migrations.mjs'

const MIGRATIONS_DIR = 'supabase/migrations'
const VERSION_RE = /^(\d{14})_(.+)\.sql$/
const BASE_REF = process.env.MIGRATION_BASE_REF || 'origin/main'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}

const DRY_RUN = flag('--dry-run')
const FORCE = flag('--force')
const QUIET = flag('--quiet')

const say = (...a) => {
  if (!QUIET) console.error(...a)
}

function git(args, { allowFail = true } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    if (allowFail) return null
    throw e
  }
}

/** Migration basenames in this tree. */
function ourFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
}

/**
 * Versions claimed by sibling git worktrees.
 *
 * Fails OPEN, like check 5 of check-migration-versions.mjs: a guard that cannot
 * enumerate worktrees should get out of the way rather than block. The cost of
 * missing one here is only that the clock, rather than the floor, decides — and
 * the clock is the intended source anyway.
 */
function siblingVersions() {
  const porcelain = git(['worktree', 'list', '--porcelain'])
  if (!porcelain) return []
  let self
  try {
    self = realpathSync(process.cwd())
  } catch {
    return []
  }
  const out = []
  for (const p of parseWorktreePaths(porcelain, self)) {
    let real
    try {
      real = realpathSync(p)
    } catch {
      continue
    }
    if (real === self) continue
    try {
      out.push(...versionsOf(readdirSync(`${real}/${MIGRATIONS_DIR}`)))
    } catch {
      continue
    }
  }
  return out
}

/** Basenames present at the base ref; null when the ref cannot be resolved. */
function baseFiles() {
  if (!git(['rev-parse', '--verify', '--quiet', `${BASE_REF}^{commit}`])) return null
  const out = git(['ls-tree', '-r', '--name-only', BASE_REF, '--', MIGRATIONS_DIR])
  if (out === null) return null
  return new Set(
    out
      .split('\n')
      .filter((p) => p.endsWith('.sql'))
      .map((p) => p.slice(MIGRATIONS_DIR.length + 1)),
  )
}

/** Paths this branch added or modified, for scoping the reference rewrite. */
function branchTouchedFiles() {
  if (!git(['rev-parse', '--verify', '--quiet', `${BASE_REF}^{commit}`])) return null
  const merged = new Set()
  // Committed-on-branch, plus uncommitted work: a renumber usually happens
  // before the test file has been committed, so diffing only against the base
  // ref would miss exactly the file the rewrite exists for.
  for (const args of [
    ['diff', '--name-only', `${BASE_REF}...HEAD`],
    ['diff', '--name-only', 'HEAD'],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    const out = git(args)
    if (out === null) continue
    for (const p of out.split('\n')) if (p.trim()) merged.add(p.trim())
  }
  return merged
}

async function remoteMap() {
  try {
    return await fetchRemoteMigrations()
  } catch (e) {
    say(`⚠ could not read remote migration history (${e.message.split('\n')[0]})`)
    return null
  }
}

async function claimedVersions(remote) {
  const claimed = [...versionsOf(ourFiles()), ...siblingVersions()]
  if (remote) claimed.push(...remote.keys())
  return claimed
}

/** `--renumber`: move a migration to a fresh version and fix every reference. */
async function renumber(path, remote) {
  if (!existsSync(path)) {
    console.error(`✗ no such file: ${path}`)
    process.exit(1)
  }
  const file = basename(path)
  const m = file.match(VERSION_RE)
  if (!m) {
    console.error(`✗ not a migration filename (<14 digits>_<name>.sql): ${file}`)
    process.exit(1)
  }
  const [, oldVersion, slug] = m

  // Refusal 1 — remote history. Definitive when we have it.
  if (remote?.has(oldVersion)) {
    const msg =
      `${oldVersion} is ALREADY APPLIED to prod (as "${remote.get(oldVersion)}"). Renaming it ` +
      `breaks file↔history matching: db push matches by version, so the file stops corresponding ` +
      `to its history row and check-migration-drift.mjs fails every PR in the repo.`
    if (!FORCE) {
      console.error(`✗ ${msg}\n  → If you are certain, re-run with --force.`)
      process.exit(1)
    }
    say(`⚠ --force: overriding refusal — ${msg}`)
  }

  // Refusal 2 — the base ref. Holds with no credentials: a file absent from the
  // base ref has never been pushed, so it cannot have been applied. Present on
  // the base ref is not proof that it HAS been applied, which is why this is a
  // refusal rather than a warning — the safe reading of "unknown" is "no".
  const base = baseFiles()
  if (base === null) {
    say(`⚠ base ref "${BASE_REF}" unresolvable — cannot confirm this migration is unmerged.`)
    if (!remote && !FORCE) {
      console.error(
        `✗ refusing to renumber with neither remote history nor a base ref to check against.\n` +
          `  → Fetch ${BASE_REF}, set SUPABASE_ACCESS_TOKEN, or pass --force.`,
      )
      process.exit(1)
    }
  } else if (base.has(file)) {
    const msg =
      `${file} already exists at ${BASE_REF}, so it may have been pushed and applied. ` +
      `Only a migration that has never merged is safe to renumber.`
    if (!FORCE) {
      console.error(`✗ ${msg}\n  → If you are certain it never applied, re-run with --force.`)
      process.exit(1)
    }
    say(`⚠ --force: overriding refusal — ${msg}`)
  }

  const { version: newVersion, reason } = allocate({ claimed: await claimedVersions(remote) })
  if (newVersion === oldVersion) {
    console.error(`✗ allocator returned the current version ${oldVersion} — nothing to do.`)
    process.exit(1)
  }
  const newPath = `${dirname(path)}/${newVersion}_${slug}.sql`

  // Scope: this branch's own files. Everything else mentioning oldVersion is a
  // reference to another migration's history and must not be rewritten.
  const touched = branchTouchedFiles()
  const candidates = new Set([path])
  if (touched === null) {
    say(`⚠ could not determine which files this branch touched — only ${file} will be rewritten.`)
  } else {
    for (const p of touched) {
      if (p === path || !existsSync(p)) continue
      if (p.startsWith(`${MIGRATIONS_DIR}/`)) continue // other migrations: never
      candidates.add(p)
    }
  }

  const edits = []
  const bareOnly = []
  for (const p of candidates) {
    let content
    try {
      content = readFileSync(p, 'utf8')
    } catch {
      continue
    }
    // The migration rewrites unconditionally — every mention in it is about
    // itself. Every other file gets bound-only: `<version>_<slug>` (a test's
    // MIGRATION constant) or `migration:<version>` (the actor string that
    // reaches production data). A bare version elsewhere is a citation of
    // history, and rewriting it would corrupt the record to fix a filename.
    const { content: next, hits, bare } = replaceVersion(content, oldVersion, newVersion, {
      boundOnly: p !== path,
    })
    if (hits > 0) edits.push({ path: p, hits, content: next })
    if (bare > 0) bareOnly.push({ path: p, bare })
  }

  // Everything else in the repo still naming the old version. Reported, never
  // touched — but reported, because a silent skip is how a stale reference
  // survives a renumber and nothing ever says so.
  const untouched = []
  const grep = git(['grep', '-l', '--', oldVersion])
  for (const p of (grep ?? '').split('\n')) {
    const q = p.trim()
    if (!q || q === path || candidates.has(q)) continue
    untouched.push(q)
  }

  console.error(`${DRY_RUN ? 'DRY RUN — ' : ''}renumber ${oldVersion} -> ${newVersion} (${reason})`)
  console.error(`  move  ${file}`)
  console.error(`     -> ${basename(newPath)}`)
  for (const e of edits) {
    console.error(`  edit  ${e.path} (${e.hits} occurrence${e.hits === 1 ? '' : 's'})`)
  }
  if (edits.length === 0) {
    console.error(`  edit  (none — the version appears nowhere but the filename)`)
  }
  for (const b of bareOnly) {
    console.error(
      `  skip  ${b.path} (${b.bare} bare mention${b.bare === 1 ? '' : 's'} — a citation, not a reference to this file)`,
    )
  }
  if (untouched.length > 0) {
    console.error(
      `\n  ℹ ${untouched.length} file(s) outside this branch's changes still name ${oldVersion}. ` +
        `Left alone deliberately — they are almost certainly historical references to this or ` +
        `another migration, not things to rewrite. Review if that is wrong here:`,
    )
    for (const p of untouched.slice(0, 10)) console.error(`      ${p}`)
    if (untouched.length > 10) console.error(`      ... +${untouched.length - 10} more`)
  }

  if (DRY_RUN) {
    console.log(newVersion)
    return
  }

  for (const e of edits) writeFileSync(e.path, e.content)
  // `git mv` so the rename is staged and git records it as a rename rather than
  // a delete+add; fall back to a plain move for an untracked file, which is the
  // usual case for a migration that has not been committed yet.
  if (git(['mv', path, newPath]) === null) {
    writeFileSync(newPath, readFileSync(path))
    execFileSync('rm', [path])
  }
  console.error(`\n✓ renumbered. Re-run: node scripts/check-migration-versions.mjs`)
  console.log(newVersion)
}

// ---------------------------------------------------------------------------

const remote = await remoteMap()

const renumberTarget = value('--renumber')
if (renumberTarget) {
  await renumber(renumberTarget, remote)
} else {
  const { version, floor, reason } = allocate({ claimed: await claimedVersions(remote) })
  const name = value('--name') ?? value('--create')
  if (reason !== 'clock-derived') say(`⚠ ${reason}`)
  say(`  (highest version already claimed: ${floor ?? 'none'}${remote ? '' : ', remote unread'})`)

  if (name) {
    const slug = String(name).replace(/\.sql$/, '')
    const path = `${MIGRATIONS_DIR}/${version}_${slug}.sql`
    if (flag('--create') && !DRY_RUN) {
      if (existsSync(path)) {
        console.error(`✗ ${path} already exists`)
        process.exit(1)
      }
      writeFileSync(path, `-- ${version}_${slug}\n--\n-- TODO: why this migration exists.\n\n`)
      say(`✓ created ${path}`)
    }
    console.log(path)
  } else {
    console.log(version)
  }
}
