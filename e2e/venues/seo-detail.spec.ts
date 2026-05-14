import { test, expect } from '@playwright/test';

// Venues audit Phase 1 (P0): per-venue title/canonical/og/h1/JSON-LD,
// real HTTP 404 for unknown slugs.
//
// Picks a venue from /venues at runtime (E2E_VENUE_SLUG env var
// overrides for stable CI), so we don't hardcode a slug that may be
// renamed or merged later by the dedup migration.

const UNKNOWN_SLUG = 'this-venue-does-not-exist-12345-xyz';
const baseURL = process.env.E2E_BASE_URL || 'https://queer.guide';

async function pickVenueSlug(request: import('@playwright/test').APIRequestContext): Promise<string | null> {
  if (process.env.E2E_VENUE_SLUG) return process.env.E2E_VENUE_SLUG;
  const res = await request.get(`${baseURL}/venues`);
  if (!res.ok()) return null;
  const html = await res.text();
  const match = html.match(/href="\/venues\/([a-z0-9][a-z0-9-]+)"/);
  return match?.[1] ?? null;
}

test.describe('Venue detail — SEO metadata', () => {
  test('per-venue <title>, canonical, og tags, exactly one <h1>, LocalBusiness JSON-LD', async ({
    page,
    request,
  }) => {
    const slug = await pickVenueSlug(request);
    test.skip(!slug, 'No venues available to sample');

    await page.goto(`/venues/${slug}`);
    await page.waitForSelector('h1', { timeout: 30_000 });

    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    const venueName = (await page.locator('h1').first().textContent())?.trim() ?? '';
    expect(venueName.length).toBeGreaterThan(0);

    const title = await page.title();
    expect(title).not.toBe('Queer Guide');
    expect(title.toLowerCase()).toContain(venueName.toLowerCase());

    const canonical = await page
      .locator('link[rel="canonical"]')
      .getAttribute('href');
    expect(canonical).toContain(`/venues/${slug}`);

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute('content');
    expect(ogTitle?.toLowerCase()).toContain(venueName.toLowerCase());

    const ogUrl = await page
      .locator('meta[property="og:url"]')
      .getAttribute('content');
    expect(ogUrl).toContain(`/venues/${slug}`);

    // JSON-LD blocks: at least one is LocalBusiness OR Place with matching name.
    const lds = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(lds.length).toBeGreaterThan(0);
    const hasVenueLd = lds.some((raw) => {
      try {
        const obj = JSON.parse(raw);
        return (
          (obj['@type'] === 'LocalBusiness' || obj['@type'] === 'Place') &&
          typeof obj.name === 'string' &&
          obj.name.toLowerCase().includes(venueName.toLowerCase().split(' ')[0])
        );
      } catch {
        return false;
      }
    });
    expect(hasVenueLd, JSON.stringify(lds)).toBe(true);
  });
});

test.describe('Venue detail — 404 for unknown slugs', () => {
  test('unknown slug returns HTTP 404 from origin', async ({ request }) => {
    const res = await request.get(`/venues/${UNKNOWN_SLUG}`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test('404 page <title> reads "Venue not found …"', async ({ page }) => {
    const response = await page.goto(`/venues/${UNKNOWN_SLUG}`);
    expect(response?.status()).toBe(404);
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/venue not found/);
  });
});
