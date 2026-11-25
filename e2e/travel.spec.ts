import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Travel hub and its planning tools.
 *
 * One page since the travel unify (2026-11-25):
 *   - /travel       the "Find your escape" wizard (PersonalisedTripPackages) with two
 *                   doors — Inspire me / I know where I'm going — ending in every
 *                   booking link; + Where to go / Neighborhoods / Pride season
 *   - /travel/plan  301 → /travel?door=know
 *   - /travel/book  301 → /travel with the query kept; old booking keys (?tab, ?city,
 *                   ?to, ?intent=book) are translated into the second door
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
    // The section heading names it for screen readers only; the tab says it visibly.
    await expect(page.getByRole('heading', { name: /find your escape/i })).toHaveClass(/sr-only/);
    // Step 1 is current. (#5732 replaced the "Step 1: Tell us the mood" heading
    // with the step bar.)
    await expect(
      page
        .getByRole('navigation', { name: /trip finder steps/i })
        .getByRole('button', { name: /mood/i }),
    ).toHaveAttribute('aria-current', 'step');
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

    // Two ways in. The Find a trip / My trips strip lives on trip pages, not here.
    await expect(page.getByRole('button', { name: /inspire me/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /i know where i'm going/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /travel sections/i })).toHaveCount(0);
  });

  test('renders the Pride season section', async ({ page }) => {
    await page.goto('/travel');
    await expect(page.getByRole('heading', { level: 2, name: /pride season/i })).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('Old booking and planning links', () => {
  test('/travel/plan opens the second door', async ({ page }) => {
    await page.goto('/travel/plan');
    await page.waitForURL(/\/travel\?door=know$/, { timeout: 15000 });
    await expect(page.getByLabel(/where to\?/i)).toBeVisible({ timeout: 15000 });
  });

  test('/travel/book?tab=hotels&city=Berlin lands on the Berlin stay step', async ({ page }) => {
    await page.goto('/travel/book?tab=hotels&city=Berlin');
    await page.waitForURL(
      (url) =>
        url.pathname === '/travel' &&
        url.searchParams.get('door') === 'know' &&
        url.searchParams.get('step') === 'stay' &&
        !!url.searchParams.get('dest'),
      { timeout: 15000 },
    );
    await expect(page.getByText('Stay your way')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/your trip to berlin/i).first()).toBeVisible();
  });

  test('/travel?intent=book opens the second door', async ({ page }) => {
    await page.goto('/travel?intent=book');
    await page.waitForURL(
      (url) => url.searchParams.get('door') === 'know' && !url.searchParams.has('intent'),
      { timeout: 15000 },
    );
    await expect(page.getByLabel(/where to\?/i)).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Second door (I know where I\'m going)', () => {
  // Anonymous on purpose: the Book step must work signed out, and a signed-in
  // run must never reach "Save as trip", which writes a real trip.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a picked city reaches the Book step with partner links', async ({ page }) => {
    await page.goto('/travel?door=know');
    const city = page.getByLabel(/where to\?/i);
    await city.click();
    await city.fill('Berlin');
    const firstOption = page.getByRole('option').first();
    try {
      await firstOption.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      test.skip(true, 'Autocomplete did not return options for "Berlin"');
      return;
    }
    await firstOption.click();
    await page.getByRole('button', { name: /see things to do/i }).click();
    await page.waitForURL((url) => url.searchParams.get('step') === 'to-do');

    const steps = page.getByRole('navigation', { name: /trip finder steps/i });
    await steps.getByRole('button', { name: /book/i }).click();
    const links = page.getByRole('list', { name: 'Book it' }).getByRole('link');
    await expect(links.first()).toHaveAttribute('href', /booking\.com/);
    await expect(links.last()).toHaveAttribute('href', /getyourguide\.com/);
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
