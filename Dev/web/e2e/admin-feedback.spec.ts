import { test, expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * E2E smoke tests for /admin/feedback.
 * Unauthenticated tests verify the app shell loads without runtime errors.
 * Authenticated tests (E2E_ADMIN_COOKIE set) cover tab nav, kanban rendering,
 * drawer interactions, and the shortcut help overlay.
 */

async function loginViaCookie(context: BrowserContext) {
  const cookie = process.env.E2E_ADMIN_COOKIE;
  if (!cookie) return false;
  await context.addCookies([
    {
      name: 'sb-access-token',
      value: cookie,
      domain: new URL(process.env.E2E_BASE_URL || 'https://queer.guide').hostname,
      path: '/',
    },
  ]);
  return true;
}

async function waitForAppReady(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
    /* ignore */
  });
}

test.describe('Admin feedback — unauthenticated', () => {
  test('reaches /admin/feedback without runtime crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto('/admin/feedback', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    await waitForAppReady(page);

    const crashErrors = errors.filter((e) =>
      /is not defined|ReferenceError|TypeError.*undefined/i.test(e),
    );
    expect(crashErrors, `runtime errors: ${crashErrors.join('; ')}`).toEqual([]);
  });
});

test.describe('Admin feedback — authenticated', () => {
  test.beforeEach(async ({ context }) => {
    const ok = await loginViaCookie(context);
    test.skip(!ok, 'requires E2E_ADMIN_COOKIE env var');
  });

  test('Kanban tab renders 5 status columns', async ({ page }) => {
    await page.goto('/admin/feedback');
    await expect(page.getByRole('button', { name: /Community/i })).toBeVisible({
      timeout: 15_000,
    });
    for (const col of ['New', 'Triaged', 'In Progress', 'Blocked', 'Done']) {
      await expect(page.getByText(new RegExp(`^${col}$`, 'i')).first()).toBeVisible();
    }
  });

  test('tab navigation reaches each tab without error', async ({ page }) => {
    await page.goto('/admin/feedback');
    const tabs = ['Community', 'API Errors', 'Spam', 'Analytics'];
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    for (const label of tabs) {
      await page
        .getByRole('button', { name: new RegExp(`^${label}`, 'i') })
        .first()
        .click()
        .catch(() => {
          /* tab may be hidden if no data */
        });
      await page.waitForTimeout(400);
    }

    const crashErrors = errors.filter((e) => /is not defined|ReferenceError/i.test(e));
    expect(crashErrors, `tab nav errors: ${crashErrors.join('; ')}`).toEqual([]);
  });

  test('? opens the shortcut help overlay', async ({ page }) => {
    await page.goto('/admin/feedback');
    await page.waitForTimeout(1500);
    await page.keyboard.press('Shift+Slash'); // '?'
    await expect(page.getByText(/Keyboard shortcuts/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Copy prompt \+ record Claude handoff/i)).toBeVisible();
  });

  test('cmd+k opens the command palette', async ({ page }) => {
    await page.goto('/admin/feedback');
    await page.waitForTimeout(1500);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${mod}+k`);
    await expect(page.getByPlaceholder(/Type a command/i)).toBeVisible({ timeout: 5_000 });
  });

  test('filters row shows priority, assignee, has-screenshot controls', async ({ page }) => {
    await page.goto('/admin/feedback');
    await page.waitForTimeout(1500);
    await expect(page.getByText(/All priorities/i)).toBeVisible();
    await expect(page.getByText(/Any assignee/i)).toBeVisible();
    await expect(page.getByText(/Has screenshot/i)).toBeVisible();
  });

  test('URL state persists through reload', async ({ page }) => {
    await page.goto('/admin/feedback?q=test&status=new');
    await page.waitForTimeout(1500);
    const searchInput = page.getByPlaceholder(/Search/i).first();
    await expect(searchInput).toHaveValue(/test/i);
    await page.reload();
    await page.waitForTimeout(1500);
    expect(page.url()).toMatch(/q=test/);
    expect(page.url()).toMatch(/status=new/);
  });
});
