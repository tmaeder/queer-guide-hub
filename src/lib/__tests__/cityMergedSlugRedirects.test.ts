import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991790173320_city_merged_slug_redirects.sql and
 * 99991790173553_city_exonym_and_admin_duplicate_merges.sql.
 *
 * `cities` was the ONE entity with no `<type>_slug_redirects` table, so
 * `SLUG_REDIRECT_KINDS` had no city entry and `resolveSlugRedirect` could never
 * answer for a city — which made `cityDetail`'s own comment ("'merged' is left
 * to resolveSlugRedirect, which turns it into a 301") false. Measured on prod
 * with a Googlebot UA against a nonsense-slug control that correctly 404s:
 * /city/antwerpen, /city/bruessel and /city/city-of-rochester each returned
 * HTTP 200 with a canonical pointing at THEMSELVES while the survivors held the
 * content. 71 rows were in that state.
 *
 * Every assertion runs against COMMENT-STRIPPED SQL: both migration headers
 * quote the defect, the column names and the slugs verbatim, so a bare
 * `toContain` over the raw file passes with the statements deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const REDIRECTS = '99991790173320_city_merged_slug_redirects.sql';
const MERGES = '99991790173553_city_exonym_and_admin_duplicate_merges.sql';

function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function read(name: string): string {
  return statements(readFileSync(join(MIGRATIONS, name), 'utf8'));
}

/** A migration is present under THIS name, not merely at this version — a
 *  version applied under a sibling PR's name means the file never ran. */
function present(name: string): boolean {
  return readdirSync(MIGRATIONS).includes(name);
}

const redirectSrc = read(REDIRECTS);
const mergeSrc = read(MERGES);

/** The trigger function body only. The migration's verify block repeats several
 *  of these column names, so an unscoped match passes with the branch gone. */
const triggerFn = (() => {
  const from = redirectSrc.indexOf('CREATE OR REPLACE FUNCTION public.cities_merge_redirect');
  expect(from).toBeGreaterThan(-1);
  return redirectSrc.slice(from, redirectSrc.indexOf('$fn$;', from));
})();

describe('city_slug_redirects', () => {
  it('both migrations are present under their own names', () => {
    expect(present(REDIRECTS)).toBe(true);
    expect(present(MERGES)).toBe(true);
  });

  it('matches the shape of the twelve sibling redirect tables', () => {
    expect(redirectSrc).toMatch(/CREATE TABLE IF NOT EXISTS public\.city_slug_redirects/);
    expect(redirectSrc).toMatch(/old_slug\s+text\s+NOT NULL PRIMARY KEY/);
    expect(redirectSrc).toMatch(/city_id\s+uuid\s+NOT NULL REFERENCES public\.cities\(id\) ON DELETE CASCADE/);
  });

  it('is readable by anon — the 301 is resolved before any session exists', () => {
    expect(redirectSrc).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(redirectSrc).toMatch(/CREATE POLICY city_slug_redirects_public_read/);
    expect(redirectSrc).toMatch(/GRANT SELECT ON public\.city_slug_redirects TO anon, authenticated/);
  });
});

describe('the merge trigger', () => {
  it('is UNSCOPED BEFORE UPDATE, not scoped to duplicate_of_id', () => {
    // A column-scoped trigger fires on the columns named in the STATEMENT
    // rather than on what changed — the trap 20260807100200 records. The guard
    // inside is two null tests, so being unscoped costs nothing.
    expect(redirectSrc).toMatch(
      /CREATE TRIGGER trg_cities_zz_merge_redirect\s+BEFORE UPDATE ON public\.cities/,
    );
    expect(redirectSrc).not.toMatch(/BEFORE UPDATE OF duplicate_of_id ON public\.cities/);
  });

  it('deindexes and marks the row on the way in', () => {
    const merged = triggerFn.slice(
      triggerFn.indexOf('IF NEW.duplicate_of_id IS NOT NULL'),
      triggerFn.indexOf('ELSIF'),
    );
    expect(merged).toMatch(/NEW\.shell_status\s*:=\s*'merged'/);
    expect(merged).toMatch(/NEW\.seo_indexable\s*:=\s*false/);
    expect(merged).toMatch(/INSERT INTO public\.city_slug_redirects/);
  });

  it('records the prior flags with || and never jsonb_set(create_missing)', () => {
    // jsonb_set creates only the LAST path element, so it silently writes
    // nothing when the parent key is absent — a record that records nothing.
    expect(triggerFn).toMatch(/jsonb_build_object\('merge_flags'/);
    expect(triggerFn).toMatch(/'prior_shell_status'/);
    expect(triggerFn).toMatch(/'prior_seo_indexable'/);
    expect(triggerFn).not.toMatch(/jsonb_set/);
  });

  it('repoints redirects that pointed at the row now being merged away', () => {
    // Otherwise a later merge of the survivor leaves a 301 into another merged
    // slug, and the middleware emits one hop into a retired page.
    expect(triggerFn).toMatch(
      /UPDATE public\.city_slug_redirects\s+SET city_id = NEW\.duplicate_of_id\s+WHERE city_id = NEW\.id/,
    );
  });

  it('reverses on unmerge, restoring recorded values rather than guessing', () => {
    const un = triggerFn.slice(triggerFn.indexOf('ELSIF'));
    expect(un).toMatch(/DELETE FROM public\.city_slug_redirects WHERE old_slug = NEW\.slug/);
    // A row merged away from 'placeholder' must not come back as 'real'.
    expect(un).toMatch(/prior_shell_status/);
    expect(un).toMatch(/prior_seo_indexable/);
    expect(un).toMatch(/- 'merge_flags'/);
  });
});

describe('the backfill', () => {
  it('resolves merge chains to the terminal survivor', () => {
    // A redirect built from the immediate parent 301s into a retired slug.
    expect(redirectSrc).toMatch(/WITH RECURSIVE chain AS/);
    expect(redirectSrc).toMatch(/DISTINCT ON \(start_id\)[\s\S]{0,200}ORDER BY start_id, depth DESC/);
  });

  it('deindexes every merged row', () => {
    const upd = redirectSrc.slice(redirectSrc.indexOf('UPDATE public.cities\n   SET shell_status'));
    expect(upd).toMatch(/shell_status\s*=\s*'merged'/);
    expect(upd).toMatch(/seo_indexable\s*=\s*false/);
    expect(upd).toMatch(/WHERE duplicate_of_id IS NOT NULL/);
  });

  it('asserts coverage as well as the verdict, and refuses chains and loops', () => {
    const verify = redirectSrc.slice(redirectSrc.indexOf('DO $verify$'));
    // Anchored on the CONDITIONS, not on the text they print.
    expect(verify).toMatch(/v_indexable <> 0/);
    expect(verify).toMatch(/v_unredirected <> 0/);
    expect(verify).toMatch(/v_redirects < 300/); // zero failures over an empty table is vacuous
    expect(verify).toMatch(/v_self <> 0/);
    expect(verify).toMatch(/v_dangling <> 0/);
  });
});

describe('the six merges', () => {
  const PAIRS: Array<[string, string]> = [
    ['luxembourg', 'tmp-f44eb1b0-38a0-4b54-a8b7-afb45f5f3eb7'],
    ['luxembourg', 'tmp-83f01b08-11bd-43aa-bf40-140d62d783f8'],
    ['mogadishu', 'tmp-c98ebee4-d6a0-4325-a4fd-98b5e1ea604c'],
    ['novosibirsk', 'tmp-ec3984a3-5c48-4442-91cd-926360620e04'],
    ['damascus', 'tmp-e5ca94c2-4b09-42f7-b4d7-9f6624cfc694'],
    ['nottingham-gb-04sfx', 'city-of-nottingham'],
  ];

  it('names every pair in all THREE lists, keep first', () => {
    // The pair list is written out three times — the pre-merge snapshot, the
    // merge loop, and the verify block — and all three must agree. A pair
    // present in the loop but missing from the verify list would be merged
    // and never checked; a pair missing from the snapshot would be merged
    // with no content-loss baseline.
    //
    // BY COUNT, not by presence. Mutation-tested: asserting each pair appears
    // SOMEWHERE survives deleting it from one of the three lists.
    //
    // Whitespace-tolerant: the VALUES lists are column-aligned in the file.
    for (const [keep, drop] of PAIRS) {
      const hits = mergeSrc.match(new RegExp(`\\('${keep}',\\s+'${drop}'\\)`, 'g')) ?? [];
      expect(hits.length, `${drop} is not in all three pair lists`).toBe(3);
    }
    // Positive control on the matcher itself: a pair that is NOT in the file
    // must not match, or the six assertions above prove nothing.
    expect(mergeSrc).not.toMatch(/\('luxembourg',\s+'tmp-not-a-real-slug'\)/);
  });

  it('calls merge_cities, and the two-argument form', () => {
    // Every pair is same-country, so the cross-country confirmation the third
    // argument exists for must not be engaged.
    expect(mergeSrc).toMatch(/PERFORM public\.merge_cities\(v_keep, v_drop\);/);
    expect(mergeSrc).not.toMatch(/merge_cities\(v_keep, v_drop, true\)/);
  });

  it('is SOFT on preconditions — a pair already merged is skipped, not raised', () => {
    // An exact-match premise turns a concurrent, individually-correct repair
    // into a db push failure on main that blocks every queued migration.
    const loop = mergeSrc.slice(mergeSrc.indexOf('FOR r IN'), mergeSrc.indexOf('END $merge$'));
    expect(loop).toMatch(/v_drop_dup IS NOT NULL/);
    expect(loop).toMatch(/CONTINUE;/);
    expect(loop).not.toMatch(/RAISE EXCEPTION/);
  });

  it('moves both identifiers to the survivor and clears them from the loser', () => {
    // merge_cities does not move wikidata_qid, so without this the merge LOSES
    // the identifier. Clearing the loser is what keeps unmerge_cities from
    // resurrecting a second live row holding it and failing on 23505.
    for (const qid of ['Q3766', 'Q1842']) {
      expect(mergeSrc).toContain(`wikidata_qid = '${qid}'`);
      expect(mergeSrc).toContain(`'value', '${qid}'`);
    }
    // BY COUNT, not by presence. There are two clearing UPDATEs — one per
    // identifier — so a bare match is satisfied by the surviving copy while
    // the other loser keeps its QID and unmerge_cities fails on 23505.
    // Mutation-tested: presence alone SURVIVED.
    expect((mergeSrc.match(/SET wikidata_qid\s*=\s*NULL/g) ?? []).length).toBe(2);
  });

  it('guards the identifier writes on the survivor being QID-less', () => {
    // So a human correction made between authoring and apply is not overwritten.
    //
    // ANCHORED ON CODE, NOT ON A COMMENT LABEL. The first draft sliced from
    // the `-- Damascus <- Q3766` header, which the comment stripper removes,
    // so indexOf returned -1 and the slice silently became the tail of the
    // file. A scoped assertion anchored on a comment is an empty slice.
    const qidBlock = mergeSrc.slice(
      mergeSrc.indexOf('UPDATE public.cities d'),
      mergeSrc.indexOf('DO $verify$'),
    );
    expect(qidBlock.length).toBeGreaterThan(200);
    // Both halves: the loser is only stripped when it really is merged into
    // this survivor, and the survivor only takes a QID it does not have.
    expect((qidBlock.match(/k\.wikidata_qid IS NULL/g) ?? []).length).toBe(2);
    expect((qidBlock.match(/AND wikidata_qid IS NULL/g) ?? []).length).toBe(2);
    expect((qidBlock.match(/d\.duplicate_of_id = k\.id/g) ?? []).length).toBe(2);
  });

  it('asserts the reached end state, not a count of updates', () => {
    const verify = mergeSrc.slice(mergeSrc.indexOf('DO $verify$'));
    expect(verify).toMatch(/v_bad <> 0/);
    expect(verify).toMatch(/d\.shell_status = 'merged'/);
    expect(verify).toMatch(/d\.seo_indexable = false/);
    expect(verify).toMatch(/city_slug_redirects sr/);
    expect(verify).toMatch(/v_lost <> 0/);
    // Both identifiers must land, and neither may be held twice — the shape
    // that would break unmerge_cities.
    expect(verify).toMatch(/wikidata_qid = 'Q3766'/);
    expect(verify).toMatch(/wikidata_qid = 'Q1842'/);
    expect(verify).toMatch(/IN \('Q3766','Q1842'\)\) <> 2/);
  });
});

describe('the edge layer resolves a merged city', () => {
  const detail = readFileSync(join(process.cwd(), 'functions', '_lib', 'detail.ts'), 'utf8');

  it('registers a city kind in SLUG_REDIRECT_KINDS', () => {
    const kinds = detail.slice(
      detail.indexOf('const SLUG_REDIRECT_KINDS'),
      detail.indexOf('* Merged/renamed-entity redirect'),
    );
    expect(kinds).toMatch(/test: \(k\) => k === 'city'/);
    expect(kinds).toContain("redirectTable: 'city_slug_redirects'");
    expect(kinds).toContain("redirectIdColumn: 'city_id'");
    expect(kinds).toContain("routePrefix: '/city'");
    // A redirect whose target is itself merged is a 301 into a retired slug.
    expect(kinds).toContain("entityFilter: 'duplicate_of_id=is.null'");
  });

  it('cityDetail returns null for a merged row so the 301 can happen', () => {
    const fn = detail.slice(
      detail.indexOf('async function cityDetail'),
      detail.indexOf('async function countryDetail'),
    );
    expect(fn).toMatch(/shell === 'ghost' \|\| shell === 'merged'/);
  });
});
