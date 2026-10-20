import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const SEAL = '99991792403561_org_inherits_venue_safety_gate.sql';

// The header quotes the defect, the removed predicate and the rejected
// alternatives verbatim, so an unstripped `toContain` passes with the executable
// statement deleted. Strip line-leading comments only.
const stripped = (f: string) =>
  readFileSync(join(MIG_DIR, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const sql = stripped(SEAL);

describe('organizations inherit the venue safety gate', () => {
  // Scoped to the seal FUNCTION BODY. `v.safety_gated is true` also occurs in the
  // backfill join and in several postconditions, so a file-wide match is satisfied
  // by a surviving copy while the seal itself is inverted -- measured: that
  // mutation SURVIVED the first round.
  const sealBody = (() => {
    const i = sql.indexOf('new.safety_gated :=');
    const j = sql.indexOf('end $fn$', i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
    return sql.slice(i, j);
  })();

  it('ORs the parent venue gate into the org gate', () => {
    expect(sealBody).toContain('location_is_high_risk(new.country_id, new.city_id)');
    expect(sealBody).toContain('v.id = new.primary_venue_id');
    expect(sealBody).toContain('v.duplicate_of_id is null');
  });

  it('tests the venue gate for TRUE, inside the seal itself', () => {
    expect(sealBody).toMatch(/and v\.safety_gated is true/);
    expect(sealBody).not.toMatch(/v\.safety_gated is (false|not true)/);
  });

  it('scopes the trigger so attaching a venue AND a direct column write re-decide', () => {
    expect(sql).toMatch(
      /before insert or update of country_id, city_id, primary_venue_id, safety_gated/,
    );
  });

  it('leaves the function the other four tables share alone', () => {
    // set_entity_safety_gated is used by events, hotels, milestones and
    // queer_villages, none of which has primary_venue_id.
    expect(sql).not.toMatch(/create or replace function public\.set_entity_safety_gated/i);
    expect(sql).toMatch(/p\.proname = 'set_entity_safety_gated'/);
  });

  it('propagates a venue gate change back onto its organization', () => {
    expect(sql).toMatch(/after update of safety_gated on public\.venues/);
    expect(sql).toMatch(/old\.safety_gated is distinct from new\.safety_gated/);
  });

  it('backfills through the seal, self-checking, rather than setting the answer', () => {
    // Writes the value the rows ALREADY hold and lets the trigger compute the
    // truth, so P1 tests the seal end-to-end and a dead seal introduces no new
    // exposure. Setting `true` directly makes P1 pass with no seal at all.
    expect(sql).toMatch(
      /update public\.organizations o\s*\n\s*set safety_gated = false\s*\n\s*from batch b/,
    );
    expect(sql).not.toMatch(/set safety_gated = true\s*\n\s*from batch/);
  });

  it('bounds each backfill statement', () => {
    expect(sql).toMatch(/limit 5000/);
    expect(sql).toMatch(/get diagnostics v_batch = row_count/);
  });
});

describe("the gate's expected value moves with the rule", () => {
  // THE defect this file's first draft had: gating 55k rows without teaching
  // city_safety_gate_drift the new rule took that CRITICAL gate 0 -> 55,336,
  // which reds every open PR in the repo. P7 caught it.
  const rawPatch = (() => {
    const i = sql.indexOf('r_raw text :=');
    const j = sql.indexOf("';", i);
    return sql.slice(i, j);
  })();

  it("teaches release_gate_checks_raw's organizations arm the parent-venue term", () => {
    // The TABLE is pinned: without it, swapping `public.venues pv` for another
    // table survives every column assertion -- measured, that mutation SURVIVED
    // the first round.
    expect(rawPatch).toContain('from public.venues pv');
    expect(rawPatch).toContain('pv.id = t.primary_venue_id');
    expect(rawPatch).toContain('pv.safety_gated is true');
    expect(rawPatch).toContain('pv.duplicate_of_id is null');
  });

  it('patches raw by exactly-once anchor instead of restating it', () => {
    // A full restatement has already re-reverted the venues arm's load-bearing
    // cruising term once (20261112100000 -> 20270309161544).
    expect(sql).not.toMatch(/create or replace function public\.release_gate_checks_raw/i);
    expect(sql).toMatch(/v_hits <> 1/);
    expect(sql).toMatch(/raw organizations arm anchor found % times/);
  });

  it('does NOT subtract these rows via review_holds instead', () => {
    // Subtracting rows that are no longer drift makes holds exceed raw failures,
    // at which point the wrapper reports the HOLDS COUNT as a critical failure.
    expect(sql).not.toMatch(/OR EXISTS[\s\S]{0,200}AS organization_count/);
  });

  it('asserts the venues cruising term survives the raw patch', () => {
    expect(sql).toContain("coalesce(t.category = 'cruising', false)");
  });
});

describe('sentinel and safety invariants', () => {
  it('adds a CRITICAL zero-invariant gate measuring the real bypass shape', () => {
    expect(sql).toContain("''venue_identity_gate_bypass'', ''critical''");
    expect(sql).toMatch(/coalesce\(o\.safety_gated, false\) IS FALSE/);
    expect(sql).toMatch(/AND v\.safety_gated IS TRUE/);
    expect(sql).toMatch(/v\.duplicate_of_id IS NULL/);
  });

  it('asserts no organization is UNDER-gated, measured independently of any gate', () => {
    expect(sql).toMatch(/P3b failed: % organization\(s\) UNDER-gated/);
    expect(sql).toMatch(/lgbti_criminalization->>'legal'\) = 'false'/);
  });

  it('bounds and retries the trigger swap instead of waiting on ACCESS EXCLUSIVE', () => {
    expect(sql).toMatch(/set_config\('lock_timeout', '2s', true\)/);
    expect(sql).toMatch(/exception when lock_not_available/);
  });

  it('strips comments before asserting on pg_get_functiondef', () => {
    // pg_get_functiondef returns the body INCLUDING comments, and this migration
    // quotes `primary_venue_id` and `cruising` in its own text. The PATCH reads
    // must stay unstripped or re-executing the body deletes its documentation.
    const asserts = [...sql.matchAll(/regexp_replace\(pg_get_functiondef\(p\.oid\)/g)].length;
    expect(asserts).toBe(2);
  });

  it('is idempotent: every mutating step is guarded or re-runnable', () => {
    // It ran against production first, because the critical gate it repairs cannot
    // go green on a PR. db push must re-run it as a no-op.
    expect(sql).toMatch(/if position\(r_raw in v_src\) > 0 then/);
    expect(sql).toMatch(/if position\('venue_identity_gate_bypass' in v_src\) > 0 then/);
    expect(sql).toMatch(/drop trigger if exists trg_organizations_safety_gated/);
    expect(sql).toMatch(/drop trigger if exists zzz_venue_gate_to_org/);
    expect(sql).toMatch(/exit when v_batch = 0/);
  });
});

describe('postconditions are asserted by RAISING', () => {
  // Asserting the condition text alone passes when the raise becomes `null;`. But
  // counting labels against raises is ALSO vacuous: deleting a whole postcondition
  // drops both sides together -- measured, that mutation SURVIVED round one. So
  // pin the explicit label set too.
  it('raises on every postcondition it declares', () => {
    const labels = [...sql.matchAll(/'P\d+b? failed/g)].length;
    const raises = [...sql.matchAll(/raise exception\s+'P\d+b? failed/g)].length;
    expect(raises).toBe(labels);
    for (const label of ['P1', 'P2', 'P3', 'P3b', 'P4', 'P5', 'P6', 'P7', 'P8']) {
      expect(sql).toMatch(new RegExp(`raise exception\\s+'${label} failed`));
    }
    // P5 and P7 each raise TWICE, so the loop above is satisfied by ONE surviving
    // branch -- measured, deleting P7's gate-agreement branch SURVIVED round one.
    // Pin each branch, and the drift one by name: it is the check that caught the
    // first draft taking city_safety_gate_drift from 0 to 55,336.
    expect(sql).toMatch(/P7 failed: city_safety_gate_drift reads %/);
    expect(sql).toMatch(/P7 failed: patched release_gate_checks\(\) lost a gate/);
    expect(sql).toMatch(/P5 failed: set_entity_safety_gated now has % triggers/);
    expect(sql).toMatch(/P5 failed: the shared gate function now references primary_venue_id/);
  });
});

describe('neither safety gate is given a ceiling', () => {
  const baselinePath = join(process.cwd(), 'scripts/data-quality-gate-baseline.json');

  it('data-quality-gate-baseline.json holds no entry for either gate', () => {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(Object.keys(baseline)).not.toContain('city_safety_gate_drift');
    expect(Object.keys(baseline)).not.toContain('venue_identity_gate_bypass');
  });

  it('positive control: the baseline file is readable and non-empty', () => {
    // Without this, "holds no entry" is equally true of an empty or missing file.
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(Object.keys(baseline).filter((k) => !k.startsWith('_')).length).toBeGreaterThan(0);
  });
});

describe('positive control: the migration exists at the version asserted', () => {
  it('finds the file', () => {
    expect(readdirSync(MIG_DIR)).toContain(SEAL);
  });
});
