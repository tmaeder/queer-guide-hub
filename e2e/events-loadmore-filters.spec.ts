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
  // postgrest-js builds the URL with URLSearchParams, which encodes a space
  // as "+" — and decodeURIComponent leaves "+" alone, so "New York" never
  // matched and the candidate loop failed there.
  const m = decodeURIComponent(url.replace(/\+/g, ' ')).match(/or=\(city\.ilike\.[^)]*\)/);
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

// THE POLLS COULD NEVER USE THEIR OWN BUDGET, which is what made this flaky.
//
// Both `expect.poll`s below allow 45s inside a test that ran on Playwright's
// default 30s timeout, so under a slow prod the TEST died first and reported the
// poll's last value. That is exactly the pairing seen on the 2026-10-17 prod run
// and in one local run: "Received: 0" alongside "Test timeout of 30000ms
// exceeded" — a timeout wearing a failed-assertion's clothes.
//
// It is not a data problem: with the test's own collector replicated, the
// city-scoped query (`or=(city.ilike.Berlin)`) arrives within 3 seconds and the
// match count is 1, and the spec passes in ~2s on a warm prod. Measured.
//
// 120_000 matches tags-release-prod.spec.ts and covers the worst case this test
// can reach: up to six candidate cities, each a navigation plus a 45s poll.
test.describe('/events Load more', () => {
  test.setTimeout(120_000);

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

      // isVisible() does not wait: the request above lands before the grid
      // and its Load more render, so every city read as "one page only".
      const hasMore = await page
        .getByRole('button', { name: /load more/i })
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(
          () => true,
          () => false,
        );
      if (hasMore) {
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

    const pageOne = queries.find((q) => q.offset === '0' && q.city?.includes(city!));
    expect(pageOne, 'no offset=0 city-scoped page 1 query was seen').toBeTruthy();
    const before = queries.length;

    await page.getByRole('button', { name: /load more/i }).click();
    await expect
      .poll(() => queries.slice(before).filter((q) => Number(q.offset) > 0).length, {
        timeout: 45_000,
      })
      .toBeGreaterThan(0);

    // LoadMore's sentinel auto-loads up to two pages before the button is the
    // only trigger (autoLoadLimit=2), so page 2 is usually already in flight by
    // the time the button shows, and the click asks for offset 72, not 24.
    // Every appended page — auto-loaded or clicked — must constrain exactly as
    // page 1 did. Appending rows from a different query is the defect, and
    // `null` is exactly the shape the bug produced.
    const appended = queries.filter((q) => Number(q.offset) >= PAGE_SIZE);
    expect(appended.length, 'no appended page query was seen').toBeGreaterThan(0);
    for (const q of appended) {
      expect(q.city, `offset=${q.offset} dropped the ${city} filter: ${q.url}`).toBe(pageOne!.city);
    }
  });
});
