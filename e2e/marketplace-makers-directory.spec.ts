import { test, expect } from '@playwright/test';

/**
 * The makers directory end to end, against the DEPLOYED site.
 *
 * Three separate changes landed on /marketplace/brands in quick succession and
 * each one is only provable in a browser against real data:
 *
 *   1. The four-band rebuild (#3763) — the page was 885 near-empty cards built
 *      around a `story` field that 24 of 885 brands have, while SFW listing
 *      imagery (671 of 885) was never queried at all.
 *   2. The "#" bucket filing last (#3764) — `localeCompare` sorts digits before
 *      "A", so switching to A–Z opened the index on the junkiest names we hold.
 *   3. The feed-ID retirement (#3776) — a merchant put purchase-order numbers in
 *      Shopify's `vendor` field, and because `brand_key` is GENERATED over it,
 *      each PO number MINTED A MAKER PAGE. 20 of them.
 *
 * **This spec belongs to the NIGHTLY suite, not `e2e-pr.yml`.** Nightly runs the
 * whole directory against `https://queer.guide`, so it is picked up with no
 * registration. The PR job serves a local `vite preview` against the live
 * backend, and three things here would be wrong there: the cover thumbnails are
 * mirrored on `img.queer.guide`, which is Referer-gated and answers `1011` to
 * anything that is not the real origin; the counts below are prod's; and the
 * retired-maker URLs only 404 because prod's data says so.
 *
 * EVERY ABSENCE CHECK CARRIES A PRESENCE CONTROL. "The junk makers are gone"
 * passes just as well when the whole site is down, when the route stopped
 * resolving, or when the brand query silently returns nothing for everyone —
 * so each one is paired with a live maker that must still render. That pairing
 * is the entire reason this file is longer than it looks like it needs to be.
 */

/** Feed-ID artifacts retired by `99100101143000`. Their pages must be gone. */
const RETIRED_MAKERS = ['12807-203758186', '19868-001638740', '9781728209982'];

/** Real makers. Every absence assertion is paired against one of these. */
const LIVE_MAKERS = ['cherrykitten', 'tomboyx'];

/**
 * The brand query resolves through an RPC and is measurably slow on a cold
 * edge cache — observed at ~6s on prod. Assertions below wait on the settled
 * state rather than sampling early: a first draft read the DOM at 2.5s, found
 * an empty `<main>` and no robots tag, and would have reported a soft-404
 * regression that does not exist.
 */
const SETTLE = 20_000;

test.describe('makers directory', () => {
  test('opens on the four bands, with product covers that actually load', async ({ page }) => {
    await page.goto('/marketplace/brands');

    await expect(page.getByRole('heading', { name: 'Most listings' })).toBeVisible({
      timeout: SETTLE,
    });
    await expect(page.getByRole('heading', { name: 'Every other maker' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Everything on the line' })).toBeVisible();

    // The counter is the one image-bearing band. Assert the images DECODED,
    // not that <img> tags exist — a 1011 from the mirror still leaves the tag
    // in the DOM, and `BrandMark`'s onError deliberately hides a failed logo,
    // so a tag count would stay green through exactly the failure that matters.
    const decoded = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('main img')];
      return {
        total: imgs.length,
        broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
      };
    });
    expect(decoded.total).toBeGreaterThan(20);
    expect(decoded.broken).toBe(0);
  });

  test('the counter hides while filtering, and its makers rejoin the index', async ({ page }) => {
    // The band is the head of the CATALOGUE, not of the RESULTS. Left up, it
    // puts twelve unrelated makers above a search for something else. But they
    // must not simply vanish either — a maker that is featured AND filtered out
    // would be unreachable by the very search meant to find it.
    await page.goto('/marketplace/brands');
    await expect(page.getByRole('heading', { name: 'Most listings' })).toBeVisible({
      timeout: SETTLE,
    });

    await page.getByPlaceholder('Search makers').fill('cherrykitten');

    await expect(page.getByRole('heading', { name: 'Most listings' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'cherrykitten', exact: true })).toBeVisible();
  });

  test('files "#" at the END of the A–Z index, and does not empty it', async ({ page }) => {
    await page.goto('/marketplace/brands');
    await expect(page.getByRole('heading', { name: 'Most listings' })).toBeVisible({
      timeout: SETTLE,
    });

    await page.getByRole('button', { name: 'A–Z' }).click();
    await expect(page.getByRole('navigation', { name: /Jump to letter/i })).toBeVisible();

    // THE REGRESSION: localeCompare alone put "#" first, so the index opened on
    // the junkiest names in the catalogue.
    const headings = await page.locator('main h3').allTextContents();
    expect(headings.length).toBeGreaterThan(0);
    expect(headings[0]).toBe('A');
    expect(headings).not.toContain('#');

    // "#" is deliberately NOT in that list. The floor renders 120 rows before
    // "Show more" and "#" sorts last, so it is now eight pages down — which is
    // the point, but it also means the ordering assertion above cannot double
    // as proof the bucket survived. The letter bar is its real access path, so
    // the control goes through that.
    await page.getByRole('button', { name: 'Filter by #' }).click();

    // The one row left in "#" is "1979 SAS (Teil der Marc Dorcel Group)", a
    // real company. An EMPTY bucket would mean the feed-ID retirement had
    // over-reached and swept a legitimate brand with it — and a "# sorts last"
    // assertion on its own would call that a pass.
    await expect(page.locator('main h3')).toHaveText(['#']);
    await expect(page.getByRole('link', { name: /1979 SAS/ })).toBeVisible();

    // And no feed-ID artifact came back with it.
    await expect(page.getByRole('link', { name: /^\d{4,}[- ]\d+/ })).toHaveCount(0);
  });

  for (const slug of RETIRED_MAKERS) {
    test(`retired feed-ID maker /${slug} is gone and noindexed`, async ({ page }) => {
      await page.goto(`/marketplace/brands/${slug}`);

      await expect(page.getByRole('heading', { name: 'No maker here.' })).toBeVisible({
        timeout: SETTLE,
      });

      // A dead brand page that 200s without a robots tag is a soft-404 — worse
      // for the index than a real 404, because it looks alive to a crawler.
      const robots = page.locator('meta[name="robots"]');
      await expect(robots).toHaveAttribute('content', 'noindex,nofollow');

      // The escape hatch is the whole reason /marketplace/brands was built.
      await expect(page.getByRole('link', { name: 'All makers' })).toBeVisible();
    });
  }

  for (const slug of LIVE_MAKERS) {
    test(`live maker /${slug} still renders — the control for the retirements`, async ({
      page,
    }) => {
      await page.goto(`/marketplace/brands/${slug}`);

      await expect(page.getByRole('heading', { name: 'No maker here.' })).toBeHidden({
        timeout: SETTLE,
      });
      await expect(page.locator('main h1')).toContainText(/\w/, { timeout: SETTLE });

      // A live maker must NOT be noindexed. Without this the retirement tests
      // above would still pass if someone noindexed the whole route.
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });
  }

  test('no interactive element is nested inside the row links', async ({ page }) => {
    // Ownership badges sit inside each index row, so the link has to be an
    // absolute overlay sibling. A wrapper is `nested-interactive` — axe
    // serious, WCAG 4.1.2.
    await page.goto('/marketplace/brands');
    await expect(page.getByRole('heading', { name: 'Every other maker' })).toBeVisible({
      timeout: SETTLE,
    });

    const nested = await page.evaluate(() => {
      const sel = 'a,button,input,select,textarea,[role="button"],[role="link"]';
      return [...document.querySelectorAll('main a')].filter((a) => a.querySelector(sel)).length;
    });
    expect(nested).toBe(0);
  });
});
