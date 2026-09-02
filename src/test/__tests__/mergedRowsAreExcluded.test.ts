import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A merged-away row must be invisible by default on every read path.
 *
 * The trigger was three "Essen" rows under Cities. The merge itself had been
 * correct since 2026-08-25 — `merge_cities` set `duplicate_of_id`, reparented
 * the content, wrote `city_merge_audit`, and the public site already resolved
 * the old slugs to the survivor. What leaked was everything that read the
 * table without the predicate: the whole admin CMS list, and a handful of
 * front hooks that had each been written before the convention existed.
 *
 * These are text assertions over the source, for the reason the sibling
 * `archivedRowsAreExcluded` suite states: the defect is an OMISSION in a query,
 * and a runtime mock only catches an omission someone already thought to mock.
 * The behavioural half is covered by `filterOps.test.ts` (the predicate) and
 * `mergeCapability.test.ts` (the registry ↔ schema agreement).
 *
 * `shell_status` is NOT a second spelling of this. Measured on prod: of 321
 * merged cities only 47 carry `shell_status='merged'` — `merge_cities` never
 * writes that column — so an archive-style predicate catches 15% of them.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * Slice a named block out of a module by its start and end markers.
 *
 * Deliberately explicit rather than a generic "function name(...)" regex: the
 * CMS loaders are INDENTED inside a hook, so a boundary pattern anchored to
 * column 0 never matches, the slice runs to EOF, and every "contains" check
 * below passes vacuously. Hence the non-empty assertion on every slice.
 */
function slice(source: string, from: string, to: string): string {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a + 1);
  expect(a, `start marker not found: ${from}`).toBeGreaterThan(-1);
  expect(b, `end marker not found: ${to}`).toBeGreaterThan(a);
  return source.slice(a, b);
}

/** Resolve a migration by NAME — versions here are future-dated and renumbered. */
function migration(nameSuffix: string): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const hits = readdirSync(dir).filter((f) => f.endsWith(nameSuffix));
  expect(hits, `expected one migration ending in ${nameSuffix}`).toHaveLength(1);
  return readFileSync(join(dir, hits[0]), 'utf8');
}

describe('the CMS list applies the merged predicate', () => {
  const controller = read('src/components/cms/ContentListPanel/useContentListController.ts');

  it('loadSingleType filters, and composes with the archive slice', () => {
    const body = slice(controller, 'async function loadSingleType', 'async function loadAllTypes');
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain('applyMergedView');
    expect(body).toContain('applyArchivedView');
  });

  it('loadAllTypes filters, and surfaces its error', () => {
    // This loop touches every registry type. Before the predicate landed the
    // error was discarded entirely, so a bad column would have removed a whole
    // type from All content with nothing in the console.
    const body = slice(controller, 'async function loadAllTypes', 'useEffect(');
    expect(body.length).toBeGreaterThan(200);
    expect(body).toContain('applyMergedView');
    expect(body).toContain('if (error)');
  });

  it('mergedView is in the deps that drive the refetch and the page reset', () => {
    // Omit it from loadItems' deps and the toggle renders and does nothing;
    // omit it from the reset and switching slices on page 3 reads as empty.
    const loadDeps = slice(controller, '  }, [\n    contentTypeId,', ']);');
    expect(loadDeps).toContain('mergedView');
    expect(controller).toContain('[debouncedSearch, filters, archivedView, mergedView]');
  });

  it('the board applies both slices AND keys its cache on them', () => {
    // Sharpest trap here: react-query serves the previous slice's rows and
    // counts from cache, with no network call and no error, if the axis is
    // missing from the key.
    const grouped = read('src/hooks/useGroupedRows.ts');
    expect(grouped).toContain('applyMergedView');
    expect(grouped).toContain('applyArchivedView');
    const key = slice(grouped, 'queryKey: [', '],');
    expect(key).toContain('mergedView');
    expect(key).toContain('archivedView');
  });
});

describe('front read paths exclude merged cities', () => {
  const paths = [
    'src/hooks/usePersonalizedCities.ts',
    'src/hooks/useSimilarCities.ts',
    'src/hooks/useNearbyCities.ts',
    'src/hooks/useVenuesV2Data.ts',
  ];

  it.each(paths)('%s filters every cities query it makes', (p) => {
    const source = read(p);
    const queries = source.split("from('cities')").length - 1;
    expect(queries).toBeGreaterThan(0);
    expect(source.split(".is('duplicate_of_id', null)").length - 1).toBeGreaterThanOrEqual(queries);
  });

  it('the intent-location slug lookup FOLLOWS the merge rather than dropping it', () => {
    // A merged city keeps its old slug and links to it stay live, so the URL
    // must resolve to the survivor. Excluding it here would silently fall
    // through to name inference instead.
    const source = read('src/hooks/useIntentLocation.ts');
    expect(source).toContain('duplicate_of_id');
    expect(source).toContain('mergedInto');
  });

  it('the city pickers cannot offer a tombstone', () => {
    expect(read('src/components/cms/fields/CityAutocompleteField.tsx')).toContain(
      "{ col: 'duplicate_of_id', val: null, op: 'is' }",
    );
    expect(read('src/hooks/usePageFetchers.ts')).toContain(".is('duplicate_of_id', null)");
  });
});

describe('the personality city producer creates nothing', () => {
  const sql = migration('_seal_personality_city_producer.sql');

  it('backfill_personality_geo no longer inserts into cities', () => {
    const body = slice(
      sql,
      'CREATE OR REPLACE FUNCTION public.backfill_personality_geo',
      '$function$;',
    );
    expect(body.length).toBeGreaterThan(500);
    expect(body.toLowerCase()).not.toContain('insert into public.cities');
    expect(body.toLowerCase()).not.toContain('insert into cities');
    // Creation belongs to city_resolve_drain, behind the evidence bar.
    expect(body).toContain('p_allow_create  => false');
    expect(body).toContain('city_resolve_enqueue');
  });

  it('search_cities excludes merged and ghost rows', () => {
    const body = slice(sql, 'CREATE OR REPLACE FUNCTION public.search_cities', '$function$;\n');
    expect(body).toContain('c.duplicate_of_id is null');
    expect(body).toContain("not in ('ghost', 'merged')");
  });

  it('the non-place disposition is reversible, never a delete', () => {
    expect(sql).toContain('archive_city_as_nonplace');
    expect(sql.toLowerCase()).not.toContain('delete from public.cities');
  });
});
