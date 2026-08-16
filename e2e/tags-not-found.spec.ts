import { test, expect } from '@playwright/test';

// P1-4 — unknown /tags/<slug> must render an explicit 404 instead
// of silently bouncing back to the overview.
//
// /tags/:slug is a detail route, so the Cloudflare Pages middleware hard-404s
// unknown slugs at the edge (functions/_middleware.ts notFoundHtml) — a real
// 404 status + a static "No stop here." page, consistent with every other
// detail route. The SPA `tag-not-found` component only renders on a
// client-side navigation to a broken tag link, not on a hard load.

test.describe('@p1-4 /tags/[slug] 404', () => {
  test('unknown slug returns a hard 404, not the overview', async ({ page }) => {
    const res = await page.goto('/tags/asdfgibberish-totally-not-a-real-tag-12345');
    expect(res?.status(), 'unknown tag slug must be a real 404').toBe(404);
    // Edge copy ("No stop here.") or, on a preview build where the middleware
    // does not run, whatever the SPA renders for an unknown tag.
    await expect(
      page.getByRole('heading', { name: /no stop here|doesn'?t exist|not found/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Must be noindexed, and must NOT be the tag overview.
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    expect(robots ?? '').toMatch(/noindex/);
  });

  // A merged tag is NOT an unknown tag — the concept still exists, one hop on.
  // `/tags/rack` used to answer 200 with `<title>Rack | Queer Guide</title>` over
  // the SPA's "No such term" empty state: a soft 404 that got the page indexed
  // and left a human at a dead end. It must 301 to the canonical instead.
  //
  // Asserted on the FINAL url rather than the redirect status so this also
  // passes on a preview build where the middleware doesn't run and the SPA does
  // the hop client-side. Both surfaces resolve through the same
  // tag_slug_redirects rows; this pins the outcome they must agree on.
  const MERGED = [
    { from: 'rack', to: 'risk-aware-consensual-kink' },
    { from: 'crystal-meth', to: 'methamphetamine' },
    { from: 'monkeypox', to: 'mpox' },
  ];

  for (const { from, to } of MERGED) {
    test(`merged /tags/${from} lands on /tags/${to}`, async ({ page }) => {
      const res = await page.goto(`/tags/${from}`);
      expect(res?.status(), `/tags/${from} must not be a 404`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`/tags/${to}(?:[?#]|$)`), { timeout: 10_000 });
      // The canonical page really rendered — not the empty state wearing a title.
      await expect(
        page.getByRole('heading', { name: /no stop here|doesn'?t exist|not found|no such term/i }),
      ).toHaveCount(0);
    });
  }

  // A tag merged into a target that was ITSELF later deprecated has no live
  // concept to reach, so 404 is the correct answer — a 301 there would just be a
  // redirect into a 404. Measured on prod: 57 of 195 redirect rows are this shape.
  test('a tag whose canonical was since deprecated 404s rather than redirecting', async ({
    page,
  }) => {
    const res = await page.goto('/tags/alex-j-rgen');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/tags\/alex-j-rgen/);
  });
});
