import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEX_TAG_COLUMNS } from '../useCentralizedTags';

/**
 * The glossary index must not download the whole corpus again.
 *
 * `/tags` fetched `unified_tags?select=*` five paged requests deep plus six
 * paged `tag_category_assignments` requests that EMBEDDED the category on every
 * row. Measured from a Playwright trace on prod 2026-09-04: 35 Supabase
 * requests totalling 28.9s on one signed-in page load, which is why the page
 * sat on "Loading the glossary" past the 15s e2e budget and started failing
 * tags-smoke and tags-age-gate. Payload for the tag corpus alone was 4,097 kB
 * against 668 kB for the columns actually rendered.
 *
 * These are cheap contract assertions, not a benchmark — a benchmark against a
 * live corpus would be flaky and would not say WHICH column regressed.
 */

const SOURCE = readFileSync(join(__dirname, '..', 'useCentralizedTags.tsx'), 'utf8');
const cols = INDEX_TAG_COLUMNS.split(',').map((c) => c.trim());

describe('glossary index corpus fetch', () => {
  it('selects every column the index actually renders', () => {
    // Derived from what TagsIndex / TagResults / TagIndexCard / TagSelector /
    // AdminTags read off a corpus row. Dropping one of these from the select
    // yields `undefined` at runtime with no type error, because the shared
    // `CentralizedTag` type marks them optional.
    for (const required of [
      'id',
      'name',
      'slug',
      'description',
      'short_description',
      'usage_count',
      'status',
      'category',
    ]) {
      expect(cols, `${required} is rendered by the index and must be selected`).toContain(required);
    }
  });

  it('does NOT ship the heavy detail-page columns to the index', () => {
    // `long_description` alone was 1,163 kB — 28.4% of the corpus payload —
    // full wiki bodies fetched to render a list of names. These belong to
    // `fetchTagWithCategories`, which fetches ONE tag for the detail page.
    for (const heavy of [
      'long_description',
      'scientific_data',
      'image_url',
      'image_attribution',
      'image_source',
      'wikipedia_url',
    ]) {
      expect(cols, `${heavy} must not be fetched for all ~4.6k index rows`).not.toContain(heavy);
    }
  });

  it('never regresses to select("*") for the corpus', () => {
    // The literal that started this. A future edit that "just adds a field" by
    // reaching for `*` puts 3.4 MB back on every glossary visit.
    //
    // Scoped to `fetchAllActiveTags`, NOT the whole file: `searchTags` further
    // down legitimately uses `select('*')` behind `.limit(20)`, and an
    // unscoped regex failed on it — 20 rows is not the problem this guards.
    const corpusFn = SOURCE.match(/async function fetchAllActiveTags\(\)[\s\S]*?\n}/)?.[0];
    expect(corpusFn, 'fetchAllActiveTags must still exist').toBeTruthy();
    expect(corpusFn).not.toMatch(/\.select\('\*'\)/);
    expect(corpusFn).toContain('INDEX_TAG_COLUMNS');
  });

  it('does not embed tag_categories into the assignments fetch', () => {
    // ~53 category records repeated across ~6,000 assignment rows, plus a
    // server-side join per page. The same data is already fetched once into
    // `catLookup`; assignments resolve against it by `category_id`.
    const assignmentsSelect = SOURCE.match(
      /from\('tag_category_assignments'\)\s*\n?\s*\.select\('([^']+)'\)/,
    )?.[1];
    expect(assignmentsSelect, 'the assignments select must still exist').toBeTruthy();
    expect(assignmentsSelect).not.toContain('tag_categories');
    expect(assignmentsSelect).toContain('category_id');
  });

  it('refuses to build the glossary when categories are missing', () => {
    // SAFETY, not tidiness. The adult age gate hides terms by matching category
    // NAMES, so a corpus built with an empty `catLookup` would carry no
    // categories and every adult term would read as not-adult. Since the embed
    // is gone, that state is reachable if the categories fetch fails — so it
    // must throw rather than render an un-gated glossary.
    expect(SOURCE).toMatch(
      /if \(!allCats \|\| allCats\.length === 0\)\s*\{\s*\n?\s*throw new Error/,
    );
    expect(SOURCE).toMatch(/age gate keys on category names/);
  });
});
