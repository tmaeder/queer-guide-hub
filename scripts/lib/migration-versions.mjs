/**
 * Migration-version ALLOCATION (as distinct from validation).
 *
 * `check-migration-versions.mjs` answers "is this version legal". Nothing
 * answered "what version should I use", so every session answered it by hand
 * with the same heuristic — next round number above the current max — and the
 * same heuristic gives the same answer to everyone who looks at the same
 * moment. Measured 2026-09-18/19: #3778 and #3779 independently claimed
 * 99800101100000; #3783 then independently picked 99920101100000, the escape
 * #3779 had chosen an hour earlier. #3779 and #3783 each renumbered FOUR times.
 *
 * TWO FAILURES ARE TANGLED TOGETHER HERE AND ONLY ONE OF THEM IS FIXABLE.
 *
 *   COLLISION — two sessions choosing the SAME number. Entirely an artifact of
 *   the round-number heuristic, and entirely removable: allocate from a clock
 *   instead of from a pattern and two sessions collide only inside one second.
 *
 *   RENUMBER-ON-MERGE — a version that was above the ceiling when it was
 *   written and is below it by the time it merges. This is INHERENT, not a
 *   defect: `db push` aborts on a pending file sorting below applied history,
 *   so of two concurrent PRs the one that merges later must hold the higher
 *   version, and no numbering scheme can know at authoring time which that
 *   will be. It cannot be removed; it can only be made cheap, which is what
 *   `--renumber` is for.
 *
 * THE SPACE WAS NEVER THE PROBLEM, and the "six increments left" framing is
 * what made it look like one. Against a ceiling of 99999999999999 and a max of
 * 99960101100000 there are 39,898,899,999 increments remaining — the six is the
 * number of steps left in the `999X0101100000` PATTERN, because every session
 * only ever moved the fourth digit. Re-anchoring the whole corpus back to real
 * timestamps was measured and rejected for that reason: it renames 478 files and
 * rewrites 478 prod history rows to buy headroom that already exists, while
 * breaking things a rename cannot repair — 52 distinct `migration:<version>`
 * strings are written into PROD DATA (`field_provenance.*.by`), and several
 * migrations carry postconditions that COUNT rows by that exact string.
 *
 * FORMAT: <PREFIX 4 digits><Unix epoch seconds, 10 digits>.
 *
 *   99991789807658  =  9999 + 1789807658  =  2026-09-19T17:27:38Z
 *
 * Properties, each chosen against a measured failure above:
 *   - Monotonic. Two sessions differ by however many seconds apart they ran,
 *     so the round-number attractor has nothing to attract to.
 *   - 14 digits for every epoch up to 9999999999 (year 2286), so it cannot
 *     silently change width and re-break sort order.
 *
 * THE PREFIX IS 9999 — THE LAST ONE — AND THAT IS A MEASURED CHOICE, NOT AN
 * OVERSHOOT. This file was first written with PREFIX 9997, against a repo max of
 * 99960101100000. Within the SAME HOUR, three sibling sessions hand-picked
 * 99970101100000, 99970101100100 and 99980101100000 — straight through the
 * chosen prefix and out the other side — and the allocator degenerated to
 * floor+1 on its very first run against fresh main. That is the round-number
 * heuristic demonstrating itself while the fix for it was being written, and it
 * settles the design question: a hand-picker always reaches for the next round
 * number ABOVE whatever they see, so any prefix low enough to leave a spare is
 * a prefix they will overshoot. A "spare range" is not an escape hatch if the
 * thing it is meant to escape can reach it first.
 *
 * What is given up is honest and small: 9999 + epoch exhausts exactly at the
 * 14-digit ceiling in 2286, with 8.2e9 increments between here and there, and
 * there is no prefix left after it. The real protection was never the spare
 * range — it is that nobody picks by hand any more.
 *
 * `MIGRATION_VERSION_PREFIX` still overrides, for a future format change rather
 * than as a ladder rung, and `allocate()` reports rather than hides the case
 * where a claimed version already sits above the clock — because that is the
 * state in which the collision guarantee no longer holds.
 */

const VERSION_RE = /^(\d{14})_.+\.sql$/
export const EPOCH_DIGITS = 10
export const MAX_VERSION = '99999999999999'

/** Default prefix. Env override is read at call time so tests can vary it. */
export function prefix(env = process.env) {
  const p = String(env.MIGRATION_VERSION_PREFIX ?? '9999')
  if (!/^\d{4}$/.test(p)) {
    throw new Error(`MIGRATION_VERSION_PREFIX must be exactly 4 digits, got "${p}"`)
  }
  return p
}

/** The 14-digit version for a given instant, ignoring what is already claimed. */
export function versionForEpoch(epochSeconds, env = process.env) {
  const e = Math.floor(Number(epochSeconds))
  if (!Number.isFinite(e) || e < 0) throw new Error(`bad epoch: ${epochSeconds}`)
  const digits = String(e)
  if (digits.length > EPOCH_DIGITS) {
    // Year 2286. Not a hypothetical worth a branch, but a silent width change
    // would break sort order for every future migration at once, so it is an
    // error rather than a truncation.
    throw new Error(
      `epoch ${e} no longer fits ${EPOCH_DIGITS} digits — the version format needs widening`,
    )
  }
  return prefix(env) + digits.padStart(EPOCH_DIGITS, '0')
}

/** 14-digit versions from a list of migration basenames. */
export function versionsOf(files) {
  const out = []
  for (const f of files ?? []) {
    const m = String(f).match(VERSION_RE)
    if (m) out.push(m[1])
  }
  return out
}

/** Highest of a set of version strings, or null. String compare: fixed width. */
export function maxVersion(versions) {
  let max = null
  for (const v of versions ?? []) {
    if (!/^\d{14}$/.test(String(v))) continue
    if (max === null || String(v) > max) max = String(v)
  }
  return max
}

/**
 * Allocate the next version.
 *
 * The clock decides in the ordinary case. `claimed` is a floor, not the source:
 * deriving from max+1 is the round-number heuristic wearing a script's clothes,
 * and two sessions running it against the same max would get the same answer —
 * which is the bug. The floor only engages when someone has already claimed a
 * version ABOVE the clock (a hand-picked 9998…, or a clock skew), and when it
 * does it says so, because that is the state in which the collision guarantee
 * no longer holds and a human should know.
 *
 * @param claimed iterable of 14-digit versions already spoken for
 * @returns {{version, reason, floor}}
 */
export function allocate({ claimed = [], now = Date.now(), env = process.env } = {}) {
  const fromClock = versionForEpoch(Math.floor(now / 1000), env)
  const floor = maxVersion(claimed)

  if (floor !== null && floor >= fromClock) {
    const bumped = bumpVersion(floor)
    // LENGTH, not a string compare. Every other comparison in this file is a
    // string compare and is correct because all versions are fixed-width 14 —
    // which is exactly what overflowing breaks. `'100000000000000' >
    // '99999999999999'` is FALSE lexicographically ('1' < '9'), so the obvious
    // form of this guard silently never fires and the allocator hands back a
    // 15-digit version that sorts BELOW everything. Found by its own test.
    if (bumped.length > 14) {
      throw new Error(
        `cannot allocate above ${floor}: it is at the 14-digit ceiling ${MAX_VERSION}`,
      )
    }
    return {
      version: bumped,
      floor,
      reason:
        `clock-derived ${fromClock} is not above the highest claimed version ${floor}, ` +
        `so this is ${floor}+1. Two sessions hitting this branch at once CAN collide. ` +
        `Someone picked a version by hand above the clock — find it (it will be a round ` +
        `number) and renumber it with --renumber, rather than raising the prefix: 9999 is ` +
        `the last one.`,
    }
  }

  // Unreachable today — versionForEpoch throws before it can produce more than
  // 14 digits — but written by length for the same reason as the branch above,
  // so the wrong pattern is not sitting here to be copied.
  if (fromClock.length > 14) {
    throw new Error(`allocated ${fromClock} exceeds the 14-digit ceiling ${MAX_VERSION}`)
  }

  return { version: fromClock, floor, reason: 'clock-derived' }
}

/** Increment a 14-digit version by one, preserving width. */
export function bumpVersion(version) {
  const v = String(version)
  if (!/^\d{14}$/.test(v)) throw new Error(`not a 14-digit version: ${version}`)
  return String(BigInt(v) + 1n).padStart(14, '0')
}

/**
 * Where an old version still appears after a renumber.
 *
 * Pure, and the reason it is pure is that getting this wrong is invisible:
 * a renumber that moves the FILE and misses an in-body reference produces a
 * migration that applies cleanly and stamps the wrong provenance. That is not
 * hypothetical in this repo — 20260919130000_tag_uncategorized_disposition.sql
 * calls `set_config('app.actor', 'migration:20260919110000_…')` three times,
 * carrying the version it was renumbered AWAY from into production data.
 *
 * Returns per-file hit counts so the caller can report what it changed rather
 * than asserting success. A replace that matches nothing and a replace that
 * matched everything look identical without the count.
 */
export function replaceVersion(content, oldVersion, newVersion, { boundOnly = false } = {}) {
  const src = String(content)
  const from = String(oldVersion)
  const to = String(newVersion)
  if (!/^\d{14}$/.test(from) || !/^\d{14}$/.test(to)) {
    throw new Error('replaceVersion takes two 14-digit versions')
  }

  if (!boundOnly) {
    // Plain global substring replace. NOT word-boundary anchored: the version
    // appears glued to other text in every shape that matters —
    // `migration:20260916120000`, `20260916120000_human_approval…`, `'…\.sql'` —
    // and \b before a digit run is satisfied by a preceding `:` or `_` anyway,
    // so anchoring buys nothing and would need its own correctness argument.
    const parts = src.split(from)
    return { content: parts.join(to), hits: parts.length - 1, bare: 0 }
  }

  // BOUND-ONLY, for files other than the migration itself.
  //
  // The distinction is between a reference that NAMES THIS MIGRATION and one
  // that merely cites a version in prose, and it is not cosmetic — the first
  // live dry run of this tool offered to rewrite a comment in its OWN source
  // that happened to mention the version being moved. A renumber that edits
  // documentation about other migrations corrupts the record (CLAUDE.md alone
  // cites 215 distinct versions) to fix a filename.
  //
  // Bound = the version is followed by `_` (the `<version>_<slug>.sql` form a
  // test's MIGRATION constant uses) or preceded by `migration:` (the actor
  // string written into production data). Anything else is a citation: it is
  // counted and returned as `bare` so the caller can report it rather than
  // silently deciding for the user.
  let hits = 0
  const bound = src.replace(
    new RegExp(`(migration:)?${from}(_)?`, 'g'),
    (match, pfx, underscore) => {
      if (!pfx && !underscore) return match
      hits += 1
      return `${pfx ?? ''}${to}${underscore ?? ''}`
    },
  )
  const total = src.split(from).length - 1
  return { content: bound, hits, bare: total - hits }
}
