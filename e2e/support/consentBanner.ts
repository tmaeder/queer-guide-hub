import { expect, type Page } from '@playwright/test';

/**
 * Dismiss the cookie-consent banner.
 *
 * It is fixed to the bottom at `z-sticky` and overlaps the mobile bottom nav on
 * a first visit, where it INTERCEPTS TAPS rather than merely sitting near them.
 * The failure mode is a `locator.click` that simply times out on a tab which is
 * present, visible and correctly addressed — measured: three cases in
 * `a11y-mobile-chrome.spec.ts` timed out at 120s each against prod on a dock
 * whose Explore tab was right there in the DOM with the expected href.
 *
 * `e2e/consent-bar-clearance.spec.ts` guards the clearance this is working
 * around; this helper is for specs that need to drive the bar regardless.
 *
 * No-op once consent is stored, or if the banner never renders.
 *
 * Extracted from `mobile-bottom-nav.spec.ts`, which had it as a local function.
 * It is shared rather than copied because a second copy of a workaround drifts
 * from the first, and the thing it works around is load-bearing for every spec
 * that touches the dock.
 */
export async function dismissCookieBanner(page: Page) {
  const banner = page.getByRole('region', { name: /cookie settings/i });
  // The banner animates in after consent state loads — a bare isVisible()
  // check races it and leaves it covering the bottom bar. Give it a moment.
  const appeared = await banner
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await banner
    .getByRole('button', { name: /necessary only|accept all/i })
    .first()
    .click();
  await expect(banner)
    .toBeHidden()
    .catch(() => {});
}
