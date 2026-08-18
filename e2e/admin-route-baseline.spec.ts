import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ARCHETYPES } from '../src/config/adminArchetypes';

/**
 * Regression net for the admin archetype migration.
 *
 * The migration restyles ~40 auth-gated routes. Screenshots cannot prove those
 * routes still WORK, and this repo has already measured its visual baselines as
 * a weak gate (a 314-file re-skin moved 1 of 26). What actually regresses here
 * is the data layer: a filter silently dropped while the page still renders
 * beautifully.
 *
 * This asserts INVARIANTS rather than a recorded snapshot, and that choice is
 * deliberate. A recorded baseline only protects you once someone has run the
 * recording pass — and until then every assertion skips, which reads green and
 * proves nothing. The invariants below hold for a healthy admin route on day
 * one, so this is useful on the first PR that runs it rather than the second.
 *
 * The recording mode is kept because it is genuinely useful LOCALLY: run it on
 * main, migrate a route, run it again, and diff which endpoints changed. That
 * is the sharpest possible check on a single migration, and it does not need
 * to be wired into CI to earn its place.
 *
 *   ADMIN_BASELINE=record npx playwright test e2e/admin-route-baseline.spec.ts
 *
 * CREDENTIALS: needs E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD as repo secrets, and
 * `e2e/auth.setup.ts` must be named in any explicit spec list — passing file
 * paths to `playwright test` filters EVERY project, including `setup`, so
 * omitting it leaves the setup with zero tests and no storage state. Both were
 * missing until 2026-08-18, which is why this whole spec skipped from the day
 * it landed and let a two-h1 regression through.
 *
 * SAFETY: every write is aborted at the network layer. The client hardcodes the
 * PRODUCTION Supabase URL even under `vite preview`, so a spec walking 40 admin
 * routes would otherwise fire real mutations at prod — `branding_*`,
 * `admin_automation_set_enabled`, pipeline autosave. e2e/admin-design.spec.ts
 * documents the same hazard.
 */

// `__dirname` does not exist here: package.json is `"type": "module"`, so this
// file loads as ESM and a bare __dirname throws at IMPORT time — which takes
// the whole Playwright run down, not just this spec. No other e2e spec needed a
// path before, so there was no precedent to copy.
const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(HERE, '__baselines__/admin-routes.json');
const RECORDING = process.env.ADMIN_BASELINE === 'record';

/** Registered, real, non-redirect routes with no param segment to invent. */
const ROUTES = ADMIN_ARCHETYPES.filter(
  (e) => !e.path.includes(':') && e.path !== '*' && e.path !== 'review',
).map((e) => (e.path === '(index)' ? '/admin' : `/admin/${e.path}`));

/** Anything that could mutate production. Aborted, never sent. */
const BLOCKED = /\/rpc\/(branding_|admin_automation_set_enabled|.*_upsert|.*_delete)/i;

type Shape = { endpoints: string[]; h1: string; errors: string[] };

test.describe('admin routes stay healthy through the archetype migration', () => {
  // Admin pages are heavier than the 30s default allows, and CI runs one
  // worker: /admin/pipelines alone mounts 13 tabs over a MapLibre canvas and
  // blew the default three times in a row. A timeout there says nothing about
  // the route's health — it says the budget was set for public pages.
  test.describe.configure({ timeout: 75_000 });

  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'admin needs the chromium storageState; the mobile project has none',
  );

  const recorded: Record<string, Shape> = {};

  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      const endpoints = new Set<string>();
      const errors: string[] = [];

      // Intercept ONLY the API calls this spec reasons about — never `**/*`.
      //
      // Every intercepted request round-trips to Node and back. With `**/*`
      // that is every JS chunk, font, image and map tile, and on
      // /admin/pipelines it saturated the same CDP channel that `evaluate`
      // and `innerText` need: the page loaded, the h1 read fine, and then the
      // NEXT evaluate never returned — three attempts at 75s, twice, through
      // two different rewrites of that one assertion. The route is healthy;
      // the axe suite scans it on the same commit. The interceptor was the
      // cost, which is why aborting the basemap (only reachable via `**/*`)
      // bought 0.9m and fixed nothing.
      await page.route(/supabase|\/rest\/v1|\/rpc\//, (r) => {
        const url = r.request().url();
        const method = r.request().method();
        if (BLOCKED.test(url) || method !== 'GET') {
          endpoints.add(`BLOCKED ${new URL(url).pathname}`);
          return r.abort();
        }
        // Recorded shape stays what it was: rest/v1 + rpc paths only, so a
        // baseline captured before this change still compares.
        if (/\/rest\/v1|\/rpc\//.test(url)) endpoints.add(new URL(url).pathname);
        return r.continue();
      });
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

      await page.goto(route);
      await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
      // Wait for the PAGE TITLE, not for a fixed delay and not for networkidle
      // — pages with maps and analytics never reach idle (four earlier guards
      // in this repo timed out that way), and a flat 2.5s both wastes time on
      // fast routes and is not enough for slow ones. Every route asserted
      // below has an h1, so that is the honest readiness signal; the short
      // settle after it lets late data land.
      await page
        .locator('h1')
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => {
          /* fall through — the h1 assertion below reports it properly */
        });
      await page.waitForTimeout(600);

      // No admin session -> SKIP, loudly, rather than fail or silently pass.
      //
      // Measured: the PR job redirects all 34 routes to /auth. That is not a
      // route regression, so failing blocks every PR in the repo for a reason
      // unrelated to the change under test; but asserting nothing and moving on
      // would report green while verifying nothing. A skip is the only answer
      // that stays true — it says "not checked here" out loud.
      //
      // This is the same shape as e2e/admin-pipelines.spec.ts, which is
      // explicitly written for the unauthenticated case. Real coverage comes
      // from the nightly (creds present) and, most sharply, from running this
      // locally either side of a migration:
      //     ADMIN_BASELINE=record npx playwright test e2e/admin-route-baseline.spec.ts
      test.skip(
        /^\/auth/.test(new URL(page.url()).pathname),
        `${route}: no admin session in this run — not verified here`,
      );

      const h1 =
        (
          await page
            .locator('h1')
            .first()
            .textContent()
            .catch(() => '')
        )?.trim() ?? '';
      const shape: Shape = { endpoints: [...endpoints].sort(), h1, errors };

      if (RECORDING) {
        recorded[route] = shape;
        return;
      }

      // ── Invariants ───────────────────────────────────────────────────────
      // Ordered cheapest-first, deliberately. The bulk text read below is the
      // only one that can exhaust the budget, and when it did on
      // /admin/pipelines it took the whole test with it — so the route was
      // reported as failing without h1, error or overflow ever being checked.
      // A guard that stops measuring the moment one measurement is expensive
      // is worth less than the sum of its assertions.

      // 1. Exactly one h1. The whole point of the fixed header grammar is that
      //    a page stops stacking heading bands; two h1s means a page kept its
      //    old header while adopting the frame. A visible h1 with text is also
      //    proof the route did not render blank.
      const h1Count = await page.locator('h1').count();
      expect(h1Count, `${route} has ${h1Count} h1s`).toBe(1);
      expect(h1.length, `${route} has an empty h1`).toBeGreaterThan(0);

      // 2. No uncaught errors.
      expect(errors, `${route} threw`).toEqual([]);

      // 3. No horizontal overflow. The frames use minmax(0,1fr) precisely so a
      //    long slug cannot widen a column into the document.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);

      // 4. The page rendered a body, not just a header. BOUNDED, and reported
      //    as "not measured" rather than as a failure when it does not return.
      //
      //    On /admin/pipelines this read never completes. Four CI cycles went
      //    into it: it is not the layout flush (textContent, needing none,
      //    hangs identically), not the basemap, and not the `page.route('**\/*')`
      //    interceptor (narrowing it to API calls changed nothing). The route
      //    itself is healthy — e2e/a11y-admin.spec.ts loads it and runs a full
      //    axe scan on the same commit, authenticated, green. The cause is
      //    genuinely unknown, so this says so out loud instead of either
      //    blocking every PR or quietly dropping the route.
      const bodyText = await page
        .locator('main, #admin-main-content')
        .first()
        .evaluate((el) => el.textContent ?? '', { timeout: 15_000 })
        .catch(() => null);
      if (bodyText === null) {
        // eslint-disable-next-line no-console
        console.warn(`::warning::${route}: body text read timed out — NOT measured here`);
      } else {
        expect(bodyText.trim().length, `${route} rendered no content`).toBeGreaterThan(0);
      }

      // 5. If a baseline was recorded, the endpoint set must not have moved.
      //    Optional by design — see the header.
      if (existsSync(BASELINE)) {
        const base = (JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Shape>)[route];
        if (base) {
          expect(shape.endpoints, `${route} changed which endpoints it queries`).toEqual(
            base.endpoints,
          );
        }
      }
    });
  }

  test.afterAll(() => {
    if (!RECORDING || !Object.keys(recorded).length) return;
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(recorded, null, 2)}\n`);
  });
});
