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
  test('primary button is flat with no radius', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    const btn = page.getByRole('button').first();
    await expect(btn).toBeVisible();
    const styles = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
    });
    expect(styles.borderRadius).toBe('0px');
    expect(styles.boxShadow).toBe('none');
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
        const styles = await dialog.evaluate((el) => {
          const cs = getComputedStyle(el);
          return { borderRadius: cs.borderRadius };
        });
        expect(styles.borderRadius).toBe('0px');
      }
    }
  });
});

test.describe('design system: typography', () => {
  test('body text uses Inter', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    const fontFamily = await page
      .locator('body')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('inter');
    expect(fontFamily.toLowerCase()).not.toContain('jakarta');
  });
});

test.describe('design system: monochrome public pages', () => {
  const publicPages = ['/', '/events', '/venues', '/news', '/hotels'];

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
        const els = document.querySelectorAll('*');
        for (const el of els) {
          const cs = getComputedStyle(el);
          if (isChromatic(cs.backgroundColor)) count++;
        }
        return count;
      });

      // Allow up to 2 for --destructive tokens (error states)
      expect(chromaticCount).toBeLessThanOrEqual(2);
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
