import { test, expect } from '@playwright/test';

test.describe.configure({ retries: 0 });
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const topics = ['group_comments', 'community_comments', 'business_updates'] as const;

test('new email controls scroll clear of fixed overlays without changing preferences', async ({ page }, testInfo) => {
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
  const response = page.waitForResponse((r) => r.url().includes('/functions/v1/email-subscriptions') && r.request().method() === 'GET');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/settings?section=account');
  expect((await response).status()).toBe(200);
  const region = page.getByRole('region', { name: 'Email updates', exact: true });
  await expect(region).toBeVisible();
  const checkedBefore = await Promise.all(topics.map((topic) => region.locator(`#email-operation-${topic}`).isChecked()));
  const geometry = [];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await region.locator('label[for="email-operation-community_comments"]').evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const controls = [];
    for (const [index, topic] of topics.entries()) {
      const checkbox = region.locator(`#email-operation-${topic}`);
      const label = region.locator(`label[for="email-operation-${topic}"]`);
      await expect(checkbox).toBeVisible();
      await expect(checkbox).toBeEnabled();
      // Playwright checks pointer actionability, but trial never clicks or toggles.
      await checkbox.click({ trial: true });
      for (const target of [checkbox, label]) {
        await expect.poll(() => target.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit === el || (hit !== null && el.contains(hit));
        })).toBe(true);
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(901);
      }
      expect(await checkbox.isChecked()).toBe(checkedBefore[index]);
      controls.push({ topic, checkbox: await checkbox.boundingBox(), label: await label.boundingBox(), row: await checkbox.locator('..').boundingBox(), hit_test_clear: true });
    }
    const regionBox = await region.boundingBox();
    expect(regionBox).not.toBeNull();
    const top = Math.min(...controls.map((c) => c.row!.y)) - 8;
    const bottom = Math.max(...controls.map((c) => c.row!.y + c.row!.height)) + 8;
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(900);
    await testInfo.attach(`viewport-controls-${width}`, { body: await page.screenshot({ clip: { x: regionBox!.x, y: top, width: regionBox!.width, height: bottom - top }, animations: 'disabled' }), contentType: 'image/png' });
    geometry.push({ viewport: { width, height: 900 }, controls, horizontal_overflow: false });
  }
  const checkedAfter = await Promise.all(topics.map((topic) => region.locator(`#email-operation-${topic}`).isChecked()));
  expect(checkedAfter).toEqual(checkedBefore);
  expect(blocked).toEqual([]);
  await testInfo.attach('viewport-proof', { body: Buffer.from(JSON.stringify({ geometry, checked_before: checkedBefore, checked_after: checkedAfter, blocked_email_writes: blocked }, null, 2)), contentType: 'application/json' });
});
