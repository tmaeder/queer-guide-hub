import { test, expect, type Request } from '@playwright/test';
import { E2E_UA_MARKER } from './support/e2eUserAgent';

/**
 * A spec run against prod must not add reader rows to the search analytics.
 *
 * Measured 2026-11-27: before the 2026-11-05 logging gate every search was
 * logged, and e2e runs supplied, among others, all 182 "gay bars in lisbon"
 * rows (e2e/assistant-chat.spec.ts) and 2,393 "berlin" rows. Two layers now
 * keep automated searches out:
 *
 *  1. The page. `analyticsAllowed()` is false when `navigator.webdriver` is
 *     set, so a Playwright browser never sends `X-Search-Analytics: 1`, even
 *     with analytics cookies accepted, and the worker does not log.
 *  2. The worker. Anything that opts in anyway (a script, an agent-driven
 *     browser) is tagged from its user agent into
 *     `search_queries.synthetic_reason` (99991795782051). This suite's agent
 *     carries `QueerGuideE2E/1` (playwright.config.ts).
 *
 * The read-backs need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Without them
 * the first test still checks layer 1 from the browser, and the second test
 * skips: it writes a row on purpose, so it must not run where nobody can check
 * the row.
 */

const RUN = Date.now().toString(36);
const PROBE = `qg e2e analytics probe ${RUN}`;
const SEARCH_ORIGIN = process.env.E2E_SEARCH_URL ?? 'https://search.queer.guide';
const SITE_ORIGIN = new URL(process.env.E2E_BASE_URL ?? 'https://queer.guide').origin;

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canReadBack = Boolean(SUPABASE_URL && SERVICE_KEY);

async function rowsFor(prefix: string) {
  const params = new URLSearchParams({
    select: 'query,synthetic_reason',
    query: `like.${prefix}*`,
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/search_queries?${params}`, {
    headers: { apikey: SERVICE_KEY!, authorization: `Bearer ${SERVICE_KEY}` },
  });
  expect(res.ok, `read back search_queries: HTTP ${res.status}`).toBe(true);
  return (await res.json()) as Array<{ query: string; synthetic_reason: string | null }>;
}

const isSearchPost = (req: Request) =>
  req.method() === 'POST' &&
  req.url().startsWith(SEARCH_ORIGIN) &&
  new URL(req.url()).pathname === '/';

test.describe('search analytics: automated traffic', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the browser suite never opts its searches into logging', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'queer-guide-cookie-consent',
        JSON.stringify({
          preferences: { necessary: true, functional: true, analytics: true, marketing: false },
          version: '1.0',
          timestamp: new Date(0).toISOString(),
        }),
      );
    });

    const searches: Request[] = [];
    page.on('request', (req) => {
      if (isSearchPost(req)) searches.push(req);
    });
    // One search response, read before anything else is asserted.
    const answered = () =>
      page.waitForResponse((res) => isSearchPost(res.request()) && res.ok(), { timeout: 30_000 });

    // A scoped tab: the grouped "All" view is never logged, so it would make
    // this pass for the wrong reason.
    const first = answered();
    await page.goto(`/search?q=${encodeURIComponent(PROBE)}&types=venue`);
    const sessionHeader = (await first).headers()['x-search-session'];
    const input = page.getByRole('searchbox', { name: /refine your search/i });
    await expect(input).toBeVisible({ timeout: 20_000 });
    // The page opts in only after the worker has answered once, so search again.
    const second = answered();
    await input.fill(`${PROBE} again`);
    await input.press('Enter');
    await second;

    // Positive controls: consent is stored, the worker offered sessions, and the
    // agent carries the marker. Without these, "no opt-in header" proves nothing.
    expect(await page.evaluate(() => localStorage.getItem('queer-guide-cookie-consent'))).toContain(
      '"analytics":true',
    );
    expect(sessionHeader, 'the worker answered with X-Search-Session: v2').toBe('v2');
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    expect(await page.evaluate(() => navigator.userAgent)).toContain(E2E_UA_MARKER);

    const optedIn = searches.filter((req) => req.headers()['x-search-analytics'] === '1');
    expect(
      optedIn.map((r) => r.postData()),
      'searches sent with X-Search-Analytics',
    ).toEqual([]);

    if (canReadBack) {
      // Give a waitUntil write time to land before asserting there is none.
      await page.waitForTimeout(5_000);
      expect(await rowsFor(PROBE)).toEqual([]);
    }
  });

  test('a search that opts in anyway is logged as synthetic', async ({ request }) => {
    test.skip(
      !canReadBack,
      'writes a row on purpose; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to check it',
    );
    const query = `${PROBE} direct`;
    // What a script, or a browser without navigator.webdriver, can send. The
    // request fixture uses the config's marked user agent.
    const res = await request.post(`${SEARCH_ORIGIN}/`, {
      headers: {
        Origin: SITE_ORIGIN,
        'X-Search-Analytics': '1',
        'Content-Type': 'application/json',
      },
      data: { query, filters: { types: ['venue'] }, hitsPerPage: 5, page: 0 },
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['x-search-session'], 'the worker took the logging path').toBe('v2');

    await expect
      .poll(async () => (await rowsFor(query)).length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    const rows = await rowsFor(query);
    expect(
      rows.filter((r) => r.synthetic_reason === null),
      'untagged rows',
    ).toEqual([]);
    expect(rows.map((r) => r.synthetic_reason)).toEqual(rows.map(() => 'e2e'));
  });
});
