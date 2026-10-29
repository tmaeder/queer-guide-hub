import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });
for (const width of [390, 1365]) {
  test(`offscreen venue queries follow the reader at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const railRequests: string[] = [];
    let guideRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.endsWith('/rest/v1/guides')) guideRequests++;
      if (!request.url().includes('/rpc/rpc_venues_ranked')) return;
      const body = request.postDataJSON();
      if (body?.p_limit === 8) railRequests.push(body.p_sort);
    });
    await page.goto('/venues');
    await expect(page.getByRole('region', { name: /featured venue/i })).toBeVisible();
    const recent = page.locator('[data-venue-rail="created_at"]');
    await expect(recent).toBeAttached();
    expect((await recent.boundingBox())!.y).toBeGreaterThan(844);
    expect(railRequests).toEqual([]);
    expect(guideRequests).toBe(0);
    const guides = page.locator('[data-venue-discovery="guides"]');
    await guides.scrollIntoViewIfNeeded();
    await expect.poll(() => guideRequests).toBeGreaterThan(0);
    await expect(guides.getByRole('link', { name: 'All guides' })).toHaveAttribute(
      'href',
      /^\/guides/,
    );

    // A placeholder heading is insufficient: approaching must actually fetch
    // and render linked venue cards, without also starting the later rail.
    await recent.scrollIntoViewIfNeeded();
    await expect.poll(() => railRequests.includes('created_at')).toBe(true);
    await expect(recent.locator('a[href^="/venues/"]').first()).toBeVisible();
    const editors = page.locator('[data-venue-rail="featured"]').last();
    // A tall viewport can approach both neighboring rails at once.
    if (railRequests.includes('featured')) {
      expect((await editors.boundingBox())!.y).toBeLessThanOrEqual(844);
    }
    await editors.scrollIntoViewIfNeeded();
    await expect.poll(() => railRequests.includes('featured')).toBe(true);
    await expect(editors.locator('a[href^="/venues/"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`about sections remain available as the reader scrolls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/about');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const history = page.locator('[data-about-section="history"]');
    await expect(history).toBeAttached();
    await expect(history.getByRole('heading')).toHaveCount(0);
    for (const [section, title] of [
      ['lines', 'Five lines'],
      ['story', 'How this started'],
      ['legend', 'What makes us different'],
      ['history', 'The line so far'],
      ['values', 'What we value'],
      ['people', 'The people behind it'],
      ['getinvolved', 'Help us extend the line.'],
    ]) {
      const target = page.locator(`[data-about-section="${section}"]`);
      await target.scrollIntoViewIfNeeded();
      await expect(target.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(page.locator('#sources')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Submit a venue', exact: true })).toHaveAttribute(
      'href',
      '/submit',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
