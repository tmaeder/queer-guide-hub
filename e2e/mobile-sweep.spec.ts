import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { waitForAppReady } from './support/appReady';
import { dismissCookieBanner } from './support/consentBanner';

/**
 * Phone-width layout guardrail across the public routes.
 *
 * The mobile audit of 2026-11-20 (49 routes × 3 widths) found three classes
 * of phone-only defect that nothing in CI looked for, because every other
 * layout and a11y sweep runs at desktop width:
 *
 *  1. Content wider than the phone. Outside <main> it scrolls the page
 *     sideways; inside it, `overflow-x: clip` cuts it off at the edge.
 *  2. Form fields under 16px. iOS Safari zooms the page in on focus and does
 *     not zoom back out, so a 14px search box breaks the layout for every
 *     iPhone user who taps it.
 *  3. Tap targets under 24px with nothing around them (WCAG 2.5.8). Measured
 *     with axe's `target-size` rule, which implements the spacing and inline
 *     exceptions; a hand-rolled size check flags every inline link in prose.
 *
 * Signed out on purpose: the chromium project carries the admin session when
 * the E2E_ADMIN_* secrets resolve, and a visitor's page is the one that ships.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const ROUTES = [
  '/',
  '/venues',
  '/venues/le-mistral',
  '/events',
  '/events/kaohsiung-pride-2027',
  '/pride',
  '/hotels',
  '/marketplace',
  '/organizations',
  '/news',
  '/travel',
  '/cities',
  '/city/berlin',
  '/country/germany',
  '/villages/chueca',
  '/personalities',
  '/tags',
  '/tags/consent',
  '/rights',
  '/going-out',
  '/search?q=berlin',
  '/help',
  '/donate',
  '/contact',
];

/** iPhone SE and a common modern phone. */
const WIDTHS = [320, 390];

interface PhoneMetrics {
  scrollWidth: number;
  clientWidth: number;
  mainHeight: number;
  clipped: string[];
  smallFields: string[];
  fieldCount: number;
}

async function measure(page: Page): Promise<PhoneMetrics> {
  return page.evaluate(() => {
    const de = document.documentElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const describe = (el: Element) =>
      el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : '') +
      (el.getAttribute('name') ? `[name=${el.getAttribute('name')}]` : '') +
      (el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : '');
    // Fields iOS zooms into on focus: anything you type into or pick from a
    // native list. Checkboxes, radios and range sliders don't trigger it.
    const fields = Array.from(
      document.querySelectorAll(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=submit]):not([type=button]):not([type=file]),select,textarea',
      ),
    ).filter(visible);
    const small = fields.filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);
    const main = document.querySelector('main');
    // <main> is `overflow-x: clip` (routes.tsx), so a block wider than the
    // phone does not scroll the page — it is cut off at the edge, which is
    // worse and invisible to a scrollWidth check. Find what reaches past
    // main's right edge without an own scroller in between (horizontal
    // scroll strips and carousels are fine; they clip by design).
    const clipped: string[] = [];
    if (main) {
      const edge = main.getBoundingClientRect().right + 1;
      for (const el of Array.from(main.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right <= edge || !visible(el)) continue;
        let contained = false;
        for (let a = el.parentElement; a && a !== main; a = a.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) {
            contained = true;
            break;
          }
        }
        if (!contained)
          clipped.push(
            `${describe(el)}.${String(el.className).slice(0, 50)} right=${Math.round(r.right)}`,
          );
        if (clipped.length >= 5) break;
      }
    }
    return {
      clipped,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      mainHeight: main ? Math.round(main.getBoundingClientRect().height) : 0,
      smallFields: small.map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`),
      fieldCount: fields.length,
    };
  });
}

/** Routes known to carry a form field. A zero count there means the field
 *  selector stopped matching, and every route would pass the 16px check. */
const ROUTES_WITH_FIELDS = new Set(['/help', '/donate', '/contact', '/cities', '/search?q=berlin']);

test.describe('mobile sweep', () => {
  for (const width of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} @${width}px`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route);
        await waitForAppReady(page);
        await dismissCookieBanner(page);
        // Lists render after their data arrives; measure the page with its
        // content in it, not the loading shell.
        await expect
          .poll(async () => (await measure(page)).mainHeight, { timeout: 20_000 })
          .toBeGreaterThan(600);
        if (ROUTES_WITH_FIELDS.has(route)) {
          await expect
            .poll(async () => (await measure(page)).fieldCount, { timeout: 15_000 })
            .toBeGreaterThan(0);
        }

        const m = await measure(page);

        // Positive control: the page rendered. An error page or an empty
        // shell has no overflow and no fields, and would pass everything.
        expect(m.mainHeight, `${route} @${width}: <main> did not render`).toBeGreaterThan(200);

        expect(
          m.scrollWidth,
          `${route} @${width}: page is ${m.scrollWidth}px wide in a ${m.clientWidth}px viewport`,
        ).toBeLessThanOrEqual(m.clientWidth);
        expect(m.clipped, `${route} @${width}: content cut off at the right edge`).toEqual([]);

        expect(
          m.smallFields,
          `${route} @${width}: form fields under 16px make iOS zoom in on focus`,
        ).toEqual([]);
        if (ROUTES_WITH_FIELDS.has(route)) {
          expect(m.fieldCount, `${route} @${width}: no form fields found`).toBeGreaterThan(0);
        }

        const axe = await new AxeBuilder({ page }).withRules(['target-size']).analyze();
        const targets = axe.violations.flatMap((v) =>
          v.nodes.map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1] ?? ''}`),
        );
        expect(targets, `${route} @${width}: tap targets under 24px (WCAG 2.5.8)`).toEqual([]);
        // Positive control: axe ran the rule against something on this page.
        expect(axe.passes.length + axe.violations.length + axe.incomplete.length).toBeGreaterThan(
          0,
        );
      });
    }
  }
});
