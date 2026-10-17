import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792216385 — the per-branch top-N on get_admin_review_queue().
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SQL, and that is load-bearing rather than
 * tidy. The migration's header quotes essentially every phrase this file asserts on —
 * `p_scope='all'`, `coalesce(qc.n,0)>10000`, the per-mode ORDER BY keys — because it
 * explains them. An unstripped `toContain` would therefore pass with the executable
 * statement deleted, which is the vacuous assertion this repo has recorded repeatedly.
 */

const MIGRATION = '99991792216385_admin_review_queue_branch_topn.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Comments at LINE START only — the house stripper. Sufficient here because every comment
// in this migration is a full line.
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('do $arm$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('the patch is anchored, not restated', () => {
  it('derives the body from pg_get_functiondef rather than writing a CREATE OR REPLACE', () => {
    // Restating the body would silently revert 99991792213011, which patches the same two
    // string_agg calls and is in flight.
    expect(patch).toContain('pg_get_functiondef(p.oid)');
    expect(patch).not.toMatch(/create or replace function public\.get_admin_review_queue/i);
  });

  it('requires each of the four anchors exactly once, and RAISES otherwise', () => {
    // Asserting the condition is not enough when `raise exception` can be replaced by
    // `null;` — a recorded survivor class. Count the raises that enforce it.
    const exactlyOnce = patch.match(/if n <> 1 then raise exception/g) ?? [];
    expect(exactlyOnce.length).toBe(4);
    // A zero-match replace() ships a no-op reporting success; a two-match one would wrap
    // the details union as well.
    expect(patch).toContain('P0 failed: patch was a no-op');
  });

  it('keeps the union-tail anchor form-independent by excluding the closing paren', () => {
    // THIS is what lets the migration compose with 99991792213011 in either merge order:
    // that migration changes format()'s ARGUMENTS, so an anchor that began at the paren
    // closing format() would still match, but one that included the preceding arguments
    // would not. The anchor must start at the comma.
    expect(patch).toMatch(/a2\s*:=\s*\$a2\$,' union all '/);
    expect(patch).not.toMatch(/a2\s*:=\s*\$a2\$\)/);
  });
});

describe('the pushdown is gated where it is unsound', () => {
  it('fires only for p_scope=all', () => {
    // The scope predicate is applied AFTER the union, so limiting a branch first would
    // drop rows the filter would have kept. Only `all` has a `true` predicate.
    expect(patch).toContain("v_topn := p_scope='all'");
  });

  it('fires only with no queue, content or search filter', () => {
    // With any filter set, `total` is reported as count(*) from `filtered`, which a
    // per-branch limit makes wrong. Each of these reads as a harmless simplification.
    for (const guard of ['p_queue_types is null', 'p_content_types is null', 'v_search is null']) {
      expect(patch).toContain(guard);
    }
  });

  it('empties both wrapper halves when the gate is off', () => {
    expect(patch).toMatch(/else v_pre := ''; v_post := ''; end if;/);
  });
});

describe('the size gate', () => {
  it('reads the counts cache through a LEFT join', () => {
    // An inner join would DROP every source with no counts row from the union entirely —
    // a correctness landmine, not a tuning choice.
    expect(patch).toContain(
      'left join public.admin_review_queue_counts qc on qc.queue_key=r.queue_key',
    );
    expect(patch).not.toMatch(/\binner join public\.admin_review_queue_counts/);
  });

  it('fails safe on a missing or uncomputed count', () => {
    // coalesce(...,0) > threshold means "no count row" leaves the branch unwrapped, i.e.
    // exactly the pre-migration behaviour. Dropping the coalesce makes the comparison
    // NULL, which is also falsy — but a later rewrite to `qc.n <= 10000` would then wrap
    // precisely the branches that must not be wrapped.
    expect(patch).toContain('coalesce(qc.n,0)>10000');
  });

  it('applies the gate to BOTH wrapper halves, or the SQL is unbalanced', () => {
    // A prefix without its suffix emits `(select * from (<branch>` with no closing paren
    // and no limit — a syntax error that only appears when the function is CALLED.
    const hits = patch.match(/coalesce\(qc\.n,0\)>10000/g) ?? [];
    expect(hits.length).toBe(2);
    expect(patch).toMatch(/coalesce\(qc\.n,0\)>10000 then v_pre else ''/);
    expect(patch).toMatch(/coalesce\(qc\.n,0\)>10000 then v_post else ''/);
  });

  it('keeps the threshold in the measured gap between the tail and the big three', () => {
    // Measured: business-quality 258,052, event-quality 35,062, general-review 24,362,
    // then geography 1,869 and a tail of 37 sources at <=294. Any threshold in
    // ~2,000..24,000 picks the same three branches. A value below the tail would wrap all
    // 41, which measured 42,653 blocks WORSE on the small branches for no gain.
    const m = patch.match(/coalesce\(qc\.n,0\)>(\d+)/);
    expect(m).not.toBeNull();
    const threshold = Number(m![1]);
    expect(threshold).toBeGreaterThan(1869);
    expect(threshold).toBeLessThan(24362);
  });
});

describe('the branch ordering is the global ordering restricted to the branch', () => {
  it('emits a concrete ORDER BY per sort mode, not the outer CASE ladder', () => {
    // The outer query's `case when $4='priority' then ... end` keys are opaque to the
    // planner; a branch carrying them cannot be index-served.
    expect(patch).not.toMatch(/\$4='priority'/);
    expect(patch).toMatch(/case p_sort\s*\n?\s*when 'priority' then/);
  });

  it('keeps every key of all three modes', () => {
    // A mode whose key silently collapsed to created_at would page in the wrong order
    // while every other assertion here still passed.
    expect(patch).toContain(
      "when 'priority' then 'urgency_rank desc,(sla_hours is not null and created_at<now()-make_interval(hours=>sla_hours)) desc,priority_weight desc,created_at asc nulls last,queue_type,id'",
    );
    expect(patch).toContain(
      "when 'confidence' then 'confidence_score asc nulls last,created_at asc nulls last,queue_type,id'",
    );
    expect(patch).toContain("else 'created_at asc nulls last,queue_type,id' end");
  });

  it('ends every key with id, so the order is total and the top-N theorem holds', () => {
    // Without a unique tail the per-branch top-N and the global top-N can disagree on
    // ties, and the union of per-branch top-Ns stops being a superset of the global one.
    const keys = patch.match(/then '[^']*queue_type,id'/g) ?? [];
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(patch).toMatch(/else 'created_at asc nulls last,queue_type,id'/);
  });

  it('sizes the limit to cover the requested page, not just one page', () => {
    // A bare `limit v_size` returns the wrong rows for page 2 onward: the outer OFFSET
    // would skip into rows the branches never emitted.
    expect(patch).toContain('v_size::bigint*v_page');
  });
});

describe('postconditions', () => {
  it('every one of P0..P5 RAISES, counted EXACTLY per label', () => {
    // Exact counts, not `toContain` and not a `>=` floor. P1 raises three times and P4
    // and P5 twice each, so replacing ONE of them with `null;` leaves the label behind in
    // its siblings and leaves any floor satisfied — mutation-tested, and that is exactly
    // how the first draft of this check let a gutted P1 through. A deliberate new
    // postcondition is expected to update the number here.
    const expected: Record<string, number> = {
      P0: 6,
      P1: 3,
      P2: 1,
      P3: 1,
      P4: 2,
      P5: 2,
    };
    for (const [label, count] of Object.entries(expected)) {
      const hits = sql.match(new RegExp(`raise exception '${label} failed`, 'g')) ?? [];
      expect(hits.length, `${label} raises`).toBe(count);
    }
  });

  it('P4 asserts the definer settings survived the CREATE OR REPLACE', () => {
    // A rewrite that loses SECURITY DEFINER turns every queue read into a permission
    // error; one that loses search_path is a hijack surface.
    expect(verify).toContain('p.prosecdef');
    expect(verify).toContain("p.provolatile='s'");
    expect(verify).toContain("array['search_path=public, pg_temp']");
    expect(verify).toContain('Review queue requires a staff account');
  });

  it('P5 is behavioural, because CREATE OR REPLACE only parses a plpgsql body', () => {
    // A broken generated query raises on the first CALL; no source assertion can see it.
    expect(verify).toMatch(/select public\.get_admin_review_queue\([^)]*'all'\) into v_res/);
    expect(verify).toContain("v_res->>'all_total'");
  });

  it('P5 carves out ONLY a timeout, never a real error', () => {
    // 57014 can only happen after a successful parse+plan, so tolerating it cannot hide a
    // syntax error. Tolerating `others` would hide every defect this check exists for.
    expect(verify).toContain('when query_canceled then');
    const p5 = verify.slice(verify.indexOf('into v_res'));
    expect(p5).not.toMatch(/when others then/);
  });

  it('arms the timeout in its own statement, since set_config cannot re-arm mid-statement', () => {
    // A statement_timeout is armed when a statement starts, so setting it inside the
    // verify block would not bound the verify block — a recorded no-op. And a file-level
    // `set local` is discarded by db push.
    const armIdx = sql.indexOf('do $arm$');
    const verifyIdx = sql.indexOf('do $verify$');
    expect(armIdx).toBeGreaterThan(0);
    expect(verifyIdx).toBeGreaterThan(armIdx);
    expect(sql).toMatch(
      /do \$arm\$ begin perform set_config\('statement_timeout', '\d+s', true\); end \$arm\$;/,
    );
  });

  it('no postcondition is short-circuited', () => {
    expect(verify).not.toMatch(/where false/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    // A pre-seeded counter would make a `<> 2` check pass with nothing counted.
    expect(verify).not.toMatch(/v_cnt\s+integer\s*:=/);
  });
});
