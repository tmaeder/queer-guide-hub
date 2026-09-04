/**
 * Pins the tag-merge migration to the reviewed decision file, and pins the two
 * safety steps that the cross-category merges depend on. Sibling of
 * tagQidRetraction.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSql, pairs, DECISIONS, MIGRATION } from '../../../scripts/data-quality/generate-tag-merge-migration.mjs'
import { retractions } from '../../../scripts/data-quality/generate-tag-qid-retraction-migration.mjs'
import type { TagDecision } from '../../../scripts/data-quality/generate-tag-qid-retraction-migration.d.mts'

const decisions = JSON.parse(readFileSync(DECISIONS, 'utf8')) as TagDecision[]
const sql = readFileSync(MIGRATION, 'utf8')

describe('tag merge migration', () => {
  it('is byte-identical to what the decision file generates', () => {
    expect(sql).toBe(buildSql(decisions))
  })

  it('merges exactly the pairs the decision file names', () => {
    const rows = pairs(decisions)
    const expected = decisions
      .filter((d) => d.disposition === 'merge')
      .flatMap((d) => d.losers.map((l) => `${d.winner}<-${l}`))
    expect(rows.map((r) => `${r.winner}<-${r.loser}`).sort()).toEqual(expected.sort())
  })

  it('honours a partial merge instead of absorbing the whole group', () => {
    // Q48270: enby is a synonym of non-binary, gender-non-conforming is not.
    // Auto-deriving losers as "every member except the winner" would swallow it.
    const g = decisions.find((d) => d.wikidata_id === 'Q48270')
    expect(g).toBeDefined()
    expect(g?.excluded).toContain('gender-non-conforming')
    expect(g?.losers).toEqual(['enby'])
    expect(pairs(decisions).some((p) => p.loser === 'gender-non-conforming')).toBe(false)
  })

  it('never merges a slug the retraction migration touches', () => {
    // The two migrations ship separately and must stay disjoint: retracting a
    // row mid-merge, or merging away a row whose identifier is being cleared,
    // makes the order they apply in load-bearing.
    const retracted = new Set(retractions(decisions).map((r) => r.slug))
    expect(retracted.size).toBeGreaterThan(0)
    for (const p of pairs(decisions)) {
      expect(retracted.has(p.winner)).toBe(false)
      expect(retracted.has(p.loser)).toBe(false)
    }
  })

  it('clears the loser primary flag BEFORE calling merge_tag_concept', () => {
    // tag_category_assignments_one_primary_per_tag is UNIQUE(tag_id) WHERE
    // is_primary. Reparenting the loser's primary row gives the winner two and
    // the merge dies on 23505. Order is the fix, so order is what is pinned.
    const demote = sql.indexOf('set is_primary = false')
    const merge = sql.indexOf('perform public.merge_tag_concept')
    expect(demote).toBeGreaterThan(-1)
    expect(merge).toBeGreaterThan(-1)
    expect(demote).toBeLessThan(merge)
  })

  it('strips carried junctions against a snapshot, not a fixed category', () => {
    // Winners legitimately hold several categories (drag-queen has 3). Deleting
    // "everything except the intended one" would destroy real filings.
    expect(sql).toContain('array_agg(category_id)')
    expect(sql).toMatch(/delete from public\.tag_category_assignments\s+where tag_id = v_wid and not \(category_id = any\(v_before\)\)/)
  })

  it('aborts if a merge moves the winner is_adult or seo_indexable', () => {
    expect(sql).toMatch(/is_adult is distinct from v_adult/)
    expect(sql).toMatch(/seo_indexable is distinct from v_index/)
    expect(sql).toMatch(/raise exception[\s\S]{0,120}is_adult\/seo_indexable/)
  })

  it('skips an already-merged loser rather than aborting the batch', () => {
    expect(sql).toMatch(/v_skipped := v_skipped \+ 1;\s*\n\s*continue;/)
  })

  it('counts primaries over DISTINCT winners', () => {
    // film absorbs both cinema and movies, so joining _merge directly counts its
    // single primary row twice. That false positive fired on the first dry run.
    const check = sql.slice(sql.indexOf('into v_primary from ('))
    expect(check).toContain('select distinct winner from _merge')
  })

  it('re-asserts its postconditions', () => {
    expect(sql).toMatch(/loser\(s\) still active/)
    expect(sql).toMatch(/multiple primary categories/)
  })
})
