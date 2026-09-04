import { test, expect, type Page } from '@playwright/test';

/**
 * Interactive glossary figures.
 *
 * The assertions here are deliberately about PROPERTIES rather than values —
 * "the SVG holds no focusable element", "the table has a row per stop" — so
 * they survive an edit to the diagram's content. A spec pinning the label of
 * node three rots the first time someone rewords it, and then gets deleted.
 */

const FOCUSABLE = 'a, button, input, select, textarea, [tabindex], [contenteditable]';

async function gotoTerm(page: Page, slug: string) {
  await page.goto(`/tags/${slug}`);
  // The cookie banner is fixed to the bottom of the viewport and swallows
  // pointer events aimed at anything under it. Hidden rather than dismissed:
  // clicking through it would be expressing a consent choice on the user's
  // behalf, which is not this spec's business.
  await page
    .addStyleTag({ content: '[aria-label="Cookie settings"] { display: none !important; }' })
    .catch(() => {});
  // The page is a SPA and the figure band is below the definition, so wait for
  // the band itself rather than for load state.
  await expect(page.locator('#figure')).toBeVisible({ timeout: 20000 });
  // …and then for the DRAWING. The band's frame — heading, caption, table
  // toggle, sources — renders immediately; the renderer arrives in its own
  // lazy chunk behind a Suspense boundary. Asserting on the band alone races
  // that boundary and measures the loading state, which is how three earlier
  // runs of this spec produced confident nonsense.
  await expect(page.locator('#figure [role="status"]')).toHaveCount(0, { timeout: 20000 });
}

test.describe('the figure band', () => {
  test('renders on the consent entry, after the definition', async ({ page }) => {
    await gotoTerm(page, 'consent');

    const band = page.locator('#figure');
    await expect(band).toBeVisible();

    // Order is the contract: the definition is what someone arriving from
    // search needs, so the diagram elaborates it and never precedes it.
    const aboutY = await page.locator('#about').boundingBox();
    const figureY = await band.boundingBox();
    const taxonomyY = await page.locator('#taxonomy').boundingBox();
    expect(figureY!.y).toBeGreaterThan(aboutY!.y);
    if (taxonomyY) expect(figureY!.y).toBeLessThan(taxonomyY.y);
  });

  test('renders on the gender identity entry', async ({ page }) => {
    await gotoTerm(page, 'gender-identity');
    await expect(page.locator('#figure')).toBeVisible();
    // Four lines, so four radio groups, one per line.
    const radios = page.locator('#figure input[type="radio"]');
    expect(await radios.count()).toBeGreaterThan(10);
  });

  test('does not render on a term a figure only MENTIONS', async ({ page }) => {
    // The control for every "it renders" assertion above: without it, a band
    // that always rendered would pass all of them.
    //
    // `cisgender` rather than an unrelated term, for two reasons. It is named
    // by the Four Lines figure with `role: 'mentioned'`, so this asserts the
    // distinction the reverse index exists for — a term in a legend has not
    // been taught and does not earn a 400px interactive — instead of the much
    // weaker "a random term has no diagram".
    //
    // And it is NOT `is_adult`. An adult term sits behind the age gate, so the
    // page itself would be absent and `#figure` would be 0 because nothing
    // rendered at all. That passes for the wrong reason, and against prod
    // (safe mode defaults on, anonymous) it would pass every single time.
    await page.goto('/tags/cisgender');
    await expect(page.locator('h1')).toBeVisible({ timeout: 20000 });
    // The page really is here — so a zero below means "no band", not "no page".
    await expect(page.locator('#about')).toBeVisible();
    await expect(page.locator('#figure')).toHaveCount(0);
  });
});

test.describe('the RouteStrip station', () => {
  test('carries a Diagram stop that scrolls to the band', async ({ page }) => {
    await gotoTerm(page, 'consent');
    // RouteStrip prefixes each stop with its position ("2Diagram"), so match
    // the label rather than anchoring the whole string.
    const station = page.locator('a[href="#figure"]').first();
    await expect(station).toBeVisible();
    await expect(station).toHaveText(/Diagram/);
    await station.click();
    await expect(page.locator('#figure')).toBeInViewport({ timeout: 5000 });
  });
});

test.describe('the a11y contract', () => {
  test('puts nothing focusable inside any drawing', async ({ page }) => {
    for (const slug of ['consent', 'gender-identity']) {
      await gotoTerm(page, slug);
      const count = await page.locator('#figure svg').evaluateAll(
        (svgs, sel) => svgs.reduce((n, s) => n + s.querySelectorAll(sel).length, 0),
        FOCUSABLE,
      );
      expect(count, `${slug} has a focusable element inside an <svg>`).toBe(0);
    }
  });

  test('marks every drawing aria-hidden and names the wrapper', async ({ page }) => {
    await gotoTerm(page, 'consent');
    // Scoped to the drawing. Icons elsewhere in the frame carry their own
    // (also hidden) semantics, and the Suspense loader legitimately has
    // `role="status"` — a blanket "every svg in the band" assertion would be
    // asserting something the contract never claimed.
    const hidden = await page
      .locator('#figure [role="img"] svg')
      .evaluateAll((svgs) => svgs.length > 0 && svgs.every((s) => s.getAttribute('aria-hidden') === 'true'));
    expect(hidden).toBe(true);

    const img = page.locator('#figure [role="img"]').first();
    const label = await img.getAttribute('aria-label');
    expect(label?.length ?? 0).toBeGreaterThan(20);
  });

  test('exposes the diagram as a real table', async ({ page }) => {
    await gotoTerm(page, 'consent');
    // Located by `aria-controls`, not by name: the button relabels itself to
    // "Hide the table" once open, so a name-based locator stops resolving
    // exactly when the assertion needs it.
    const toggle = page.locator('#figure button[aria-controls]').first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveText(/read as a table/i);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveText(/hide the table/i);

    const table = page.locator('#figure table').first();
    await expect(table).toBeVisible();
    await expect(table.locator('caption')).not.toBeEmpty();
    expect(await table.locator('th[scope="col"]').count()).toBeGreaterThan(0);
    expect(await table.locator('tbody tr').count()).toBeGreaterThan(3);
  });
});

test.describe('term links out of a figure', () => {
  test('never emits a link to a term the glossary does not have', async ({ page }) => {
    await gotoTerm(page, 'consent');
    // `safeword` and `hard-limit` are taught by this figure and do not exist
    // as terms yet. They must read as absent, not 404.
    const deadLinks = page.locator(
      '#figure a[href*="/tags/safeword"], #figure a[href*="/tags/hard-limit"]',
    );
    await expect(deadLinks).toHaveCount(0);
  });

  test('every term link a figure does emit resolves to a real entry', async ({ page }) => {
    await gotoTerm(page, 'gender-identity');
    const hrefs = await page.locator('#figure a[href*="/tags/"]').evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!),
    );
    for (const href of [...new Set(hrefs)].slice(0, 6)) {
      const res = await page.request.get(href);
      expect(res.status(), `${href} did not resolve`).toBeLessThan(400);
    }
  });
});

test.describe('the consent figure interacts', () => {
  test('selecting a stop lights the route that reaches it', async ({ page }) => {
    await gotoTerm(page, 'consent');
    const stops = page.locator('#figure ol button');
    const total = await stops.count();
    expect(total).toBeGreaterThan(5);

    // Nothing dimmed before a selection.
    const dimmedAtRest = await stops.evaluateAll((els) =>
      els.filter((e) => e.parentElement!.className.includes('opacity-40')).length,
    );
    expect(dimmedAtRest).toBe(0);

    const last = stops.last();
    await last.click();
    await expect(last).toHaveAttribute('aria-pressed', 'true');

    const dimmedAfter = await stops.evaluateAll((els) =>
      els.filter((e) => e.parentElement!.className.includes('opacity-40')).length,
    );
    // Some stops are on the route and some are not — so the count is neither
    // zero nor everything.
    expect(dimmedAfter).toBeGreaterThan(0);
    expect(dimmedAfter).toBeLessThan(total);

    await last.click();
    await expect(last).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('the four lines figure interacts', () => {
  test('picking a stop names it back, with nothing selected by default', async ({ page }) => {
    await gotoTerm(page, 'gender-identity');

    // No default position: a centred opening state would read as the norm.
    const checkedAtRest = await page
      .locator('#figure input[type="radio"]')
      .evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).length);
    expect(checkedAtRest).toBe(0);

    const readout = page.locator('#figure [aria-live="polite"]');
    await expect(readout).toBeEmpty();

    // The radio itself is `sr-only`; its label is the visible control, which
    // is what a sighted user actually clicks.
    await page.locator('#figure fieldset label').first().click();
    await expect(readout).not.toBeEmpty();
    const checkedAfter = await page
      .locator('#figure input[type="radio"]')
      .evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).length);
    expect(checkedAfter).toBe(1);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('drops the drawing and keeps every control', async ({ page }) => {
    await gotoTerm(page, 'consent');
    // Below `md` the map is hidden — a 300-unit-wide diagram would overlap
    // itself — but the SAME list carries every stop, so nothing is lost.
    await expect(page.locator('#figure svg').first()).toBeHidden();
    expect(await page.locator('#figure ol button').count()).toBeGreaterThan(5);
    // And the page never scrolls sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
