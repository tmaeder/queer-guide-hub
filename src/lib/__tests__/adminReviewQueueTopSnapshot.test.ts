import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991792224392_admin_review_queue_top_snapshot.sql';
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const HEALTH = join(process.cwd(), 'scripts', 'check-pipeline-health.mjs');
const SPEC = join(process.cwd(), 'e2e', 'admin-inbox-renders.spec.ts');

const raw = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8');

// EVERY assertion runs over comment-STRIPPED source. This migration's header quotes, verbatim,
// the rejected per-view attribution, the three reason codes it refuses to drop, the window-function
// shape it measured at 20,640ms, and the e2e sentence it is correcting -- so an unstripped
// `toContain` would match the prose while the executable statement was gone. Line-anchored,
// because a mid-line `--` inside a string literal is not a comment.
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

/** The migration's own verify block greps for the same phrases the statements must contain, so an
 *  assertion over the whole file passes with the statement deleted. Cut it off. */
const statements = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/** The surgery block, which is where both function patches live. */
const patch = statements.slice(statements.indexOf('do $patch$'));
/** The refresher body, bounded by its own revoke. */
const refresher = statements.slice(
  statements.indexOf('function public.refresh_admin_review_queue_top'),
  statements.indexOf('revoke all on function public.refresh_admin_review_queue_top'),
);

describe('the migration exists under a clock-allocated version', () => {
  it('is present', () => {
    expect(readdirSync(MIGRATIONS)).toContain(MIGRATION);
  });
  it('carries a 14-digit version allocated by the clock, not picked by hand', () => {
    expect(MIGRATION).toMatch(/^9999\d{10}_/);
  });
  it('bounds the refresher slice so the assertions below are not vacuous', () => {
    expect(refresher.length).toBeGreaterThan(800);
    expect(patch.length).toBeGreaterThan(800);
  });
});

describe('the refresher executes the union ONCE', () => {
  it('builds exactly one union and materializes it', () => {
    // The obvious shape -- one statement per (scope,sort) -- re-executes the 41-branch union
    // fifteen times. A single pass is ~950ms warm, so that alone is a 14s tick.
    expect(occurrences(refresher, 'string_agg(format(')).toBe(1);
    expect(refresher).toContain('with authorized as materialized (');
  });

  it('takes a TRY advisory lock, not a blocking one', () => {
    // A skipped tick is free; a queued pg_cron worker turns a stall into a pile-up.
    expect(refresher).toContain("pg_try_advisory_xact_lock(hashtext('admin_review_queue_top'))");
    expect(refresher).not.toMatch(/pg_advisory_xact_lock\s*\(/);
  });

  it('ranks an ALREADY-BOUNDED subquery, never the whole partition', () => {
    // THE DEFECT THIS CATCHES WAS MEASURED, NOT IMAGINED. A window function sorts its entire
    // partition and no LIMIT can be pushed through it, so `row_number() over (order by ...)` with
    // the LIMIT at the same level is fifteen full sorts of 335k rows: 20,640ms on prod against
    // 5,871ms for the nested form. Both spellings parse, both return identical rows, and nothing
    // but a clock tells them apart -- which is why the shape is asserted here.
    const lateral = refresher.slice(refresher.indexOf('cross join lateral ('));
    expect(lateral).toContain('row_number() over (');
    // The ranked relation must be a subquery that already carries the LIMIT.
    expect(lateral).toMatch(/from \(\s*select t\.\* from authorized t/);
    expect(lateral).toMatch(/limit %s\s*\)\s*sub/);
    // ...and the window must rank `sub`, not `authorized` directly.
    expect(lateral).toMatch(/row_number\(\) over \([\s\S]*?sub\.urgency_rank/);
    expect(lateral).not.toMatch(/row_number\(\) over \([\s\S]{0,400}?\bt\.urgency_rank/);
  });
});

describe('the refresher is the relocated UNION type-mismatch canary', () => {
  // Serving page 1 from a snapshot takes the union off the landing request, where a plan-time
  // mismatch used to surface (one took the page down for six weeks). The protection survives ONLY
  // if this projection stays column-for-column with get_admin_review_queue's union. The counts
  // refresher cannot substitute: it projects four columns, so a mismatch in title or
  // confidence_score passes it.
  it('projects every column the function union projects', () => {
    for (const col of [
      'u.id',
      'u.queue_type',
      'u.content_type',
      'u.title',
      'u.subtitle',
      'u.created_at',
      'u.confidence_score',
      'urgency_rank',
      'source_label',
      'public_impact',
      'sla_hours',
      'priority_weight',
      'can_reopen',
    ]) {
      expect(refresher).toContain(col);
    }
  });

  it('reads every active source, unfiltered by role', () => {
    // A role filter here would make the canary depend on who last ran it, and would leave a source
    // out of the snapshot that the function will happily serve from the live path.
    expect(refresher).toContain('from public.admin_review_sources r');
    expect(refresher).toContain('where r.active');
    expect(refresher).not.toContain('has_role_jwt');
  });
});

describe('the snapshot stores ordering, never content', () => {
  const table = statements.slice(
    statements.indexOf('create table if not exists public.admin_review_queue_top'),
    statements.indexOf('comment on table public.admin_review_queue_top'),
  );

  it('has no column that could publish a stale title', () => {
    // `d.item || to_jsonb(s)` makes the snapshot side win, so storing any of these would serve a
    // stale value over the fresh one the details CTE just read.
    expect(table.length).toBeGreaterThan(200);
    for (const col of ['title', 'subtitle', 'content_type', 'confidence_score']) {
      expect(table).not.toMatch(new RegExp(`^\\s+${col}\\b`, 'm'));
    }
  });

  it('stores the registry-derived metadata the live view cannot supply', () => {
    for (const col of [
      'urgency_rank',
      'source_label',
      'risk',
      'public_impact',
      'sla_hours',
      'priority_weight',
      'can_reopen',
      'is_finding',
    ]) {
      expect(table).toMatch(new RegExp(`^\\s+${col}\\b`, 'm'));
    }
  });

  it('is unreadable by anon and authenticated', () => {
    // Read through the SECURITY DEFINER function only, exactly like admin_review_queue_counts.
    expect(statements).toContain(
      'alter table public.admin_review_queue_top enable row level security',
    );
    expect(statements).toContain(
      'revoke all on public.admin_review_queue_top from anon, authenticated',
    );
  });
});

describe('PATCH 1 is gone, and the property it guarded is guarded elsewhere', () => {
  // The two assertions that used to live here tested PATCH 1's replacement text and its
  // no-op raise. PATCH 1 was DELETED because 99991792213011 landed between this migration
  // being cut and being pushed and did the same job with a strictly narrower emit
  // condition, so the anchor was legitimately gone and its raise fired and blocked db push
  // 9 migrations deep. Deleting the assertions is relocation, not a weakening: the property
  // is still asserted, on the migration that now owns it —
  // src/lib/__tests__/adminReviewQueueScopePushdown.test.ts, which pins the exact
  // `where not exists(... f.queue_key=%L and f.subtitle_match=u.subtitle)` predicate and
  // the `p_scope=''decisions''` condition. Verified passing (12/12) alongside this change.
  it('no longer carries a PATCH 1, so nothing here may assert one', () => {
    expect(patch).not.toContain("raise exception 'PATCH 1 replaced nothing");
    expect(patch).not.toMatch(/v_anchor := '%L::boolean can_reopen/);
  });

  it('SEARCHES the raw body nowhere — now the only surviving half of the old test', () => {
    // NO position()/strpos()/LIKE OVER pg_get_functiondef's OUTPUT. scripts/
    // check-functiondef-asserts.mjs bans it because that output includes the function's
    // comments; it aborted db push on main three times in one day. The patch block cannot
    // strip them (it must execute the RAW body), so there is no pre-check at all and
    // `v_new = v_src` is the stronger invariant.
    //
    // WIDENED FROM `position(v_anchor in v_src)` TO ANY position() OVER v_src, because the
    // narrow form has a hole this change walked straight into: a first draft of the PATCH 1
    // fix used `position('<literal string>' in v_src)`, which is the same defect and which
    // the v_anchor-anchored pattern does not match. check-functiondef-asserts.mjs would not
    // have caught it either — it only inspects NEW migrations, and this was an edit to an
    // existing one. The ban now covers PATCH 2 as well, which the original header also
    // declared pre-check-free ("HERE OR IN PATCH 2").
    expect(patch).not.toMatch(/position\s*\([^)]*\bin\s+v_src\s*\)/);
    expect(patch).not.toMatch(/\bstrpos\s*\(\s*v_src/);
    expect(patch).not.toMatch(/v_src\s+(?:not\s+)?i?like/i);
  });
});

describe('PATCH 2 serves an unfiltered page from the snapshot', () => {
  it('is gated to requests the snapshot can actually answer', () => {
    // A filtered request already prunes the union by branch and is fast -- measured, a single
    // queue is 240-296ms against 3-12s unfiltered -- so caching it would add staleness for nothing.
    expect(patch).toContain(
      'p_queue_types is null and p_content_types is null and v_search is null',
    );
    expect(patch).toContain('v_page*v_size <= public.admin_review_queue_top_depth()');
    expect(patch).toContain(
      'exists (select 1 from public.admin_review_queue_top t where t.scope=p_scope and t.sort=p_sort)',
    );
  });

  it('INNER joins details so a row decided since the refresh disappears', () => {
    // The live path LEFT joins. Keeping that here would render a decided row with snapshot
    // metadata and no content -- worse than the page briefly showing fewer than 50 items.
    expect(patch).toContain(
      'from sorted s join details d on d.queue_type=s.queue_type and d.id=s.id',
    );
    expect(patch).not.toContain('from sorted s left join details d');
  });

  it('recomputes overdue from now() instead of trusting the snapshot', () => {
    // overdue is a function of now(); a stored value is wrong within one refresh interval.
    expect(patch).toContain(
      't.sla_hours is not null and t.created_at < now()-make_interval(hours=>t.sla_hours)',
    );
  });

  it('reuses get_admin_review_summary rather than duplicating the totals half', () => {
    // Duplicating all_total/decisions_total/findings_total/overdue_total/safety_total/sources is
    // a drift surface; that function already serves them from the same counts cache.
    expect(patch).toContain('return public.get_admin_review_summary()');
  });

  it('RAISES if it replaced nothing, carrying the diagnosis', () => {
    expect(patch).toContain("raise exception 'PATCH 2 replaced nothing");
    expect(patch).toMatch(/PATCH 2 replaced nothing[\s\S]{0,200}Re-cut it/i);
  });
});

describe('the migration asserts its own postconditions', () => {
  it('fails if either patch is missing from the live function', () => {
    expect(verify).toContain('admin_review_finding_codes f where f.queue_key=%L');
    expect(verify).toContain('public.admin_review_queue_top t where t.scope=p_scope');
    expect(occurrences(verify, 'raise exception')).toBeGreaterThanOrEqual(3);
  });

  it('strips comments before those PRESENCE checks', () => {
    // Both assertions above are presence checks over pg_get_functiondef's output, which includes
    // the function's own comments — so unstripped they go falsely GREEN when the symbol exists
    // only in prose, which is the silent half of the defect check-functiondef-asserts.mjs bans
    // and the dangerous one. Both patches insert into a function other sessions comment heavily.
    expect(verify).toMatch(/regexp_replace\(\s*pg_get_functiondef\(p\.oid\)/);
    expect(verify).not.toMatch(/select\s+pg_get_functiondef\(p\.oid\)\s+into\s+v_src/);
  });

  it('fails if the refresher is not scheduled', () => {
    // A snapshot written once by hand and then left to rot is worse than no snapshot: the read
    // path keeps serving it, and the staleness is invisible from the page.
    expect(verify).toContain("jobname='admin_review_queue_top_refresh' and active");
  });

  it('registers the cron in admin_automations, not only in pg_cron', () => {
    // An unregistered cron is invisible to sync_automations_to_cron and to every health surface
    // that reads the registry.
    expect(statements).toContain('insert into public.admin_automations');
    expect(statements).toContain("'admin_review_queue_top_refresh'");
  });

  it('supplies admin_automations.trigger, which is NOT NULL with no default', () => {
    // THIS DEFECT SHIPPED AND WAS CAUGHT ONLY BY DRY-RUNNING THE INSERT AGAINST PROD. Omitting
    // `trigger` raises 23502 at apply time, which aborts db push and takes every migration queued
    // behind it -- a repo-wide blast radius from one missing column. The SQL parses, the column
    // list looks complete, and every other assertion here passed. Nothing short of executing it
    // against the real table could see it, which is why the column is named explicitly.
    const insert = statements.slice(
      statements.indexOf('insert into public.admin_automations'),
      statements.indexOf('where not exists (select 1 from public.admin_automations'),
    );
    expect(insert.length).toBeGreaterThan(200);
    expect(insert).toMatch(/\(\s*slug,[^)]*\btrigger\b/);
    expect(insert).toContain("jsonb_build_object('type','schedule')");
  });
});

describe('the sentinel is wired, and gates on the things that rot', () => {
  const health = readFileSync(HEALTH, 'utf8');
  const block = health.slice(health.indexOf('/rest/v1/rpc/admin_review_top_signals'));

  it('is called by check-pipeline-health', () => {
    // A signals function nobody calls is the "shipped and wired to nothing" failure this repo
    // keeps recording.
    expect(health).toContain('/rest/v1/rpc/admin_review_top_signals');
    expect(block.length).toBeGreaterThan(500);
  });

  it('is service_role only', () => {
    // A DEFINER aggregate granted to `authenticated` is granted to every member.
    expect(statements).toContain(
      'revoke all on function public.admin_review_top_signals() from public, anon, authenticated',
    );
    expect(statements).toContain(
      'grant execute on function public.admin_review_top_signals() to service_role',
    );
  });

  it('reports the denominator before the verdict', () => {
    // An empty snapshot, a revoked grant and a healthy one all report 0 stale.
    expect(block).toContain('probe_ok');
    expect(block).toMatch(/review queue page-1 snapshot: \$\{rows\}/);
  });

  it('hard-fails on an empty snapshot, a dead cron and a stale snapshot', () => {
    expect(block).toMatch(/rows <= 0[\s\S]{0,600}FAILED = true/);
    expect(block).toMatch(/refresh_cron_active[\s\S]{0,600}FAILED = true/);
    expect(block).toMatch(/age > 3600[\s\S]{0,900}FAILED = true/);
  });

  it('only WARNS on a missing (scope,sort) combination', () => {
    // A scope with no rows legitimately produces no snapshot entry and falls through to the live
    // path, which returns the same empty list quickly. Failing on it would be cry-wolf.
    //
    // THE BOUND HERE IS LOAD-BEARING AND THE OBVIOUS ONE IS VACUOUS. Slicing to the first `}`
    // ends at the brace inside `${combos}`, leaving ~15 characters to assert over -- a mutation
    // that injected `FAILED = true` into this very branch SURVIVED that version. Bound on the
    // next sibling branch instead, and assert the slice is big enough to contain the warning.
    const start = block.indexOf('combos < 15');
    const end = block.indexOf('age > 600');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const combos = block.slice(start, end);
    expect(combos.length).toBeGreaterThan(200);
    expect(combos).toContain('console.warn');
    expect(combos).not.toContain('FAILED = true');
  });
});

describe('the e2e spec no longer claims the landing request executes every view', () => {
  const spec = readFileSync(SPEC, 'utf8');

  it('retracts the stale canary claim', () => {
    // The old sentence passes either way, which is exactly why it had to be corrected rather than
    // left to be re-derived from a green run.
    expect(spec).not.toContain('is caught here exactly as before');
    expect(spec).toContain('THIS REQUEST IS NO LONGER THE UNION CANARY');
  });

  it('names where the canary went', () => {
    expect(spec).toContain('refresh_admin_review_queue_top');
    expect(spec).toContain('admin_review_top_signals');
  });

  it('keeps asserting both total contracts', () => {
    // The scope contracts are untouched by this change and must stay asserted.
    expect(spec).toContain('expect(data.total).toBe(data.decisions_total)');
    expect(spec).toContain('expect(data.total).toBe(data.all_total)');
  });
});
