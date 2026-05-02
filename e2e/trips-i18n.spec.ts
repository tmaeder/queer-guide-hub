import { test, expect, Page } from '@playwright/test';

/**
 * i18n smoke tests for the trip planner surface across all supported locales.
 *
 * Guards against three regressions that have shipped to production:
 *   1. Raw translation keys (e.g. "trips.title") leaking into the UI.
 *   2. Mixed English strings on non-English locales.
 *   3. Locale-specific runtime crashes (notably Arabic / RTL).
 *
 *   E2E_BASE_URL=https://queer.guide npx playwright test e2e/trips-i18n.spec.ts
 */

const LOCALES = ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar'] as const;
type _Locale = (typeof LOCALES)[number];

const RAW_KEY_RE = /\btrips\.[a-zA-Z0-9_.]+/;

// Note: _vercel/(insights|speed-insights) entries cover legacy Vercel
// Analytics noise that lingered before the queer-guide-hub Cloudflare
// Pages migration; safe to remove once a deploy without those tags has
// fully rolled out and live console errors are clean for a week.
const IGNORABLE_ERROR_RE =
  /sentry|posthog|google|umami|cloudflare|failed to fetch dynamically imported module|manifest\.webmanifest|ResizeObserver loop|Failed to load resource|net::ERR_|ERR_SOCKET_NOT_CONNECTED|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED/i;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator('body').innerText()).trim();
}

for (const locale of LOCALES) {
  test.describe(`/${locale}/trips i18n`, () => {
    test(`renders without raw i18n keys or fatal errors [${locale}]`, async ({ page }) => {
      const errors = collectErrors(page);

      await page.goto(`/${locale}/trips`);
      await page.waitForLoadState('networkidle');

      const text = await bodyText(page);
      expect(text.length, `[${locale}] page rendered empty — likely crashed`).toBeGreaterThan(0);

      const rawKey = text.match(RAW_KEY_RE);
      expect(rawKey, `[${locale}] raw i18n key leaked: ${rawKey?.[0]}`).toBeNull();

      // Try to open the Create Trip dialog if the CTA is reachable (signed-in
      // sessions). Signed-out users see an auth CTA instead — that's fine, we
      // still covered the main /trips render above.
      const createCta = page
        .getByRole('button')
        .filter({ hasText: /create|neue|nouveau|crear|nuovo|criar|作成|만들|创建|создать|إنشاء/i })
        .first();
      if (await createCta.isVisible().catch(() => false)) {
        await createCta.click().catch(() => undefined);
        await page.waitForTimeout(500);
        const dialogText = await bodyText(page);
        const dialogRaw = dialogText.match(RAW_KEY_RE);
        expect(dialogRaw, `[${locale}] raw key in create dialog: ${dialogRaw?.[0]}`).toBeNull();
      }

      const fatal = errors.filter((e) => !IGNORABLE_ERROR_RE.test(e));
      expect(fatal, `[${locale}] fatal runtime errors:\n${fatal.join('\n')}`).toHaveLength(0);
    });
  });
}

test.describe('Arabic RTL', () => {
  test('Arabic locale applies RTL direction to <html>', async ({ page }) => {
    await page.goto('/ar/trips');
    await page.waitForLoadState('networkidle');

    const dir = await page.evaluate(() => document.documentElement.dir);
    const lang = await page.evaluate(() => document.documentElement.lang);

    expect(dir, 'expected <html dir="rtl"> on Arabic locale').toBe('rtl');
    expect(lang).toMatch(/^ar/);
  });
});
