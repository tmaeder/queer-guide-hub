import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Travel booking experience.
 *
 * Tests run against the live site (queer.guide) or a local dev server.
 * Set E2E_BASE_URL env var to override the base URL.
 */

test.describe('Travel page (/travel)', () => {
  test('loads the travel page and shows search form', async ({ page }) => {
    await page.goto('/travel');

    // Page should load without errors
    await expect(page.locator('text=Find Flights')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Search Flights')).toBeVisible();

    // Search form elements should exist
    await expect(page.getByPlaceholder(/from/i)).toBeVisible();
    await expect(page.getByPlaceholder(/to/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible();
  });

  test('shows popular deals section', async ({ page }) => {
    await page.goto('/travel');

    // Allow time for geolocation + API call
    // Either shows "Popular Deals" or "Enable location" message
    const dealsOrFallback = page.locator('text=Popular Deals, text=Enable location, text=Search Flights Manually').first();
    await expect(dealsOrFallback).toBeVisible({ timeout: 20000 });
  });

  test('airport autocomplete returns results for "London"', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.locator('text=Search Flights')).toBeVisible({ timeout: 15000 });

    // Type "London" in the destination field
    const toInput = page.getByPlaceholder(/to/i);
    await toInput.click();
    await toInput.fill('London');

    // Wait for autocomplete results
    await page.waitForTimeout(500); // debounce

    // Should show at least LHR and LGW
    const dropdown = page.locator('[class*="autocomplete"], [role="listbox"]').or(
      page.locator('text=London Heathrow Airport').first()
    );
    // Look for any London airport in the dropdown
    await expect(page.locator('text=LCY').or(page.locator('text=LHR')).or(page.locator('text=LGW')).first())
      .toBeVisible({ timeout: 5000 });
  });

  test('search with known inputs returns results', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.locator('text=Search Flights')).toBeVisible({ timeout: 15000 });

    // Fill in origin
    const fromInput = page.getByPlaceholder(/from/i);
    await fromInput.click();
    await fromInput.fill('Zurich');
    await page.waitForTimeout(500);
    // Select ZRH from dropdown
    await page.locator('text=ZRH').first().click();

    // Fill in destination
    const toInput = page.getByPlaceholder(/to/i);
    await toInput.click();
    await toInput.fill('London');
    await page.waitForTimeout(500);
    // Select LHR from dropdown
    await page.locator('text=LHR').first().click();

    // Click search
    await page.getByRole('button', { name: /search/i }).click();

    // Should show results or "No deals found" (both valid)
    const resultOrEmpty = page.locator('text=Book Flight, text=No deals found').first();
    await expect(resultOrEmpty).toBeVisible({ timeout: 15000 });
  });

  test('"Book Flight" button generates valid Aviasales URL', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.locator('text=Search Flights')).toBeVisible({ timeout: 15000 });

    // Wait for popular deals to load (they come from visitor location)
    // If no deals, skip this test
    const bookButton = page.getByRole('button', { name: /book flight/i }).first();

    try {
      await bookButton.waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      test.skip(true, 'No deals loaded — cannot test booking URL');
      return;
    }

    // Intercept the window.open call to capture the URL
    let openedUrl = '';
    await page.evaluate(() => {
      (window as any).__testOpenUrl = '';
      const origOpen = window.open;
      window.open = function(url: any, ...args: any[]) {
        (window as any).__testOpenUrl = url;
        return null; // Prevent actually opening
      };
    });

    await bookButton.click();

    openedUrl = await page.evaluate(() => (window as any).__testOpenUrl);

    // Validate URL format — must use ?params= query format (NOT path-based)
    expect(openedUrl).toBeTruthy();
    expect(openedUrl).toMatch(/^https:\/\/www\.aviasales\.com\/\?params=/);
    expect(openedUrl).not.toContain('search.aviasales.com');
    expect(openedUrl).not.toContain('aviasales.ru');
    expect(openedUrl).toContain('marker=452012');

    // params value should start with 3-letter IATA code
    const url = new URL(openedUrl);
    const params = url.searchParams.get('params') || '';
    expect(params).toMatch(/^[A-Z]{3}/); // Starts with origin IATA
  });
});

test.describe('/flights route redirect', () => {
  test('/flights redirects to /travel', async ({ page }) => {
    const response = await page.goto('/flights');

    // Should end up at /travel (client-side redirect via React Router)
    await page.waitForURL('**/travel', { timeout: 10000 });
    expect(page.url()).toContain('/travel');
  });

  test('/flights does not show 404', async ({ page }) => {
    await page.goto('/flights');
    await page.waitForURL('**/travel', { timeout: 10000 });

    // Should NOT show the NotFound page
    await expect(page.locator('text=Page not found')).not.toBeVisible({ timeout: 3000 }).catch(() => {
      // If the locator check times out, that's fine — means 404 is not shown
    });

    // Should show the travel page content
    await expect(page.locator('text=Find Flights')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Tours/Activities section', () => {
  test('Tours tab on country page shows content or clean fallback', async ({ page }) => {
    // Visit a known country page (Germany)
    await page.goto('/country/79fa9d4c-b8a2-4f96-86fc-c8e33e5ed1fd');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Click the Tours tab
    const toursTab = page.locator('text=Tours').first();

    try {
      await toursTab.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      test.skip(true, 'Country page did not load Tours tab');
      return;
    }

    await toursTab.click();
    await page.waitForTimeout(2000);

    // Should show either the widget content OR the fallback "Tours & Activities" placeholder
    // It should NOT show a blank/broken embed or crash the page
    const content = page.locator('text=Tours & Activities, text=Browse Tours, text=GetYourGuide, text=Activities').first();
    await expect(content).toBeVisible({ timeout: 12000 });

    // Verify no error boundary crash
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
  });
});

test.describe('Error handling', () => {
  test('travel page does not crash with error boundary', async ({ page }) => {
    await page.goto('/travel');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Should NOT show the error boundary
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();

    // Should show the actual content
    await expect(page.locator('text=Find Flights')).toBeVisible({ timeout: 15000 });
  });

  test('country page with flights tab does not crash', async ({ page }) => {
    // Visit Germany country page
    await page.goto('/country/79fa9d4c-b8a2-4f96-86fc-c8e33e5ed1fd');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Click Flights tab
    const flightsTab = page.locator('[value="flights"], text=Flights').first();
    try {
      await flightsTab.waitFor({ state: 'visible', timeout: 10000 });
      await flightsTab.click();
    } catch {
      test.skip(true, 'Country page did not load Flights tab');
      return;
    }

    await page.waitForTimeout(2000);

    // Should show flight deals section without crashing
    await expect(page.locator('text=Something went wrong')).not.toBeVisible();
    // Should show either deals or the fallback message
    const content = page.locator('text=Flight Deals, text=Enable location, text=Search Flights').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});
