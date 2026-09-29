import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991790622700_commit_venue_unaccented_city_arm';
const SQL = readFileSync(join(process.cwd(), `supabase/migrations/${MIGRATION}.sql`), 'utf8');

// The header quotes the defect, the anchor and the tmp- rule verbatim, so every
// assertion below runs against comment-stripped source. Without this a test can
// pass against prose while the statement it describes has been deleted -- the
// failure mode this repo has recorded repeatedly.
const CODE = SQL.split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

// The patch block builds the new arm as a string; the verify block asserts the
// result. They are different halves and a mutation can gut either, so they are
// sliced apart rather than asserted over the whole file.
const PATCH = CODE.slice(CODE.indexOf('do $patch$'), CODE.indexOf('do $verify$'));
const VERIFY = CODE.slice(CODE.indexOf('do $verify$'));

describe('commit_venue_staging_item gains the unaccented city arm', () => {
  it('matches on canonical_key scoped to the country', () => {
    expect(PATCH).toContain('c.canonical_key = public.city_canonical_key');
    expect(PATCH).toContain('WHERE c.country_id = v_country_id');
  });

  it('carries the tmp- exclusion, which is what makes the arm safe', () => {
    // An arm without this attaches real venues to uncorroborated shells -- the
    // one shape that is worse than not linking at all.
    expect(PATCH).toContain("c.slug NOT LIKE ''tmp-%''");
  });

  it('does not order by population: the key is unique by construction', () => {
    // cities_country_canonical_key_uniq makes the match single. A tiebreak here
    // would read as if ambiguity were possible and invite widening the arm.
    const arm = PATCH.slice(PATCH.indexOf('v_arm :='), PATCH.indexOf('v_new :='));
    // Anchored on a real clause, not the bare words: the arm's own explanatory
    // comment sits INSIDE an E'...' literal prefixed by `||`, so a line-based
    // comment stripper cannot see it and `not.toContain('ORDER BY')` fails
    // against correct code.
    expect(arm).not.toMatch(/ORDER BY c\./);
    expect(arm).toContain('LIMIT 1');
  });

  it('is soft on the already-patched precondition and hard on a moved anchor', () => {
    // A concurrent session adding the arm first must not abort db push for the
    // whole repo; a moved body must abort rather than silently patch nothing.
    expect(PATCH).toMatch(/if position\('canonical_key' in v_code\) > 0 then[\s\S]{0,200}?return;/);
    expect(PATCH).toMatch(/if v_hits <> 1 then[\s\S]{0,160}?raise exception/);
  });

  it('strips function comments before every source-code assertion', () => {
    const strippedReads = CODE.match(/regexp_replace\(\s*pg_get_functiondef/g) ?? [];
    expect(strippedReads.length).toBe(2);
    expect(PATCH).toContain("from regexp_matches(v_code, E'\\n    IF v_city_id IS NULL THEN\\n', 'g')");
    expect(VERIFY).toMatch(/v_src := regexp_replace\(\s*pg_get_functiondef/);
  });

  it('refuses a substitution that changed nothing', () => {
    expect(PATCH).toMatch(/if v_new = v_src then[\s\S]{0,160}?raise exception/);
  });

  it('asserts the two pre-existing arms survive the replace', () => {
    // P1/P2 are satisfied by a replace that ate an existing arm; this mirror is
    // what gives them meaning.
    expect(VERIFY).toContain('ORDER BY c\\.population DESC NULLS LAST');
    expect(VERIFY).toMatch(/<> 2[\s\S]{0,120}?P3 failed/);
  });

  it('asserts arm ORDER, anchored on code positions rather than comment text', () => {
    expect(VERIFY).toContain("position('AND c.country_id = v_country_id' in v_src)");
    expect(VERIFY).toContain("position('c.canonical_key = public.city_canonical_key' in v_src)");
    expect(VERIFY).toMatch(/v_i_canon > v_i_exact and v_i_fallback > v_i_canon/);
  });

  it('keeps every postcondition a real comparison', () => {
    // Neutering `<> n` to `< 0` leaves each RAISE string intact, so assertions
    // anchored on the message survive a check that has stopped checking.
    expect(VERIFY).not.toMatch(/if\s+false/i);
    const raises = VERIFY.match(/raise exception 'P\d failed/g) ?? [];
    expect(raises.length).toBe(5);
  });
});
