import { test, expect, type Page } from '@playwright/test';

/**
 * /events "Load more" must page WITHIN the active filter set.
 *
 * The bug: the Load-more handler passed a literal `{}` as the filter argument
 * while passing `append: true`, so page 2 was an unfiltered query whose rows
 * were added UNDER a filtered page 1 — filter to one city, click Load more,
 * and events from everywhere appear below the fold. Reproduced against prod on
 * 2026-09-12 before the fix: page 1 carried `or=(city.ilike.Berlin)`, the
 * Load-more query carried no city predicate at all.
 *
 * This runs against the REAL backend (playwright.config.ts defaults `baseURL`
 * to https://queer.guide), which is what the unit guard
 * (src/pages/__tests__/Events.filterCallSites.test.tsx) cannot do: that one
 * mocks `useEvents`, so it proves what the page ASKS for, not what comes back.
 *
 * IT ASSERTS ON THE OUTGOING QUERY, not on rendered card text. A city-filtered
 * feed mostly renders the VENUE name as a card's subtitle, and a row with a
 * null `city` renders no city at all — so "no card names another city" is
 * satisfied by a broken page. The city predicate in the request URL is the only
 * unambiguous record of what was asked for.
 *
 * `/events` sets `sort` on every query, which forces `useEvents` down the
 * client-query branch rather than the `search_events` RPC, so both pages are
 * GETs to `/rest/v1/events` carrying `or=(city.ilike.<city>)`.
 */

const PAGE_SIZE = 24;

/**
 * Tried in order until one yields a second page. Deliberately a LIST and
 * probed through the app itself rather than one hardcoded city with a measured
 * count: "Berlin has 661 upcoming events" is true today and is exactly the kind
 * of pinned value that rots into a red check for a data reason.
 */
const CANDIDATE_CITIES = ['Berlin', 'Zürich', 'London', 'New York', 'Madrid', 'Barcelona'];

type Query = { url: string; city: string | null; offset: string | null };

/** The city predicate, or null when the query carried none — the defect. */
function cityPredicate(url: string): string | null {
  const m = decodeURIComponent(url).match(/or=\(city\.ilike\.[^)]*\)/);
  return m ? m[0] : null;
}

function collectEventQueries(page: Page): Query[] {
  const queries: Query[] = [];
  page.on('request', (r) => {
    const url = r.url();
    if (r.method() !== 'GET' || !/\/rest\/v1\/events\?/.test(url)) return;
    queries.push({
      url,
      city: cityPredicate(url),
      offset: new URL(url).searchParams.get('offset'),
    });
  });
  return queries;
}

test.describe('/events Load more', () => {
  test('pages within the city filter instead of appending unfiltered rows', async ({ page }) => {
    const queries = collectEventQueries(page);

    let city: string | null = null;
    for (const candidate of CANDIDATE_CITIES) {
      queries.length = 0;
      await page.goto(`/events?cities=${encodeURIComponent(candidate)}`, { waitUntil: 'commit' });

      // Page 1 must actually be city-scoped before anything below means
      // something: if the filter never applied, "page 2 matches page 1" is
      // vacuously true. This is the same control the unit guard carries.
      await expect
        .poll(() => queries.filter((q) => q.city?.includes(candidate)).length, { timeout: 45_000 })
        .toBeGreaterThan(0);

      if (await page.getByRole('button', { name: /load more/i }).isVisible()) {
        city = candidate;
        break;
      }
    }

    // A hard failure, not a skip. If no candidate city has more than one page
    // of upcoming events, this guard can no longer observe the defect, and
    // passing quietly would retire the only prod-side check on it.
    expect(
      city,
      `no "Load more" on any of ${CANDIDATE_CITIES.join(', ')} — each returned under ` +
        `${PAGE_SIZE} upcoming events, so this spec can no longer reach page 2`,
    ).not.toBeNull();

    const pageOne = queries.filter((q) => q.city?.includes(city!)).at(-1)!;
    const before = queries.length;

    await page.getByRole('button', { name: /load more/i }).click();
    await expect.poll(() => queries.length, { timeout: 45_000 }).toBeGreaterThan(before);

    const pageTwo = queries.slice(before).find((q) => q.offset === String(PAGE_SIZE));
    expect(
      pageTwo,
      `Load more issued no offset=${PAGE_SIZE} query; saw ` +
        JSON.stringify(queries.slice(before).map((q) => q.url)),
    ).toBeTruthy();

    // The property, not a pinned string: whatever page 1 constrained, page 2
    // must constrain identically. Appending rows from a different query is the
    // defect, and `null` here is exactly the shape the bug produced.
    expect(pageTwo!.city, `page 2 dropped the ${city} filter`).toBe(pageOne.city);
  });
});
