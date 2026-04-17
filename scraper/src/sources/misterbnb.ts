import * as cheerio from 'cheerio';
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { cleanText, slugify } from '../utils/text.js';
import { launchBrowser, navigateAndWait, type BrowserSession } from '../utils/browser.js';
import { sleep } from '../utils/fetch.js';

/**
 * MisterBnB connector: LGBTQ+ friendly accommodation.
 *
 * robots.txt blocks /api/, /admin/, /account/, /users/, /payment/ and
 * URLs with certain query params (utm_source, guests, from, keywords, etc.)
 * but allows public listing pages.
 *
 * The site is JS-heavy — requires Playwright for rendering.
 *
 * CAUTION: MisterBnB may employ anti-bot protection. If we get blocked,
 * we log "needs manual or official partnership" and stop gracefully.
 *
 * We focus on their "gay guide" / destination pages which list
 * LGBTQ+ friendly accommodations by city.
 */
export class MisterBnBConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.misterbnb;
  private session: BrowserSession | null = null;

  private static readonly DESTINATIONS = [
    'london', 'paris', 'berlin', 'amsterdam', 'barcelona',
    'new-york', 'san-francisco', 'los-angeles', 'miami',
    'toronto', 'montreal', 'sydney', 'melbourne',
    'madrid', 'lisbon', 'rome', 'prague', 'bangkok',
    'tel-aviv', 'buenos-aires',
  ];

  constructor() {
    super('misterbnb');
  }

  async *discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    if (entityType !== 'stay') return;

    // Test accessibility first — MisterBnB may block bots
    const testResult = await this.fetch(`${this.config.baseUrl}/`);
    if (testResult.blockedByRobots) {
      this.log.warn('Blocked by robots.txt');
      return;
    }

    if (testResult.status === 403 || testResult.status === 0) {
      this.log.warn(
        { status: testResult.status },
        'MisterBnB returned 403 — site likely requires manual access or official partnership. ' +
        'No pages will be scraped.',
      );
      return;
    }

    // Check for CAPTCHA/login wall in response body
    if (this.detectBlock(testResult.body)) {
      this.log.warn('MisterBnB requires login or has CAPTCHA — needs manual or official partnership');
      return;
    }

    // Try sitemap first
    const sitemapUrls = await this.parseSitemap();
    if (sitemapUrls.length > 0) {
      for (let i = 0; i < sitemapUrls.length; i += 10) {
        yield sitemapUrls.slice(i, i + 10);
      }
      return;
    }

    // Fallback: construct destination URLs
    const urls: DiscoveredUrl[] = MisterBnBConnector.DESTINATIONS.map((city) => ({
      url: `${this.config.baseUrl}/s/${city}`,
      entityType: 'stay' as EntityType,
    }));

    for (let i = 0; i < urls.length; i += 5) {
      yield urls.slice(i, i + 5);
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    // Use browser since the site is JS-heavy
    try {
      if (!this.session) {
        this.session = await launchBrowser(this.config.userAgent);
      }

      const { page } = this.session;
      await navigateAndWait(page, url, { timeout: 30_000 });

      // Check for blocks after navigation
      const content = await page.content();
      if (this.detectBlock(content)) {
        this.log.warn({ url }, 'MisterBnB requires login/CAPTCHA — needs manual or official partnership');
        return [];
      }

      // Wait for listings to render
      await sleep(3000);

      return await this.extractListings(page, url);
    } catch (err) {
      this.log.error({ url, err }, 'Failed to fetch MisterBnB page');
      return [];
    }
  }

  private async parseSitemap(): Promise<DiscoveredUrl[]> {
    try {
      const result = await this.fetch(this.config.sitemapUrl!);
      if (result.status !== 200) return [];

      const $ = cheerio.load(result.body, { xml: true });
      const urls: DiscoveredUrl[] = [];

      // Look for listing URLs (not blocked paths)
      $('url > loc').each((_i, el) => {
        const loc = $(el).text().trim();
        // Only include public listing/destination pages
        if (
          loc.includes('/s/') ||
          loc.includes('/places/') ||
          loc.includes('/gay-accommodation/')
        ) {
          // Skip disallowed paths
          const pathname = new URL(loc).pathname;
          const isBlocked = this.config.disallowedPaths.some((p) => pathname.startsWith(p));
          if (!isBlocked) {
            urls.push({ url: loc, entityType: 'stay' });
          }
        }
      });

      this.log.info({ count: urls.length }, 'Found stay URLs in sitemap');
      return urls;
    } catch {
      return [];
    }
  }

  private detectBlock(html: string): boolean {
    const lowerHtml = html.toLowerCase();
    return (
      lowerHtml.includes('captcha') ||
      lowerHtml.includes('verify you are human') ||
      lowerHtml.includes('access denied') ||
      lowerHtml.includes('please sign in') ||
      (lowerHtml.includes('login') && lowerHtml.includes('required'))
    );
  }

  private async extractListings(
    page: import('playwright').Page,
    sourceUrl: string,
  ): Promise<SourceRawEntity[]> {
    const listings = await page.evaluate(() => {
      const items: Array<Record<string, string | null>> = [];

      document.querySelectorAll('[class*="listing"], [class*="property"], article, .card').forEach((el) => {
        const name = el.querySelector('h2, h3, h4, [class*="title"]')?.textContent?.trim();
        if (!name) return;

        const link = el.querySelector('a')?.getAttribute('href');
        const location = el.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim();
        const price = el.querySelector('[class*="price"]')?.textContent?.trim();
        const img = el.querySelector('img')?.getAttribute('src');

        items.push({ name, link: link || null, location: location || null, price: price || null, img: img || null });
      });

      return items;
    });

    // Extract city from the URL
    const citySlug = sourceUrl.match(/\/s\/([^/?]+)/)?.[1] || '';
    const cityName = citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    return listings
      .map((listing) => {
        if (!listing.name) return null;

        const fullUrl = listing.link
          ? new URL(listing.link, this.config.baseUrl).toString()
          : sourceUrl;

        return this.buildRawEntity(slugify(`misterbnb-${citySlug}-${listing.name}`), 'stay', fullUrl, {
          name: listing.name,
          city: cityName,
          country: null,
          address: listing.location,
          price_range: listing.price,
          images: listing.img ? [listing.img] : [],
          website: fullUrl,
          source_url: fullUrl,
        });
      })
      .filter(Boolean) as SourceRawEntity[];
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }
}
