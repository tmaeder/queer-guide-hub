import { test, expect } from '@playwright/test';

// Regression: the per-type submit/<slug> routes (#1444) fixed the /:locale? collision
// so /submit/news no longer 404s — but those static routes carry no :contentType param,
// so SubmitForm must derive the type from the path or it shows "Unknown submission type".
// This asserts every hub-linked type renders its actual form heading.
const TYPES: Array<{ id: string; heading: RegExp }> = [
  { id: 'event', heading: /Submit Event/i },
  { id: 'venue', heading: /Submit Venue/i },
  { id: 'product', heading: /Submit Product/i },
  { id: 'personality', heading: /Submit Personality/i },
  { id: 'place', heading: /Submit Place/i },
  { id: 'tag', heading: /Submit Tag/i },
  { id: 'news', heading: /Submit News/i },
  { id: 'feedback', heading: /Submit Feedback/i },
];

test.describe('submission type routes render their form', () => {
  for (const { id, heading } of TYPES) {
    test(`/submit/${id} renders its form (not 404 / Unknown type)`, async ({ page }) => {
      await page.goto(`/submit/${id}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
      await expect(page.getByText('Unknown submission type')).toHaveCount(0);
    });
  }

  test('locale-prefixed /de/submit/news renders the form', async ({ page }) => {
    await page.goto('/de/submit/news');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Submit News/i })).toBeVisible({ timeout: 15_000 });
  });
});
