import { test, expect } from '@playwright/test';

// Venues audit Phase 7 (P1): detail page content rendering + website link.

const baseURL = process.env.E2E_BASE_URL || 'https://queer.guide';

async function pickVenueSlug(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  if (process.env.E2E_VENUE_SLUG) return process.env.E2E_VENUE_SLUG;
  const res = await request.get(`${baseURL}/venues`);
  if (!res.ok()) return null;
  const html = await res.text();
  const match = html.match(/href="\/venues\/([a-z0-9][a-z0-9-]+)"/);
  return match?.[1] ?? null;
}

test.describe('Venue detail — content blocks', () => {
  test('renders available content blocks without fabricating data', async ({ page, request }) => {
    const slug = await pickVenueSlug(request);
    test.skip(!slug, 'No venues available to sample');

    await page.goto(`/venues/${slug}`);
    await page.waitForSelector('h1', { timeout: 30_000 });

    // At minimum the venue name renders.
    const name = await page.locator('h1').first().textContent();
    expect(name?.trim().length).toBeGreaterThan(0);

    // Detail sections render after the initial venue query, so wait for a
    // semantic content block instead of sampling visibility immediately after
    // the h1 appears. Sparse records can legitimately have only a map.
    const contentBlock = page
      .locator('h2:has-text("About"), h2:has-text("contact"), [role="region"][aria-label="Map"]')
      .first();
    await expect(contentBlock).toBeVisible({ timeout: 10_000 });
  });

  test('website link is a real <a> with target=_blank and nofollow', async ({ page, request }) => {
    const slug = await pickVenueSlug(request);
    test.skip(!slug, 'No venues available to sample');

    await page.goto(`/venues/${slug}`);
    await page.waitForSelector('h1', { timeout: 30_000 });

    // Find the hero Website button (rendered via asChild as <a>).
    const heroLink = page.locator('a:has-text("Website")').first();
    const heroVisible = await heroLink.isVisible().catch(() => false);

    if (heroVisible) {
      const tag = await heroLink.evaluate((el) => el.tagName);
      expect(tag).toBe('A');
      const target = await heroLink.getAttribute('target');
      expect(target).toBe('_blank');
      const rel = await heroLink.getAttribute('rel');
      expect(rel).toContain('noopener');
      expect(rel).toContain('noreferrer');
      expect(rel).toContain('nofollow');
    }

    // Also check sidebar website link if present.
    const sidebarLinks = page.locator('.flex.items-center.gap-3 a[target="_blank"]');
    const count = await sidebarLinks.count();
    for (let i = 0; i < count; i++) {
      const link = sidebarLinks.nth(i);
      const href = await link.getAttribute('href');
      if (href) {
        // eslint-disable-next-line no-useless-assignment -- initial null sentinel for type inference; overwritten before any read along all reachable paths.
        let isExcludedHost = false;
        try {
          const parsed = new URL(href, baseURL);
          const host = parsed.hostname.toLowerCase();
          const isGoogleHost = host === 'google.com' || host.endsWith('.google.com');
          const isInstagramHost = host === 'instagram.com' || host.endsWith('.instagram.com');
          isExcludedHost = isGoogleHost || isInstagramHost;
        } catch {
          // Keep strict behavior for malformed/unparseable href values.
          isExcludedHost = false;
        }

        if (!isExcludedHost) {
          const rel = await link.getAttribute('rel');
          expect(rel).toContain('nofollow');
        }
      }
    }
  });
});
