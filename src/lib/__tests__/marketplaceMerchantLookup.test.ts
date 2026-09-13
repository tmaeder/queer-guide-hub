import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `marketplace_listings.merchant_id` had two writers with two meanings: the merchant sync
 * wrote `marketplace_merchants` ids while both commit paths looked the merchant up in
 * `affiliate_partners` (the TRAVEL booking registry — 15 rows, none of which can match a
 * product listing's domain, measured 0 of 70,416 on prod 2026-09-12). These assertions pin
 * the one meaning that survived.
 *
 * They read the LATEST migration that redefines the commit functions rather than a pinned
 * filename — the `venueCategories.ts` trap, where a later ALTER silently orphans the test.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Strip `--` line comments so a guard cannot be "satisfied" by prose in the header. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function latestMigrationContaining(needle: string): { name: string; sql: string } {
  const hits = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle));
  const name = hits.at(-1);
  if (!name) throw new Error(`no migration contains ${needle}`);
  return { name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') };
}

describe('marketplace commit resolves merchants, not affiliate partners', () => {
  const commitFns = [
    'CREATE OR REPLACE FUNCTION public.commit_marketplace_staging_item',
    'CREATE OR REPLACE FUNCTION public.commit_marketplace_staging_batch',
  ];

  for (const decl of commitFns) {
    const fn = decl.split('public.')[1];

    it(`${fn} resolves the merchant through the shared resolver`, () => {
      const { sql } = latestMigrationContaining(decl);
      const body = stripComments(sql);
      const start = body.indexOf(decl);
      // Each definition ends at its own `$function$;` terminator.
      const end = body.indexOf('$function$;', start);
      expect(end).toBeGreaterThan(start);
      const fnBody = body.slice(start, end);

      expect(fnBody).toContain(
        'public.marketplace_resolve_merchant_id(v_merchant_dom, v_src_slug)',
      );
      // The travel registry can never be the source of a product listing's merchant.
      expect(fnBody).not.toContain('affiliate_partners');
      // `v_src_slug` is the disambiguator; it must be assigned before the resolver call.
      expect(fnBody.indexOf('v_src_slug :=')).toBeLessThan(
        fnBody.indexOf('marketplace_resolve_merchant_id'),
      );
    });
  }

  it('the resolver mirrors the merchant sync: www-insensitive, slug-disambiguated, NULL over a guess', () => {
    const { sql } = latestMigrationContaining(
      'create or replace function public.marketplace_resolve_merchant_id',
    );
    const body = stripComments(sql);
    const start = body.indexOf('create or replace function public.marketplace_resolve_merchant_id');
    expect(start).toBeGreaterThanOrEqual(0);
    const fnBody = body.slice(start, body.indexOf('$$;', start));

    expect(fnBody).toContain('marketplace_merchants');
    // Listings hold bare domains; 9 registry rows are www-prefixed.
    expect(fnBody).toMatch(/regexp_replace\(lower\(btrim\(mm\.shop_domain\)\), '\^www\\\.', ''\)/);
    // salzgeber.shop has three registry rows; source_type IS the merchant slug.
    expect(fnBody).toContain('mm.slug = p_source_slug');
    expect(fnBody).toContain('not exists');
    // `is_enabled` is deliberately NOT a filter — linking is bookkeeping, not activation,
    // and the sync this mirrors does not filter it either.
    expect(fnBody).not.toContain('is_enabled');
  });

  it('the FK is repointed idempotently and never guesses at a third table', () => {
    const { sql } = latestMigrationContaining('marketplace_listings_merchant_id_fkey');
    const body = stripComments(sql);

    expect(body).toContain('references public.marketplace_merchants(id) on delete set null');
    // Soft on preconditions: already-correct is a no-op, not an abort that blocks the repo.
    expect(body).toMatch(/elsif v_target = 'marketplace_merchants' then\s+raise notice/);
    expect(body).toContain("elsif v_target = 'affiliate_partners' then");
    expect(body).toMatch(/refusing to guess/);
  });

  it('postconditions assert the reached state, including a non-vacuous agreement count', () => {
    const { sql } = latestMigrationContaining('marketplace_resolve_merchant_id');
    const body = stripComments(sql);

    expect(body).toContain('expected marketplace_merchants');
    expect(body).toContain('still reads affiliate_partners');
    expect(body).toContain('does not call the resolver');
    // A resolver that returned NULL everywhere would also report zero disagreements.
    expect(body).toContain('resolver agreed with nothing');
    expect(body).toContain('invented a merchant for an unknown domain');
  });
});
