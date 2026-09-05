import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the geo containment sentinel.
 *
 * The failure this whole feature exists to prevent is a sentinel that reports a
 * clean corpus because it has nothing to measure against. geo_boundaries was
 * created on 2026-09-05 complete with helper functions and a digest-pinned
 * loader, and sat at ZERO rows — a containment check over an empty boundary set
 * returns zero violations, which is indistinguishable from perfect data.
 *
 * These are text scans rather than DB assertions on purpose: the properties
 * below are structural, and a test that needs live credentials would not run in
 * CI at all.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function latestMigrationContaining(needle: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const hit = [...files]
    .reverse()
    .find((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle));
  if (!hit) throw new Error(`no migration defines ${needle}`);
  return readFileSync(join(MIGRATIONS, hit), 'utf8');
}

describe('geo boundary cells', () => {
  const sql = latestMigrationContaining('function public.refresh_geo_boundary_cells');

  it('compares DISTINCT ISO codes, not row counts', () => {
    // Natural Earth carries six ISO codes on two features each: 245 rows but 239
    // codes. A row-count comparison would fail every refresh on correct data, and
    // "fix" it by being deleted — after which real subdivision loss goes unseen.
    expect(sql).toMatch(/count\(distinct iso_a2\)/i);
    expect(sql).toMatch(/subdivision lost countries/i);
  });

  it('refuses to refresh from an empty boundary table', () => {
    // Without this the refresh would happily produce zero cells and every
    // downstream containment figure would read as clean.
    expect(sql).toMatch(/geo_boundaries holds no country rows/i);
  });
});

describe('geo containment validator', () => {
  const sql = latestMigrationContaining('function public.geo_containment_violations');

  it('covers all four entity tables', () => {
    for (const t of ['from venues', 'from events', 'from organizations', 'from hotels']) {
      expect(sql.toLowerCase()).toContain(t);
    }
  });

  it('uses the shared country-equivalence helper, not its own comparison', () => {
    // A second definition of "same country" is how Réunion-filed-FR becomes a
    // false finding. 20270501174244 exists so there is exactly one.
    expect(sql).toMatch(/geo_countries_equivalent/);
    expect(sql).not.toMatch(/claimed\s*=\s*actual/);
  });

  it('declines to adjudicate on disputed features rather than assigning them', () => {
    expect(sql).toMatch(/undecidable/);
  });

  it('excuses a border town but never an offshore or disputed point', () => {
    // A 1:10m boundary generalises land borders as well as coastlines, so
    // Konstanz, Weil am Rhein, Basel's Dreiländereck, Kerkrade, Mexicali and
    // Monaco all landed a few hundred metres inside a neighbour. Nominatim
    // verified all nine at km≈0 inside their CLAIMED country; the tolerance is
    // calibrated to that measurement (0.118–1.203 km), not picked.
    expect(sql).toMatch(/m_to_claimed\s*<=\s*2000/);
    // It must apply ONLY to country_mismatch — an offshore point already has its
    // own 5 km rule, and proximity proves nothing about a disputed feature.
    expect(sql).toMatch(/kind <> 'none' and actual is not null/);
  });

  it('keeps the geography cast off the KNN predicate', () => {
    // Measured: ST_DWithin(cell::geography, ...) in the WHERE clause scans all
    // 12k cells per row and times out. The GIST-backed `<->` ordering plus a
    // single distance check on the winner is what makes the sweep feasible.
    expect(sql).toMatch(/order by c\.geom <-> h\.g/);
  });
});

describe('geo hygiene sentinel', () => {
  const sql = latestMigrationContaining('function public.geo_hygiene_stats');

  it('exposes the authority size as a first-class value', () => {
    // This is THE key. Without boundary_rows/boundary_cells the health check
    // cannot tell "no violations" from "nothing was checked".
    expect(sql).toMatch(/'boundary_rows'/);
    expect(sql).toMatch(/'boundary_cells'/);
  });

  it('reports queue age, not just depth', () => {
    // A shallow queue whose head is six months old is stalled; the admin panel
    // could not show this because it never rendered oldest_enqueued_at.
    expect(sql).toMatch(/oldest_hours/);
  });

  it('reports how stale the findings are', () => {
    expect(sql).toMatch(/findings_age_hours/);
  });

  it('refuses to publish a vacuous all-clear', () => {
    const sweep = latestMigrationContaining('function public.run_geo_containment_sweep');
    expect(sweep).toMatch(/refusing to publish a vacuous all-clear/i);
  });
});

describe('check-pipeline-health geo section', () => {
  const js = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

  it('FAILS on an empty authority rather than passing', () => {
    const section = js.slice(js.indexOf('11. Geographic data quality'));
    expect(section).toMatch(/Geo authority is EMPTY/);

    // The empty-authority branch must set FAILED, not merely warn.
    //
    // The obvious assertion here — /FAILED = true/ over the branch text — is
    // VACUOUS, and mutation-testing caught it: commenting the line out to
    // `// FAILED = true` still matches, so the guard passed against exactly the
    // regression it exists to catch. Require a statement start, so a commented
    // or otherwise disabled assignment fails.
    const emptyBranch = section.slice(
      section.indexOf('rows === 0 || cells === 0'),
      section.indexOf('rows === 0 || cells === 0') + 500,
    );
    expect(emptyBranch).toMatch(/^\s*FAILED = true\s*$/m);
  });

  it('distinguishes an absent sentinel from a clean one', () => {
    const section = js.slice(js.indexOf('11. Geographic data quality'));
    expect(section).toMatch(/NOT DEPLOYED/);
    expect(section).toMatch(/absence of a check, not absence of defects/i);
  });

  it('treats an empty findings table as unmeasured, not healthy', () => {
    const section = js.slice(js.indexOf('11. Geographic data quality'));
    expect(section).toMatch(/the sweep has never run/i);
  });
});
