import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the event schedule model (20750101100000 / 20750101100100).
 *
 * These are text scans over the migration source, the same shape as
 * citySafetyBackfill.test.ts. They exist because the properties below are not
 * observable from the app yet — nothing writes `schedule` until part 3 — so a
 * regression here would be silent until the display layer lands on top of it.
 *
 * Comments are stripped before scanning. Both files explain the traps they avoid
 * IN PROSE, and a bare `toMatch` would happily pass on the explanation after the
 * code enforcing it was deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * The migration carrying the LATEST definition of `symbol`, found by content rather
 * than by filename.
 *
 * Pinning a filename is the trap: this file originally read
 * `_event_dates_rebuild_and_signals.sql`, and when a later migration replaced
 * `event_dates_rebuild_one` the test went on happily asserting the superseded body —
 * green while the live function did something else. Search for the definition, and a
 * CREATE OR REPLACE anywhere moves the guard with it.
 */
function latestDefining(symbol: string): string {
  const needle = new RegExp(
    `(create or replace|create)\\s+function\\s+public\\.${symbol}\\s*\\(`,
    'i',
  );
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => needle.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  if (!file) throw new Error(`no migration defines public.${symbol}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** The migration carrying the latest definition of a CHECK constraint or table. */
function latestMatching(needle: RegExp): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .find((f) => needle.test(readFileSync(join(MIGRATIONS, f), 'utf8')));
  if (!file) throw new Error(`no migration matching ${needle}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Strip `--` line comments so prose cannot satisfy a guard. */
function code(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MODEL = code(latestDefining('event_schedule_dates'));
const REBUILD = code(latestDefining('event_dates_rebuild_one'));
const SIGNALS = code(latestDefining('event_schedule_signals'));
const TABLE = code(latestMatching(/create table if not exists public\.event_dates/));

describe('the expander', () => {
  // to_char(d,'DY') is lc_time-dependent: on a server with a non-English locale it
  // matches no weekday at all and the whole corpus silently expands to nothing.
  it('derives the weekday from isodow, never from to_char', () => {
    expect(MODEL).toMatch(/extract\(isodow from/);
    expect(MODEL).not.toMatch(/to_char\s*\([^)]*'DY'/i);
  });

  it('treats a close at or before the open as the next morning', () => {
    expect(MODEL).toMatch(/v_close\s*<=\s*v_open/);
  });

  it('lets `until` narrow the caller-supplied horizon but never extend it', () => {
    expect(MODEL).toMatch(/least\(\s*p_to::date,\s*coalesce\(v_until/);
  });
});

describe('the derive job', () => {
  // The bug the dry run caught: events.end_date is the end of the whole span for
  // opening_hours/run, but the end of the FIRST OCCURRENCE for a recurrence. Reading
  // it uniformly gives a recurrence an empty window, so it never expands.
  it('does not cap a recurrence at events.end_date', () => {
    expect(REBUILD).toMatch(/schedule->>'kind'\s*=\s*'recurrence'/);
    // The span branch must still exist, or the fix swings the other way and an
    // exhibition expands past its own closing date.
    expect(REBUILD).toMatch(/least\(coalesce\(v_event\.end_date/);
  });

  // This assertion INVERTED at part 3b, deliberately. While `confirmed` meant
  // "corroborated by a feed or a human" it had to survive a rebuild. Once
  // corroboration became DERIVED — recomputed from the sibling rows on every pass —
  // a surviving confirmed row would fossilise the moment its sibling was cancelled.
  // Nothing in event_dates is hand-authored, so everything in it is rebuildable.
  it('clears every derived row for the event, both provenances', () => {
    expect(REBUILD).toMatch(/delete from public\.event_dates where event_id = p_event_id;/);
    expect(REBUILD).not.toMatch(
      /delete from public\.event_dates\s+where event_id = p_event_id and provenance = 'generated'/,
    );
  });

  it('derives corroboration from the sibling feed rows rather than storing it sticky', () => {
    expect(REBUILD).toMatch(/sib\.series_key = v_event\.series_key/);
    expect(REBUILD).toMatch(/then 'confirmed' else 'generated' end/);
  });

  it('never lets a generated date displace a confirmed one', () => {
    expect(REBUILD).toMatch(/on conflict \(event_id, open_at\) do nothing/);
  });

  it('caps the horizon so an open-ended weekly rule cannot expand forever', () => {
    expect(REBUILD).toMatch(/now\(\)\s*\+\s*interval '18 months'/);
  });

  it('clears derived rows for an event whose schedule was removed', () => {
    // The batch loop filters `schedule is not null`, so it cannot see these; a
    // separate sweep is required or they leak forever.
    expect(REBUILD).toMatch(
      /delete from public\.event_dates d[\s\S]{0,200}e\.schedule is not null/,
    );
  });
});

describe('exposure', () => {
  it('embeds the full parent predicate in the satellite RLS policy', () => {
    // A date row leaks the existence and timing of its event, so it must answer the
    // same question the parent does — both halves, not just one.
    expect(TABLE).toMatch(/e\.duplicate_of_id is null/);
    expect(TABLE).toMatch(/not e\.safety_gated or \(select auth\.uid\(\)\) is not null/);
  });

  it('revokes the default-granted write set from the API roles', () => {
    // Supabase stock ALTER DEFAULT PRIVILEGES grants ALL on every new relation.
    // Leaving it is how 20260806180000 and 20260912075359 both happened.
    expect(TABLE).toMatch(
      /revoke insert, update, delete, truncate on public\.event_dates\s+from anon, authenticated/,
    );
  });

  it('keeps anon SELECT so the derived dates are readable', () => {
    expect(TABLE).toMatch(/grant select on public\.event_dates to anon/);
  });
});

describe('the sentinel', () => {
  it('reports schedules_total as the positive control for its own zeroes', () => {
    expect(SIGNALS).toMatch(/'schedules_total'/);
  });

  it('reports probe_ok so an unreachable RPC cannot read as a clean index', () => {
    expect(SIGNALS).toMatch(/'probe_ok'/);
  });

  it('carries all three zero-invariants', () => {
    for (const key of ['stale_rows', 'orphan_generated_rows', 'beyond_horizon']) {
      expect(SIGNALS).toMatch(new RegExp(`'${key}'`));
    }
  });

  it('detects staleness by comparing the stored hash to the rule, not by a diff', () => {
    expect(SIGNALS).toMatch(
      /source_hash is distinct from public\.event_schedule_hash\(e\.schedule\)/,
    );
  });
});

describe('the health script consumes the sentinel', () => {
  const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('calls event_schedule_signals', () => {
    expect(health).toMatch(/rpc\/event_schedule_signals/);
  });

  it('fails the build on each zero-invariant', () => {
    // Scoped to the block, so a `FAILED = true` belonging to another section cannot
    // satisfy this.
    const block = health.slice(health.indexOf('event_schedule_signals'));
    for (const v of ['stale', 'orphan', 'beyond']) {
      expect(block).toMatch(new RegExp(`if \\(${v} > 0\\)[\\s\\S]{0,300}?FAILED = true`));
    }
  });

  it('says so when there are no schedules, rather than printing a bare pass', () => {
    const block = health.slice(health.indexOf('event_schedule_signals'));
    expect(block).toMatch(/schedules === 0/);
  });
});

const INFER = code(latestDefining('infer_event_schedules'));
const SHAPE = code(latestMatching(/events_schedule_shape check/));

describe('cadence inference (part 3)', () => {
  // The defect the measurement caught: "same weekday, same clock, >=3 distinct
  // weeks" LOOKS like a weekly test and is not one. It passes for 155 series of
  // which only 76 are weekly and 55 are monthly, so inferring weekly across it
  // generates ~4x too many dates for every monthly community group in the corpus.
  it('measures cadence from the median gap instead of assuming weekly', () => {
    expect(INFER).toMatch(/percentile_disc\(0\.5\) within group \(order by gap\)/);
    expect(INFER).toMatch(/r\.med between 6\.5 and 7\.5/);
    expect(INFER).toMatch(/r\.med between 27 and 32/);
  });

  it('stamps every inferred rule so it can never pass as human-authored', () => {
    // Part 5 keys its never-publish treatment on this stamp.
    const rules = INFER.match(/'confidence', 'inferred'/g) ?? [];
    expect(rules.length).toBeGreaterThanOrEqual(3); // weekly, fortnightly, monthly
  });

  it('records the cadences it cannot express instead of guessing one', () => {
    expect(INFER).toMatch(/'state', 'not_expressible'/);
  });

  it('never overwrites a series that already carries a rule', () => {
    expect(INFER).toMatch(/count\(\*\) filter \(where o\.has_rule\) = 0/);
  });

  it('derives exceptions from dates the feed never published', () => {
    expect(INFER).toMatch(/'exceptions', v_exceptions/);
  });
});

describe('the expressible cadences', () => {
  it('permits monthly nth including -1 for the LAST weekday', () => {
    // ((day-1)/7)+1 calls 30 Sep the 5th Wednesday, which is arithmetic not meaning:
    // Bi-Gruppe and Polygespraech are last-weekday series and a forward-only nth
    // generates nothing for them in a four-Wednesday month.
    expect(SHAPE).toMatch(/nth'\)::int in \(-1, 1, 2, 3, 4\)/);
    expect(MODEL).toMatch(/v_m_nth = -1 and v_m_bwd = 1/);
  });

  it('requires an anchor whenever interval_weeks is set', () => {
    // "Every other Friday" has no phase without one.
    expect(SHAPE).toMatch(/interval_weeks[\s\S]{0,220}schedule \? 'anchor'/);
  });

  it('leaves plain weekly unchanged when no interval is given', () => {
    expect(MODEL).toMatch(/v_interval = 1\s+or\s+\(v_anchor is not null/);
  });
});
