import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991790384358_marketplace_brand_slug_redirects_backfill.sql` and the two
 * `functions/_lib/detail.ts` changes that make its rows reachable.
 *
 * EVERY assertion runs over COMMENT-STRIPPED source. Both files' headers quote the
 * defect, the old stale claim and the slugs verbatim, so a `toContain` over raw
 * text passes with the executable line deleted — the vacuous-assertion class this
 * repo has recorded repeatedly. `stripSql` / `stripTs` are what make these real.
 */

const MIGRATION = '99991790384358_marketplace_brand_slug_redirects_backfill.sql';
const migrationSrc = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const detailSrc = readFileSync(join(process.cwd(), 'functions/_lib/detail.ts'), 'utf8');

/** Drop whole-line `--` comments. Line-anchored: a `--` mid-line is an operator. */
const stripSql = (src: string) =>
  src
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const stripTs = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//'))
    .join('\n');

const sql = stripSql(migrationSrc);
const detail = stripTs(detailSrc);

/** Slice from a marker to the first `;` after it, asserting the slice is real. */
function statementFrom(src: string, marker: string): string {
  const start = src.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThan(-1);
  const end = src.indexOf(';', start);
  expect(end, `unterminated statement at: ${marker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('brand slug redirect backfill', () => {
  const proposed = statementFrom(sql, 'insert into _brand_redirect_proposed');

  it('carries all 21 verified tuples as a VALUES literal', () => {
    // A literal rather than a query over `content_revisions` read at apply time:
    // what lands must be what was verified on prod, not whatever the corpus looks
    // like when CI applies it.
    expect(proposed).toContain('values');
    expect((proposed.match(/'consolidated_duplicate'/g) ?? []).length).toBe(17);
    expect((proposed.match(/'renamed'/g) ?? []).length).toBe(4);

    // The two the e2e spec was red about, and one from each end of the list so a
    // truncated slice cannot pass.
    expect(proposed).toContain("'svakom-europe-bv'");
    expect(proposed).toContain("'1979-sas-teil-der-marc-dorcel-group'");
    expect(proposed).toContain("'strap-on-me-7b42'");
  });

  it('pins each target by brand_id, never by slug', () => {
    // The resolver reads the target's LIVE slug through `brand_id`, so pinning the
    // slug would break the redirect in exactly the case it exists to survive. The
    // verified slug is carried for the reader and reported, never enforced.
    expect(proposed).toMatch(
      /'svakom-europe-bv',\s*\('676aaead-'\s*\|\|\s*'5222-4959-984e-ae0a95c8ac00'\)::uuid/,
    );
    const drift = statementFrom(sql, "raise notice 'redirect target slug moved");
    expect(drift).toContain('still correct, resolves by id');
  });

  it('is soft on preconditions: an ineligible target is skipped, not fatal', () => {
    const eligible = sql.slice(
      sql.indexOf('with eligible as'),
      sql.indexOf('select count(*) into v_skipped'),
    );
    expect(eligible).toContain('b.slug is not null');
    expect(eligible).toContain('b.slug <> p.old_slug');
    expect(eligible).toContain('not exists');
    expect(eligible).toContain('where x.slug = p.old_slug');
    // An exact-match premise here would turn a concurrent brand edit into a
    // `db push` failure on main, taking every queued migration with it.
    expect(eligible).not.toMatch(/raise exception/);
  });
});

describe('the rename trigger seals the producer', () => {
  const fn = statementFrom(
    sql,
    'create or replace function public.marketplace_brands_slug_redirect',
  );

  it('fires AFTER UPDATE OF slug only when both slugs are real and differ', () => {
    const trg = statementFrom(sql, 'create trigger trg_marketplace_brands_slug_redirect');
    expect(trg).toContain('after update of slug on public.marketplace_brands');
    expect(trg).toContain('old.slug is not null');
    expect(trg).toContain('new.slug is not null');
    expect(trg).toContain('new.slug is distinct from old.slug');
  });

  it('records the OLD slug against the row that moved', () => {
    expect(fn).toContain('insert into public.marketplace_brand_slug_redirects');
    expect(fn).toContain("values (old.slug, new.id, 'renamed')");
    // A slug freed and later re-used repoints to the more recent occupant.
    expect(fn).toContain('on conflict (old_slug) do update');
  });

  it('keeps the privileged trigger function private with a pinned search path', () => {
    expect(fn).toContain("security definer set search_path = 'public', 'pg_temp'");
    expect(sql).toContain(
      'revoke all on function public.marketplace_brands_slug_redirect() from public, anon, authenticated',
    );
  });

  it('does NOT invent a target for a consolidation', () => {
    // A slug going to NULL is a consolidation, and which surviving brand it
    // belongs to is not derivable from the row being changed — guessing it is the
    // "never resolve by name alone" rule this repo states for cities and events.
    // The `new.slug is not null` guard in the WHEN clause is what enforces it.
    const trg = statementFrom(sql, 'create trigger trg_marketplace_brands_slug_redirect');
    expect(trg).toContain('new.slug is not null');
    expect(fn).not.toMatch(/display_name/);
    expect(fn).not.toMatch(/brand_key/);
  });
});

describe('postconditions', () => {
  const verify = sql.slice(sql.indexOf('do $verify$'));

  it('asserts the invariant the resolver depends on, corpus-wide', () => {
    // A redirect whose target is missing, has a NULL slug, or equals the old slug
    // yields no 301 — indistinguishable from the soft 404 this migration removes.
    const p1 = verify.slice(verify.indexOf('select count(*) into v_bad'));
    expect(p1).toContain('left join marketplace_brands b on b.id = r.brand_id');
    expect(p1).toContain('b.id is null');
    expect(p1).toContain('b.slug is null');
    expect(p1).toContain('b.slug = r.old_slug');
  });

  it('asserts the two spec-failing slugs reach their published survivor', () => {
    const p2 = verify.slice(verify.indexOf("('svakom-europe-bv', 'svakom')"));
    expect(p2).toContain("('1979-sas-teil-der-marc-dorcel-group', 'dorcel')");
    expect(p2).toContain("b.publication_status = 'published'");
    // Asserted as the reached state (`not exists`), not as a row count: counting
    // rows in a bad state returns zero for a slug that has gone missing entirely.
    expect(p2).toContain('where not exists');
  });

  it('makes both refusals enforceable', () => {
    const p3 = verify.slice(verify.indexOf('into v_refused'));
    expect(p3).toContain("'mr-s-leather-77da'");
    expect(p3).toContain("'12807-203758186'");
    expect(p3).toContain("'9781728209982'");
    expect(p3).toContain('refused slug(s) were given a redirect anyway');
  });

  it('asserts the trigger exists and the count is a floor, not an equality', () => {
    expect(verify).toContain("t.tgname = 'trg_marketplace_brands_slug_redirect'");
    expect(verify).toContain('not t.tgisinternal');
    expect(verify).toContain('the rename trigger is missing');
    // A floor, because the backfill is soft on preconditions. An equality here
    // would abort `db push` on a brand someone legitimately edited.
    expect(verify).toMatch(/if v_total < 18 then/);
  });

  it('gates on a hard condition, not on the text it prints', () => {
    // Neutering `if v_bad <> 0` to `if false` leaves every string-anchored
    // assertion above green while the check has stopped checking.
    expect((verify.match(/if v_bad <> 0 then/g) ?? []).length).toBe(2);
    expect((verify.match(/if v_refused <> 0 then/g) ?? []).length).toBe(1);
    expect(verify).not.toMatch(/\bif\s+false\b/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
  });
});

describe('detail.ts makes the rows reachable', () => {
  it('registers marketplace/brands in SLUG_REDIRECT_KINDS', () => {
    const entry = detail.slice(
      detail.indexOf("test: (k) => k === 'marketplace/brands'"),
      detail.indexOf('];', detail.indexOf("test: (k) => k === 'marketplace/brands'")),
    );
    expect(entry).toContain("redirectTable: 'marketplace_brand_slug_redirects'");
    expect(entry).toContain("redirectIdColumn: 'brand_id'");
    expect(entry).toContain("entityTable: 'marketplace_brands'");
    expect(entry).toContain("routePrefix: '/marketplace/brands'");
    // No entityFilter: a brand page renders whatever its publication_status, so
    // filtering to `published` would refuse a legitimate redirect to a draft
    // maker. The `!newSlug` guard in resolveSlugRedirect is the protection.
    expect(entry).not.toContain('entityFilter');
  });

  it('brandDetail falls through ONLY when a different canonical slug came back', () => {
    const fn = detail.slice(
      detail.indexOf('async function brandDetail'),
      detail.indexOf('const story = stringField(row'),
    );
    expect(fn).toContain("const canonicalSlug = row ? stringField(row, 'slug') : undefined;");
    expect(fn).toMatch(/if \(row && canonicalSlug && canonicalSlug !== slug\) return null;/);
    // The deliberate human dead end must survive: a slug with no brand and no
    // redirect still gets the non-null noindex result, not a hard 404.
    expect(fn).toContain('if (!row || !name) return missingBrandResult();');
    // And the RPC must still select the column the comparison reads.
    expect(fn).toContain("'slug,display_name,story,website,logo_url,product_count,is_approved'");
  });

  it('does not claim the redirect table is absent', () => {
    // Asserted as the PRESENCE of the correction rather than the absence of the
    // old claim: the corrected comment quotes that claim verbatim, so an absence
    // check would fail against correct code.
    expect(detailSrc).toContain('That table was created by `99991790101222`');
    expect(detailSrc).toContain('99991790384358');
  });
});
