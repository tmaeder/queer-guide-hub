#!/usr/bin/env node
/**
 * Tag data-quality ratchet.
 *
 * Phase 0 of the tag DQ program fixed the corpus and the image gaps got WORSE
 * while it ran — tags with an image but no license went 1,167 -> 1,215 between
 * the audit and the next day, while every other number improved. Nothing was
 * watching, so new tags kept arriving with the defects the program was removing.
 *
 * Every metric returned by `tag_hygiene_stats()` outside `totals` is a count of
 * things that should be zero. This fails only when one GROWS past the committed
 * baseline, so a pre-existing backlog does not block unrelated PRs but the next
 * regression does.
 *
 *   node scripts/check-tag-hygiene.mjs            # gate
 *   node scripts/check-tag-hygiene.mjs --update   # re-baseline after a cleanup
 *
 * Called by .github/workflows/data-quality-gates.yml. Skips (exit 0) without
 * credentials, matching every other script in that workflow.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = join(HERE, 'tag-hygiene-baseline.json')

const BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const UPDATE = process.argv.includes('--update')

if (!BASE || !KEY) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY not set — skipping tag hygiene check')
  process.exit(0)
}

const callStats = () =>
  fetch(`${BASE}/rest/v1/rpc/tag_hygiene_stats`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  })

let res = await callStats()
let body = res.ok ? null : await res.text()

// 57014 is Postgres's statement_timeout on `authenticator`, NOT a hygiene metric
// growing. The RPC ran out of time, so NO metric was evaluated at all and the PR
// goes red for a reason unrelated to its diff. Same handling as
// check-data-quality-gates.mjs and check-search-facets-parity.mjs; this script
// was the one that never got it.
//
// Measured 2026-09-14: the function is 1.3s warm against the 8s ceiling — 6x
// headroom — and the one failure on record took 8.3s and passed on re-run while
// three other PRs called the same database inside 40 seconds and passed. That is
// contention, not cost, which is why this retries rather than shaving arms: a 20%
// optimisation does not survive a 6x spike.
//
// Deliberately LOUD, and the retry count stays at ONE. A retry that quietly
// succeeds is how a function creeps back toward the ceiling unnoticed. If this
// appears in the logs, re-measure per arm — measured per arm, not by reading the
// plan tree, because EXPLAIN reports buffers CUMULATIVELY through nested nodes
// and a rolled-up figure reads exactly like an independent one.
//
// THE RETRY IS DELAYED, AND THAT DELAY IS THE WHOLE FIX (2026-09-28). It used to
// fire immediately, so both attempts landed inside the SAME contention window and
// both timed out ~9s apart — measured, twice, on #3996. Contention here lasts
// minutes, not milliseconds, so an instant retry re-samples nothing. A single
// retry far enough away to sample a different window is the difference between a
// gate that reports load and a gate that reports hygiene.
//
// RE-MEASURED THE SAME DAY, AND IT CONFIRMS THIS IS LOAD, NOT COST. On a quiet
// instance (2 active backends) the function is **1,523 ms** against the 8s
// ceiling — 5.3x headroom, matching the 1.3s recorded in 2026-09-14 — and
// `uta_rollup`, its dominant CTE, is **321 ms**. Under load (76 backends, 17
// active, a 1.7-hour query) the SAME function measured 4.2s to 19.4s and
// `uta_rollup` 3,275 ms. Every per-arm figure taken during that window is void,
// including three "optimisations" that looked 2-4x worse and were only contention.
// Before trusting ANY timing here, re-run the unchanged baseline afterwards: if
// the two baselines disagree, the measurement in between measured the instance.
const RETRY_DELAY_MS = 30_000
if (!res.ok && body?.includes('57014')) {
  console.warn(
    `⚠ tag_hygiene_stats() hit the statement timeout (57014) — no metric was evaluated. ` +
      `Retrying ONCE in ${RETRY_DELAY_MS / 1000}s, to sample a different load window.`,
  )
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  const t0 = Date.now()
  res = await callStats()
  body = res.ok ? null : await res.text()
  console.warn(
    `⚠ retry ${res.ok ? 'SUCCEEDED' : 'FAILED'} after ${Date.now() - t0}ms. If it FAILED, the ` +
      'database was busy for >30s or the function has genuinely regressed — measure it on a quiet ' +
      'instance before concluding which.',
  )
}

if (!res.ok) {
  console.error(`✗ tag_hygiene_stats() → HTTP ${res.status}: ${body}`)
  process.exit(1)
}
const stats = await res.json()

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
// Keys starting with _ are prose; `totals` is context, not a gate.
const metrics = Object.keys(stats).filter((k) => k !== 'totals')

if (UPDATE) {
  // EVERY `_`-prefixed key is carried across, enumerated from the file rather
  // than listed here. Listing them is how this went wrong: it named `_comment`
  // and `_notes` and silently DROPPED `_advisory`, so running `--update` —
  // which the regression message below tells you to run — turned all NINE
  // advisory metrics into hard gates in one commit, with no output saying so.
  // Every one of them is advisory because an instantaneous value is not an
  // invariant for it, so the next ordinary drift in any of the nine would have
  // red every open PR for a change its author did not make. A generic carry
  // cannot rot when someone adds a tenth control key.
  // `_comment` leads and the rest trail, which is the file's existing shape, so
  // a re-baseline diff shows only the numbers that moved.
  const control = Object.keys(baseline).filter((k) => k.startsWith('_'))
  const next = {}
  if (control.includes('_comment')) next._comment = baseline._comment
  for (const k of metrics.sort()) next[k] = stats[k]
  for (const k of control) if (k !== '_comment') next[k] = baseline[k]
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n')
  const carried = Object.keys(next).filter((k) => k.startsWith('_'))
  console.log(
    `✓ baseline updated (${metrics.length} metrics; carried ${carried.join(', ') || 'no control keys'})`,
  )
  process.exit(0)
}

const t = stats.totals ?? {}
console.log(`tag corpus: ${t.active_tags} active tags, ${t.categories} categories, ${t.assignments} assignments`)

// Metrics that WARN instead of failing. TWO classes qualify, and the second was
// added 2026-09-03 after the first proved too narrow.
//
//   (a) Counters driven by writers OUTSIDE the tag glossary — the profession
//       pipeline lands is_adult tags and new images every day.
//   (b) OSCILLATORS: counters that legitimately move both ways from ordinary
//       in-glossary work, so an instantaneous value is not an invariant.
//       redirect_to_non_canonical is the case in point — reviving a deprecated
//       tag re-mints redirects (20260910181447), so any merge/rename wave moves
//       it, and its own note has said since 2026-08-30 that "a counter
//       documented to oscillate should not be a hard gate". It was hand-bumped
//       three times (58→59, 59→61) for movement no gated PR had caused; the
//       third time it was failing FOUR of six open PRs at once, none of which
//       touched tags. A standing tax on unrelated PRs is not a quality signal,
//       and re-baselining on each occurrence teaches reviewers to bump numbers.
//
// Both classes red unrelated work for a change its author did not make — the
// same reasoning that keeps check-legal-citation-links off pull_request. They
// still report, loudly, and a step change stays visible in the run log.
//
// This does NOT stop watching the number. If a metric here should be hard
// again, gate on the quantity that actually means something broke — an AGE, or
// a write-time invariant that makes the count structural — never on a level.
// indexable_without_description is the worked example of a sawtooth fixed at
// the source and kept as a hard gate; uncategorized_active is the one that
// could not be, and stayed advisory.
const ADVISORY = new Set(baseline._advisory ?? [])

const regressions = []
const drift = []
const improvements = []
const missing = []

for (const k of metrics.sort()) {
  const now = stats[k]
  const was = baseline[k]
  if (typeof was !== 'number') {
    // A metric added to the SQL but not to the baseline. Do NOT treat an
    // unknown metric as passing — that is how a new gate silently does nothing.
    missing.push(`${k} = ${now}`)
    continue
  }
  if (now > was) {
    const line = `${k}: ${was} → ${now}  (+${now - was})`
    ;(ADVISORY.has(k) ? drift : regressions).push(line)
  } else if (now < was) improvements.push(`${k}: ${was} → ${now}  (-${was - now})`)
}

for (const line of improvements) console.log(`  ✓ improved  ${line}`)
for (const line of drift) console.warn(`  ⚠ drift     ${line}`)

if (missing.length) {
  console.error(`\n✗ ${missing.length} metric(s) have no baseline entry:`)
  for (const m of missing) console.error(`    ${m}`)
  console.error('  Run `node scripts/check-tag-hygiene.mjs --update` and commit the result.')
}

if (regressions.length) {
  console.error(`\n✗ TAG HYGIENE REGRESSION — ${regressions.length} metric(s) grew:`)
  for (const r of regressions) console.error(`    ${r}`)
  console.error(
    '\n  These are defect counts. Fix the cause, or if the growth is deliberate and\n' +
      '  understood, re-baseline with --update and say why in the commit message.\n' +
      '  Never loosen a number just to make CI pass.',
  )
}

if (regressions.length || missing.length) process.exit(1)

const tail = drift.length ? ` (${drift.length} advisory metric(s) drifted — see ⚠ above)` : ''
if (improvements.length) {
  console.log(
    `\n✓ no regressions${tail} — ${improvements.length} improved; re-baseline with --update to lock them in`,
  )
} else {
  console.log(`✓ no tag hygiene regressions${tail}`)
}
