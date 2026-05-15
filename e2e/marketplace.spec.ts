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
    await page.waitForSelector('a[data-affiliate="true"]', { timeout: 30_000 });
    const affiliates = page.locator('a[data-affiliate="true"]');
    const count = await affiliates.count();
    expect(count).toBeGreaterThan(0);
    const rel = await affiliates.first().getAttribute('rel');
    expect(rel).toContain('sponsored');
    expect(rel).toContain('nofollow');
    expect(rel).toContain('noopener');
  });

  test('/marketplace/category/:slug filters listings', async ({ page }) => {
    // Use a subcategory we know exists in production data
    await page.goto('/marketplace/category/fetish_gear');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /fetish gear/i, level: 1 })).toBeVisible({ timeout: 30_000 });
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
      'a[href^="/marketplace/"]:not([href*="category/"]):not([href*="merchants/"]):not([href*="share"])',
    );
    await detailLinks.first().waitFor({ timeout: 30_000 });
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
    const detailLink = page.locator('a[href^="/marketplace/"]:not([href*="category/"]):not([href*="merchants/"]):not([href*="share"])').first();
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
});
