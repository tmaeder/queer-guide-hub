import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Travel hub and its planning tools.
 *
 * Since #5407 the trip system is three pages:
 *   - /travel       inspiration: "Find your escape" wizard (PersonalisedTripPackages)
 *                   + Where to go / Neighborhoods / Pride season section nav
 *   - /travel/plan  the plan-a-trip form (StartTripHero anon, TripCockpit signed in)
 *   - /travel/book  booking (Flights / Hotels / Activities); /travel?intent=book,
 *                   ?tab= and ?city= deep links redirect here
 *
 * The destination map and the "Know before you go" briefing were removed from
 * /travel in #5407; their tests went with them.
 *
 * Tests run against the live site (queer.guide) or a local dev server.
 * Set E2E_BASE_URL env var to override the base URL.
 */

test.describe('Travel hub (/travel)', () => {
  test('opens with the "Find your escape" wizard and its section nav', async ({ page }) => {
    await page.goto('/travel');

    await expect(page.getByRole('heading', { level: 1, name: /trips made for you/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('heading', { name: /find your escape/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /step 1: tell us the mood/i })).toBeVisible();
    // The wizard is interactive, not a heading over nothing: mood choices render.
    await expect(page.getByRole('button', { name: /big nights/i })).toBeVisible();

    // Section nav jumps to each section on the page.
    for (const [name, hash] of [
      [/find your escape/i, '#plan'],
      [/where to go/i, '#inspiration'],
      [/neighborhoods/i, '#villages'],
      [/pride season/i, '#pride'],
    ] as const) {
      await expect(page.locator(`a[href="${hash}"]`).filter({ hasText: name })).toBeVisible();
    }

    // The journey nav routes to the split-out plan page.
    await expect(
      page.getByRole('navigation', { name: /travel sections/i }).getByRole('link', {
        name: /plan a trip/i,
      }),
    ).toHaveAttribute('href', /\/travel\/plan$/);
  });

  test('renders the Pride season section', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.getByRole('heading', { level: 2, name: /pride season/i })).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Booking (/travel/book)', () => {
  test('offers flights, hotels and activities', async ({ page }) => {
    await page.goto('/travel/book');

    await expect(page.getByRole('heading', { level: 1, name: /book your trip/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /^flights/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^hotels/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^activities/i })).toBeVisible();
    // Flights is the default tab.
    await expect(page.getByRole('button', { name: /search flights/i })).toBeVisible();
  });

  test('/travel?intent=book redirects to the booking page', async ({ page }) => {
    await page.goto('/travel?intent=book');
    await page.waitForURL(/\/travel\/book(\?|$)/, { timeout: 15000 });
    expect(new URL(page.url()).searchParams.get('intent')).toBeNull();
    await expect(page.getByRole('heading', { level: 1, name: /book your trip/i })).toBeVisible();
  });

  test('/travel?tab=hotels deep link lands on the hotels tab', async ({ page }) => {
    await page.goto('/travel?tab=hotels');
    await page.waitForURL(/\/travel\/book\?tab=hotels/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /search for stays/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: /lgbtq\+ friendly only/i })).toBeVisible();
  });
});

test.describe('Plan a trip (/travel/plan)', () => {
  // This test is about the ANONYMOUS path, and it has to say so. The chromium
  // project carries the admin storageState whenever E2E_ADMIN_EMAIL/PASSWORD are
  // set, so a spec that merely never signs in is signed IN — the same trap
  // trip-creation.spec.ts documents.
  //
  // Signed in, this test wrote to the production database. Travel.tsx renders
  // (now pages/travel/Plan.tsx) StartTripHero only while `user` is still null, but auth resolves during the
  // page's own load, so by click time `handlePlan` took the signed-in branch and
  // called createTrip. Every authenticated run left a real "Berlin trip" row
  // behind — three of them on 2026-08-19, one per Playwright retry, each retry
  // then failing the URL assertion because it had navigated to /trips/<id>.
  test.describe('anonymous', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('plan trip preserves an anonymous destination through sign-in', async ({ page }) => {
      await page.goto('/travel/plan');
      await expect(page.getByRole('heading', { name: /plan a trip/i }).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByTestId('travel-plan-trip')).toBeVisible();

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

      await page.waitForURL(/\/auth\?redirect=/, { timeout: 10000 });
      const pending = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem('qg.pendingTripCapture') ?? 'null'),
      );
      expect(pending).toMatchObject({
        source: 'travel-hero',
        returnTo: '/travel/plan',
        intent: {
          kind: 'start_destination',
          destination: { cityName: 'Berlin' },
        },
      });
    });
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
    await expect(page.getByRole('heading', { level: 1, name: /trips made for you/i })).toBeVisible({
      timeout: 15000,
    });
  });
});
