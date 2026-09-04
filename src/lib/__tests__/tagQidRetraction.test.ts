/**
 * The QID-retraction migration is GENERATED from the reviewed decision file.
 * This pins the two together so an edit to either without the other fails CI --
 * a hand-edited migration would silently stop matching the decisions a human
 * actually signed off on, which is the only record of why each row was touched.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSql, retractions, DECISIONS, MIGRATION } from '../../../scripts/data-quality/generate-tag-qid-retraction-migration.mjs'

const decisions = JSON.parse(readFileSync(DECISIONS, 'utf8'))
const sql = readFileSync(MIGRATION, 'utf8')

describe('tag QID retraction migration', () => {
  it('is byte-identical to what the decision file generates', () => {
    expect(sql).toBe(buildSql(decisions))
  })

  it('retracts exactly the slugs dispositioned wrong-qid, and no others', () => {
    const rows = retractions(decisions)
    const expected = decisions
      .filter((d: any) => d.disposition === 'wrong-qid' || d.disposition === 'qid-belongs-to-neither')
      .flatMap((d: any) => d.retract)
    expect(rows.map((r) => r.slug).sort()).toEqual(expected.sort())
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length) // no slug twice
  })

  it('never retracts a slug that some other group is merging INTO', () => {
    // Retracting a merge winner's identifier would strip the QID off the row
    // the merge migration is about to make canonical.
    const winners = new Set(decisions.map((d: any) => d.winner).filter(Boolean))
    for (const r of retractions(decisions)) expect(winners.has(r.slug)).toBe(false)
  })

  it('leaves every no-write disposition completely untouched', () => {
    // generic-sense twins and real vocabulary boundaries are decisions to do
    // NOTHING. If one ever appears in the SQL body, the disposition was ignored.
    const untouched = decisions
      .filter((d: any) => d.disposition === 'generic-sense-twin' || d.disposition === 'cross-vocab')
      .flatMap((d: any) => d.members.filter((m: any) => m.status === 'active').map((m: any) => m.slug))
    expect(untouched.length).toBeGreaterThan(0) // the assertion must have subjects
    const body = sql.slice(sql.indexOf('insert into _retract'))
    for (const slug of untouched) expect(body).not.toContain(`'${slug}'`)
  })

  it('declares a non-system actor', () => {
    // log_unified_tag_change() RAISEs when an undeclared system:% actor edits a
    // human_reviewed row, and 30 of these are human_reviewed. Without this the
    // migration aborts -- and the before_data snapshot that makes it reversible
    // would never be written.
    expect(sql).toMatch(/set_config\('app\.actor',\s*'admin:[^']+'/)
    expect(sql).not.toMatch(/set_config\('app\.actor',\s*'system:/)
  })

  it('clears wikipedia_url alongside wikidata_id', () => {
    // 28 of the 34 link to the wrong article. Clearing the identifier while
    // leaving the link published keeps serving the wrong identity.
    const update = sql.slice(sql.indexOf('update public.unified_tags'))
    expect(update).toMatch(/wikidata_id\s*=\s*null/)
    expect(update).toMatch(/wikipedia_url\s*=\s*null/)
  })

  it('re-asserts its own postcondition and preserves prior audit evidence', () => {
    expect(sql).toMatch(/raise exception/)
    expect(sql).toContain('on conflict (tag_id) do update')
    // The conflict arm must NOT rewrite the previous_* columns -- 8 of these
    // already carry a 2026-08-29 'review' row, and that is the older evidence.
    const arm = sql.slice(sql.indexOf('on conflict (tag_id) do update'))
    const stmt = arm.slice(0, arm.indexOf(';'))
    expect(stmt).not.toContain('previous_wikidata_id')
    expect(stmt).not.toContain('previous_wikipedia_url')
  })

  it('re-resolves nothing — every retraction is to NULL', () => {
    // A plausible-but-wrong QID regenerates wrong data weekly; a null one
    // regenerates nothing. There must be no re-assignment anywhere.
    expect(sql).not.toMatch(/set\s+wikidata_id\s*=\s*'Q/)
  })
})
