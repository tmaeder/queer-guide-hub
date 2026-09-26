#!/usr/bin/env node
/**
 * Explainability gate: every machine code the pipeline emits must have plain
 * language written for it.
 *
 * WHY THIS EXISTS. The ingest machine records its reasons as codes —
 * `W_NO_COORDS`, `E_LIVING_WITH_DEATH_DATE`. Until 99991790358904 the only
 * thing that turned those into words for an editor was a regex that renders
 * `W_NO_COORDS` as "W No Coords". That output looks like content, which is
 * the actual defect: a prettified key and a written explanation are
 * indistinguishable on screen, so a missing one can never be counted. The
 * registry fixes the rendering; this gate stops the vocabulary drifting away
 * from it the next time somebody adds a validator rule.
 *
 * WHY IT READS FILES AND NOT THE DATABASE. Its sibling
 * check-anon-function-grants.mjs queries prod, because a GRANT only exists
 * there. An explanation key exists in two places that are both in the repo:
 * the string literal in the edge function, and the seed row in the migration.
 * Comparing those two needs no credentials, which means this gate runs on a
 * pull request BEFORE the migration has applied — the moment the new code is
 * introduced, rather than the morning after it ships.
 *
 * THE GREP IS A SUPERSET PATTERN ON PURPOSE, AND THE NARROW ONE ALREADY
 * FAILED. The obvious harvest is `(errors|warnings).push('CODE')`. Against
 * this tree that returns 106 codes; matching every `'[EW]_...'` literal
 * returns 107. The one the narrow pattern misses is `E_VALIDATOR_CRASH`,
 * written as an array literal —
 *   ai_validation_result: { errors: ['E_VALIDATOR_CRASH'], ... }
 *   (pipeline-validate/index.ts:403)
 * — the code that fires when the validator itself throws, i.e. the one whose
 * absence from a report would be least noticeable and most misleading. 106
 * and 107 look equally complete from the inside; only running both patterns
 * tells them apart.
 *
 * POSITIVE CONTROLS. "Every emitted code has an explanation" is satisfied
 * trivially when the emitted set is empty — a renamed directory, a changed
 * literal style, or a regex that silently stops matching all produce a green
 * run that has checked nothing. This is the vacuous-assertion failure this
 * repo has recorded repeatedly. So the gate refuses to pass unless it found
 * a plausible number of codes on BOTH sides.
 *
 * FIX WHEN THIS FAILS. Add a row to the seed in a new migration:
 *   ('pipeline-validate:W_YOUR_CODE', '<short title>', '<what it means, >=20 chars>',
 *    '<what an editor can do, or null>', 'warning')
 * Do NOT delete the code from the validator to make the gate pass, and do NOT
 * widen FLOOR downwards.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions')
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations')

/**
 * Floors, not exact counts. An exact count is a second thing to update on
 * every legitimate change and turns a passing gate into busywork; a floor
 * only fires when the harvest has collapsed, which is the failure mode that
 * makes this whole file vacuous.
 */
const FLOOR = { emitted: 90, registered: 140 }

/** Every `'E_FOO'` / `'W_FOO'` string literal, wherever it appears. */
const CODE_LITERAL = /'([EW]_[A-Z0-9_]{2,})'/g
/** Seed rows: `('<producer>:<code>',` at the head of a VALUES tuple. */
const SEED_KEY = /^\s*\('([a-z0-9_-]+:[A-Za-z0-9_.-]+)'\s*,/gm

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

// ---------------------------------------------------------------------------
// 1. What the pipeline emits.
// ---------------------------------------------------------------------------
/** @type {Map<string, string[]>} code -> files that emit it */
const emitted = new Map()
for (const file of walk(FUNCTIONS_DIR)) {
  // Tests exist to exercise the codes, not to emit them in production.
  if (/\.(test|spec)\.ts$/.test(file) || file.includes('/_tests/')) continue
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(CODE_LITERAL)) {
    const where = emitted.get(m[1]) ?? []
    where.push(relative(ROOT, file))
    emitted.set(m[1], where)
  }
}

// ---------------------------------------------------------------------------
// 2. What has an explanation. Any migration seeding the registry counts, so a
//    later migration adding codes is picked up without touching this script.
// ---------------------------------------------------------------------------
const registered = new Set()
for (const name of readdirSync(MIGRATIONS_DIR)) {
  if (!name.endsWith('.sql')) continue
  const src = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
  if (!src.includes('pipeline_explanations')) continue
  for (const m of src.matchAll(SEED_KEY)) registered.add(m[1])
}

// ---------------------------------------------------------------------------
// 3. Positive controls, BEFORE the real assertion. An empty set on either side
//    satisfies the real assertion and proves nothing.
// ---------------------------------------------------------------------------
const controls = []
if (emitted.size < FLOOR.emitted) {
  controls.push(
    `found only ${emitted.size} emitted codes under supabase/functions (floor ${FLOOR.emitted}).` +
      '\n    The harvest pattern has stopped matching, or the directory moved.' +
      '\n    This is NOT a clean tree — it is a gate that is no longer looking.',
  )
}
if (registered.size < FLOOR.registered) {
  controls.push(
    `found only ${registered.size} registered explanation keys (floor ${FLOOR.registered}).` +
      '\n    The seed parser has stopped matching, or the registry migration was removed.',
  )
}
if (controls.length > 0) {
  console.error('✗ explanation-key gate is not measuring anything:\n')
  for (const c of controls) console.error(`  - ${c}`)
  process.exit(2)
}

// ---------------------------------------------------------------------------
// 4. The real assertion.
// ---------------------------------------------------------------------------
const unexplained = [...emitted.keys()]
  .filter((code) => !registered.has(`pipeline-validate:${code}`))
  .sort()

if (unexplained.length === 0) {
  console.log(
    `✓ all ${emitted.size} pipeline codes have a written explanation ` +
      `(${registered.size} keys registered in total).`,
  )
  process.exit(0)
}

console.error(`✗ ${unexplained.length} pipeline code(s) have no written explanation:\n`)
for (const code of unexplained) {
  console.error(`  ${code}`)
  for (const f of [...new Set(emitted.get(code))]) console.error(`      emitted by ${f}`)
}
console.error(
  '\nAn unexplained code still SHOWS in the admin inspector — as a raw monospace' +
    '\nkey with an "unexplained" chip, deliberately, so it looks broken rather than' +
    '\nabsent. That is the safety net, not the goal. Write the explanation:' +
    '\n\n  Add to a new migration, seeding public.pipeline_explanations:' +
    "\n    ('pipeline-validate:<CODE>', '<title, 3-60 chars>'," +
    "\n     '<what it means to an editor, >=20 chars>'," +
    "\n     '<what they can do about it, or null>'," +
    "\n     '<info|warning|blocking>')" +
    '\n\n  Severity must agree with the prefix: E_ is blocking, W_ is warning.' +
    '\n  The migration asserts this, so a mismatch fails the deploy, not just CI.',
)
process.exit(1)
