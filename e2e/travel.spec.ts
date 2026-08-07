import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Travel hub page (planner-first layout).
 *
 * The /travel route is the front door of the trip-building system:
 *   - Plan-a-trip hero (StartTripHero for anon, TripCockpit when signed in)
 *   - Trip templates + public trips
 *   - Queer villages + Pride scroller
 *   - Book now accordion (collapsed by default; expanded with ?intent=book,
 *     ?tab= or ?city= deep links)
 *   - Compact "Know before you go" legal briefing at the end
 *
 * Tests run against the live site (queer.guide) or a local dev server.
 * Set E2E_BASE_URL env var to override the base URL.
 */

test.describe('Travel hub (/travel)', () => {
  test('renders the plan-a-trip hero for anonymous visitors', async ({ page }) => {
    await page.goto('/travel');

    await expect(page.getByRole('heading', { name: /plan a trip/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId('travel-plan-trip')).toBeVisible();
  });

  test('closes with the legal briefing instead of leading with it', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.getByRole('heading', { name: /know before you go/i })).toBeVisible({
      timeout: 15000,
    });
    // The rights CTA lives in that section.
    await expect(page.getByRole('link', { name: /check any country/i })).toBeVisible();
  });

  test('renders the Pride scroller heading', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.getByRole('heading', { name: /pride this season/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test('Book now accordion is collapsed by default and expandable', async ({ page }) => {
    await page.goto('/travel');

    // Tab list is hidden until accordion expanded.
    await expect(page.getByRole('button', { name: /book now/i }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Flights', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: /book now/i }).first().click();
    await expect(page.getByRole('button', { name: 'Flights', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hotels', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activities', exact: true })).toBeVisible();
  });

  test('?intent=book opens Book now expanded', async ({ page }) => {
    await page.goto('/travel?intent=book');
    await expect(page.getByRole('button', { name: 'Flights', exact: true })).toBeVisible({
      timeout: 15000,
    });
  });

  test('?tab=hotels deep link opens the booking accordion on the hotels tab', async ({ page }) => {
    await page.goto('/travel?tab=hotels');
    await expect(page.getByRole('button', { name: 'Hotels', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('label:has-text("LGBTQ+ friendly only")')).toBeVisible();
  });

  test('travel → plan trip flow routes anonymous user to /trips with city seeded', async ({
    page,
  }) => {
    await page.goto('/travel');

    const cityInput = page.getByLabel(/where to\?/i);
    await cityInput.click();
    await cityInput.fill('Berlin');
    // Wait for the autocomplete (search_cities RPC). Pick the first option.
    const firstOption = page.getByRole('option').first();
    try {
      await firstOption.waitFor({ state: 'visible', timeout: 5000 });
      await firstOption.click();
    } catch {
      test.skip(true, 'Autocomplete did not return options for "Berlin"');
      return;
    }

    await page.getByTestId('travel-plan-trip').click();

    // Anonymous: routed to /trips with cityId param (signed-in flow lives in trip-creation.spec.ts).
    await page.waitForURL(/\/trips(?:\?|$)/, { timeout: 10000 });
    expect(page.url()).toContain('cityId=');
  });
});

test.describe('/flights route redirect', () => {
  test('/flights redirects to /travel', async ({ page }) => {
    await page.goto('/flights');
    await page.waitForURL('**/travel', { timeout: 10000 });
    expect(page.url()).toContain('/travel');
  });
});

test.describe('Error handling', () => {
  test('travel page does not crash with error boundary', async ({ page }) => {
    await page.goto('/travel');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /plan a trip/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
