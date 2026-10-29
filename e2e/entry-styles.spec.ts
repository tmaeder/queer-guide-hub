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

test.describe('stylesheet reuse after app startup', () => {
  test.use({ javaScriptEnabled: true, viewport: { width: 412, height: 844 } });

  test('entry CSS is not fetched again when deferred content and the news route load', async ({
    page,
  }) => {
    const entryStylesheets: string[] = [];
    let documents = 0;
    page.on('request', (request) => {
      if (
        request.resourceType() === 'stylesheet' &&
        /\/assets\/css\/index-[^/]+\.css/.test(request.url())
      )
        entryStylesheets.push(request.url());
      if (request.resourceType() === 'document') documents++;
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No straight lines here.');
    await page
      .locator('.subway-hero')
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY));
    await expect(
      page.getByRole('heading', { name: 'No ads. No data sales. Just riders.' }),
    ).toBeVisible({ timeout: 20000 });
    const newsLink = page.locator('a[href="/news"]').first();
    // The news band is itself deferred; scrolling only as far as Support
    // cannot mount a link farther down the homepage.
    for (let step = 0; step < 12 && (await newsLink.count()) === 0; step++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(200);
    }
    await newsLink.click({ timeout: 20000 });
    await expect(page).toHaveURL(/\/news$/);
    await expect(page.getByRole('heading', { level: 1, name: 'News.' })).toBeVisible();
    expect(documents).toBe(1);
    expect(entryStylesheets).toEqual([]);
  });
  test('public introduction stays usable while the application graph is pending', async ({
    page,
    baseURL,
  }) => {
    test.skip(
      Boolean(baseURL && new URL(baseURL).hostname === '127.0.0.1'),
      'Static Vite preview has no Pages introductory content',
    );
    let release!: () => void;
    let requested = false;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(/\/assets\/js\/app-bootstrap-[^/]+\.js$/, async (route) => {
      requested = true;
      await gate;
      await route.continue();
    });
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requested).toBe(true);
      const introduction = page.locator('main[data-prerendered]');
      await expect(introduction.getByRole('heading', { level: 1 })).toHaveText(
        'Queer Guide — the global guide to LGBTQ+ life',
      );
      await expect(introduction.getByText(/Find a bar in a city/)).toBeVisible();
      await expect(
        introduction.getByRole('link', { name: 'Read curated LGBTQ+ news' }),
      ).toHaveAttribute('href', '/news');
      release();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('No straight lines here.');
    } finally {
      release();
    }
  });
  for (const path of ['/cities', '/de/cities']) {
    test(`cities route keeps its footer below the viewport while code is pending on ${path}`, async ({
      page,
    }) => {
      let release!: () => void;
      let requested = false;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(/\/assets\/js\/Cities-[^/]+\.js$/, async (route) => {
        requested = true;
        await gate;
        await route.continue();
      });
      try {
        await page.goto(path, { waitUntil: 'domcontentloaded' });
        await expect.poll(() => requested).toBe(true);
        const footer = page.locator('[data-site-footer]');
        await expect(footer).toBeAttached();
        const bounds = await footer.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y).toBeGreaterThanOrEqual(page.viewportSize()!.height);
        release();
        await expect(page.locator('main#main-content h1')).toBeVisible();
      } finally {
        release();
      }
    });
  }
});
