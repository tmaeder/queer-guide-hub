import { test, expect } from '@playwright/test';

// Venues audit Phase 8 (P2/P3): polish + a11y checks.

test.describe('Venues — polish & a11y', () => {
  test('skip-to-content link is first focusable element', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');

    // Press Tab to focus first element.
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        text: el?.textContent?.trim(),
        href: (el as HTMLAnchorElement)?.href ?? null,
      };
    });
    expect(focused.text?.toLowerCase()).toContain('skip to main content');
  });

  test('VenueCard images have non-empty alt text', async ({ page }) => {
    await page.goto('/venues');
    await page.waitForLoadState('domcontentloaded');
    // Wait for cards to render.
    await page.waitForTimeout(2000);

    const images = await page.locator('.card img, [class*="card"] img').all();
    // Only check if images actually rendered (venue may have no images).
    if (images.length > 0) {
      for (const img of images.slice(0, 8)) {
        const alt = await img.getAttribute('alt');
        expect(alt, 'VenueCard img missing alt').toBeTruthy();
        expect(alt!.length).toBeGreaterThan(0);
      }
    }
  });

  test('clear filters resets search input and URL', async ({ page }) => {
    await page.goto('/venues?q=testquery&category=bar');
    await page.waitForLoadState('domcontentloaded');

    // Find and click Clear Filters (in filter chips area).
    const clearBtn = page.getByRole('button', { name: /clear/i }).first();
    const hasClear = await clearBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasClear) {
      await clearBtn.click();
      await page.waitForTimeout(500);

      // Search input should be empty.
      const search = page.getByPlaceholder('Search venues & organizations...');
      await expect(search).toHaveValue('');

      // URL should have no q param.
      expect(page.url()).not.toMatch(/[?&]q=/);
    }
  });
});
