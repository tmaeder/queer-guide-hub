import { test, expect, type Page } from '@playwright/test';

// Every picture on the public site is served from R2 (img.queer.guide) — never
// hotlinked from a publisher, merchant or storage CDN.
//
// Three layers make that true, and this spec checks the outcome rather than
// any one of them: src/lib/r2ImageGuard.ts rewrites external URLs to the
// image-cdn pull-through before they load, the CSP `img-src` refuses anything
// the guard misses, and the bulk copy (scripts/data-quality/warm-r2-images.mjs)
// has already put the images into R2 so they render on first view.
//
// Per page it asserts: (1) at least one image request happened — a page that
// loaded nothing would pass every other check; (2) every image request went to
// img.queer.guide or the site itself; (3) no image was blocked by the CSP;
// (4) every image the page finished loading actually decoded.

const ALLOWED_HOSTS = new Set(['img.queer.guide', 'queer.guide', 'www.queer.guide']);

const PAGES = ['/', '/news', '/events', '/marketplace', '/personalities', '/city/berlin', '/venues'];

async function collect(page: Page, path: string) {
  const imageHosts: string[] = [];
  page.on('request', (req) => {
    if (req.resourceType() === 'image') imageHosts.push(new URL(req.url()).host);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __imgViolations: string[] };
    w.__imgViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      if (e.effectiveDirective.startsWith('img')) w.__imgViolations.push(e.blockedURI);
    });
  });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(2_500);
  return page.evaluate((hosts) => {
    const w = window as unknown as { __imgViolations: string[]; __r2ImageGuard?: boolean };
    const imgs = [...document.images].filter((i) => i.currentSrc && i.complete);
    return {
      hosts,
      guard: Boolean(w.__r2ImageGuard),
      violations: w.__imgViolations,
      undecoded: imgs.filter((i) => i.naturalWidth === 0).map((i) => i.currentSrc),
      decoded: imgs.filter((i) => i.naturalWidth > 0).length,
    };
  }, imageHosts);
}

test.describe('images load only from R2', () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      const r = await collect(page, path);
      expect(r.guard, 'the image guard must be installed').toBe(true);
      expect(r.hosts.length, 'the page must request images at all').toBeGreaterThan(0);
      expect(r.hosts.filter((h) => !ALLOWED_HOSTS.has(h)), 'image requests to external hosts').toEqual([]);
      expect(r.violations, 'images blocked by CSP img-src').toEqual([]);
      expect(r.decoded, 'at least one image must render').toBeGreaterThan(0);
      // An image whose source is gone renders the component's fallback; the
      // fallback swap removes the broken <img>, so none may be left undecoded.
      expect(r.undecoded, 'images left broken on the page').toEqual([]);
    });
  }

  test('crawler og:image points at R2', async ({ request }) => {
    const res = await request.get('/news', { headers: { 'User-Agent': 'Googlebot/2.1' } });
    const html = await res.text();
    const og = html.match(/<meta property="og:image" content="([^"]+)"/g)?.pop() ?? '';
    const url = og.replace(/.*content="/, '').replace(/"$/, '');
    expect(new URL(url).host).toMatch(/^(img\.)?queer\.guide$/);
  });

  test('img-src is locked to R2 plus our own storage', async ({ request }) => {
    const res = await request.get('/news');
    const csp = res.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("img-src 'self' data: blob: https://img.queer.guide https://xqeacpakadqfxjxjcewc.supabase.co;");
  });
});
