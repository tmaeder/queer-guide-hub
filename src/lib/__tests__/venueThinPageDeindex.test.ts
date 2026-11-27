import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991795345416_venue_thin_page_deindex.sql (SEO Phase 2).
 *
 * The job deindexes live venues with no substance and restores ONLY the rows
 * it deindexed itself (seo_deindex_reason = 'thin'). The dangerous regressions
 * are a restore arm that republishes a row deindexed for another reason
 * (closed, archived, hand-deindexed), and a batch cap lifted past the
 * search-trigger budget. Assertions run over comment-stripped SQL because the
 * header quotes the very clauses being asserted.
 */

const MIGRATION = '99991795345416_venue_thin_page_deindex.sql';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ');

const fnBody = (() => {
  const start = sql.indexOf('function public.run_venue_thin_page_recompute(');
  const end = sql.indexOf('end; $$', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
})();

const [deindexArm, restoreArm] = (() => {
  const i = fnBody.indexOf('get diagnostics v_off');
  return [fnBody.slice(0, i), fnBody.slice(i)];
})();

describe('venue thin-page deindex migration', () => {
  it('adds the reason column', () => {
    expect(sql).toMatch(
      /alter table public\.venues add column if not exists seo_deindex_reason text/,
    );
  });

  it('caps the batch at 300', () => {
    expect(fnBody).toContain('least(greatest(coalesce(p_batch, 300), 1), 300)');
    expect(deindexArm).toContain('limit v_batch');
    expect(restoreArm).toContain('limit v_batch');
  });

  it('deindex arm only takes live, indexable, substance-less rows and stamps the reason', () => {
    for (const clause of [
      'v.seo_indexable is true',
      'v.duplicate_of_id is null',
      'v.closed_at is null',
      "coalesce(v.review_status, '') <> 'archived'",
      'not public.venue_has_substance(',
      "set seo_indexable = false, seo_deindex_reason = 'thin'",
    ]) {
      expect(deindexArm).toContain(clause);
    }
  });

  it('restore arm only reverses its own deindex, on live rows that now pass', () => {
    for (const clause of [
      "v.seo_deindex_reason = 'thin'",
      'v.seo_indexable is false',
      'v.duplicate_of_id is null',
      'v.closed_at is null',
      "coalesce(v.review_status, '') <> 'archived'",
      'set seo_indexable = true, seo_deindex_reason = null',
    ]) {
      expect(restoreArm).toContain(clause);
    }
    expect(restoreArm).not.toContain('not public.venue_has_substance(');
    expect(restoreArm).toContain('public.venue_has_substance(');
  });

  it('defines substance as the measured predicate', () => {
    const pred = sql.slice(
      sql.indexOf('function public.venue_has_substance('),
      sql.indexOf('function public.run_venue_thin_page_recompute('),
    );
    expect(pred).toContain('length(btrim(p_description)), 0) >= 150');
    expect(pred).toContain("coalesce(p_category, 'other') <> 'other'");
    expect(pred).toContain("nullif(btrim(p_address), '') is not null");
    for (const field of [
      'p_phone',
      'p_website',
      'p_images',
      'p_hours',
      'coalesce(p_foursquare, p_tripadvisor, p_tomtom)',
    ]) {
      expect(pred).toContain(field);
    }
  });

  it('registers the automation and the cron together', () => {
    expect(sql).toContain("'venue_thin_page_recompute'");
    expect(sql).toContain('"fn":"run_venue_thin_page_recompute"');
    expect(sql).toMatch(
      /cron\.schedule\('venue_thin_page_recompute', '\*\/10 \* \* \* \*', \$cron\$ select public\.run_venue_thin_page_recompute\(300\); \$cron\$\)/,
    );
  });

  it('is not callable by anon or authenticated', () => {
    expect(sql).toContain(
      'revoke all on function public.run_venue_thin_page_recompute(int) from public, anon, authenticated',
    );
  });

  it('postconditions raise on a bad end state', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(
      /where seo_deindex_reason = 'thin' and seo_indexable is true; if v_bad <> 0 then raise exception/,
    );
    expect(verify).toMatch(/if v_bad <> 1 then raise exception 'P4 failed: admin_automations/);
    expect(verify).toMatch(/if v_bad <> 1 then raise exception 'P4 failed: cron/);
    expect(verify).not.toMatch(/where false|if \(?false\)? then/);
  });
});
