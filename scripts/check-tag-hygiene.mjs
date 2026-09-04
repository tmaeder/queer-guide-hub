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

const res = await fetch(`${BASE}/rest/v1/rpc/tag_hygiene_stats`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{}',
})
if (!res.ok) {
  console.error(`✗ tag_hygiene_stats() → HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const stats = await res.json()

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
// Keys starting with _ are prose; `totals` is context, not a gate.
const metrics = Object.keys(stats).filter((k) => k !== 'totals')

if (UPDATE) {
  const next = { _comment: baseline._comment }
  for (const k of metrics.sort()) next[k] = stats[k]
  if (baseline._notes) next._notes = baseline._notes
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n')
  console.log(`✓ baseline updated (${metrics.length} metrics)`)
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
