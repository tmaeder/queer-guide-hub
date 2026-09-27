import { expect, test } from '@playwright/test';

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const CREATED = [
  'sexual-response-cycle',
  'refractory-period',
  'vulval-self-exam',
  'fear-of-intimacy',
  'fear-of-commitment',
  'possessiveness',
  'pde5-inhibitor',
] as const;

test.describe('WebMD glossary production pass', () => {
  test.describe.configure({ timeout: 60_000 });

  test('new concepts resolve but stay unpublished', async ({ request }) => {
    const sitemapResponse = await request.get('/sitemap-tags.xml', {
      headers: { 'User-Agent': BOT_UA },
    });
    expect(sitemapResponse.status()).toBe(200);
    const sitemap = await sitemapResponse.text();
    expect(
      (sitemap.match(/<loc>/g) ?? []).length,
      'tag sitemap should be populated',
    ).toBeGreaterThan(500);

    for (const slug of CREATED) {
      const response = await request.get(`/tags/${slug}`, {
        headers: { 'User-Agent': BOT_UA },
      });
      expect(response.status(), `/tags/${slug} should resolve`).toBe(200);
      const html = await response.text();
      expect(html, `/tags/${slug} should remain noindex pending publication review`).toMatch(
        /<meta name="robots" content="[^"]*noindex/i,
      );
      expect(sitemap, `/tags/${slug} must not be in the sitemap`).not.toContain(`/tags/${slug}<`);
    }
  });

  test('a new concept renders its reviewed copy in the SPA', async ({ page }) => {
    await page.goto('/tags/sexual-response-cycle', { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Sexual Response Cycle', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('main')).toContainText('map, not a required sequence', {
      timeout: 20_000,
    });
    await expect(page.locator('main')).toContainText('satisfying sex does not require orgasm');
  });

  test('existing glossary pages render the audited improvements', async ({ page }) => {
    await page.goto('/tags/sperm', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Sperm', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('main')).toContainText('semen is the fluid that carries sperm', {
      timeout: 20_000,
    });

    await page.goto('/tags/sti', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'STI', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('main')).toContainText('Testing, vaccination, barriers');
  });
});
