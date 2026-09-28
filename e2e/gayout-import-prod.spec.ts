import { expect, test } from '@playwright/test';

// Production-only smoke for the GayOut venue import. These anchors were newly
// inserted by the 2026-09-28 import and intentionally span two continents.
const importedVenues = [
  {
    slug: 'hotel-vip-praia',
    name: 'Hotel VIP Praia',
    location: /Praia|Cabo Verde/i,
  },
  {
    slug: 'brisotel',
    name: 'Brisotel',
    location: /Luanda|Angola/i,
  },
  {
    slug: 'grand-plaza-hotel-and-wellness',
    name: 'Grand Plaza Hotel & Wellness',
    location: /Andorra La Vella|Andorra/i,
  },
  {
    slug: 'l-aquari-hom',
    name: "L'Aquari-Hom",
    location: /Li[eè]ge|Belgium/i,
  },
];

test.use({
  ...(process.env.E2E_BROWSER_CHANNEL
    ? { channel: process.env.E2E_BROWSER_CHANNEL }
    : {}),
  storageState: { cookies: [], origins: [] },
});

test.describe('GayOut venue import — production reachability', () => {
  for (const venue of importedVenues) {
    test(`${venue.name} is publicly reachable with its location`, async ({ page }) => {
      const response = await page.goto(`/venues/${venue.slug}`, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBeLessThan(400);

      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible({ timeout: 30_000 });
      await expect(heading).toContainText(venue.name);
      await expect(page.locator('body')).toContainText(venue.location);
      await expect(page.locator('[role="region"][aria-label="Map"]').first()).toBeVisible({
        timeout: 20_000,
      });
    });
  }
});
