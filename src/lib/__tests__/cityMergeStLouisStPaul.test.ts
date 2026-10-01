import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards 99991790881362_city_merge_st_louis_st_paul.sql.
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SOURCE. The migration's header
 * quotes its own defect values verbatim -- 108088, 311527, every Réunion
 * alias_key, both uuids -- so a `toContain` over the raw file is satisfied by
 * the prose while the executable statement is gone. That is the vacuous-
 * assertion class this corpus has recorded repeatedly; `sql` below is the only
 * text any check may read.
 *
 * It also guards the APPLIED sibling 99991790797580, whose P3 asserts zero
 * st louis/st paul aliases. That file must NOT be edited: on a rebuild from zero
 * it runs BEFORE this one, so its assertion is true at its point in the
 * ordering, and rewriting it to expect the aliases would break that path.
 */

const MIGRATION = '99991790881362_city_merge_st_louis_st_paul.sql';
const SIBLING = '99991790797580_city_alias_washington_dc.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const siblingRaw = readFileSync(join(process.cwd(), 'supabase/migrations', SIBLING), 'utf8');

/** Drop whole-line SQL comments. Line-anchored on the trimmed form. */
const stripComments = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const sql = stripComments(raw);

const KEEP_STL = 'a6c09eb9-f514-4987-9d94-e1fb25a4205d';
const DROP_STL = '5987db13-9a4f-4c4e-b87a-020731926350';
const KEEP_STP = '637d48ff-6b95-4eb9-a8c5-c99a10608187';
const DROP_STP = 'b2f12f63-cd73-47dd-a149-951863bec49f';

/** The 11 Saint-Paul/Réunion alias keys, measured as 11 of 11 on the row. */
const REUNION_KEYS = [
  'saint-paul',
  'saint-paul de la reunion',
  'σαιν-πωλ',
  'сен пол',
  'сен-поль',
  'սեն պոլ',
  'סן-פול',
  'سن بول ريونيون',
  '생폴',
  'サン=ポール',
  '圣保罗',
];

/** The verify block only, so a header that quotes a condition cannot vouch for it. */
const verify = sql.slice(sql.indexOf('DO $verify$'));

describe('city merge: St. Louis and St. Paul', () => {
  it('strips comments, and the stripper is load-bearing', () => {
    // Positive control: the header quotes values the statements also use, so if
    // this ever stops being true every scoped assertion below goes vacuous.
    expect(raw).toContain('SAINT-PAUL, RÉUNION');
    expect(sql).not.toContain('SAINT-PAUL, RÉUNION');
    expect(sql.length).toBeLessThan(raw.length);
  });

  describe('direction -- the identifier does not travel, so it decides', () => {
    it('keeps the row carrying Q38022 and drops the other', () => {
      expect(sql).toMatch(
        new RegExp(
          `p_keep_id\\s*=>\\s*'${KEEP_STL}'[\\s\\S]{0,200}?p_drop_id\\s*=>\\s*'${DROP_STL}'`,
        ),
      );
      // And never the reverse, which would strand Q38022 on a merged-away row.
      expect(sql).not.toMatch(new RegExp(`p_keep_id\\s*=>\\s*'${DROP_STL}'`));
    });

    it('keeps the content-bearing St. Paul row and drops the tmp- shell', () => {
      expect(sql).toMatch(
        new RegExp(
          `p_keep_id\\s*=>\\s*'${KEEP_STP}'[\\s\\S]{0,200}?p_drop_id\\s*=>\\s*'${DROP_STP}'`,
        ),
      );
      expect(sql).not.toMatch(new RegExp(`p_keep_id\\s*=>\\s*'${DROP_STP}'`));
    });

    it('never confirms a cross-country merge', () => {
      const confirms = sql.match(/p_confirm_cross_country\s*=>\s*false/g) ?? [];
      expect(confirms).toHaveLength(2);
      expect(sql).not.toMatch(/p_confirm_cross_country\s*=>\s*true/);
    });
  });

  describe('soft on preconditions', () => {
    it('guards each merge rather than asserting its precondition', () => {
      // merge_cities RAISEs on an already-merged row, which under db push aborts
      // every migration queued behind this one. Both calls must sit behind an
      // existence check on BOTH sides.
      for (const [keep, drop] of [
        [KEEP_STL, DROP_STL],
        [KEEP_STP, DROP_STP],
      ]) {
        const guard = new RegExp(
          `IF EXISTS \\(SELECT 1 FROM public\\.cities[\\s\\S]{0,160}?'${keep}' AND duplicate_of_id IS NULL\\)` +
            `[\\s\\S]{0,200}?'${drop}' AND duplicate_of_id IS NULL\\)`,
        );
        expect(sql).toMatch(guard);
      }
      // Two guarded calls, two ELSE branches that no-op.
      expect((sql.match(/ELSE\s*\n\s*RAISE NOTICE/g) ?? []).length).toBe(2);
    });
  });

  describe('the scalars merge_cities cannot carry', () => {
    const carry = sql.slice(
      sql.indexOf('UPDATE public.cities k'),
      sql.indexOf('DELETE FROM public.city_aliases'),
    );

    it('is content-guarded on both arms', () => {
      // A human who fixes either field first keeps their work.
      expect(carry).toMatch(
        /WHEN k\.population = 108088 THEN d\.population ELSE k\.population END/,
      );
      expect(carry).toMatch(/nullif\(btrim\(coalesce\(k\.description, ''\)\), ''\) IS NULL/);
      expect(carry).toMatch(
        /AND \(k\.population = 108088 OR nullif\(btrim\(coalesce\(k\.description, ''\)\), ''\) IS NULL\)/,
      );
    });

    it('carries the column value and does NOT write the prose-derived figure', () => {
      // 311527 is better and is recorded only as a note. Writing it would be a
      // text-derived scalar, which is not a measurement.
      expect(carry).toMatch(/'value',\s*d\.population/);
      expect(carry).toMatch(/'better_value_known',\s*311527/);
      expect(carry).not.toMatch(/population\s*=\s*311527/);
      expect(carry).not.toMatch(/THEN\s*311527/);
    });

    it('records what it superseded', () => {
      expect(carry).toMatch(/'superseded_value',\s*108088/);
    });

    it('builds provenance with || and never jsonb_set', () => {
      // jsonb_set(create_missing) creates only the LAST path element, so on a row
      // with no `population` key it writes nothing while every other check passes.
      expect(carry).not.toContain('jsonb_set');
      expect(carry).toMatch(/coalesce\(k\.field_provenance, '\{\}'::jsonb\) \|\|/);
      expect(carry).toMatch(/coalesce\(k\.field_provenance->'population', '\{\}'::jsonb\) \|\|/);
    });

    it('is scoped to the one St. Paul pair', () => {
      expect(carry).toContain(`k.id = '${KEEP_STP}'`);
      expect(carry).toContain(`d.id = '${DROP_STP}'`);
    });
  });

  describe("Réunion's aliases leave before the new one arrives", () => {
    const del = sql.slice(
      sql.indexOf('DELETE FROM public.city_aliases'),
      sql.indexOf('INSERT INTO public.city_aliases'),
    );

    it('deletes a FROZEN list, never a pattern', () => {
      expect(del).not.toMatch(/LIKE|ILIKE|~|similar to/i);
      expect(del).toContain('alias_key IN (');
    });

    it('names all 11 keys -- a partial list leaves a live routing defect', () => {
      // Asserted by COUNT as well as by membership: a surviving copy of the list
      // elsewhere in the file would satisfy membership alone.
      for (const k of REUNION_KEYS) expect(del).toContain(`'${k}'`);
      const quoted = del.match(/'[^']+'/g) ?? [];
      expect(quoted.filter((q) => REUNION_KEYS.includes(q.slice(1, -1)))).toHaveLength(11);
    });

    it('is scoped to the Minnesota row so another city keeps its own alias', () => {
      expect(del).toContain(`city_id = '${KEEP_STP}'`);
    });
  });

  describe('the two aliases 99991790797580 refused', () => {
    const ins = sql.slice(
      sql.indexOf('INSERT INTO public.city_aliases'),
      sql.indexOf('WITH verified'),
    );

    it('inserts exactly St Louis and St Paul, on the survivors', () => {
      expect(ins).toContain(`'${KEEP_STL}'::uuid, 'St Louis'`);
      expect(ins).toContain(`'${KEEP_STP}'::uuid, 'St Paul'`);
    });

    it('never inserts the generated alias_key column', () => {
      // alias_key is GENERATED ALWAYS AS city_canonical_key(alias); inserting it
      // raises 428C9.
      expect(ins).toMatch(/INSERT INTO public\.city_aliases \(city_id, alias, locale\)/);
      expect(ins).not.toMatch(/INSERT INTO public\.city_aliases[^)]*alias_key/);
    });

    it('only ever targets a canonical row', () => {
      expect(ins).toContain('c.duplicate_of_id IS NULL');
      expect(ins).toContain('ON CONFLICT (city_id, alias_key) DO NOTHING');
    });
  });

  describe('the stamp release links nothing', () => {
    const release = sql.slice(sql.indexOf('WITH verified'), sql.indexOf('DO $verify$'));

    it('is a stamp DELETION, so guards A and B still decide', () => {
      expect(release).toMatch(/SET enrichment_status = e\.enrichment_status - 'event_city_link'/);
    });

    it('never writes city_id anywhere in the migration', () => {
      // Writing it here would bypass the namesake guards and reimplement the runner.
      expect(sql).not.toMatch(/UPDATE public\.events[\s\S]*?SET[^;]*city_id\s*=/);
    });

    it('pins each name to the city the alias must resolve to', () => {
      expect(release).toContain("('St Louis', 'US', 'Saint Louis', 'Missouri')");
      expect(release).toContain("('St Paul',  'US', 'Saint Paul',  'Minnesota')");
      expect(release).toMatch(/c\.id = public\.city_by_alias\(e\.country_id, e\.city\)/);
      expect(release).toContain('c.name = v.target_name');
      expect(release).toContain('c.region_name = v.target_region');
    });

    it('leaves a blocked row alone', () => {
      expect(release).toMatch(/enrichment_status->'event_city_link'->>'blocked' IS NULL/);
    });
  });

  describe('postconditions', () => {
    it('asserts the identifier survived -- the whole reason for the direction', () => {
      expect(verify).toMatch(/IF v_name IS DISTINCT FROM 'Q38022' THEN/);
      expect(verify).toMatch(/RAISE EXCEPTION 'P2:/);
    });

    it('uses the LIVE-row content floors, not the unfiltered sums', () => {
      // 219/34 are the unfiltered counts and FAILED on correct code in the dry
      // run; st-louis holds 202 live events + 1 merged-away, 26 live venues + 3.
      expect(verify).toMatch(/IF v_n < 218 THEN/);
      expect(verify).toMatch(/IF v_n < 31 THEN/);
      expect(verify).toMatch(/IF v_n < 11 THEN/);
      expect(verify).not.toMatch(/IF v_n < 219 THEN/);
      expect(verify).not.toMatch(/IF v_n < 34 THEN/);
      // The floors must be counted over live rows only, or they measure nothing.
      expect((verify.match(/AND duplicate_of_id IS NULL/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it('checks the aliases RESOLVE, not merely that they exist', () => {
      // A row the de-qualification rule refuses satisfies existence and links
      // nothing. Verified live: both resolve.
      expect(verify).toMatch(/public\.city_by_alias\(v_us, 'St Louis'\)/);
      expect(verify).toMatch(/public\.city_by_alias\(v_us, 'St Paul'\)/);
      expect(verify).toMatch(/IF v_name IS DISTINCT FROM 'Saint Louis' THEN/);
      expect(verify).toMatch(/IF v_name IS DISTINCT FROM 'Saint Paul' THEN/);
    });

    it('asserts the population correction is RECORDED, not just applied', () => {
      // A bare value check passes on a row someone set by hand with no record.
      expect(verify).toMatch(/field_provenance->'population'->>'superseded_value' = '108088'/);
      expect(verify).toMatch(/field_provenance->'population'->>'better_value_known' = '311527'/);
    });

    it('asserts the redirect the trigger -- not merge_cities -- creates', () => {
      expect(verify).toMatch(/city_slug_redirects WHERE old_slug = 'st-louis'/);
    });

    it('asserts both merges are reversible', () => {
      expect(verify).toMatch(/details->>'schema' = '1'/);
      expect(verify).toMatch(/details->'moved' IS NOT NULL/);
    });

    it('asserts the surviving slugs did not move', () => {
      expect(verify).toMatch(/IF v_slug IS DISTINCT FROM 'saint-louis' THEN/);
      expect(verify).toMatch(/IF v_slug IS DISTINCT FROM 'saint-paul' THEN/);
    });

    it('cannot be neutered', () => {
      // Short-circuiting a predicate leaves every string-anchored assertion green
      // while the check has stopped counting, so the conditions are counted and
      // a literal false is banned outright.
      expect(verify).not.toMatch(/\bfalse\b/i);
      expect(verify).not.toMatch(/v_n\s+int\s*:=/); // no pre-seeded counter
      const conditions = verify.match(/IF v_n (<>|<) \d+ THEN/g) ?? [];
      expect(conditions.length).toBeGreaterThanOrEqual(9);
      // Every P must RAISE; a check that computes and does nothing is not a check.
      const raises = verify.match(/RAISE EXCEPTION 'P\d+[a-d]?:/g) ?? [];
      expect(raises.length).toBeGreaterThanOrEqual(18);
    });
  });

  describe('the applied sibling is not edited', () => {
    it("leaves 99991790797580's P3 refusing both aliases", () => {
      // It runs BEFORE this file on a rebuild, so its assertion is true at its
      // point in the ordering. Rewriting it to expect the aliases breaks that.
      const siblingVerify = stripComments(siblingRaw);
      expect(siblingVerify).toContain("alias_key IN ('st louis', 'st paul')");
      expect(siblingVerify).toMatch(/RAISE EXCEPTION 'P3:/);
      expect(siblingVerify).toMatch(/IF v_n <> 0 THEN/);
    });
  });
});
