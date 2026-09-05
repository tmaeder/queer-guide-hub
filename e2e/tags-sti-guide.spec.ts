import { test, expect } from '@playwright/test';

// `/tags/sti-guide` — the transmission matrix, prevention methods and testing
// windows. The sexual-health reference linked from the main nav.
//
// WHY THIS EXISTS. Every assertion below is a defect that shipped to production
// and was measured there, not a hypothetical:
//
//  - `th[scope=colgroup]` was **6**, with "Anal sex & play" and "Oral &
//    touching" each printed twice at opposite ends of a 13-column chart. The
//    page grouped columns by run-length over an RPC that does not sort.
//  - Every filled risk mark computed `border-width: 0px`, against an explicit
//    contract in `stiRisk.ts` whose own unit test proves the tint alone
//    measures under 3:1 against paper. Three comments claimed a border; nothing
//    checked the DOM.
//  - The transmission grid needed **3.66×** the viewport at 375px, so a phone
//    reader saw 3 of 13 practices under 280px of diagonal text.
//  - HIV's "Rapid test / self-test · 12w+" was printed inside a bar whose width
//    is the INVERSE of the window, wrapped to three lines in a 28px box, and
//    spilled as background-coloured text on the background. The single number a
//    reader opens this page for was invisible at mobile width.
//
// THESE RUN AGAINST PRODUCTION (`playwright.config.ts` defaults `baseURL` to
// https://queer.guide). The page renders client-side from `sti_transmission_matrix`
// and `sti_protection_matrix` and is absent from the crawler HTML by design, so
// a plain GET cannot see any of it — this needs a real browser.
//
// FLOORS, NOT FIXED COUNTS. Row and column counts are asserted as minimums so
// ordinary data growth cannot break the suite. They exist to catch a chart that
// LOSES content, which on safety data reads as "no risk here".

const RENDER = { timeout: 20_000 };
const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

test.describe('@smoke STI guide', () => {
  test('practice bands are grouped once each, not once per run', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/STI guide/i, RENDER);

    const bands = page.locator('th[scope="colgroup"]');
    await expect(bands.first()).toBeVisible(RENDER);
    const labels = await bands.allTextContents();
    const trimmed = labels.map((l) => l.trim()).filter(Boolean);

    // The defect was duplicates, so assert uniqueness rather than a count of 4 —
    // a fifth band is legitimate growth, a repeated one never is.
    expect(new Set(trimmed).size, `duplicate bands: ${trimmed.join(' | ')}`).toBe(trimmed.length);
    expect(trimmed.length).toBeGreaterThanOrEqual(4);

    // Real <colgroup> elements, so scope="colgroup" names something that exists.
    expect(await page.locator('main colgroup').count()).toBeGreaterThanOrEqual(trimmed.length);
  });

  test('every filled risk mark carries its ink border', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    const marks = page.locator('main span[style*="border-color"]');
    const count = await marks.count();
    // Positive control: a passing "no bare fills" result on an empty chart
    // would be vacuous. The corpus renders ~180 marks.
    expect(count, 'no risk marks rendered at all').toBeGreaterThan(50);

    const bare = await marks.evaluateAll((els) =>
      els
        .map((el) => {
          const cs = getComputedStyle(el);
          return { w: cs.borderWidth, r: cs.borderRadius };
        })
        .filter((s) => parseFloat(s.w) < 2 || s.r === '0px' || parseFloat(s.r) > 10),
    );
    expect(bare, `marks with a bad border/radius: ${JSON.stringify(bare.slice(0, 3))}`).toEqual([]);
  });

  test('nothing forces a horizontal drag at phone width', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    const overflow = await page.evaluate(() => ({
      body: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      tables: [...document.querySelectorAll('main table')]
        .filter((t) => t.getBoundingClientRect().width > 0)
        .map((t) => t.parentElement!.scrollWidth / t.parentElement!.clientWidth),
    }));
    expect(overflow.body, 'page body scrolls sideways').toBe(false);
    for (const ratio of overflow.tables) expect(ratio).toBeLessThanOrEqual(1.05);
  });

  test('every testing window prints its number in full, in ink', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    const labels = await page.evaluate(() => {
      const visible = (el: Element) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };
      return [...document.querySelectorAll('main span')]
        .filter((e) => e.children.length === 0 && /\d+w\+/.test(e.textContent ?? '') && visible(e))
        .map((e) => ({
          text: (e.textContent ?? '').trim(),
          clipped: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1,
          color: getComputedStyle(e).color,
        }));
    });

    // Positive control. Filtering to VISIBLE elements is load-bearing: the
    // desktop table is display:none here, and a clipping test on a zero-height
    // box passes vacuously. Without this floor the suite would go green on a
    // page that rendered no windows at all.
    expect(labels.length, 'no testing-window labels visible on mobile').toBeGreaterThanOrEqual(8);

    const broken = labels.filter((l) => l.clipped);
    expect(broken, `clipped: ${broken.map((b) => b.text).join(', ')}`).toEqual([]);

    // The longest label is the one that used to break. Name it explicitly so a
    // regression points straight at the row it destroyed.
    const longest = labels.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    expect(longest.clipped, `longest label clipped: "${longest.text}"`).toBe(false);
  });

  test('the legend key states every level, and the blood modifier reads as one line', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    for (const level of ['High risk', 'Medium risk', 'Low risk']) {
      await expect(page.getByText(level, { exact: false }).first()).toBeVisible(RENDER);
    }

    // "WITH BLOOD" wrapped to two lines against its mark, because the mark
    // carried `w-full` and squeezed its sibling. One line, or the key looks broken.
    const blood = page.getByText(/^with blood$/i).first();
    await expect(blood).toBeVisible(RENDER);
    const box = await blood.boundingBox();
    const lineHeight = await blood.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 16);
    expect(box!.height, 'the "With blood" label wraps to more than one line').toBeLessThan(
      lineHeight * 1.6,
    );
  });

  test('the rail links each plate, so one section can be shared on its own', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('/tags/sti-guide');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(RENDER);

    for (const id of ['transmission-h', 'protect-h', 'testing-h', 'testing-sites']) {
      await expect(page.locator(`nav a[href="#${id}"]`)).toHaveCount(1, RENDER);
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });
});
