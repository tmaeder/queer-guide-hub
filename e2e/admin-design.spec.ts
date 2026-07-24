import { test, expect, type Page } from '@playwright/test';

/**
 * E2E for /admin/design (Design & Branding Control Center).
 *
 * SAFETY: every run points at the production Supabase (client.ts hardcodes the
 * prod URL even under `vite preview`). This spec therefore NEVER mutates — it
 * blocks all `branding_*` RPCs and only ever exercises the client-side draft
 * buffer + the publish DIFF (then Cancels). Token edits live purely in React
 * state until Save draft / Publish, which we never click.
 */

async function isAuthed(page: Page): Promise<boolean> {
  await page.goto('/admin/design', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  return new URL(page.url()).pathname.startsWith('/admin/design');
}

test.describe('Admin design — unauthenticated smoke', () => {
  test('reaches /admin/design without a runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const response = await page.goto('/admin/design', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);
    await page.waitForLoadState('networkidle').catch(() => {});
    const crashes = errors.filter((e) => /is not defined|ReferenceError|TypeError.*undefined/i.test(e));
    expect(crashes, `runtime errors: ${crashes.join('; ')}`).toEqual([]);
  });
});

test.describe('Admin design — authenticated (read-only, never mutates)', () => {
  let rpcAttempts = 0;

  test.beforeEach(async ({ page }) => {
    rpcAttempts = 0;
    // Hard guard: abort any branding write RPC so an accidental click can't
    // touch prod. Reads are PostgREST table selects, unaffected.
    await page.route('**/rest/v1/rpc/branding_*', (route) => {
      rpcAttempts += 1;
      return route.abort();
    });
    const authed = await isAuthed(page);
    test.skip(!authed, 'requires an admin session (E2E_ADMIN_EMAIL/PASSWORD)');
  });

  test('renders header, tabs and the draft status bar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Design & Branding/i })).toBeVisible({ timeout: 15_000 });
    for (const tab of ['Tokens', 'Brand assets', 'SEO & meta', 'Email', 'Presets & schedule', 'Audit']) {
      await expect(page.getByRole('tab', { name: new RegExp(tab, 'i') })).toBeVisible();
    }
    await expect(page.getByText(/\d+ overrides/i)).toBeVisible();
  });

  test('tokens tab shows the catalog + live preview', async ({ page }) => {
    await expect(page.getByText('Core', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('--muted', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Live preview \(draft\)/i)).toBeVisible();
  });

  test('editing a token marks the draft dirty and shows it in the publish diff (then cancels)', async ({
    page,
  }) => {
    await expect(page.getByText('Core', { exact: true })).toBeVisible({ timeout: 15_000 });

    const initial = await page.getByText(/\d+ overrides/i).innerText();
    const initialCount = parseInt(initial.match(/(\d+)/)?.[1] ?? '0', 10);

    // Open the --muted (light) swatch popover and nudge the L channel.
    await page.locator('button[aria-label^="Edit --muted (light)"]').click();
    const lInput = page.locator('label:has-text("L %") + input, input').last();
    await lInput.fill('91');
    await page.keyboard.press('Escape');

    await expect(page.getByText(/unsaved changes/i)).toBeVisible();
    await expect(page.getByText(new RegExp(`${initialCount + 1} overrides`))).toBeVisible();

    // Open the publish diff — assert the change is listed, then Cancel.
    await page.getByRole('button', { name: /Publish…/i }).click();
    await expect(page.getByText(/Publish branding changes/i)).toBeVisible();
    await expect(page.getByText('tokens.light.muted')).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/i }).click();

    expect(rpcAttempts, 'no branding_* RPC should have been attempted').toBe(0);
  });

  test('preview panel has a mobile-width toggle', async ({ page }) => {
    await expect(page.getByText(/Live preview \(draft\)/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^Mobile$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Desktop$/i })).toBeVisible();
  });
});
