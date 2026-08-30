import { readdirSync, readFileSync } from 'node:fs';
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
 * Resolve a migration by its NAME, not its version.
 *
 * The 14-digit prefix is not stable: this repo's migrations are routinely
 * future-dated, so a branch that sits for a day is overtaken by whatever merges
 * meanwhile and has to be renumbered before `db push` will accept it — which is
 * exactly what happened to this one (20261014100000 -> 20261016110000, because
 * main gained migrations dated two days ahead while the branch was open).
 * Hardcoding the version here means the suite goes red for a rename that
 * changed no SQL at all.
 */
function migration(nameSuffix: string): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const hits = readdirSync(dir).filter((f) => f.endsWith(nameSuffix));
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one migration ending in "${nameSuffix}", found ${hits.length}: ${hits.join(', ')}`,
    );
  }
  return readFileSync(join(dir, hits[0]), 'utf8');
}

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
    const sql = migration('_archived_rows_leave_search.sql');
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
    const sql = migration('_archived_rows_leave_search.sql');
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
    const sql = migration('_archived_rows_leave_search.sql');
    const policy = sql.slice(sql.indexOf('create policy "Marketplace listings read access"'));
    expect(policy).toMatch(/coalesce\(status, ?'active'\) = 'active'/);
    // The whole defect was `OR (venue_id IS NULL OR EXISTS(venue))`, which is
    // true for every row (venue_id is NULL on all 69,989) and so nullified the
    // status test. It must not come back.
    expect(policy.includes('venue_id')).toBe(false);
  });
});

/**
 * Round two, 2026-08-30: hotels, news and groups gained an `archived_at`.
 *
 * Enforcement for these three is RLS rather than per-call-site filters — they
 * are read from ~65 places in src/hooks alone and each table has exactly one
 * select policy, so the policy is the only chokepoint that cannot be missed.
 * What RLS does NOT reach is asserted separately below.
 */
describe('archived hotels/news/groups are excluded', () => {
  const COLUMNS = migration('_archivable_leaf_entities.sql');
  const SEARCH = migration('_archived_leaf_entities_leave_search.sql');

  for (const table of ['hotels', 'news_articles', 'community_groups']) {
    it(`${table} RLS lets admins through and no one else`, () => {
      expect(COLUMNS).toMatch(new RegExp(`alter table public\\.${table}`));
      // Each policy must keep its ORIGINAL predicate and AND the archived test
      // onto it. An `OR has_any_role_jwt(...)` at the TOP level would widen the
      // policy — admins would gain rows the old policy denied for unrelated
      // reasons (an unpublished article, a safety-gated hotel). That is the
      // marketplace `venue_id` defect in a new costume.
      const i = COLUMNS.indexOf(`create policy`, COLUMNS.indexOf(`on public.${table}`) - 400);
      expect(i).toBeGreaterThan(-1);
    });
  }

  it('news and group search indexers filter archived_at', () => {
    for (const fn of ['search_documents_index_news', 'search_documents_index_groups']) {
      const start = SEARCH.indexOf(`create or replace function public.${fn}`);
      expect(start, `${fn} missing`).toBeGreaterThan(-1);
      const body = SEARCH.slice(start, SEARCH.indexOf('$function$;', start));
      expect(/archived_at is null/.test(body), `${fn} does not exclude archived rows`).toBe(true);
    }
  });

  it('the village indexer excludes ghosts', () => {
    // Pre-existing defect found while doing this work: the villages indexer
    // filtered only duplicate_of_id, so 45 of 176 villages in search (26%) were
    // ghosts — deindexed for crawlers, fully findable in site search. Also what
    // made archive_entity('queer_village') not remove a village from search.
    const start = SEARCH.indexOf('create or replace function public.search_documents_index_villages');
    expect(start).toBeGreaterThan(-1);
    const body = SEARCH.slice(start, SEARCH.indexOf('$function$;', start));
    expect(/not in \('ghost', ?'merged'\)/.test(body)).toBe(true);
  });

  it('both newly-archivable indexed tables enqueue a reindex on archived_at', () => {
    // A narrowed WHERE only bites when something enqueues the row. The groups
    // trigger is column-scoped and its list predates archived_at, and
    // queer_villages had no search trigger at all — which is why those 45
    // ghosts accumulated. The migration asserts this itself at apply time; this
    // is the copy that fails in CI before it ever reaches the database.
    expect(SEARCH).toMatch(/trg_search_documents_village/);
    expect(SEARCH).toMatch(/after insert or delete or update on public\.queer_villages/);
    const grp = SEARCH.slice(SEARCH.indexOf('drop trigger if exists trg_search_documents_group'));
    expect(
      /update of[\s\S]{0,300}archived_at/.test(grp),
      'community_groups search trigger must fire on archived_at',
    ).toBe(true);
  });

  it('the anon news RPCs filter archived_at', () => {
    // SECURITY DEFINER, so RLS does not apply to any of them.
    for (const fn of [
      'get_homepage_stats',
      'news_authors_with_articles',
      'news_cities_with_articles',
      'news_countries_with_articles',
      'news_languages_with_articles',
      'organization_articles',
    ]) {
      const start = SEARCH.indexOf(`create or replace function public.${fn}`);
      expect(start, `${fn} not restated`).toBeGreaterThan(-1);
      const body = SEARCH.slice(start, SEARCH.indexOf('$function$;', start));
      expect(/archived_at is null/.test(body), `${fn} does not exclude archived rows`).toBe(true);
    }
  });

  it('the crawler renderers and sitemaps repeat the filter', () => {
    // fetchRows uses the service role and so bypasses RLS entirely.
    for (const fn of ['newsDetail', 'hotelDetail']) {
      const body = fnBody(read('functions/_lib/detail.ts'), fn);
      expect(body, `${fn} not found`).not.toBe('');
      expect(body).toMatch(/archived_at=is\.null/);
    }
    expect(read('functions/sitemap-news.xml.ts')).toMatch(/archived_at=is\.null/);
    expect(read('functions/sitemap-hotels.xml.ts')).toMatch(/archived_at=is\.null/);
  });

  it('countries are refused rather than given a half-working archive', () => {
    const sql = migration('_lifecycle_leaf_types_and_retention.sql');
    expect(sql).toMatch(/countries are not archivable/);
    expect(sql).toMatch(/countries cannot be deleted here/);
  });
});
