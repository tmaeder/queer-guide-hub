import { test, expect, type Page } from '@playwright/test';

/**
 * Every level of a breadcrumb trail is reachable, at every width.
 *
 * Two defects, one property. On desktop the trail published crumbs with no
 * href at all — a hotel's "Spain"/"Barcelona" and the glossary's sub-category
 * were plain text while the levels either side of them linked (fixed #3409).
 * On a phone the same levels are `display: none` and the "⋯" standing in for
 * them was a `<span role="presentation" aria-hidden="true">`: not a button,
 * not focusable, not in the accessibility tree. Measured on prod at 390px, a
 * five-level trail offered exactly ONE reachable level — Home.
 *
 * The assertion is the PROPERTY, not a list of expected hrefs: for each route,
 * every crumb except the last (the page you are on) must be reachable — either
 * as a visible link, or from the overflow menu. A hardcoded href list would go
 * green the day a new level is added and silently left out, which is this bug
 * one level later.
 *
 * Runs against whatever E2E_BASE_URL points at, prod included, and is
 * READ-ONLY: it opens the overflow menu and reads it, and never follows a link.
 */

/** Routes whose trail is long enough that a phone collapses it (> 3 crumbs). */
const DEEP_ROUTES = [
  // Hotels / Country / City / Name — the trail that had two dead levels.
  '/hotels/cozy-room-in-refurbished-apartment-with-high-design-and-private-823031',
  // Glossary / Parent / Sub-category / Term — the other one.
  '/tags/transgender',
  // Venues / Country / City / Name — the trail that was already correct, so a
  // regression here means the shared builder broke rather than one page.
  '/venues/checkpoint-zuerich',
];

const NAV = 'nav[aria-label="Breadcrumb"]';

/**
 * Crumb labels in DOM order, and whether each is a link.
 *
 * The overflow control is excluded by its testid rather than by "has no text":
 * it is an `<li>` inside the same list, and at desktop width it is
 * `display: none` — where `innerText` falls back to textContent, so it read as
 * a crumb named after its glyph and failed the desktop assertion.
 */
async function crumbs(page: Page) {
  return page.locator(`${NAV} li:not([data-testid="breadcrumb-overflow"])`).evaluateAll((els) =>
    els
      .map((li) => ({
        text: (li as HTMLElement).innerText.trim(),
        href: li.querySelector('a')?.getAttribute('href') ?? null,
        // `display: none` removes a crumb from view, from the tab order AND
        // from the accessibility tree — so a hidden link is not "reachable".
        shown: getComputedStyle(li).display !== 'none',
      }))
      .filter((c) => c.text.length > 0),
  );
}

/** Wait for the page to publish its own (entity) trail, not the route fallback. */
async function waitForTrail(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect
    .poll(async () => (await crumbs(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(3);
}

test.describe('breadcrumb reachability', () => {
  for (const route of DEEP_ROUTES) {
    test(`${route} — every level above the page is a link on desktop`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await waitForTrail(page, route);

      const trail = await crumbs(page);
      const above = trail.slice(0, -1);
      // Non-vacuity: a trail that failed to load would make the loop trivial.
      expect(above.length, `${route}: trail did not load`).toBeGreaterThan(2);
      for (const c of above) {
        expect(c.href, `${route}: crumb "${c.text}" has no destination`).toBeTruthy();
        expect(c.shown, `${route}: crumb "${c.text}" is hidden on desktop`).toBe(true);
      }
      // The page itself is deliberately NOT a link — the positive control that
      // the check above is discriminating rather than passing on everything.
      expect(trail.at(-1)?.href, `${route}: the current page must not link`).toBeNull();
    });

    test(`${route} — collapsed levels stay reachable on a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await waitForTrail(page, route);

      const trail = await crumbs(page);
      const hiddenLinks = trail.slice(0, -1).filter((c) => !c.shown && c.href);
      // Non-vacuity: if nothing collapsed there is no overflow to assert on,
      // and this route no longer exercises the defect.
      expect(hiddenLinks.length, `${route}: nothing collapsed at 390px`).toBeGreaterThan(0);

      const trigger = page.locator(`${NAV} button`);
      await expect(trigger, `${route}: the ellipsis is not a control`).toHaveCount(1);
      // Asserted on the accessible name, not the glyph: the ellipsis itself is
      // decorative and aria-hidden, so the BUTTON is what has to be nameable.
      await expect(trigger).toHaveAccessibleName(/.+/);

      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();

      // Every level the row hid is offered by the menu, by name.
      for (const c of hiddenLinks) {
        await expect(
          menu.getByRole('menuitem', { name: c.text, exact: true }),
          `${route}: "${c.text}" was collapsed and is not in the overflow menu`,
        ).toBeVisible();
      }
    });
  }
});
