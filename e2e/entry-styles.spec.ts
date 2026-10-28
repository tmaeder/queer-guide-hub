import { test, expect } from '@playwright/test';

// The document must already be styled before the application can execute.
// On Pages this also verifies that the existing nonce middleware admits the
// inlined stylesheet; the built Vite preview exercises the same CSS output.
test.use({
  javaScriptEnabled: false,
  storageState: { cookies: [], origins: [] },
  serviceWorkers: 'block',
});

for (const route of ['/', '/news', '/de']) {
  test(`document styles work without application JavaScript on ${route}`, async ({ page }) => {
    const failedAssets: string[] = [];
    const stylesheets: string[] = [];
    const styleErrors: string[] = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && /\/(?:assets|fonts)\//.test(response.url()))
        failedAssets.push(response.url());
    });
    page.on('request', (request) => {
      if (request.resourceType() === 'stylesheet') stylesheets.push(request.url());
    });
    page.on('console', (message) => {
      if (/Refused to apply.*style/i.test(message.text())) styleErrors.push(message.text());
    });
    await page.goto(route);
    await expect(page.locator('style[data-inlined-entry-css]')).toHaveCount(1);
    await expect(page.locator('body')).toHaveCSS('font-family', /Space Grotesk/);
    expect(stylesheets.filter((url) => /\/assets\/css\/index-[^/]+\.css/.test(url))).toEqual([]);
    expect(failedAssets).toEqual([]);
    expect(styleErrors).toEqual([]);
  });
}
