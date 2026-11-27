import { test, expect } from '@playwright/test';

/**
 * Smoke for the 2026-11-19 polish batch: /help situations, the trip-finder
 * wizard, the legal hub, email updates and the STI / substance bands.
 * Runs signed out so the public surface is what is measured.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('help situations', () => {
  test('defaults to the crisis view and offers every situation', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: /What’s happening\?/ })).toBeVisible();
    for (const label of [
      'Mental health & crisis',
      'STI & HIV exposure',
      'Unwanted pregnancy',
      'Rape & sexual assault',
      'Violence & hate crime',
      'Legal help',
      'Asylum & leaving a country',
      'Trans health',
      'Drugs & chemsex',
    ]) {
      await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Mental health & crisis/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a linked situation puts its time-critical step first', async ({ page }) => {
    await page.goto('/help?need=sti');
    await expect(page.getByRole('heading', { name: 'STI & HIV exposure' })).toBeVisible();
    await expect(page.getByText(/PEP has to start within 72 hours/)).toBeVisible();
    await expect(page.getByRole('link', { name: /^PEP/ })).toHaveAttribute('href', /\/tags\/pep/);
  });

  test('picking a situation updates the URL', async ({ page }) => {
    await page.goto('/help');
    await page.getByRole('button', { name: /Drugs & chemsex/ }).click();
    await expect(page).toHaveURL(/need=drugs/);
    await expect(page.getByText(/call the emergency number, put them on their side/)).toBeVisible();
  });

  test('coping techniques and the safety plan download are on the page', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: 'Not ready to talk?' })).toBeVisible();
    const pdf = page.getByRole('link', { name: /Download plan \(PDF\)/ });
    await expect(pdf).toHaveAttribute('href', '/downloads/my-safety-plan.pdf');
    const res = await page.request.get('/downloads/my-safety-plan.pdf');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('pdf');
  });
});

test.describe('trip finder wizard', () => {
  test('walks mood → choose → places → stay → getting there → book', async ({ page }) => {
    await page.goto('/travel');
    const steps = page.getByRole('navigation', { name: 'Trip finder steps' });
    await expect(steps).toBeVisible({ timeout: 30_000 });
    await expect(steps.getByRole('button', { name: /Mood/ })).toHaveAttribute(
      'aria-current',
      'step',
    );

    await page.getByRole('button', { name: /^Nudist/ }).click();
    await page.getByRole('button', { name: /See matches/ }).click();
    await expect(page.getByRole('heading', { name: 'Choose your escape' })).toBeVisible();
    await expect(page.getByText(/^Naturist days in /).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /See the package/ }).click();
    await expect(page.getByText('Things to do', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Where to stay/ }).click();
    await expect(page.getByText('Stay your way')).toBeVisible();
    await page.getByRole('button', { name: /How to get there/ }).click();
    await expect(page.getByText('How you get there')).toBeVisible();
    await page.getByRole('button', { name: /^Make it a trip/ }).click();
    await expect(page.getByRole('button', { name: /Build this escape/ })).toBeVisible();
  });

  test('kinky leads with a real kink weekend', async ({ page }) => {
    await page.goto('/travel');
    await page.getByRole('button', { name: /^Kinky/ }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /See matches/ }).click();
    await expect(
      page.getByText(/Leather|Fetish|Folsom|Darklands|Easter Berlin|Snax|Alley/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});

test('legal hub lists accessibility and common requests', async ({ page }) => {
  await page.goto('/legal');
  await expect(page.getByRole('link', { name: /Accessibility/ }).first()).toHaveAttribute(
    'href',
    /\/accessibility$/,
  );
  await expect(page.getByRole('heading', { name: 'Common requests' })).toBeVisible();
  await expect(page.getByText(/\d+ sections/)).toHaveCount(0);
});

test('email updates: topics are labelled checkboxes', async ({ page }) => {
  await page.goto('/email-updates');
  await expect(page.getByRole('checkbox', { name: 'Newsletter' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Event updates' })).toBeVisible();
});

test('sti profile marks fit their badge', async ({ page }) => {
  await page.goto('/tags/hiv');
  const band = page.locator('#sexual-health');
  await expect(band).toBeVisible({ timeout: 30_000 });
  // A blood route carries two glyphs; both must sit inside the mark.
  const overflow = await band.locator('[data-information-geometry="true"]').evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
  );
  expect(overflow).toBe(0);
});

test('nav labels are short', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('header nav').first();
  await expect(nav.getByRole('link', { name: 'Travel', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Meet', exact: true })).toBeVisible();
});
