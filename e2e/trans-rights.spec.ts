import { test, expect } from '@playwright/test';

/**
 * `/rights/trans` — the trans safety dimension.
 *
 * These assertions guard the SAFETY INVARIANTS, not the layout. The failure this
 * page exists to prevent is a reader treating TGEU's documented-violence counts
 * as a ranking of danger: those counts rank countries close to inversely to
 * legal risk (Brazil, Mexico and the United States lead; Europe recorded 5 cases
 * in the whole TDoR 2025 period), so anything that colours them, sorts other
 * surfaces by them, or shows them without their caveat is a real-world harm.
 */

test.describe('/rights/trans', () => {
  test('renders the three axes with the reporting caveat leading the count section', async ({
    page,
  }) => {
    await page.goto('/rights/trans');

    await expect(page.getByRole('heading', { name: /trans rights and safety/i })).toBeVisible();

    // Axis 1 — the ledger /rights cannot draw.
    await expect(page.getByText(/gender marker change is possible/i)).toBeVisible();
    await expect(page.getByText(/requires surgery/i).first()).toBeVisible();

    // Axis 3 — the caveat must be present wherever counts are.
    const documented = page.locator('#documented');
    if (await documented.count()) {
      await expect(documented).toContainText(/depend on local reporting/i);
      await expect(documented).toContainText(/not that a place is safe/i);
    }
  });

  test('never colours a documented-violence figure with the danger hue', async ({ page }) => {
    await page.goto('/rights/trans');

    const section = page.locator('#documented');
    if (!(await section.count())) test.skip(true, 'No TMM data imported yet');

    // `--destructive` is reserved for criminalisation and the death penalty.
    // On this section it would assert that the countries with the most
    // documented cases are the most dangerous, which inverts the truth.
    const destructive = section.locator('.text-destructive, [class*="destructive"]');
    expect(await destructive.count()).toBe(0);
  });

  test('states that an unlisted country is not a safety finding', async ({ page }) => {
    await page.goto('/rights/trans');
    const section = page.locator('#documented');
    if (!(await section.count())) test.skip(true, 'No TMM data imported yet');

    // Absence renders as absence. Without this line the table reads as a
    // complete world picture in which every other country recorded zero.
    await expect(section).toContainText(/no case recorded/i);
    await expect(section).toContainText(/no one was in a position to count/i);
  });

  test('publishes what the legal source does not cover', async ({ page }) => {
    await page.goto('/rights/trans');
    const blind = page.locator('#blindspots');
    await expect(blind).toContainText(/identity documents are treated at borders/i);
  });
});

test.describe('trip safety briefing', () => {
  test('carries no documented-violence figure', async ({ page }) => {
    // The briefing is the locked traffic-light surface. It may state gender
    // recognition (a legal fact a traveller acts on) and must not state TMM
    // counts, which beside a risk tier read as a ranking of danger.
    await page.goto('/rights/trans');

    const briefingStrings = [
      /trans murder monitoring/i,
      /documented anti-trans killings/i,
      /recorded since 2008/i,
    ];

    await page.goto('/travel');
    const body = await page.locator('body').innerText();
    for (const re of briefingStrings) {
      expect(body).not.toMatch(re);
    }
  });
});
