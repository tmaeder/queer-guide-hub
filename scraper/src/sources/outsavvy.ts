import * as cheerio from 'cheerio';
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { parseDate, inferTimezone } from '../utils/dates.js';
import { cleanText, slugify, stripHtml } from '../utils/text.js';

/**
 * Outsavvy connector: LGBTQ+ events platform.
 *
 * robots.txt allows everything except /profile/.
 * Has a sitemap at /sitemap.xml with /event/ID/slug URLs.
 * Pages are server-rendered — Cheerio is sufficient.
 *
 * Strategy:
 * 1. Parse sitemap for event URLs
 * 2. Fetch each event detail page
 * 3. Extract JSON-LD structured data if available, else parse HTML
 */
export class OutsavvyConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.outsavvy;

  constructor() {
    super('outsavvy');
  }

  async *discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    if (entityType !== 'event') return;

    // Parse sitemap to find event URLs
    const sitemapResult = await this.fetch(this.config.sitemapUrl!);
    if (sitemapResult.blockedByRobots || sitemapResult.status !== 200) {
      this.log.warn('Cannot fetch sitemap');
      return;
    }

    const $ = cheerio.load(sitemapResult.body, { xml: true });
    const eventUrls: DiscoveredUrl[] = [];

    $('url > loc').each((_i, el) => {
      const loc = $(el).text().trim();
      if (loc.includes('/event/')) {
        eventUrls.push({ url: loc, entityType: 'event' });
      }
    });

    this.log.info({ count: eventUrls.length }, 'Discovered event URLs from sitemap');

    // Yield in batches of 20
    const batchSize = 20;
    for (let i = 0; i < eventUrls.length; i += batchSize) {
      yield eventUrls.slice(i, i + batchSize);
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const result = await this.fetch(url);
    if (result.blockedByRobots) {
      this.log.warn({ url }, 'Blocked by robots.txt');
      return [];
    }
    if (result.status !== 200) {
      this.log.warn({ url, status: result.status }, 'Failed to fetch event page');
      return [];
    }

    return this.parseEventPage(result.body, url);
  }

  private parseEventPage(html: string, url: string): SourceRawEntity[] {
    const $ = cheerio.load(html);

    // Try JSON-LD first
    const jsonLd = this.extractJsonLd($);
    if (jsonLd) {
      const entity = this.parseJsonLdEvent(jsonLd, url);
      if (entity) return [entity];
    }

    // Fallback to HTML parsing
    return this.parseHtmlEvent($, url);
  }

  private extractJsonLd($: cheerio.CheerioAPI): Record<string, unknown> | null {
    let result: Record<string, unknown> | null = null;

    const isEvent = (d: Record<string, unknown> | null | undefined): boolean => {
      if (!d) return false;
      const t = (d as { '@type'?: unknown })['@type'];
      if (t === 'Event') return true;
      if (typeof t === 'string' && t.includes('Event')) return true;
      if (Array.isArray(t) && t.some((x) => typeof x === 'string' && x.includes('Event'))) return true;
      return false;
    };

    $('script[type="application/ld+json"]').each((_i, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        // Sites commonly wrap multiple entities in @graph; walk it.
        const candidates: Array<Record<string, unknown>> = Array.isArray(data)
          ? data
          : data['@graph'] && Array.isArray(data['@graph'])
            ? data['@graph']
            : [data];
        for (const c of candidates) {
          if (isEvent(c)) {
            result = c;
            return;
          }
        }
      } catch {
        // ignore invalid JSON
      }
    });
    return result;
  }

  private parseJsonLdEvent(data: Record<string, unknown>, url: string): SourceRawEntity | null {
    const name = cleanText(data.name as string);
    if (!name) return null;

    const startDate = parseDate(data.startDate as string);
    if (!startDate) return null;

    const endDate = parseDate(data.endDate as string);
    const description = cleanText(stripHtml(data.description as string || ''));

    const location = data.location as Record<string, unknown> | undefined;
    let city: string | null = null;
    let country: string | null = null;
    let address: string | null = null;
    let venueName: string | null = null;

    if (location) {
      venueName = cleanText(location.name as string) || null;
      const locAddress = location.address as Record<string, unknown> | string | undefined;
      if (typeof locAddress === 'string') {
        address = cleanText(locAddress);
      } else if (locAddress) {
        city = cleanText(locAddress.addressLocality as string) || null;
        country = cleanText(locAddress.addressCountry as string) || null;
        address = cleanText(locAddress.streetAddress as string) || null;
      }
    }

    const geo = (data.location as Record<string, unknown>)?.geo as Record<string, unknown> | undefined;
    const lat = geo?.latitude as number | undefined;
    const lng = geo?.longitude as number | undefined;

    const image = data.image as string | string[] | undefined;
    const images = Array.isArray(image) ? image : image ? [image] : [];

    const offers = data.offers as Record<string, unknown> | Record<string, unknown>[] | undefined;
    let ticketUrl: string | null = null;
    let priceRange: string | null = null;
    if (Array.isArray(offers) && offers.length > 0) {
      ticketUrl = (offers[0].url as string) || null;
      priceRange = (offers[0].price as string) || null;
    } else if (offers && typeof offers === 'object' && !Array.isArray(offers)) {
      ticketUrl = ((offers as Record<string, unknown>).url as string) || null;
      priceRange = ((offers as Record<string, unknown>).price as string) || null;
    }

    const sourceId = this.extractEventId(url);

    return this.buildRawEntity(sourceId, 'event', url, {
      name,
      description,
      category: null,
      tags: [],
      city,
      country,
      address,
      venue_name: venueName,
      geo: lat && lng ? { lat, lng } : null,
      start_datetime: startDate.toISOString(),
      end_datetime: endDate?.toISOString() || null,
      timezone: inferTimezone(city, country),
      ticket_url: ticketUrl || url,
      website: url,
      price_range: priceRange,
      images,
      source_url: url,
    });
  }

  private parseHtmlEvent($: cheerio.CheerioAPI, url: string): SourceRawEntity[] {
    const name = cleanText($('h1').first().text());
    if (!name) return [];

    const dateText = cleanText($('.event-date, [class*="date"], time').first().text());
    const startDate = parseDate(dateText);
    if (!startDate) {
      this.log.warn({ url, dateText }, 'Could not parse event date');
      return [];
    }

    const description = cleanText($('.event-description, [class*="description"], .content').first().text());
    const locationText = cleanText($('.event-location, [class*="location"], .venue').first().text());

    // Attempt to extract city/country from location text (format varies).
    let city: string | null = null;
    let country: string | null = null;
    if (locationText) {
      const parts = locationText.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 1) city = parts[0];
      if (parts.length >= 2) country = parts[parts.length - 1];
    }

    const sourceId = this.extractEventId(url);

    return [
      this.buildRawEntity(sourceId, 'event', url, {
        name,
        description,
        city,
        country,
        address: locationText,
        start_datetime: startDate.toISOString(),
        // Infer timezone from the parsed location; falls back to UTC when unknown.
        // Don't assume Europe/London — Outsavvy has expanded beyond UK.
        timezone: inferTimezone(city, country),
        ticket_url: url,
        website: url,
        source_url: url,
      }),
    ];
  }

  private extractEventId(url: string): string {
    const match = url.match(/\/event\/(\d+)\//);
    return match ? `outsavvy-${match[1]}` : slugify(url);
  }
}
