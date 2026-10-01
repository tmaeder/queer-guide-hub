import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790537156_event_venue_link_drift.sql and its health-script section.
//
// Two events were attached to a venue on the wrong continent and `link_event_venues`
// made NEITHER of them: its auto branch is `name_exact AND (distance_m IS NULL OR
// distance_m < 500)` -- five hundred metres -- and across all 132 links it has recorded
// the worst is 430 m. The gap is that a link is validated once, at link time, and is
// never re-checked when either side's coordinates move.
//
// So the three things that must not drift are:
//   1. a relink lands only on a venue the EVENT'S OWN coordinates corroborate
//   2. where no correct venue exists the link is DETACHED, never guessed
//   3. the sentinel reports its denominators, and is wired ABOVE the script's exit
//
// Point 3 is not hypothetical: the section was first appended to the end of the file,
// after `if (FAILED) process.exit(1)` and after the success line, so it would have
// printed a failure and still exited 0.
//
// Assertions are scoped to the half of the statement they are about, because this
// migration's header quotes every venue name, distance and reason in prose.

const MIGRATION = '99991790537156_event_venue_link_drift.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const sitges = statements.slice(
  statements.indexOf('set venue_id = tgt.id'),
  statements.indexOf('update public.events e\n   set venue_id = null'),
);
const denver = statements.slice(
  statements.indexOf('update public.events e\n   set venue_id = null'),
  statements.indexOf('update public.venues v'),
);
const venueFix = statements.slice(
  statements.indexOf('update public.venues v'),
  statements.indexOf('create or replace function public.event_venue_link_signals'),
);
const sentinel = statements.slice(
  statements.indexOf('create or replace function public.event_venue_link_signals'),
  statements.indexOf('do $verify$'),
);
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('the spans this file depends on', () => {
  it('found all five', () => {
    for (const [n, s] of [
      ['sitges', sitges],
      ['denver', denver],
      ['venueFix', venueFix],
      ['sentinel', sentinel],
      ['verify', verify],
    ] as const) {
      expect(s.length, `${n} span is empty`).toBeGreaterThan(150);
    }
  });
});

describe('the relink is corroborated by the event, never by the name', () => {
  it('requires the target venue to be near the event’s own coordinates', () => {
    expect(sitges).toMatch(/haversine_m\([\s\S]*?tgt\.latitude[\s\S]*?\)\s*<\s*5000/);
  });

  it('names the target venue explicitly rather than picking one by name', () => {
    expect(sitges).toContain("tgt.id = 'fcba04b2-ab69-4e31-8ea8-a045c19b9123'");
    // and never the Taipei row it came off, nor the Madrid one 472 km away
    expect(sitges).not.toMatch(/tgt\.id = '0731c6c6/);
    expect(sitges).not.toMatch(/tgt\.id = '9863a2f4/);
  });

  it('is guarded on the defect, so a concurrent repair no-ops', () => {
    expect(sitges).toContain("e.venue_id = '0731c6c6-a579-4de8-b6db-351620b91896'");
  });

  it('does NOT hand-write the city — the trigger derives it, and that is asserted', () => {
    expect(sitges).not.toMatch(/city_id\s*=/);
    expect(verify).toContain('P1b failed');
    const p1b = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P1b failed')),
      verify.indexOf('P1b failed'),
    );
    expect(p1b).toMatch(/join public\.cities c on c\.id = e\.city_id/);
  });
});

describe('where no correct venue exists the link is detached, not guessed', () => {
  it('nulls the venue and flags it', () => {
    expect(denver).toMatch(/venue_id = null/);
    expect(denver).toMatch(/needs_attention = true/);
  });

  it('never substitutes either Washington DC Trade row', () => {
    expect(denver).not.toMatch(/venue_id = '455a5c7f/);
    expect(denver).not.toMatch(/venue_id = '0d350a5a[0-9a-f-]*'\s*,/);
  });

  it('keeps the source venue text so the re-attach stays actionable', () => {
    expect(denver).not.toMatch(/venue_name\s*=/);
    expect(verify).toMatch(/venue_name/);
  });
});

describe('the venue refile rests on two independent signals', () => {
  it('requires the coordinates to corroborate the new city', () => {
    expect(venueFix).toMatch(/haversine_m\([\s\S]*?dc\.latitude[\s\S]*?\)\s*<\s*25000/);
    expect(venueFix).toContain("dc.slug = 'washington-d-c'");
  });

  it('only acts while the row is still wrong', () => {
    expect(venueFix).toMatch(/v\.city_id is distinct from dc\.id/);
  });

  it('does NOT merge the duplicate Trade rows — that is the dedup engine’s call', () => {
    expect(statements).not.toMatch(/merge_venues|duplicate_of_id\s*=/);
  });
});

describe('the sentinel', () => {
  it('reports its denominators, not just the count', () => {
    expect(sentinel).toContain("'links_total'");
    expect(sentinel).toContain("'links_checkable'");
    expect(sentinel).toContain("'probe_ok'");
    expect(sentinel).toContain("'over_100km'");
    // and names the offenders, so a non-zero reading is actionable
    expect(sentinel).toContain("'offenders'");
  });

  it('uses the measured bound', () => {
    expect(sentinel).toMatch(/km > 100\b/);
    expect(sentinel).not.toMatch(/km > (1|5|10|25|50|250|500)\b/);
  });

  it('is service_role only — a definer aggregate granted to authenticated is public', () => {
    expect(statements).toMatch(
      /revoke all on function public\.event_venue_link_signals\(\) from public/,
    );
    expect(statements).toMatch(
      /grant execute on function public\.event_venue_link_signals\(\) to service_role/,
    );
    expect(statements).not.toMatch(/to authenticated/);
  });

  it('is asserted to RUN inside the migration, not merely created', () => {
    expect(verify).toMatch(/v_sig := public\.event_venue_link_signals\(\)/);
    expect(verify).toContain('P5 failed');
  });
});

describe('postconditions', () => {
  it('checks the invariant CORPUS-WIDE, not scoped to the rows it repaired', () => {
    // Scoped to these two it would pass while a third sat live, which is how both
    // of these survived a year. Mutation-found: this assertion was missing.
    const p4 = verify.slice(
      verify.lastIndexOf('into v_bad', verify.indexOf('P4 failed')),
      verify.indexOf('P4 failed'),
    );
    expect(p4.length).toBeGreaterThan(100);
    expect(p4).toMatch(/> 100000/);
    expect(p4).toMatch(/e\.duplicate_of_id is null/);
    expect(p4, 'P4 must not be narrowed to a single event id').not.toMatch(/e\.id = '/);
  });

  it('proves restraint with a before/after snapshot of exactly two rows', () => {
    // "Zero links over 100 km" is equally satisfied by detaching every venue in the
    // corpus. Mutation-found: this assertion was missing too.
    expect(statements).toMatch(/create temporary table _evl_before/);
    expect(verify).toMatch(/_evl_before b join public\.events e on e\.id = b\.id/);
    expect(verify).toContain('if v_moved <> 2 then');
    expect(verify).toContain('expected exactly 2 events to change');
  });

  it('asserts the already-correct links survive, and the sibling repair too', () => {
    expect(verify).toMatch(/<= 100000/);
    expect(verify).toMatch(/v_bad < 1600/);
    // 99991790379818's Fort Lauderdale detach must not have been undone
    expect(verify).toContain('e277dc22-1de3-4d55-9842-f2d49d53d459');
  });

  it('uses no loosened comparison that would stop the checks counting', () => {
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(5);
    expect(verify).not.toMatch(/if v_(bad|moved) <> (99|0)\d/);
    expect(verify).not.toMatch(/\bfalse\b/);
  });
});

describe('the health-script section', () => {
  it('exists and reads the sentinel', () => {
    expect(health).toContain('event_venue_link_signals');
    expect(health).toContain('§22');
  });

  it('runs BEFORE the script exits, or it is a gate wired to nothing', () => {
    // The first draft was appended after `if (FAILED) process.exit(1)` and after the
    // success line: it would have printed the failure and still exited 0.
    const sec = health.indexOf('§22');
    const exit = health.lastIndexOf('\nif (FAILED) {');
    const ok = health.lastIndexOf("console.log('✓ Pipeline health check passed')");
    expect(sec).toBeGreaterThan(0);
    expect(sec, '§22 must come before the FAILED exit').toBeLessThan(exit);
    expect(sec, '§22 must come before the success line').toBeLessThan(ok);
  });

  it('treats an unreachable RPC as "measured nothing", never as a pass', () => {
    const sec = health.slice(health.indexOf('§22'));
    expect(sec).toContain('This check measured NOTHING');
    expect(sec).toMatch(/probe_ok !== true/);
  });

  it('fails when the denominator collapses, not only when the count rises', () => {
    const sec = health.slice(health.indexOf('§22'));
    expect(sec).toMatch(/links_checkable[\s\S]*?< 1000/);
  });

  it('points the reader away from the linker, which is measurably not the cause', () => {
    const sec = health.slice(health.indexOf('§22'));
    expect(sec).toMatch(/Do NOT reach for link_event_venues/);
  });
});
