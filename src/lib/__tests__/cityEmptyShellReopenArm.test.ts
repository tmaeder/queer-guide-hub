import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards `99991791920004`, which gives `run_city_trust_recompute`'s scope a fillable-gap arm so a
// city that LOSES its last venue is deindexed on the next nightly pass instead of staying
// published and empty for up to 30 days.
//
// EVERY STRUCTURAL ASSERTION RUNS OVER COMMENT-STRIPPED SQL. The migration's header quotes the
// classifier's own `WHEN slug LIKE 'tmp-%' THEN seo_indexable`, names the arm, and explains the
// predicate line by line -- and the arm itself ships with a six-line comment INSIDE the plpgsql
// string literal that carries it. An unstripped `toContain` therefore passes against a file whose
// executable statement has been deleted, which is the vacuous shape this repo has recorded many
// times over.
const MIGRATION = '99991791920004_city_empty_shell_reopen_arm.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Strip only LINE-LEADING comments. A mid-line `--` strip would also cut the `-- FILLABLE-GAP ARM`
// text out of the string literal it lives in, and that text is what the migration's own
// idempotency check keys on.
const sql = raw
  .split('\n')
  .filter((line) => !/^\s*--/.test(line))
  .join('\n');

const region = (from: string, to?: string) => {
  const start = sql.indexOf(from);
  expect(start, `region anchor ${from} not found`).toBeGreaterThan(-1);
  const end = to ? sql.indexOf(to, start) : sql.length;
  expect(end, `region end ${to} not found after ${from}`).toBeGreaterThan(start);
  return sql.slice(start, end);
};

const PATCH = region('do $patch$', '$patch$;');
const ONESHOT = region(
  'update public.cities c',
  'create or replace function public.city_publication_signals',
);
const SENTINEL = region(
  'create or replace function public.city_publication_signals',
  'do $verify$',
);
const VERIFY = region('do $verify$');

describe('the empty-shell re-open arm is patched in, not restated', () => {
  it('reads the live body and refuses an anchor that is not unique', () => {
    expect(PATCH).toContain('pg_get_functiondef(p.oid) into v_src');
    // BOTH anchors are counted, and both abort. The scope predicate and the v_examined predicate
    // differ only in their continuation indents in the live body, so an anchor that silently
    // matched both would patch a statement this change deliberately leaves alone.
    const counted = PATCH.match(/expected exactly 1', v_n/g) ?? [];
    expect(counted.length).toBe(2);
    expect(PATCH).toContain('if v_n <> 1 then');
    expect(PATCH).not.toMatch(/if v_n\s*[<>]\s*1\s+then/);
  });

  it('refuses to claim success on a no-op patch', () => {
    expect(PATCH).toContain('if v_out = v_src then');
    expect(PATCH).toContain('patch produced an identical body');
  });

  it('is idempotent so a rebuild from zero cannot double-apply', () => {
    expect(PATCH).toContain("position('FILLABLE-GAP ARM' in v_src) > 0");
    expect(PATCH).toContain('return;');
  });

  it('refuses to patch a function that is absent rather than creating one', () => {
    expect(PATCH).toContain('if v_src is null then');
  });
});

describe('the arm itself', () => {
  it('carries all three legs, so it cannot be loosened into a blanket re-open', () => {
    // Without the emptiness legs this re-opens every city every night; without the
    // published-or-real leg it never terminates, because the predicate would stay true after the
    // classifier has already resolved the row.
    expect(PATCH).toContain("OR (c.slug NOT LIKE ''tmp-%''");
    expect(PATCH).toContain("AND (c.seo_indexable OR c.shell_status IS DISTINCT FROM ''ghost'')");
    expect(PATCH).toContain('AND NOT EXISTS (SELECT 1 FROM public.venues v');
    expect(PATCH).toContain('AND NOT EXISTS (SELECT 1 FROM public.events e');
    expect(PATCH).toContain('AND v.duplicate_of_id IS NULL)');
    expect(PATCH).toContain('AND e.duplicate_of_id IS NULL)))');
  });

  it('excludes tmp- slugs, which are a disposition backlog and not an indexer gap', () => {
    // The classifier preserves `seo_indexable` for a tmp- row. Arming them would quietly reverse
    // a human decision about 1,952 searchable placeholder shells.
    expect(PATCH).toContain("c.slug NOT LIKE ''tmp-%''");
  });

  it('leaves the v_examined predicate unarmed, with the reason at the site', () => {
    // Deliberate divergence. The comment has to live next to the code: this repo has already paid
    // for two comments in one body disagreeing about a behaviour.
    expect(PATCH).toContain('v_exam_before :=');
    expect(PATCH).toContain('NOT ARMED, deliberately');
    expect(PATCH).toContain('SELECT count(*) INTO v_examined FROM public.cities c');
  });
});

describe('the one-shot repair cannot be wider than the recurring arm', () => {
  it('uses the arm’s own predicate, leg for leg', () => {
    expect(ONESHOT).toContain("c.slug not like 'tmp-%'");
    expect(ONESHOT).toContain("(c.seo_indexable or c.shell_status is distinct from 'ghost')");
    expect(ONESHOT).toContain('not exists (select 1 from public.venues v');
    expect(ONESHOT).toContain('not exists (select 1 from public.events e');
    expect(ONESHOT).toContain(
      "coalesce(c.enrichment_status->'disposition'->>'state','') <> 'not_a_city'",
    );
  });

  it('mirrors the classifier’s own verdict for an empty row', () => {
    expect(ONESHOT).toContain("shell_status  = 'ghost'");
    expect(ONESHOT).toContain('seo_indexable = false');
    expect(ONESHOT).toContain('trust_score   = 15');
  });

  it('does not stamp last_verified_at, so the engine still confirms each row', () => {
    expect(ONESHOT).not.toContain('last_verified_at');
  });
});

describe('the sentinel reports a window and gates on an age', () => {
  it('reports the raw count and the aged count as separate keys', () => {
    expect(SENTINEL).toContain("'empty_published',");
    expect(SENTINEL).toContain("'empty_published_stale',");
  });

  it('ages on BOTH created_at and last_verified_at', () => {
    // created_at alone counts a brand-new city that has not had its chance yet;
    // last_verified_at alone counts a never-verified row the existing arms already cover.
    expect(SENTINEL).toContain("created_at < now() - interval '36 hours'");
    expect(SENTINEL).toContain(
      "coalesce(last_verified_at, '-infinity'::timestamptz) < now() - interval '36 hours'",
    );
  });

  it('proves the arm from the PREDICATE over stripped source, never from the marker comment', () => {
    // A sentinel keyed on `FILLABLE-GAP ARM` passes for a body whose comment was kept and whose
    // code was deleted.
    const armKey = SENTINEL.slice(SENTINEL.indexOf("'recompute_has_reopen_arm'"));
    expect(armKey).toContain('regexp_replace(pg_get_functiondef(p.oid)');
    expect(armKey).toContain("ilike '%NOT EXISTS (SELECT 1 FROM public.venues v%'");
    expect(armKey).not.toContain('FILLABLE-GAP ARM');
  });

  it('keeps the gate window and the resolver proof the earlier migrations added', () => {
    expect(SENTINEL).toContain("'gate_since', (select since from gate)");
    expect(SENTINEL).toContain("greatest(now() - interval '2 days', g.since)");
    expect(SENTINEL).toContain("'resolver_sets_seo_indexable'");
  });

  it('stays service_role only', () => {
    expect(sql).toContain(
      'revoke all on function public.city_publication_signals() from anon, authenticated;',
    );
    expect(sql).toContain(
      'grant execute on function public.city_publication_signals() to service_role;',
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.city_publication_signals\(\) to (anon|authenticated)/,
    );
  });
});

describe('the postconditions', () => {
  it('assert the arm over comment-stripped source', () => {
    expect(VERIFY).toContain(
      "regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')",
    );
    expect(VERIFY).toContain("position('c.slug NOT LIKE ''tmp-%''' in v_src) = 0");
  });

  it('require the arm to sit inside the scope CTE rather than anywhere in the body', () => {
    expect(VERIFY).toContain("position('counts AS (' in v_src)");
  });

  it('prove the arm BEHAVIOURALLY by running the engine, not by reading it', () => {
    // A source check passes against a predicate the planner never reaches.
    expect(VERIFY).toContain('perform public.run_city_trust_recompute(false)');
    expect(VERIFY).toContain("v_fixed := (v_seo is false and v_shell = 'ghost')");
    expect(VERIFY).toContain('if not v_fixed then');
  });

  it('construct a probe row the pre-existing arms cannot see, and say so if they still can', () => {
    expect(VERIFY).toContain(
      "set seo_indexable = true, shell_status = 'real', trust_score = 40, last_verified_at = now()",
    );
    // ASSERT THE RAISE, NOT THE NEEDLE. `ZZPROBE_INCONCLUSIVE` appears TWICE -- once as the
    // precondition's raise and once in the exception handler that names it -- so a bare
    // toContain() is satisfied by the handler while the precondition itself is gutted to `null;`.
    // Caught by mutation; this is the same shape as asserting a health check's printed text
    // instead of its condition.
    expect(VERIFY).toContain("raise exception 'ZZPROBE_INCONCLUSIVE';");
    expect((VERIFY.match(/ZZPROBE_INCONCLUSIVE/g) ?? []).length).toBe(2);
    expect(VERIFY).toContain('could not isolate the new one');
  });

  it('exclude a not_a_city row from the probe, which the scope also excludes', () => {
    // Without this the probe can select a row the arm is right to ignore, and the test fails
    // against correct code.
    const probe = VERIFY.slice(
      VERIFY.indexOf('select id into v_probe'),
      VERIFY.indexOf('if v_probe is null'),
    );
    expect(probe).toContain(
      "coalesce(enrichment_status->'disposition'->>'state','') <> 'not_a_city'",
    );
  });

  it('discard the probe and require the discard to have happened', () => {
    expect(VERIFY).toContain("raise exception 'ZZPROBE_ROLLBACK'");
    expect(VERIFY).toContain('if not v_caught then');
    expect(VERIFY).toContain('did not roll back');
  });

  it('gate on the AGED key and never on the momentary level', () => {
    // Every newly created city is empty and published until content arrives, so a cron minting one
    // while the migration runs would abort `db push` repo-wide if the raw count were asserted.
    const p4 = VERIFY.slice(VERIFY.indexOf('v_sig := public.city_publication_signals()'));
    expect(p4).toContain("if (v_sig->>'empty_published_stale')::int <> 0 then");
    expect(p4).not.toMatch(/if \(v_sig->>'empty_published'\)::int <> 0 then/);
  });

  it('assert the sentinel can still see both producers', () => {
    expect(VERIFY).toContain("(v_sig->>'recompute_has_reopen_arm')::boolean");
    expect(VERIFY).toContain("(v_sig->>'resolver_sets_seo_indexable')::boolean");
  });

  it('raise on every failure rather than merely testing a condition', () => {
    // Replacing a `raise exception` with `null;` leaves every string-anchored assertion above
    // green while the postcondition has stopped failing.
    //
    // PINNED EXACTLY, not floored. A `>= 8` bound tolerated deleting one of the thirteen -- which
    // is how the P3 "was NOT deindexed" raise survived the first mutation round. This counts the
    // FILE's own structure rather than anything in the corpus, so pinning it is the same kind of
    // assertion as the exactly-once anchor count, and a later postcondition is meant to update it.
    const raises = VERIFY.match(/raise exception 'P\d/g) ?? [];
    expect(raises.length).toBe(13);
    // And the one that carries the whole behavioural claim is named, so it cannot be the one lost.
    expect(VERIFY).toContain('was NOT deindexed by ');
  });

  it('does not short-circuit itself', () => {
    expect(VERIFY).not.toMatch(/where false/);
    expect(VERIFY).not.toMatch(/if \(false\) then/);
  });
});

describe('the health section is wired and independent', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

  it('fails on a missing arm, a stale row, and a broken probe', () => {
    const sec = script.slice(script.indexOf('the published-but-empty window'));
    expect(sec).toContain('cp.recompute_has_reopen_arm !== true');
    expect(sec).toContain('empty_published_stale');
    const fails = sec.match(/^\s*FAILED = true$/gm) ?? [];
    expect(fails.length).toBeGreaterThanOrEqual(2);
  });

  it('warns rather than fails on the one-pass window', () => {
    const sec = script.slice(script.indexOf('the published-but-empty window'));
    const warnIdx = sec.indexOf('one-pass window');
    expect(warnIdx).toBeGreaterThan(-1);
    // The advisory must be a warn, not a fail: assert no FAILED assignment between the console.warn
    // and the end of that branch.
    const warnBlock = sec.slice(sec.lastIndexOf('console.warn', warnIdx), warnIdx + 200);
    expect(warnBlock).not.toContain('FAILED = true');
  });

  it('reads the arm outside the resolver-gate branch, so one cannot hide the other', () => {
    // The resolver check short-circuits its ladder with `else if`. The arm block must sit after
    // that ladder closes, guarded only by probe_ok.
    const armIdx = script.indexOf('cp.recompute_has_reopen_arm');
    const resolverIdx = script.indexOf('cp.resolver_sets_seo_indexable !== true');
    expect(armIdx).toBeGreaterThan(resolverIdx);
    expect(script.slice(0, armIdx)).toContain('if (cp.probe_ok === true) {');
  });

  it('sits before the TERMINAL exit, not after it', () => {
    // A section appended after `if (FAILED) process.exit(1)` prints its failure and still exits 0.
    // lastIndexOf, because the FIRST process.exit(1) in this script is its env guard.
    expect(script.indexOf('cp.recompute_has_reopen_arm')).toBeLessThan(
      script.lastIndexOf('process.exit(1)'),
    );
  });
});
