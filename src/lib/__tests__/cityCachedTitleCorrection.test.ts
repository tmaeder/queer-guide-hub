import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards `22500101100000_publish_cached_title_city_descriptions.sql`, which corrects the
// two city descriptions that were grounded in the BARE Wikipedia name and never replaced
// by the correct article the row had already fetched.
//
// The behavioural half of this change is asserted in
// `supabase/functions/_shared/city-wiki-guard.test.ts`: that the text this migration
// REMOVES is refused by the seal and the text it PUBLISHES is adopted by it. What is
// asserted here is the migration's own structure — the properties whose removal would
// leave a file that still applies cleanly and still reports success.

const MIGRATION = '22500101100000_publish_cached_title_city_descriptions.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Every assertion runs against comment-stripped SQL. A long explanatory header makes a
// text-based guard satisfiable by the prose while the guard itself is gone — that has
// been caught by mutation testing twice in this repo, so it is not a hypothetical.
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('the cached-title city description correction', () => {
  it('keys the rows by ID, never by slug or name', () => {
    expect(sql).toMatch(/c\.id\s*=\s*w\.city_id/);
    // A slug- or name-keyed repair is what would have destroyed the AUSTRALIAN Brisbane
    // in the previous pass, whose byte-identical description was correct for its own row.
    expect(sql).not.toMatch(/c\.slug\s*=/);
    expect(sql).not.toMatch(/c\.name\s*=\s*w\./);
  });

  it('does NOT use the two-level jsonb_set that silently writes nothing', () => {
    // jsonb_set(fp, '{description,corrected}', ..., true) creates only the LAST path
    // element, so on a row with no `description` key it writes nothing while every other
    // check still passes. Build the nested object with `||` instead.
    expect(sql).not.toMatch(/jsonb_set/);
    expect(sql).toMatch(/coalesce\(c\.field_provenance -> 'description', '\{\}'::jsonb\)/);
  });

  it('writes only where the wrong text is still present, so a human fix is never overwritten', () => {
    expect(sql).toMatch(/c\.description is not null/);
    expect(sql).toMatch(/c\.description ilike w\.wrong_signature/);
  });

  it('preserves the text it replaces', () => {
    // A correction that does not keep the prior value is unreviewable after the fact.
    expect(sql).toMatch(/'from', c\.description/);
    expect(sql).toMatch(/'title', c\.wikipedia_title/);
  });

  it('stamps the correction with this migration version, matching what it counts', () => {
    // The value written and the value the postcondition counts are the load-bearing
    // pair: if they disagree, the postcondition reports 0 corrections after already
    // having rewritten the descriptions.
    const stamps = sql.match(/migration:22500101100000/g) ?? [];
    expect(stamps.length).toBe(2);
  });

  it('asserts both rows were corrected', () => {
    const block = sql.slice(sql.indexOf('if v_corrected'));
    expect(block).toMatch(/v_corrected <> 2/);
    expect(block).toMatch(/raise exception/);
  });

  it('asserts neither wrong-subject lead survives anywhere in cities', () => {
    // Scoped to the signature check, not the file: a bare match on the phrase is
    // satisfied by the UPDATE's own guard list and stays green if this postcondition
    // is deleted.
    const idx = sql.indexOf('v_wrong_left');
    const block = sql.slice(idx);
    expect(block).toMatch(/Cambria is a name for Wales%/);
    expect(block).toMatch(/Timon is a masculine given name%/);
    expect(block).toMatch(/v_wrong_left > 0/);
    expect(block).toMatch(/raise exception/);
  });

  it('carries a positive control for each city, not just the removal', () => {
    // Removing the wrong text is not the goal; publishing the right text is. Without
    // these, a migration that blanked both descriptions would pass every other check.
    expect(sql).toMatch(/San Luis Obispo County, California%'\s*\n?\s*into v_cambria_ok/);
    expect(sql).toMatch(/Brazilian municipality in the State of Maranh%'\s*\n?\s*into v_timon_ok/);
    const cam = sql.slice(sql.indexOf('if not coalesce(v_cambria_ok'));
    expect(cam).toMatch(/raise exception/);
    const tim = sql.slice(sql.indexOf('if not coalesce(v_timon_ok'));
    expect(tim).toMatch(/raise exception/);
  });

  it('publishes a literal rather than reading the row jsonb at apply time', () => {
    // What lands must be exactly what was verified against live Wikipedia, not whatever
    // a later enrichment pass happened to leave in `candidates` by the time CI applies
    // this. So the correct text is a VALUES literal and the candidate path is not read.
    expect(sql).toMatch(/set description = w\.correct_text/);
    expect(sql).not.toMatch(/->\s*'candidates'/);
  });

  it('sorts above the applied ceiling it was authored against', () => {
    // `db push` aborts on the FIRST migration sorting below remote max(version) and
    // takes every later migration in the same push with it, so a version below the
    // ceiling is repo-blocking rather than merely this PR's problem.
    //
    // This file has been renumbered once already: it shipped as 21050101100100 to sit
    // beside its applied sibling 21050101100000, and #3646 then applied
    // 22000101100000/100100/100200 — a 2099 -> 2200 jump — which put it below the
    // ceiling. The ceiling moved 2070 -> 2075 -> 2080 -> 2099 -> 2200 in one day, so
    // NO FIXED HEADROOM SURVIVES THIS REPO and this assertion is a floor, not a proof
    // of safety: re-read the live ceiling before merging, never this constant.
    expect(MIGRATION > '22000101100200_').toBe(true);
  });
});
