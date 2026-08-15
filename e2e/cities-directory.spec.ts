import { test, expect } from '@playwright/test';

/**
 * /cities directory smoke test — runs against E2E_BASE_URL (defaults to
 * https://queer.guide).
 *
 * THESE TESTS NO LONGER SKIP THEMSELVES. Every one of them used to bail with
 * `test.skip(true, '/cities redesign not yet deployed')` when the filter bar was
 * missing, which meant the single most likely regression — a rewrite that drops
 * or renames the control band — turned the whole file green while it asserted
 * nothing. Same lesson as `map-shell.spec.ts`: a spec that skips itself when the
 * thing under test is absent can never go red. A missing band is a FAILURE.
 *
 * No `networkidle` anywhere: the default view is a virtualized card grid, but the
 * page still lazy-loads a MapLibre chunk under ?view=map, and the pride-calendar
 * queries settle on their own schedule. Wait on the elements instead.
 */

const FILTER_BAR = { role: 'group' as const, name: /filter cities/i };

test.describe('Cities directory', () => {
  test('renders the masthead, control band, continent index and card grid', async ({
    page,
  }) => {
    await page.goto('/cities');

    await expect(page.getByRole('group', FILTER_BAR)).toBeVisible({ timeout: 15_000 });

    // The continent line index — the C line's stop list. It is the primary browse
    // affordance, so it is not optional chrome.
    await expect(
      page.getByRole('group', { name: /filter by continent/i }),
    ).toBeVisible();

    // The grid landmark. Deliberately a named region, not role=list: the grid
    // virtualizes into <div> rows, and a role="list" whose listitems sit behind
    // positioning divs fails axe's aria-required-children.
    await expect(page.getByRole('region', { name: /^cities$/i })).toBeVisible();

    // Two role=status nodes exist: the global sr-only route announcer (a <div>,
    // routes.tsx) and the visible count (a <p>, CitiesControlBar). Target the
    // visible count node specifically.
    await expect(
      page.locator('p[role="status"]').filter({ hasText: /cities/i }),
    ).toContainText(/cities/i);

    // At least one city card actually rendered.
    await expect(page.locator('a[href*="/city/"]').first()).toBeVisible();
  });

  test('the directory reaches past the old 400-city population cap', async ({ page }) => {
    // Brighton has 184 approved venues and ~156k people. Under the old
    // population-ordered cap it — and 1,767 other cities holding 40% of the venue
    // corpus — could not be reached from this page at all.
    await page.goto('/cities?q=brighton');
    await expect(page.getByRole('group', FILTER_BAR)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('a[href*="/city/"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('region', { name: /^cities$/i })).toContainText(
      /brighton/i,
    );
  });

  test('typing in the search input filters the list and updates ?q=', async ({ page }) => {
    await page.goto('/cities');
    await expect(page.getByRole('group', FILTER_BAR)).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder(/search cities/i).fill('berlin');
    await expect(page).toHaveURL(/[?&]q=berlin/);
  });

  test('a continent tile updates ?continent= and the index stays on screen', async ({
    page,
  }) => {
    await page.goto('/cities');
    const continentGroup = page.getByRole('group', { name: /filter by continent/i });
    await expect(continentGroup).toBeVisible({ timeout: 15_000 });

    const firstTile = continentGroup.getByRole('button').first();
    await firstTile.click();
    await expect(page).toHaveURL(/[?&]continent=[a-z]/i);

    // The index must survive being used — hiding it on selection takes the map
    // away at exactly the moment the reader started navigating by it.
    await expect(continentGroup).toBeVisible();
    await expect(continentGroup.getByRole('button').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('reset button clears filters', async ({ page }) => {
    await page.goto('/cities?q=ber&continent=eu&equality=very-high');
    await expect(page.getByRole('group', FILTER_BAR)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /reset filters/i }).click();
    const url = new URL(page.url());
    expect(url.searchParams.get('q')).toBeNull();
    expect(url.searchParams.get('continent')).toBeNull();
    expect(url.searchParams.get('equality')).toBeNull();
  });

  test('?view=map renders the map region', async ({ page }) => {
    // The map moved behind a view toggle, so this assertion moved with it — on
    // the default view there is deliberately no map in the DOM at all.
    await page.goto('/cities?view=map');
    await expect(page.getByRole('group', FILTER_BAR)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('region', { name: /cities map/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('region', { name: /^cities$/i })).toHaveCount(0);
  });
});
