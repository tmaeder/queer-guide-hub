import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

const FINAL_BUILD = '6730900f1beac10ae708b067e0bde5e7b82c4bde';

// The unchanged workflow still runs its existing real-credential auth setup.
// This spec deliberately uses a fresh context and the normal sign-in form.
// Never collect authentication traces or screenshots containing credentials.
test.use({
  storageState: { cookies: [], origins: [] },
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
test.describe.configure({ retries: 0, mode: 'serial' });

async function normalLogin(page: Page, baseURL: unknown) {
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD)
    throw new Error('Configured production admin credentials are required; this test cannot skip.');
  expect(new URL(String(baseURL)).origin).toBe('https://queer.guide');
  const deployed = await page.request.get('/build-id.txt');
  expect(deployed.ok()).toBe(true);
  expect((await deployed.text()).trim()).toBe(FINAL_BUILD);
  await page.goto('/auth?redirect=%2Fadmin%2Femail');
  await waitForAppReady(page);
  const cookies = page.getByRole('button', { name: 'Necessary Only', exact: true });
  if (await cookies.isVisible()) await cookies.click();
  try {
    const signedIn = page
      .waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/auth/v1/token' &&
          new URL(response.url()).searchParams.get('grant_type') === 'password' &&
          response.request().method() === 'POST',
      )
      .catch(() => null);
    const main = page.getByRole('main');
    await main.getByLabel('Email', { exact: true }).fill(process.env.E2E_ADMIN_EMAIL);
    await main.getByLabel('Password', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD);
    await main.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth(?:[/?#]|$)/, { timeout: 45_000 });
    const response = await signedIn;
    if (!response?.ok()) throw new Error('Normal sign-in did not return success.');
    const { user } = await response.json();
    if (!user || typeof user.id !== 'string' || typeof user.email !== 'string')
      throw new Error('Normal sign-in did not return a user.');
    // Read only the user identity from the genuine login response. Never attach,
    // extract, copy, inject or log its session credentials or network payload.
    return {
      id: user.id as string,
      email: user.email as string,
      emailConfirmed: Boolean(user.email_confirmed_at),
    };
  } catch {
    throw new Error(
      'Normal admin form sign-in did not succeed. No auth bypass or fallback was attempted.',
    );
  }
}

// Temporary read-only production regression: no fixture and no sends.
test('production template rows contain wrapped text at desktop and mobile widths', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await normalLogin(page, info.project.use.baseURL);
  let blockedMutations = 0;
  await page.route('**/rest/v1/email_*', async (route) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
    blockedMutations++;
    return route.abort('blockedbyclient');
  });
  await page.route('**/functions/v1/**', async (route) => {
    const req = route.request();
    const name = new URL(req.url()).pathname.split('/').pop() ?? '';
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method()) &&
      (name.startsWith('email-') || name === 'send-email' || name === 'send-mailbox-email')
    ) {
      blockedMutations++;
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.goto('/admin/email-templates');
  await waitForAppReady(page);
  await expect(page).toHaveURL(/\/admin\/email\?tab=templates$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Email', exact: true })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Email Templates', exact: true })).toHaveCount(0);
  const templates = page.getByRole('complementary', { name: 'Email templates', exact: true });
  const rows = templates.locator('button[aria-pressed]');
  await expect(rows).toHaveCount(7);
  await rows.filter({ hasText: 'recognition_year_in_review' }).click();
  const workspace = page.getByRole('region', { name: 'Template workspace', exact: true });
  await expect(workspace.getByRole('status')).toHaveText('Saved template');
  const previewButton = workspace.getByRole('button', { name: 'Preview', exact: true });
  await previewButton.click();
  await expect(page.locator('iframe[title="Email preview"]')).toBeVisible();
  const identity = page.getByRole('button', { name: 'Sign out', exact: true }).locator('..');
  const evidence = [];
  for (const [label, width, height] of [
    ['desktop', 1280, 900],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    // Real content geometry catches flex shrink even if class names change.
    const geometry = await rows.evaluateAll((buttons) =>
      buttons.map((button, index) => {
        const rect = button.getBoundingClientRect();
        const content = [...button.querySelectorAll('span')].map((span) =>
          span.getBoundingClientRect(),
        );
        const next = buttons[index + 1]?.getBoundingClientRect();
        return {
          row: index,
          height: rect.height,
          contentContained: content.every(
            (child) =>
              child.top >= rect.top - 1 &&
              child.bottom <= rect.bottom + 1 &&
              child.left >= rect.left - 1 &&
              child.right <= rect.right + 1,
          ),
          nextRowClear: !next || next.top >= rect.bottom - 1,
        };
      }),
    );
    expect(geometry).toHaveLength(7);
    expect(
      geometry.every((row) => row.contentContained && row.nextRowClear && row.height >= 44),
    ).toBe(true);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(dimensions.width).toBe(width);
    expect(dimensions.scroll).toBeLessThanOrEqual(width);
    await rows.first().evaluate((button) => {
      if (button.parentElement) button.parentElement.scrollTop = 0;
    });
    await info.attach(`${label}-workspace-fixed`, {
      body: await page.screenshot({ fullPage: true, mask: [identity] }),
      contentType: 'image/png',
    });
    evidence.push({ label, dimensions, geometry });
  }
  expect(blockedMutations).toBe(0);
  const deployed = await page.request.get('/build-id.txt');
  expect((await deployed.text()).trim()).toBe(FINAL_BUILD);
  await info.attach('layout-verification', {
    body: JSON.stringify({ build: FINAL_BUILD, sends: 0, writes: 0, blockedMutations, evidence }),
    contentType: 'application/json',
  });
});
