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
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'admin needs the chromium storageState; the mobile project has none',
  );

  const recorded: Record<string, Shape> = {};

  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      const endpoints = new Set<string>();
      const errors: string[] = [];

      await page.route('**/*', (r) => {
        const url = r.request().url();
        const method = r.request().method();
        if (BLOCKED.test(url) || (method !== 'GET' && /supabase|rest\/v1/.test(url))) {
          endpoints.add(`BLOCKED ${new URL(url).pathname}`);
          return r.abort();
        }
        if (/rest\/v1|\/rpc\//.test(url)) endpoints.add(new URL(url).pathname);
        return r.continue();
      });
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));

      await page.goto(route);
      await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
      // Settle for data, not for networkidle — pages with maps and analytics
      // never reach it, which is how four earlier guards in this repo timed out.
      await page.waitForTimeout(2500);

      // An auth redirect means the run has no admin session; that is a CI
      // configuration problem, not a route regression, and it must not read as
      // a pass.
      expect(new URL(page.url()).pathname, 'redirected to auth — no admin session').not.toMatch(
        /^\/auth/,
      );

      const h1 = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? '';
      const shape: Shape = { endpoints: [...endpoints].sort(), h1, errors };

      if (RECORDING) {
        recorded[route] = shape;
        return;
      }

      // ── Invariants ───────────────────────────────────────────────────────
      // 1. The page renders something. A frame swap that blanks a route is the
      //    loudest possible regression and the easiest to miss behind auth.
      const bodyLength = (await page.locator('main, #admin-main-content').first().innerText()).trim()
        .length;
      expect(bodyLength, `${route} rendered no content`).toBeGreaterThan(0);

      // 2. Exactly one h1. The whole point of the fixed header grammar is that
      //    a page stops stacking heading bands; two h1s means a page kept its
      //    old header while adopting the frame.
      expect(await page.locator('h1').count(), `${route} has ${await page.locator('h1').count()} h1s`).toBe(1);

      // 3. No uncaught errors.
      expect(errors, `${route} threw`).toEqual([]);

      // 4. No horizontal overflow. The frames use minmax(0,1fr) precisely so a
      //    long slug cannot widen a column into the document.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0);

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
