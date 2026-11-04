import { test, expect } from '@playwright/test';

// External links go through a confirmation dialog ("Open another website?").
// The regression this guards: the dialog opened, but "Open website" went
// nowhere. The continue anchor closes the dialog on click, React re-renders
// synchronously inside that click dispatch, and clearing the destination there
// removed the anchor's href before the browser followed it. jsdom does not
// reproduce that timing, so this has to be a real-browser check.
//
// /help is used because its crisis links are external, stable, and target
// _blank. The destination host is stubbed so the test needs no third-party site.

test.describe('@smoke external link notice', () => {
  test('"Open website" actually opens the destination', async ({ page, context }) => {
    await page.goto('/help');
    const origin = new URL(page.url()).origin;

    // Positive control: the page must offer an external link at all, or the
    // assertions below say nothing.
    const external = page.locator(`a[href^="http"]:not([href^="${origin}"])[target="_blank"]`);
    await expect(external.first()).toBeVisible({ timeout: 15_000 });
    const href = await external.first().getAttribute('href');
    expect(href).toBeTruthy();
    const destination = new URL(href!);
    await context.route(
      (url) => url.host === destination.host,
      (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }),
    );

    await external.first().click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(destination.hostname);

    const popupPromise = context.waitForEvent('page', { timeout: 10_000 });
    await dialog.getByRole('link', { name: /open website/i }).click();
    const popup = await popupPromise;
    expect(popup.url()).toBe(destination.href);
    await expect(dialog).toBeHidden();
  });
});
