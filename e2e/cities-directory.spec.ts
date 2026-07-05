import { test, expect } from '@playwright/test';

/**
 * /cities directory smoke test — runs against E2E_BASE_URL (defaults to
 * https://queer.guide). Skips gracefully if the redesigned page has not
 * yet been deployed (detected by the absence of the filter bar).
 */

test.describe('Cities directory', () => {
  test('renders hero, filter bar, list, and map landmarks', async ({ page }) => {
    await page.goto('/cities');
    await page.waitForLoadState('networkidle').catch(() => {});

    const filterGroup = page.getByRole('group', { name: /filter cities/i });
    if (!(await filterGroup.isVisible().catch(() => false))) {
      test.skip(true, '/cities redesign not yet deployed to E2E_BASE_URL');
      return;
    }

    await expect(page.getByRole('region', { name: /cities map/i })).toBeVisible();
    await expect(page.getByRole('list', { name: /^cities$/i })).toBeVisible();
    // Multiple role=status nodes exist (the sr-only route announcer
    // "Navigated to Cities | Queer Guide" plus the visible "N of M cities"
    // count). Match only the count node — the announcer also contains the word
    // "cities", so a bare /cities/i filter resolves to 2 elements (strict-mode
    // violation).
    await expect(page.getByRole('status').filter({ hasText: /of \d+ cities/i })).toContainText(
      /\d+ cities/i,
    );
  });

  test('typing in the search input filters the list and updates ?q=', async ({ page }) => {
    await page.goto('/cities');
    await page.waitForLoadState('networkidle').catch(() => {});

    const filterGroup = page.getByRole('group', { name: /filter cities/i });
    if (!(await filterGroup.isVisible().catch(() => false))) {
      test.skip(true, '/cities redesign not yet deployed');
      return;
    }

    const input = page.getByPlaceholder(/search cities/i);
    await input.fill('berlin');
    await expect(page).toHaveURL(/[?&]q=berlin/);
  });

  test('toggling a continent chip updates ?continent=', async ({ page }) => {
    await page.goto('/cities');
    await page.waitForLoadState('networkidle').catch(() => {});

    const continentGroup = page.getByRole('group', { name: /filter by continent/i });
    if (!(await continentGroup.isVisible().catch(() => false))) {
      test.skip(true, '/cities redesign not yet deployed');
      return;
    }

    const firstChip = continentGroup.getByRole('button').first();
    await firstChip.click();
    await expect(page).toHaveURL(/[?&]continent=[a-z]/i);
  });

  test('reset button clears filters', async ({ page }) => {
    await page.goto('/cities?q=ber&continent=eu&equality=very-high');
    await page.waitForLoadState('networkidle').catch(() => {});

    const reset = page.getByRole('button', { name: /reset filters/i });
    if (!(await reset.isVisible().catch(() => false))) {
      test.skip(true, '/cities redesign not yet deployed or no filters active');
      return;
    }
    await reset.click();
    const url = new URL(page.url());
    expect(url.searchParams.get('q')).toBeNull();
    expect(url.searchParams.get('continent')).toBeNull();
    expect(url.searchParams.get('equality')).toBeNull();
  });
});
