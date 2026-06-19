/**
 * Phase 4 — Cloudflare Browser Rendering path for JS-rendered (SPA) pages.
 *
 * deepcrawl has no headless browser, so SPAs that ship no SSR HTML defeat the
 * static fetch path. Here we render the page with the `BROWSER` binding
 * (puppeteer-core via @cloudflare/puppeteer), grab the settled DOM, and hand the
 * HTML string to the SAME cleaner the static path uses — deepcrawl never sees a
 * live browser, it only ever cleans an HTML string.
 *
 * Browser Rendering has a low per-account concurrent-session cap and per-session
 * duration limits, so this path is opt-in (render:true) and guarded by its own
 * circuit breaker (cf_browser_render) on the caller side. Not exercised by local
 * `wrangler dev` — verify against a deployed worker.
 */
import puppeteer from '@cloudflare/puppeteer';

const NAV_TIMEOUT_MS = 15_000;

export async function renderHtml(
  browserBinding: Fetcher,
  url: string,
): Promise<{ html: string; finalUrl: string }> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0', timeout: NAV_TIMEOUT_MS });
    const html = await page.content();
    const finalUrl = page.url() || url;
    await page.close();
    return { html, finalUrl };
  } finally {
    await browser.close();
  }
}
