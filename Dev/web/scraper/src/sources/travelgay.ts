import * as cheerio from 'cheerio';
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { cleanText, slugify } from '../utils/text.js';

/**
 * TravelGay connector: major gay travel directory.
 *
 * NOTE: TravelGay returns 403 on robots.txt and general fetches.
 * The site may use aggressive anti-bot protection.
 *
 * Strategy:
 * - Attempt to fetch — if blocked, log and mark as "needs manual/partnership"
 * - If accessible, parse city listing pages for venues
 * - Site structure: /destination/city-name/ -> venue listings
 *
 * robots.txt was inaccessible (403), so we treat this conservatively.
 */
export class TravelGayConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.travelgay;

  // Major cities to attempt
  private static readonly CITIES = [
    'london', 'paris', 'berlin', 'amsterdam', 'barcelona',
    'new-york', 'san-francisco', 'los-angeles', 'sydney', 'bangkok',
    'madrid', 'rome', 'lisbon', 'prague', 'vienna',
    'toronto', 'montreal', 'tokyo', 'tel-aviv', 'cape-town',
  ];

  constructor() {
    super('travelgay');
  }

  async *discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    if (entityType !== 'venue' && entityType !== 'event') return;

    // First, test if site is accessible at all
    const testResult = await this.fetch(this.config.baseUrl);
    if (testResult.blockedByRobots) {
      this.log.warn('Blocked by robots.txt');
      return;
    }
    if (testResult.status === 403 || testResult.status === 0) {
      this.log.warn(
        { status: testResult.status },
        'TravelGay returned 403 — site may require manual access or partnership. ' +
        'Marking as blocked. No pages will be scraped.',
      );
      return;
    }

    // Try to find city guide URLs
    const urls: DiscoveredUrl[] = TravelGayConnector.CITIES.map((city) => ({
      url: `${this.config.baseUrl}/destination/${city}/`,
      entityType,
    }));

    // Yield in batches of 5
    for (let i = 0; i < urls.length; i += 5) {
      yield urls.slice(i, i + 5);
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const result = await this.fetch(url);

    if (result.blockedByRobots) {
      this.log.warn({ url }, 'Blocked by robots.txt');
      return [];
    }

    if (result.status === 403) {
      this.log.warn(
        { url },
        'TravelGay returned 403 — needs manual access or official partnership',
      );
      return [];
    }

    if (result.status !== 200) {
      this.log.warn({ url, status: result.status }, 'Failed to fetch');
      return [];
    }

    return this.parseCityPage(result.body, url);
  }

  private parseCityPage(html: string, url: string): SourceRawEntity[] {
    const $ = cheerio.load(html);
    const entities: SourceRawEntity[] = [];

    // Extract city name from URL or page title
    const citySlug = url.match(/\/destination\/([^/]+)/)?.[1] || '';
    const cityName = cleanText($('h1').first().text())?.replace(/Gay Guide$/i, '').trim() ||
      citySlug.replace(/-/g, ' ');

    // Try to extract JSON-LD structured data
    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        if (data['@type'] === 'LocalBusiness' || data['@type']?.includes?.('LocalBusiness')) {
          const entity = this.parseJsonLdVenue(data, url, cityName);
          if (entity) entities.push(entity);
        }
      } catch {
        // ignore
      }
    });

    if (entities.length > 0) return entities;

    // Fallback: parse venue cards from HTML
    $('article, .venue-card, .listing-card, .venue-item, [class*="venue"]').each((_i, el) => {
      const $el = $(el);
      const name = cleanText($el.find('h2, h3, h4, .venue-name, .title').first().text());
      if (!name) return;

      const link = $el.find('a').first().attr('href');
      const fullUrl = link ? new URL(link, this.config.baseUrl).toString() : url;
      const description = cleanText($el.find('.description, .excerpt, p').first().text());
      const category = cleanText($el.find('.category, .type, .badge').first().text());
      const address = cleanText($el.find('.address, [class*="address"]').first().text());

      const img = $el.find('img').first().attr('src');
      const images = img ? [new URL(img, this.config.baseUrl).toString()] : [];

      entities.push(
        this.buildRawEntity(slugify(`travelgay-${citySlug}-${name}`), 'venue', fullUrl, {
          name,
          description,
          category,
          city: cityName,
          country: null, // Determined in normalization
          address,
          images,
          source_url: fullUrl,
        }),
      );
    });

    this.log.info({ url, count: entities.length }, 'Parsed venues from TravelGay');
    return entities;
  }

  private parseJsonLdVenue(
    data: Record<string, unknown>,
    url: string,
    city: string,
  ): SourceRawEntity | null {
    const name = cleanText(data.name as string);
    if (!name) return null;

    const address = data.address as Record<string, unknown> | string | undefined;
    let streetAddress: string | null = null;
    let locality: string | null = null;
    let country: string | null = null;

    if (typeof address === 'string') {
      streetAddress = cleanText(address);
    } else if (address) {
      streetAddress = cleanText(address.streetAddress as string) || null;
      locality = cleanText(address.addressLocality as string) || null;
      country = cleanText(address.addressCountry as string) || null;
    }

    const geo = data.geo as Record<string, unknown> | undefined;
    const lat = geo?.latitude as number | undefined;
    const lng = geo?.longitude as number | undefined;

    return this.buildRawEntity(slugify(`travelgay-${city}-${name}`), 'venue', url, {
      name,
      description: cleanText(data.description as string) || null,
      category: null,
      city: locality || city,
      country,
      address: streetAddress,
      geo: lat && lng ? { lat, lng } : null,
      website: (data.url as string) || null,
      phone: (data.telephone as string) || null,
      source_url: url,
    });
  }
}
