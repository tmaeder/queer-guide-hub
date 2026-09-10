import type { Page } from '@playwright/test';

/**
 * Emulate `prefers-reduced-motion: reduce` for a spec file.
 *
 * **Use this instead of `test.use({ reducedMotion: 'reduce' })`, which is a
 * silent no-op.** `@playwright/test` 1.62.1 ships no `reducedMotion` test
 * option: `playwright/lib/index.js` declares fixtures for `colorScheme`,
 * `viewport`, `locale` and the rest, but the word `reducedMotion` does not
 * appear in that file at all, and `types/test.d.ts` mentions it only in prose.
 * The key is accepted and dropped — measured, not inferred:
 * `test.use({ reducedMotion: 'reduce', colorScheme: 'dark', viewport: … })`
 * yields `matchMedia('(prefers-reduced-motion: reduce)').matches === false`
 * while the colour scheme and viewport both apply. Nothing catches it, because
 * `e2e/` is outside `tsconfig.app.json` (`"include": ["src"]`), so the unknown
 * key is never type-checked either.
 *
 * `contextOptions` is spread verbatim into `browser.newContext()`, and the
 * *context* option still exists — so routing it through there works.
 *
 * What the dead guard cost: `/venues` failed `a11y-public-routes` 4 runs in 6
 * with axe contrast violations whose colours match no token in the system
 * (`#787878`, `#7a7a79`, `#8d8d8b` — the shipped `--muted-foreground` is
 * `#545454`, ~7:1 on paper). They are `--muted-foreground` composited at ~62-77%
 * over its own surface: axe sampled text whose ancestor was mid-fade, because
 * `.img-lazy-fade`'s opacity transition and the `animate-pulse` skeletons were
 * still running. `src/index.css` kills both under `prefers-reduced-motion`
 * (`animation-duration: .01ms !important`) — the stylesheet was fine, the
 * emulation never happened.
 */
export const REDUCED_MOTION = { contextOptions: { reducedMotion: 'reduce' as const } };

/**
 * Fail loudly if the emulation above is not actually in effect.
 *
 * The whole defect this guards against was silent: a spec declared reduced
 * motion, got none, and paid for it in contrast flake that looked like a design
 * bug. Assert the media query rather than trusting the declaration.
 */
export async function assertReducedMotion(page: Page): Promise<void> {
  const active = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  if (!active) {
    throw new Error(
      'prefers-reduced-motion is NOT emulated. Use `test.use(REDUCED_MOTION)` from ' +
        'e2e/support/reducedMotion.ts — `test.use({ reducedMotion })` is a no-op in Playwright 1.62.',
    );
  }
}
