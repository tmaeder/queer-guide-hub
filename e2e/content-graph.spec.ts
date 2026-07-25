import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for /admin/graph (Content Graph explorer).
 *
 * SAFETY: the client hardcodes production Supabase even under `vite preview`,
 * and baseURL defaults to https://queer.guide. This spec is strictly READ-ONLY:
 * `admin_content_graph`, `admin_entity_neighbors`, and the record search are all
 * reads — it never mutates. Authenticated tests skip without an admin session
 * (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD → playwright/.auth/admin.json).
 *
 * NOTE: we deliberately avoid `waitForLoadState('networkidle')` — the SPA holds
 * persistent Supabase realtime connections, so the network never idles.
 */

async function gotoGraph(page: Page): Promise<void> {
  await page.goto('/admin/graph', { waitUntil: 'domcontentloaded' });
  // Let the client-side admin guard resolve (redirect to /auth if anon).
  await page.waitForTimeout(2500);
}

async function isAuthed(page: Page): Promise<boolean> {
  await gotoGraph(page);
  return new URL(page.url()).pathname.startsWith('/admin/graph');
}

test.describe('Content Graph — unauthenticated smoke', () => {
  test('reaches /admin/graph without a runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const response = await page.goto('/admin/graph', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await page.waitForTimeout(2500);
    const crashes = errors.filter((e) => /is not defined|ReferenceError|TypeError.*undefined/i.test(e));
    expect(crashes, `runtime errors: ${crashes.join('; ')}`).toEqual([]);
  });
});

test.describe('Content Graph — authenticated (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    const authed = await isAuthed(page);
    test.skip(!authed, 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('renders the header, legend and macro ontology map', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /^Content Graph$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Thickness = link count/i)).toBeVisible();
    // At least one React Flow type-node card renders.
    await expect(page.locator('[data-testid^="type-node-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('selecting a type node opens the detail panel with stats + deep links', async ({ page }) => {
    const venue = page.locator('[data-testid="type-node-venue"]');
    await expect(venue).toBeVisible({ timeout: 15_000 });
    await venue.click();

    await expect(page.getByRole('heading', { name: /^Venues$/ })).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Open admin/i })).toBeVisible();
    await expect(page.getByText(/Explore a record/i)).toBeVisible();
  });

  test('record search drills into a structural instance ego graph', async ({ page }) => {
    const venue = page.locator('[data-testid="type-node-venue"]');
    await expect(venue).toBeVisible({ timeout: 15_000 });
    await venue.click();

    const search = page.getByPlaceholder(/Search venue records/i);
    await expect(search).toBeVisible();
    await search.fill('bar');

    // First result row in the picker's scroll list → opens the ego-graph dialog.
    const firstResult = page.locator('.max-h-64 button').first();
    await expect(firstResult).toBeVisible({ timeout: 15_000 });
    await firstResult.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The ego graph reuses EntityNode (data-testid="ego-node-…").
    await expect(dialog.locator('[data-testid^="ego-node-"]').first()).toBeVisible({ timeout: 15_000 });
  });
});
