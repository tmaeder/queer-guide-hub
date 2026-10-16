import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 99991792186013 takes venue_city_text_signals().same_name_cities_without_region
 * from 9 to 0 with two different remedies: code six cities from the venues' own
 * `state` text, and merge three PR placeholder twins into the real row.
 *
 * Comments are STRIPPED before every assertion -- the header quotes the rejected
 * `VE-B` and the wrong `US-IL` verbatim in order to explain them, so a naive scan
 * of the raw file would match the explanation and fail on correct code.
 */

const MIGRATION = '99991792186013_same_name_city_region_codes.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const sql = stripComments(raw);

/** The six coded rows and the code each must receive. */
const CODED: Array<[string, string]> = [
  ['augusta', 'US-KY'],
  ['charleston-1', 'US-OR'],
  ['davenport-2', 'US-IA'],
  ['jamestown-1', 'US-RI'],
  ['milton-2', 'US-NH'],
  ['parroquia-catedral-1', 'VE-F'],
];

const MERGED = ['humacao', 'ponce', 'yabucoa'];

describe('same-name city region codes', () => {
  it('the comment stripper removes the header that quotes the rejected codes', () => {
    // Positive control: without this, every negative assertion below is vacuous.
    expect(raw).toMatch(/VE-B/);
    expect(stripComments(raw).includes('VE-B')).toBe(false);
  });

  it('codes each of the six, with the code the vocabulary holds', () => {
    for (const [slug, code] of CODED) {
      expect(sql).toMatch(new RegExp(`'${slug}',\\s*'${code}'`));
    }
  });

  it('never writes VE-B for Bolívar, which is Anzoátegui', () => {
    // The first draft's error. Bolívar is VE-F.
    expect(sql).not.toMatch(/'VE-B'/);
    expect(sql).toMatch(/'parroquia-catedral-1',\s*'VE-F'/);
  });

  it('files Davenport as Iowa, not the Illinois the polygon answered', () => {
    expect(sql).toMatch(/'davenport-2',\s*'US-IA'/);
    expect(sql).not.toMatch(/'davenport-2',\s*'US-IL'/);
  });

  it('joins the code out of geo_subdivisions rather than typing a name', () => {
    // region_name must come from the joined row, so code and name cannot disagree.
    expect(sql).toMatch(/join public\.geo_subdivisions s on s\.code = w\.code/);
    expect(sql).toMatch(/region_name\s*=\s*s\.name/);
  });

  it('only fills a region_code that is currently NULL', () => {
    expect(sql).toMatch(/and c\.region_code is null/);
  });

  it('does not try to code the three PR duplicates', () => {
    // Coding them raises 23505 on idx_cities_name_country_unique, because their
    // twins already hold (name, country, code). They are merged instead.
    const partA = sql.slice(sql.indexOf('do $code$'), sql.indexOf('do $merge$'));
    for (const slug of MERGED) {
      expect(partA).not.toContain(`'${slug}'`);
    }
  });

  it('merges the PR twins keeping the real row and dropping the placeholder', () => {
    const partB = sql.slice(sql.indexOf('do $merge$'), sql.indexOf('do $verify$'));
    // Direction is load-bearing: keep_id is the real row, drop_id the tmp- twin.
    expect(partB).toMatch(/real\.id\s+as\s+keep_id,\s*tmp\.id\s+as\s+drop_id/);
    expect(partB).toMatch(/tmp\.slug like 'tmp-%'/);
    expect(partB).toMatch(/merge_cities\(r\.keep_id,\s*r\.drop_id,\s*false\)/);
    for (const slug of MERGED) {
      expect(partB).toContain(`'${slug}'`);
    }
  });

  it('asserts the merge direction by checking survivors still hold venues', () => {
    // A merge the wrong way round also empties the group, so a count-only check
    // would pass while the venues had moved onto a placeholder.
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/if v_live <> 3 then/);
    expect(verify).toMatch(/from public\.venues v where v\.city_id = c\.id/);
  });

  it('asserts part A positively, not by counting bad rows', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/if v_bad <> 0 then/);
    expect(verify).toMatch(/if v_names <> 0 then/);
  });

  it('REPORTS the corpus-wide gate and never raises on it', () => {
    // Asserting a corpus-wide zero-invariant would abort `db push` for the whole
    // repo if the still-live producer mints a group before CI applies this.
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/same_name_cities_without_region/);
    const gateBlock = verify.slice(verify.indexOf('same_name_cities_without_region'));
    expect(gateBlock).toMatch(/raise notice/i);
    expect(gateBlock).not.toMatch(/raise exception/i);
  });

  it('has no loosened comparison or short-circuited predicate in the verify block', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).not.toMatch(/v_bad\s*(<|>)\s*0/i);
    expect(verify).not.toMatch(/v_live\s*(<|>)\s*3/i);
  });
});
