import { test, expect } from '@playwright/test';

/**
 * Smoke for the new /personalities discovery surfaces:
 *   - Era chip toggles birth_year_min/max filter via ?era=
 *   - View switcher persists in URL (?view=timeline, ?view=map)
 *   - Active filter chip lists the era after applying it
 *   - Tag URL param deep-links and renders an active-filter chip
 */

test.describe('Personalities — discovery + views', () => {
  test('era chip applies birth-year range and shows active chip', async ({ page }) => {
    await page.goto('/personalities', { waitUntil: 'networkidle' });

    // Era buttons are rendered in the editorial block when no filters are active.
    const stonewall = page.getByRole('button', { name: /Stonewall era/i });
    await stonewall.click();

    await expect(page).toHaveURL(/[?&]era=stonewall/);
    const remove = page.getByRole('button', { name: /Remove Stonewall era/i });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(page).not.toHaveURL(/[?&]era=/);
  });

  test('view switcher persists in URL across grid → timeline → map', async ({ page }) => {
    await page.goto('/personalities', { waitUntil: 'networkidle' });

    // Tab role is set on the view buttons.
    await page.getByRole('tab', { name: /Timeline/i }).click();
    await expect(page).toHaveURL(/[?&]view=timeline/);
    await expect(page.getByRole('region', { name: 'Timeline', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('tab', { name: /Map/i }).click();
    await expect(page).toHaveURL(/[?&]view=map/);
    // The map view lazy-loads MapLibre; on a cold CI load the region can take
    // longer than 10s to mount its WebGL canvas. Give it a generous window,
    // and absorb the intermittent CI-only chunk stall (SW-cached shell + cold
    // lazy fetch) with a single reload — ?view=map on reload still exercises
    // the URL→view wiring end-to-end.
    const mapRegion = page.getByRole('region', { name: /Map of personalities/i });
    try {
      await expect(mapRegion).toBeVisible({ timeout: 25_000 });
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(mapRegion).toBeVisible({ timeout: 25_000 });
    }

    await page.getByRole('tab', { name: /Grid/i }).click();
    // ?view=grid is the default, so it should be stripped from the URL.
    await expect(page).not.toHaveURL(/[?&]view=/);
  });

  test('tag deep-link renders an active filter chip', async ({ page }) => {
    await page.goto('/personalities?tag=writer', { waitUntil: 'networkidle' });
    const remove = page.getByRole('button', { name: 'Remove writer', exact: true });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(page).not.toHaveURL(/[?&]tag=/);
  });
  test('German directory keeps alphabet filters and map controls in German', async ({ page }) => {
    await page.goto('/de/personalities?letter=A', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('button', { name: 'Anfangsbuchstabe: A entfernen', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Letter: A', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('textbox', {
        name: 'Nach Name, Beruf oder Beschreibung suchen…',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Karte', exact: true }).click();
    await expect(page).toHaveURL(/[?&]view=map/);
    await expect(
      page.getByRole('region', { name: 'Karte der Persönlichkeiten nach Land', exact: true }),
    ).toBeVisible({ timeout: 25_000 });
  });
});
