import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { REDUCED_MOTION } from './support/reducedMotion';

test.use(REDUCED_MOTION);

async function expectProportionalIcon(control: Locator, label: string) {
  await expect(control).toBeVisible({ timeout: 20_000 });
  const icon = control.locator('svg');
  await expect(icon).toHaveCount(1);
  await expect(icon).toBeVisible();

  const labelSize = await control.evaluate((element, text) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.textContent?.trim() === text && node.parentElement) {
        return parseFloat(getComputedStyle(node.parentElement).fontSize);
      }
    }
    throw new Error(`Missing rendered label: ${text}`);
  }, label);
  const box = await icon.boundingBox();
  expect(box, `${label}: icon has a rendered box`).not.toBeNull();
  // Allow optical variation between glyphs while catching tiny icons and a
  // return to the oversized global minimum. Compare both rendered dimensions.
  for (const dimension of [box!.width, box!.height]) {
    expect(dimension / labelSize, `${label}: icon-to-label ratio`).toBeGreaterThanOrEqual(1);
    expect(dimension / labelSize, `${label}: icon-to-label ratio`).toBeLessThanOrEqual(2.25);
  }
}

for (const width of [1440, 390]) {
  test(`Going Out detail action keeps its icon proportional at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/city/berlin', { waitUntil: 'domcontentloaded' });
    const label = 'Plan a trip to Berlin';
    const action = page.getByRole('main').getByRole('button', { name: label, exact: true });
    await expectProportionalIcon(action, label);
  });

  test(`Knowledge detail action keeps its icon proportional at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/tags/drag', { waitUntil: 'domcontentloaded' });
    const label = 'Search everything tagged Drag';
    const action = page.getByRole('main').getByRole('link', { name: label, exact: true });
    await expectProportionalIcon(action, label);
  });
}

for (const width of [1100, 1440]) {
  test(`desktop primary navigation stays text-only after scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/en/tags/rights-by-country', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 20_000,
    });

    const header = page.getByRole('banner');
    const nav = header.getByRole('navigation', { name: 'Primary', exact: true });
    const labels = ['Going out', 'Travelling', 'Meet people', 'Knowledge', 'News', 'Shop'];
    async function expectTextOnlyNavigation() {
      await expect(nav).toBeInViewport();
      await expect(nav.getByRole('link')).toHaveCount(labels.length);
      for (const label of labels) {
        const link = nav.getByRole('link', { name: label, exact: true });
        await expect(link).toHaveText(label);
        await expect(link.getByText(label, { exact: true })).toBeInViewport();
      }
      await expect(nav.locator('svg, img, [role="img"], i, canvas')).toHaveCount(0);
    }

    await expect(header).not.toHaveClass(/island-ink/);
    await expectTextOnlyNavigation();

    // A wheel gesture cancels the initial scroll restoration. Confirm the
    // compact state was reached before repeating the navigation assertions.
    await page.mouse.wheel(0, 600);
    await expect(header).toHaveClass(/island-ink/);
    await expectTextOnlyNavigation();
  });
}
