import type { Page } from '@playwright/test';

/**
 * Wait until the app is actually ready to be asserted against.
 *
 * **Do not use `waitForLoadState('networkidle')` for this.** It never settles
 * against production: the SPA holds persistent Supabase realtime connections,
 * analytics beacons fire on a timer, and map-bearing routes stream tiles
 * continuously. `waitForLoadState` has no default timeout, so it hangs until the
 * whole test times out — and a `.catch(() => {})` does NOT save you, because the
 * time is still consumed. That is the single largest source of flake in this
 * suite (it fails a different subset of a11y specs on every run).
 *
 * The a11y and focus specs originally reached for `networkidle` because they
 * need *stylesheets applied* before sampling computed colour. This waits for the
 * three things that actually guarantee that, and nothing else:
 *
 *  1. the React app has mounted (`#root` has children),
 *  2. webfonts have settled (`document.fonts.ready`) — text metrics are stable,
 *  3. the theme's CSS custom properties have resolved on `:root`.
 *
 * (3) is the load-bearing one for axe. If it samples before the theme stylesheet
 * applies, it reads fallback greys and reports bogus contrast failures — ratios
 * around 1.0–1.4 that match no real token (the shipped `--muted-foreground` is
 * `0 0% 35%`, roughly 7:1). This is strictly a stronger guarantee than
 * `networkidle`, which could fire before the stylesheet had applied at all.
 */
export async function waitForAppReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
    undefined,
    { timeout },
  );

  // Non-fatal: a font that never resolves should not fail an a11y assertion.
  await page.evaluate(() => document.fonts.ready).catch(() => {});

  await page
    .waitForFunction(
      () =>
        getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() !== '',
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});

  // 4. Late-mounting overlay chrome has finished arriving and is fully opaque.
  //
  // The cookie banner, feedback FAB and install prompt are lazy chunks mounted
  // by LayoutShell AFTER first paint, so (1)–(3) can all be satisfied while
  // they are still on their way in. axe then samples a half-mounted element and
  // blends its transient opacity into the computed colour.
  //
  // That is not hypothetical: PR #2522 failed on `/events` with the cookie
  // banner's "Accept All" button reported at 1.29:1, foreground #ffffff on
  // #e2e2e2 — and again at 4.35:1 on #797979. Neither grey is a token in this
  // system. They are `--foreground` (#0a0a0a) composited over white at ~11% and
  // ~53% opacity: two frames of the same fade. The banner already honours
  // prefers-reduced-motion, and the spec already sets `reducedMotion: 'reduce'`,
  // so the fade was not the issue — the element simply had not settled when axe
  // read it.
  //
  // Waiting for it to settle makes the sample deterministic without excluding
  // the banner from coverage, which is what dismissing it would have cost.
  //
  // Two steps, because checking opacity alone has a hole: if the lazy chunk has
  // not mounted yet the selector matches nothing, the check passes trivially,
  // and axe races the mount exactly as before. So first give the chunk a bounded
  // window to appear, THEN require it to be opaque.
  await page
    .waitForSelector('[aria-label="Cookie settings"]', { state: 'attached', timeout: 5_000 })
    .catch(() => {
      /* consent already stored, or the chunk failed — nothing to settle */
    });

  await page
    .waitForFunction(
      () => {
        const overlays = document.querySelectorAll<HTMLElement>(
          '[aria-label="Cookie settings"], [aria-label="Share feedback"]',
        );
        return [...overlays].every((el) => {
          const o = Number(getComputedStyle(el).opacity);
          return Number.isNaN(o) || o === 0 || o === 1;
        });
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});
}

/** `goto` + {@link waitForAppReady}, the combination almost every spec wants. */
export async function gotoReady(page: Page, path: string, timeout = 30_000): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, timeout);
}
