import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards 99970101100000 — THE CODES A DISOWNED ENTITY LEFT BEHIND.
 *
 * Six active, indexable tags published clinical codes derived from a Wikidata
 * entity that had since been disowned: ICPC-2 A96 ("death") on /tags/passing,
 * ICD-10 U07.1 (COVID-19) on /tags/seafood, L68.0 (hirsutism) on /tags/bearded,
 * SNOMED 223688001 ("United States") on /tags/s-a-m, plus scat and whore.
 *
 * The mechanism is that clearing a wrong `wikidata_id` removes the tag from
 * run_tag_medical_codes_sync's work set, so the sync can neither refresh nor
 * retract the codes ever again — the documented remedy freezes them.
 */

const MIGRATION = 'supabase/migrations/99970101100000_tag_medical_codes_orphan_reap.sql';
const ADMIN_PANEL = 'src/components/admin/TagMedicalCodesSection.tsx';
const HEALTH = 'scripts/check-pipeline-health.mjs';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const sql = read(MIGRATION);

/** Migration source with `--` comment lines removed, so a guard cannot be
 *  satisfied by the header prose that describes it. Line-anchored, because a
 *  mid-line `--` inside a string literal is not a comment. */
const code = sql
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

/** Only the verify block, for postcondition assertions. */
const verify = code.slice(code.indexOf('do $verify$'));

/** Everything before the verify block. */
const statements = code.slice(0, code.indexOf('do $verify$'));

/** The reaper body alone. */
const reaper = statements.slice(
  statements.indexOf('function public.run_tag_medical_codes_reap_orphans'),
  statements.indexOf('create or replace function public.tag_medical_code_signals'),
);

describe('99970101100000 — orphaned clinical codes', () => {
  it('reaps by the exact complement of the sync work set', () => {
    expect(reaper).toMatch(/status\s*=\s*'active'\s+and\s+t\.wikidata_id\s*~\s*'\^Q\[0-9\]\+\$'/);
  });

  it('coalesces the NULL identifier, which is what makes the reap fire at all', () => {
    // `not (active and wikidata_id ~ ...)` is NULL when wikidata_id IS NULL, so
    // a bare NOT retains every row this exists to delete. Measured: without the
    // coalesce the predicate matched 1 inert row instead of 19.
    expect(reaper).toMatch(
      /not\s+coalesce\(\s*t\.status\s*=\s*'active'\s+and\s+t\.wikidata_id\s*~[^,]*,\s*false\s*\)/,
    );
    expect(reaper).not.toMatch(
      /\bnot\s*\(\s*t\.status\s*=\s*'active'\s+and\s+t\.wikidata_id\s*~\s*'\^Q\[0-9\]\+\$'\s*\)/,
    );
  });

  it('never deletes the curated editorial lane', () => {
    expect(reaper).toMatch(/m\.source\s+is\s+distinct\s+from\s+'editorial'/);
  });

  it('deletes from tag_medical_codes and nothing else', () => {
    const deletes = [...reaper.matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map((m) => m[1]);
    expect(deletes).toEqual(['public.tag_medical_codes']);
  });

  it('writes no prose and no identifier — this round repairs codes only', () => {
    expect(statements).not.toMatch(/update\s+public\.unified_tags/i);
    expect(statements).not.toMatch(/short_description\s*=/);
    expect(statements).not.toMatch(/long_description\s*=/);
    expect(statements).not.toMatch(/wikidata_id\s*=/);
  });

  it('runs the reaper as its own one-shot repair, not a hand-written DELETE', () => {
    expect(statements).toMatch(/select\s+public\.run_tag_medical_codes_reap_orphans\(\)\s*;/);
  });

  it('schedules sync-then-reap on the live cron, preserving the schedule', () => {
    // This is an action.type='rpc' registry row with NO action.command, so the
    // registry cannot carry the command and branch (d) cannot schedule it.
    // Editing cron directly is the convention for rpc rows, not the
    // detect_stale_venues mistake — no reconciler branch can overwrite it.
    expect(statements).toMatch(/cron\.schedule\(\s*'tag_medical_codes_sync'/);
    expect(statements).toMatch(/'30 5 \* \* 1'/);
    const sched = statements.slice(statements.indexOf('cron.schedule('));
    expect(sched.indexOf('run_tag_medical_codes_sync()')).toBeLessThan(
      sched.indexOf('run_tag_medical_codes_reap_orphans()'),
    );
    // Never edit the registry for an rpc row, and never run the global reconciler.
    expect(statements).not.toMatch(/update\s+public\.admin_automations/i);
    expect(statements).not.toMatch(/sync_automations_to_cron/);
    expect(statements).not.toMatch(/cron\.unschedule/);
  });

  it('asserts the cron live rather than trusting the migration file', () => {
    expect(verify).toMatch(/from cron\.job/);
    expect(verify).toMatch(/jobname = 'tag_medical_codes_sync'/);
    expect(verify).toMatch(/schedule = '30 5 \* \* 1'/);
    expect(verify).toMatch(/and active/);
  });

  it('keeps both new functions off anon and authenticated', () => {
    for (const fn of ['run_tag_medical_codes_reap_orphans', 'tag_medical_code_signals']) {
      expect(statements).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`),
      );
      expect(statements).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\(\\) to service_role`),
      );
    }
  });

  it('reports coverage before the verdict, so an empty table cannot read as clean', () => {
    const sig = statements.slice(statements.indexOf('function public.tag_medical_code_signals'));
    expect(sig.indexOf("'code_rows_total'")).toBeGreaterThan(-1);
    expect(sig.indexOf("'code_rows_total'")).toBeLessThan(sig.indexOf("'orphan_code_rows'"));
    expect(sig).toMatch(/'probe_ok',\s*true/);
    // The editorial lane is exempt from the reaper, so it must be reported
    // separately rather than folded into the invariant.
    expect(sig).toMatch(/'editorial_rows'/);
  });

  it('asserts the six repaired rows BY NAME, not by count', () => {
    for (const slug of ['passing', 'seafood', 'bearded', 's-a-m', 'scat', 'whore']) {
      expect(verify).toContain(`'${slug}'`);
    }
  });

  it('carries a mirror assertion so an over-reaching reap cannot pass', () => {
    // "zero orphans" is equally satisfied by a table the reap emptied.
    expect(verify).toMatch(/v_healthy\s*<\s*380/);
    expect(verify).toMatch(/over-reached/);
  });

  it('has postconditions that cannot be neutered', () => {
    // Refuse the short-circuit shapes only. A bare /\bfalse\b/ is too blunt:
    // postcondition 2 legitimately carries the same `coalesce(…, false)` the
    // reaper needs, and banning that would force the guard to drop the check
    // that matters most.
    expect(verify).not.toMatch(/\b(where|and|or|if)\s+false\b/i);
    expect(verify).not.toMatch(/v_bad\s*:=\s*0/);
    // Every raise must sit behind a real comparison, not a loosened one.
    expect(verify).not.toMatch(/v_bad\s*<\s*0/);
    expect((verify.match(/raise exception/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((verify.match(/from public\.tag_medical_codes/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it('corrects the admin docblock that recommended the action which causes this', () => {
    const panel = read(ADMIN_PANEL);
    expect(panel).toMatch(/holds ONLY while the tag\s*\n?\s*\*?\s*still has an identifier/);
    expect(panel).toContain('run_tag_medical_codes_reap_orphans');
    // The misleading sentence must remain visible as the thing being corrected,
    // not silently deleted — otherwise the correction reads as a fresh claim.
    expect(panel).toContain("fix the tag's `wikidata_id`");
  });

  it('wires the sentinel into the health script with the 404 carve-out', () => {
    const health = read(HEALTH);
    // Anchored on the FETCH, not on the name: a bare toContain() is satisfied
    // by the name appearing in a comment, which let an "unwired sentinel"
    // mutation survive the first round.
    expect(health).toContain('/rest/v1/rpc/tag_medical_code_signals`');
    expect(health).toMatch(/res\.status === 404[\s\S]{0,400}?99970101100000/);
    expect(health).toMatch(/orphan_code_rows[\s\S]{0,600}?FAILED = true/);
    // Coverage gate, so a probe that sees nothing cannot report success.
    expect(health).toMatch(/code_rows_total[\s\S]{0,200}?measuring nothing/);
  });

  it('declares the migration actor', () => {
    expect(statements).toContain("set_config('app.actor', 'migration:99970101100000', true)");
  });
});
