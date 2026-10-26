import { test, expect } from '@playwright/test';

// Read-only live verification. Source capture/enqueue/authorization is exercised
// separately in the mandatory-rollback SQL contract; this spec never sends mail.
test.describe('transactional domain email settings', () => {
  test.describe.configure({ retries: 0, mode: 'serial' });
  test.use({ trace: 'off', video: 'off', screenshot: 'off' });

  test('shows independent comment and business controls on desktop and mobile without email writes', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    expect(Boolean(process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD)).toBe(true);
    const blocked: string[] = [];
    await page.route('**/functions/v1/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (/email|notifications|trip-invitations/.test(path) && !['GET', 'OPTIONS'].includes(request.method())) {
        blocked.push(`${request.method()} ${path}`);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
      localStorage.setItem('queer-guide-cookie-consent', JSON.stringify({
        preferences: { necessary: true, functional: true, analytics: false, marketing: false },
        version: '1.0', timestamp: new Date(0).toISOString(),
      }));
    });
    const preferencesResponse = page.waitForResponse((response) =>
      response.url().includes('/functions/v1/email-subscriptions') && response.request().method() === 'GET',
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/settings?section=account');
    expect((await preferencesResponse).status()).toBe(200);
    const region = page.getByRole('region', { name: 'Email updates', exact: true });
    await expect(region).toBeVisible();
    for (const name of [
      'Email me mentions and replies in my groups',
      'Email me mentions and replies in the community',
      'Email me claim and service updates for businesses I represent',
    ]) {
      const checkbox = region.getByRole('checkbox', { name, exact: true });
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toBeEnabled();
    }
    await expect(region.getByRole('button', { name: 'Save activity email settings', exact: true })).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const box = await region.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await testInfo.attach(`transactional-email-settings-${width}`, { body: await region.screenshot(), contentType: 'image/png' });
    }
    expect(blocked).toEqual([]);
  });
});
