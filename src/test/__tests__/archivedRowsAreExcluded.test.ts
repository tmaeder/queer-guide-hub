import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * "Archived" has to mean invisible, and until 2026-08-29 it did not.
 *
 * Audited every public read path against every archive convention. Venues and
 * personalities were correct. The rest leaked:
 *
 *   cities      `shell_status='ghost'` was tested by NOTHING in search —
 *               `search_documents_index_cities` filtered only duplicate_of_id,
 *               so 1,022 of 5,436 city documents (18.8% of the city index) were
 *               archived rows. Searching "Padova" returned the archived ghost
 *               ABOVE the real city Padua. The detail page and the crawler
 *               renderer had no gate either.
 *   events      `status='cancelled'` was filtered on the list and in the
 *               sitemap, but not on the detail page or in the crawler HTML.
 *   marketplace `status='inactive'` (8,198 rows) was filtered on the list; the
 *               detail page relied on an RLS policy that could not work — its
 *               `venue_id IS NULL` disjunct made the status test a no-op.
 *
 * These are text assertions over the source for the same reason the sibling
 * detailIndexableGate suite is: the defect is an OMISSION in a query, and a
 * runtime mock only catches an omission someone already thought to mock.
 *
 * The end-to-end proof is the deploy-time prod check (an archived row absent
 * from search + detail + crawler, with a live row still present as the positive
 * control). This suite is what stops it silently regressing afterwards.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Slice one function body out of a module. The name may be followed by `(` or
 * by a generic parameter list — `fetchEventBySlugOrId<T extends {id: string}>(`
 * is real, and matching only `name(` silently returns '' for it, which is a
 * vacuous pass waiting to happen. Hence the explicit not-'' assertion at every
 * call site.
 */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`(?:export )?async function ${name}\\s*[<(]`).exec(src);
  if (!m) return '';
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\n(export )?async function /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('archived cities are excluded', () => {
  it('the search indexer filters shell_status, not just duplicate_of_id', () => {
    // The migration carrying the CURRENT definition. `search_hybrid` reads
    // search_documents and never rejoins cities, so this WHERE clause IS search
    // visibility — there is no query-time gate behind it.
    const sql = read('supabase/migrations/20261014100000_archived_rows_leave_search.sql');
    expect(sql).toMatch(/search_documents_index_cities/);
    expect(
      /not in \('ghost', ?'merged'\)/.test(sql),
      'city search indexer must exclude ghost/merged',
    ).toBe(true);
  });

  it('the indexer does NOT gate on seo_indexable', () => {
    // Deliberate: seo_indexable is false on 1,961 cities that are not archived —
    // real places we simply do not expose to crawlers, which are still valid
    // on-site search results. Gating search on it would cut a further 36% of the
    // city index, a different product decision. If someone "tidies" this into
    // the indexer, that is what they are silently changing.
    const sql = read('supabase/migrations/20261014100000_archived_rows_leave_search.sql');
    // The function BODY only — the header comment above it explains at length
    // why seo_indexable is the wrong predicate here, and slicing from the first
    // mention of the function name would swallow that prose and pass vacuously.
    const start = sql.indexOf('create or replace function public.search_documents_index_cities');
    const body = sql.slice(start, sql.indexOf('$function$;', start));
    expect(start).toBeGreaterThan(-1);
    expect(body.includes('seo_indexable')).toBe(false);
  });

  it('the city list hook excludes ghost and merged', () => {
    const body = read('src/hooks/usePlaces.tsx');
    expect(
      /\.not\('shell_status', ?'in', ?'\("ghost","merged"\)'\)/.test(body),
      'useOptimizedCities must exclude archived cities — it is what CountryDetail renders',
    ).toBe(true);
  });

  it('the city detail hook 404s a ghost but still follows a merge', () => {
    const src = read('src/hooks/usePlaces.tsx');
    expect(src).toMatch(/rejectGhost/);
    // Gating the RESULT, not the query, is load-bearing: a merged row has to
    // stay fetchable for followMerged to redirect through it.
    expect(
      /rejectGhost\(await followMerged\(/.test(src),
      'rejectGhost must wrap followMerged, not replace it — filtering in the select breaks merge redirects',
    ).toBe(true);
  });

  it('the crawler renderer refuses a ghost city', () => {
    const body = fnBody(read('functions/_lib/detail.ts'), 'cityDetail');
    expect(body).not.toBe('');
    expect(body.includes('shell_status')).toBe(true);
    expect(
      /shell_status'\) === 'ghost'\) return null/.test(body),
      'cityDetail must return null (hard 404) for an archived city',
    ).toBe(true);
  });
});

describe('archived events are excluded', () => {
  it('the detail fetcher excludes cancelled', () => {
    const body = fnBody(read('src/hooks/usePageFetchers.ts'), 'fetchEventBySlugOrId');
    expect(body).not.toBe('');
    expect(body).toMatch(/status\.neq\.cancelled/);
    // NULL-safe: the column is nullable, and a bare .neq() drops NULL rows
    // because NULL <> 'x' is NULL. A NULL-status event would 404 forever.
    expect(body).toMatch(/status\.is\.null/);
  });

  it('the crawler renderer excludes cancelled', () => {
    const body = fnBody(read('functions/_lib/detail.ts'), 'eventDetail');
    expect(body).toMatch(/status=neq\.cancelled/);
  });

  it("'completed' is NOT excluded anywhere", () => {
    // ~99% of this corpus is past events (the Wayback import). They are
    // archived by neither convention and must keep their pages.
    const hook = fnBody(read('src/hooks/usePageFetchers.ts'), 'fetchEventBySlugOrId');
    const edge = fnBody(read('functions/_lib/detail.ts'), 'eventDetail');
    expect(hook.includes('neq.completed')).toBe(false);
    expect(edge.includes('status=neq.completed')).toBe(false);
  });
});

describe('archived marketplace listings are excluded', () => {
  it('the detail fetcher filters status', () => {
    const body = fnBody(read('src/hooks/usePageFetchers.ts'), 'fetchMarketplaceListingBundle');
    expect(body).not.toBe('');
    expect(body).toMatch(/status\.eq\.active/);
    expect(body).toMatch(/status\.is\.null/);
  });

  it('the RLS policy no longer ORs past the status test', () => {
    const sql = read('supabase/migrations/20261014100000_archived_rows_leave_search.sql');
    const policy = sql.slice(sql.indexOf('create policy "Marketplace listings read access"'));
    expect(policy).toMatch(/coalesce\(status, ?'active'\) = 'active'/);
    // The whole defect was `OR (venue_id IS NULL OR EXISTS(venue))`, which is
    // true for every row (venue_id is NULL on all 69,989) and so nullified the
    // status test. It must not come back.
    expect(policy.includes('venue_id')).toBe(false);
  });
});
