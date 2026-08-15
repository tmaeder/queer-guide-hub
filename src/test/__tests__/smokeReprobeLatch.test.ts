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

  it('latches so the sleep is paid once per run, not once per asset', () => {
    const fn = src.slice(src.indexOf('reprobe_origin() {'))
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('ORIGIN_RECHECKED')
    // The sleep must sit inside the guarded first-time branch only.
    const guarded = body.slice(body.indexOf('if [ -z "$ORIGIN_RECHECKED" ]'), body.indexOf('else'))
    expect(guarded).toContain('sleep')
    expect(body.slice(body.indexOf('else'))).not.toContain('sleep')
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
