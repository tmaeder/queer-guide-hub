import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Geographic dedup must never SUGGEST merging two differently-named places.
 *
 * This file replaces `dedupCityGeoArm.test.ts`, which pinned the opposite design.
 * That test's own docstring records why the arm existed — the key arm is blind to
 * exonyms — and why it was made non-auto: coordinates cannot tell a duplicate from
 * a district, "Manhattan sits 14 m from New York's centroid", and 29 wrongly
 * merged pairs had to be repaired by hand on 2026-07-29. Non-auto was not enough.
 * A queued pair is a pair an admin can approve, and the queue is what a human is
 * shown, so a proposal is a claim.
 *
 * Measured on prod 2026-09-14 before this change:
 *   run_dedup_truth_sweep('city','dry_run') = { would_merge: 0, would_queue: 118 }
 * and ALL 118 came from `geo_only_2km`. The engine's entire live output was
 * different-name guesses. What it proposed, read by hand: Ueberlingen (Lake
 * Constance) <-> Wernigerode (the Harz) at "0 m"; Le Cannet <-> Carbonne at "0 m";
 * Pirna <-> Baden-Baden at 265 m; Garden Grove, California <-> Egham, England at
 * 580 m; New York <-> Manhattan; Stepney <-> Limehouse. The metre readings are the
 * placeholder-coordinate signature this repo already recorded for venue dedup, not
 * proximity — a missing geocode falls back to a shared centroid.
 *
 * After: { would_merge: 25, would_queue: 0 }.
 *
 * Each assertion was mutation-tested against a scratch copy (13 mutations, all
 * caught, plus a comment-only control that correctly SURVIVES). Comments are
 * stripped first, because these migrations quote the retired arm's name in their
 * own headers and a bare `toContain` over unstripped source is satisfiable by the
 * prose.
 *
 * WHAT THIS FILE CANNOT COVER, stated rather than implied: it reads SQL text, so
 * a change that leaves an arm's text intact while disabling it at runtime (an
 * appended `and false`, a dropped grant, a migration that never applied) passes
 * here. That is what `geo_dedup_signals()` is for — it dry-runs the LIVE engine
 * and reads the LIVE queue, and `check-pipeline-health.mjs` fails on it. Text
 * pins the design; the sentinel pins the behaviour.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function files(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Strip `--` line comments so an assertion cannot be satisfied by a header. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/**
 * The LAST migration that defines a `when '<type>' then $q$ … $q$` sweep arm.
 *
 * Deliberately tracks the ARM, not `create function run_dedup_truth_sweep`. The
 * sweep is ~34k characters shared by 12 entity types, so the geographic arms are
 * spliced rather than restated — re-emitting the whole body would be a merge
 * collision surface for every other type. Anchoring on `create function` would
 * therefore read a stale definition and pass while the live arm says otherwise.
 */
function latestArm(type: string): { file: string; body: string } {
  const open = `when '${type}' then $q$`;
  for (const f of [...files()].reverse()) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, f), 'utf8'));
    const start = sql.indexOf(open);
    if (start === -1) continue;
    const end = sql.indexOf('$q$', start + open.length);
    expect(end, `${f}: the ${type} arm is unterminated`).toBeGreaterThan(-1);
    return { file: f, body: sql.slice(start, end) };
  }
  throw new Error(`no migration defines a '${type}' sweep arm`);
}

describe('city dedup arms are name- and gazetteer-based', () => {
  const { body } = latestArm('city');

  it('has retired the proximity arm entirely', () => {
    // Not merely non-auto: absent. A different-name pair may not even be queued.
    expect(body).not.toContain('geo_only_2km');
    // and nothing may pair rows on differing name keys plus a distance window
    expect(body).not.toMatch(/a\.dsp\s*<>\s*b\.dsp/);
  });

  it('merges on a shared Wikidata id — a real gazetteer source', () => {
    expect(body).toContain('qid_exact');
    expect(body).toMatch(/a\.qid is not null and a\.qid = b\.qid/);
  });

  it('vetoes the name-key arm when two Wikidata ids disagree', () => {
    // Two distinct non-null QIDs are a positive statement that two different
    // real places are involved. The pre-existing arm had no such veto at all.
    expect(body).toMatch(
      /not\s*\(\s*a\.qid is not null and b\.qid is not null and a\.qid <> b\.qid\s*\)/,
    );
  });

  it('vetoes the name-key arm when the regions disagree (the Springfield case)', () => {
    // Two real cities of one name in one country — Springfield MO and
    // Springfield IL — which `cities` cannot otherwise tell apart.
    expect(body).toMatch(
      /not\s*\(\s*a\.region_name is not null and b\.region_name is not null[\s\S]*?dedup_despace\(a\.region_name\)\s*<>\s*public\.dedup_despace\(b\.region_name\)\s*\)/,
    );
  });

  it('treats "X, <own country or region>" as the same name, not a second place', () => {
    expect(body).toContain('name_qualifier');
    // the qualifier must be corroborated by THAT ROW'S OWN country/region
    expect(body).toMatch(
      /dedup_despace\(b\.tail\) in \(\s*public\.dedup_despace\(a\.cname\), lower\(a\.ccode\), public\.dedup_despace\(a\.region_name\)\)/,
    );
    // and the base row must carry a gazetteer id, so nothing rests on the name alone
    expect(body).toMatch(/a\.qid is not null and b\.qid is null/);
  });

  it('pins the qualifier merge orientation instead of scoring it', () => {
    // The caller's canonical pick is quality->featured->oldest. For this arm that
    // is the wrong question: a shell with a higher completeness score would
    // silently rename Berlin to "Berlin, Germany".
    const arm = body.slice(body.indexOf("'name_qualifier'"));
    expect(arm).toMatch(/1::numeric,\s*true,\s*a\.c_at,\s*0::numeric,\s*false,\s*b\.c_at/);
  });
});

describe('country dedup identity is the ISO code', () => {
  const { body } = latestArm('country');

  it('vetoes a name match when two ISO 3166-1 codes disagree', () => {
    expect(body).toMatch(
      /not\s*\(\s*a\.code is not null and b\.code is not null and upper\(a\.code\) <> upper\(b\.code\)\s*\)/,
    );
  });

  it('still requires an identical name key', () => {
    expect(body).toMatch(/a\.dsp\s*=\s*b\.dsp/);
  });
});

describe('queer village dedup stays name-equal within one city', () => {
  const { body } = latestArm('queer_village');

  it('pairs only identical name keys in the same city', () => {
    expect(body).toMatch(/a\.city_id\s*=\s*b\.city_id/);
    expect(body).toMatch(/a\.dsp\s*=\s*b\.dsp/);
    expect(body).not.toMatch(/a\.dsp\s*<>\s*b\.dsp/);
  });
});

describe('ingest candidate finders cannot auto-merge on resemblance', () => {
  /**
   * The body of ONE function, not the whole file. Both finders are defined in the
   * same migration, so a file-wide match counts the sibling's cap too — which is
   * how the first draft of this test read 3 where it asserted 2.
   */
  function latestFn(fn: string): string {
    const open = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i');
    for (const f of [...files()].reverse()) {
      const sql = stripComments(readFileSync(join(MIGRATIONS, f), 'utf8'));
      const m = open.exec(sql);
      if (!m) continue;
      const end = sql.indexOf('$function$;', m.index);
      expect(end, `${f}: ${fn} is unterminated`).toBeGreaterThan(-1);
      return sql.slice(m.index, end);
    }
    throw new Error(`no migration defines ${fn}`);
  }

  it('caps the fuzzy city arms below what the engine can turn into an auto-merge', () => {
    const sql = latestFn('find_city_duplicate_candidates');
    // dedup-engine.ts: fused = detMax + confirmWeight(0.05) * semCosine, autoMerge 0.92.
    // 0.86 + 0.05 = 0.91 < 0.92. Both fuzzy arms must carry the cap.
    const capped = sql.match(/least\(extensions\.similarity\([\s\S]*?, 0\.86\)/g) ?? [];
    expect(capped.length).toBe(2);
    // the exact-identity arms keep their auto-capable scores
    expect(sql).toMatch(/'name_exact_country'::text AS mt, 0\.99::numeric/);
    expect(sql).toMatch(/'despaced_exact', 0\.97/);
  });

  it('caps the fuzzy country arm and vetoes a disagreeing ISO code', () => {
    const sql = latestFn('find_country_duplicate_candidates');
    expect(sql).toMatch(/least\(extensions\.similarity\([\s\S]*?, 0\.86\)/);
    // both name arms — exact and fuzzy — must carry the code veto
    const vetoes =
      sql.match(
        /NOT \(p_code IS NOT NULL AND c\.code IS NOT NULL AND c\.code <> upper\(btrim\(p_code\)\)\)/g,
      ) ?? [];
    expect(vetoes.length).toBe(2);
    expect(sql).toMatch(/'code_exact'::text AS mt, 1\.00::numeric/);
  });
});
