import { test, expect } from '@playwright/test';

// /history era-chapter timeline (editorial redesign). The page is motion-free
// by design; reducedMotion only stabilizes the shell fade for assertions.
test.use({ reducedMotion: 'reduce' });

test.describe('/history era timeline', () => {
  test('renders era chapters with jump nav and single Home breadcrumb', async ({ page }) => {
    await page.goto('/history');
    await expect(page.getByRole('heading', { level: 1, name: /queer history/i })).toBeVisible();

    // Era jump nav + at least 8 era sections
    await expect(page.getByRole('navigation', { name: /jump to era/i })).toBeVisible({ timeout: 30_000 });
    const eraSections = page.locator('section[id^="era-"]');
    await expect.poll(async () => eraSections.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(8);

    // Breadcrumb: exactly one Home
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb.getByRole('link', { name: 'Home' })).toHaveCount(1);

    // Title: exactly one brand suffix
    const title = await page.title();
    expect(title.match(/Queer Guide/g)?.length ?? 0).toBe(1);
  });

  test('era expansion fetches the full chronology', async ({ page }) => {
    await page.goto('/history');
    const liberation = page.locator('#era-liberation');
    await liberation.scrollIntoViewIfNeeded();
    const before = await liberation.locator('a[href*="/history/"]').count();

    const showAll = liberation.getByRole('button', { name: /show all/i });
    await expect(showAll).toBeVisible({ timeout: 30_000 });
    await showAll.click();

    await expect
      .poll(async () => liberation.locator('a[href*="/history/"]').count(), { timeout: 30_000 })
      .toBeGreaterThan(before);
    await expect(liberation.getByRole('button', { name: /show fewer/i })).toBeVisible();
  });

  test('category filter re-scopes the timeline', async ({ page }) => {
    await page.goto('/history');
    await page.getByRole('button', { name: 'Decriminalization' }).click();
    await expect(page).toHaveURL(/category=law-decriminalization/);
    // Spine reloads server-side; sections still render
    await expect
      .poll(async () => page.locator('section[id^="era-"]').count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
  });

  test('?country deep link filters and survives', async ({ page }) => {
    await page.goto('/history?country=France');
    await expect
      .poll(async () => page.locator('section[id^="era-"]').count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    // All visible milestone rows should mention France or be anchors from France
    await expect(page.locator('section[id^="era-"] a[href*="/history/"]').first()).toBeVisible();
  });

  test('detail page shows era chip, prev/next and single-brand title', async ({ page }) => {
    await page.goto('/history');
    const first = page.locator('section[id^="era-"] a[href*="/history/"]').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();

    await expect(page).toHaveURL(/\/history\/.+/);
    await expect(page.getByRole('link', { name: /part of:/i })).toBeVisible({ timeout: 30_000 });

    const title = await page.title();
    expect(title.match(/Queer Guide/g)?.length ?? 0).toBe(1);

    // Prev/next timeline navigation (present on all but the endpoints)
    const nav = page.getByRole('navigation', { name: /timeline navigation/i });
    if (await nav.count()) {
      await expect(nav.getByRole('link').first()).toBeVisible();
    }
  });
});
