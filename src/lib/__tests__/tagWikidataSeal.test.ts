/**
 * The seal on unified_tags.wikidata_id is a DATABASE trigger, so it cannot be
 * unit-tested directly from here. What this pins is the set of properties that
 * make it a seal rather than decoration — each one is a thing that, if quietly
 * dropped in a later edit, would reopen the producer without any test going red.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase', 'migrations')

/** The newest migration defining the seal — later edits must keep these properties. */
function sealSql(): string {
  const file = readdirSync(DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .filter((f) => readFileSync(join(DIR, f), 'utf8').includes('enforce_tag_wikidata_identity'))
    .sort()
    .pop()
  if (!file) throw new Error('no migration defines enforce_tag_wikidata_identity')
  return readFileSync(join(DIR, file), 'utf8')
}

const sql = sealSql()

/** Just the trigger function body — the RPC and the verify block repeat several
 *  of these strings, so an unscoped match can be satisfied by the wrong copy.
 *  Mutation-testing caught exactly that: deleting the rule from the TRIGGER left
 *  the suite green because the same text still appeared in the RPC. */
const triggerFn = (() => {
  const start = sql.indexOf('function public.enforce_tag_wikidata_identity')
  return sql.slice(start, sql.indexOf('$fn$;', start))
})()

describe('unified_tags.wikidata_id seal', () => {
  it('is a table-level trigger, not a check inside one writer', () => {
    // tag-wiki-guard.ts only governs tag-enrichment-sweep. The RPC, migrations,
    // scripts and psql all reach the column directly.
    expect(sql).toMatch(/create trigger trg_unified_tags_wikidata_identity/)
    expect(sql).toMatch(/before insert or update on public\.unified_tags/)
  })

  it('is UNSCOPED and tests the column itself', () => {
    // `UPDATE OF wikidata_id` fires on the columns named in the STATEMENT, not
    // on what another BEFORE trigger actually wrote (20260807100200).
    const trigger = sql.slice(sql.indexOf('create trigger trg_unified_tags_wikidata_identity'))
    expect(trigger).not.toMatch(/update of/i)
    expect(sql).toMatch(/new\.wikidata_id is not distinct from old\.wikidata_id/)
  })

  it('blocks re-adoption of an identifier the tag was cleared of', () => {
    // This is the exact predicate tag_wikidata_repair_regressions() reports.
    // The detector has existed since 2026-08-29 and could only ever describe
    // the regression after it shipped.
    expect(triggerFn).toMatch(/disposition\s*=\s*'cleared'/)
    expect(triggerFn).toMatch(/previous_wikidata_id\s*=\s*new\.wikidata_id/)
  })

  it('blocks a NEW duplicate across active tags', () => {
    expect(triggerFn).toMatch(/t\.wikidata_id\s*=\s*new\.wikidata_id/)
    expect(triggerFn).toMatch(/t\.status\s*=\s*'active'/)
    expect(triggerFn).toMatch(/t\.id\s*<>\s*new\.id/)
  })

  it('rejects anything that is not a QID', () => {
    // Mutation-testing found this unasserted: guarding the format check behind
    // `if false and ...` left the whole suite green.
    expect(triggerFn).toMatch(/new\.wikidata_id\s*!~\s*'\^Q\[1-9\]\[0-9\]\*\$'/)
    expect(triggerFn).not.toMatch(/if\s+false\s+and/i)
  })

  it('always permits clearing — prefer NULL to a guess', () => {
    expect(sql).toMatch(/if new\.wikidata_id is null then\s*\n\s*return new;/)
  })

  it('carries its own prod verification, including a POSITIVE control', () => {
    // Three "must refuse" probes all pass against a trigger that refuses
    // everything. Without a "must still allow" probe the migration cannot tell
    // a seal from a wall.
    expect(sql).toMatch(/SEAL FAILED: re-adoption/)
    expect(sql).toMatch(/SEAL FAILED: duplicate/)
    expect(sql).toMatch(/SEAL FAILED: malformed/)
    // BOTH arms: "was refused" (the seal rejected it) and "did not land" (it
    // was accepted but silently wrote nothing). Asserting the phrase once
    // passes when either is deleted.
    expect(sql).toMatch(/SEAL TOO TIGHT: legitimate identifier % was refused/)
    expect(sql).toMatch(/SEAL TOO TIGHT: legitimate identifier % did not land/)
  })

  it('declares an actor before the verification writes', () => {
    // The probes UPDATE real rows; log_unified_tag_change() raises when an
    // undeclared system:% actor touches a human_reviewed row, which would fail
    // the block for the wrong reason.
    const verify = sql.slice(sql.indexOf('$verify$'))
    expect(verify).toMatch(/set_config\('app\.actor',\s*'admin:/)
  })

  it('restates the RPC parameter defaults', () => {
    // CREATE OR REPLACE without them fails 42P13, and the sweep calls this RPC
    // with named arguments and omits the ones it does not need.
    const rpc = sql.slice(sql.indexOf('function public.tag_enrichment_apply'))
    expect(rpc).toMatch(/p_category_id uuid default null/i)
    expect(rpc).toMatch(/p_description text default null/i)
  })

  it('makes the RPC refuse without raising', () => {
    // A raise inside the RPC aborts the sweep's statement; a false is a
    // countable refusal that lets the run continue.
    const links = sql.slice(sql.indexOf("elsif p_kind = 'links'"))
    const body = links.slice(0, links.indexOf("elsif p_kind = 'description'"))
    // Two refusals: re-adoption and duplicate. Both must be `return false`.
    expect(body.match(/return false;/g)?.length).toBe(2)
    expect(body).not.toMatch(/raise exception/)
  })
})
