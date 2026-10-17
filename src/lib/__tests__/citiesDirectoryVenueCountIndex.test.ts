import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792214562 — cities_directory() must stay inside anon's 3s ceiling.
 *
 * EVERY ASSERTION HERE RUNS OVER COMMENT-STRIPPED SQL, and that is load-bearing rather
 * than tidy: the migration's header quotes every phrase this file asserts on, including
 * the forms it exists to REFUSE (`in (select`, the old per-row `exists`). An unstripped
 * `toContain` would therefore pass with the executable statement deleted — the vacuous
 * assertion this repo has recorded repeatedly.
 */

const MIGRATION = '99991792214562_cities_directory_venue_count_index.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Comments at LINE START only — the house stripper. Enough here because every comment in
// this migration is a full line.
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

describe('cities_directory venue-count index', () => {
  it('creates the partial index whose predicate IS review_status', () => {
    // The predicate must be in the index, or the count needs a heap check on all 111k
    // rows and the planner correctly falls back to the seq scan this migration removes.
    expect(sql).toMatch(
      /create index if not exists idx_venues_city_id_approved\s+on public\.venues \(city_id\)\s+where review_status = 'approved'/,
    );
  });

  it('takes the lock with a timeout AND a retry, not one or the other', () => {
    // venues is a hot ingest table. No timeout queues every new writer behind a pending
    // SHARE lock; a timeout with no retry turns one busy moment into a repo-wide
    // `db push` abort. Both halves or neither.
    expect(sql).toContain("set local lock_timeout = '2s'");
    expect(sql).toContain('exception when lock_not_available then');
    expect(sql).toContain('perform pg_sleep(2)');
    // `set local` works here only because it is inside a DO block — at file level
    // db push discards it with a WARNING.
    const idxBlock = sql.slice(sql.indexOf('do $idx$'), sql.indexOf('$idx$;'));
    expect(idxBlock).toContain('set local lock_timeout');
  });
});

describe('cities_directory function body', () => {
  const fn = sql.slice(
    sql.indexOf('create or replace function public.cities_directory'),
    sql.indexOf('do $verify$'),
  );

  it('keeps the hr CTE materialized', () => {
    // A non-recursive CTE referenced once is inlined by PG12+, which pushes the subquery
    // back inside the row builder and silently rebuilds the 47k-buffer per-row scan that
    // 99991789855163 removed — with every other test still passing.
    expect(fn).toContain('hr as materialized (');
  });

  it('resolves high_risk as a LEFT JOIN that cannot yield NULL', () => {
    expect(fn).toContain('left join hr on hr.country_id = coalesce(');
    expect(fn).toContain('(hr.country_id is not null) as high_risk');
  });

  it('does NOT reintroduce the per-row EXISTS or an IN that can yield NULL', () => {
    // `in (select ...)` yields NULL — not false — when the left side is null and nothing
    // matches; jsonb_strip_nulls then DROPS the key and the client reads `undefined` for
    // a safety flag. Scoped to the function body: the header discusses both forms, and
    // the verify block legitimately runs the EXISTS form to compare against.
    expect(fn).not.toMatch(/exists\s*\(\s*select 1 from hr/);
    expect(fn).not.toMatch(/in \(select .*from hr/);
  });

  it('keeps the geo_places country fallback verbatim', () => {
    expect(fn).toContain("where gp.id = c.id and gp.place_type = 'city'");
  });

  it('keeps every filter that bounds the directory', () => {
    for (const clause of [
      'c.duplicate_of_id is null',
      'c.slug not like',
      'c.latitude is not null',
      'c.seo_indexable is true',
      "c.shell_status not in ('ghost', 'merged')",
    ]) {
      expect(fn).toContain(clause);
    }
  });
});

describe('postconditions', () => {
  const verify = sql.slice(sql.indexOf('do $verify$'), sql.indexOf('$verify$;'));

  it('every one of P1..P6 RAISES rather than merely being present', () => {
    // Asserting the condition is not enough when the raise can be replaced with `null;`
    // — a recorded survivor class. Count the raises, and require each label.
    expect((verify.match(/raise exception/g) ?? []).length).toBe(8);
    for (const label of [
      'P1 failed',
      'P2 failed',
      'P3 failed',
      'P4 failed',
      'P5 failed',
      'P6 failed',
    ]) {
      expect(verify).toContain(label);
    }
  });

  it('P1 refuses an INVALID index, not merely a missing one', () => {
    expect(verify).toContain('indisvalid');
    expect(verify).toContain('exists but is INVALID');
  });

  it('P4 checks the high_risk KEY is present, which is what catches the NULL rewrite', () => {
    expect(verify).toMatch(/not \(e\.value \? 'high_risk'\)/);
  });

  it('P5 derives the expected count live and never pins a number', () => {
    // The corpus grew 6.4x in 26 days; an exact count would fail on correct code the
    // next time ingest adds a city.
    expect(verify).toContain('select count(*) into v_expected');
    expect(verify).not.toMatch(/v_rows\s*<>\s*\d/);
    expect(verify).not.toMatch(/\b16206\b/);
    // And it refuses an empty payload, against which every other check is vacuous.
    expect(verify).toContain('directory is empty');
  });

  it('P6 compares against the EXISTS form in ONE statement', () => {
    // Both forms must see one snapshot, and the comparison must run the OLD expression —
    // not re-read the new column and agree with itself.
    expect(verify).toMatch(/where \(e\.value->>'high_risk'\)::boolean <> exists \(/);
    expect(verify).toContain('hr as materialized (');
  });

  it('no postcondition is short-circuited', () => {
    expect(verify).not.toMatch(/where false/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    // A pre-seeded counter would make a `<> 0` check pass with nothing counted.
    expect(verify).not.toMatch(/v_(disagree|missing_hr)\s+int\s*:=/);
  });
});

describe('the growth watcher is wired', () => {
  it('sits BEFORE the terminal exit, or it prints and still exits 0', () => {
    // Appending a section after `if (FAILED) process.exit(1)` is a recorded trap: the
    // section runs, prints its ✗, and the script still succeeds. lastIndexOf, because an
    // earlier env-guard `process.exit(0)` sits at the top of the file.
    const section = health.indexOf('rpc/cities_directory');
    const terminalExit = health.lastIndexOf('process.exit(1)');
    expect(section).toBeGreaterThan(0);
    expect(terminalExit).toBeGreaterThan(section);
  });

  it('gates on the payload and only WARNS on latency', () => {
    const section = health.slice(
      health.indexOf('rpc/cities_directory'),
      health.lastIndexOf('process.exit(1)'),
    );
    // Asserts the SHAPE of the gate, not its tuning. The threshold is legitimately
    // re-sized when the payload shape changes — it moved 12 MB -> 6 MB when the RPC
    // went columnar in 99991792214568, and pinning the literal made this test fail on
    // a correct re-size. What must not change is which quantity is allowed to FAIL:
    // bytes do, and latency measured as service_role from a runner — carrying that
    // network, with no statement_timeout behind it — only ever warns.
    expect(section).toMatch(/bytes > [\d.]+ \* 1024 \* 1024/);
    expect(section).toMatch(/console\.error\([\s\S]{0,400}payload is/);
    expect(section).toMatch(/elapsed > \d+[\s\S]{0,300}console\.warn/);
    // Latency must never reach a hard fail.
    expect(section).not.toMatch(/elapsed > \d+[\s\S]{0,300}FAILED = true/);
  });

  it('reports rows and bytes BEFORE any verdict, and fails closed', () => {
    const section = health.slice(
      health.indexOf('rpc/cities_directory'),
      health.lastIndexOf('process.exit(1)'),
    );
    const report = section.indexOf('· cities_directory:');
    const firstVerdict = section.indexOf('FAILED = true', report);
    expect(report).toBeGreaterThan(0);
    expect(firstVerdict).toBeGreaterThan(report);
    // An empty directory must fail, not read as clean.
    expect(section).toContain('returned no rows');
    // A transport throw is "could not look", never "nothing found".
    expect(section).toMatch(/catch[\s\S]{0,200}could not be reached[\s\S]{0,120}FAILED = true/);
  });
});
