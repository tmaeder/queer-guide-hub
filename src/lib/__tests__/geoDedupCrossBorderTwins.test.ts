import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cross-border same-name twins: one town stored twice under two countries.
 *
 * `51600101100000` merges three such pairs (Lyss CH<-IT, Les Trois-Ilets MQ<-FR,
 * Martigny CH<-FR) and deliberately leaves a fourth open. What this file protects
 * is the DIRECTION and the EXCLUSION, because both are easy to lose in an edit
 * that still reads correctly:
 *
 *   - the survivor must be the row carrying the Wikidata id, not the shell;
 *   - the Concord pair must stay untouched, because neither of its rows has an
 *     established identity and merging it would be the bare-name namesake guess
 *     the whole engine exists to refuse.
 *
 * Comments are stripped first. This migration's header quotes every QID, the
 * Concord queue id and the word "approved" in prose, so a bare `toContain` over
 * unstripped source is satisfiable by the header while the statement is gone —
 * the vacuous-assertion trap this repo has now recorded five times.
 *
 * WHAT THIS CANNOT COVER: it reads SQL text. That the merges actually reached the
 * database is asserted by the migration's own postconditions, and the standing
 * "no open pair names two different places" invariant is watched at runtime by
 * `geo_dedup_signals()` via `check-pipeline-health.mjs`.
 */

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '51600101100000_geo_dedup_cross_border_twins.sql',
);

/** Strip `--` line comments so an assertion cannot be satisfied by a header. */
function statements(): string {
  return readFileSync(FILE, 'utf8')
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const CONCORD_QUEUE_ID = '67bfd3fb-fa74-4047-a735-f6ff1b1839c5';
const CONCORD_CITY_IDS = [
  '15236843-07f0-4e98-af6d-87c6820dc01e', // "Concord " US
  '31ca20ad-3a55-4221-878f-3df3f4b41f69', // "Concord" CZ
];

const TWINS: Array<{ name: string; keep: string; drop: string; qid: string }> = [
  {
    name: 'Lyss',
    keep: 'b7f866a1-f223-48d6-ba42-74aff797e9a1',
    drop: 'f3facb28-1000-4460-8707-db04185d3352',
    qid: 'Q69512',
  },
  {
    name: 'Les Trois-Ilets',
    keep: 'c676e5db-71a2-4832-a1ee-d2101411d6ab',
    drop: '286cc3ba-e009-4869-b1b5-0f4b2ecb6b27',
    qid: 'Q1650786',
  },
  {
    name: 'Martigny',
    keep: '018821ce-829b-4df1-a962-ecf5aeafe812',
    drop: '2da6b67b-fb97-4753-81a0-7e8ea24638ce',
    qid: 'Q68956',
  },
];

describe('cross-border same-name twins', () => {
  it('merges each pair in the direction of the row holding the Wikidata id', () => {
    const sql = statements();
    for (const t of TWINS) {
      // keep, then drop, then the survivor's QID — in that order, inside one
      // VALUES row. Asserting the ids separately would pass with them swapped.
      const row = new RegExp(`'${t.keep}'::uuid,\\s*'${t.drop}'::uuid,\\s*'${t.qid}'`);
      expect(row.test(sql), `${t.name}: keep/drop/qid row missing or reversed`).toBe(true);
    }
  });

  it('re-verifies identity at apply time instead of trusting the frozen ids', () => {
    const sql = statements();
    expect(sql).toMatch(/k\.wikidata_qid\s*=\s*p\.keep_qid/);
    expect(sql).toMatch(/d\.wikidata_qid\s+is\s+null/);
    expect(sql).toMatch(/dedup_despace\(k\.name\)\s*=\s*public\.dedup_despace\(d\.name\)/);
    expect(sql).toMatch(/haversine_m\([^)]*\)\s*,\s*1e9\)\s*<\s*p\.max_m/);
  });

  it('calls merge_cities keep-first', () => {
    expect(statements()).toMatch(
      /merge_cities\(\s*rec\.keep_id\s*,\s*rec\.drop_id\s*,\s*false\s*\)/,
    );
  });

  it('resolves the answered queue rows as approved, never rejected', () => {
    const sql = statements();
    const update = sql.slice(sql.indexOf('update public.dedup_review_queue'));
    expect(update).toMatch(/set\s+status\s*=\s*'approved'/);
    // a merged pair recorded as rejected would be both a false record and
    // permanent sweep memory against a true duplicate.
    expect(update.slice(0, update.indexOf('get diagnostics'))).not.toMatch(/'rejected'/);
  });

  it('excludes the Concord pair from the queue resolution', () => {
    const sql = statements();
    const update = sql.slice(sql.indexOf('update public.dedup_review_queue'));
    expect(update).toMatch(new RegExp(`q\\.id\\s*<>\\s*'${CONCORD_QUEUE_ID}'`));
  });

  it('never names either Concord city row as a merge target', () => {
    const sql = statements();
    for (const id of CONCORD_CITY_IDS) {
      expect(sql.includes(id), `Concord city row ${id} must not appear in a statement`).toBe(false);
    }
  });

  it('asserts it did not change the Concord row itself', () => {
    const sql = statements();
    // captured before any write and compared after — not "is still open", which
    // would abort db push repo-wide if a human legitimately decided it first.
    expect(sql).toMatch(/select\s+status\s+into\s+v_concord_before/);
    expect(sql).toMatch(/select\s+status\s+into\s+v_concord_after/);
    expect(sql).toMatch(
      /v_concord_after\s+is\s+distinct\s+from\s+v_concord_before[\s\S]{0,120}raise\s+exception/,
    );
  });

  it('re-asserts that no open pair names two different places', () => {
    const sql = statements();
    expect(sql).toMatch(/dedup_despace\(ka\.name\)\s*<>\s*public\.dedup_despace\(da\.name\)/);
    expect(sql).toMatch(/open city pairs still name two different places/);
  });

  it('asserts the merged state was actually reached', () => {
    expect(statements()).toMatch(
      /duplicate_of_id\s+is\s+distinct\s+from\s+want\.keep_id[\s\S]{0,200}raise\s+exception/,
    );
  });
});
