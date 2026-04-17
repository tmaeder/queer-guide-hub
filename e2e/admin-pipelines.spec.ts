import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E smoke tests for /admin/pipelines.
 * Unauthenticated tests verify the app shell loads without crashes.
 * Authenticated tests (E2E_ADMIN_COOKIE set) cover tab navigation, builder
 * interactions, and the new features (audit / integrations / access / AI suggest).
 */

async function loginViaCookie(context: BrowserContext) {
  const cookie = process.env.E2E_ADMIN_COOKIE;
  if (!cookie) return false;
  await context.addCookies([{
    name: 'sb-access-token',
    value: cookie,
    domain: new URL(process.env.E2E_BASE_URL || 'https://queer.guide').hostname,
    path: '/',
  }]);
  return true;
}

async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { /* ignore */ });
}

test.describe('Admin pipelines — unauthenticated', () => {
  test('reaches /admin/pipelines without runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto('/admin/pipelines', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    await waitForAppReady(page);

    const crashErrors = errors.filter(e => /is not defined|ReferenceError|TypeError.*undefined/i.test(e));
    expect(crashErrors, `runtime errors: ${crashErrors.join('; ')}`).toEqual([]);
  });
});

test.describe('Admin pipelines — authenticated', () => {
  test.beforeEach(async ({ context }) => {
    const ok = await loginViaCookie(context);
    test.skip(!ok, 'requires E2E_ADMIN_COOKIE env var');
  });

  test('Overview tab renders with summary cards and table', async ({ page }) => {
    await page.goto('/admin/pipelines');
    await expect(page.getByRole('button', { name: /Overview/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Active definitions/i)).toBeVisible();
    await expect(page.getByText(/Runs in last 24h/i)).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Kind/i })).toBeVisible();
  });

  test('tab navigation reaches each tab without error', async ({ page }) => {
    await page.goto('/admin/pipelines');
    const tabs = [
      'Builder', 'Monitor', 'Sources', 'Review', 'DLQ', 'Errors',
      'Alerts', 'Coverage', 'News', 'Health', 'Audit', 'Integrations',
    ];
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (const label of tabs) {
      await page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first().click();
      await page.waitForTimeout(500);
    }

    const crashErrors = errors.filter(e => /is not defined|ReferenceError/i.test(e));
    expect(crashErrors, `tab navigation errors: ${crashErrors.join('; ')}`).toEqual([]);
  });

  test('Builder toolbar shows Save, Run, Dry Run buttons', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=builder');
    await page.waitForTimeout(2000);
    await expect(page.getByRole('button', { name: /Save$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Run$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Dry Run/i })).toBeVisible();
  });

  test('Keyboard shortcut ⌘K opens quick-add palette', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=builder');
    await page.waitForTimeout(2000);

    const isMac = await page.evaluate(() => navigator.platform.includes('Mac'));
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');

    // Quick-add palette should show a search placeholder
    await expect(page.getByPlaceholder(/Type to search nodes/i)).toBeVisible({ timeout: 5_000 });
  });

  test('Audit tab shows event timeline', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=audit');
    await expect(page.getByText(/Audit Trail/i)).toBeVisible({ timeout: 10_000 });
    // Filter chips
    await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^run$/i })).toBeVisible();
  });

  test('Integrations tab allows adding a webhook', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=integrations');
    await expect(page.getByText(/Alert Webhook Integrations/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Add integration/i }).click();
    await expect(page.getByText(/New webhook integration/i)).toBeVisible();
    await expect(page.getByPlaceholder(/#data-ops alerts/i)).toBeVisible();
    // Don't actually submit; just verify form renders
    await page.keyboard.press('Escape');
  });

  test('Monitor tab shows charts', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=monitor');
    await expect(page.getByText(/Run duration distribution/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Throughput \(last 24h\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Compare runs/i })).toBeVisible();
  });

  test('Help cheat sheet opens with ? key', async ({ page }) => {
    await page.goto('/admin/pipelines?tab=builder');
    await page.waitForTimeout(2000);
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByText(/Keyboard Shortcuts/i)).toBeVisible({ timeout: 5_000 });
  });
});
