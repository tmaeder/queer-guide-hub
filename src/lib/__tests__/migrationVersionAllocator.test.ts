/**
 * Guards scripts/lib/migration-versions.mjs — the allocation half of the
 * migration-version machinery.
 *
 * WHY THESE ASSERTIONS AND NOT OTHERS. Every one is anchored to a measured
 * failure from 2026-09-18/19, when #3778 and #3779 independently claimed
 * 99800101100000, #3783 then independently picked 99920101100000 (the escape
 * #3779 had chosen inside the same hour), and two of the three renumbered four
 * times each:
 *
 *   - ALLOCATION IS CLOCK-DERIVED, NOT max+1. This is the whole fix. Deriving
 *     from the highest claimed version is the round-number heuristic wearing a
 *     script's clothes: two sessions reading the same max get the same answer,
 *     which is the bug. The floor must engage ONLY when something is already
 *     claimed above the clock.
 *   - THE RESULT IS ALWAYS ABOVE THE CURRENT CEILING. `db push` aborts on a
 *     pending file sorting below applied history and takes every other queued
 *     migration with it, so an allocator that can return a low version is worse
 *     than no allocator.
 *   - WIDTH IS ALWAYS 14. A version that changed width would silently break
 *     sort order for the whole corpus at once.
 *   - BOUND-ONLY REPLACEMENT. Found by the tool's own first dry run: it offered
 *     to rewrite a comment in its OWN source that merely mentioned the version
 *     being moved. A renumber that edits prose about other migrations corrupts
 *     the record (CLAUDE.md alone cites 215 distinct versions) to fix a
 *     filename. Both directions are asserted — a citation must survive AND a
 *     real reference must move — because a replace that does nothing and a
 *     replace that does everything look identical from one side.
 */
import { describe, it, expect } from 'vitest'
import {
  allocate,
  bumpVersion,
  maxVersion,
  replaceVersion,
  versionForEpoch,
  versionsOf,
  MAX_VERSION,
} from '../../../scripts/lib/migration-versions.mjs'

/**
 * The highest HAND-PICKED version on record, and the reason the prefix is 9999.
 *
 * The allocator was written against a repo max of 99960101100000 with PREFIX
 * 9997. Within the same hour three sibling sessions hand-picked 99970101100000,
 * 99970101100100 and 99980101100000 — through the chosen prefix and out the
 * other side — so the allocator degenerated to floor+1 on its first run against
 * fresh main. A prefix low enough to leave a spare range is a prefix the
 * round-number heuristic can reach first.
 */
const HIGHEST_HAND_PICKED = '99980101100000'
const SEP_2026 = 1789798078_000 // 2026-09-19T14:47:58Z

describe('version format', () => {
  it('is 14 digits for every epoch the format supports', () => {
    for (const e of [0, 1, 1789798078, 9_999_999_999]) {
      expect(versionForEpoch(e)).toHaveLength(14)
    }
  })

  it('sorts above every version this repo has used', () => {
    expect(versionForEpoch(SEP_2026 / 1000) > HIGHEST_HAND_PICKED).toBe(true)
  })

  it('stays under the 14-digit ceiling even at the end of the epoch range', () => {
    expect(versionForEpoch(9_999_999_999) <= MAX_VERSION).toBe(true)
  })

  it('is monotonic in time', () => {
    expect(versionForEpoch(1_789_798_078) < versionForEpoch(1_789_798_079)).toBe(true)
  })

  it('refuses an epoch that no longer fits, rather than truncating', () => {
    // Truncating would shorten the version and invert sort order for everything
    // allocated afterwards. Year 2286 is not a live concern; a silent width
    // change would be, so it is an error.
    expect(() => versionForEpoch(10_000_000_000)).toThrow(/widening/)
  })

  it('rejects a prefix that is not exactly 4 digits', () => {
    expect(() => versionForEpoch(1_789_798_078, { MIGRATION_VERSION_PREFIX: '999' })).toThrow()
    expect(() => versionForEpoch(1_789_798_078, { MIGRATION_VERSION_PREFIX: 'abcd' })).toThrow()
  })
})

describe('allocate', () => {
  const now = SEP_2026

  it('derives from the clock, NOT from max+1 — this is the entire fix', () => {
    // If this ever becomes max+1, two concurrent sessions reading the same
    // claimed set get the same version again and the collision is back.
    const low = allocate({ claimed: ['20260101000000'], now })
    const high = allocate({ claimed: [HIGHEST_HAND_PICKED], now })
    expect(low.version).toBe(high.version)
    expect(low.reason).toBe('clock-derived')
  })

  it('separates two sessions one second apart', () => {
    const a = allocate({ claimed: [], now })
    const b = allocate({ claimed: [], now: now + 1000 })
    expect(a.version).not.toBe(b.version)
    expect(a.version < b.version).toBe(true)
  })

  it('always returns above the highest claimed version', () => {
    for (const claimed of [[], ['20260101000000'], [HIGHEST_HAND_PICKED], ['99940101110000']]) {
      const { version } = allocate({ claimed, now })
      const floor = maxVersion(claimed)
      if (floor) expect(version > floor).toBe(true)
    }
  })

  it('falls back to floor+1 when something is already claimed above the clock, and says so', () => {
    // The degenerate case, and it is not hypothetical — it is what the first
    // run of this allocator against fresh main actually did, because sibling
    // sessions had hand-picked past the prefix inside the hour it took to write.
    // Correctness wins (the version must still sort above), but the collision
    // guarantee no longer holds, so it must not be silent.
    const { version, reason } = allocate({ claimed: ['99999999999998'], now })
    expect(version).toBe('99999999999999')
    expect(reason).not.toBe('clock-derived')
    expect(reason).toMatch(/collide/)
  })

  it('throws rather than wrapping past the 14-digit ceiling', () => {
    expect(() => allocate({ claimed: [MAX_VERSION], now })).toThrow(/ceiling/)
  })

  it('ignores malformed entries in the claimed set', () => {
    expect(maxVersion(['nope', '123', HIGHEST_HAND_PICKED])).toBe(HIGHEST_HAND_PICKED)
    expect(maxVersion([])).toBeNull()
  })
})

describe('versionsOf', () => {
  it('reads versions out of migration basenames and skips non-migrations', () => {
    expect(versionsOf(['20260916120000_a.sql', 'README.md', 'bad.sql', '123_x.sql'])).toEqual([
      '20260916120000',
    ])
  })
})

describe('bumpVersion', () => {
  it('preserves 14-digit width', () => {
    expect(bumpVersion('00000000000000')).toBe('00000000000001')
    expect(bumpVersion('99940101100000')).toBe('99940101100001')
  })
  it('refuses a non-version', () => {
    expect(() => bumpVersion('123')).toThrow()
  })
})

describe('replaceVersion', () => {
  const OLD = '99960101100000'
  const NEW = '99971789798078'

  it('rewrites every occurrence in the migration itself', () => {
    // Inside the migration, every mention is about itself — including the
    // `migration:<version>` actor string, which reaches PRODUCTION DATA. Missing
    // one there is exactly how 20260919130000_tag_uncategorized_disposition.sql
    // came to stamp `migration:20260919110000` three times.
    const src = `-- ${OLD}\nperform set_config('app.actor', 'migration:${OLD}_x', true);\n-- see ${OLD}\n`
    const { content, hits } = replaceVersion(src, OLD, NEW)
    expect(hits).toBe(3)
    expect(content).not.toContain(OLD)
    expect(content).toContain(`migration:${NEW}_x`)
  })

  it('bound-only: moves a test MIGRATION constant', () => {
    const src = `const MIGRATION = '${OLD}_tag_hygiene_stats.sql';`
    const { content, hits, bare } = replaceVersion(src, OLD, NEW, { boundOnly: true })
    expect(hits).toBe(1)
    expect(bare).toBe(0)
    expect(content).toContain(`${NEW}_tag_hygiene_stats.sql`)
  })

  it('bound-only: moves a migration:<version> actor string', () => {
    const { content, hits } = replaceVersion(`'migration:${OLD}'`, OLD, NEW, { boundOnly: true })
    expect(hits).toBe(1)
    expect(content).toBe(`'migration:${NEW}'`)
  })

  it('bound-only: LEAVES a bare citation alone and counts it', () => {
    // The failure the tool found in its own first dry run.
    const src = `-- against a max of ${OLD} there are 39,898,899,999 increments remaining`
    const { content, hits, bare } = replaceVersion(src, OLD, NEW, { boundOnly: true })
    expect(hits).toBe(0)
    expect(bare).toBe(1)
    expect(content).toBe(src)
  })

  it('bound-only: handles both shapes in one file without disturbing the citation', () => {
    const src = `const M = '${OLD}_x.sql'; // supersedes ${OLD}\n`
    const { content, hits, bare } = replaceVersion(src, OLD, NEW, { boundOnly: true })
    expect(hits).toBe(1)
    expect(bare).toBe(1)
    expect(content).toBe(`const M = '${NEW}_x.sql'; // supersedes ${OLD}\n`)
  })

  it('refuses anything that is not a pair of 14-digit versions', () => {
    expect(() => replaceVersion('x', '123', NEW)).toThrow()
  })
})
