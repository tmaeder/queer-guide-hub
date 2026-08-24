import { test, expect, type Browser } from '@playwright/test';

/**
 * Brand logo plates, asserted on the RENDERED PIXELS rather than on class names.
 *
 * This suite exists because a class-name assertion already passed on a broken
 * render. The white-on-transparent plate shipped as `bg-foreground`, which reads
 * as "ink" and IS ink in light mode — every unit test was green — but `.dark`
 * swaps `--foreground` to paper, so in the site's default mode the plate
 * rendered paper-on-paper and the white mark it exists to rescue disappeared.
 * The class list said `bg-foreground`; `getComputedStyle` said
 * `rgb(250, 250, 245)`. Only the second one was true.
 *
 * The invariant under test is therefore not "the ink brand gets the ink class"
 * but **polarity belongs to the artwork, not the theme**: a plate must paint the
 * same colour in light and dark. That is what was violated, it is invisible to a
 * class-name check, and it survives any later renaming of the tokens.
 *
 * Theme is driven by `colorScheme` on a fresh context, NOT by seeding
 * `localStorage`. The first draft of this file did the latter and every
 * assertion passed while both passes ran in LIGHT mode — a vacuous green on the
 * exact bug it was written for. Hence `readTheme` returns `--foreground` too and
 * every test asserts the mode actually flipped BEFORE asserting anything about
 * the plate. A control that is not itself checked is not a control.
 *
 * **This spec belongs to the NIGHTLY suite, not `e2e-pr.yml`.** Nightly runs the
 * whole directory against `https://queer.guide`, so it is picked up with no
 * registration. The PR job serves a local `vite preview`, and `img.queer.guide`
 * is Referer-gated — it answers `1011` to anything that is not the real origin,
 * so every logo would fail to load, `BrandMark`'s `onError` would hide the img,
 * and this suite would go red on a build that is perfectly correct. Adding it to
 * that hardcoded list would be a false alarm, not extra coverage.
 */

/** The two literals a logo ground may ever be. Both are mode-independent. */
const PAPER = 'rgb(250, 250, 245)';
const INK = 'rgb(17, 17, 17)';

/** A brand measured as white-on-transparent — its plate must be ink. */
const INK_BRAND = 'automic-gold';
/** A brand with an ordinary dark wordmark — its plate must stay paper. */
const PAPER_BRAND = 'tomboyx';

interface PlateReading {
  /** Background the browser actually paints behind the logo. */
  plateBg: string;
  /** `--foreground`, read to prove the theme flipped. Ink in light, paper in dark. */
  foreground: string;
  htmlClass: string;
}

async function readPlate(
  browser: Browser,
  slug: string,
  colorScheme: 'light' | 'dark',
): Promise<PlateReading> {
  const ctx = await browser.newContext({ colorScheme });
  try {
    const page = await ctx.newPage();
    await page.goto(`/marketplace/brands/${slug}`);
    const logo = page.locator('img[src*="/logos/"]').first();
    await expect(logo).toBeVisible({ timeout: 20_000 });
    return await logo.evaluate((img) => {
      const plate = img.closest('div');
      return {
        plateBg: plate ? getComputedStyle(plate).backgroundColor : '',
        foreground: getComputedStyle(document.documentElement)
          .getPropertyValue('--foreground')
          .trim(),
        htmlClass: document.documentElement.className,
      };
    });
  } finally {
    await ctx.close();
  }
}

/** Perceived luminance 0..1 of an `rgb(r, g, b)` string. */
function luminance(rgb: string): number {
  const m = rgb.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) throw new Error(`unparseable colour: ${rgb}`);
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Fails loudly if the emulation did not actually change the theme. */
function assertThemeFlipped(light: PlateReading, dark: PlateReading) {
  expect(light.htmlClass, 'light pass did not render in light mode').toContain('light');
  expect(dark.htmlClass, 'dark pass did not render in dark mode').toContain('dark');
  expect(
    dark.foreground,
    'the theme did not flip — every assertion below would be vacuous',
  ).not.toBe(light.foreground);
}

test.describe('marketplace brand logos', () => {
  test('the makers directory renders real logos, not only monograms', async ({ page }) => {
    await page.goto('/marketplace/brands');
    // Wait for the grid rather than counting immediately: the directory
    // hydrates from a query, so an early count is a race, not a measurement.
    const logos = page.locator('img[src*="/logos/"]');
    await expect(logos.first()).toBeVisible({ timeout: 20_000 });
    expect(await logos.count()).toBeGreaterThan(5);
  });

  test('a white-on-transparent mark sits on an INK plate in BOTH themes', async ({ browser }) => {
    const light = await readPlate(browser, INK_BRAND, 'light');
    const dark = await readPlate(browser, INK_BRAND, 'dark');
    assertThemeFlipped(light, dark);

    for (const [mode, r] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      expect(
        luminance(r.plateBg),
        `${INK_BRAND} plate should be ink in ${mode} mode, got ${r.plateBg}`,
      ).toBeLessThan(0.25);
    }
  });

  test('an ordinary dark wordmark stays on the PAPER plate in BOTH themes', async ({ browser }) => {
    const light = await readPlate(browser, PAPER_BRAND, 'light');
    const dark = await readPlate(browser, PAPER_BRAND, 'dark');
    assertThemeFlipped(light, dark);

    for (const [mode, r] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      expect(
        luminance(r.plateBg),
        `${PAPER_BRAND} plate should be paper in ${mode} mode, got ${r.plateBg}`,
      ).toBeGreaterThan(0.8);
    }
  });

  test('plate colour does not follow the theme', async ({ browser }) => {
    // The regression stated directly: whatever the tokens are called, switching
    // mode must not repaint either plate.
    for (const slug of [INK_BRAND, PAPER_BRAND]) {
      const light = await readPlate(browser, slug, 'light');
      const dark = await readPlate(browser, slug, 'dark');
      assertThemeFlipped(light, dark);
      expect(
        dark.plateBg,
        `${slug} plate repainted between themes (${light.plateBg} → ${dark.plateBg})`,
      ).toBe(light.plateBg);
    }
  });

  test('venue logo tiles are pinned, never the themed ground', async ({ browser }) => {
    // Venues had it worse than brands: the tile was `bg-muted`, a THEME token
    // (rgb(234,234,222) light / rgb(28,28,25) dark), so a dark wordmark died in
    // dark mode and a white one in light — 19.5% of measured logos invisible in
    // one of the two. The assertion is on the SET of grounds rather than on a
    // named venue, so it survives ranking changes and new imports.
    const read = async (colorScheme: 'light' | 'dark') => {
      const ctx = await browser.newContext({ colorScheme });
      try {
        const page = await ctx.newPage();
        await page.goto('/venues?q=sauna');
        await expect(page.locator('img[src*="/logos/"]').first()).toBeVisible({ timeout: 20_000 });
        await page.waitForLoadState('networkidle');
        return await page.evaluate(() => {
          const imgs = [...document.querySelectorAll('img[src*="/logos/"]')] as HTMLImageElement[];
          return {
            htmlClass: document.documentElement.className,
            grounds: imgs
              .map((i) => getComputedStyle(i.parentElement as Element).backgroundColor)
              .sort(),
          };
        });
      } finally {
        await ctx.close();
      }
    };

    const light = await read('light');
    const dark = await read('dark');
    expect(light.htmlClass, 'light pass did not render in light mode').toContain('light');
    expect(dark.htmlClass, 'dark pass did not render in dark mode').toContain('dark');
    expect(light.grounds.length, 'no venue logos on the page to assert about').toBeGreaterThan(0);

    for (const [mode, r] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      for (const bg of r.grounds) {
        expect([PAPER, INK], `${mode}: venue tile used a themed ground (${bg})`).toContain(bg);
      }
    }
    // The invariant itself: the same page paints the same grounds either way.
    expect(dark.grounds, 'venue tiles repainted between themes').toEqual(light.grounds);
  });
});
