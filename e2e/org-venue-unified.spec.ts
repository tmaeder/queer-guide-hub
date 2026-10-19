import { test, expect } from '@playwright/test';

/**
 * Organisation and venue pages share one layout, say what they are, and show
 * the website exactly once. DeMask is an organisation that also runs a venue,
 * so both pages must carry BOTH kind chips, each linking to the other page.
 */
const PAGES = [
  { path: '/organizations/demask', other: '/venues/demask' },
  { path: '/venues/demask', other: '/organizations/demask' },
];

for (const { path, other } of PAGES) {
  test(`${path}: one layout, both kinds, website once`, async ({ page }) => {
    await page.goto(path);
    await page.locator('article h1').first().waitFor({ state: 'visible', timeout: 30_000 });

    // Same shell on both sides: the single's rail.
    await expect(page.getByTestId('single-rail')).toBeVisible();

    const chips = page.getByTestId('entity-kind-chips');
    await expect(chips.locator('[data-kind="venue"]')).toBeVisible();
    await expect(chips.locator('[data-kind="organization"]')).toBeVisible();
    await expect(chips.locator(`a[href$="${other}"]`)).toHaveCount(1);

    // Absolute hrefs only: product cards link to /marketplace/merchants/demask.com,
    // which is an internal page, not the website.
    // Positive control first: the contact section rendered at all, or "one
    // link" below is equally true of a page that shows none.
    await expect(page.locator('#location')).toBeVisible();
    const websiteLinks = page.locator('a[href^="http"][href*="demask.com"]');
    await expect(websiteLinks).toHaveCount(1);
    await expect(websiteLinks.first()).toHaveAttribute('rel', /nofollow/);
  });
}
