import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The venue dedup sweep's arms, pinned.
 *
 * Before 20330101100100 both venue arms gated auto-merge on `both coordinates
 * present AND haversine < 150 m`, and on the live corpus that matched ZERO of 483
 * candidate pairs — so the nightly sweep ran green in mode='full' and merged
 * nothing while 530 pairs aged in the review queue for 43 days.
 *
 * Coordinates are the wrong signal here and that is a measurement: 2,665 venues
 * sit on 908 shared centroid points, and pairs with byte-identical street
 * addresses measure up to 507 km apart. What replaced distance came from reading
 * 106 candidate pairs by hand and from the reviewers' own record — all 4 venue
 * rejections ever made are pairs where both sides carry a real, DIFFERENT street
 * address, which is the identity-conflict veto.
 *
 * Each assertion below was mutation-tested against a scratch copy of the branch:
 * flipping the predicate it guards makes the test fail. A guard that also passes
 * on the broken input is guarding nothing.
 *
 * Text check against the migrations directory — no credentials, same pattern as
 * `src/lib/__tests__/dedupEventArms.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_dedup_truth_sweep');

/** The `when 'venue' then $q$ … $q$` candidate query, and only that branch. */
function venueBranch(): string {
  const start = sql.indexOf("when 'venue' then $q$");
  expect(start, "the sweep has a `when 'venue'` branch").toBeGreaterThan(-1);
  const end = sql.indexOf('$q$', start + "when 'venue' then $q$".length);
  return sql.slice(start, end);
}

/** The `arm in (...) is_auto` list itself — NOT everything after the word is_auto. */
function autoList(): string {
  const m = venueBranch().match(/arm in \(([\s\S]*?)\) is_auto/);
  expect(m, 'is_auto must be an `arm in (...)` list').toBeTruthy();
  return m![1];
}

describe('run_dedup_truth_sweep venue arms', () => {
  // The whole point of the change. If distance comes back as a gate, the engine
  // returns to matching nothing.
  it('never gates is_auto on coordinate proximity', () => {
    const branch = venueBranch();
    expect(
      branch,
      'the 150 m geo gate must be gone — it matched 0 of 483 pairs and centroid ' +
        'fallbacks put same-address duplicates hundreds of km apart',
    ).not.toMatch(/haversine_m\([^)]*\)\s*<\s*150/);
    // distance may still be COMPUTED, for the review payload only.
    expect(branch, 'distance is still carried as a display field').toMatch(
      /public\.haversine_m\(a\.lat,a\.lng,b\.lat,b\.lng\) dm/,
    );
  });

  it('carries the four corroborated auto arms and no others', () => {
    const list = autoList();
    for (const arm of [
      'google_place_id',
      'same_street_address',
      'same_domain',
      'same_phone',
      'shell_absorbed',
    ]) {
      expect(list, `${arm} must be auto-eligible`).toContain(arm);
    }
    // Every review-bound arm, asserted negatively. `single_token_core` is the
    // Jessheim/Fredrikstad Pride class, `identity_conflict` is Rapa Nui and
    // Circa, `cross_city_name_only` is the chain guard on the new K3 generator.
    for (const arm of [
      'identity_conflict',
      'single_token_core',
      'cross_city_name_only',
      'name_key_uncorroborated',
    ]) {
      expect(list, `${arm} must NEVER auto-merge`).not.toContain(arm);
    }
  });

  // ONE LADDER: arm is chosen once, and is_auto/conf/reason are all read off it.
  // Two parallel CASE expressions are what let an event draft emit one reason at
  // two different confidences.
  it('is a single ladder, not parallel CASE expressions', () => {
    const branch = venueBranch();
    expect(branch).toMatch(/end arm/);
    expect(branch).toMatch(/case arm when 'google_place_id'/);
    expect(branch).toMatch(/arm in \([\s\S]*?\) is_auto/);
  });

  // Ordering is the safety property. Rung 3 above every corroborator makes them
  // all implicitly >= 2-token; rung 5 above domain/phone/shell stops a cross-city
  // chain auto-merging on a shared domain.
  it('orders the ladder so the vetoes outrank the corroborators', () => {
    const b = venueBranch();
    const at = (needle: string) => {
      const i = b.indexOf(needle);
      expect(i, `${needle} present in the ladder`).toBeGreaterThan(-1);
      return i;
    };
    const conflict = at("then 'identity_conflict'");
    const single = at("then 'single_token_core'");
    const address = at("then 'same_street_address'");
    const crossCity = at("then 'cross_city_name_only'");
    const domain = at("then 'same_domain'");
    const phone = at("then 'same_phone'");
    const shell = at("then 'shell_absorbed'");

    expect(conflict, 'a conflicting identity must outrank every agreement').toBeLessThan(address);
    expect(conflict).toBeLessThan(domain);
    expect(single, 'the >=2-token rung must precede every corroborator').toBeLessThan(address);
    expect(single).toBeLessThan(domain);
    expect(single).toBeLessThan(shell);
    expect(
      crossCity,
      'cross-city must be caught before domain/phone/shell, or a chain auto-merges',
    ).toBeLessThan(domain);
    expect(crossCity).toBeLessThan(phone);
    expect(crossCity).toBeLessThan(shell);
    // ...but AFTER address: a shared street address is what makes a cross-city
    // pair a city_id mislink rather than two branches. 29/29 hand-read.
    expect(address, 'address corroboration must still reach cross-city pairs').toBeLessThan(
      crossCity,
    );
  });

  it('requires two core tokens before any corroborator can auto-merge', () => {
    // `cardinality(core) >= 1` still generates the candidate (K2), but < 2 routes
    // it to single_token_core. Both halves matter: dropping the generator loses
    // recall, dropping the rung re-opens Jessheim Pride vs Fredrikstad Pride.
    expect(venueBranch()).toMatch(/cardinality\(a\.core\) < 2/);
    expect(venueBranch()).toMatch(/cardinality\(a\.core\) >= 1/);
  });

  it('coalesces every pair predicate to false', () => {
    const b = venueBranch();
    for (const pred of [
      'cross_city',
      'weak_name',
      'gid_agree',
      'addr_agree',
      'dom_agree',
      'ph_agree',
      'shell',
      'addr_conflict',
      'dom_conflict',
      'ph_conflict',
      'gid_conflict',
    ]) {
      expect(b, `${pred} must be coalesced to false`).toMatch(
        new RegExp(`coalesce\\([\\s\\S]*?, false\\) ${pred}`),
      );
    }
  });

  // The address comparator is conservative BY DESIGN: number equality alone would
  // equate two venues sharing a postcode. Containment is the half that makes the
  // leading-digit heuristic safe, so neither may be dropped without the other.
  it('requires house number AND street containment together', () => {
    const b = venueBranch();
    expect(b).toMatch(/a\.hn is not null and b\.hn is not null and a\.hn = b\.hn/);
    expect(b).toMatch(/position\(a\.st in b\.st\) > 0 or position\(b\.st in a\.st\) > 0/);
    expect(b, 'both street keys must clear a minimum length').toMatch(
      /length\(a\.st\) >= 6 and length\(b\.st\) >= 6/,
    );
  });

  it('generates cross-city candidates without dropping null-city pairs', () => {
    const b = venueBranch();
    // `is distinct from` would silently exclude pairs with city_id null on BOTH
    // sides — 3,225 live venues have no city_id — and would not be the exact
    // complement of K1, so some pairs could be scored by two generators.
    expect(b).toMatch(/not coalesce\(a\.city_id = b\.city_id, false\)/);
    expect(b).not.toMatch(/a\.city_id is distinct from b\.city_id/);
    expect(b, 'K3 is scoped to one country').toMatch(/a\.country_id = b\.country_id/);
  });

  it('raises the candidate limit so K3 does not truncate the set', () => {
    expect(venueBranch()).toMatch(/limit 1200/);
  });
});

describe('venue dedup review payload', () => {
  const sideFile = latestDefinitionOf('_dedup_venue_cluster_side');

  /**
   * The CREATE FUNCTION statement only — never the whole migration file.
   * That file's header explains at length WHY this function is not SECURITY
   * DEFINER, and its verify block raises a message containing the same words, so
   * a negative assertion over the file fails on correct code. Same scoping rule
   * the event test applies to the `arm in (...)` list.
   */
  const side = (() => {
    const start = sideFile.indexOf('CREATE OR REPLACE FUNCTION public._dedup_venue_cluster_side');
    expect(start, 'the migration defines _dedup_venue_cluster_side').toBeGreaterThan(-1);
    const end = sideFile.indexOf('$function$;', start);
    expect(end, 'the function body is terminated').toBeGreaterThan(start);
    return sideFile.slice(start, end);
  })();

  it('carries the fields the four recorded rejections turned on', () => {
    // Every venue rejection on record hinged on the street address, and the old
    // payload was two titles plus a distance.
    for (const key of ['address', 'city', 'website', 'phone', 'has_coords', 'slug']) {
      expect(side, `payload must carry ${key}`).toContain(`'${key}'`);
    }
  });

  it('keeps the `title` key the inbox view builds its row from', () => {
    // triage_src_dedup_review reads cluster->'keep'->>'title'; renaming it breaks
    // the inbox, and that view cannot take a cheap column change.
    expect(side).toMatch(/'title', v\.name/);
  });

  it('is SECURITY INVOKER so it cannot bypass the safety_gated policy', () => {
    // 20290601120731: the event twin was written DEFINER by reflex and leaked
    // safety-gated events in the UAE and Malaysia to anon.
    expect(side).toMatch(/SECURITY INVOKER/i);
    expect(side).not.toMatch(/SECURITY DEFINER/i);
  });

  it('is dispatched for venues by the sweep', () => {
    expect(sql).toMatch(/_dedup_venue_cluster_side\(v_keep\)/);
    expect(sql).toMatch(/_dedup_venue_cluster_side\(v_drop\)/);
  });
});

describe('venue_dup_signals backlog warning', () => {
  const signals = latestDefinitionOf('venue_dup_signals');
  const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('reports a median age, using percentile_disc', () => {
    expect(signals).toContain('median_open_pair_hours');
    // percentile_cont interpolates and is undefined for timestamptz — it fails
    // with 42883, which is how this was caught.
    expect(signals).toMatch(/percentile_disc\(0\.5\) within group \(order by created_at\)/);
    expect(signals).not.toMatch(/percentile_cont\(0\.5\) within group \(order by created_at\)/);
  });

  it('warns on the median age, never on the oldest pair', () => {
    // Measured post-deploy: 202 open, oldest 424h, median 0h. An oldest-based
    // rule warns there — on a correct deploy, on every CI run — because two
    // hand-annotated rows are deliberately left open for a human.
    const block = health.slice(health.indexOf('venue_dup_signals'));
    expect(block, 'the venue backlog warning keys on the median').toMatch(
      /openPairs > 200 && medianH > 336/,
    );
    expect(block.slice(0, block.indexOf('Wrong-entity Wikidata'))).not.toMatch(
      /openPairs > \d+ && oldestH > \d+/,
    );
  });

  it('is service_role only — it is DEFINER and runs a full sweep per call', () => {
    expect(signals).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.venue_dup_signals\(\) FROM public, anon, authenticated/,
    );
    expect(signals).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.venue_dup_signals\(\) TO authenticated/,
    );
  });
});

describe('venue merge failures are distinguishable from chain collapses', () => {
  it('classifies a chain collision by state, not by message text', () => {
    // Three copies of one venue generate three pairs; the first merge collapses
    // the chain and the rest hit _venue_merge_core's own guards. Matching that
    // guard's wording would break silently if the other function reworded it.
    expect(sql).toMatch(/v_chained := v_chained \+ 1/);
    expect(sql).toMatch(/id in \(v_keep, v_drop\) and duplicate_of_id is not null/);
    expect(sql, 'a real failure still surfaces its reason').toMatch(
      /v_first_error := left\(sqlerrm, 300\)/,
    );
    expect(sql).toMatch(/'chain_skipped', v_chained, 'merge_error', v_first_error/);
  });
});
