import { test, expect } from '@playwright/test';

/**
 * End-to-end reachability of the Swiss agenda import (display-magazin.ch +
 * gay.ch), against E2E_BASE_URL — https://queer.guide by default.
 *
 * This is NOT mocked, unlike search.spec.ts. The point is to exercise the whole
 * chain the import depends on, in one pass: entity row -> commit ->
 * search_reindex_queue -> search_reindex_drain -> search_documents ->
 * search-proxy worker -> results UI. Every one of those links has failed at
 * least once in this repo's history, and the failure mode is always the same —
 * the data is present in Postgres and invisible to a user. On 2026-08-22 the
 * drain was disabled for hours while the import committed 4.7k rows perfectly;
 * nothing went red, because nothing was watching this chain.
 *
 * NO TEST HERE SKIPS ITSELF. A venue that has vanished, a search that returns
 * nothing, a city page with no content — those are the regressions this file
 * exists to catch, so they must fail rather than skip. (Same lesson as
 * cities-directory.spec.ts and map-shell.spec.ts.)
 *
 * ANCHORS are chosen to be stable, not merely present today:
 *  - `provitreff` / `isc` / `rote-fabrik` are venues carrying source rows from
 *    BOTH importers, so they also prove cross-source dedup collapsed them to one
 *    canonical venue instead of creating twins.
 *  - `Heldenbar` is gay.ch's longest-running series (404 occurrences since
 *    2015) — a query that returning zero means the index is broken, not that a
 *    single record moved.
 * Deliberately NOT anchored on an upcoming event: those age out within weeks and
 * would turn this file into a calendar-driven flake.
 *
 * WHERE THIS RUNS: e2e-nightly.yml, which invokes `npm run test:e2e` over the
 * whole directory by discovery. It is deliberately NOT added to e2e-pr.yml's
 * hardcoded list — that job gates unrelated PRs, and this file asserts on live
 * production data, so a source going quiet would redden every open PR instead
 * of the one thing that actually broke.
 *
 * Every assertion here was negative-controlled before being committed: pointed
 * at a bogus venue slug, a nonsense query and a nonexistent city, each one
 * fails. Two earlier drafts passed those controls and were rewritten — see the
 * comments on the search tests for what was wrong with them.
 */

const SEARCH_API = 'https://search.queer.guide/search';

// Venues both importers independently described, so each is also a dedup proof.
const SHARED_VENUES = [
  { slug: 'provitreff', name: 'Provitreff', city: 'Zürich' },
  { slug: 'isc', name: 'ISC', city: 'Bern' },
  { slug: 'rote-fabrik', name: 'Rote Fabrik', city: 'Zürich' },
];

test.describe('Swiss agenda import — reachability on prod', () => {
  for (const venue of SHARED_VENUES) {
    test(`venue /venues/${venue.slug} renders with its city`, async ({ page }) => {
      await page.goto(`/venues/${venue.slug}`);

      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible({ timeout: 20_000 });
      await expect(heading).toContainText(venue.name);

      // The city is what run_event_city_link and the whole geo chain hang off.
      // A venue page that renders without one means city_id was lost.
      await expect(page.locator('body')).toContainText(venue.city);
    });
  }

  test('an imported series is searchable end to end', async ({ page }) => {
    await page.goto('/search?q=Heldenbar');

    // A CARD TITLE, matched exactly. Two weaker forms were tried and rejected:
    // `getByText(/heldenbar/i)` also matches the query echoed into the search
    // box and the "N results for …" label, so it passes on an empty result set;
    // and "some result exists" is vacuous because the vector arm returns
    // neighbours for literally any string (see the index test below).
    // Result cards are not anchors here — the overlay-link pattern gives them
    // an aria-label and no text — so this targets the rendered title node.
    await expect(page.getByText('Heldenbar', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.locator('text=undefined').count()).toBe(0);
  });

  test('the search index actually holds the imported corpus', async ({ request }) => {
    // Straight at the worker, so a UI regression cannot mask an empty index and
    // an empty index cannot hide behind a rendering quirk.
    const res = await request.post(SEARCH_API, {
      data: { query: 'Heldenbar', hitsPerPage: 5 },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();

    // `totalHits > 0` PROVES NOTHING here and asserting it was a bug in the
    // first version of this file. search_hybrid fuses keyword with vector
    // similarity, and the vector arm always returns its nearest neighbours —
    // measured, the query "zzqxwvunlikely" comes back with 181 hits. The claim
    // has to be that a returned row is actually the thing asked for.
    const hits: { type?: string; title?: string }[] = body.hits ?? [];
    expect(hits.some((h) => h.type === 'event' && /heldenbar/i.test(h.title ?? ''))).toBe(true);
  });

  test('Zurich city page carries imported content', async ({ page }) => {
    await page.goto('/city/zurich');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });

    // Real content links, not the word "venue" somewhere in the chrome — the
    // header nav alone would satisfy a text match. Zurich is where 2,814 of the
    // imported events landed; a page with no venue link at all means the city
    // link broke upstream.
    await expect(page.locator('a[href^="/venues/"]').first()).toBeVisible({ timeout: 30_000 });
  });
});
