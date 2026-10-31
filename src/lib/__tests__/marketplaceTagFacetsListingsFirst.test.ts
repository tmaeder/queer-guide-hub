import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * get_marketplace_tag_facets must build the eligible-listing set once and join
 * it to the tag assignments, never join marketplace_listings row by row.
 *
 * In one flat join the planner estimated ~360 rows (actual 114k) and probed
 * marketplace_listings by primary key 170,950 times: 6,542 ms for the default
 * call on 2026-10-31, past the anon role's 3s statement_timeout. The guard
 * reads the LATEST migration that defines the function.
 */
const DIR = join(process.cwd(), 'supabase/migrations');

function latestBody(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(DIR, files[i]), 'utf8');
    const m = sql.match(
      /create\s+(?:or\s+replace\s+)?function\s+api_private\.get_marketplace_tag_facets\([\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
    );
    if (m) return m[1];
  }
  throw new Error('no migration defines api_private.get_marketplace_tag_facets');
}

describe('get_marketplace_tag_facets plan shape', () => {
  const body = latestBody();
  const listingsCte = body.slice(
    body.search(/listings\s+AS\s+MATERIALIZED/i),
    body.search(/\)\s*SELECT\s+t\.slug/i),
  );

  it('materializes the tag set and the listing set', () => {
    expect(body).toMatch(/tags\s+AS\s+MATERIALIZED/i);
    expect(body).toMatch(/listings\s+AS\s+MATERIALIZED/i);
  });

  it('applies every listing-side filter inside the listings CTE', () => {
    for (const pred of [
      /ml\.status\s*=\s*'active'/i,
      /ml\.overview_eligible/i,
      /p_include_adult\s+OR\s+ml\.content_rating\s+IN\s*\(\s*'sfw'\s*,\s*'suggestive'\s*\)/i,
      /ml\.availability\s*<>\s*'out_of_stock'/i,
      /ml\.department\s*=\s*p_department/i,
      /ml\.subcategory_group\s*=\s*p_subcategory_group/i,
    ]) {
      expect(listingsCte).toMatch(pred);
    }
  });

  it('never joins marketplace_listings in the final aggregate', () => {
    const finalSelect = body.slice(body.search(/\)\s*SELECT\s+t\.slug/i));
    expect(finalSelect).not.toMatch(/marketplace_listings/i);
  });
});
