import { test, expect } from '@playwright/test';

// D3 regression guard. The venue detail inline location map used to
// flip to its "Map couldn't load" fallback within 5 s on slow networks
// because mapRef was only set inside MapLibre's `load` handler.

const baseURL = process.env.E2E_BASE_URL || 'https://queer.guide';

async function pickVenueSlug(
  request: import('@playwright/test').APIRequestContext,
): Promise<string | null> {
  if (process.env.E2E_VENUE_SLUG) return process.env.E2E_VENUE_SLUG;
  const res = await request.get(`${baseURL}/venues`);
  if (!res.ok()) return null;
  const html = await res.text();
  const match = html.match(/href="\/venues\/([a-z0-9][a-z0-9-]+)"/);
  return match?.[1] ?? null;
}

test.describe('Venue detail — inline map (D3)', () => {
  test('inline location map does not flash the "Map couldn\'t load" fallback', async ({
    page,
    request,
  }) => {
    const slug = await pickVenueSlug(request);
    test.skip(!slug, 'No venues available to sample');

    await page.goto(`/venues/${slug}`);
    await page.waitForSelector('h1', { timeout: 30_000 });

    // Give the inline map up to 12 s to either render tiles or fail.
    // The old 5 s blanket timeout would already have fired by now.
    await page.waitForTimeout(6_000);

    const fallback = page.locator('text=/Map couldn[’\']t load/i');
    expect(
      await fallback.isVisible().catch(() => false),
      'Inline location map prematurely showed the OSM fallback',
    ).toBe(false);
  });
});
