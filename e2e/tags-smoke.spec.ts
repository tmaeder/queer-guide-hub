import { test, expect } from '@playwright/test';

// Happy path for the glossary index.
//
// Rewritten for the 2026-08 rebuild. The two tests that went with it asserted
// the old product: "overview renders topic hubs" (topic hubs are deleted) and
// "/help renders" (that belongs to the help specs, and only lived here because
// /tags used to duplicate the crisis directory).
//
// Detail tests live alongside each fix — see:
//   e2e/tags-graph.spec.ts        (P0-1)
//   e2e/tags-age-gate.spec.ts     (P0-3)
//   e2e/tags-not-found.spec.ts    (P1-4)
//   e2e/tags-url-state.spec.ts    (P1-1)

test.describe('@smoke /tags happy path', () => {
  test('browse and search are the page, not a disclosure', async ({ page }) => {
    // The regression this guards: the glossary used to sit behind a COLLAPSED
    // "Browse all topics & search" toggle, under a crisis strip, a topic-hub
    // grid and an org directory.
    await page.goto('/tags');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('searchbox', { name: /search the glossary/i })).toBeVisible();
    await expect(page.locator('a[href*="/tags/"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('search round-trip', async ({ page }) => {
    await page.goto('/tags?q=les');
    const search = page.getByRole('searchbox', { name: /search the glossary/i }).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('lesbian');
    await expect(page).toHaveURL(/q=lesbian/, { timeout: 5_000 });
  });

  test('all four display modes switch and persist', async ({ page }) => {
    await page.goto('/tags');
    for (const mode of ['List', 'Chips', 'Graph', 'Grid']) {
      await page.getByRole('tab', { name: new RegExp(mode, 'i') }).click({ timeout: 15_000 });
      await expect(
        page.getByRole('tab', { name: new RegExp(mode, 'i'), selected: true }),
      ).toBeVisible();
    }
    // Grid is the default, so it is omitted from the URL.
    await expect(page).toHaveURL(/\/tags\??$/);
  });

  test('view-mode toggles persist in URL', async ({ page }) => {
    await page.goto('/tags?view=list');
    await expect(page).toHaveURL(/view=list/);
  });

  test('category route renders directly', async ({ page }) => {
    await page.goto('/tags/c/identity-expression');
    await expect(page.getByTestId('tag-not-found')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  });

  test('the taxonomy rail links every line', async ({ page }) => {
    await page.goto('/tags');
    const rail = page.getByRole('navigation', { name: /topic lines/i }).first();
    await expect(rail).toBeVisible({ timeout: 15_000 });
    // 10 parents + "All terms".
    await expect(rail.locator('a[href*="/tags"]')).toHaveCount(11);
  });

  test('unknown slug is a dead end, never the index', async ({ page }) => {
    // Two correct answers depending on where this runs, and the assertion
    // accepts either: against Pages the middleware hard-404s an unknown detail
    // slug at the edge (tags-not-found.spec.ts asserts that status directly);
    // against a dev server there is no edge, so the SPA's own not-found branch
    // renders. What must NEVER happen — and what this actually guards — is
    // silently falling back to the glossary index.
    // The heading is "No stop here." on BOTH surfaces — `functions/_middleware.ts`
    // and `pages.notFound.heading` in the locales are the same string, and
    // tags-not-found.spec.ts already asserts it. The wording this test used to
    // look for ("doesn't exist" / "page not found" / "no such term") exists
    // nowhere in the product, so it could only ever have passed by accident.
    await page.goto('/tags/asdfgibberish-not-real');
    await expect(
      page.getByRole('heading', { name: /no stop here|page not found/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('searchbox', { name: /search the glossary/i })).toHaveCount(0);
  });

  test('the deleted topic hubs redirect rather than 404', async ({ page }) => {
    await page.goto('/tags/topic/coming-out');
    await expect(page).toHaveURL(/\/tags\/?(\?.*)?$/, { timeout: 15_000 });
  });
});
