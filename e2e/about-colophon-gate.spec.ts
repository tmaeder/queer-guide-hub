import { test, expect, type Page } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The /about colophon is members-only, and as of 2026-09-04 it is the ONLY
 * place on the site the licence-required credits appear — the footer row that
 * carried them for signed-out readers was removed by an explicit product
 * decision. So this spec is what keeps the colophon itself from silently
 * disappearing; there is no second home for the credits to fall back to.
 *
 * Runs against the DEPLOYED site (config baseURL is https://queer.guide).
 *
 * The signed-in half needs a session. It is SKIPPED rather than failed when no
 * session file is present, because CI has no credentials and a hard failure
 * there would be noise — but the skip is loud, and the signed-out half plus
 * `e2e/removed-ui-elements.spec.ts` still run. Seed it with:
 *
 *   E2E_SESSION_FILE=/path/to/session.json npx playwright test about-colophon-gate
 *
 * where the file is a Supabase session object (the body of a
 * `/auth/v1/token?grant_type=password` response, with `expires_at` stamped).
 */

const BOOT = 30_000;

/** Sources whose licence compels the credit — mirrors src/lib/attribution.ts. */
const REQUIRED = [
  { name: 'OpenStreetMap', licence: 'ODbL' },
  { name: 'Wikidata', licence: 'CC BY-SA' },
  { name: 'GeoNames', licence: 'CC BY 4.0' },
  { name: 'World Bank Open Data', licence: 'CC BY 4.0' },
  { name: 'Countries States Cities Database', licence: 'ODbL 1.0' },
  { name: 'mledoze/countries', licence: 'ODbL 1.0' },
];

const SESSION_FILE = process.env.E2E_SESSION_FILE;
const STORAGE_KEY = 'sb-xqeacpakadqfxjxjcewc-auth-token';

async function seedSession(page: Page) {
  const raw = readFileSync(SESSION_FILE!, 'utf8');
  // addInitScript so the session exists BEFORE the app's first render — seeding
  // after load would race the auth bootstrap and produce a flaky signed-out read.
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    STORAGE_KEY,
    raw,
  ] as const);
}

/**
 * The footer no longer carries any credit, in either auth state. Asserted
 * rather than dropped so the removal stays a decision on the record — see
 * `e2e/removed-ui-elements.spec.ts` for the full history of the inversions.
 */
async function expectNoFooterAttribution(page: Page) {
  const footer = page.locator('footer');
  await expect(footer).toBeVisible({ timeout: BOOT });
  for (const source of REQUIRED) {
    await expect(footer.getByRole('link', { name: source.name })).toHaveCount(0);
  }
  await expect(footer).not.toContainText('ODbL');
  await expect(footer).not.toContainText('CC BY');
}

test.describe('/about colophon gate', () => {
  test('signed out: colophon hidden, and no credit in the footer either', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    // Positive control. Without it, "#sources absent" also passes on a page
    // that 404'd, is still booting, or rendered an error boundary.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: BOOT });
    await expect(page.locator('#sources')).toHaveCount(0);
    await expectNoFooterAttribution(page);
  });

  test('signed in: colophon renders in full', async ({ page }) => {
    test.skip(!SESSION_FILE || !existsSync(SESSION_FILE), 'no E2E_SESSION_FILE — see file header');
    await seedSession(page);
    await page.goto('/about', { waitUntil: 'domcontentloaded' });

    const colophon = page.locator('#sources');
    await expect(colophon).toBeVisible({ timeout: BOOT });

    // Tier 1: every licence-required credit, with its licence beside it.
    for (const source of REQUIRED) {
      await expect(colophon.getByRole('link', { name: source.name })).toBeVisible();
      await expect(colophon).toContainText(source.licence);
    }
    // Tier 1 also names sources it owes nothing to. They are the signal that
    // the colophon is the FULL story and not just the footer row repeated.
    for (const courtesy of ['ILGA World Database', 'CIA World Factbook', 'OurAirports']) {
      await expect(colophon.getByRole('link', { name: courtesy })).toBeVisible();
    }
    // Tier 2: the grouped lists, which exist nowhere else on the site.
    for (const group of ['Community guides & listings', 'Health & harm reduction', 'News']) {
      await expect(colophon.getByText(group, { exact: true })).toBeVisible();
    }

    // Every credit reaches, and none is a tabnabbing hole. A property over
    // whatever is rendered, so a source added later is covered for free.
    //
    // Read in ONE evaluation, not a locator round-trip per attribute. The
    // per-link form blew the 30s test timeout at about link 37 of 40+, and it
    // is also racy: `count()` and `nth(i)` are separate calls, so a re-render
    // between them shifts the indices out from under the loop.
    const credits = await colophon.locator('a').evaluateAll((nodes) =>
      nodes.map((a) => ({
        href: (a as HTMLAnchorElement).href,
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel') ?? '',
      })),
    );
    expect(credits.length).toBeGreaterThan(20);
    const unsafe = credits.filter(
      (c) => !/^https:\/\//.test(c.href) || c.target !== '_blank' || !c.rel.includes('noopener'),
    );
    expect(unsafe, `unsafe credit links: ${JSON.stringify(unsafe)}`).toEqual([]);

    // The footer carries no credit for signed-in readers either — the
    // colophon above is the whole of it now.
    await expectNoFooterAttribution(page);
  });
});
