import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

/**
 * The output-level guard for the analytics consent gate.
 *
 * Every unit test in this area asserts a module's behaviour. This asserts the
 * only thing that actually matters: whether a request leaves the browser. All
 * of the following were TRUE in production on 2026-09-12 and every unit test in
 * the repo was green:
 *
 *  - A visitor who had granted no consent at all was tracked on every route
 *    change, because `AnalyticsTracker` called the ingest edge function
 *    directly, past the consent-gated loader. 398,018 of 402,364 sessions.
 *  - Every page view was recorded twice, because that tracker ran alongside
 *    `public/umami.js`. Reproduced by hand: one visit to /travel with six
 *    scroll steps produced 22 beacons, 11 per pipeline.
 *  - Scrolling one article produced a beacon per section boundary, because the
 *    editorial scroll-spy writes ?section= on a 300ms debounce and the tracker
 *    patched `replaceState`. /travel alone: 268,313 views across 981 sessions
 *    in 30 days.
 *  - A visitor who accepted could not withdraw: `resetConsent` had zero call
 *    sites and the preferences dialog was only reachable from a banner that
 *    never renders again.
 *
 * The "necessary only" case below is the one that would have caught the first
 * of those, and it is the reason this spec runs on pull requests rather than
 * only nightly.
 */

const INGEST = /\/api\/track|\/functions\/v1\/umami-analytics/;

/** Count every analytics beacon the page attempts, by pipeline. */
function countBeacons(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (INGEST.test(r.url())) urls.push(r.url());
  });
  return {
    get all() {
      return urls;
    },
    /** Through the consent-gated first-party proxy. */
    get proxied() {
      return urls.filter((u) => u.includes('/api/track'));
    },
    /** Straight at the edge function — the bypass. */
    get direct() {
      return urls.filter((u) => u.includes('/functions/v1/umami-analytics'));
    },
    reset() {
      urls.length = 0;
    },
  };
}

const CONSENT_KEY = 'queer-guide-cookie-consent';

/**
 * Present as an ordinary visitor.
 *
 * `public/umami.js` refuses to track any client with `navigator.webdriver`,
 * which Playwright sets on itself — so WITHOUT this, every assertion in this
 * file that expects zero beacons passes whether or not the consent gate works
 * at all. Five of the six tests here did exactly that on the first run, and the
 * only reason it surfaced is that the one test expecting a NON-zero count got
 * zero too.
 *
 * A test that cannot fail is worse than no test, so consent is isolated as the
 * only variable, and the automation exclusion gets its own case below.
 */
async function presentAsHuman(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { value: false, configurable: true });
  });
}

async function storeConsent(page: Page, analytics: boolean) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          version: '1.0',
          preferences: {
            necessary: true,
            functional: true,
            analytics: value as boolean,
            marketing: false,
          },
          timestamp: new Date().toISOString(),
        }),
      );
    },
    [CONSENT_KEY, analytics] as const,
  );
}

/** The tracker fires 300ms after a navigation; give it room and then some. */
async function settle(page: Page) {
  await page.waitForTimeout(1500);
}

/**
 * Wait until the page view for the CURRENT navigation has actually been sent,
 * then clear the counter — so what follows measures only what follows.
 *
 * `settle()` alone is a race. Against a local `vite preview` 1.5s is plenty,
 * but run against production the 300ms tracker delay plus real network latency
 * can exceed it, and the initial beacon then lands AFTER the reset and is
 * counted as if the scroll produced it. That is exactly how the scroll test
 * failed once and passed on rerun against live prod — a flaky guard, which is
 * worse than none, because people learn to re-run it instead of reading it.
 */
async function awaitInitialBeaconThenReset(
  page: Page,
  beacons: { all: string[]; reset: () => void },
) {
  await expect
    .poll(() => beacons.all.length, { timeout: 10_000 })
    .toBeGreaterThan(0);
  await settle(page);
  beacons.reset();
}

test.describe('analytics consent gate', () => {
  test('no stored consent → nothing is tracked and window.umami never exists', async ({ page }) => {
    await presentAsHuman(page);
    const beacons = countBeacons(page);

    for (const path of ['/', '/venues', '/events']) {
      await page.goto(path);
      await waitForAppReady(page);
      await settle(page);
    }

    expect(
      beacons.all,
      'a visitor who has not consented must not be tracked at all',
    ).toHaveLength(0);
    expect(await page.evaluate(() => typeof (window as { umami?: unknown }).umami)).toBe(
      'undefined',
    );
  });

  test('necessary-only consent → still nothing is tracked', async ({ page }) => {
    // THE CASE THAT WOULD HAVE CAUGHT THE BYPASS. An explicit refusal is
    // stronger than no answer, and the deleted tracker ignored both.
    await presentAsHuman(page);
    await storeConsent(page, false);
    const beacons = countBeacons(page);

    for (const path of ['/', '/venues']) {
      await page.goto(path);
      await waitForAppReady(page);
      await settle(page);
    }

    expect(beacons.all, 'analytics was explicitly refused').toHaveLength(0);
  });

  test('Do Not Track wins over consent', async ({ page }) => {
    await presentAsHuman(page);
    await storeConsent(page, true);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true });
      Object.defineProperty(window, 'doNotTrack', { value: '1', configurable: true });
    });
    const beacons = countBeacons(page);

    await page.goto('/');
    await waitForAppReady(page);
    await settle(page);

    expect(beacons.all, 'DNT is a refusal even when the banner was accepted').toHaveLength(0);
  });

  test('consent granted → exactly one beacon per page, all through the proxy', async ({
    page,
  }) => {
    await presentAsHuman(page);
    await storeConsent(page, true);
    const beacons = countBeacons(page);

    await page.goto('/');
    await waitForAppReady(page);
    await settle(page);
    const afterHome = beacons.all.length;

    await page.goto('/venues');
    await waitForAppReady(page);
    await settle(page);

    // One per page view, not two. The duplicate came from a second pipeline
    // running beside the script.
    expect(beacons.all.length, 'one page view is one beacon').toBe(2);
    expect(afterHome, 'the first page view is also a single beacon').toBe(1);

    // And all of them carry edge geo, because they went through /api/track.
    // A beacon straight at the edge function is the bypass, by definition.
    expect(beacons.direct, 'nothing may reach the ingest function directly').toHaveLength(0);
    expect(beacons.proxied).toHaveLength(2);
  });

  test('scrolling one article is one page view, not one per section', async ({ page }) => {
    await presentAsHuman(page);
    await storeConsent(page, true);
    const beacons = countBeacons(page);

    await page.goto('/travel');
    await waitForAppReady(page);
    // Deterministic: wait for THIS navigation's beacon before zeroing, so a
    // slow network cannot make the page-view land inside the scroll window.
    await awaitInitialBeaconThenReset(page, beacons);

    // Walk the whole page the way a reader does. Every section boundary used
    // to write ?section= and every write used to be counted.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let i = 1; i <= 10; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y }), (height * i) / 10);
      await page.waitForTimeout(700);
    }
    await settle(page);

    expect(
      beacons.all,
      'reading one article must not emit a beacon per section passed',
    ).toHaveLength(0);
  });

  test('an automated client is not tracked even with full consent', async ({ page }) => {
    // Deliberately does NOT call presentAsHuman: Playwright's own
    // navigator.webdriver is the input under test. Our nightly e2e and any
    // Lighthouse run must not land in the traffic numbers.
    await storeConsent(page, true);
    const beacons = countBeacons(page);

    await page.goto('/');
    await waitForAppReady(page);
    await settle(page);

    expect(beacons.all, 'navigator.webdriver is a declaration of automation').toHaveLength(0);
  });

  test('the cookie preferences dialog is reachable after a choice is stored', async ({ page }) => {
    // Before the footer entry point existed, a visitor who pressed "Accept All"
    // had no way back into this dialog from anywhere in the UI.
    await presentAsHuman(page);
    await storeConsent(page, true);
    await page.goto('/');
    await waitForAppReady(page);

    const opener = page.getByRole('button', { name: /cookie preferences/i });
    await expect(opener, 'the footer must expose a way back into consent').toBeVisible();
    await opener.click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /necessary only/i })).toBeVisible();
  });
});
