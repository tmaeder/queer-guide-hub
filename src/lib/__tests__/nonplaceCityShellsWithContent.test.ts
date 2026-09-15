import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards `74000101100000_nonplace_city_shells_with_content.sql`, which archives the four
// `cities` rows named after a country of the UK or a US state (Wales, Scotland, Texas,
// California) and dispositions the 21 venues that were asserting they sit in them.
//
// Dry-run on prod in a rolled-back transaction before merge:
//   shells=4 relinked=2 unlinked=19 archived=4 refused=0 content_left=0 ghost=4
//   relinks: Skateboarding Hall of Fame and Museum -> Simi Valley | Wild Fruit -> Lampeter
//
// What is asserted here is the migration's own structure — the properties whose removal
// would leave a file that still applies cleanly and still reports success.

const MIGRATION = '74000101100000_nonplace_city_shells_with_content.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Every assertion runs against comment-stripped SQL. A long explanatory header makes a
// text-based guard satisfiable by the prose while the guard itself is gone — this repo has
// recorded that trap repeatedly, so it is not hypothetical.
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

// The statements only, excluding the verify block: that block echoes the strings the
// statements use, so a whole-file `toContain` passes with the real statement deleted.
const statements = sql.split('do $verify$')[0];

describe('the non-place city shell disposition', () => {
  it('selects by the defect signature, never by a frozen id list', () => {
    // A frozen id list cannot no-op when a concurrent session legitimately archives or
    // merges one of these rows — it aborts `db push` on main and takes every queued
    // migration with it. Soft on preconditions.
    expect(statements).toMatch(/data_source\s*=\s*'personality-birth-place'/);
    expect(statements).toMatch(/wikidata_qid\s+is\s+null/);
    expect(statements).toMatch(/name in \('Wales','Scotland','Texas','California'\)/);
    // No bare uuid literals driving the work.
    expect(statements).not.toMatch(
      /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i,
    );
  });

  it('relinks a venue ONLY on a single match corroborated by country', () => {
    // `cities` cannot represent same-name collisions, so name alone may never resolve an
    // entity (20260802090844). Both halves are load-bearing: the country scope AND the
    // requirement that exactly one row matches.
    // The country scope appears in BOTH the target subquery and the match-count subquery.
    // Asserting it once is satisfiable by the surviving copy while the other loses its
    // scope — which is the dangerous divergence: resolving a city in one country while
    // counting candidates in another. Mutation testing caught exactly that, so count them.
    const countryScopes = statements.match(/x\.country_id\s*=\s*c\.country_id/g) ?? [];
    expect(countryScopes.length).toBe(2);
    expect(statements).toMatch(/r\.n(_matches)?\s*=\s*1/);
  });

  it('BLOCKS a relink when state and region_name disagree', () => {
    // Guard (A) of 20260802090844: block when the independent signal disagrees, and allow
    // when one side simply does not carry it. Removing this arm lets a same-named city in
    // the wrong region win.
    expect(statements).toMatch(
      /lower\(btrim\(x\.region_name\)\)\s*=\s*lower\(btrim\(c\.vstate\)\)/,
    );
  });

  it('unlinks rather than guesses, and keeps the address evidence', () => {
    // A null city_id is recoverable; a wrong one is not. country_id and the address text
    // are never cleared — only the false "this venue is in the city of California" claim.
    expect(statements).toMatch(/set\s+city_id\s*=\s*null/);
    expect(statements).not.toMatch(/set[\s\S]{0,120}country_id\s*=\s*null/);
    expect(statements).not.toMatch(/\bdelete\s+from\s+public\.venues/i);
  });

  it('archives through the reversible RPC, never a raw status write', () => {
    // archive_city_as_nonplace snapshots the prior state so unarchive_city can restore it,
    // and it REFUSES a row that still has venues or events — which is what makes the
    // ordering in this file load-bearing.
    expect(statements).toMatch(/public\.archive_city_as_nonplace\(/);
    expect(statements).not.toMatch(
      /update\s+public\.cities[\s\S]{0,200}shell_status\s*=\s*'ghost'/i,
    );
    expect(statements).not.toMatch(/\bdelete\s+from\s+public\.cities/i);
  });

  it('dispositions the content BEFORE archiving', () => {
    // The archive RPC returns {ok:false,error:'has_content'} while a venue still points at
    // the row, so an archive placed first silently refuses all four and the migration
    // reports success having changed nothing.
    const unlink = statements.indexOf('set city_id = null');
    const archive = statements.indexOf('archive_city_as_nonplace');
    expect(unlink).toBeGreaterThan(-1);
    expect(archive).toBeGreaterThan(-1);
    expect(unlink).toBeLessThan(archive);
  });

  it('checks the archive RPC result instead of assuming it worked', () => {
    // The RPC returns a jsonb verdict rather than raising, so an unchecked call cannot tell
    // a refusal from a success.
    expect(statements).toMatch(/v_res->>'ok'/);
  });

  it('asserts the REACHED state positively, not the absence of a bad one', () => {
    // Counting rows in a bad state returns zero for a row that has gone missing from the
    // corpus entirely, which is exactly what the softened selection lets through.
    const verify = sql.split('do $verify$')[1] ?? '';
    expect(verify).toMatch(/v_ghost\s*<\s*4/);
    expect(verify).toMatch(/raise exception/i);
  });
});
