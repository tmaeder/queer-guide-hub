import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991792752491_tag_ontology_health_inlinable_facet.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// The header quotes nearly every phrase these tests assert on -- the OLD slow shape,
// the setting being removed, `reset search_path` as the wrong idiom -- so an unstripped
// `toContain` passes with the executable statement deleted. Strip line-LEADING comments
// only: `--` can legitimately appear inside a string literal, and a mid-line `--` would
// take the executable half of the line with it.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The DO block that rewrites the function body. */
const patchBlock = (() => {
  const a = sql.indexOf('do $patch$');
  const b = sql.indexOf('end $patch$;');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return sql.slice(a, b);
})();

/** The DO block that asserts the end state. */
const verifyBlock = (() => {
  const a = sql.indexOf('do $verify$');
  const b = sql.indexOf('end $verify$;');
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return sql.slice(a, b);
})();

describe('tag_facet_of is made inlinable, and only because it is INVOKER', () => {
  it('unpins with `reset all`, not `reset search_path`', () => {
    // Inlining tests `proconfig IS NOT NULL`, so an empty-but-present array still
    // blocks it. `reset search_path` leaves exactly that.
    expect(sql).toContain('alter function public.tag_facet_of(text) reset all;');
    expect(sql).not.toMatch(/alter function public\.tag_facet_of\(text\)\s*reset\s+search_path/i);
  });

  it('never unpins a SECURITY DEFINER function', () => {
    // Unpinning a definer is a real search_path-injection surface. Both definers in
    // this path must keep their pin, and nothing here may reset them.
    for (const fn of ['tag_ontology_health', 'tag_usage_summary_rows']) {
      expect(sql).not.toMatch(new RegExp(`alter function \\S*${fn}\\S*\\s*reset`, 'i'));
    }
  });

  it('does not restate tag_facet_of, so its body cannot be mistyped', () => {
    // A `create or replace` here would have to retype a 20-branch vocabulary; a
    // one-word slip silently reclassifies an entity type into no facet at all.
    expect(sql).not.toMatch(/create or replace function public\.tag_facet_of/i);
  });
});

describe('the two correlated-SRF arms become joins', () => {
  it('patches the live body rather than restating the function', () => {
    // The live body of a tag function is routinely NOT what the newest repo
    // migration says, so a restate built from a file silently reverts whatever
    // string surgery got there first.
    expect(patchBlock).toContain('pg_get_functiondef(p.oid)');
    expect(patchBlock).not.toMatch(/create or replace function api_private\.tag_ontology_health/i);
  });

  it('asserts every anchor count instead of hoping the replace matched', () => {
    // A silently-unmatched replace is indistinguishable from a guard that does not
    // fire. Each of the three anchors is counted and raises on a mismatch.
    const raises = patchBlock.match(/if n <> \d then raise exception/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
    expect(patchBlock).toContain(
      "if n <> 1 then raise exception 'P0 failed: active_zero_usage anchor",
    );
    expect(patchBlock).toContain("if n <> 2 then raise exception 'P0 failed: correlated subquery");
    // A patch that changed nothing must be loud, not silently successful.
    expect(patchBlock).toMatch(/if v_out = v_src then\s*\n\s*raise exception/);
  });

  it('is idempotent: an already-patched body is a no-op, not an abort', () => {
    // `db push` aborts on the first failing file and takes every migration queued
    // behind it, so an exact-match precondition here is a repo-wide blast radius.
    expect(patchBlock).toContain('v_done');
    expect(patchBlock).toMatch(/if n = 2 then\s*\n\s*raise notice/);
    expect(patchBlock).toContain('else');
  });

  it('introduces the join and removes the correlated subquery', () => {
    expect(patchBlock).toContain('left join public.tag_usage_summary s on s.id=t.id');
    expect(patchBlock).toContain("'and coalesce(s.usage_count,0)=0'");
  });
});

describe('comment stripping around pg_get_functiondef', () => {
  it('counts anchors on a comment-STRIPPED copy but rewrites the original', () => {
    // pg_get_functiondef returns the body INCLUDING its comments. Counting on the
    // raw text matches prose as well as code, which aborted `db push` on main three
    // times on 2026-09-20 and stranded the whole deploy queue -- nothing fails until
    // apply time. Stripping for the REWRITE instead would delete the function's own
    // comments from the body written back, so the two reads must stay separate.
    expect(patchBlock).toMatch(
      /v_bare\s*:=\s*regexp_replace\(v_src,\s*'--\[\^'\s*\|\|\s*chr\(10\)\s*\|\|\s*'\]\*',\s*''\s*,\s*'g'\)/,
    );
    // Every anchor count reads v_bare; none reads v_src.
    const counts = patchBlock.match(/\(length\(v_\w+\) - length\(replace\(v_\w+,/g) ?? [];
    expect(counts.length).toBeGreaterThanOrEqual(3);
    for (const c of counts) expect(c).toContain('v_bare');
    // ...while the substitutions still operate on the comment-bearing original.
    expect(patchBlock).toMatch(/v_out\s*:=\s*replace\(v_src,/);
    expect(patchBlock).not.toMatch(/v_out\s*:=\s*replace\(v_bare,/);
  });

  it('strips before asserting in the verify block too', () => {
    expect(verifyBlock).toMatch(
      /select regexp_replace\(pg_get_functiondef\(p\.oid\),\s*'--\[\^'\s*\|\|\s*chr\(10\)\s*\|\|\s*'\]\*',\s*''\s*,\s*'g'\) into v_def/,
    );
    // No raw read feeds an assertion.
    expect(verifyBlock).not.toMatch(/select pg_get_functiondef\(p\.oid\) into v_def/);
  });
});

describe('postconditions are hard on the end state', () => {
  it('requires proconfig to be NULL, not merely search_path-free', () => {
    expect(verifyBlock).toMatch(/if v_cfg is not null then\s*\n\s*raise exception 'P1 failed/);
  });

  it('refuses a volatility or security-mode change on the unpinned function', () => {
    expect(verifyBlock).toMatch(
      /if v_secdef then raise exception 'P2 failed|if v_secdef then\s*\n\s*raise exception 'P2 failed/,
    );
    expect(verifyBlock).toMatch(/v_vol <> 'i'/);
  });

  it('asserts both SECURITY DEFINER functions kept their pin AND their definer flag', () => {
    expect(verifyBlock).toContain("('api_private','tag_ontology_health')");
    expect(verifyBlock).toContain("('api_guard','tag_usage_summary_rows')");
    expect(verifyBlock).toMatch(/p\.prosecdef is false or p\.proconfig is null/);
    expect(verifyBlock).toMatch(/raise exception 'P3 failed/);
  });

  it('is the regression guard: the slow shape cannot come back', () => {
    // A later CREATE OR REPLACE that reinstates the correlated subquery, or drops a
    // join, must fail here. This is what replaces a wall-clock assertion.
    expect(verifyBlock).toContain(
      "position('(select usage_count from public.tag_usage_summary s where s.id=t.id)' in v_def) > 0",
    );
    expect(verifyBlock).toMatch(/raise exception 'P4 failed: the correlated SRF subquery/);
    expect(verifyBlock).toMatch(
      /if n <> 2 then\s*\n?\s*raise exception 'P4 failed: expected 2 joins/,
    );
  });

  it('EXECUTES the function rather than only reading its source', () => {
    // A sql/plpgsql body only parses at create time: this repo has an applied
    // RETURNS TABLE function that raised 42702 the first time it was CALLED.
    expect(verifyBlock).toContain('v := public.tag_ontology_health();');
    expect(verifyBlock).toMatch(/jsonb_object_keys\(v\)\) <> 14/);
  });

  it('proves equivalence against the old form instead of pinning a count', () => {
    // Both counts move with the corpus, so a frozen number is a precondition
    // wearing a postcondition's clothes -- it fails on correct code later.
    expect(verifyBlock).toContain('select count(*) into v_old_azu');
    expect(verifyBlock).toContain('select count(*) into v_old_hru');
    expect(verifyBlock).toContain(
      '(select usage_count from public.tag_usage_summary s where s.id=t.id)',
    );
    expect(verifyBlock).toMatch(/v->>'active_zero_usage'\)::bigint <> v_old_azu/);
    expect(verifyBlock).toMatch(/v->>'human_reviewed_unused'\)::bigint <> v_old_hru/);
  });

  it('refuses a clean-looking zero from facet_coverage', () => {
    // An unpinned predicate that silently started returning NULL would read as
    // "no facets", which is the kind of reassuring zero this repo keeps paying for.
    expect(verifyBlock).toMatch(/facet_coverage'\)::bigint, 0\) <= 0/);
    expect(verifyBlock).toMatch(/raise exception 'P6 failed/);
  });

  it('pins no count and no wall-clock threshold anywhere', () => {
    // 2718 / 2891 / 2828 were the values when this was measured; any of them in a
    // condition would fail the next time the corpus moves. And a timing RAISE can
    // fail on correct code on a loaded instance, aborting db push for the repo.
    for (const n of ['2718', '2891', '2828', '15168', '18415']) {
      expect(verifyBlock).not.toContain(n);
    }
    expect(verifyBlock).not.toMatch(/v_ms\s*>/);
    // The measured timing is still reported, just not enforced.
    expect(verifyBlock).toMatch(/raise notice/);
  });

  it('cannot be short-circuited by a constant predicate', () => {
    expect(verifyBlock).not.toMatch(/\bif\s+(true|false)\b/i);
    expect(verifyBlock).not.toMatch(/where\s+false\b/i);
  });
});
