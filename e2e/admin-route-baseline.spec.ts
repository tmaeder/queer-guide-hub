import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ADMIN_ARCHETYPES } from '../src/config/adminArchetypes';

/**
 * Behavioural baseline for the admin archetype migration.
 *
 * The archetype work restyles ~40 auth-gated routes. Screenshots cannot prove
 * those routes still WORK — and this repo has already measured that its visual
 * baselines are a weak gate (a 314-file re-skin moved 1 of 26). What actually
 * regresses in a migration like this is the data layer: a filter silently
 * dropped while the page still renders beautifully.
 *
 * So this records, per route, the shape of what the page ASKS FOR — the
 * distinct `rest/v1` endpoints it hits, its `h1`, and any page errors — and
 * compares later runs against it. A frame swap must not change any of that.
 *
 * RECORD:  ADMIN_BASELINE=record npx playwright test e2e/admin-route-baseline.spec.ts
 * VERIFY:  npx playwright test e2e/admin-route-baseline.spec.ts
 *
 * Two things make this safe to run:
 *   - Every WRITE is aborted at the network layer (see BLOCKED). The client
 *     hardcodes the PRODUCTION Supabase URL even under `vite preview`, so a
 *     spec that walks all 40 admin routes would otherwise be firing real
 *     mutations at prod — `branding_*`, `admin_automation_set_enabled`,
 *     pipeline autosave. This is not hypothetical: e2e/admin-design.spec.ts
 *     already documents the same hazard.
 *   - Endpoints are normalised to PATH ONLY, with query strings dropped.
 *     Baselines that pin full query strings rot on the first pagination or
 *     ordering tweak and then get deleted for being noisy.
 */

const BASELINE = resolve(__dirname, '__baselines__/admin-routes.json');
const RECORDING = process.env.ADMIN_BASELINE === 'record';

/** Routes worth walking: registered, real, and not a redirect or catch-all. */
const ROUTES = ADMIN_ARCHETYPES.filter(
  (e) => !e.path.includes(':') && e.path !== '*' && e.path !== 'review',
).map((e) => (e.path === '(index)' ? '/admin' : `/admin/${e.path}`));

/** Anything that could mutate production. Aborted, never sent. */
const BLOCKED = /\/(rpc)\/(branding_|admin_automation_set_enabled|.*_upsert|.*_delete)/i;

type Shape = { endpoints: string[]; h1: string; errors: number };

function loadBaseline(): Record<string, Shape> {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Shape>;
}

test.describe('admin route baseline', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'admin routes need the chromium storageState; the mobile project has none',
  );

  const recorded: Record<string, Shape> = {};

  for (const route of ROUTES) {
    test(`shape is stable: ${route}`, async ({ page }) => {
      const endpoints = new Set<string>();
      let errors = 0;

      await page.route('**/*', (r) => {
        const url = r.request().url();
        const method = r.request().method();
        if (BLOCKED.test(url) || (method !== 'GET' && /supabase|rest\/v1/.test(url))) {
          // A write attempt is itself signal — record that it was reached,
          // then refuse it.
          endpoints.add(`BLOCKED ${new URL(url).pathname}`);
          return r.abort();
        }
        if (/rest\/v1|\/rpc\//.test(url)) endpoints.add(new URL(url).pathname);
        return r.continue();
      });
      page.on('pageerror', () => {
        errors += 1;
      });

      await page.goto(route);
      await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
      // Settle for data, not for networkidle — pages with maps and analytics
      // never reach it, which is why four earlier guards in this repo timed out.
      await page.waitForTimeout(2500);

      const h1 = (await page.locator('h1').first().textContent().catch(() => ''))?.trim() ?? '';
      const shape: Shape = { endpoints: [...endpoints].sort(), h1, errors };

      if (RECORDING) {
        recorded[route] = shape;
        test.info().annotations.push({ type: 'recorded', description: route });
        return;
      }

      const base = loadBaseline()[route];
      test.skip(!base, `no baseline for ${route} — run with ADMIN_BASELINE=record`);

      // The load-bearing assertion. A restyle may reorder the DOM, rename a
      // heading or change a class; it may NOT change which data the route asks
      // for. That is the regression a screenshot cannot see.
      expect(shape.endpoints, `${route} changed which endpoints it queries`).toEqual(
        base!.endpoints,
      );
      expect(shape.errors, `${route} threw ${shape.errors} page error(s)`).toBeLessThanOrEqual(
        base!.errors,
      );
    });
  }

  test.afterAll(() => {
    if (!RECORDING || !Object.keys(recorded).length) return;
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(recorded, null, 2)}\n`);
  });
});
