import { test, expect, type Page } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

/**
 * Country map silhouettes (#3804) — asserted against the configured baseURL,
 * which defaults to PRODUCTION.
 *
 * THE FAILURE THIS GUARDS IS THE MAP GOING MISSING WITHOUT ANYTHING BREAKING.
 * `CountryMap` renders `null` for a country with no committed geometry, and its
 * loading state is a neutral grey block — so a broken fetch, a wiped
 * `public/maps/` directory, or a lost `_routes.json` exclusion all degrade to
 * "a slightly shorter page" rather than to an error anyone would notice. None
 * of it is visible to a unit test: the JSON lives in `public/`, is served by
 * Cloudflare Pages, and is fetched at runtime.
 *
 * Three things are only checkable against a deployed origin:
 *
 * 1. THE ASSET IS JSON, NOT THE SPA SHELL. Pages runs Functions ahead of static
 *    assets, and with no `404.html` its built-in fallback answers ANY unmatched
 *    path with `index.html` at status 200. So dropping `/maps/*` from
 *    `_routes.json` does not 404 — it serves HTML with `res.ok === true`, the
 *    component's `res.json()` throws, and every map silently disappears. Status
 *    alone cannot catch that; the content type is the discriminator.
 *
 * 2. THE THEME TOGGLE REPAINTS THE SVG. This is the whole reason the map is
 *    inline `<svg>` and not `<img src>`: `ThemeProvider` switches the `dark`
 *    CLASS on `<html>`, which a separate image document cannot see. This drives
 *    the real footer control rather than setting the class by hand, so it
 *    covers the provider and the tokens together.
 *
 * 3. THE CAPITAL IS THE RIGHT ONE. The generator picks the capital by Wikidata's
 *    `adm0cap` flag; matching `/capital/i` on `featurecla` also hits "Admin-1
 *    capital" and labelled Switzerland GENEVA. A wrong capital is not a crash
 *    and no structural assertion would see it.
 *
 * Switzerland is the subject because it exercises the most at once: two land
 * polygons, border lakes that survive the land-clip, and a capital that is NOT
 * the largest city — which is exactly the bug above.
 */
test.use(REDUCED_MOTION);

const DESKTOP = { width: 1280, height: 900 };
const SUBJECT = { slug: 'switzerland', iso: 'ch', name: 'Switzerland', capital: 'Bern' };

async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  if (!(await banner.isVisible().catch(() => false))) return;
  await banner
    .getByRole('button', { name: /necessary only|accept all/i })
    .first()
    .click();
  await expect(banner)
    .toBeHidden()
    .catch(() => {});
}

async function gotoCountry(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto(`/country/${SUBJECT.slug}`, { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);
  const map = page.getByTestId('country-map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  return map;
}

/** Computed fill of the land, which is the token that has to follow the theme. */
function landFill(page: Page) {
  return page.evaluate(() => {
    const land = document.querySelector('[data-testid="country-map"] path.fill-background');
    return land ? getComputedStyle(land).fill : null;
  });
}

test.describe('country map', () => {
  test('serves the geometry as JSON, not the SPA shell', async ({ request }) => {
    const res = await request.get(`/maps/country/${SUBJECT.iso}.json`);
    expect(res.status()).toBe(200);

    // The discriminator. A lost `_routes.json` exclusion returns 200 text/html
    // here, which `res.ok` and a status check both wave through.
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(body.iso).toBe(SUBJECT.iso.toUpperCase());
    expect(Array.isArray(body.land)).toBe(true);
    expect(body.land.length).toBeGreaterThan(0);
    // Land is an ARRAY of paths because concatenating polygons into one
    // evenodd path makes overlapping landmasses cancel and punch holes.
    for (const d of body.land) expect(d.startsWith('M')).toBe(true);
    expect(body.dots.length).toBeGreaterThan(0);
  });

  test('draws the silhouette with its cities', async ({ page }) => {
    const map = await gotoCountry(page);
    await expect(map).toHaveAttribute('data-country', SUBJECT.iso.toUpperCase());

    const svg = map.getByRole('img', { name: SUBJECT.name });
    await expect(svg).toBeVisible();

    // Non-empty is the point: an empty frame renders identically to a broken
    // fetch, so the counts are what separate "drew a map" from "drew a box".
    expect(await map.locator('path.fill-background').count()).toBeGreaterThan(0);
    expect(await map.locator('circle').count()).toBeGreaterThan(0);

    // The loading placeholder must be gone — a stuck skeleton is the shape a
    // failed fetch takes, and it is grey and silent.
    await expect(map.locator('.animate-pulse')).toHaveCount(0);
  });

  test('labels the national capital, not the largest city', async ({ page }) => {
    const map = await gotoCountry(page);
    await expect(map.getByText(SUBJECT.capital, { exact: true })).toBeVisible();
    // Switzerland's largest city, and what the old featurecla match produced.
    await expect(map.getByText('Geneva', { exact: true })).toHaveCount(0);
    await expect(map.getByText('Zurich', { exact: true })).toHaveCount(0);
  });

  test('repaints when the reader flips the theme', async ({ page }) => {
    const map = await gotoCountry(page);

    // Drive the real control. The toggle lives in the footer.
    const openThemeMenu = async () => {
      const trigger = page.getByRole('button', { name: /toggle theme/i }).first();
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();
    };

    await openThemeMenu();
    await page.getByRole('menuitem', { name: /^light$/i }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    const light = await landFill(page);

    await openThemeMenu();
    await page.getByRole('menuitem', { name: /^dark$/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const dark = await landFill(page);

    expect(light).toBeTruthy();
    expect(dark).toBeTruthy();
    // The assertion that justifies inline <svg>. As an <img> these would be
    // equal, because a separate document cannot see the `dark` class.
    expect(light).not.toBe(dark);

    // And in the right direction — paper land in light, ink land in dark.
    const luminance = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luminance(light as string)).toBeGreaterThan(luminance(dark as string));

    await expect(map).toBeVisible();
  });
});
