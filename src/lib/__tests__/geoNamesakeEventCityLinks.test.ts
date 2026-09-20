import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991789886174_geo_namesake_event_city_links.sql.
//
// Twelve events sit over 250 km from the city they are presented on. The migration
// applies THREE remedies, chosen per row from that row's own evidence, and the whole
// value of the file is that it does not apply one:
//
//   A block (8)   the city is unrepresentable, so the link is removed, not guessed
//   B relink (2)  the collision crosses a border and the right row already exists
//   C geo (2)     the LINK is correct and the COORDINATES were wrong
//
// Group C is the one these tests exist for. Both of its rows look WORSE on distance
// than anything in group A -- one is 8,526 km out -- and sorting by distance and
// applying group A's remedy would have detached a correctly-placed Florida event and,
// under the original brief, published it as Russian. So the assertions below are not
// only "the statements are present": they check that group A's predicate cannot reach
// group C's rows, and that group C keeps its city.
//
// Assertions are scoped to the half of the statement they are about. This migration's
// header quotes the strings its statements also contain -- it names Saint Petersburg,
// the unique key, and every group label in prose -- so a bare toContain over the whole
// file passes against a gutted SET clause, and a content-guarded UPDATE quotes the
// defect verbatim in its own WHERE. Both are the vacuous-assertion class CLAUDE.md
// records repeatedly.

const MIGRATION = '99991789886174_geo_namesake_event_city_links.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** Everything before the postconditions: the writes themselves. */
const writes = statements.slice(0, statements.indexOf('do $verify$'));
/** Just the postconditions. */
const verify = statements.slice(statements.indexOf('do $verify$'));

/** The nth `update public.events` statement, comment-free, up to its terminating `;`. */
function updates(): string[] {
  const out: string[] = [];
  const re = /update public\.events\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(writes)) !== null) {
    const rest = writes.slice(m.index);
    // statements here contain no semicolons inside their literals; the first `;\n`
    // is the statement terminator. Asserted below so this splitter cannot go wrong.
    const end = rest.indexOf(';\n');
    out.push(rest.slice(0, end));
  }
  return out;
}

const [groupA, groupB, groupC1, groupC2] = updates();
/** SET clause only -- between `set` and the `from`/`where` that follows it. */
const setOf = (s: string) => s.slice(s.indexOf('\n   set'), s.search(/\n\s+(from|where)\b/));
/** WHERE clause only. */
const whereOf = (s: string) =>
  s.slice(s.indexOf('\n where') >= 0 ? s.indexOf('\n where') : s.search(/\n\s+where\b/));

const GROUP_C_IDS = [
  '0aa93667-3d85-4714-8d2f-ec4adbc582c3',
  '03ec22b3-38cc-4bda-b20e-da1534e22898',
];
const GROUP_B_IDS = [
  '40aefb71-e3b8-40d9-a206-4cbd33827e65',
  'aac86082-299f-4e2e-8944-5c4049581807',
];

describe('the splitter this file depends on', () => {
  it('finds exactly the four UPDATE statements, each properly terminated', () => {
    // If this ever fails, every scoped assertion below is measuring the wrong span --
    // which is indistinguishable from a guard that does not fire.
    expect(updates()).toHaveLength(4);
    for (const u of updates()) {
      expect(u.length).toBeGreaterThan(200);
      expect(u).not.toContain('do $verify$');
    }
  });
});

describe('group A: the eight unrepresentable rows are blocked, not guessed', () => {
  it('unlinks and flags rather than repointing', () => {
    const set = setOf(groupA);
    expect(set).toMatch(/city_id\s*=\s*null/);
    expect(set).toMatch(/needs_attention\s*=\s*true/);
    // never invents a destination
    expect(set).not.toMatch(/city_id\s*=\s*(?!null)\w/);
  });

  it('carries all eight event ids, and none of group B or C', () => {
    const plan = writes.slice(
      writes.indexOf('_ns_plan on commit drop'),
      writes.indexOf('update public.events'),
    );
    expect(plan.match(/'[0-9a-f]{8}-[0-9a-f]{4}-/g) ?? []).toHaveLength(8);
    for (const id of [...GROUP_B_IDS, ...GROUP_C_IDS]) {
      expect(plan, `${id} must never be blockable`).not.toContain(id);
    }
  });

  it('REQUIRES BOTH signals: the state text and the coordinates that corroborate it', () => {
    const where = whereOf(groupA);
    // signal 1 -- the event is where its own state text says
    expect(where).toMatch(/lower\(e\.state\)\s*=\s*lower\(p\.expect_state\)/);
    expect(where).toMatch(/haversine_m\([^)]*p\.true_lat,\s*p\.true_lon\)\s*<\s*25000/);
    // signal 2 -- and the linked city is nowhere near it
    expect(where).toMatch(/haversine_m\([\s\S]*?c\.latitude[\s\S]*?\)\s*>\s*250000/);
    // both arms are ANDed; an OR here would act on either signal alone, which is the
    // near-random `state` column deciding by itself
    expect(where).not.toMatch(/\bor\b/i);
  });

  it('only acts on the defect, so a concurrent repair no-ops instead of aborting db push', () => {
    expect(whereOf(groupA)).toMatch(/e\.city_id is not null/);
  });
});

describe('group B: relinked onto a row that already exists and is corroborated', () => {
  it('moves both events onto the resolved identifiers, never onto a created row', () => {
    expect(writes).not.toMatch(/insert into public\.cities/);
    const where = whereOf(groupB);
    expect(where).toContain("'birmingham-us-78ymh'");
    expect(where).toContain("'Q79867'");
    expect(where).toContain("'cambridge'");
    expect(where).toContain("'Q49111'");
  });

  it('requires the target to be corroborated by the event, not merely named', () => {
    expect(whereOf(groupB)).toMatch(/haversine_m\([\s\S]*?tgt\.latitude[\s\S]*?\)\s*<\s*25000/);
  });

  it('is guarded on the WRONG row, so it cannot re-point a human-corrected event', () => {
    const where = whereOf(groupB);
    expect(where).toContain("wrong.slug = 'birmingham'");
    expect(where).toContain("wrong.slug = 'cambridge-gb-2wpbj'");
    expect(where).toMatch(/wrong\.id = e\.city_id/);
  });
});

describe('group C: the link is right and the coordinates are not', () => {
  it('KEEPS the city on both rows — the opposite of what their distance argues for', () => {
    for (const s of [groupC1, groupC2]) {
      const set = setOf(s);
      expect(set).toMatch(/latitude\s*=\s*null/);
      expect(set).toMatch(/longitude\s*=\s*null/);
      // the defect this whole file exists to avoid
      expect(set, 'group C must never unlink; its city link is the correct part').not.toMatch(
        /city_id\s*=/,
      );
    }
  });

  it('retracts rather than replacing: no centroid is written back', () => {
    for (const s of [groupC1, groupC2]) {
      expect(setOf(s)).not.toMatch(/latitude\s*=\s*-?\d/);
      expect(setOf(s)).not.toMatch(/longitude\s*=\s*-?\d/);
    }
  });

  it('preserves the value it removes, so the retraction is recoverable from the row', () => {
    for (const s of [groupC1, groupC2]) {
      expect(setOf(s)).toMatch(/'retracted',\s*jsonb_build_object\(\s*'latitude',\s*e\.latitude/);
    }
  });

  it('also clears the timezone stamped from the merged-away row, but only on Łódź', () => {
    expect(setOf(groupC2)).toMatch(/timezone\s*=\s*null/);
    // St. Petersburg's timezone was never derived from a wrong row; leaving it alone
    // is the narrower, correct action
    expect(setOf(groupC1)).not.toMatch(/timezone\s*=/);
  });

  it('guards each row on the exact wrong value it is removing', () => {
    // St. Petersburg: the scraped Russian coordinates
    expect(whereOf(groupC1)).toMatch(/haversine_m\([\s\S]*?59\.9406782[\s\S]*?\)\s*<\s*25000/);
    // Łódź: coordinates identical to a city row that has been merged away
    expect(whereOf(groupC2)).toMatch(/dead\.duplicate_of_id is not null/);
    expect(whereOf(groupC2)).toMatch(/dead\.latitude = e\.latitude/);
  });
});

/**
 * The SQL of one postcondition: from the query that feeds it to the RAISE that
 * reports it. Anchored on CODE, never on the `-- Pn MIRROR:` comment that labels it
 * -- `verify` is comment-stripped, so a comment anchor yields an empty slice and
 * every assertion scoped to it passes against a deleted check. Two of the tests
 * below were written that way first and this file caught them.
 */
function postcondition(label: string): string {
  const end = verify.indexOf(`${label} failed`);
  expect(end, `${label} has no RAISE, so there is nothing to scope to`).toBeGreaterThan(0);
  // the OUTER query that feeds the counter, not the innermost subquery `select`
  const start = verify.lastIndexOf('into v_', end);
  const slice = verify.slice(start, end);
  expect(slice.length, `${label} scoped to an empty span`).toBeGreaterThan(40);
  return slice;
}

describe('postconditions', () => {
  it('asserts the reached state positively for every group', () => {
    for (const p of ['P1', 'P2', 'P3', 'P3b', 'P4', 'P5', 'P6', 'P7']) {
      expect(verify, `${p} is missing`).toContain(`${p} failed`);
    }
  });

  it('checks the corpus-wide invariant, not only the twelve it edited', () => {
    // P4 is the claim that found these rows in the first place. Narrowed to the rows
    // this file touched it would pass while a thirteenth sat live.
    const p4 = postcondition('P4');
    expect(p4).toMatch(/from public\.events e join public\.cities c on c\.id = e\.city_id/);
    expect(p4).toMatch(/> 250000/);
    expect(p4).not.toContain('_ns_plan');
    expect(p4).not.toContain('_ns_before');
  });

  it('proves restraint with a before/after snapshot, not a remembered count', () => {
    expect(writes).toMatch(/create temporary table _ns_before/);
    expect(writes).toMatch(/create temporary table _ns_pers_before/);
    expect(verify).toMatch(/_ns_before b join public\.events e on e\.id = b\.id/);
    expect(verify).toContain('expected exactly 12 events to change');
    // the personality mirror compares to the snapshot, never to a literal. A count of
    // 1 hardcoded here is a postcondition that rots the day the corpus moves.
    const p6 = postcondition('P6');
    expect(p6).toContain('_ns_pers_before');
    // The snapshot must be compared against a LIVE re-count. Asserting only that the
    // slice mentions `_ns_pers_before` passes when the right-hand side is replaced by
    // a literal, because the snapshot is still named in the FROM clause -- this test
    // shipped that way and a mutation walked through it.
    expect(p6).toMatch(/is distinct from \(select count\(\*\) from public\.personalities/);
    expect(
      p6,
      'the mirror compares against a literal, so it rots the day the corpus moves',
    ).not.toMatch(/is distinct from\s+\d/);
  });

  it('asserts no city row was emptied or removed by the unlinking', () => {
    const p7 = postcondition('P7');
    for (const slug of ['tmp-4f3d2206-b747-4617-9a0d-37be27aee945', 'st-petersburg', 'od-1']) {
      expect(p7).toContain(slug);
    }
    expect(p7).toContain('duplicate_of_id is null');
  });

  it('uses no loosened comparison that would stop the checks counting', () => {
    // Neutering `if v_bad <> 0` to `if v_bad < 0` leaves every message, slug and
    // regex intact while the gate stops gating -- the trap 60000101160000 records.
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(8);
    expect(verify).toContain('if v_moved <> 12 then');
    expect(verify).not.toMatch(/if v_(bad|moved) [<>]\s*[-0-9]/);
    expect(verify).not.toMatch(/\bfalse\b/);
  });
});
