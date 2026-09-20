import { test, expect } from '@playwright/test';

/**
 * The makers directory end to end, against the DEPLOYED site.
 *
 * Four separate changes landed on /marketplace/brands in quick succession and
 * each one is only provable in a browser against real data:
 *
 *   1. The four-band rebuild (#3763) — the page was 885 near-empty cards built
 *      around a `story` field that 24 of 885 brands have, while SFW listing
 *      imagery (671 of 885) was never queried at all.
 *   1b. The rotating counter (#3805) RENAMED the first band. "Most listings"
 *      is gone, and deliberately so: the band rotates daily over everyone who
 *      qualifies, so a ranking word would be false and a curation word would
 *      claim an editorial judgement nobody made. The heading lives in
 *      COUNTER_BAND below rather than inline — this spec shipped with the old
 *      string repeated four times and every one of them broke at once.
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
 * The counter band's heading. ONE constant, because the four inline copies of
 * its predecessor ("Most listings") all broke together when #3805 renamed it,
 * and this spec runs only in the NIGHTLY suite — so PR CI reported green and
 * the breakage would have surfaced a day later against prod.
 */
const COUNTER_BAND = 'On the counter today';

/**
 * The brand query resolves through an RPC and is measurably slow on a cold
 * edge cache — observed at ~6s on prod. Assertions below wait on the settled
 * state rather than sampling early: a first draft read the DOM at 2.5s, found
 * an empty `<main>` and no robots tag, and would have reported a soft-404
 * regression that does not exist.
 */
const SETTLE = 20_000;

test.describe('makers directory', () => {
  // POSITIVE CONTROL for the two `for...of` blocks below. Emptying either array
  // deletes its generated tests, and the suite then reports green on 7 of 9 —
  // measured, not hypothetical. An absence check whose presence control can be
  // deleted without a failure is the defect this file exists to refuse.
  test('the fixtures are non-empty', () => {
    expect(RETIRED_MAKERS.length).toBeGreaterThan(0);
    expect(LIVE_MAKERS.length).toBeGreaterThan(0);
  });

  test('opens on the four bands, with product covers that actually load', async ({ page }) => {
    await page.goto('/marketplace/brands');

    await expect(page.getByRole('heading', { name: COUNTER_BAND })).toBeVisible({
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
    // puts unrelated makers above a search for something else. But they must
    // not simply vanish either — a maker that is on the counter AND filtered
    // out would be unreachable by the very search meant to find it.
    //
    // No count is asserted here on purpose: #3805 made the band rotate daily,
    // so the size is not a fixed property of the page.
    await page.goto('/marketplace/brands');
    await expect(page.getByRole('heading', { name: COUNTER_BAND })).toBeVisible({
      timeout: SETTLE,
    });

    await page.getByPlaceholder('Search makers').fill('cherrykitten');

    await expect(page.getByRole('heading', { name: COUNTER_BAND })).toBeHidden();
    await expect(page.getByRole('link', { name: 'cherrykitten', exact: true })).toBeVisible();
  });

  test('files "#" at the END of the A–Z index, and publishes no feed-ID artifact', async ({
    page,
  }) => {
    await page.goto('/marketplace/brands');
    await expect(page.getByRole('heading', { name: COUNTER_BAND })).toBeVisible({
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

    // THE RETIREMENT GUARD, asserted over the WHOLE index rather than inside the
    // "#" bucket. Until 2026-09-19 this clicked "Filter by #" and required the
    // one row there — "1979 SAS (Teil der Marc Dorcel Group)" — on the reasoning
    // that an empty bucket would mean the feed-ID retirement had swept a real
    // brand with it. That control is gone, and NOT because anything over-reached:
    // migration 99991789846273 renamed the row to its actual brand, DORCEL,
    // because the vendor field held a legal entity rather than a maker. The row
    // is `status='approved'` with 4 listings and now sorts under D, so "#" is
    // legitimately empty — measured, 0 of 862 live makers sort to it.
    //
    // A control anchored to one row dies the moment that row is correctly
    // edited. The INVARIANT the retirement actually protects survives any
    // rename: no purchase-order number is published as a maker, anywhere. That
    // is asserted here across the index. (This comment read "strictly stronger
    // than the one-row bucket it replaces" until the two concurrent fixes were
    // merged; it is broader, but not strictly stronger — see the note below the
    // assertion.)
    await expect(page.getByRole('link', { name: /^\d{4,}[- ]\d+/ })).toHaveCount(0);

    // PRESENCE CONTROL for the line above: "no artifacts" passes just as well on
    // an index that renders nothing at all, which is exactly how this spec's
    // sibling assertions have failed before.
    //
    // Counted by HREF, never by link text. A maker row's click target is the
    // absolutely-positioned overlay sibling this repo uses for every card, so it
    // carries an aria-label and NO text content — a `hasText` filter matches
    // zero of the 132 links the page actually renders, which is how the first
    // draft of this control failed against a perfectly healthy index.
    const makerLinks = await page.locator('main a[href^="/marketplace/brands/"]').count();
    expect(makerLinks).toBeGreaterThan(20);

    // BOTH halves are kept, and they are NOT redundant. Two sessions fixed the
    // same stale assertion at once, and the sweep above only sees rows the page
    // has RENDERED — while "#" sorts LAST, past the 120-row floor, which is
    // precisely where a digit-named artifact lands. Drop the bucket check below
    // and the sweep silently stops covering the one bucket that matters.
    // "#" is deliberately NOT in that list. The floor renders 120 rows before
    // "Show more" and "#" sorts last, so it is now eight pages down — which is
    // the point, but it also means the ordering assertion above cannot double
    // as a check on what the bucket holds. The letter bar is its real access
    // path, so that goes through the bar.
    await page.getByRole('button', { name: 'Filter by #' }).click();

    // THIS ASSERTED "1979 SAS (Teil der Marc Dorcel Group)" WAS VISIBLE HERE,
    // AND IT WAS WRONG WITHIN A DAY. `20260919193550` renamed 49 brands whose
    // vendor field held a legal entity rather than a brand, and that row became
    // "DORCEL" — so it files under D and the "#" bucket is now empty.
    //
    // The old assertion would have failed nightly with a message blaming the
    // feed-ID retirement for an over-reach that never happened. Pinning a test
    // to one row's NAME pins it to an editorial decision that is free to move;
    // the invariant was never "1979 SAS is in #", it was "no feed-ID artifact
    // is", and that is what is asserted now.
    //
    // Emptiness is therefore NOT asserted in either direction. A legitimate
    // brand may re-enter this bucket at any time (a name starting with a digit
    // is allowed), and asserting "empty" would then fail on correct data —
    // which is the same mistake one rung along.
    const hashNames = await page
      .locator('main a[aria-label]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));

    // The retirement invariant, stated over content rather than over a count:
    // nothing in "#" may look like a merchant feed ID or an ISBN. 20 of those
    // were retired by `99100101143000`; a 21st appearing here means the
    // producer guard in marketplace_register_brands has stopped holding.
    for (const name of hashNames) {
      expect(name, `feed-ID artifact back in the "#" bucket: ${name}`).not.toMatch(
        /^[‪-‮]?\d{4,}[- ]?\d*$/,
      );
    }

    // POSITIVE CONTROL. Everything above passes vacuously if the click did
    // nothing and the page is showing an empty result for an unrelated reason,
    // so prove the filter is live: the bar reports "#" as the active letter.
    await expect(page.getByRole('button', { name: 'Filter by #' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
