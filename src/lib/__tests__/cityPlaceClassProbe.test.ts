import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991790173993_city_place_class_probe.sql and
 * 99991790174242_city_district_handread_repairs.sql.
 *
 * `cities` has no place-class column, so a Stadtteil filed as a city is
 * indistinguishable from a city. Measured over a random sample of 48 live,
 * seo_indexable, QID-bearing, venue-bearing rows, NINE are not an ordinary
 * city — `Kensington` is "area of London" with 15 venues on it.
 *
 * Comment-stripped throughout: both headers quote the class labels, the slugs
 * and the verdicts verbatim, so a bare `toContain` over the raw file passes
 * with the statements deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const PROBE = '99991790173993_city_place_class_probe.sql';
const REPAIRS = '99991790174242_city_district_handread_repairs.sql';

function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}
const probeSrc = statements(readFileSync(join(MIGRATIONS, PROBE), 'utf8'));
const repairSrc = statements(readFileSync(join(MIGRATIONS, REPAIRS), 'utf8'));

/**
 * The single `UPDATE public.cities` statement whose WHERE names `slug`,
 * split into its SET half and its WHERE half.
 *
 * Both halves are needed and they must not be confused. A content guard
 * legitimately QUOTES the value it is about to remove (`AND wikidata_qid =
 * 'Q1520409'`), so a "never repoints" assertion over the whole statement fails
 * on correct code; and a SET-only assertion over the whole FILE matches the
 * next statement down. The first draft of this file got both wrong in one run.
 *
 * Bounded at the terminating `;`. Checked: no reason string in either
 * statement contains a semicolon, which is the trap that has bitten the
 * venue-dedup and clinical-family guards.
 */
function cityUpdate(slug: string): { set: string; where: string } {
  const at = repairSrc.indexOf(`WHERE slug = '${slug}'`);
  expect(at, `no UPDATE for ${slug}`).toBeGreaterThan(-1);
  const start = repairSrc.lastIndexOf('UPDATE public.cities', at);
  expect(start).toBeGreaterThan(-1);
  const end = repairSrc.indexOf(';', at);
  expect(end).toBeGreaterThan(at);
  return { set: repairSrc.slice(start, at), where: repairSrc.slice(at, end) };
}

/** The verdict function body only — the seed and the self-test repeat many of
 *  these strings, so an unscoped match passes with a branch deleted. */
const verdictFn = (() => {
  const from = probeSrc.indexOf('CREATE OR REPLACE FUNCTION public.city_place_class_verdict');
  expect(from).toBeGreaterThan(-1);
  return probeSrc.slice(from, probeSrc.indexOf('$fn$;', from));
})();

describe('city_place_class_probe', () => {
  it('both migrations are present under their own names', () => {
    const files = readdirSync(MIGRATIONS);
    expect(files).toContain(PROBE);
    expect(files).toContain(REPAIRS);
  });

  it('stores EVIDENCE, not a verdict — so a vocabulary change reclassifies', () => {
    expect(probeSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.city_place_class_probe/);
    expect(probeSrc).toMatch(/classes\s+text\[\]\s+NOT NULL/);
    // A stored verdict column would freeze the answer at probe time.
    expect(probeSrc).not.toMatch(/verdict\s+text\s+(NOT NULL|DEFAULT)/);
  });

  it('never reaches the network from inside a migration', () => {
    // db push aborts the whole repo on a failing file, so a migration that
    // waits on query.wikidata.org is a repo-wide outage waiting for an upstream.
    expect(probeSrc).not.toMatch(/net\.http_(get|post)/);
    expect(probeSrc).not.toMatch(/wikidata\.org/);
  });

  it('is service_role only, view included', () => {
    // The public schema's default privileges grant anon/authenticated on a
    // NEWLY CREATED relation, so a view that is merely not granted is readable.
    expect(probeSrc).toMatch(/REVOKE ALL ON public\.city_place_class_probe FROM PUBLIC, anon, authenticated/);
    expect(probeSrc).toMatch(/REVOKE ALL ON public\.city_place_class_review FROM PUBLIC, anon, authenticated/);
    expect(probeSrc).toMatch(/REVOKE ALL ON FUNCTION public\.city_place_class_signals\(\) FROM PUBLIC, anon, authenticated/);
  });
});

describe('the verdict vocabulary', () => {
  it('evaluates PER LABEL and lets a settlement label rescue the entity', () => {
    // Croydon is "area of London, market town" and Greenwich is "town,
    // district, area of London". Vetoing on the district label alone would
    // condemn two real towns.
    expect(verdictFn).toMatch(/FOREACH lbl IN ARRAY p_classes LOOP/);
    expect(verdictFn).toMatch(/RETURN 'settlement'/);
  });

  it('applies the override PER LABEL, so it cannot veto a clean sibling', () => {
    expect(verdictFn).toMatch(/is_override := true; EXIT;/);
    // THE STRUCTURE, not the presence of the flag. A blanket veto — one that
    // RETURNS on an override instead of merely declining to treat that label
    // as evidence — leaves every string above intact while condemning
    // Shijiazhuang-shaped entities that carry a clean sibling label.
    // Mutation-tested: asserting the flag alone SURVIVED that rewrite.
    expect(verdictFn).toMatch(/IF NOT is_override THEN\s+FOREACH pat IN ARRAY settlement LOOP/);
    expect(verdictFn).not.toMatch(/IF is_override THEN RETURN/);
    // Both entries are MEASURED, not imagined.
    expect(verdictFn).toContain('\\ylocal municipality\\y');
    expect(verdictFn).toContain('\\ydistrict with city status\\y');
  });

  it('checks admin_area BEFORE subdivision', () => {
    // Several admin phrases contain the bare word `district`, so the more
    // specific vocabulary has to win.
    const adminAt = verdictFn.indexOf("RETURN 'admin_area'");
    const subAt = verdictFn.indexOf("RETURN 'subdivision'");
    expect(adminAt).toBeGreaterThan(-1);
    expect(subAt).toBeGreaterThan(adminAt);
  });

  it('keeps `borough` out of BOTH lists', () => {
    // UK: an administrative district. Alaska/NJ/PA: a municipality. It would
    // misfile one or the other, and both measured rows are reached by a more
    // specific label anyway.
    expect(verdictFn).not.toContain("'\\yborough\\y'");
  });

  it('returns undetermined for nothing recognised, and never collapses it', () => {
    // A vocabulary gap must show up as a rising count of namable labels, not
    // as a confident answer.
    expect((verdictFn.match(/RETURN 'undetermined'/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses \\y and never \\b — Postgres regex has no word-boundary \\b', () => {
    expect(verdictFn).toContain('\\y');
    expect(verdictFn).not.toMatch(/\\b[a-z]/);
  });

  it('self-tests the seeded evidence against the hand-read judgement', () => {
    const verify = probeSrc.slice(probeSrc.indexOf('DO $verify$'));
    for (const [qid, expected] of [
      ['Q288781', 'subdivision'],
      ['Q2213391', 'settlement'],
      ['Q179385', 'settlement'],
      ['Q457014', 'admin_area'],
      ['Q1225159', 'admin_area'],
      ['Q21885994', 'admin_area'],
    ] as const) {
      expect(verify).toMatch(new RegExp(`\\('${qid}',\\s*'${expected}'\\)`));
    }
    expect(verify).toMatch(/v_bad <> 0/);
    // Coverage before verdict.
    expect(verify).toMatch(/live_qid_rows'\)::int < 100/);
    expect(verify).toMatch(/probe_rows'\)::int < 20/);
  });
});

describe('the sentinel', () => {
  const sig = probeSrc.slice(
    probeSrc.indexOf('CREATE OR REPLACE FUNCTION public.city_place_class_signals'),
    probeSrc.indexOf('ALTER FUNCTION public.city_place_class_signals'),
  );

  it('reports coverage separately from the verdict', () => {
    // Zero districts over an unprobed corpus is vacuous, not clean.
    for (const key of ['live_qid_rows', 'probe_rows', 'judged_rows']) {
      expect(sig).toContain(`'${key}'`);
    }
  });

  it('names unrecognised classes verbatim', () => {
    expect(sig).toContain("'unrecognised_classes'");
    expect(sig).toMatch(/verdict = 'undetermined'/);
  });

  it('is wired into the health script and fails on a broken probe', () => {
    const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');
    // Anchored on the fetch URL with its closing backtick: the bare path is a
    // PREFIX of any renamed endpoint.
    expect(health).toMatch(/\/rest\/v1\/rpc\/city_place_class_signals`/);
    const block = health.slice(health.indexOf('/rest/v1/rpc/city_place_class_signals'));
    expect(block).toMatch(/res\.status === 404/);
    expect(block).toMatch(/probed === 0/);
    expect(block).toMatch(/liveQid < 100/);
  });
});

describe('the hand-read repairs', () => {
  it('merges Kensington into London rather than archiving it', () => {
    // archive_city_as_nonplace ghosts the row, which 404s in both the SPA and
    // the crawler path and would orphan 15 venues on an unopenable row.
    expect(repairSrc).toMatch(/slug = 'london'/);
    expect(repairSrc).toMatch(/slug = 'kensington-1'/);
    expect(repairSrc).toMatch(/PERFORM public\.merge_cities\(v_keep, v_drop\)/);
    expect(repairSrc).not.toMatch(/archive_city_as_nonplace/);
  });

  it('dispositions the administrative areas so the nightly recompute skips them', () => {
    // run_city_trust_recompute rewrites seo_indexable unconditionally for every
    // row in scope, and `disposition.state='not_a_city'` is the ONLY thing that
    // takes a row out of that scope. A bare deindex would be undone nightly.
    expect(repairSrc).toMatch(/'state',\s*'not_a_city'/);
    expect(repairSrc).toMatch(/seo_indexable\s*=\s*false/);
    expect(repairSrc).toMatch(/'amber-valley'/);
    expect(repairSrc).toMatch(/'dihlabeng-local-municipality'/);
    // Not ghosted: the row must stay fetchable so its venues keep a live link.
    expect(repairSrc).toMatch(/'ghosted',\s*false/);
    expect(repairSrc).not.toMatch(/shell_status\s*=\s*'ghost'/);
  });

  it('retracts only the wrong FIELD on Greenwich, which stays a city', () => {
    const g = cityUpdate('greenwich');
    expect(g.set).toMatch(/population = NULL/);
    // Guarded on the value actually being London's.
    expect(g.where).toMatch(/population = 8800000/);
    // The entity is RIGHT (Q179385 is Greenwich), so it is not touched —
    // the `casting` rule of repairing only the wrong fields.
    expect(g.set).not.toMatch(/wikidata_qid\s*=\s*NULL/);
    expect(g.set).not.toMatch(/description\s*=\s*NULL/);
  });

  it('nulls Clapham’s wrong entity in all four fields and never repoints', () => {
    const c = cityUpdate('clapham');
    for (const col of ['wikidata_qid', 'wikipedia_title', 'description', 'population']) {
      expect(c.set).toMatch(new RegExp(`${col}\\s*=\\s*NULL`));
    }
    // The cached title is why nulling the QID alone is not enough:
    // city-factual-backfill fetches BY TITLE, never by cities.name, so a
    // surviving "Clapham, Bedfordshire" rebuilds the same wrong prose.
    expect(c.set).toMatch(/'wikipedia_title',\s*wikipedia_title/);
    // Terminal, or the qid_gap sweep re-adopts the same village on the name.
    expect(c.set).toMatch(/'state',\s*'data_unavailable'/);
    // NO repoint: a plausible-but-wrong QID regenerates wrong facts weekly
    // while a null one regenerates nothing. Asserted on the SET half only —
    // the WHERE half legitimately quotes the QID it is guarding on.
    expect(c.set).not.toMatch(/wikidata_qid\s*=\s*'Q\d+'/);
    expect(c.where).toMatch(/wikidata_qid = 'Q1520409'/);
  });

  it('preserves every value it retracts', () => {
    // A retraction that records nothing is a deletion. Asserted FIELD BY
    // FIELD: `'retracted', jsonb_build_object` is present whatever is inside
    // it, so a generic match survives dropping one of the four recorded
    // values. Mutation-tested — it did.
    const c = cityUpdate('clapham').set;
    expect(c).toMatch(/'qid',\s*'Q1520509'|'qid',\s*'Q1520409'/);
    expect(c).toMatch(/'wikipedia_title',\s*wikipedia_title/);
    expect(c).toMatch(/'population',\s*population/);
    expect(c).toMatch(/'description',\s*description/);
    const g = cityUpdate('greenwich').set;
    expect(g).toMatch(/'from',\s*population/);
    // jsonb_set(create_missing) creates only the LAST path element, so it
    // silently writes nothing when the parent key is absent.
    expect(repairSrc).not.toMatch(/jsonb_set/);
    // And the migration asserts the preservation at apply time too.
    const verify = repairSrc.slice(repairSrc.indexOf('DO $verify$'));
    expect(verify).toMatch(/clapham did not preserve the description it retracted/);
    expect(verify).toMatch(/greenwich did not record what was retracted/);
  });

  it('asserts Croydon and Greenwich SURVIVE as indexable cities', () => {
    // A sweep that satisfies "the districts are gone" by taking these too must
    // break this file's own check.
    const verify = repairSrc.slice(repairSrc.indexOf('DO $verify$'));
    expect(verify).toMatch(/CONTROL: croydon was changed/);
    expect(verify).toMatch(/CONTROL: greenwich stopped being an indexable city/);
    expect(verify).toMatch(/slug = 'croydon'[\s\S]{0,120}seo_indexable/);
    expect(verify).toMatch(/v_bad <> 0/);
  });

  it('asserts the admin areas KEEP their venues', () => {
    const verify = repairSrc.slice(repairSrc.indexOf('DO $verify$'));
    expect(verify).toMatch(/amber-valley lost its venues/);
  });
});
