import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790359680_seal_event_venue_geography_corroboration.sql.
//
// `tg_event_venue_geography` propagated a venue's city onto its event
// unconditionally. It is only the SECOND link in the chain -- the event was attached
// to "The Eagle" in New York City, a bar name that exists in a dozen cities, and the
// trigger then faithfully copied that venue's city onto a Florida event 1,718 km away.
// So the fix is a corroboration test, not a ban: a venue is still the strongest signal
// for an event's city, and 1,669 of 1,670 live links are correct.
//
// The three things that must not drift:
//   1. the guard only ever REFUSES, and refuses the WHOLE venue-derived block
//   2. it FAILS OPEN when either side has no coordinates
//   3. the repair detaches the wrong venue but does NOT assert the likely right one
//
// Assertions are scoped to the half of the statement they are about. This migration's
// header quotes the venue name, the distance and the stamp reason in prose, so a bare
// toContain over the whole file passes against a gutted function body -- the
// vacuous-assertion class CLAUDE.md records repeatedly.

const MIGRATION = '99991790359680_seal_event_venue_geography_corroboration.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The replaced trigger function body only. */
const fn = statements.slice(
  statements.indexOf('create or replace function public.tg_event_venue_geography'),
  statements.indexOf('create temporary table _vg_before'),
);
/** The repair UPDATE only. */
const repair = statements.slice(
  statements.indexOf('update public.events e'),
  statements.indexOf('do $verify$'),
);
/** The postconditions only. */
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('the spans this file depends on', () => {
  it('found the function body, the repair and the postconditions', () => {
    // A guard scoped to an empty span is indistinguishable from a guard that passes.
    for (const [name, span] of [
      ['fn', fn],
      ['repair', repair],
      ['verify', verify],
    ] as const) {
      expect(span.length, `${name} span is empty`).toBeGreaterThan(200);
    }
    expect(fn).not.toContain('do $verify$');
    expect(repair).not.toContain('create or replace function');
  });
});

describe('the guard only refuses, and refuses everything the venue would have given', () => {
  it('returns early on a refusal rather than propagating anything', () => {
    const branch = fn.slice(
      fn.indexOf('if v_km > 250 then'),
      fn.indexOf('if v.city_id is not null then'),
    );
    expect(branch.length, 'the refusal branch is missing').toBeGreaterThan(100);
    expect(branch).toContain('return new;');
    // none of the venue-derived writes may happen on the refusing path
    expect(branch).not.toMatch(/new\.city_id\s*:=/);
    expect(branch).not.toMatch(/new\.country_id\s*:=/);
    expect(branch).not.toMatch(/new\.country\s*:=/);
    // geo_linked_at must stay unset so the row does not read as successfully linked
    expect(branch).not.toMatch(/new\.geo_linked_at\s*:=/);
  });

  it('records the refusal with its distance, and flags the row', () => {
    const branch = fn.slice(
      fn.indexOf('if v_km > 250 then'),
      fn.indexOf('if v.city_id is not null then'),
    );
    expect(branch).toContain("'venue_too_far_from_event_coordinates'");
    expect(branch).toContain("'distance_km'");
    expect(branch).toMatch(/new\.needs_attention\s*:=\s*true/);
  });

  it('never invents a city — the guard has no assignment to city_id at all', () => {
    const guard = fn.slice(
      fn.indexOf('if v.city_id is not null and new.latitude'),
      fn.indexOf('if v.city_id is not null then'),
    );
    expect(guard).not.toMatch(/new\.city_id\s*:=\s*(?!null)/);
  });

  it('keeps the pre-existing country-contradiction branch working', () => {
    // 20260924043359's other branch must survive; this migration replaces the whole
    // function, so dropping it would be a silent regression in an unrelated path.
    expect(fn).toContain("'venue_country_contradicted_previous_city'");
    expect(fn).toMatch(/new\.city_id\s*:=\s*null/);
  });

  it('still propagates for a corroborated venue', () => {
    // The guard must not have become a blanket ban: 1,669 of 1,670 links are correct.
    const after = fn.slice(fn.indexOf('if v.city_id is not null then'));
    expect(after).toMatch(/new\.city_id\s*:=\s*v\.city_id/);
    expect(after).toMatch(/new\.geo_linked_at\s*:=\s*now\(\)/);
  });
});

describe('the guard fails open rather than refusing without evidence', () => {
  it('requires coordinates on BOTH sides before it can refuse', () => {
    expect(fn).toMatch(/new\.latitude is not null and new\.longitude is not null/);
    expect(fn).toMatch(/v_city_lat is not null and v_city_lon is not null/);
  });

  it('uses the measured bound, not a round number pulled from nowhere', () => {
    // p99 is 6.1 km and the largest legitimate value is 23.1 km, so 250 sits in a
    // measured gap. A tighter bound would start refusing real links.
    expect(fn).toMatch(/v_km > 250\b/);
    expect(fn).not.toMatch(/v_km > (1|2|5|10|25|50|100)\b/);
  });
});

describe('the repair', () => {
  it('detaches the wrong venue and restores the city its own coordinates corroborate', () => {
    expect(repair).toMatch(/venue_id = null/);
    expect(repair).toMatch(/city_id = ftl\.id/);
    expect(repair).toContain("ftl.slug = 'fort-lauderdale'");
    expect(repair).toMatch(/needs_attention = true/);
  });

  it('is guarded on the defect, so a concurrent repair no-ops', () => {
    expect(repair).toContain("e.venue_id = '02eab47f-c039-4e3c-baaa-86dd70527ad0'");
    // and only acts when the event's own coordinates really do agree with the target
    expect(repair).toMatch(/haversine_m\([\s\S]*?ftl\.latitude[\s\S]*?\)\s*<\s*25000/);
  });

  it('does NOT attach the likely-correct venue — that is an identity claim', () => {
    // "Eagle Wilton Manors" is 4 km away and shares a word. Attaching it on that
    // evidence is what produced this row in the first place.
    expect(repair).not.toMatch(/venue_id = '26277d0a/);
    expect(repair).toContain('candidate_venue_id');
  });

  it('keeps the source venue text so the re-attach stays actionable', () => {
    expect(repair).not.toMatch(/venue_name\s*=/);
  });
});

describe('postconditions', () => {
  it('asserts the guard is in the DEPLOYED body and the trigger is attached', () => {
    expect(verify).toContain('pg_get_functiondef');
    expect(verify).toContain('venue_too_far_from_event_coordinates');
    expect(verify).toContain('zzz_event_venue_geography');
    expect(verify).toContain('P1 failed');
  });

  it('checks the corpus invariant, not only the row it repaired', () => {
    const p4 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P4 failed')),
      verify.indexOf('P4 failed'),
    );
    expect(p4.length).toBeGreaterThan(80);
    expect(p4).toMatch(/> 250000/);
    expect(p4).not.toContain('e277dc22');
  });

  it('proves restraint with a snapshot, and both mirror directions', () => {
    expect(statements).toMatch(/create temporary table _vg_before/);
    expect(verify).toContain('expected exactly 1 event to change');
    // the legitimate links must still be on their venue's city
    const p6 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P6 failed')),
      verify.indexOf('P6 failed'),
    );
    expect(p6).toMatch(/<= 250000/);
    expect(p6).toMatch(/e\.city_id is distinct from v\.city_id/);
    // and the previous pass's blocked rows must not have been re-linked
    const p7 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P7 failed')),
      verify.indexOf('P7 failed'),
    );
    expect(p7).toContain('migration:99991789886174');
    expect(p7).toMatch(/e\.city_id is not null/);
  });

  it('uses no loosened comparison that would stop the checks counting', () => {
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(5);
    expect(verify).toContain('if v_moved <> 1 then');
    expect(verify).not.toMatch(/if v_(bad|moved) [<>]\s*[-0-9]/);
    expect(verify).not.toMatch(/\bfalse\b/);
  });
});
