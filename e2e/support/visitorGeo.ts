import type { Page } from '@playwright/test';

/**
 * Make a page's content independent of WHERE THE RUNNER IS.
 *
 * `/events` (and any route that consumes `useVisitorLocation`) personalises
 * itself on mount: `useEventFilters`'s auto-init reads `visitorLocation.city`
 * from the same-origin `/api/geo` Pages Function — which reads Cloudflare's geo
 * headers — and, when it has one, applies it as a city filter before the first
 * fetch. That is correct product behaviour and is deliberately NOT changed here.
 *
 * It is fatal to a *design* or *layout* guard, because it makes the DOM under
 * test a function of the runner's IP. GitHub-hosted runners sit in Azure US
 * East, which Cloudflare places at **Dulles Town Center, Virginia** — a city
 * with zero upcoming events on prod. The page then renders its empty state:
 * "We have no upcoming events listed", `Tonight 0 · This weekend 0 ·
 * Next 7 days 0`, and **not one `[data-slot="card"]` in the document**.
 *
 * Measured against production 2026-09-10, stubbing this one endpoint and
 * changing nothing else:
 *
 *   geo = Dulles Town Center  →  0 cards, first `/events/` link 1129px down
 *   geo = unavailable         → 24 cards, first `/events/` link  616px down
 *
 * Those are exactly the two numbers the 2026-09-10 nightly failed on
 * (`[data-slot="card"]` not found ×3, and `/events: first content is 1129px
 * down (1.34 screens)`). Nothing about the cards regressed; the guards had
 * nothing to measure.
 *
 * This is also why the same specs pass on every PR: `e2e-pr.yml` runs them
 * against `localhost:4173`, where there is no Cloudflare and `/api/geo` never
 * resolves — i.e. the PR environment has always been the geo-neutral one. This
 * helper makes the production run agree with it instead of depending on which
 * datacentre the job landed in.
 *
 * It is NOT a loosened assertion. Every assertion in the callers is unchanged,
 * including `expect(card).toBeVisible()`, which is the positive control: if the
 * route stops rendering cards for a reason that is not geolocation, these
 * guards still fail.
 *
 * A 200 with no coordinates is used rather than an error status because that is
 * the hook's own documented "no region" path (`useVisitorLocation` returns null
 * when `latitude`/`longitude` are not numbers) — the state a visitor whose IP
 * Cloudflare cannot place already sees in production. Register it BEFORE
 * `page.goto`: the auto-init runs once, on mount.
 */
export async function neutralizeVisitorGeo(page: Page): Promise<void> {
  await page.route('**/api/geo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    }),
  );
}
