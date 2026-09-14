import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Concord pair is REJECTED, not merged, and the keep row is repaired to
 * Concord, New Hampshire.
 *
 * The stakes are asymmetric and that is what this file protects. `approve` on a
 * dedup queue row runs the merge cores — so flipping the resolution from
 * `rejected` to `approved` would silently merge two rows that are NOT the same
 * place, destroying a real city record. Everything else here is recoverable;
 * that one is not.
 *
 * Comments are stripped first. The migration's header names Q28249, the word
 * "merge", "approved" and every NC artefact in prose, so a bare `toContain`
 * over unstripped source is satisfiable by the header while the statement is
 * gone — the vacuous-assertion trap this repo has recorded repeatedly.
 */

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '51700101100000_concord_pair_not_duplicates.sql',
);

function statements(): string {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const KEEP = '15236843-07f0-4e98-af6d-87c6820dc01e';
const DROP = '31ca20ad-3a55-4221-878f-3df3f4b41f69';

/** The keep-row UPDATE alone. Both updates target `cities` and name several of
 *  the same columns, so an unscoped assertion is satisfied by the wrong one. */
function keepUpdate(): string {
  const sql = statements();
  const a = sql.indexOf('update public.cities c');
  return sql.slice(a, sql.indexOf('get diagnostics v_repaired'));
}

/** The drop-row UPDATE alone. */
function dropUpdate(): string {
  const sql = statements();
  const a = sql.indexOf('update public.cities c', sql.indexOf('get diagnostics v_repaired'));
  return sql.slice(a, sql.indexOf('get diagnostics v_retracted'));
}

describe('the Concord pair is distinct, not duplicate', () => {
  it('resolves the queue row as rejected and never as approved', () => {
    const sql = statements();
    const upd = sql.slice(sql.indexOf('update public.dedup_review_queue'));
    const body = upd.slice(0, upd.indexOf('get diagnostics'));
    expect(body).toMatch(/set\s+status\s*=\s*'rejected'/);
    // `approve` runs the merge cores: these two rows are different places.
    expect(body).not.toMatch(/'approved'/);
  });

  it('never merges the two rows', () => {
    const sql = statements();
    expect(sql).not.toMatch(/merge_cities/);
    expect(sql).not.toMatch(/duplicate_of_id\s*=/);
  });

  it('repairs the keep row to Concord, New Hampshire', () => {
    const upd = keepUpdate();
    expect(upd).toMatch(/wikidata_qid\s*=\s*'Q28249'/);
    expect(upd).toMatch(/wikipedia_title\s*=\s*'Concord, New Hampshire'/);
    expect(upd).toMatch(/region_name\s*=\s*'New Hampshire'/);
    expect(upd).toMatch(/name\s*=\s*'Concord'/);
  });

  it('guards both writes on the defect still being present', () => {
    const sql = statements();
    // a human who repairs a row first must keep their work
    const guards = sql.match(/description ilike '%Cabarrus County, North Carolina%'/g) ?? [];
    expect(guards.length).toBe(2);
    // and the keep row is only claimed while it still has no gazetteer id
    expect(sql).toMatch(new RegExp(`c\\.id = v_keep[\\s\\S]{0,80}c\\.wikidata_qid is null`));
  });

  it('clears every other Concord artefact rather than only the description', () => {
    const keep = keepUpdate();
    // scoped to the KEEP update: these are the other Concord's facts sitting on
    // the row this migration claims for New Hampshire.
    for (const col of [
      'image_url',
      'official_website',
      'area_km2',
      'elevation_m',
      'founded_year',
    ]) {
      expect(keep, `${col} must be cleared on the keep row`).toMatch(
        new RegExp(`${col}\\s*=\\s*null`),
      );
    }
    // the NOT NULL column takes its default, never null
    expect(dropUpdate()).toMatch(/description_i18n\s*=\s*'\{\}'::jsonb/);
    expect(dropUpdate()).not.toMatch(/description_i18n\s*=\s*null/);
  });

  it('leaves the drop row country, timezone and safety notes alone', () => {
    const body = dropUpdate();
    // derived from the country, not from the NC article: out of scope here
    expect(body).not.toMatch(/country_id\s*=/);
    expect(body).not.toMatch(/timezone\s*=/);
    expect(body).not.toMatch(/safety_notes\s*=/);
  });

  it('asserts neither row ended up merged', () => {
    expect(statements()).toMatch(
      /duplicate_of_id is not null[\s\S]{0,200}raise exception[\s\S]{0,120}must never be merged/,
    );
  });

  it('re-asserts that no open pair names two different places', () => {
    const sql = statements();
    expect(sql).toMatch(/dedup_despace\(ka\.name\)\s*<>\s*public\.dedup_despace\(da\.name\)/);
    expect(sql).toMatch(/open city pairs still name two different places/);
  });

  it('names both rows explicitly', () => {
    const sql = statements();
    expect(sql).toContain(KEEP);
    expect(sql).toContain(DROP);
  });
});
