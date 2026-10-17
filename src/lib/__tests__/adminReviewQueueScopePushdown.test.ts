import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792213011 — the decisions scope filters inside each branch.
 *
 * Over COMMENT-STRIPPED SQL, which is load-bearing here rather than tidy: the
 * migration's header quotes every phrase this file asserts on, INCLUDING the
 * removals it explicitly refuses to make ("drops the now-redundant left join",
 * "hardcodes `false as is_finding`"). An unstripped `toContain` would happily pass
 * against a statement that had been deleted.
 */

const MIGRATION = '99991792213011_admin_review_queue_scope_pushdown_and_topn.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('the pushdown itself', () => {
  it('filters inside the branch, keyed on that branch own queue', () => {
    expect(patch).toContain(
      'where not exists(select 1 from public.admin_review_finding_codes f where f.queue_key=%L and f.subtitle_match=u.subtitle)',
    );
    // %L, not %s: the queue key is a literal and must be quoted by format().
    expect(patch).toMatch(/f\.queue_key=%L/);
  });

  it('decides which queues to push down FROM THE TABLE, never a hardcoded list', () => {
    // 24 code rows over 3 queue keys today. A fourth queue gaining a finding code must
    // start being pushed down with no code change, and a list would silently not.
    expect(patch).toContain(
      'exists(select 1 from public.admin_review_finding_codes fc where fc.queue_key=r.queue_key)',
    );
    for (const key of ['business-quality', 'event-quality', 'general-review']) {
      expect(patch).not.toContain(key);
    }
  });

  it('applies only to the decisions scope', () => {
    expect(patch).toContain("p_scope=''decisions''");
  });

  it('patches via an exactly-once anchor rather than restating the body', () => {
    // The live body is not what any repo file says; restating it is how a later
    // migration silently reverts an earlier one.
    expect(patch).toContain('pg_get_functiondef');
    expect(patch).toMatch(/v_hits\s*<>\s*1/);
    expect(patch).toMatch(/raise exception 'anchor matched/);
    // The sibling v_details builder ends in the same table reference, so a loose
    // anchor would patch the wrong one.
    expect(patch).toContain('r.can_reopen,r.view_name)');
  });
});

describe('what it promises NOT to touch', () => {
  it('keeps the finding-codes join and is_finding', () => {
    // `items` is `d.item||to_jsonb(s)`, so dropping the column removes a key from the
    // API payload. Measured: removing the join buys 0.95x on `all` — nothing — so the
    // only thing it would achieve is the silent contract change.
    expect(verify).toContain('left join public.admin_review_finding_codes f');
    expect(verify).toContain('(f.queue_key is not null) as is_finding');
    expect(verify).toMatch(/P2 failed: the finding-codes join was removed/);
    expect(verify).toMatch(/P2 failed: is_finding is no longer computed/);
  });

  it('keeps the OUTER decisions predicate, which is what makes this safe', () => {
    // Filtering twice with the same predicate cannot change a result set, so
    // equivalence does not rest on the pushdown having enumerated the right queues.
    expect(verify).toContain("else ''not u.is_finding'' end");
    expect(verify).toMatch(/P2 failed: the outer decisions predicate was dropped/);
  });

  it('asserts the ORDER BY and the counts cache are untouched', () => {
    expect(verify).toContain("case when $4=''priority'' then urgency_rank else 0 end desc");
    expect(verify).toContain('admin_review_queue_counts');
  });

  it('asserts the role gate survives, both the check and the raise', () => {
    // A SECURITY DEFINER queue that stopped checking is the one regression here that
    // would not look like a bug.
    expect(verify).toContain(
      "has_any_role_jwt(array[''admin'',''moderator'',''editor'']::public.app_role[])",
    );
    expect(verify).toContain('Review queue requires a staff account');
    expect(verify).toMatch(/P3 failed/);
  });
});

describe('postconditions', () => {
  it('every P1..P4 RAISES rather than merely being present', () => {
    // Asserting a condition is not enough when the raise can be replaced with `null;`.
    expect((verify.match(/raise exception/g) ?? []).length).toBe(13);
    for (const label of ['P1 failed', 'P2 failed', 'P3 failed', 'P4 failed']) {
      expect(verify).toContain(label);
    }
  });

  it('P4 CALLS the function, because CREATE OR REPLACE only parses a plpgsql body', () => {
    // A broken generated query compiles cleanly and fails on the first call — how the
    // 42601 in the top-N draft behaved, and the 42702 in 99991791872772 before it.
    expect(verify).toMatch(/v_res := public\.get_admin_review_queue\(p_scope => 'decisions'\)/);
    // A migration carries no JWT, so it must claim admin or P4 raises 42501 and the
    // check would be vacuous.
    expect(verify).toMatch(
      /set_config\('request\.jwt\.claims'[\s\S]{0,80}user_role[\s\S]{0,40}admin/,
    );
    // Non-decisions scopes share the branch builder, so they are exercised too.
    expect(verify).toMatch(/p_scope => 'all'/);
    expect(verify).toMatch(/p_sort => 'confidence'/);
  });

  it('is not short-circuited', () => {
    expect(verify).not.toMatch(/\bif\s+false\s+then/i);
    expect(verify).not.toMatch(/\bwhere false\b/i);
  });

  it('does NOT add a per-branch limit — that part is unverified and sort-dependent', () => {
    // The top-N pushdown only pays where an index can serve the branch ordering, and
    // is actively worse for p_sort='confidence'. Deliberately out of scope; a later
    // pass must re-measure rather than assume it helps.
    expect(sql).not.toMatch(/order by %s limit/);
    expect(sql).not.toMatch(/v_order_branch/);
  });
});
