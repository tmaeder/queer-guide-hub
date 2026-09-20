import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the schema-object drift sentinel — 99991789864912 +
 * scripts/check-schema-object-drift.mjs.
 *
 * WHAT IT IS FOR. `trg_personalities_outing_guard`, the seal on the CRITICAL
 * `person_outing_guard`, was attached to prod BY HAND during the 2026-09-19
 * incident and existed in no migration. Nothing could see that:
 * `check-migration-drift.mjs` compares migration HISTORY against repo FILES and
 * is structurally blind to an OBJECT that exists with no statement creating it;
 * vitest mocks the Supabase client wholesale; and `supabase gen types`
 * introspects the live catalog, so generated types agree with prod either way.
 * A rebuild from migrations came up silently without it.
 *
 * THE REGEX IS READ OUT OF THE SCRIPT AND EXERCISED, not restated here.
 * Restating it is the vacuous-assertion class: the copy would pass forever while
 * the real scanner drifted. These tests run the shipped literal against SQL in
 * every form the corpus uses.
 */

const ROOT = process.cwd();
const MIGRATION = join(ROOT, 'supabase/migrations/99991789864912_schema_trigger_inventory.sql');
const SCRIPT = join(ROOT, 'scripts/check-schema-object-drift.mjs');
const BASELINE = join(ROOT, 'scripts/schema-object-drift-baseline.json');
const WORKFLOW = join(ROOT, '.github/workflows/data-quality-gates.yml');

const sql = readFileSync(MIGRATION, 'utf8');
const script = readFileSync(SCRIPT, 'utf8');
const workflow = readFileSync(WORKFLOW, 'utf8');
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

/** Comment-stripped: the header names the RPC, the grants and the baseline size. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The scanner's own regex literal, lifted from the shipped file. */
function scannerRegex(): RegExp {
  const m = script.match(/const re\s*=\s*\n?\s*(\/.+\/[gimsuy]*);/);
  if (!m) throw new Error('could not find the create-trigger regex in the script');
  const body = m[1].slice(1, m[1].lastIndexOf('/'));
  const flags = m[1].slice(m[1].lastIndexOf('/') + 1);
  return new RegExp(body, flags);
}

const names = (s: string) => [...s.matchAll(scannerRegex())].map((m) => m[1].toLowerCase());

describe('the inventory RPC', () => {
  it('is CREATED here, not assumed to exist on prod', () => {
    expect(bare).toMatch(/create or replace function public\.schema_trigger_inventory\(\)/);
  });

  it('reads pg_trigger and excludes internal (FK/constraint) triggers', () => {
    expect(bare).toMatch(/from pg_trigger t/);
    // Without this, every foreign key on the database reads as an uncovered trigger.
    expect(bare).toMatch(/not t\.tgisinternal/);
    expect(bare).toMatch(/n\.nspname = 'public'/);
  });

  it('REVOKES before granting — a bare grant to service_role revokes nothing', () => {
    // CREATE FUNCTION already grants EXECUTE to PUBLIC, so granting to
    // service_role alone would leave this anon-callable.
    const revoke = bare.slice(bare.indexOf('revoke execute'));
    expect(revoke).toMatch(/revoke execute on function public\.schema_trigger_inventory\(\)/);
    expect(revoke).toMatch(/from public, anon, authenticated/);
    expect(revoke).toMatch(
      /grant execute on function public\.schema_trigger_inventory\(\) to service_role/,
    );
  });

  it('refuses to ship a probe that can return nothing', () => {
    // An empty inventory reads exactly like a database with no triggers, and
    // absence is the quantity this function exists to measure.
    expect(bare).toMatch(/v_total < 100/);
    // Positive control on the object the whole episode was about.
    expect(bare).toMatch(/trg_personalities_outing_guard/);
    expect(bare).toMatch(/v_seal <> 1/);
  });
});

describe('the scanner regex, exercised', () => {
  it('matches every create-trigger form the corpus uses', () => {
    expect(names('create trigger trg_a on public.x for each row execute function f();')).toEqual([
      'trg_a',
    ]);
    expect(names('CREATE TRIGGER trg_b\n  BEFORE INSERT ON public.x')).toEqual(['trg_b']);
    expect(names('create or replace trigger trg_c on x')).toEqual(['trg_c']);
    expect(names('create constraint trigger trg_d after insert on x')).toEqual(['trg_d']);
    expect(names('create trigger "trg_e" on x')).toEqual(['trg_e']);
  });

  it('finds a trigger created inside a dynamic-SQL block', () => {
    // Several migrations attach triggers from a `do $$ … execute … $$` loop; the
    // statement text is present either way, which is why a text scan works.
    expect(
      names(
        `do $$ begin execute 'create trigger trg_dyn on x for each row execute function f()'; end $$;`,
      ),
    ).toEqual(['trg_dyn']);
  });

  it('does not count a DROP as a creation', () => {
    // The mirror failure: treating `drop trigger if exists X` as coverage would
    // mark every hand-attached trigger as migrated the moment someone dropped it.
    expect(names('drop trigger if exists trg_z on public.x;')).toEqual([]);
  });

  it('captures the whole name, not a prefix', () => {
    expect(names('create trigger trg_events_null_island on events')).toEqual([
      'trg_events_null_island',
    ]);
  });
});

describe('the gate itself', () => {
  it('fails loudly on an unreachable probe instead of reporting nothing found', () => {
    // "Zero uncovered" must never be the answer to "the RPC did not respond".
    expect(script).toMatch(/schema_trigger_inventory\(\) → HTTP/);
    const onError = script.slice(script.indexOf('if (!res.ok)'));
    expect(onError.slice(0, 600)).toMatch(/process\.exit\(1\)/);
  });

  it('carries positive controls in all three directions', () => {
    // An empty inventory, a broken scanner, and a clean corpus all produce zero
    // uncovered triggers. These are what separate them.
    expect(script).toMatch(/rows\.length < 100/);
    expect(script).toMatch(/created\.size < 100/);
    expect(script).toMatch(/created\.has\('trg_personalities_outing_guard'\)/);
  });

  it('is shrink-only: a baseline entry that becomes covered is a FAILURE', () => {
    // Without this the list rots into an allowlist nobody re-reads.
    expect(script).toMatch(/nowCovered/);
    const block = script.slice(script.indexOf('if (nowCovered.length)'));
    expect(block).toMatch(/failed = true/);
  });

  it('fails on a new uncovered trigger and says how to fix it', () => {
    const block = script.slice(script.indexOf('if (added.length)'));
    expect(block).toMatch(/failed = true/);
    expect(block).toMatch(/create trigger/i);
  });

  it('is wired into the data-quality workflow behind the same secret guard', () => {
    expect(workflow).toMatch(/node scripts\/check-schema-object-drift\.mjs/);
    const step = workflow.slice(
      workflow.indexOf('Every production trigger is created by a migration'),
      workflow.indexOf('node scripts/check-schema-object-drift.mjs'),
    );
    expect(step).toMatch(/env\.SUPABASE_SERVICE_ROLE_KEY != ''/);
  });
});

describe('the baseline', () => {
  it('records the 21 measured on prod, and says it may only shrink', () => {
    expect(baseline.uncovered).toHaveLength(21);
    expect(baseline.note).toMatch(/SHRINK-ONLY/i);
  });

  it('includes the invariants worth knowing are unmigrated', () => {
    // Named so a reader of the baseline sees these are not all bookkeeping:
    // is_adult gates anon exposure, and the null-island guards protect coordinates.
    expect(baseline.uncovered).toContain(
      'tag_category_assignments.unified_tags_recompute_is_adult_trigger',
    );
    expect(baseline.uncovered).toContain('personalities.trg_personalities_thin_not_indexable');
    expect(baseline.uncovered).toContain('venues.trg_venues_null_island');
  });

  it('does NOT contain the outing seal — 99991789842467 codified it', () => {
    // If this ever reappears, the seal has been lost from the corpus again.
    expect(baseline.uncovered).not.toContain('personalities.trg_personalities_outing_guard');
  });

  it('is table-qualified, so one name on two tables is two entries', () => {
    for (const entry of baseline.uncovered) expect(entry).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/);
  });
});

describe('the record', () => {
  it('states the narrowing to triggers rather than implying the class is closed', () => {
    expect(sql).toMatch(/TRIGGERS ONLY/);
    expect(sql).toMatch(/1,400/);
  });

  it('CONTROL: the assertions survive a comment-only edit', () => {
    const stripped = sql
      .split('\n')
      .map((l) => (l.trimStart().startsWith('--') ? '-- x' : l))
      .join('\n')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(stripped).toEqual(bare);
  });
});
