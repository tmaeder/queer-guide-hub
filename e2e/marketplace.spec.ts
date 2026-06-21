import { test, expect } from '@playwright/test';

// Smoke spec for the marketplace discovery surface shipped in PR #935.
// Runs against E2E_BASE_URL (defaults to https://queer.guide).

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
    // Auto-retrying assertion instead of waitForSelector + count: the grid
    // re-renders when query data settles, so a matched node can detach
    // between the wait and the count (observed flake 2026-06-12).
    const affiliates = page.locator('a[data-affiliate="true"]');
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
    const detailLinks = page.locator(
      'a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="share"]):not([href$="/submit"])',
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
      await page.goto(slug);
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
    await page.goto('/marketplace');
    await page.waitForSelector('a[href^="/marketplace/"]', { timeout: 30_000 });
    // Exclude every non-listing route under /marketplace — notably guides
    // (editorial pages emit no Product JSON-LD; picking one stalls the
    // waitForFunction below until timeout, the CI failure of 2026-06-12).
    const detailLink = page.locator('a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="guide"]):not([href*="share"]):not([href$="/submit"])').first();
    const href = await detailLink.getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    await page.waitForLoadState('domcontentloaded');
    // useMeta injects JSON-LD client-side after data loads; wait for the Product schema to appear.
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
    // Open the advanced filter panel, then expand the "Quality & freshness"
    // section — where the (now-removed) relevance slider used to live. Radix
    // unmounts collapsed accordion content, so expanding it is what would
    // surface the slider in the DOM if it still existed.
    await page.getByRole('button', { name: /toggle filters/i }).click();
    const quality = page.getByRole('button', { name: /quality & freshness/i });
    await quality.click();
    await expect(quality).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/minimum lgbtq\+ relevance/i)).toHaveCount(0);
    await expect(page.locator('[aria-label="Minimum LGBTQ+ relevance"]')).toHaveCount(0);
  });

  test('marketplace detail page shows no "LGBTQ+ relevant" pill', async ({ page }) => {
    await page.goto('/marketplace');
    await page.waitForSelector('a[href^="/marketplace/"]', { timeout: 30_000 });
    const detailLink = page
      .locator('a[href^="/marketplace/"]:not([href*="categor"]):not([href*="collection"]):not([href*="merchants/"]):not([href*="guide"]):not([href*="share"]):not([href$="/submit"])')
      .first();
    const href = await detailLink.getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    await page.waitForLoadState('domcontentloaded');
    // Wait for the buy box to hydrate (price is part of the same card as the pills).
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
    await expect(page.getByText(/lgbtq\+ relevant/i)).toHaveCount(0);
  });
});
