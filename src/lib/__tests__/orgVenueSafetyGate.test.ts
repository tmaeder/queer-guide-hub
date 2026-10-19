import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const HOLD = '99991792403051_org_venue_identity_safety_hold.sql';
const SEAL = '99991792403561_org_inherits_venue_safety_gate.sql';

const raw = (f: string) => readFileSync(join(MIG_DIR, f), 'utf8');

// Both headers quote the defect and the removed predicate verbatim, so an
// unstripped `toContain` passes with the executable statement deleted. Strip
// line-leading comments only -- a mid-line `--` is rare here and stripping it
// would eat SQL inside string literals.
const stripped = (f: string) =>
  raw(f)
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

describe('organization safety gate: hold recognition', () => {
  const sql = stripped(HOLD);

  it('recognises a hold by the LINK to the held venue, not by needs_attention alone', () => {
    expect(sql).toMatch(/OR EXISTS \(\s*SELECT 1 FROM public\.venues pv/);
    expect(sql).toMatch(/pv\.id = o\.primary_venue_id/);
    expect(sql).toMatch(/pv\.safety_gated IS TRUE/);
  });

  it('KEEPS the needs_attention arm, so a hold held that way still counts', () => {
    expect(sql).toMatch(/o\.needs_attention IS TRUE\s*\n\s*OR EXISTS/);
  });

  it('is gated-only: the subtraction can never remove an UNDER-gated row', () => {
    // This is the whole safety argument. Both arms sit under `o.safety_gated IS
    // TRUE`, so only an over-gated row is ever subtracted from a critical count.
    expect(sql).toMatch(/o\.safety_gated IS TRUE[\s\S]{0,400}?o\.needs_attention IS TRUE/);
  });

  it('does not restate release_gate_checks_raw (whose cruising term has been reverted before)', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.release_gate_checks_raw/i);
  });

  it('asserts the load-bearing cruising term survives the patch', () => {
    expect(sql).toContain("coalesce(v.category::text, '') <> 'cruising'");
  });
});

describe('organization safety gate: venue inheritance seal', () => {
  const sql = stripped(SEAL);

  it('ORs the parent venue gate into the org gate', () => {
    expect(sql).toMatch(/new\.safety_gated :=[\s\S]{0,200}?location_is_high_risk/);
    expect(sql).toMatch(/or exists \([\s\S]{0,200}?v\.id = new\.primary_venue_id/);
    expect(sql).toMatch(/v\.safety_gated is true/);
  });

  it('scopes the trigger so attaching a venue AND a direct column write both re-decide', () => {
    expect(sql).toMatch(
      /before insert or update of country_id, city_id, primary_venue_id, safety_gated/,
    );
  });

  it('leaves the function the other four tables share alone', () => {
    // set_entity_safety_gated is used by events, hotels, milestones and
    // queer_villages, none of which has primary_venue_id. Redefining it there
    // would break all four.
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
    // exposure. Setting `true` directly would make P1 pass with no seal at all.
    expect(sql).toMatch(/update public\.organizations o\s*\n\s*set safety_gated = false\s*\n\s*from batch b/);
    expect(sql).not.toMatch(/set safety_gated = true\s*\n\s*from batch/);
  });

  it('bounds each backfill statement', () => {
    expect(sql).toMatch(/limit 5000/);
    expect(sql).toMatch(/get diagnostics v_batch = row_count/);
  });

  it('adds a CRITICAL zero-invariant gate that measures the real bypass shape', () => {
    expect(sql).toMatch(/'venue_identity_gate_bypass', ''critical''|''venue_identity_gate_bypass'', ''critical''/);
    expect(sql).toMatch(/coalesce\(o\.safety_gated, false\) IS FALSE/);
    expect(sql).toMatch(/AND v\.safety_gated IS TRUE/);
    expect(sql).toMatch(/v\.duplicate_of_id IS NULL/);
  });

  it('bounds and retries the trigger swap instead of waiting on ACCESS EXCLUSIVE', () => {
    expect(sql).toMatch(/set_config\('lock_timeout', '2s', true\)/);
    expect(sql).toMatch(/exception when lock_not_available/);
  });
});

describe('both migrations assert their postconditions by RAISING', () => {
  // Asserting the condition text alone passes when the raise is replaced by
  // `null;` -- the branch stops failing while every string check stays green.
  for (const f of [HOLD, SEAL]) {
    it(`${f} raises on every postcondition it declares`, () => {
      const sql = stripped(f);
      const labels = [...sql.matchAll(/'([AB]-)?P\d+b? failed/g)].length;
      const raises = [...sql.matchAll(/raise exception\s+'([AB]-)?P\d+b? failed/g)].length;
      expect(labels).toBeGreaterThanOrEqual(5);
      expect(raises).toBe(labels);
    });
  }
});

describe('neither safety gate is given a ceiling', () => {
  it('data-quality-gate-baseline.json holds no entry for either gate', () => {
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts/data-quality-gate-baseline.json'), 'utf8'),
    );
    expect(Object.keys(baseline)).not.toContain('city_safety_gate_drift');
    expect(Object.keys(baseline)).not.toContain('venue_identity_gate_bypass');
  });

  it('positive control: the baseline file is readable and non-empty', () => {
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts/data-quality-gate-baseline.json'), 'utf8'),
    );
    // Without this, "holds no entry" is equally true of an empty or missing file.
    expect(Object.keys(baseline).filter((k) => !k.startsWith('_')).length).toBeGreaterThan(0);
  });
});

describe('positive control: both migrations exist at the versions asserted', () => {
  it('finds both files', () => {
    const files = readdirSync(MIG_DIR);
    expect(files).toContain(HOLD);
    expect(files).toContain(SEAL);
  });
});
