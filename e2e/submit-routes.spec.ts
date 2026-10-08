import { test, expect } from '@playwright/test';

// Regression: the per-type submit/<slug> routes (#1444) fixed the /:locale? collision
// so /submit/news no longer 404s — but those static routes carry no :contentType param,
// so SubmitForm must derive the type from the path or it shows "Unknown submission type".
// Signed-out users are intentionally stopped before entity forms. These routes
// still have to resolve to the shared add branch rather than 404ing or leaking
// a fillable form. Feedback remains anonymous and opens its form directly.
const ENTITY_TYPES = ['event', 'venue', 'product', 'personality', 'place', 'tag', 'news'];

test.describe('submission type routes render their form', () => {
  for (const id of ENTITY_TYPES) {
    test(`/submit/${id} renders the authenticated add branch`, async ({ page }) => {
      await page.goto(`/submit/${id}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('heading', { name: /Add something new/i })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('#main-content').getByText('Sign in to contribute')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
      await expect(page.getByText('Unknown submission type')).toHaveCount(0);
    });
  }

  test('/submit/feedback renders the anonymous feedback form', async ({ page }) => {
    await page.goto('/submit/feedback');
    await expect(
      page.getByRole('heading', { name: /Report a problem or share an idea/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Title *')).toBeVisible();
  });

  test('locale-prefixed /de/submit/news renders the form', async ({ page }) => {
    await page.goto('/de/submit/news');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: /Etwas Neues hinzufügen/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('/submit/place cannot submit an empty payload', async ({ page }) => {
    await page.goto('/submit/place');
    await page.waitForLoadState('domcontentloaded');

    // Guests are stopped before the form. Authenticated coverage separately
    // asserts the repaired field contract so either branch fails if the guard
    // is removed or the registry regresses to zero fields.
    const signInGate = page.locator('#main-content').getByText('Sign in to contribute');
    const nameField = page.getByLabel('Name');
    await expect(signInGate.or(nameField)).toBeVisible({ timeout: 15_000 });
    if (await nameField.isVisible().catch(() => false)) {
      await expect(page.getByLabel('Description')).toBeVisible();
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.getByText(/Name: .*required/i)).toBeVisible();
      await expect(page.getByText(/Description: .*required/i)).toBeVisible();
    }
  });
});
