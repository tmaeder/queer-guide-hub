import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790713569_event_city_link_stale_stamps.sql.
//
// `run_event_city_link` skips any row already carrying an `event_city_link` stamp, so a
// row judged unresolvable stays unresolvable after the thing that blocked it is fixed.
// 219 events had an exact-name match in their own country and were unlinked anyway,
// every stamp dated 2026-08-01..08-09 — before the country-code repair, the same-name
// guards, the alias harvest and the exonym merges all landed.
//
// THE FILE IS NOT `p_force => true`, AND THAT IS ITS WHOLE POINT. Three of the city
// names resolve to the WRONG city, and neither the exact-name arm nor the guards can
// tell, because `cities` holds at most one row per (name, country) so an
// unrepresentable twin looks identical to a unique name. Read from each event's own
// source payload:
//
//   Hammond  -> events are Hammond, INDIANA (Crown Point IN address, Valparaiso/HJR-6
//               rally, Portage); our only US row is Hammond, LOUISIANA
//   Orange   -> event titles itself "Orange, CA" with a Katella Ave address; our only
//               US row is Orange, CONNECTICUT
//   Milton   -> Milton Theatre / Magnolia Applebottom is Milton, DELAWARE; our only US
//               row is Milton, PENNSYLVANIA
//
// So the file SEALS those first, then RELEASES the 210 verified rows by deleting their
// stale stamp and letting the shipped guarded runner do the linking.
//
// THE SEAL IS `events.state`, NOT THE STAMP. A stamp cannot hold — `p_force => true`
// ignores it by definition. `state` holds because guard A refuses on
// `regions_contradict(state, region_name)`, which is re-derived on every run. Verified
// live: ('Indiana','Louisiana'), ('California','Connecticut') and
// ('Delaware','Pennsylvania') are all TRUE while ('Texas','Texas') and
// (null,'Louisiana') are FALSE.
//
// Assertions run over COMMENT-STRIPPED source and are scoped to the statement they are
// about: this migration's header names every city, every state pair and the phrase
// `p_force` in prose, so a bare toContain over the raw file passes against a deleted
// guard — the vacuous-assertion class CLAUDE.md records repeatedly.

const MIGRATION = '99991790713569_event_city_link_stale_stamps.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** Everything before the postconditions: the writes themselves. */
const writes = statements.slice(0, statements.indexOf('DO $verify$'));
/** Just the postconditions. */
const verify = statements.slice(statements.indexOf('DO $verify$'));

describe('the three wrong cities are sealed', () => {
  it('writes the contradicting state, which is what makes guard A refuse', () => {
    // Not decoration: without these, a later `p_force => true` links all ten rows to
    // Louisiana / Connecticut / Pennsylvania.
    expect(writes).toContain("set state = 'Indiana'");
    expect(writes).toContain("set state = 'California'");
  });

  it("leaves Milton's state alone, because it is already correct", () => {
    // The two Milton rows already carry state='Delaware', so guard A blocks them
    // unaided. This file does not rewrite correct data.
    expect(writes).not.toContain("set state = 'Delaware'");
    // and it still targets them, keyed on that existing value
    expect(writes).toContain("lower(btrim(coalesce(e.state, ''))) = 'delaware'");
  });

  it('only seals rows whose state is still empty', () => {
    // Guards against clobbering a state someone has since set from better evidence.
    const emptyStateGuards = writes.match(/coalesce\(btrim\(e\.state\), ''\) = ''/g) ?? [];
    expect(emptyStateGuards.length).toBe(2);
  });

  it('never writes city_id on a sealed row', () => {
    // A seal that linked would be the defect wearing a fix's clothes.
    const sealBlock = writes.slice(0, writes.indexOf('with verified'));
    expect(sealBlock).not.toMatch(/set[\s\S]*city_id\s*=/);
    expect(sealBlock).toContain('needs_attention = true');
  });
});

describe('the release', () => {
  it('happens AFTER the seal, or the runner links the wrong cities first', () => {
    // Order is the correctness condition, so it is asserted by offset rather than by
    // presence — both statements exist in either arrangement.
    const seal = writes.indexOf("set state = 'Indiana'");
    const release = writes.indexOf('with verified');
    const runner = writes.indexOf('run_event_city_link');
    expect(seal).toBeGreaterThan(-1);
    expect(release).toBeGreaterThan(seal);
    expect(runner).toBeGreaterThan(release);
  });

  it('deletes the stale stamp and never writes city_id itself', () => {
    // The point is to let the SHIPPED guarded runner decide. Writing city_id here
    // would bypass guards A and B and reimplement the thing under test.
    expect(writes).toContain("set enrichment_status = e.enrichment_status - 'event_city_link'");
    const releaseBlock = writes.slice(writes.indexOf('with verified'));
    expect(releaseBlock).not.toMatch(/set[\s\S]*\bcity_id\s*=/);
  });

  it('never forces the runner', () => {
    // p_force => true re-evaluates every unlinked row, including the sealed ones and
    // ~600 this file is not about.
    expect(writes).toContain('run_event_city_link(300, false)');
    expect(writes).not.toMatch(/run_event_city_link\s*\([^)]*true/);
  });

  it('corroborates every released name against an EXPECTED region', () => {
    // The residual risk of the exact-name arm is a same-name twin, so the release is
    // pinned by (city, country, region) — if `cities` moved since this was measured the
    // row does not match and is not released.
    expect(writes).toContain('c.region_name is not distinct from v.region');
    // `is not distinct from`, not `=`: Windsor's region_name is NULL and `=` would
    // silently drop it.
    expect(writes).not.toMatch(/c\.region_name\s*=\s*v\.region/);
  });

  it('pins the 17 verified names and no others', () => {
    const block = writes.slice(writes.indexOf('with verified'), writes.indexOf('target as'));
    for (const city of [
      'Atlantic City',
      'Toledo',
      'Galveston',
      'Victoria',
      'Youngstown',
      'Stamford',
      'Green Bay',
      'Longview',
      'Fort Wayne',
      'Sioux Falls',
      'Santa Fe',
      'Santa Cruz',
      'Santa Rosa',
      'Roanoke',
      'San José',
      'River Edge',
      'Windsor',
    ]) {
      expect(block).toContain(`'${city}'`);
    }
    // The wrong three must never appear in the release list.
    expect(block).not.toMatch(/'Hammond'/);
    expect(block).not.toMatch(/'Orange'/);
    expect(block).not.toMatch(/'Milton'/);
  });

  it('only releases rows that were not blocked by a guard', () => {
    // A guard-blocked row is a decision, not a stale stamp. Releasing it would undo
    // the same-name protection of 20260802090844.
    expect(writes).toContain("e.enrichment_status->'event_city_link'->>'blocked' is null");
  });
});

describe('postconditions', () => {
  it('assert the wrong cohorts did not get linked', () => {
    expect(verify).toMatch(/lower\(btrim\(e\.city\)\) IN \('hammond', 'orange', 'milton'\)/);
    expect(verify).toContain("RAISE EXCEPTION 'P1:");
  });

  it('assert the SEAL itself, not just the absence of a link', () => {
    // P1 alone passes while the rows are unsealed and merely not yet re-run. P2 is what
    // proves a future forced run still refuses.
    expect(verify).toContain('NOT public.regions_contradict(e.state, c.region_name)');
    expect(verify).toContain("RAISE EXCEPTION 'P2:");
  });

  it('assert the released cohort is actually linked', () => {
    expect(verify).toMatch(/v_linked < 200/);
  });

  it('assert each link landed on a city of the same name', () => {
    expect(verify).toContain('lower(btrim(c.name)) <> lower(btrim(e.city))');
  });

  it('assert the two riskiest names resolved to the right region', () => {
    // Toledo also exists in Spain and Brazil; Victoria also in the Seychelles. A count
    // check cannot see a wrong-region link, so these are named explicitly.
    expect(verify).toContain("IS DISTINCT FROM 'Ohio'");
    expect(verify).toContain("IS DISTINCT FROM 'British Columbia'");
  });

  it('raise on every failure and never short-circuit', () => {
    const raises = verify.match(/RAISE EXCEPTION 'P\d/g) ?? [];
    expect(raises.length).toBe(6);
    expect(verify).not.toMatch(/\bIF\s+(false|FALSE)\b/);
  });
});
