import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991791631907_logo_platform_signals_inlinable_predicate.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// The header quotes almost every phrase these tests assert on -- including the OLD slow
// shape and the settings being removed -- so an unstripped `toContain` passes with the
// executable statement deleted. Strip line-leading comments only; `--` can legitimately
// appear inside a string literal.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** Slice one `create or replace function` body out of the file by name. */
function fnBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start).toBeGreaterThan(-1);
  // plpgsql bodies use $function$, sql bodies use $$ -- take whichever closes first.
  const ends = ['$$;', '$function$;'].map((d) => sql.indexOf(d, start)).filter((i) => i > -1);
  return sql.slice(start, Math.min(...ends));
}

const sentinel = fnBody('logo_platform_signals');

describe('logo_platform_signals: inlinable predicate', () => {
  it('unpins all four SECURITY INVOKER helpers, because a non-null proconfig blocks inlining', () => {
    // RESET ALL, not RESET search_path: inlining tests `proconfig IS NOT NULL`, so an
    // empty-but-present array would still block it.
    const resets = sql.match(/alter function public\.\w+\(text\) reset all;/g) ?? [];
    expect(resets).toHaveLength(4);
    for (const fn of [
      'website_host',
      'logo_mark_sha256',
      'platform_website_class',
      'logo_mark_denied',
    ]) {
      expect(sql).toContain(`alter function public.${fn}(text) reset all;`);
    }
  });

  it('never unpins the SECURITY DEFINER sentinel', () => {
    // Unpinning a definer is a real search_path-injection surface. The sentinel must keep it.
    expect(sql).not.toMatch(/alter function public\.logo_platform_signals\(\)\s*reset/i);
    expect(sentinel).toMatch(/security definer/);
    expect(sentinel).toMatch(/set search_path to 'public'/);
  });

  it('defines the match rule once, with no FROM clause and no SET clause', () => {
    const body = fnBody('logo_platform_domain_matches');

    // A FROM clause makes a scalar SQL function un-inlinable, which is the entire defect.
    expect(body).not.toMatch(/\bfrom\b/i);
    // A SET clause (proconfig) disqualifies inlining outright.
    expect(body).not.toMatch(/\bset\s+search_path/i);
    expect(body).toMatch(/\bimmutable\b/);
    // Both match modes survive, anchored as the original was.
    expect(body).toContain("when 'label'");
    expect(body).toContain('string_to_array(p_host');
    expect(body).toContain("when 'suffix'");
    expect(body).toContain("p_host like '%.' || p_value");
    expect(body).toMatch(/else\s+false/);
  });

  it('routes platform_website_class through the one predicate rather than restating it', () => {
    const body = fnBody('platform_website_class');
    expect(body).toContain('public.logo_platform_domain_matches(h.host, d.match_mode, d.value)');
    // The old inline predicate must be gone from this body, or the rule exists twice.
    expect(body).not.toContain("d.match_mode = 'label'");
    expect(body).not.toContain("d.match_mode = 'suffix'");
    // Determinism and signature are unchanged.
    expect(body).toContain('order by d.match_mode, d.value');
    expect(body).toContain('limit 1');
    expect(body).toMatch(/\bstable\b/);
  });

  it('materializes host and sha once per row', () => {
    // Without `as materialized` the host regex is evaluated once per VOCABULARY ROW
    // (507k regex chains) and the rewrite measured SLOWER than the original.
    const materialized = sentinel.match(/as materialized/g) ?? [];
    expect(materialized).toHaveLength(3);
  });

  it('calls no per-row FROM-bearing helper from the sentinel', () => {
    // These two can never inline, so calling either per row is what cost 91 s.
    expect(sentinel).not.toContain('platform_website_class(');
    expect(sentinel).not.toContain('logo_mark_denied(');
    // The vocabulary is joined instead.
    expect(sentinel).toContain('public.logo_platform_domain_matches(h.host');
    expect(sentinel).toContain('public.logo_platform_domain_matches(v.host');
    expect(sentinel).toContain('d.sha256 = m.sha');
  });

  it('preserves the grouping and HAVING of unknown_platform_groups byte-for-byte', () => {
    // The rewrite changes only the per-row predicate; a changed threshold would silently
    // redefine what the sentinel reports.
    expect(sentinel).toContain('group by logo_url');
    expect(sentinel).toContain('>= 4');
    const regdom = "(string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]";
    // Once in the select list, once in the HAVING.
    expect(
      (sentinel.match(new RegExp(regdom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(sentinel).toContain('order by n desc');
  });

  it('P1 carries a positive control, because every live count is zero', () => {
    const p1 = sql.slice(sql.indexOf('do $p1$'), sql.indexOf('do $p1b$'));
    // Equivalence against the independent old body...
    expect(p1).toContain('public.platform_website_class(website) is not null');
    expect(p1).toContain('is distinct from');
    // ...and the control that stops "0 disagreements" passing on a dead predicate.
    expect(p1).toMatch(/if\s+v_new\s*<\s*100\s+then/);
    // Assert the CONDITIONS, not the messages: replacing a raise with null; must fail.
    expect((p1.match(/raise exception/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(p1).toMatch(/if\s+v_bad\s*<>\s*0\s+then/);
    expect(p1).toMatch(/if\s+v_old\s*<>\s*v_new\s+then/);
  });

  it('P1b proves the denied-mark path on a synthetic positive', () => {
    const p1b = sql.slice(
      sql.indexOf('do $p1b$'),
      sql.indexOf('create or replace function public.platform_website_class'),
    );
    // The corpus count is legitimately 0, so a zero proves nothing on its own.
    expect(p1b).toContain('public.logo_mark_denied(v_url)');
    expect(p1b).toContain('d.sha256 = public.logo_mark_sha256(v_url)');
    expect(p1b).toMatch(/if\s+not\s+v_ok\s+then/);
    expect(p1b).toContain('raise exception');
  });

  it('P2 asserts byte-identical output and refuses a degenerate document', () => {
    const p2 = sql.slice(sql.indexOf('do $p2$'), sql.indexOf('do $p3$'));
    expect(p2).toContain('v_before is distinct from v_after');
    expect(p2).toMatch(/if\s+v_before\s+is\s+null\s+then/);
    // A snapshot over an empty vocabulary makes every count below it vacuous.
    expect(p2).toMatch(/vocabulary_size'\)::int\s*<=\s*0/);
    for (const key of [
      'probe_ok',
      'platform_logo_rows',
      'denied_mark_rows',
      'unknown_platform_groups',
    ]) {
      expect(p2).toContain(`? '${key}'`);
    }
  });

  it('P3 and P4 are complementary, so neither is satisfied by breaking the other', () => {
    const p3 = sql.slice(sql.indexOf('do $p3$'), sql.indexOf('do $p4$'));
    const p4 = sql.slice(sql.indexOf('do $p4$'));

    // P3: the four helpers must be unpinned.
    expect(p3).toContain('p.proconfig is not null');
    expect(p3).toMatch(/if\s+v_pinned\s+is\s+not\s+null\s+then/);
    for (const fn of [
      'website_host',
      'logo_mark_sha256',
      'platform_website_class',
      'logo_mark_denied',
    ]) {
      expect(p3).toContain(`'${fn}'`);
    }

    // P4: the sentinel must stay pinned, definer, and service_role-only -- so "unpin
    // everything" cannot be used to make P3 pass.
    expect(p4).toContain("array['search_path=public']");
    expect(p4).toMatch(/if\s+not\s+coalesce\(v_secdef,\s*false\)\s+then/);
    expect(p4).toMatch(/in\s*\(\s*'anon'\s*,\s*'authenticated'\s*,\s*'-'\s*\)/);
    expect(p4).toMatch(/if\s+v_leak\s+is\s+not\s+null\s+then/);
  });

  it('pins no row count, since the corpus moves between measuring and applying', () => {
    // A postcondition asserting a total fails on correct code the next time ingest runs.
    expect(sql).not.toMatch(/=\s*6502\b/);
    expect(sql).not.toMatch(/=\s*2420\b/);
    // No short-circuited postcondition.
    expect(sql).not.toMatch(/where\s+false/i);
    expect(sql).not.toMatch(/if\s+false\s+then/i);
  });
});
