import { test, expect } from '@playwright/test';

/**
 * Regression: Poll tab was clickable at Text tab's x-position after dialog
 * resize/scroll. Covers tabs.tsx variant="fullWidth" fix.
 */
test.describe('CreatePostDialog tabs — hitbox alignment', () => {
  for (const width of [400, 800]) {
    test(`@ ${width}px: clicking Text tab center activates Text`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/groups', { waitUntil: 'domcontentloaded' });

      const openBtn = page.getByRole('button', { name: /create post|new post|post/i }).first();
      if (!(await openBtn.count())) test.skip(true, 'No group with post permission seeded');
      await openBtn.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const textTab = dialog.getByRole('tab', { name: /^post$/i }).first();
      const pollTab = dialog.getByRole('tab', { name: /poll/i }).first();

      await pollTab.click();
      await expect(pollTab).toHaveAttribute('aria-selected', 'true');

      const box = await textTab.boundingBox();
      if (!box) throw new Error('tab boundingBox unavailable');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      await expect(textTab).toHaveAttribute('aria-selected', 'true');
      await expect(pollTab).toHaveAttribute('aria-selected', 'false');
    });
  }
});
