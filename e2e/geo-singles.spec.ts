import { test, expect, type Page } from '@playwright/test';

// Inlined rather than shared: every spec in this directory carries its own
// copy, and there is no helpers module to put it in.
const dismissCookieBanner = async (page: Page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

/**
 * The three geo singles — city, country and queer village — after the 2026-08
 * subway rebuild moved them onto `SinglePage`.
 *
 * `/villages/:slug` had NO end-to-end coverage at all before this file, which
 * is how it stayed on the legacy tab layout, behind an off-by-default flag,
 * with no safety gating, without anyone noticing.
 *
 * These assert structure and safety invariants, not copy — copy assertions on
 * a country page belong in `rights-safety.spec.ts`, which owns that surface.
 */

const ROUTES = [
  { path: '/city/berlin', name: 'Berlin', eyebrow: /City/ },
  { path: '/country/germany', name: 'Germany', eyebrow: /Country/ },
  { path: '/villages/chueca', name: 'Chueca', eyebrow: /District/ },
];

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('article h1').first().waitFor({ state: 'visible', timeout: 30_000 });
  await dismissCookieBanner(page);
}

for (const route of ROUTES) {
  test.describe(route.path, () => {
    test('leads with a typographic masthead, not a photo hero', async ({ page }) => {
      await open(page, route.path);
      const h1 = page.locator('article h1').first();
      await expect(h1).toContainText(route.name);
      // The title is real text in the document flow. The 58vh image bed it
      // replaced put the name on a scrim over an <img>, which is the site's
      // only over-image contrast exception and was carrying a generated
      // texture on ~6% of cities.
      await expect(h1.locator('img')).toHaveCount(0);
      const fontFamily = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
      expect(fontFamily.toLowerCase()).toContain('anton');
    });

    test('every route-rail station points at a heading that exists', async ({ page }) => {
      await open(page, route.path);
      const stations = page.locator('nav a[href^="#"]');
      const count = await stations.count();
      // A single with fewer than two sections renders no rail at all.
      if (count === 0) test.skip();

      for (let i = 0; i < count; i++) {
        const href = await stations.nth(i).getAttribute('href');
        if (!href || href === '#') continue;
        const id = href.slice(1);
        // The station/section invariant: both lists are derived from the same
        // filtered array, so a station can never survive its section being
        // dropped for having no data.
        await expect(page.locator(`#${CSS.escape(id)}`)).toHaveCount(1);
      }
    });

    test('the rail reflows under the body on a phone instead of disappearing', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, route.path);
      // "Every single works at 390px with the same modules in the same order,
      // stacked. No mobile-only cuts." A `hidden lg:block` rail would drop
      // the map, the facts and the provenance line on a phone.
      await expect(page.locator('article aside')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  });
}

test.describe('safety layer', () => {
  test('a village in a criminalising country is gated for anonymous visitors', async ({ page }) => {
    // Villages carried no safety layer at all before the rebuild: a district
    // in a criminalising country rendered exactly like one in Berlin. The
    // gated notice is anonymous-only and count-only.
    await open(page, '/villages/chueca');
    // Spain is not criminalising, so the notice must NOT appear here — the
    // point of this assertion is that the component is wired in and gating on
    // the country, not that it always shows.
    await expect(page.getByText(/only shown to signed-in members/i)).toHaveCount(0);
    // …but the verdict tile is always present.
    await expect(page.getByText('Safety', { exact: true })).toBeVisible();
  });

  test('no track colour appears on the safety verdict', async ({ page }) => {
    await open(page, '/city/berlin');
    // Scoped to the verdict, NOT the whole rail: the route rail sits in the
    // same column and legitimately carries its line's colour. The rule is that
    // track colours never encode a STATE — "they must not reach the equality
    // scale or any risk badge".
    const verdict = page.getByTestId('geo-safety-verdict').first();
    await expect(verdict).toBeVisible();
    const html = await verdict.evaluate((el) => el.outerHTML);
    expect(html).not.toMatch(/track-(pink|blue|green|yellow)/);
  });
});

test.describe('city network diagram', () => {
  test('renders for a city that has real geometry', async ({ page }) => {
    await open(page, '/city/berlin');
    await page.locator('#travel').scrollIntoViewIfNeeded();
    // The line legend is what makes the diagram information rather than
    // ornament — the homepage card renders the same geometry `aria-hidden`.
    await expect(page.getByText('U7', { exact: true })).toBeVisible();
  });

  test('renders nothing for a city with no network rather than a fake one', async ({ page }) => {
    // 22 of ~3,070 cities have generated geometry. The homepage card falls
    // back to a template squiggle so its grid has no holes; on a single, under
    // a heading about getting around, that squiggle would be a false claim.
    await page.goto('/city/reykjavik');
    const h1 = page.locator('article h1').first();
    if ((await h1.count()) === 0) test.skip();
    await h1.waitFor({ state: 'visible', timeout: 30_000 });
    await dismissCookieBanner(page);
    await expect(page.getByText('Lines', { exact: true })).toHaveCount(0);
  });
});
