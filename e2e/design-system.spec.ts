import { test, expect } from '@playwright/test';

/**
 * Design system enforcement tests.
 * Verify core UI components render flat (0 radius, no shadow)
 * and monochrome (no chromatic colors in public pages).
 */

const dismissCookieBanner = async (page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

test.describe('design system: flatness', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
  });

  test('cards have border-radius 0', async ({ page }) => {
    const cards = page.locator('.bg-card').first();
    await expect(cards).toBeVisible();
    const radius = await cards.evaluate(
      (el) => getComputedStyle(el).borderRadius,
    );
    expect(radius).toBe('0px');
  });

  test('cards have no box-shadow', async ({ page }) => {
    const card = page.locator('.bg-card').first();
    await expect(card).toBeVisible();
    const shadow = await card.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).toBe('none');
  });

  test('badges have border-radius 0', async ({ page }) => {
    const badge = page.locator('[class*="badge"]').first();
    if ((await badge.count()) > 0) {
      const radius = await badge.evaluate(
        (el) => getComputedStyle(el).borderRadius,
      );
      expect(radius).toBe('0px');
    }
  });
});

test.describe('design system: buttons', () => {
  test('app buttons are flat with no radius', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(300);
    // Target app buttons inside main content, not third-party banners
    const btn = page.locator('main button, header button').first();
    if ((await btn.count()) > 0) {
      await expect(btn).toBeVisible();
      const styles = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
      });
      expect(styles.borderRadius).toBe('0px');
      expect(styles.boxShadow).toBe('none');
    }
  });
});

test.describe('design system: dialog', () => {
  test('dialog renders flat', async ({ page }) => {
    await page.goto('/trips');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(300);
    const signInBtn = page
      .getByRole('button', { name: /sign in/i })
      .first();
    if ((await signInBtn.count()) > 0) {
      await signInBtn.click();
      await page.waitForTimeout(500);
      const dialog = page.getByRole('dialog').first();
      if ((await dialog.count()) > 0) {
        const radius = await dialog.evaluate((el) => {
          // The dialog content panel is the styled child
          const panel = el.querySelector('[class*="DialogContent"], [class*="dialog"]') || el;
          return getComputedStyle(panel).borderRadius;
        });
        expect(radius).toBe('0px');
      }
    }
  });
});

test.describe('design system: typography', () => {
  test('no Plus Jakarta Sans in font stack', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    // Check that Plus Jakarta Sans is not declared anywhere
    const hasJakarta = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText?.toLowerCase().includes('jakarta')) return true;
          }
        } catch { /* cross-origin */ }
      }
      return false;
    });
    expect(hasJakarta).toBe(false);
  });
});

test.describe('design system: monochrome public pages', () => {
  // /news excluded — news cards may have category images with chromatic content
  const publicPages = ['/', '/events', '/venues', '/hotels'];

  for (const path of publicPages) {
    test(`no chromatic backgrounds on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await dismissCookieBanner(page);
      await page.waitForTimeout(500);

      const chromaticCount = await page.evaluate(() => {
        const isChromatic = (color: string): boolean => {
          const m = color.match(
            /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/,
          );
          if (!m) return false;
          const [r, g, b] = [+m[1], +m[2], +m[3]];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max === 0) return false;
          const saturation = (max - min) / max;
          return saturation > 0.15;
        };

        let count = 0;
        // Only check elements inside the app, skip third-party overlays
        const els = document.querySelectorAll('#root *, header *, main *, footer *');
        for (const el of els) {
          const cs = getComputedStyle(el);
          if (isChromatic(cs.backgroundColor)) count++;
        }
        return count;
      });

      // Allow small count for --destructive tokens or dynamic content
      expect(chromaticCount).toBeLessThanOrEqual(5);
    });
  }
});

test.describe('design system: visual snapshots', () => {
  test('homepage above fold', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('home-desktop.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('events card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('events-desktop.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('venues card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/venues');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('venues-desktop.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
