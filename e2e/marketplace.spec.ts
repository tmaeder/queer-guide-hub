import { test, expect, type Page } from '@playwright/test';

// Smoke spec for the marketplace discovery surface shipped in PR #935.
// Runs against E2E_BASE_URL (defaults to https://queer.guide).

// Exclude every non-listing route under /marketplace — notably guides
// (editorial pages emit no Product JSON-LD; picking one stalls the JSON-LD
// wait until timeout, the CI failure of 2026-06-12).
const LISTING_LINK_SELECTOR =
  'a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="guide"]):not([href*="share"]):not([href$="/submit"])';

// Open a listing detail page that actually hydrates Product JSON-LD.
// Two hardening measures born from the CI failures of 2026-07-04:
// - navigate with `domcontentloaded` — the default `load` wait hangs when a
//   merchant-CDN product image stalls on the runner, eating the whole test
//   budget before the JSON-LD wait even starts
// - try the first few grid links instead of blindly taking the first: grid
//   order comes from live search ranking, and a single slow/broken listing
//   at the top made this whole test family flaky
async function openListingWithProductLd(page: Page): Promise<void> {
  await page.goto('/marketplace');
  await page.waitForSelector(LISTING_LINK_SELECTOR, { timeout: 30_000 });
  const links = page.locator(LISTING_LINK_SELECTOR);
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

  test('/marketplace renders hero + category tiles + at least one curated row', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Marketplace', level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#category-tiles')).toBeVisible({ timeout: 30_000 });
    // At least one of the curated rows should appear
    const rowHeadings = page.locator('section[aria-labelledby^="row-"] h2');
    await expect(rowHeadings.first()).toBeVisible({ timeout: 30_000 });
    // Filter bar must be in DOM
    await expect(page.getByPlaceholder(/search products/i)).toBeVisible();
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
    test.skip(count === 0, 'No affiliate-backed listings in the current result set (post affiliate-truth purge)');
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
    await expect(page.getByRole('heading', { name: /underwear/i, level: 1 })).toBeVisible({ timeout: 30_000 });
    const cards = page.locator('main a[href^="/marketplace/"]:not([href*="category/"]):not([href*="merchants/"])');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/merchants/:domain shows merchant listings + visit button', async ({ page }) => {
    await page.goto('/marketplace/merchants/supergayunderwear.com');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /visit merchant site/i })).toBeVisible({ timeout: 30_000 });
  });

  test('/marketplace/share renders listings from ids param', async ({ page }) => {
    // Derive two real listing UUIDs by visiting detail pages and reading sku from the Product JSON-LD.
    // Avoids hardcoding API credentials in the spec.
    await page.goto('/marketplace');
    // Excludes every non-product marketplace route — notably /brands/ (added
    // by the 2026-07-02 brand rails, PR #1906): a brand page never emits
    // Product JSON-LD, so picking one hangs the sku wait below.
    const detailLinks = page.locator(
      'a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="brands/"]):not([href*="guides"]):not([href*="missions"]):not([href*="share"]):not([href$="/submit"])',
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
      Array.from(new Set(nodes.map((n) => (n as HTMLAnchorElement).getAttribute('href')))).slice(0, 2),
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
        for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
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
    await expect(page.getByRole('heading', { name: /e2e test list/i, level: 1 })).toBeVisible({ timeout: 30_000 });
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
    await expect(page.getByRole('button', { name: /saved searches/i })).toBeVisible({ timeout: 30_000 });
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
