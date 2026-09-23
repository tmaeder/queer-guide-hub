import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991790187863_city_district_shells_merge.sql.
 *
 * Eighteen `personality-birth-place` shells whose NAME is a district of a city
 * we already hold. All were deindexed placeholders with no venues — but all
 * were live in `search_documents`, because the city indexer filters
 * duplicate_of_id and ghost/merged and a `placeholder` is none of those. A site
 * search for "Charlottenburg" returned a city card for a Berlin Ortsteil.
 *
 * The rule the file rests on, and what these assertions protect:
 *
 *   `Parent-Ortsteil` (HYPHEN) is the German convention for a district.
 *   `X, Parent` (COMMA) is NOT, outside Berlin — `Stolberg, Aachen` and
 *   `Meerane, Chemnitz` are their own towns, and `Brambauer, Dortmund` is a
 *   district of LÜNEN. Berlin is the one safe exception because it is a
 *   Bundesland: there is no Landkreis Berlin whose towns could be so qualified.
 *
 * Comment-stripped throughout: the header quotes every slug, every counter-
 * example and the word "district" many times over, so a bare `toContain` over
 * the raw file passes with the statements gone.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '99991790187863_city_district_shells_merge.sql';

function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}
const src = statements(readFileSync(join(MIGRATIONS, FILE), 'utf8'));

/** Berlin's twelve, then the six elsewhere. Parent slug -> shell slug. */
const PAIRS: Array<[string, string]> = [
  ['berlin', 'tmp-d71a07b9-e156-49e2-88e8-c8bf30b38de1'],
  ['berlin', 'tmp-c371f4f3-a282-4653-8321-fc3906c6bb2d'],
  ['berlin', 'tmp-a5ca9d6b-f82f-41f6-91f6-67661bbffd85'],
  ['berlin', 'tmp-bd8f06af-c005-456a-bd20-b0a0e313f4ac'],
  ['berlin', 'tmp-4c940540-f117-4d4b-922b-8b2382abbdcd'],
  ['berlin', 'tmp-43e65f12-7388-419a-bf1c-50f73fea7ef6'],
  ['berlin', 'tmp-2bb6ab0c-0922-4a63-927c-b48f2d50f9b0'],
  ['berlin', 'tmp-7cf2383c-871a-4a6b-9b78-5830c6c24a30'],
  ['berlin', 'tmp-d488108f-d0fc-4307-8b7f-3b2cdc43e45c'],
  ['berlin', 'tmp-a52da4fa-9720-4b83-8b40-8f43b418f77b'],
  ['berlin', 'tmp-29f40f49-16bd-466e-88cb-c7964b806d4f'],
  ['berlin', 'tmp-0bb33fb0-7e95-48d4-a249-6207bf8168ef'],
  ['leipzig-de-bjjxj', 'tmp-4cda928b-3bba-4705-a43c-d6bf21dd4fa8'],
  ['mannheim-de-3hr06', 'tmp-6a6d0e78-0190-4433-9e24-8a1b6755fc32'],
  ['wiesbaden-de-v4159', 'tmp-40d56ebe-684d-46b4-b214-3e860b6d3272'],
  ['wiesbaden-de-v4159', 'tmp-ce3c87de-61f0-4c83-8636-5ccb41bd785a'],
  ['wuppertal', 'tmp-367b854d-2142-4a31-af90-547d69800f1c'],
  ['wuppertal', 'tmp-cb699ad2-ce47-47fa-9a5c-99fbdf807fb1'],
];

/** Own towns wrongly shaped like a district. Must never be in the merge list. */
const OWN_TOWNS: Array<[string, string]> = [
  ['Stolberg, Aachen', 'tmp-9df641a0-3e30-4a4a-ab66-7037501b8877'],
  ['Meerane, Chemnitz', 'tmp-ec6a5e18-3289-4d20-bb0f-d0d4698d7f29'],
  ['Burg, Magdeburg', 'tmp-cba0456f-7068-48d2-856b-7ce02fc759cc'],
  ['Ladenburg, Mannheim', 'tmp-91931770-e6f5-4cfe-b55b-5a310434044c'],
];

describe('the district merge list', () => {
  it('the migration is present under its own name', () => {
    expect(readdirSync(MIGRATIONS)).toContain(FILE);
  });

  it('names all eighteen pairs in BOTH the merge loop and the verify block', () => {
    // BY COUNT. The pair list is written twice and both copies must agree: a
    // pair merged but absent from the verify list would never be checked.
    for (const [keep, drop] of PAIRS) {
      const hits = src.match(new RegExp(`\\('${keep}',\\s+'${drop}'\\)`, 'g')) ?? [];
      expect(hits.length, `${drop} is not in both pair lists`).toBe(2);
    }
    // Positive control on the matcher: a pair that is NOT in the file must not
    // match, or the eighteen assertions above prove nothing.
    expect(src).not.toMatch(/\('berlin',\s+'tmp-not-a-real-slug'\)/);
  });

  it('merges an own town into NOBODY — the comma form outside Berlin', () => {
    // The whole reason the list is explicit rather than a `LIKE parent || '-%'`
    // predicate. `Brambauer, Dortmund` is a district of Lünen; the city in the
    // name is not even the parent.
    for (const [, slug] of OWN_TOWNS) {
      const merged = src.match(new RegExp(`\\('[a-z0-9-]+',\\s+'${slug}'\\)`, 'g')) ?? [];
      expect(merged.length, `${slug} must not be merged`).toBe(0);
    }
  });

  it('requires the parent to be a REAL indexable city, not a placeholder shell', () => {
    // `Duisburg-Ruhrort`'s parent `Duisburg` is itself a tmp- shell. Merging
    // into it would point a redirect at a shell. Enforced, not just documented.
    expect(src).toMatch(/shell_status\s*=\s*'real'\s+AND\s+seo_indexable/);
    expect(src).toMatch(/NOT v_keep_ok/);
    // And the excluded row is never in the list.
    expect(src).not.toMatch(/'tmp-e5c53109-0f8b-42be-a132-6443ea4d469f'\)\s*,?\s*--\s*merge/i);
  });

  it('is SOFT on preconditions — an already-merged pair is skipped, not raised', () => {
    const loop = src.slice(src.indexOf('FOR r IN'), src.indexOf('END $merge$'));
    expect(loop).toMatch(/v_drop_dup IS NOT NULL/);
    expect((loop.match(/CONTINUE;/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(loop).not.toMatch(/RAISE EXCEPTION/);
  });

  it('uses the two-argument merge_cities — same country throughout', () => {
    expect(src).toMatch(/PERFORM public\.merge_cities\(v_keep, v_drop\);/);
    expect(src).not.toMatch(/merge_cities\(v_keep, v_drop, true\)/);
  });
});

describe('the verify block', () => {
  const verify = src.slice(src.indexOf('DO $verify$'));

  it('asserts the reached end state, not a count of merges', () => {
    expect(verify).toMatch(/d\.shell_status = 'merged'/);
    expect(verify).toMatch(/d\.seo_indexable = false/);
    expect(verify).toMatch(/city_slug_redirects sr/);
    expect(verify).toMatch(/v_bad <> 0/);
  });

  it('asserts the REINDEX QUEUE, not search_documents', () => {
    // search_documents is written by search_reindex_drain (*/1), not inline, so
    // asserting it inside the transaction would pass for the wrong reason —
    // nothing has drained yet. The queue is what this transaction can prove.
    expect(verify).toMatch(/search_reindex_queue/);
    expect(verify).not.toMatch(/FROM public\.search_documents/);
    expect(verify).toMatch(/v_q = 0/);
  });

  it('asserts no personality was lost and the birth places followed', () => {
    // birth_place is the only human-readable record of the district once the
    // city link points at the parent. These are biographical records of named
    // individuals, so losing it is not a cosmetic regression.
    expect(verify).toMatch(/v_lost <> 0/);
    // THE THRESHOLD, not the column name. The regex appears twice — in the
    // null check and in the count check — so asserting it alone survives
    // neutering `< 9` to `< 0`. Mutation-tested: it did.
    expect(verify).toMatch(/birth_place ~\* '\^Berlin-'\) < 9 THEN/);
  });

  it('keeps every assertion armed — none neutered to a bare NULL', () => {
    // Each control is a predicate AND a RAISE. Asserting only the slug inside
    // the predicate survives replacing the RAISE with `NULL;`, which is exactly
    // what turns a control into decoration. Mutation-tested: two did.
    const raises = verify.match(/RAISE EXCEPTION/g) ?? [];
    expect(raises.length, 'a check in the verify block was disarmed').toBe(10);
    expect((verify.match(/CONTROL:/g) ?? []).length).toBe(5);
  });

  it('asserts every control survives', () => {
    // "bei Berlin" — separate Brandenburg municipalities.
    expect(verify).toMatch(/schoeneiche-bei-berlin/);
    expect(verify).toMatch(/tmp-7666bf47-5d87-43d8-aa87-882a4a6121cb/); // Bernau bei Berlin
    // Berlin, New Hampshire — a different country.
    expect(verify).toMatch(/'berlin-1'/);
    // Duisburg-Ruhrort — parent is a shell.
    expect(verify).toMatch(/tmp-e5c53109-0f8b-42be-a132-6443ea4d469f/);
    // Berlin's six queer districts stay in queer_villages.
    expect(verify).toMatch(/queer_villages[\s\S]{0,200}<> 6/);
    // The own-town comma rows outside Berlin.
    for (const [, slug] of OWN_TOWNS) expect(verify).toContain(slug);
    expect(verify).toMatch(/<> 4/);
  });
});

describe('the health-script baseline moved with a measured number', () => {
  const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('is 23, the value the full-stack dry run reported', () => {
    expect(health).toMatch(/const BASELINE_UNCORROBORATED = 23\b/);
  });

  it('still FAILS on growth rather than merely printing', () => {
    const block = health.slice(health.indexOf('const BASELINE_UNCORROBORATED'));
    expect(block.slice(0, 600)).toMatch(/unc > BASELINE_UNCORROBORATED/);
    expect(block.slice(0, 600)).toMatch(/FAILED = true/);
  });
});
