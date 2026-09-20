#!/usr/bin/env node
// A migration that asserts on pg_get_functiondef() must strip comments first.
//
// WHY THIS EXISTS. `pg_get_functiondef()` returns the function body INCLUDING its
// own comments, so a verify block that greps it for a symbol matches the prose
// explaining the symbol. On 2026-09-20 this aborted `supabase db push` on main
// THREE times in one day, from three different sessions:
//
//   99991789853609  unmerge_cities    counted 8 `v::uuid` sites, expected 7 --
//                                     the 8th was a comment. Stranded 14
//                                     migrations from 00:21.
//   99991789855163  cities_directory  asserted the function no longer calls
//                                     location_is_high_risk, and its own comment
//                                     says "Inlined from location_is_high_risk()
//                                     rather than calling it per row". Rejected
//                                     itself.
//   (a third, same shape, fixed in #3862.)
//
// `db push` stops at the first failing migration, so the blast radius is the
// whole deploy queue, not the one PR -- and the failure only happens at APPLY
// time, because CI never applies migrations. Nothing catches it earlier.
//
// BOTH DIRECTIONS ARE WRONG, which is why the rule is "strip", not "count
// differently":
//   - an ABSENCE check (count must equal N, or NOT LIKE) goes falsely RED when a
//     comment inflates the count. That is what blocked main.
//   - a PRESENCE check (LIKE '%x%' or it raises) goes falsely GREEN when the
//     symbol exists ONLY in a comment. That is worse and silent: several of
//     these assert security properties, e.g. that find_duplicate_clusters still
//     calls assert_admin_or_internal.
// Stripping comments is correct for both, so there is no legitimate tension.
//
// Audited on prod 2026-09-20 before writing this: all 8 presence-checks in the
// applied corpus hold in real CODE, not just in prose. None is currently
// vacuous. This guard is prevention, not remediation.
//
// SCOPE: newly ADDED migration files only. The 64 files already using
// pg_get_functiondef have applied successfully, and `db push` never re-runs an
// applied migration. Condemning them would be a 58-entry allowlist nobody reads.
//
// OPT-OUT: a file may carry `-- functiondef-assert-ok: <reason>` when it really
// does mean to assert on a comment. Rare and deliberate; it must give a reason.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// `[ \t]` not `\s`: `\s` matches a newline, so a bare `-- functiondef-assert-ok:`
// would be satisfied by the first character of the NEXT line and the opt-out
// would silently need no reason at all.
const OPT_OUT = /--[ \t]*functiondef-assert-ok:[ \t]*\S/i

/** Strip `--` line comments, ignoring `--` inside single-quoted strings. */
function stripSqlComments(sql) {
  const out = []
  for (const line of sql.split('\n')) {
    let inStr = false
    let cut = line.length
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === "'") inStr = !inStr
      else if (!inStr && c === '-' && line[i + 1] === '-') { cut = i; break }
    }
    out.push(line.slice(0, cut))
  }
  return out.join('\n')
}

/** Does this window compare/search text rather than merely fetch it? */
const SEARCHES = /(regexp_matches|regexp_count|regexp_split_to_table|position\s*\(|strpos\s*\()|(\s(?:not\s+)?(?:like|ilike)\s)|(\s!?~\s)/i

/** Is the functiondef call already wrapped in a comment-stripping rewrite? */
function isStripped(window) {
  return /regexp_replace\s*\(\s*pg_get_functiondef/i.test(window)
      || /regexp_replace\s*\([^;]{0,120}pg_get_functiondef[^;]{0,200}'--/i.test(window)
      || /not\s+like\s+'--%'/i.test(window)
}

export function findUnstrippedAsserts(sql) {
  if (OPT_OUT.test(sql)) return []
  const code = stripSqlComments(sql)
  const lines = code.split('\n')
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('pg_get_functiondef')) continue
    // A statement can wrap; look at a small window around the call.
    const window = lines.slice(Math.max(0, i - 3), i + 4).join(' ')
    if (!SEARCHES.test(window)) continue      // fetch-only, not an assertion
    if (isStripped(window)) continue          // already correct
    hits.push({ line: i + 1, excerpt: lines[i].trim().slice(0, 120) })
  }
  return hits
}

function addedMigrations() {
  // MIGRATION_BASE_REF is set by the workflow's "Resolve migration base ref"
  // step, which the sibling migration checks already depend on. It matters on
  // `merge_group`, where github.base_ref is EMPTY and HEAD~1 is not main's tip
  // when the queue batches several PRs — deriving our own base here would
  // silently compare against the wrong tree.
  const base =
    process.env.MIGRATION_BASE_REF ||
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main')
  try {
    // execFileSync with an argument array: no shell, so a ref name carrying
    // shell metacharacters cannot be interpolated into a command.
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`, '--', 'supabase/migrations/'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return out.split('\n').filter((f) => f.endsWith('.sql'))
  } catch {
    // No git range (shallow clone, detached, local run). Fail OPEN with a notice
    // rather than pretending the tree is clean — "could not look" is not "clean".
    console.warn('⚠ could not compute added migrations; functiondef-assert check did not run')
    return null
  }
}

function main() {
  const files = addedMigrations()
  if (files === null) process.exit(0)
  if (files.length === 0) {
    console.log('✓ no new migrations to check for pg_get_functiondef assertions')
    return
  }
  let failed = false
  for (const f of files) {
    let sql
    try { sql = readFileSync(f, 'utf8') } catch { continue }
    const hits = findUnstrippedAsserts(sql)
    for (const h of hits) {
      failed = true
      console.error(`✗ ${f}:${h.line} asserts on pg_get_functiondef() without stripping comments`)
      console.error(`    ${h.excerpt}`)
    }
  }
  if (failed) {
    console.error('')
    console.error('  pg_get_functiondef() returns the body INCLUDING its comments, so this')
    console.error("  matches the prose explaining the symbol, not just the code. It aborted")
    console.error('  `db push` on main three times on 2026-09-20 and stranded the whole queue.')
    console.error('')
    console.error('  Fix — strip first, then assert:')
    console.error("    regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')")
    console.error('')
    console.error('  If you really do mean to assert on a comment, add to the file:')
    console.error('    -- functiondef-assert-ok: <why>')
    console.error('::error title=Migration asserts on pg_get_functiondef without stripping comments::See log.')
    process.exit(1)
  }
  console.log(`✓ ${files.length} new migration(s): no unstripped pg_get_functiondef assertions`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
