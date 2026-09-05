import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The search_facets/search_hybrid parity gate is a CRITICAL trust-&-safety gate:
 * search_facets carried no safety_gated filter from 20260623160001 until
 * 20260829041548 and handed anonymous callers a per-category, per-tag breakdown of
 * gated venues in criminalising countries while the results themselves were
 * correctly withheld.
 *
 * On 2026-09-05 it was timing out on ~7% of CI runs (p95 7.35 s against an 8 s
 * statement_timeout). #3455 took it off pull_request — it reads live prod, so it
 * can never report on the PR it blocks — and 20270601114237 gave each probe its
 * own statement budget. Neither weakened what is asserted, which is precisely the
 * pressure these tests exist under: the next person under it has two cheap-looking
 * options that must not be available — drop a probe, or let an unreachable gate
 * read as a passing one.
 *
 * Properties, not literals — the probe QUERIES may legitimately change (the terms
 * are arbitrary), what may not change is that all three kinds of divergence stay
 * covered. Text checks against the repo, so no database credentials are needed.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const sqlFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function latestDefining(fn: string): string {
  const re = new RegExp(`function public\\.${fn}\\s*\\(`);
  for (const f of [...sqlFiles].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (re.test(sql)) return sql;
  }
  throw new Error(`no migration defines public.${fn}`);
}

/** The dollar-quoted body of a named function in the given migration. */
function bodyOf(sql: string, fn: string): string {
  const start = sql.search(new RegExp(`function public\\.${fn}\\s*\\(`));
  expect(start, `public.${fn} not found`).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const open = rest.indexOf('$fn$');
  const close = rest.indexOf('$fn$', open + 4);
  expect(close, `public.${fn} body is not $fn$-quoted`).toBeGreaterThan(open);
  return rest.slice(open + 4, close);
}

describe('search_facets parity gate — probe coverage', () => {
  const registry = bodyOf(
    latestDefining('search_facets_parity_registry'),
    'search_facets_parity_registry',
  );
  const probes = bodyOf(
    latestDefining('search_facets_parity_probes'),
    'search_facets_parity_probes',
  );

  const rows = [...registry.matchAll(/\(\s*'([^']+)'::text\s*,[^)]*?(true|false)\s*\)/g)].map(
    (m) => ({
      probe: m[1],
      useVec: m[2] === 'true',
    }),
  );

  it('parses the registry it is guarding', () => {
    // If this fails the regex has drifted from the SQL and every assertion below
    // is vacuous — the guard must not pass by finding nothing.
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('still exercises the vector arm', () => {
    // Divergence (3) of 20260829041548: search_facets took no p_query_vec at all
    // and so counted a strictly smaller set than search_hybrid.total. A registry
    // with no use_vec probe cannot see that come back.
    expect(rows.some((r) => r.useVec)).toBe(true);
  });

  it('still exercises a keyword-only, type-scoped probe', () => {
    expect(rows.some((r) => !r.useVec)).toBe(true);
  });

  it('still exercises gating', () => {
    // The over-counting direction — the one that leaked a breakdown of gated
    // venues in criminalising countries to anonymous callers.
    expect(probes).toMatch(/'gated'/);
  });
});

describe('check-search-facets-parity.mjs — an unreachable gate is not a passing gate', () => {
  const script = readFileSync(
    join(process.cwd(), 'scripts', 'check-search-facets-parity.mjs'),
    'utf8',
  );

  it('routes every RPC through one helper that exits on a non-200', () => {
    // One fetch call site, so there is exactly one place a non-200 can be
    // swallowed, and that place exits 1.
    expect(script.match(/\bfetch\(/g) ?? []).toHaveLength(1);
    expect(script).toMatch(/if\s*\(!r\.ok\)\s*\{[\s\S]{0,600}?process\.exit\(1\)/);
  });

  it('treats an empty probe list as a failure, not as "in step"', () => {
    // Without this the per-probe loop iterates zero times and the gate reports
    // success having checked nothing.
    expect(script).toMatch(/probes\.length === 0[\s\S]{0,400}?process\.exit\(1\)/);
  });

  it('drives the probes one request at a time', () => {
    // Parallelising them would recreate the concurrent database load that caused
    // the timeouts this split exists to fix.
    expect(script).toMatch(/for\s*\(const\s*\{\s*probe\s*\}\s*of\s*probes\)/);
    expect(script).not.toMatch(/Promise\.all\([\s\S]{0,200}probes/);
  });
});
