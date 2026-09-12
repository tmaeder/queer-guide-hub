import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guards on the event schedule model (20600601100000 / 20600601100100).
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

function latest(match: RegExp): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => match.test(f))
    .sort()
    .pop();
  if (!file) throw new Error(`no migration matching ${match}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Strip `--` line comments so prose cannot satisfy a guard. */
function code(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MODEL = code(latest(/_event_schedule_model\.sql$/));
const REBUILD = code(latest(/_event_dates_rebuild_and_signals\.sql$/));

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

  it('regenerates only generated rows, never confirmed ones', () => {
    // Anchored on the per-event delete specifically. A loose `delete from
    // event_dates ... provenance = 'generated'` scan is VACUOUS here, because the
    // orphan sweep further down contains the same phrase and satisfies it after this
    // filter is removed — mutation-tested, it did exactly that.
    expect(REBUILD).toMatch(
      /delete from public\.event_dates\s+where event_id = p_event_id and provenance = 'generated'/,
    );
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
    expect(MODEL).toMatch(/e\.duplicate_of_id is null/);
    expect(MODEL).toMatch(/not e\.safety_gated or \(select auth\.uid\(\)\) is not null/);
  });

  it('revokes the default-granted write set from the API roles', () => {
    // Supabase stock ALTER DEFAULT PRIVILEGES grants ALL on every new relation.
    // Leaving it is how 20260806180000 and 20260912075359 both happened.
    expect(MODEL).toMatch(
      /revoke insert, update, delete, truncate on public\.event_dates\s+from anon, authenticated/,
    );
  });

  it('keeps anon SELECT so the derived dates are readable', () => {
    expect(MODEL).toMatch(/grant select on public\.event_dates to anon/);
  });
});

describe('the sentinel', () => {
  it('reports schedules_total as the positive control for its own zeroes', () => {
    expect(REBUILD).toMatch(/'schedules_total'/);
  });

  it('reports probe_ok so an unreachable RPC cannot read as a clean index', () => {
    expect(REBUILD).toMatch(/'probe_ok'/);
  });

  it('carries all three zero-invariants', () => {
    for (const key of ['stale_rows', 'orphan_generated_rows', 'beyond_horizon']) {
      expect(REBUILD).toMatch(new RegExp(`'${key}'`));
    }
  });

  it('detects staleness by comparing the stored hash to the rule, not by a diff', () => {
    expect(REBUILD).toMatch(
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
