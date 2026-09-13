import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The organization role vocabulary lives in three places and all three have to
 * agree:
 *
 *   1. the `organizations_roles_known` CHECK (Postgres)
 *   2. `OrgRole` in src/hooks/useOrganization.ts
 *   3. ROLE_LABEL + TABS in src/pages/Organizations.tsx
 *
 * A role added to the CHECK but not to `OrgRole` type-errors nowhere useful —
 * the value simply never renders, and a whole tab is silently missing. That is
 * the failure this file exists to catch.
 *
 * The migration is located by scanning for the HIGHEST-versioned file that
 * defines the constraint, rather than by naming one. The sibling
 * venueCategories drift test hardcodes its filename, which means every future
 * ALTER of that constraint has to remember to update the test or it fails for
 * the wrong reason. Deriving it removes that step.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const CONSTRAINT = 'organizations_roles_known';

function latestConstraintMigration(): { file: string; sql: string } {
  const candidates = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const file of candidates) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    // `add constraint <name> check (roles <@ array[...])` — the definition,
    // not a bare `drop constraint if exists` in an unrelated migration.
    if (new RegExp(`add\\s+constraint\\s+${CONSTRAINT}\\b`, 'i').test(sql)) {
      return { file, sql };
    }
  }
  throw new Error(`no migration defines ${CONSTRAINT}`);
}

function rolesFromMigration(sql: string): string[] {
  const block = sql.match(
    new RegExp(`add\\s+constraint\\s+${CONSTRAINT}[\\s\\S]*?array\\[([\\s\\S]*?)\\]`, 'i'),
  );
  if (!block) throw new Error(`could not parse the ${CONSTRAINT} array literal`);
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

function rolesFromOrgRoleType(): string[] {
  const src = readFileSync(join(process.cwd(), 'src/hooks/useOrganization.ts'), 'utf8');
  const decl = src.match(/export type OrgRole\s*=([\s\S]*?);/);
  if (!decl) throw new Error('could not find the OrgRole declaration');
  return [...decl[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

describe('organization roles vocabulary', () => {
  it('the CHECK and the OrgRole type list exactly the same roles', () => {
    const { sql } = latestConstraintMigration();
    expect(rolesFromOrgRoleType()).toEqual(rolesFromMigration(sql));
  });

  it('parses a non-trivial vocabulary from both sides', () => {
    // Positive control. Both readers above are regex-based: if either silently
    // matched nothing, the equality assertion would pass on two empty arrays and
    // this whole file would be decorative.
    const { sql } = latestConstraintMigration();
    expect(rolesFromMigration(sql).length).toBeGreaterThan(5);
    expect(rolesFromOrgRoleType().length).toBeGreaterThan(5);
  });

  it('admits advocacy, and keeps it distinct from support', () => {
    const { sql } = latestConstraintMigration();
    const roles = rolesFromMigration(sql);
    expect(roles).toContain('advocacy');
    expect(roles).toContain('support');
  });

  it('gives advocacy its own label and its own directory tab', () => {
    // An advocacy group filed under the Support tab would be handed to a reader
    // looking for help. The separation is the point, so assert it holds.
    const page = readFileSync(join(process.cwd(), 'src/pages/Organizations.tsx'), 'utf8');
    expect(page).toMatch(/advocacy:\s*'Advocacy group'/);
    expect(page).toMatch(/id:\s*'advocacy'[^}]*role:\s*'advocacy'/);
    expect(page).toMatch(/id:\s*'support'[^}]*role:\s*'support'/);
  });
});

describe('dissolved organizations stay findable in search', () => {
  /**
   * `search_hybrid` excludes candidates on `closed_at is not null` BEFORE
   * scoring, so mirroring `dissolved_at` into `closed_at` would delete Gay
   * Liberation Front, STAR and the Scientific-Humanitarian Committee from site
   * search entirely. The derank is carried by `liveness_status='dead_link'`
   * instead. If someone "tidies" the indexer by populating closed_at, this
   * fails.
   */
  it('the organization indexer writes a null closed_at and deranks via liveness', () => {
    const { sql } = latestConstraintMigration();
    const fn = sql.match(
      /create or replace function public\.search_documents_index_organizations[\s\S]*?\$function\$;/i,
    );
    expect(fn, 'the migration should carry the indexer it modifies').not.toBeNull();
    const body = fn![0];

    // 'dead_link' is one of the values search_hybrid penalises by -0.5.
    expect(body).toMatch(/case when o\.is_defunct then 'dead_link' else 'live' end/i);
    expect(body).not.toMatch(/closed_at\s*=\s*o\.dissolved_at/i);
    expect(body).not.toMatch(/o\.dissolved_at::timestamptz/i);
  });

  it('keys liveness off is_defunct, never off dissolved_at alone', () => {
    /**
     * Measured on the source corpus: 28 organizations sit in a Defunct category
     * and 25 carry a Wikidata P576 dissolved date, but only 5 carry BOTH — a
     * union of 48. So `dissolved_at is not null` identifies barely half of the
     * dead organizations, and keying search liveness off it would publish 20 of
     * them as live and contactable. The date and the fact are separate columns
     * for that reason.
     */
    const { sql } = latestConstraintMigration();
    const fn = sql.match(
      /create or replace function public\.search_documents_index_organizations[\s\S]*?\$function\$;/i,
    );
    expect(fn![0]).not.toMatch(/dissolved_at is not null then 'dead_link'/i);

    // And the schema must not let the two drift apart in the harmless direction.
    expect(sql).toMatch(/check \(dissolved_at is null or is_defunct\)/i);
  });
});
