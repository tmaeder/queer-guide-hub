import { test, expect } from '@playwright/test';
import { waitForAppReady } from './support/appReady';

/**
 * The positive control for `waitForAppReady`'s empty-`#root` diagnostic.
 *
 * That branch exists because the bare timeout — "React never mounted" — is
 * equally consistent with a slow lazy chunk, a module that threw, and a deploy
 * window answering a hashed `/assets/js/*.js` URL with the SPA shell at
 * `200 text/html`. The diagnostic reports the status AND content-type of every
 * script the document referenced, so those cases stop reading identically.
 *
 * Without this spec the diagnostic can become decoration and nobody would know:
 * narrow the selector (`script[type=module]`, a renamed asset dir) and the
 * listing degrades to `(none found)` while every other test still passes and
 * the message still looks informative. So this asserts the listing NAMES a real
 * chunk, not merely that the error fires.
 *
 * It reproduces the failure rather than waiting for one: aborting the app's own
 * chunks is the only way to get a deterministic empty `#root`.
 */
test('the empty-#root diagnostic names the chunks and their content-type', async ({ page }) => {
  await page.route('**/assets/js/**', (r) => r.abort());
  await page.goto('/ar/map', { waitUntil: 'domcontentloaded' });

  const message = await waitForAppReady(page, 4_000).then(
    () => null,
    (e: Error) => e.message,
  );

  expect(
    message,
    'waitForAppReady resolved — the probe did not reproduce an empty #root, so nothing below was measured',
  ).toBeTruthy();
  expect(message).toContain('#root never gained children');
  expect(message).toContain('status / content-type / url');
  // The listing must name a real app chunk. `(none found)` would satisfy a
  // check that only looked for the heading.
  expect(message, 'the script listing named no /assets/js chunk — the diagnostic is inert').toMatch(
    /\/assets\/js\/[^\s]+\.js/,
  );
});
