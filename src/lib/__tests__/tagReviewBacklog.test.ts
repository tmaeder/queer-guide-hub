/**
 * Pins the review-backlog drain migration to its reviewed decision file, and
 * pins the restraint that makes the pass defensible: the rows judged CORRECT
 * are not touched.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSql, DECISIONS, NONACTIONS, MIGRATION } from '../../../scripts/data-quality/generate-tag-review-backlog-migration.mjs'
import type { BacklogRetraction } from '../../../scripts/data-quality/generate-tag-review-backlog-migration.d.mts'

const decisions = JSON.parse(readFileSync(DECISIONS, 'utf8')) as BacklogRetraction[]
const nonactions = JSON.parse(readFileSync(NONACTIONS, 'utf8')) as {
  review: Record<string, string>
  keep: string[]
}
const sql = readFileSync(MIGRATION, 'utf8')

describe('tag review-backlog drain', () => {
  it('is byte-identical to what the decision file generates', () => {
    expect(sql).toBe(buildSql(decisions))
  })

  it('covers the whole measured backlog exactly once', () => {
    // 109 rows were still active on their flagged QID. Every one must be
    // dispositioned — a row missing from all three buckets is a row silently
    // left publishing whatever it publishes.
    const total = decisions.length + Object.keys(nonactions.review).length + nonactions.keep.length
    expect(total).toBe(109)
    const all = [...decisions.map((d) => d.slug), ...Object.keys(nonactions.review), ...nonactions.keep]
    expect(new Set(all).size).toBe(109)
  })

  it('never clears a slug judged correct or left for review', () => {
    const untouchable = new Set([...nonactions.keep, ...Object.keys(nonactions.review)])
    expect(untouchable.size).toBeGreaterThan(0)
    const body = sql.slice(sql.indexOf('insert into _drain'))
    for (const slug of untouchable) expect(body).not.toContain(`'${slug}'`)
  })

  it('keeps a substantial share — this is not a blanket clear', () => {
    // The 2026-08-29 pass recorded that auto-clearing "wrong-looking" concept
    // QIDs destroyed ~70% correct links. A drain that retracts nearly
    // everything has stopped judging and started sweeping.
    expect(nonactions.keep.length).toBeGreaterThanOrEqual(40)
    expect(decisions.length).toBeLessThan(nonactions.keep.length + Object.keys(nonactions.review).length)
  })

  it('carries the Wikidata label as evidence for every retraction', () => {
    // The verdict is "the identifier denotes something else". That claim is
    // only checkable if the label it denotes is recorded beside it.
    for (const d of decisions) {
      expect(d.qid).toMatch(/^Q\d+$/)
      expect(d.reason.length).toBeGreaterThan(20)
    }
  })

  it('declares a non-system actor and clears wikipedia_url too', () => {
    expect(sql).toMatch(/set_config\('app\.actor',\s*'admin:[^']+'/)
    expect(sql).not.toMatch(/set_config\('app\.actor',\s*'system:/)
    const update = sql.slice(sql.indexOf('update public.unified_tags'))
    expect(update).toMatch(/wikidata_id\s+= null/)
    expect(update).toMatch(/wikipedia_url = null/)
  })

  it('re-resolves nothing and preserves prior audit evidence', () => {
    expect(sql).not.toMatch(/set\s+wikidata_id\s*=\s*'Q/)
    const arm = sql.slice(sql.indexOf('on conflict (tag_id) do update'))
    const stmt = arm.slice(0, arm.indexOf(';'))
    expect(stmt).not.toContain('previous_wikidata_id')
  })

  it('re-asserts its postcondition', () => {
    expect(sql).toMatch(/raise exception/)
    expect(sql).toMatch(/still carry the retracted identifier/)
  })
})
