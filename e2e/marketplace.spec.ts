import { test, expect, type Page } from '@playwright/test';

// Smoke spec for the marketplace discovery surface shipped in PR #935.
// Runs against E2E_BASE_URL (defaults to https://queer.guide).

// Exclude every non-listing route under /marketplace — notably guides
// (editorial pages emit no Product JSON-LD; picking one stalls the JSON-LD
// wait until timeout, the CI failure of 2026-06-12).
//
// `brands` was missing from this list and had to be added when /shop folded
// in: BrandSpotlight already emitted one /marketplace/brands/:slug anchor, and
// the verified-queer-owned block adds up to 24 more above the grid. The helper
// below takes the first THREE matches and waits 20s each, so with enough brand
// anchors in the DOM all three candidates are brand pages and the test burns
// its whole budget on pages that can never emit Product JSON-LD.
//
// The trailing slash came off in 2026-08: it was written `brands/` back when
// `/marketplace/brands/:slug` was the ONLY brand route, so the bare
// `/marketplace/brands` index added later slipped straight through the filter
// and hung the sku wait for its full 120s budget, three times. Match the
// segment, not a path shape that happened to be true once.
//
// `$="/submit"` is now vestigial — /marketplace/submit was never a declared
// route (it fell through to marketplace/:slug and rendered a not-found
// listing) and the two CTAs that pointed at it now go to /submit/product.
// Kept as a cheap guard against the URL being reintroduced.
const LISTING_LINK_SELECTOR =
  'a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="brands"]):not([href*="guide"]):not([href*="share"]):not([href$="/submit"])';

// Open a listing detail page that actually hydrates Product JSON-LD.
// Two hardening measures born from the CI failures of 2026-07-04:
// - navigate with `domcontentloaded` — the default `load` wait hangs when a
//   merchant-CDN product image stalls on the runner, eating the whole test
//   budget before the JSON-LD wait even starts
// - try the first few grid links instead of blindly taking the first: grid
//   order comes from live search ranking, and a single slow/broken listing
//   at the top made this whole test family flaky
async function openListingWithProductLd(page: Page): Promise<void> {
  await page.goto('/marketplace', { waitUntil: 'domcontentloaded' });
  // Cookie-consent banner can overlay the grid / interrupt navigation.
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
  // Wait for the grid to hydrate (any marketplace anchor), then narrow to real
  // listing links. A fully organic/empty result set is a legitimate prod state
  // (post affiliate-truth purge, PR #1898) — skip instead of failing when the
  // grid carries no listing cards.
  await page
    .locator('a[href^="/marketplace/"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {});
  const links = page.locator(LISTING_LINK_SELECTOR);
  test.skip(
    (await links.count()) === 0,
    'No listing cards in the current marketplace result set (post affiliate-truth purge)',
  );
  const candidates = Math.min(await links.count(), 3);
  const hrefs: string[] = [];
  for (let i = 0; i < candidates; i++) {
    const href = await links.nth(i).getAttribute('href');
    if (href && !hrefs.includes(href)) hrefs.push(href);
  }
  expect(hrefs.length).toBeGreaterThan(0);

  for (let i = 0; i < hrefs.length; i++) {
    await page.goto(hrefs[i], { waitUntil: 'domcontentloaded' });
    try {
      // useMeta injects JSON-LD client-side after data loads.
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((s) => {
            try {
              return JSON.parse(s.textContent || '')['@type'] === 'Product';
            } catch {
              return false;
            }
          }),
        { timeout: 20_000 },
      );
      return;
    } catch (err) {
      if (i === hrefs.length - 1) throw err;
    }
  }
}

test.describe('Marketplace — discovery surface', () => {
  test.setTimeout(120_000);

  test('/marketplace renders hero + category tiles + at least one curated row', async ({
    page,
  }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Marketplace', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('#category-tiles')).toBeVisible({ timeout: 30_000 });
    // At least one of the curated rows should appear
    const rowHeadings = page.locator('section[aria-labelledby^="row-"] h2');
    await expect(rowHeadings.first()).toBeVisible({ timeout: 30_000 });
    // Filter bar must be in DOM
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible();
  });

  test('applying a filter moves neither the control band nor the line index', async ({ page }) => {
    // THIS TEST IS THE IA DECISION, not a rendering detail.
    //
    // The page used to gate seven editorial blocks on `!hasActiveFilters`, and
    // `hasActiveFilters` includes `?occ=` — so tapping a chip INSIDE the
    // control bar deleted ~4000px above it and threw the bar up the document
    // under the reader's finger. The scroll length was never the defect; the
    // persistent chrome moving was. Without this assertion the seven-block
    // flip grows back the first time someone adds an editorial band above the
    // bar, and nothing else in the suite would notice.
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const band = page.locator('main section.sticky').first();
    const index = page.locator('#category-tiles');
    await expect(band).toBeVisible({ timeout: 30_000 });
    await expect(index).toBeVisible({ timeout: 30_000 });

    // Settle BEFORE taking the baseline, or the baseline is the flaky half of
    // this test. The masthead above the band contains a `text-hero` h1 in
    // Anton: until the webfont swaps in, that line is laid out in the fallback
    // face at a different height, so an early measurement reads several px
    // high. Measured in CI: the post-filter value was rock-stable at 686.609
    // across all three attempts while the BASELINE drifted (689.757, 691.250)
    // — the band was not moving, the ruler was.
    const settle = async () => {
      await page.evaluate(() => document.fonts.ready);
      // The count line renders "Counting…" until the first query resolves.
      await expect(page.locator('main header .tabular-nums')).not.toHaveText(/Counting/, {
        timeout: 15_000,
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
    };

    await settle();
    const beforeY = (await band.boundingBox())?.y;
    expect(beforeY, 'control band must have a measurable position').toBeDefined();

    await page.getByRole('button', { name: 'Queer-owned', exact: true }).click();
    await expect(page).toHaveURL(/owned=/, { timeout: 15_000 });

    // The department index must survive the filter — it is the map, and losing
    // it at the moment of use is what made this feel like two different pages.
    await expect(index).toBeVisible();
    await settle();

    // 2px, not exact equality. What this guards is a band that jumps hundreds
    // of px because an editorial block above it unmounted; sub-pixel font
    // metrics are not that, and demanding Object.is on a fractional CSS pixel
    // makes the guard fail for reasons that have nothing to do with the rule.
    const afterY = (await band.boundingBox())?.y;
    expect(
      Math.abs((afterY ?? 0) - (beforeY ?? 0)),
      `control band moved ${beforeY} -> ${afterY}`,
    ).toBeLessThanOrEqual(2);
  });

  test('the verified queer-owned shelf states its own coverage', async ({ page }) => {
    // Imported from the deleted /shop page. The count sentence is what makes a
    // section headed "Queer-owned" defensible when ~0.93% of brands carry an
    // ownership tag — without it the heading reads as a claim about the whole
    // catalogue, which routeMetaContract.test.ts explicitly forbids.
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    const shelf = page.locator('section[aria-labelledby="verified-owned-brands"]');
    await expect(shelf).toBeVisible({ timeout: 30_000 });
    await expect(shelf).toContainText(/\d+ brands in our catalogue are verified queer-owned/);
    await expect(shelf).toContainText(/most brands carry no ownership information either way/);
  });

  test('/marketplace cards expose affiliate links with rel="sponsored"', async ({ page }) => {
    await page.goto('/marketplace');
    // Wait for the grid itself first — affiliate CTAs only render on listings
    // that carry a REAL affiliate_url. The 2026-07-02 affiliate-truth purge
    // (PR #1898) cleared 6.5k fake copies, so a fully organic result set is a
    // legitimate production state, not a regression: skip instead of failing.
    const cards = page.locator('a[href^="/marketplace/"]');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    const affiliates = page.locator('a[data-affiliate="true"]');
    await page.waitForTimeout(5_000); // let curated rows hydrate
    const count = await affiliates.count();
    test.skip(
      count === 0,
      'No affiliate-backed listings in the current result set (post affiliate-truth purge)',
    );
    // Auto-retrying assertion instead of waitForSelector + count: the grid
    // re-renders when query data settles, so a matched node can detach
    // between the wait and the count (observed flake 2026-06-12).
    await expect(affiliates.first()).toHaveAttribute('rel', /sponsored/, { timeout: 30_000 });
    const rel = await affiliates.first().getAttribute('rel');
    expect(rel).toContain('nofollow');
    expect(rel).toContain('noopener');
  });

  test('/marketplace/category/:slug filters listings', async ({ page }) => {
    // 'underwear' is a non-adult subcategory with 291+ prod listings.
    // Previous fixture 'fetish_gear' is in ADULT_CATEGORY_SLUGS, so the page
    // mounts AdultContentGate which marks the rest of the document
    // aria-hidden — getByRole('heading') then can't find the h1.
    await page.goto('/marketplace/category/underwear');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /underwear/i, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    const cards = page.locator(
      'main a[href^="/marketplace/"]:not([href*="category/"]):not([href*="merchants/"])',
    );
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/merchants/:domain shows merchant listings + visit button', async ({
    page,
  }) => {
    // A merchant domain either renders the merchant page or REDIRECTS to its
    // /organizations profile — org-backed domains do the latter by design
    // (organizations spine, PR #1721).
    //
    // This used to assert the merchant page specifically, on the stated
    // grounds that "marekrichard.com has NO organizations row". It does now:
    // the nightly `org_spine_backfill` cron MINTS organizations for merchants,
    // so the product's own automation invalidated the fixture choice and the
    // test broke on working code. Pinning a route to the absence of a row that
    // a cron creates is not a stable assumption, so assert what is actually
    // guaranteed: whichever surface answers, it names the merchant and offers
    // a way out to their site.
    await page.goto('/marketplace/merchants/marekrichard.com');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('a[href*="marekrichard.com"]').first(),
      'neither surface offers a link to the merchant site',
    ).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/merchants/:domain redirects to the org profile when one exists', async ({
    page,
  }) => {
    await page.goto('/marketplace/merchants/supergayunderwear.com');
    await page.waitForURL(/\/organizations\/supergayunderwear/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/share renders listings from ids param', async ({ page }) => {
    // Multi-page derivation below (grid → two detail pages → share) chains
    // several 30s waits; the default 30s TEST budget dies before they finish.
    test.setTimeout(120_000);
    // Derive two real listing UUIDs by visiting detail pages and reading sku from the Product JSON-LD.
    // Avoids hardcoding API credentials in the spec.
    await page.goto('/marketplace');
    // Excludes every non-product marketplace route — notably /brands (the
    // rails from PR #1906 and the index added in 2026-08): no brand page emits
    // Product JSON-LD, so picking one hangs the sku wait below. Match `brands`
    // without a trailing slash so the bare index is caught too.
    const detailLinks = page.locator(
      'a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="brands"]):not([href*="guides"]):not([href*="missions"]):not([href*="share"]):not([href$="/submit"])',
    );
    // Curated rows hydrate progressively — poll until at least two distinct
    // product detail links exist before reading them, so the spec doesn't race
    // the lazy render (and burn CI retries) when only one row has mounted.
    await detailLinks.first().waitFor({ timeout: 30_000 });
    await expect
      .poll(
        () =>
          detailLinks.evaluateAll(
            (nodes) =>
              new Set(nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href'))).size,
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(2);
    const slugs = (await detailLinks.evaluateAll((nodes) =>
      Array.from(new Set(nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')))).slice(
        0,
        2,
      ),
    )) as string[];
    expect(slugs.length).toBeGreaterThanOrEqual(2);
    const ids: string[] = [];
    for (const slug of slugs) {
      // domcontentloaded: don't let a stalling merchant-CDN image block the
      // default `load` wait (see openListingWithProductLd).
      await page.goto(slug, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some((s) => {
            try {
              return JSON.parse(s.textContent || '')['@type'] === 'Product';
            } catch {
              return false;
            }
          }),
        { timeout: 30_000 },
      );
      const id = await page.evaluate(() => {
        for (const s of Array.from(
          document.querySelectorAll('script[type="application/ld+json"]'),
        )) {
          try {
            const o = JSON.parse(s.textContent || '');
            if (o['@type'] === 'Product' && o.sku) return o.sku as string;
          } catch {
            /* skip */
          }
        }
        return null;
      });
      expect(id).toBeTruthy();
      ids.push(id as string);
    }
    await page.goto(`/marketplace/share?ids=${ids.join(',')}&title=E2E%20Test%20List`);
    await expect(page.getByRole('heading', { name: /e2e test list/i, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator('main').getByText(/shared list of 2 listing/i)).toBeVisible();
  });

  test('marketplace detail page emits Product JSON-LD with offers', async ({ page }) => {
    await openListingWithProductLd(page);
    const productLd = await page.evaluate(() => {
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try {
          const o = JSON.parse(s.textContent || '');
          if (o['@type'] === 'Product') return o;
        } catch {
          /* skip */
        }
      }
      return null;
    });
    expect(productLd).not.toBeNull();
    expect(productLd.name).toBeTruthy();
  });

  test('saved searches button + popover render', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('button', { name: /saved searches/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  // Regression (PR #1714): lgbti_relevance_score is admin-only. The public
  // "Minimum LGBTQ+ relevance" filter and the "LGBTQ+ relevant" detail pill
  // must NOT render to end users.
  test('public marketplace exposes no LGBTQ+ relevance filter', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    // Open the "All filters" Sheet, then expand the "Quality & freshness"
    // section — where the (now-removed) relevance slider used to live. Radix
    // unmounts collapsed accordion content, so expanding it is what would
    // surface the slider in the DOM if it still existed.
    await page.getByRole('button', { name: /all filters/i }).click();
    const quality = page.getByRole('button', { name: /quality & freshness/i });
    await quality.click();
    await expect(quality).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/minimum lgbtq\+ relevance/i)).toHaveCount(0);
    await expect(page.locator('[aria-label="Minimum LGBTQ+ relevance"]')).toHaveCount(0);
  });

  test('facet chips write URL params and the sheet opens', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    // One-tap ownership chip → owned= URL param.
    const chip = page.getByRole('button', { name: 'Queer-owned', exact: true }).first();
    await chip.click();
    await expect(page).toHaveURL(/owned=queer_owned/);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Chip off → param gone.
    await chip.click();
    await expect(page).not.toHaveURL(/owned=/);
    // Sheet opens with the long-tail filters.
    await page.getByRole('button', { name: /all filters/i }).click();
    await expect(page.getByRole('heading', { name: /all filters/i })).toBeVisible();
  });

  test('marketplace detail page shows no "LGBTQ+ relevant" pill', async ({ page }) => {
    // JSON-LD presence doubles as the buy-box-hydrated signal (price is part
    // of the same card as the pills).
    await openListingWithProductLd(page);
    await expect(page.getByText(/lgbtq\+ relevant/i)).toHaveCount(0);
  });
});
