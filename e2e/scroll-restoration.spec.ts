import { test, expect, type Page } from '@playwright/test';

/**
 * Where a navigation leaves the reader.
 *
 * The defect this guards: `<BrowserRouter>` is not a data router, so
 * react-router does no scroll management, and nothing else in the app reset
 * the offset either — `history.pushState` simply kept it. Following a link
 * from halfway down a listing opened the destination halfway down, and since
 * destinations are usually SHORTER than the page they were reached from, the
 * browser clamped that offset to the maximum and the reader landed on the
 * footer. Measured on the running app at 1440x900 before the fix:
 *
 *   /about at y=4163  -> click /venues -> y=2567 of maxY 2567
 *   /venues at bottom -> click /cities -> y=2042 of maxY 2042
 *
 * The rules live in src/lib/scrollBehavior.ts and are unit-tested there. This
 * spec exercises them through a real browser, where the parts that cannot be
 * unit-tested — clamping, lazy route chunks, async content — are real.
 */

const scroll = (page: Page) =>
  page.evaluate(() => ({
    y: Math.round(window.scrollY),
    maxY: document.documentElement.scrollHeight - window.innerHeight,
  }));

/**
 * Wait until the route actually has something to scroll. A fixed delay is not
 * enough here: routes are lazy and their data is async, so /venues can still
 * be 78px of skeleton a second after navigation — and a test that scrolls a
 * skeleton measures nothing.
 */
const waitForScrollable = async (page: Page, minMaxY = 600) => {
  await page.waitForFunction(
    (min) => document.documentElement.scrollHeight - window.innerHeight >= min,
    minMaxY,
    { timeout: 20_000 },
  );
};

const toBottom = async (page: Page) => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
};

/**
 * Follow an in-app link by clicking it, so this goes through react-router
 * rather than a full document load — a full load resets the offset by itself
 * and would pass even with the bug present.
 */
const followLink = async (page: Page, href: string) => {
  const link = page.locator(`a[href="${href}"]`).first();
  await expect(link).toHaveCount(1);
  await link.evaluate((a: HTMLElement) => a.click());
  await page.waitForURL(`**${href}`);
  await page.waitForTimeout(1200);
};

test.describe('scroll on navigation', () => {
  test('a link from a scrolled page opens the destination at its top', async ({ page }) => {
    await page.goto('/about');
    await waitForScrollable(page);

    // Warm both route chunks first. With a cold chunk the Suspense fallback
    // collapses the document to almost nothing, which clamps the offset to ~0
    // and hides the bug — so an unwarmed run would pass either way.
    await followLink(page, '/venues');
    await followLink(page, '/about');

    await waitForScrollable(page);
    await toBottom(page);
    expect((await scroll(page)).y).toBeGreaterThan(400);

    await followLink(page, '/venues');
    expect((await scroll(page)).y).toBe(0);
  });

  test('back returns the reader to where they stopped reading', async ({ page }) => {
    await page.goto('/venues');
    await waitForScrollable(page);
    await toBottom(page);
    const left = (await scroll(page)).y;
    expect(left).toBeGreaterThan(400);

    await followLink(page, '/cities');
    expect((await scroll(page)).y).toBe(0);

    await page.goBack();
    await page.waitForTimeout(1500);
    // Within a line or two — the restore settles as the list re-renders.
    expect(Math.abs((await scroll(page)).y - left)).toBeLessThanOrEqual(40);
  });

  test('forward opens a page the reader has not read at its top', async ({ page }) => {
    await page.goto('/venues');
    await waitForScrollable(page);
    await toBottom(page);
    await followLink(page, '/cities');
    await page.goBack();
    await page.waitForTimeout(1200);

    await page.goForward();
    await page.waitForTimeout(1500);
    expect(page.url()).toContain('/cities');
    expect((await scroll(page)).y).toBe(0);
  });

  test('changing a filter issues no scroll of its own', async ({ page }) => {
    // ~90 of the app's ~103 setSearchParams call sites push a history entry
    // for a same-page state change. A location-keyed reset — the usual patch
    // for the bug above — would jump the page on every one of them.
    //
    // This asserts on the COMMAND, not the resulting offset: a filtered list
    // empties before it refills, so the browser clamps the offset to 0 and
    // back on its own, and any assertion about where the page ends up is
    // measuring content rather than navigation. What belongs to this code is
    // whether it asked the page to move at all.
    await page.goto('/venues');
    await waitForScrollable(page);
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(300);
    expect((await scroll(page)).y).toBeGreaterThan(0);

    await page.evaluate(() => {
      (window as unknown as { __scrollCalls: number[] }).__scrollCalls = [];
      const real = window.scrollTo.bind(window);
      window.scrollTo = ((...args: unknown[]) => {
        (window as unknown as { __scrollCalls: number[] }).__scrollCalls.push(
          typeof args[1] === 'number' ? (args[1] as number) : -1,
        );
        return (real as (...a: unknown[]) => void)(...args);
      }) as typeof window.scrollTo;
    });

    const filter = page.getByRole('button', { name: 'Sauna', exact: true });
    await expect(filter).toHaveCount(1);
    await filter.click();
    await page.waitForURL('**/venues?*');
    await page.waitForTimeout(1500);

    const calls = await page.evaluate(
      () => (window as unknown as { __scrollCalls: number[] }).__scrollCalls,
    );
    expect(calls).toEqual([]);
  });
});
