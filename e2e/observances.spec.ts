import { test, expect } from '@playwright/test';

// /days/:slug hub (observances phase 1). Runs anon in every environment so the
// safety-gated path is the one measured. Absence assertions are paired with a
// positive control, otherwise an empty or broken page passes them.
test.use({ storageState: { cookies: [], origins: [] } });

test('World AIDS Day hub: memorial tone, real date, help link', async ({ page }) => {
  await page.goto('/days/world-aids-day');
  await expect(page.getByRole('heading', { level: 1, name: 'World AIDS Day' })).toBeVisible();
  // positive control: the date came from observance_next_dates, not a fallback
  await expect(page.getByText(/December 1|1 December/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /support/i })).toHaveAttribute('href', /\/help/);
  await expect(page.getByText(/in \d+ days/)).toHaveCount(0);
});

test('TDoR hub shows the previous occurrence with linked events', async ({ page }) => {
  await page.goto('/days/transgender-day-of-remembrance');
  await expect(page.getByRole('heading', { level: 1, name: /Day of Remembrance/ })).toBeVisible();
  // 2026 vigils are linked in the DB; the page must render them, not only an empty state
  await expect(page.getByRole('heading', { level: 2, name: /2026/ })).toBeVisible();
  await expect(page.locator('main a[href*="/events/"]').first()).toBeVisible();
});

test('direct load is not an edge 404', async ({ request }) => {
  const res = await request.get('/days/coming-out-day');
  expect(res.status()).toBe(200);
});

test('unknown observance shows not found; a real one does not', async ({ page }) => {
  await page.goto('/days/not-a-real-day');
  await expect(page.getByText(/not found/i)).toBeVisible();
  await page.goto('/days/coming-out-day');
  await expect(page.getByRole('heading', { level: 1, name: 'Coming Out Day' })).toBeVisible();
  await expect(page.getByText(/not found/i)).toHaveCount(0);
});
