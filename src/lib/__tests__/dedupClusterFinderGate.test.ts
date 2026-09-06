import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The dedup cluster finders must stay admin-gated.
 *
 * Both are SECURITY DEFINER over tables carrying the safety_gated RLS policy
 * (`USING (NOT safety_gated OR auth.uid() IS NOT NULL)`), so they run as their
 * owner and skip it. Measured on prod before 20330301100000, with the grant to
 * `authenticated` and no internal gate: 600 cluster members returned, **29 of
 * them safety_gated venues** in EG, ID, KE, LB, LY, MM, MY, SY — title, slug,
 * city and country, to any signed-in account.
 *
 * THIS IS A REGRESSION TEST IN THE LITERAL SENSE. The gate was there:
 * 20260611034848 added `assert_admin_or_internal` to find_duplicate_clusters,
 * and 20260811100200 rewrote the function for unrelated reasons and did not
 * carry the line across. A full restatement that drops one line is silent —
 * nothing fails, because the absence is only observable by calling as a
 * non-admin, and nothing does. This test is the thing that does.
 *
 * Text check against the migrations directory — no credentials. The runtime
 * assertions (non-staff refused, admin still served, inner bodies revoked) live
 * in the migration's own DO block, where they can reach real roles.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/** The CREATE statement for one function, not the whole migration file. */
function bodyOf(sql: string, fn: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is created in its latest migration`).toBeGreaterThan(-1);
  const end = sql.indexOf('$function$;', start);
  expect(end, `${fn} body is terminated`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const FINDERS = ['find_duplicate_clusters', 'find_fuzzy_duplicate_clusters'] as const;

describe('dedup cluster finders are admin-gated', () => {
  for (const fn of FINDERS) {
    it(`${fn} calls assert_admin_or_internal`, () => {
      expect(bodyOf(latestDefinitionOf(fn), fn)).toMatch(
        /perform public\.assert_admin_or_internal\(\)/,
      );
    });

    it(`${fn} is plpgsql, so the gate cannot be optimised away`, () => {
      // Both were LANGUAGE sql. A gate added there as a leading
      // `WITH _gate AS (SELECT assert_admin_or_internal())` CTE is worse than
      // none: the function is STABLE and an unreferenced CTE may be skipped, so
      // the check would look present in the source and sometimes not run.
      const body = bodyOf(latestDefinitionOf(fn), fn);
      expect(body).toMatch(/LANGUAGE plpgsql/i);
      expect(body, 'a CTE-shaped gate is not acceptable here').not.toMatch(
        /with\s+_?gate\s+as\s*\(/i,
      );
    });
  }

  it('revokes the inner bodies from authenticated', () => {
    // ALTER FUNCTION ... RENAME carries the ACL with it. Without these revokes
    // the renamed body is still callable by any signed-in account under its new
    // name, and the wrapper's gate is one call away from being pointless.
    const sql = latestDefinitionOf('find_fuzzy_duplicate_clusters');
    for (const inner of ['_find_duplicate_clusters_body', '_find_fuzzy_duplicate_clusters_body']) {
      expect(sql, `${inner} must be revoked`).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${inner}\\([^)]*\\)\\s*\\n?\\s*FROM public, anon, authenticated`,
        ),
      );
    }
  });

  it('keeps the wrappers reachable by the console, and never by anon', () => {
    const sql = latestDefinitionOf('find_fuzzy_duplicate_clusters');
    for (const fn of FINDERS) {
      expect(sql).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*\\n?\\s*TO authenticated, service_role`,
        ),
      );
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM public, anon`),
      );
    }
  });

  it('asserts BOTH directions at deploy time, not just the refusal', () => {
    // "No leak" also passes on a gate that admits nobody, which would silently
    // empty /admin/duplicates. The migration must check that a real admin is
    // still served.
    const sql = latestDefinitionOf('find_fuzzy_duplicate_clusters');
    expect(sql, 'a non-staff caller must be refused').toMatch(/NOT REFUSED/);
    expect(sql, 'a real admin must still be served').toMatch(/breaks \/admin\/duplicates/);
    expect(sql, 'and the finder must still return something at all').toMatch(
      /returns no clusters at all/,
    );
  });
});
