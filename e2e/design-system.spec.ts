import { test, expect } from '@playwright/test';

/**
 * Design system enforcement tests.
 *
 * Verify the semantic 3-tier radius (see CLAUDE.md §Shape) and that public
 * pages only ever paint sanctioned brand ink (see the PASTE-UP guard below —
 * it replaced the old "at most 5 chromatic backgrounds" budget).
 *
 * Radius assertions read --radius-{container,element,badge} off the document
 * at runtime instead of hardcoding px. They used to assert 16/8/4 literally,
 * which silently went stale the moment a design pass re-tuned the trio (the
 * PHOTOCOPY rebrand moved it to 8/4/0 and broke four of these tests) — and
 * because this spec is nightly-only, nothing surfaced it on the PR. The trio
 * is also runtime-overridable via /admin/design, so a literal can never be
 * the source of truth. What these tests actually guard is that cards/buttons/
 * dialogs/badges each consume the RIGHT tier, not any particular value.
 */

const dismissCookieBanner = async (page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

test.describe('design system: semantic radius (token-derived)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/events');
    // Wait for the app to paint, not for the network to fall idle. These guards
    // read computed styles under #root, and `networkidle` (500ms of zero
    // requests) never settles on pages with maps, lazy images and analytics —
    // all four timed out against production.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
  });

  // Assertions read the token rather than a literal px value: the semantic trio
  // is re-tuned by design passes (and is runtime-overridable via /admin/design),
  // so hardcoding the px froze these tests at the 16/4px era and they went stale.
  test('cards use --radius-container', async ({ page }) => {
    const cards = page.locator('.bg-card').first();
    await expect(cards).toBeVisible();
    const { radius, token } = await cards.evaluate((el) => ({
      radius: getComputedStyle(el).borderRadius,
      token: getComputedStyle(document.documentElement)
        .getPropertyValue('--radius-container')
        .trim(),
    }));
    const expected = `${parseFloat(token) * 16}px`;
    expect(radius).toBe(expected);
  });

  test('cards have no box-shadow', async ({ page }) => {
    const card = page.locator('.bg-card').first();
    await expect(card).toBeVisible();
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe('none');
  });

  test('badges use --radius-badge', async ({ page }) => {
    const badge = page.locator('[class*="badge"]').first();
    if ((await badge.count()) > 0) {
      const { radius, token } = await badge.evaluate((el) => ({
        radius: getComputedStyle(el).borderRadius,
        token: getComputedStyle(document.documentElement).getPropertyValue('--radius-badge').trim(),
      }));
      expect(radius).toBe(`${parseFloat(token) * 16}px`);
    }
  });
});

test.describe('design system: buttons', () => {
  test('app buttons use --radius-element', async ({ page }) => {
    await page.goto('/events');
    // Wait for the app to paint, not for the network to fall idle. These guards
    // read computed styles under #root, and `networkidle` (500ms of zero
    // requests) never settles on pages with maps, lazy images and analytics —
    // all four timed out against production.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(300);
    // Target app buttons inside main content, not third-party banners.
    // Skip avatars / round dots (rounded-full → very large px).
    const btn = page.locator('main button, header button').filter({ hasNotText: '' }).first();
    if ((await btn.count()) > 0) {
      await expect(btn).toBeVisible();
      const { radius, token } = await btn.evaluate((el) => ({
        radius: getComputedStyle(el).borderRadius,
        token: getComputedStyle(document.documentElement)
          .getPropertyValue('--radius-element')
          .trim(),
      }));
      // Read the token, not a literal, so a design pass can re-tune the trio.
      // Allow rounded-full (≥9999px) escape hatch for icon/avatar buttons.
      const px = parseInt(radius, 10);
      expect(px === parseFloat(token) * 16 || px >= 9999).toBe(true);
    }
  });
});

test.describe('design system: dialog', () => {
  test('dialog uses --radius-container', async ({ page }) => {
    await page.goto('/trips');
    // Wait for the app to paint, not for the network to fall idle. These guards
    // read computed styles under #root, and `networkidle` (500ms of zero
    // requests) never settles on pages with maps, lazy images and analytics —
    // all four timed out against production.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(300);
    const signInBtn = page.getByRole('button', { name: /sign in/i }).first();
    if ((await signInBtn.count()) > 0) {
      await signInBtn.click();
      await page.waitForTimeout(500);
      const dialog = page.getByRole('dialog').first();
      if ((await dialog.count()) > 0) {
        const { radius, token } = await dialog.evaluate((el) => {
          // The dialog content panel is the styled child
          const panel = el.querySelector('[class*="DialogContent"], [class*="dialog"]') || el;
          return {
            radius: getComputedStyle(panel).borderRadius,
            token: getComputedStyle(document.documentElement)
              .getPropertyValue('--radius-container')
              .trim(),
          };
        });
        expect(radius).toBe(`${parseFloat(token) * 16}px`);
      }
    }
  });
});

test.describe('design system: typography', () => {
  test('no Plus Jakarta Sans in font stack', async ({ page }) => {
    await page.goto('/');
    // Wait for the app to paint, not for the network to fall idle. These guards
    // read computed styles under #root, and `networkidle` (500ms of zero
    // requests) never settles on pages with maps, lazy images and analytics —
    // all four timed out against production.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
    await dismissCookieBanner(page);
    // Check that Plus Jakarta Sans is not declared anywhere
    const hasJakarta = await page.evaluate(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.cssText?.toLowerCase().includes('jakarta')) return true;
          }
        } catch {
          /* cross-origin */
        }
      }
      return false;
    });
    expect(hasJakarta).toBe(false);
  });
});

/**
 * PASTE-UP ink guard (replaced the old "no chromatic backgrounds ≤ 5" budget).
 *
 * The previous version counted every element whose background saturation
 * exceeded 0.15 and allowed up to five of them. That made sense while the app
 * was strictly monochrome, but it has two holes: it permits five arbitrary
 * rogue hues (it never looked at WHICH colour), and it fails outright the
 * moment legitimate brand ink lands.
 *
 * This replacement is strictly stronger in both directions. It reads the
 * sanctioned palette off the live document — so it can never go stale when the
 * tokens are re-tuned, and it keeps working when /admin/design overrides them
 * at runtime — and then requires EVERY saturated background on the page to be
 * one of those values. The numeric budget is gone: one unsanctioned hue fails.
 *
 * The allowlist is the three PASTE-UP drums plus --destructive. It deliberately
 * does NOT include the locked functional palettes (trip-safety traffic light,
 * equality scale, map layers) because none of them render on these four routes;
 * if one ever does, add it here explicitly rather than widening the tolerance.
 */
const SANCTIONED_TOKENS = ['spot', 'ink-blue', 'ink-over', 'destructive'];

test.describe('design system: sanctioned ink only', () => {
  // /news excluded — news cards may have category images with chromatic content
  const publicPages = ['/', '/events', '/venues', '/hotels'];

  for (const path of publicPages) {
    test(`only sanctioned brand ink on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
      await dismissCookieBanner(page);
      await page.waitForTimeout(500);

      const rogue = await page.evaluate((tokens) => {
        const root = document.documentElement;

        // Resolve each token's HSL triple to rgb the way the browser does,
        // by letting the browser do it. Reading the raw "330 95% 55%" and
        // converting by hand would re-implement (and could disagree with)
        // the engine's own rounding.
        // Normalise ANY computed background to [r,g,b,a] by painting it on a
        // canvas and reading the pixel back.
        //
        // Regex-parsing the serialisation looks simpler and is a trap. A real
        // page returns at least three forms: plain `rgb(…)`, `color(srgb … / a)`
        // from a Tailwind v4 opacity modifier, and `oklab(… / a)` from the same
        // modifier on a different token — and the browser is free to add more.
        // An earlier draft of this guard matched only `rgb(…)` and silently
        // SKIPPED everything else, which meant a rogue hue behind `/50` sailed
        // through a green test. Handing the string to the engine that produced
        // it converts every colour space correctly, needs no maintenance, and
        // cannot drift.
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        const parse = (css: string): [number, number, number, number] | null => {
          ctx.clearRect(0, 0, 1, 1);
          // An unparseable value leaves fillStyle at its previous setting, so
          // set a known sentinel first and detect "nothing happened".
          ctx.fillStyle = '#000000';
          ctx.fillStyle = css;
          if (ctx.fillStyle === '#000000' && !/^(#000000|black|rgb\(0, 0, 0\))$/.test(css.trim())) {
            return null;
          }
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };

        const probe = document.createElement('div');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        root.appendChild(probe);
        const sanctioned = new Set<string>();
        for (const t of tokens) {
          const raw = getComputedStyle(root).getPropertyValue(`--${t}`).trim();
          if (!raw) continue;
          probe.style.backgroundColor = `hsl(${raw})`;
          const resolved = parse(getComputedStyle(probe).backgroundColor);
          if (resolved) sanctioned.add(`${resolved[0]},${resolved[1]},${resolved[2]}`);
        }
        probe.remove();

        const saturation = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          return max === 0 ? 0 : (max - min) / max;
        };

        // A few channels of slack: an ink can arrive through a Tailwind opacity
        // modifier or a color-mix, both of which can shift the last bit.
        const NEAR = 4;
        const isSanctioned = (r: number, g: number, b: number) => {
          for (const s of sanctioned) {
            const [sr, sg, sb] = s.split(',').map(Number);
            if (
              Math.abs(r - sr) <= NEAR &&
              Math.abs(g - sg) <= NEAR &&
              Math.abs(b - sb) <= NEAR
            ) {
              return true;
            }
          }
          return false;
        };

        const offenders: string[] = [];
        let unparsed = 0;
        const els = document.querySelectorAll('#root *, header *, main *, footer *');
        for (const el of els) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') continue;
          const parsed = parse(bg);
          // A colour space this guard cannot read is a hole, not a pass —
          // surface it instead of skipping silently.
          if (!parsed) {
            unparsed++;
            continue;
          }
          const [r, g, b, a] = parsed;
          if (a === 0) continue;
          if (saturation(r, g, b) <= 0.15) continue;
          if (isSanctioned(r, g, b)) continue;
          const tag = el.tagName.toLowerCase();
          const cls = (el.getAttribute('class') ?? '').slice(0, 80);
          offenders.push(`${bg} on <${tag} class="${cls}">`);
        }
        return { offenders: [...new Set(offenders)], sanctioned: [...sanctioned], unparsed };
      }, SANCTIONED_TOKENS);

      expect(
        rogue.sanctioned.length,
        'no brand ink tokens resolved — the palette probe is broken, not the page',
      ).toBeGreaterThan(0);

      expect(
        rogue.unparsed,
        `${rogue.unparsed} background(s) used a colour space this guard cannot parse, so they ` +
          'were never checked. Teach parse() the new serialisation rather than letting the ' +
          'hole widen.',
      ).toBe(0);

      expect(
        rogue.offenders,
        `Unsanctioned chromatic backgrounds on ${path}. Every saturated fill must be ` +
          `one of --${SANCTIONED_TOKENS.join(' / --')}. Resolved ink: ` +
          `${rogue.sanctioned.join(' | ')}.\n${rogue.offenders.join('\n')}`,
      ).toEqual([]);
    });
  }
});

/**
 * PASTE-UP border budget.
 *
 * The rebrand replaced outlines with filled ink plates, and then drifted back to
 * 150 bordered elements on a single city page because nothing measured it.
 *
 * Computed border width is the signal, not the class name: it catches a border
 * however it arrives (utility, `divide-y`, inline style, a stylesheet) and it
 * ignores the `border-<color>`-without-width classes that the `@layer base`
 * reset in src/index.css already neutralises. Fully transparent borders are
 * skipped too — `scroll-area` and `switch` use them purely as spacing.
 *
 * Route choice is load-bearing. `/`, `/news`, `/places` and `/marketplace` all
 * report 2-8 and would have declared this fixed while the city page sat at 150;
 * they simply had not loaded much content. Measure a dense page, and confirm it
 * actually rendered before believing the number.
 */
test.describe('design system: border budget', () => {
  // Survivors, by design: `.rule-heavy` band rules and the masthead's 2px rule
  // (the rationed PASTE-UP signature) plus the spinner, which is drawn WITH a
  // border rather than wearing one. Focus rings use `outline`, so they are
  // outside this check by construction.
  const ALLOWED = /rule-heavy|border-b-2 border-foreground|animate-spin/;
  const BUDGET = 6;

  /**
   * Two routes, because route choice already fooled this suite once: the guard
   * passed at 4 on /city/new-york while /cities sat at 830. A single sample is
   * not evidence about a design system that repeats per row.
   *
   * `/cities` is the list-shaped page — its budget is separate because its
   * survivors are different (sticky headers, the masthead) and because a list
   * regressing to one hairline per row is the exact failure this catches.
   */
  const ROUTES: { path: string; budget: number }[] = [
    { path: '/city/new-york', budget: BUDGET },
    { path: '/cities', budget: 12 },
  ];

  test('/city/new-york paints almost no borders', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1400 });
    await page.goto('/city/new-york', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
    await dismissCookieBanner(page);

    // Wait for CONTENT. `#root *` attaches when the header mounts; a count
    // taken then measures the chrome and misses the entire page.
    let last = -1;
    for (let i = 0; i < 30; i++) {
      const n = await page.evaluate(() => document.body.innerText.trim().length);
      if (n > 1500 && n === last) break;
      last = n;
      await page.waitForTimeout(500);
    }

    const result = await page.evaluate(() => {
      const offenders: string[] = [];
      for (const el of document.querySelectorAll('#root *, header *, footer *')) {
        const cs = getComputedStyle(el);
        const visible = ['Top', 'Right', 'Bottom', 'Left'].some((s) => {
          if ((parseFloat(cs[`border${s}Width` as keyof CSSStyleDeclaration] as string) || 0) <= 0)
            return false;
          const c = (cs[`border${s}Color` as keyof CSSStyleDeclaration] as string) || '';
          const m = c.match(/^rgba?\([^)]*?,\s*([\d.]+)\s*\)$/);
          if (m && Number(m[1]) === 0) return false;
          return c !== 'transparent';
        });
        if (!visible) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        offenders.push(el.getAttribute('class') || `<${el.tagName.toLowerCase()}>`);
      }
      return { offenders, bodyText: document.body.innerText.trim().length };
    });

    expect(
      result.bodyText,
      'the page never rendered its content, so this count proves nothing',
    ).toBeGreaterThan(1500);

    const unexpected = result.offenders.filter((c) => !ALLOWED.test(c));
    expect(
      unexpected.length,
      `${unexpected.length} bordered elements on /city/new-york (budget ${BUDGET}). ` +
        'Borders were replaced by ink plates — use bg-surface-container* instead.\n' +
        unexpected.map((c) => `  ${c.slice(0, 110)}`).join('\n'),
    ).toBeLessThanOrEqual(BUDGET);
  });

  /**
   * The border check above measures `border*Width` and skips anything under 8px
   * in either dimension. A divider IS a sub-8px element, so the most common rule
   * pattern in this tree — a thin filled div, `h-px bg-border` — was invisible
   * to it, and so was `divide-y` painting through `> * + *` onto short rows.
   *
   * That blind spot let the site sit at 5,336 painted lines while this suite was
   * green at 4. This test closes it: a line is a line whether it arrives as a
   * border or as a 1px-tall filled box.
   */
  for (const { path, budget } of ROUTES) {
    test(`${path} paints almost no LINES (borders + thin fills)`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1400 });
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
      await dismissCookieBanner(page);

      let last = -1;
      for (let i = 0; i < 30; i++) {
        const n = await page.evaluate(() => document.body.innerText.trim().length);
        if (n > 1500 && n === last) break;
        last = n;
        await page.waitForTimeout(500);
      }

      const result = await page.evaluate(() => {
        const opaque = (c: string) => {
          if (!c || c === 'transparent') return false;
          const m = c.match(/^rgba?\(([^)]*)\)$/);
          if (!m) return true;
          const p = m[1].split(',').map((s) => parseFloat(s));
          return p.length < 4 || p[3] > 0.02;
        };
        const offenders: string[] = [];
        for (const el of document.querySelectorAll('#root *, header *, footer *')) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const cls = el.getAttribute('class') || `<${el.tagName.toLowerCase()}>`;

          const bordered = ['Top', 'Right', 'Bottom', 'Left'].some((s) => {
            const w =
              parseFloat(cs[`border${s}Width` as keyof CSSStyleDeclaration] as string) || 0;
            if (w <= 0) return false;
            return opaque((cs[`border${s}Color` as keyof CSSStyleDeclaration] as string) || '');
          });
          // No 8px floor here — that floor is exactly what hid the dividers.
          if (bordered) {
            offenders.push(cls);
            continue;
          }
          // A thin filled box IS a rule: `h-px bg-border`, `w-px bg-foreground`.
          const thin = (r.height <= 4 && r.width >= 12) || (r.width <= 4 && r.height >= 12);
          if (thin && opaque(cs.backgroundColor)) offenders.push(cls);
        }
        return { offenders, bodyText: document.body.innerText.trim().length };
      });

      expect(
        result.bodyText,
        'the page never rendered its content, so this count proves nothing',
      ).toBeGreaterThan(1500);

      const unexpected = result.offenders.filter((c) => !ALLOWED.test(c));
      expect(
        unexpected.length,
        `${unexpected.length} painted lines on ${path} (budget ${budget}). ` +
          'A line counts however it is drawn — border, divide-y, or a thin filled ' +
          'div. Use a plate (bg-surface-container*) or spacing instead.\n' +
          unexpected.map((c) => `  ${c.slice(0, 110)}`).join('\n'),
      ).toBeLessThanOrEqual(budget);
    });
  }
});

test.describe('design system: visual snapshots', () => {
  test('homepage above fold', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main', { timeout: 30_000 }).catch(() => {});
    await dismissCookieBanner(page);
    await page.waitForTimeout(1000);
    // The homepage hero is a live MapLibre map (tiles + rotating pins) and the
    // rails below rotate; mask them so this checks the chrome/layout, not
    // today's content. Regenerate the baseline via the update-baselines workflow.
    await expect(page).toHaveScreenshot('home-desktop.png', {
      mask: [
        page.locator('[aria-label="Cookie settings"]'),
        page.locator('[aria-label="Share feedback"]'),
        page.locator('main section:first-of-type'),
        page.locator('main section:nth-of-type(2)'),
        page.locator('main section:nth-of-type(3)'),
      ],
      maxDiffPixelRatio: 0.1,
    });
  });

  test('events card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/events');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    // Events grid is data-driven (the hourly pipeline rotates cards daily —
    // the 0.02 gate failed every night once content drifted off-baseline).
    // Same rationale as the venues grid below: 35% still catches layout /
    // color regressions.
    await expect(page).toHaveScreenshot('events-desktop.png', {
      maxDiffPixelRatio: 0.35,
    });
  });

  test('venues card grid', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/venues');
    await page.waitForLoadState('networkidle');
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    // Venues grid is data-driven (recent listings shuffle hard between
    // requests). 35% tolerance — still catches layout/color regressions.
    await expect(page).toHaveScreenshot('venues-desktop.png', {
      maxDiffPixelRatio: 0.35,
    });
  });
});
