import { test, expect } from '@playwright/test';
import { anonHeaders } from './support/anonKey';

/**
 * /spots/:slug (spots P3a) serves the existing venue or organisation page and must declare the
 * old URL canonical until the spots redirect switch; a self-canonical /spots URL would give every
 * venue a duplicate for search engines.
 */
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

async function firstSlug(request: import('@playwright/test').APIRequestContext, path: string) {
  const res = await request.get(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: await anonHeaders(request),
  });
  expect(res.ok(), `${path} -> HTTP ${res.status()}`).toBeTruthy();
  const rows = (await res.json()) as Array<{ slug: string }>;
  expect(rows.length, `no fixture row for ${path}`).toBeGreaterThan(0);
  return rows[0].slug;
}

test('a venue under /spots declares /venues canonical to crawlers', async ({ request }) => {
  const slug = await firstSlug(
    request,
    'venues?select=slug&duplicate_of_id=is.null&closed_at=is.null&seo_indexable=eq.true&limit=1',
  );
  const res = await request.get(`/spots/${slug}`, { headers: { 'User-Agent': BOT_UA } });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(`<link rel="canonical" href="https://queer.guide/venues/${slug}"`);
  expect(html).not.toContain(`href="https://queer.guide/spots/${slug}"`);
});

test('an organisation slug under /spots renders the organisation page', async ({
  page,
  request,
}) => {
  const slug = await firstSlug(
    request,
    'organizations?select=slug&status=eq.active&duplicate_of_id=is.null&roles=cs.%7Bsupport%7D&roles=not.cs.%7Bvenue%7D&limit=1',
  );
  await page.goto(`/spots/${slug}`);
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe(`/spots/${slug}`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://queer.guide/organizations/${slug}`,
  );
});
