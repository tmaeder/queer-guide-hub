import { test, expect } from '@playwright/test';

/**
 * End-to-end guards for the rights surface.
 *
 * These assert things unit tests structurally cannot: that a criminalising
 * country never renders a reassuring verdict AT ANY POINT during load, that
 * the coverage note reports a real fraction rather than a tautology, and that
 * every country is reachable rather than the first twelve per tier.
 *
 * Each one corresponds to a defect that shipped to production:
 *   - "239 of 250"      the note rendered {n} of {n} and could never fail
 *   - Germany reachable the world list was .slice(0, 12) with no expander
 *   - 7 vs 5 death      "No legal certainty" was read as "No" on 5 countries
 *   - never "Welcoming" the empty report is indistinguishable from measured-safe
 *
 * playwright's baseURL defaults to https://queer.guide, so a local run without
 * E2E_BASE_URL tests the DEPLOYED site, not your working tree.
 */
const dismiss = async (page) => {
  const btn = page.getByRole('button', { name: /accept|decline|reject|only essential/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
};

test('/rights states real coverage, not a tautology', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(/239 of 250/, { timeout: 30_000 });
});

test('/rights reaches every country, not the first twelve per tier', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const world = page.locator('#world');
  await expect(world.getByRole('link', { name: 'Germany', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(world.getByRole('link', { name: 'Thailand', exact: true })).toBeVisible();
});

test('/rights separates confirmed from uncertain death penalty', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/In 7 the penalty is death/, { timeout: 30_000 });
  await expect(main).toContainText(/In 5 more our source names the death penalty as possible/);
});

test('an unscored country is never filed as Protected or Mixed', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('#world')).toContainText(/Not scored/, { timeout: 30_000 });
  // North Korea scores 60 purely because the formula opens at 50; it must not
  // read as Protected on an LGBTQ+ safety page.
  const world = await page.locator('#world').innerText();
  const protectedBlock = world.split('Mixed')[0];
  expect(protectedBlock).not.toContain('North Korea');
});

test('Afghanistan warns about the death penalty rather than calling it criminalised only', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(
    /Travel Warning: Same-sex activity may carry the death penalty/, { timeout: 30_000 });
  await expect(page.locator('main')).toContainText(/no legal certainty/);
});

test('INVARIANT: a criminalising country never renders as Welcoming', async ({ page }) => {
  test.setTimeout(120_000);
  // Sampled from first paint, so a reassuring LOADING state fails too — that
  // was the live defect: the tile read "Welcoming" for ~30s under a
  // death-penalty banner.
  const seen: string[] = [];
  await page.goto('/country/afghanistan', { waitUntil: 'commit' });
  for (let i = 0; i < 240; i++) {
    const txt = await page.locator('main').innerText().catch(() => '');
    const m = txt.match(/FOR LGBTQ\+ TRAVELERS\s*\n\s*([^\n]+)/i);
    if (m && seen[seen.length - 1] !== m[1]) seen.push(m[1]);
    if (seen.includes('Dangerous')) break;
    await page.waitForTimeout(250);
  }
  expect(seen.length, `verdict never rendered; saw ${JSON.stringify(seen)}`).toBeGreaterThan(0);
  expect(seen, `verdict sequence was ${JSON.stringify(seen)}`).not.toContain('Welcoming');
  expect(seen).toContain('Dangerous');
});

test('crisis-adjacent surfaces stay animation-free', async ({ page }) => {
  await page.goto('/rights');
  await expect(page.locator('main h1')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('div.fixed.top-0.left-0.right-0')).toHaveCount(0);
});

/**
 * The rights-card value classifier (src/lib/rights/rightsValue.ts).
 *
 * Until 2026-08-08 it tested `v.includes('legal')` in its POSITIVE branch, so
 * every phrase naming a legal BARRIER scored as a protection — a ✓ beside
 * "Explicit Legal Barriers" on 60 countries and "Legal Barriers Likely to
 * Exist" on 63 more. Two more groups sat on the wrong side in the other
 * direction. Asserting the rendered GLYPH, because the chip text was right the
 * whole time; only the polarity was wrong, and that is what a reader scans.
 */
async function glyphFor(page, label: string): Promise<string> {
  const row = page
    .locator('div')
    .filter({ has: page.locator(`:scope > p:text-is("${label}")`) })
    .first();
  await row.waitFor({ state: 'attached', timeout: 30_000 });
  const cls = (await row.locator('svg').nth(1).getAttribute('class')) ?? '';
  return (cls.match(/lucide-[a-z-]+/) ?? [''])[0];
}

test('a legal barrier renders as negative, not as a protection', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  // Afghanistan: expression "Non-Explicit Legal Barriers",
  //              association "Legal Barriers Likely to Exist".
  expect(await glyphFor(page, 'Freedom of expression')).toBe('lucide-x');
  expect(await glyphFor(page, 'Freedom of association')).toBe('lucide-x');
});

test('the best available outcome renders as positive, not partial', async ({ page }) => {
  await page.goto('/country/germany');
  await dismiss(page);
  // Germany: adoption "Joint & Second Parent Adoption" — the best case, which
  // fell through to the partial default before the vocabulary existed.
  expect(await glyphFor(page, 'Adoption rights')).toBe('lucide-check');
  // Control: a genuine "No known legal barriers" must still read positive.
  expect(await glyphFor(page, 'Freedom of expression')).toBe('lucide-check');
});

test('/rights/sources exists, states its coverage and refuses to oversell the score', async ({
  page,
}) => {
  await page.goto('/rights/sources');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Where this data comes from/, { timeout: 30_000 });
  await expect(main).toContainText(/ILGA World Database/);
  await expect(main).toContainText(/239 \/ 250/);
  // The three honesty claims. If any is edited away, the page stops earning
  // the citation that /rights points at.
  await expect(main).toContainText(/lands mid-scale rather than reading as unknown/);
  await expect(main).toContainText(/not a safety rating/);
  await expect(main).toContainText(/rights vary by state or province/);
});

test('/rights cites its source rather than asserting a bare number', async ({ page }) => {
  await page.goto('/rights');
  await dismiss(page);
  await expect(page.locator('main')).toContainText(/Where this comes from/, { timeout: 30_000 });
  await expect(page.locator('main a[href$="/rights/sources"]').first()).toBeVisible();
});

/**
 * The per-lens split (#2647).
 *
 * A single number said the United States was 86/100, which concealed that the
 * trans picture there is materially worse than the LGB one — 82 countries have
 * LGB and trans verdicts that disagree. These assert the split renders and
 * that it still names what the dataset does not cover.
 */
test('a country page says who the law protects, per identity', async ({ page }) => {
  await page.goto('/country/united-states');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Who the law protects/i, { timeout: 30_000 });
  for (const lens of ['Lesbian, gay, bisexual', 'Trans', 'Intersex']) {
    await expect(main).toContainText(lens);
  }
  // The split must be a split: LGB and trans must not read identically here.
  const block = await main.innerText();
  const i = block.search(/Who the law protects/i);
  const rows = block.slice(i, i + 260);
  expect(rows).toMatch(/Some protections|Broad protections/);
  expect(rows).toMatch(/Few or no protections/);
});

test('the verdict names what our source does not record', async ({ page }) => {
  await page.goto('/country/united-states');
  await dismiss(page);
  // Without this, a green trans verdict reads as a promise about a passport
  // check ILGA never made.
  await expect(page.locator('main')).toContainText(
    /identity documents are treated at borders/i,
    { timeout: 30_000 },
  );
});

test('a criminalising country reads criminalised on every lens', async ({ page }) => {
  await page.goto('/country/afghanistan');
  await dismiss(page);
  const main = page.locator('main');
  await expect(main).toContainText(/Who the law protects/i, { timeout: 30_000 });
  const block = await main.innerText();
  const i = block.search(/Who the law protects/i);
  const rows = block.slice(i, i + 260);
  // INV-1: no accumulation of protections can lift a criminalising country,
  // and that must survive all the way to the rendered page.
  expect(rows).not.toMatch(/Broad protections|Some protections/);
  expect((rows.match(/Criminalised/g) || []).length).toBeGreaterThanOrEqual(3);
});
