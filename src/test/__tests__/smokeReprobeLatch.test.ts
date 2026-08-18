import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `reprobe_origin` in scripts/smoke-pages.sh returns its answer in the global
 * REPROBE_CT and latches ORIGIN_RECHECKED so the propagation wait is paid ONCE
 * per run rather than once per failing asset.
 *
 * The obvious way to write it — `busted=$(reprobe_origin ...)` — is wrong, and
 * wrong in a way no reading catches: command substitution runs the function in
 * a SUBSHELL, so the latch is discarded on return and every failing asset pays
 * the full wait again. That is how this job reached 18m43s and had to be fixed
 * twice already (#2747, #2756). It was caught here by testing the latch, not by
 * reading the code: the second call still slept.
 *
 * These are text assertions on purpose — there is no bash harness in this repo,
 * and the failure mode is syntactic.
 */
const SCRIPT = resolve(__dirname, '../../../scripts/smoke-pages.sh')
const raw = readFileSync(SCRIPT, 'utf8')

/**
 * Assert against CODE, not prose. This file's own comments quote the wrong
 * form (`$(reprobe_origin ...)`) as the counter-example, and the script's
 * comments quote the verdict strings — scanning the raw text matches those and
 * every assertion here fails or, worse, passes on a comment.
 */
const src = raw
  .split('\n')
  .filter((l) => !/^\s*#/.test(l))
  .join('\n')

describe('smoke-pages.sh reprobe_origin latch', () => {
  it('never captures reprobe_origin through command substitution', () => {
    // `$(reprobe_origin` or backticks would put the latch in a subshell.
    const substituted = src.match(/\$\(\s*reprobe_origin|`\s*reprobe_origin/g)
    expect(substituted, 'reprobe_origin must be called as a bare statement, then read from $REPROBE_CT').toBeNull()
  })

  it('reads its result from the REPROBE_CT global', () => {
    expect(src).toContain('busted=$REPROBE_CT')
  })

  it('latches only on a SUCCESSFUL probe, never on having tried', () => {
    const fn = src.slice(src.indexOf('reprobe_origin() {'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    // Every assignment of the latch must sit on a line that also matched the
    // wanted content type. Latching after a failed wait is what made run
    // 31912682120 report 52 assets as ORIGIN IS BROKEN 0.4s apart: the first
    // one consumed the only wait, and nothing had proven the origin was up.
    const lines = body.split('\n')
    const WANT_ARM = /\*"\$want"\*\)/
    // Walk back to the nearest control-flow boundary. If it is the want-arm,
    // the assignment is inside a successful-probe branch; if it is anything
    // else (esac / ;; / else / fi) the assignment escaped that branch.
    const BOUNDARY = /(^|\s)(esac|;;|else|fi)(\s|$)|\*"\$want"\*\)/
    let checked = 0
    for (const [i, line] of lines.entries()) {
      if (!/ORIGIN_RECHECKED=1/.test(line)) continue
      checked++
      if (WANT_ARM.test(line)) continue // same-line case arm
      const prior = lines.slice(0, i).reverse().find((l) => BOUNDARY.test(l)) ?? ''
      expect(prior, `ORIGIN_RECHECKED=1 on line ${i} is not inside a *"$want"*) arm`).toMatch(
        WANT_ARM,
      )
    }
    expect(checked, 'no ORIGIN_RECHECKED=1 found — the assertion would be vacuous').toBeGreaterThan(0)
  })

  it('bounds the total wait with one budget for the whole run', () => {
    const fn = src.slice(src.indexOf('reprobe_origin() {'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    // Unbounded waiting per asset is the 18m43s regression (#2747, #2756). The
    // sleep must be governed by a run-wide budget that it also decrements,
    // otherwise the loop is only bounded by the number of failing assets.
    expect(body).toMatch(/while \[ "\$REPROBE_SPENT" -lt "\$REPROBE_BUDGET" \]/)
    expect(body).toContain('REPROBE_SPENT=$((REPROBE_SPENT + 5))')
    expect(body).toContain('sleep')
    // And a proven-ready origin must short-circuit before any budget is spent.
    const beforeLoop = body.slice(0, body.indexOf('while ['))
    expect(beforeLoop).toContain('[ -n "$ORIGIN_RECHECKED" ] && return')
  })

  it('re-probes the origin before any asset is called ORIGIN IS BROKEN', () => {
    const idxReprobe = src.indexOf('reprobe_origin "$path" "$want"')
    const idxVerdict = src.indexOf('ORIGIN IS BROKEN')
    expect(idxReprobe).toBeGreaterThan(-1)
    expect(idxVerdict).toBeGreaterThan(idxReprobe)
  })

  it('re-reads a suspect deep route before failing it as stale', () => {
    const idxReRead = src.indexOf('cached=$(entry_hash "$SITE$route")')
    const idxStale = src.indexOf('serves a STALE cached document')
    expect(idxReRead).toBeGreaterThan(-1)
    expect(idxStale).toBeGreaterThan(idxReRead)
  })
})
