import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * get_organization()'s product count filters marketplace_listings on
 * `lower(merchant_domain) = lower(o.website_domain) AND status = 'active'`.
 * Without an index on exactly that expression and predicate it reads the whole
 * 249 MB table (2,791 ms cold for one org on 2026-10-31) and times out for
 * anon. The index must match the function's predicate, or the planner cannot
 * use it — so both sides are asserted.
 */
const DIR = join(process.cwd(), 'supabase/migrations');
const all = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(DIR, f), 'utf8'));

describe('get_organization product-count index', () => {
  it('indexes lower(merchant_domain) for active listings', () => {
    expect(all.join('\n')).toMatch(
      /create\s+index[^;]*on\s+public\.marketplace_listings\s*\(\s*lower\(\s*merchant_domain\s*\)\s*\)\s*where\s+status\s*=\s*'active'/i,
    );
  });

  it('is never dropped by a later migration', () => {
    expect(all.join('\n')).not.toMatch(
      /drop\s+index[^;]*idx_marketplace_listings_active_lower_merchant_domain/i,
    );
  });
});
