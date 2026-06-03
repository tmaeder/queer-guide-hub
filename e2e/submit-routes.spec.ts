import { test, expect } from '@playwright/test';

// Regression: `news` and `feedback` submission types collide with top-level routes
// of the same name under the optional /:locale? segment, which used to make
// /submit/news and /submit/feedback render the global 404 instead of the form.
// Explicit static routes (routes.tsx) + a path-derived contentType (SubmitForm)
// fix it. Guard every submission type the hub links to.
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

test.describe('submission type routes render the form (not 404)', () => {
  for (const { id, heading } of TYPES) {
    test(`/submit/${id} renders its form`, async ({ page }) => {
      await page.goto(`/submit/${id}`);
      await page.waitForLoadState('domcontentloaded');
      // The submission form heading must appear…
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
      // …and it must NOT be the global not-found page.
      await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
    });
  }

  test('locale-prefixed /de/submit/news renders the form', async ({ page }) => {
    await page.goto('/de/submit/news');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Submit News/i })).toBeVisible({ timeout: 15_000 });
  });
});
