import { expect, test } from '@playwright/test';

// Read-only against the deployed build; never create invitations or publish presence.
test.use({ serviceWorkers: 'block', storageState: { cookies: [], origins: [] } });

test('the signed-out Meet entry opens the shared task and public alternatives', async ({
  page,
}) => {
  const response = await page.goto('/hub/people');
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/meet\/?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Find queer company.' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('form', { name: 'Find company', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Find an ongoing community', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Public interest groups · worldwide.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
  await expect(page.locator('#map, #members, #spaces, #regulars')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Dating', exact: true })).toHaveCount(0);
});
