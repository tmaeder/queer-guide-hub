import { test, expect } from '@playwright/test';

// The /tags URL contract. Filter, search, sort, letter and display mode all
// live in query params; the CATEGORY lives in the path.
//
// Param names are deliberately unchanged from the page this replaces (`sort`,
// `dir`, `view`, `usage`) so existing shared links keep working. `hasImage`
// (the "Illustrated" filter) retired with glossary photography — TagPlate,
// 2026-08-28 — and is now a legacy key that gets stripped like `cat=`.

test.describe('@p1-1 /tags URL state', () => {
  test('hydrates state from URL on direct visit', async ({ page }) => {
    await page.goto('/tags?sort=alphabetical&dir=asc&view=list');
    await expect(page).toHaveURL(/\/tags\?.*sort=alphabetical.*dir=asc.*view=list/);
  });

  test('typing in search updates the URL', async ({ page }) => {
    await page.goto('/tags?q=les');
    const search = page.getByRole('searchbox', { name: /search the glossary/i }).first();
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill('lesbian');
    await expect(page).toHaveURL(/\/tags\?.*q=lesbian/, { timeout: 5_000 });
  });

  test('default values are not written to URL (clean links)', async ({ page }) => {
    await page.goto('/tags?sort=usage&dir=desc&view=grid&usage=all&hasImage=0&cat=all');
    await expect(page).toHaveURL(/\/tags\??$/);
  });

  test('the letter filter survives a reload', async ({ page }) => {
    await page.goto('/tags?letter=P');
    await expect(page).toHaveURL(/letter=P/);
    await page.reload();
    await expect(page).toHaveURL(/letter=P/);
    // Each letter carries a descriptive aria-label ("Terms starting with P"),
    // so its accessible name is not the bare glyph — select on the pressed
    // state within the rail instead.
    const pressed = page.locator('nav[aria-label*="letter" i] button[aria-pressed="true"]');
    await expect(pressed).toHaveText('P', { timeout: 15_000 });
  });

  test('a category path preselects its line', async ({ page }) => {
    await page.goto('/tags/c/health');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
    // aria-current marks the active station on the taxonomy rail.
    await expect(page.locator('a[aria-current="page"][href*="health"]').first()).toBeVisible();
  });

  // Taxonomy v2 was retired by 20261006150000, so `health-wellness` is no
  // longer a category — it is a redirect. Asserting the LANDING rather than the
  // requested slug is what makes this a test of the redirect chain instead of a
  // test of a slug that no longer exists.
  test('a retired v2 category path redirects and preselects the v3 line', async ({ page }) => {
    await page.goto('/tags/c/health-wellness');
    await expect(page).toHaveURL(/\/tags\/c\/health(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('a[aria-current="page"][href*="health"]').first()).toBeVisible();
  });

  test('legacy ?cat= redirects into the category path', async ({ page }) => {
    // Three spellings of this filter used to coexist. The query forms are now
    // legacy inputs that resolve to the canonical route.
    //
    // The value is a v2 display NAME, which is what the page emitted when these
    // links were minted, and v2 names left `tag_categories` with the retirement
    // — so this only resolves because `resolveCategorySlug` falls back to the
    // v2→v3 map on the slugified name. It is the regression guard for that.
    await page.goto('/tags?cat=Health%20%26%20Wellness');
    await expect(page).toHaveURL(/\/tags\/c\/health(\?|$)/, { timeout: 15_000 });
  });

  test('legacy ?profession= goes to the personalities facet', async ({ page }) => {
    // It used to force a tag-NAME search for the profession string, which
    // searches the wrong noun entirely.
    await page.goto('/tags?profession=Author');
    await expect(page).toHaveURL(/\/personalities\?.*profession=Author/, { timeout: 15_000 });
  });
});
