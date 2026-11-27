import { expect, test, type Page } from '@playwright/test';

/**
 * Prod checks for the grouped search overview (docs/plans/2026-11-27-search-overview-by-type.md)
 * and the signed-out Meet dating pages.
 *
 * Signed out on purpose: CI can attach an admin storageState, and a signed-in
 * run would never see the dating sign-in prompt, so its assertions would pass
 * having checked nothing.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function dismissCookies(page: Page) {
  await page
    .getByRole('button', { name: /Necessary Only/i })
    .click({ timeout: 3000 })
    .catch(() => undefined);
}

test.describe('search overview (All tab)', () => {
  test('a scoped search returns results (positive control)', async ({ page }) => {
    await page.goto('/search?q=berlin&types=event');
    await dismissCookies(page);
    // Without this, "no sections" below could mean search is simply down.
    await expect(page.getByRole('group', { name: 'Result view' })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('main a[aria-label]').first()).toBeVisible({ timeout: 20000 });
  });

  test('groups results by type, includes news for a bare city, and links each section to its list', async ({
    page,
  }) => {
    await page.goto('/search?q=berlin');
    await dismissCookies(page);
    const sections = page.locator('[data-testid^="search-section-"]');
    await expect(sections.first()).toBeVisible({ timeout: 20000 });

    // A cold database can fail some per-type calls. The page then names the
    // missing sections instead of showing them as empty; retrying is how a
    // reader recovers, so this run does the same, once.
    const partial = page.getByTestId('search-overview-partial');
    if (await partial.isVisible()) {
      await expect(partial).not.toContainText('{{');
      await partial.getByRole('button').click();
      await expect(partial).toHaveCount(0, { timeout: 25000 });
    }
    expect(await sections.count()).toBeGreaterThanOrEqual(3);

    // A bare city query no longer hides types without a city (step 1).
    await expect(page.getByTestId('search-section-news')).toBeVisible();
    // The city itself still leads.
    await expect(sections.first()).toHaveAttribute('data-testid', 'search-section-city');

    // Sort and view toggles do not apply to the overview.
    await expect(page.getByRole('group', { name: 'Result view' })).toHaveCount(0);

    // Scope chips carry exact counts once the overview has loaded.
    await expect(
      page.getByRole('group', { name: 'Search scope' }).getByRole('button', { name: /^Events\s*[\d,]+$/ }),
    ).toBeVisible();

    // "See all" opens that type's scoped list, with real numbers interpolated.
    const events = page.getByTestId('search-section-event');
    const seeAll = events.getByRole('button', { name: /See all [\d,]+/ });
    await expect(seeAll).toBeVisible();
    await expect(seeAll).not.toContainText('{{');
    await seeAll.click();
    await expect(page).toHaveURL(/types=event/);
    await expect(page.locator('[data-testid^="search-section-"]')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Result view' })).toBeVisible({ timeout: 20000 });
  });
});

test.describe('signed-out Meet dating', () => {
  test('/meet/dating stays in Meet and signs in with a way back', async ({ page }) => {
    await page.goto('/meet/dating?in=Berlin');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Dating' })).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/meet\/dating/);

    await page.getByRole('main').getByRole('link', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/auth$/);
    // The return path travels in router state; Auth.tsx sends the reader back to it.
    const from = await page.evaluate(() => (history.state as { usr?: { from?: string } })?.usr?.from);
    expect(from).toBe('/meet/dating?in=Berlin');

    // The sign-in page has a real h1 and a readable station name.
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Sign in', { exact: true }).first()).toBeVisible();
  });

  test('/meet/dating/onboarding signs in with a way back too', async ({ page }) => {
    await page.goto('/meet/dating/onboarding');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Intimate profile' })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('main').getByRole('link', { name: /^Sign in$/ }).click();
    await expect(page).toHaveURL(/\/auth$/);
    const from = await page.evaluate(() => (history.state as { usr?: { from?: string } })?.usr?.from);
    expect(from).toBe('/meet/dating/onboarding');
  });
});
