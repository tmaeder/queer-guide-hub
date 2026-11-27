import { expect, type Page } from '@playwright/test';

/** The anonymous /trips entry point redirects to the Hub's authentication gate. */
export async function openSignedOutTripGate(page: Page) {
  await page.goto('/trips', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/hub\/plans(?:[?#].*)?$/, { timeout: 20_000 });

  // Scope to the route content: a header sign-in control can otherwise make a
  // broken gate pass on desktop while the same assertion fails on phones.
  const main = page.locator('#main-content');
  const signIn = main.getByRole('link', { name: /^sign in$/i });
  await expect(signIn).toBeVisible({ timeout: 15_000 });
  await expect(signIn).toHaveAttribute('href', /^\/auth(?:[?#].*)?$/);
  await expect(main.getByRole('heading').first()).toBeVisible();
  await expect(page.locator('input[name="title"]')).toHaveCount(0);
  return signIn;
}
