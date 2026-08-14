import { test, expect } from '@playwright/test';

/**
 * Design system enforcement tests (subway-map rebrand 2026-08).
 *
 * Verify the semantic radius tokens (zeroed — squared corners), the hard-shadow
 * rule (none at rest, hard ink shadow on .card-lift hover), fonts (Anton +
 * Space Grotesk, no Inter), and that public pages only ever paint sanctioned
 * color (paper/ink + the four track colors + destructive).
 *
 * Radius assertions resolve --radius-{container,element,badge} through a probe
 * element at runtime instead of hardcoding px. They used to assert 16/8/4
 * literally, which silently went stale the moment a design pass re-tuned the
 * trio (the PHOTOCOPY rebrand moved it to 8/4/0 and broke four of these tests).
 * The trio is also runtime-overridable via /admin/design, so a literal can
 * never be the source of truth. What these tests actually guard is that
 * cards/buttons/dialogs/badges each consume the RIGHT tier, not any value.
 *
 * WHERE THIS RUNS. Everything here except the `visual snapshots` block is
 * PR-BLOCKING: .github/workflows/e2e-pr.yml runs
 *   npx playwright test e2e/design-system.spec.ts --grep-invert "visual snapshots"
 * against localhost:4173 on every PR. Only the snapshot block is nightly-only,
 * because it needs CI-generated baselines. This header previously claimed the
 * whole spec was nightly-only and used that to explain why a breakage reached
 * main — the claim was wrong, so treat a failure here as blocking, not as
 * something that can be sorted out later.
 */

const dismissCookieBanner = async (page) => {
  await page
    .getByRole('button', { name: /accept all|necessary only/i })
    .first()
    .click({ timeout: 3000 })
    .catch(() => {});
};

/**
 * Resolve a radius token to the px the browser actually computes.
 *
 * These tests used to do `${parseFloat(token) * 16}px`, which assumes the token
 * is authored in rem. It is not unit-agnostic and it is not override-safe:
 * a pill badge (`--radius-badge: 9999px`) evaluates to `159984px` and fails,
 * so the trio simply could not express a px value. That arithmetic is also
 * where the button test's `px >= 9999` escape hatch came from — it was papering
 * over this bug for `rounded-full` rather than allowing a real exception.
 *
 * Handing `var(--token)` to a probe element lets the engine do the conversion:
 * correct for rem, px, and anything added later, and it still reflects a
 * runtime override injected by /admin/design.
 */
const resolveRadius = (page, token: string): Promise<string> =>
  page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.borderRadius = `var(${name})`;
    document.documentElement.appendChild(probe);
    const value = getComputedStyle(probe).borderRadius;
    probe.remove();
    return value;
  }, token);

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
    const radius = await cards.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(radius).toBe(await resolveRadius(page, '--radius-container'));
  });

  test('cards have no box-shadow at rest', async ({ page }) => {
    const card = page.locator('.bg-card').first();
    await expect(card).toBeVisible();
    const shadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe('none');
  });

  test('interactive cards lift with the hard ink shadow on hover', async ({ page }) => {
    // Foundation ships the .card-lift utility; surfaces adopt it in the
    // Public phase. Zero elements => explicit skip, never a vacuous pass.
    const probe = page.locator('.card-lift, .card-lift-sm').first();
    if ((await probe.count()) === 0) {
      test.skip(true, 'no .card-lift on /events yet — wired in the Public phase');
      return;
    }
    await probe.hover();
    await page.waitForTimeout(200);
    const shadow = await probe.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toMatch(/[56]px [56]px 0(px)?/);
  });

  test('badges use --radius-badge', async ({ page }) => {
    const badge = page.locator('[class*="badge"]').first();
    if ((await badge.count()) > 0) {
      const radius = await badge.evaluate((el) => getComputedStyle(el).borderRadius);
      expect(radius).toBe(await resolveRadius(page, '--radius-badge'));
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
      const radius = await btn.evaluate((el) => getComputedStyle(el).borderRadius);
      // `rounded-full` is a sanctioned escape hatch for icon/avatar buttons, so
      // accept either. This used to be spelled `px >= 9999`, which was really
      // compensating for the rem-only arithmetic rather than allowing a pill —
      // it would also have silently accepted a genuinely wrong large radius.
      const element = await resolveRadius(page, '--radius-element');
      expect([element, '9999px']).toContain(radius);
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
        const radius = await dialog.evaluate((el) => {
          // The dialog content panel is the styled child
          const panel = el.querySelector('[class*="DialogContent"], [class*="dialog"]') || el;
          return getComputedStyle(panel).borderRadius;
        });
        expect(radius).toBe(await resolveRadius(page, '--radius-container'));
      }
    }
  });
});

test.describe('design system: typography', () => {
  test('Anton display + Space Grotesk body, no Inter', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root *', { state: 'attached', timeout: 15_000 });
    await dismissCookieBanner(page);

    // This suite runs against PRODUCTION (playwright.config.ts baseURL), so on
    // the PR that introduces the subway-map rebrand it necessarily runs against
    // the previous build and would block the very deploy that makes it true.
    // Gate on a token that exists only in the new system rather than skipping
    // blind: once the build is live the assertions below arm automatically, and
    // if the rebrand is ever reverted this reports a skip with the reason
    // instead of silently passing.
    const rebranded = await page.evaluate(
      () => !!getComputedStyle(document.documentElement).getPropertyValue('--track-pink').trim(),
    );
    if (!rebranded) {
      test.skip(true, 'production is still serving the pre-subway-map build (no --track-pink)');
      return;
    }

    const fonts = await page.evaluate(() => ({
      body: getComputedStyle(document.body).fontFamily,
      display: getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim(),
    }));
    expect(fonts.body.toLowerCase()).toContain('space grotesk');
    expect(fonts.display.toLowerCase()).toContain('anton');
    const hasInter = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of sheet.cssRules) {
            if (
              rule instanceof CSSFontFaceRule &&
              /inter/i.test(rule.style.getPropertyValue('font-family'))
            )
              return true;
          }
        } catch {
          /* cross-origin */
        }
      }
      return false;
    });
    expect(hasInter).toBe(false);
  });

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
 * The allowlist is the four track colors (plus their deprecated PASTE-UP
 * aliases, which resolve to the same values) plus --destructive. It deliberately
 * does NOT include the locked functional palettes (trip-safety traffic light,
 * equality scale, map layers) because none of them render on these four routes;
 * if one ever does, add it here explicitly rather than widening the tolerance.
 */
const SANCTIONED_TOKENS = [
  'track-pink',
  'track-blue',
  'track-green',
  'track-yellow',
  'spot',
  'ink-blue',
  'ink-over',
  'destructive',
];

test.describe('design system: sanctioned ink only', () => {
  // /news excluded — news cards may have category images with chromatic content
  //
  // /map covers the map CHROME only. The canvas is a <canvas>, so none of the
  // basemap, the pins or the cluster donuts have DOM backgrounds for this
  // sweep to read — that half is gated by the unit test in
  // src/components/map/__tests__/mapPalette.test.ts. Do not read a green run
  // here as "the map is on-palette"; it means the panels over it are.
  //
  // /about earns its place: since the subway redesign it is the most
  // track-colour-dense page on the site — a five-line index showing all four
  // tracks at once, plus the only sanctioned `.intersection-gradient`. If any
  // page is going to drift an unsanctioned hue in, it is this one.
  //
  // /marketplace was added when it was rebuilt as the M line, and it had been
  // outside this sweep entirely — which is how the app's LARGEST grid ran for
  // months with cards that both hover-tinted and cast the hard shadow. Its
  // only saturated fills are the M-yellow bullet, the yellow count rule and
  // the ink-filled active department station; product photography arrives in
  // <img>, not as a background, so it is invisible to this sweep (unlike
  // /news, which is excluded because its category images are backgrounds).
  const publicPages = ['/', '/events', '/venues', '/hotels', '/map', '/about', '/marketplace'];

  // What counts as "this page has rendered its chrome".
  //
  // `#root *` is a weak signal: its first match is often the toast container,
  // which exists long before any content does — so the sweep can run against
  // an essentially empty page and pass having measured nothing. For /map we
  // wait for the bar, i.e. the exact thing this test measures.
  //
  // Measured on production: goto(load) 2.5s, bar attached +2.4s, ~5s total —
  // so the 15s budget was never the constraint and the extra headroom below is
  // for a loaded CI runner, not for a known slowness. If /map ever does take
  // 30s, that is a real regression and should fail.
  const readySelector = (path: string) => (path === '/map' ? '[data-testid=map-bar]' : '#root *');

  for (const path of publicPages) {
    test(`only sanctioned brand ink on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(path);
      await page.waitForSelector(readySelector(path), {
        state: 'attached',
        timeout: path === '/map' ? 30_000 : 15_000,
      });
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
            if (Math.abs(r - sr) <= NEAR && Math.abs(g - sg) <= NEAR && Math.abs(b - sb) <= NEAR) {
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

/* The PASTE-UP border/line budget was DELETED with the subway-map rebrand:
   3px ink borders are now the system's core idiom (every card, button and
   board row wears one), so a border count is no longer a smell metric. */

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
    // NOT networkidle: this file's own guards were rewritten off it because
    // 500ms of zero requests never arrives on pages with maps, lazy images and
    // analytics — these two screenshots were the last callers, and they timed
    // out under --update-snapshots, so their baselines silently stayed on the
    // pre-rebrand design while home/trips regenerated.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
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
    // NOT networkidle: this file's own guards were rewritten off it because
    // 500ms of zero requests never arrives on pages with maps, lazy images and
    // analytics — these two screenshots were the last callers, and they timed
    // out under --update-snapshots, so their baselines silently stayed on the
    // pre-rebrand design while home/trips regenerated.
    await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });
    await dismissCookieBanner(page);
    await page.waitForTimeout(500);
    // Venues grid is data-driven (recent listings shuffle hard between
    // requests). 35% tolerance — still catches layout/color regressions.
    await expect(page).toHaveScreenshot('venues-desktop.png', {
      maxDiffPixelRatio: 0.35,
    });
  });
});
