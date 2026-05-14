import * as cheerio from 'cheerio';
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { cleanText, slugify, stripHtml } from '../utils/text.js';
import { parseDate, inferTimezone } from '../utils/dates.js';

/**
 * Patroc connector: European gay city guides.
 *
 * robots.txt: Crawl-delay: 10, blocks SEO bots but allows general crawling
 * of /gay/ paths. Disallows /cgi-bin/, /cgi-data/.
 *
 * Structure:
 * - Homepage lists cities: patroc.com/gay/berlin/, patroc.com/gay/amsterdam/, etc.
 * - City pages have category links: hotels, bars, clubs, restaurants, etc.
 * - Category pages list venues with details
 * - Some events listed on city main pages
 *
 * Static HTML — Cheerio is sufficient.
 */
export class PatrocConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.patroc;

  /** Map of city slugs to country names */
  private static readonly CITY_COUNTRIES: Record<string, string> = {
    amsterdam: 'Netherlands',
    antwerp: 'Belgium',
    barcelona: 'Spain',
    berlin: 'Germany',
    brussels: 'Belgium',
    budapest: 'Hungary',
    cologne: 'Germany',
    copenhagen: 'Denmark',
    dusseldorf: 'Germany',
    frankfurt: 'Germany',
    'gran-canaria': 'Spain',
    hamburg: 'Germany',
    ibiza: 'Spain',
    lisbon: 'Portugal',
    london: 'United Kingdom',
    madrid: 'Spain',
    munich: 'Germany',
    mykonos: 'Greece',
    paris: 'France',
    prague: 'Czech Republic',
    rome: 'Italy',
    stockholm: 'Sweden',
    stuttgart: 'Germany',
    vienna: 'Austria',
    zurich: 'Switzerland',
  };

  constructor() {
    super('patroc');
  }

  async *discover(entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    if (entityType !== 'venue' && entityType !== 'event') return;

    // Fetch the homepage to get city list
    const homeResult = await this.fetch(this.config.baseUrl);
    if (homeResult.blockedByRobots || homeResult.status !== 200) {
      this.log.warn({ status: homeResult.status }, 'Cannot fetch Patroc homepage');
      return;
    }

    const $ = cheerio.load(homeResult.body);
    const cityUrls: DiscoveredUrl[] = [];

    $('a[href*="/gay/"]').each((_i, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const fullUrl = new URL(href, this.config.baseUrl).toString();
      // Only include /gay/city/ paths, not deep links
      if (/\/gay\/[a-z-]+\/?$/.test(new URL(fullUrl).pathname)) {
        cityUrls.push({ url: fullUrl, entityType });
      }
    });

    this.log.info({ count: cityUrls.length }, 'Discovered city URLs');

    // Yield city URLs in batches of 5
    for (let i = 0; i < cityUrls.length; i += 5) {
      yield cityUrls.slice(i, i + 5);
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const result = await this.fetch(url);
    if (result.blockedByRobots) {
      this.log.warn({ url }, 'Blocked by robots.txt');
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

    // Extract city slug and name
    const citySlug = url.match(/\/gay\/([^/]+)/)?.[1] || '';
    const cityName = citySlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const country = PatrocConnector.CITY_COUNTRIES[citySlug] || null;

    // Track names seen on this page so two venues sharing a label get distinct
    // source_ids (previously they collided on slugify(name)).
    const nameCounts = new Map<string, number>();

    // Parse inline event listings — scope to the main content area and
    // plausible event containers. The previous `$('*').each(...)` walked
    // every DOM node which is O(n²) on long pages.
    const eventScope = $('main, article, section, .content, body').first();
    eventScope.find('p, li, div').each((_i, el) => {
      const $el = $(el);
      const text = $el.text();
      if (text.length > 600) return; // skip bulk containers
      const dateMatch = text.match(/(\d{1,2}[\s./]+\w+[\s./]+\d{4}|\w+\s+\d{1,2},?\s+\d{4})/);
      if (!dateMatch) return;

      const prevHeading = $el.prevAll('h2, h3, h4, h5, strong, b').first();
      const eventName = cleanText(prevHeading.text());
      if (!eventName || eventName.length < 3) return;

      // Skip generic page/section headings — these are not real event names.
      // Without this guard the parser falls back to the page H1
      // ("Upcoming Events in <City>") whenever no proper event heading
      // precedes the dated paragraph, producing one fake event per city.
      if (/^(Upcoming Events|Events in|Gay|Hotels|Bars|Clubs|Restaurants|Cafes|Saunas|Cruising|Shopping|Map)/i.test(eventName)) return;
      if (eventName.toLowerCase() === cityName.toLowerCase()) return;

      const startDate = parseDate(dateMatch[1]);
      if (!startDate) return;

      const key = `evt-${eventName}`;
      const count = (nameCounts.get(key) ?? 0) + 1;
      nameCounts.set(key, count);

      entities.push(
        this.buildRawEntity(slugify(`patroc-${citySlug}-${eventName}-${count}`), 'event', url, {
          name: eventName,
          description: cleanText(stripHtml(text)),
          category: null,
          tags: [],
          city: cityName,
          country,
          start_datetime: startDate.toISOString(),
          timezone: inferTimezone(cityName, country),
          source_url: url,
        }),
      );
    });

    // Parse venue-like content blocks.
    // Scope to the main content area so we skip nav / footer blocks.
    const venueBlocks = eventScope.find('h3, h4, strong, b').filter((_i, el) => {
      const text = $(el).text().trim();
      return text.length > 2 && text.length < 100 && !/^(Hotels|Bars|Clubs|Restaurants|Cafes|Saunas|Events|Shopping)/i.test(text);
    });

    venueBlocks.each((_i, el) => {
      const $el = $(el);
      const name = cleanText($el.text());
      if (!name) return;

      const $parent = $el.parent();
      const description = cleanText(stripHtml($parent.text().replace(name, '').trim()));

      const addressMatch = $parent.text().match(/(\d+\s+\w+\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Str\.|Strasse|Straße|Rue|Via|Calle)[\w\s,.]*)/i);
      const address = addressMatch ? cleanText(addressMatch[1]) : null;

      const link = $parent.find('a[href^="http"]').first().attr('href');
      const website = link && !link.includes('patroc.com') ? link : null;

      if (/^(Gay|Hotels|Bars|Clubs|Restaurants|Cafes|Saunas|Events|Cruising|Map)/i.test(name)) return;

      // Disambiguate duplicate names on the same page via running count +
      // address hint. Without this two venues called e.g. "Blue Bar" on the
      // same city page map to the same source_id and clobber each other.
      const key = `ven-${name}`;
      const count = (nameCounts.get(key) ?? 0) + 1;
      nameCounts.set(key, count);
      const idSuffix = address ? slugify(address).slice(0, 20) : `n${count}`;

      entities.push(
        this.buildRawEntity(slugify(`patroc-${citySlug}-${name}-${idSuffix}`), 'venue', url, {
          name,
          description: description && description.length > 10 ? description : null,
          city: cityName,
          country,
          address,
          website,
          source_url: url,
        }),
      );
    });

    this.log.info({ url, venues: entities.filter((e) => e.entity_type === 'venue').length, events: entities.filter((e) => e.entity_type === 'event').length }, 'Parsed Patroc city page');
    return entities;
  }
}
