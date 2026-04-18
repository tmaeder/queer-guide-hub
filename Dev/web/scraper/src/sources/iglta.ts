import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { launchBrowser, navigateAndWait, type BrowserSession } from '../utils/browser.js';
import { parseDate, parseDateRange, inferTimezone } from '../utils/dates.js';
import { cleanText, slugify } from '../utils/text.js';
import { sleep } from '../utils/fetch.js';

/**
 * IGLTA Pride Calendar connector.
 *
 * The pride calendar is a Vue.js app that loads events via a REST API at:
 *   /includes/rest_v2/plugins_events_events_by_date/find/
 *
 * We use Playwright to render the page and extract the API data,
 * but first attempt to call the API directly.
 *
 * robots.txt allows /events/ with Crawl-delay: 2.
 */
export class IgltaConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.iglta;
  private session: BrowserSession | null = null;

  constructor() {
    super('iglta');
  }

  async *discover(_entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    // Try the REST API with offset pagination. Rolling 2-year window so we
    // don't miss events scheduled far ahead.
    const apiUrl = `${this.config.baseUrl}/includes/rest_v2/plugins_events_events_by_date/find/`;

    const now = new Date();
    const future = new Date(now.getTime() + 730 * 24 * 60 * 60 * 1000);
    const startStr = now.toISOString().split('T')[0];
    const endStr = future.toISOString().split('T')[0];

    const PAGE_SIZE = 500;
    // Cap at 5 pages (= 2500 events) as a hard ceiling. The browser fallback
    // in fetchDetail picks up anything beyond that for a given run.
    for (let offset = 0; offset < 5 * PAGE_SIZE; offset += PAGE_SIZE) {
      yield [
        {
          url: `${apiUrl}?startDate=${startStr}&endDate=${endStr}&limit=${PAGE_SIZE}&offset=${offset}`,
          entityType: 'event' as EntityType,
          metadata: { approach: 'api', startDate: startStr, endDate: endStr, offset },
        },
      ];
    }
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    // First try direct API call
    const apiResult = await this.tryApiApproach(url);
    if (apiResult.length > 0) return apiResult;

    // Fallback: use browser to render the page and extract events
    this.log.info('API approach failed, falling back to browser');
    return this.tryBrowserApproach();
  }

  private async tryApiApproach(url: string): Promise<SourceRawEntity[]> {
    try {
      const result = await this.fetch(url);
      if (result.blockedByRobots) {
        this.log.warn('Blocked by robots.txt');
        return [];
      }
      if (result.status !== 200) {
        this.log.warn({ status: result.status }, 'API returned non-200');
        return [];
      }

      const data = JSON.parse(result.body);
      if (!Array.isArray(data)) {
        this.log.warn('API response is not an array');
        return [];
      }

      return data.map((event: Record<string, unknown>) => this.parseApiEvent(event)).filter(Boolean) as SourceRawEntity[];
    } catch (err) {
      this.log.warn({ err }, 'API approach failed');
      return [];
    }
  }

  private parseApiEvent(event: Record<string, unknown>): SourceRawEntity | null {
    const title = cleanText(event.title as string);
    if (!title) return null;

    const startDate = parseDate(event.startDate as string | undefined);
    const endDate = parseDate(event.endDate as string | undefined);
    if (!startDate) return null;

    const location = cleanText(event.location as string) || null;
    const lat = typeof event.latitude === 'number' ? event.latitude : null;
    const lng = typeof event.longitude === 'number' ? event.longitude : null;
    const eventUrl = event.url as string || null;

    const sourceId = (event.recid as string) || slugify(title);

    // Parse city/country from location string (format: "City, Country" or "City, State, Country")
    let city: string | null = null;
    let country: string | null = null;
    if (location) {
      const parts = location.split(',').map((p) => p.trim());
      city = parts[0] || null;
      country = parts[parts.length - 1] || null;
    }

    const timezone = inferTimezone(city, country);

    return this.buildRawEntity(sourceId, 'event', eventUrl || `${this.config.baseUrl}/events/pride-calendar/`, {
      name: title,
      description: cleanText(event.description as string) || null,
      category: 'Pride',
      tags: ['pride', 'lgbtq'],
      city,
      country,
      address: location,
      geo: lat && lng ? { lat, lng } : null,
      start_datetime: startDate.toISOString(),
      end_datetime: endDate?.toISOString() || null,
      timezone,
      website: eventUrl,
      images: event.media_raw ? [event.media_raw as string] : [],
      source_url: `${this.config.baseUrl}/events/pride-calendar/`,
    });
  }

  private async tryBrowserApproach(): Promise<SourceRawEntity[]> {
    try {
      this.session = await launchBrowser(this.config.userAgent);
      const { page } = this.session;

      await navigateAndWait(page, `${this.config.baseUrl}/events/pride-calendar/`, {
        timeout: 45_000,
      });

      // Wait for the event list to render
      await sleep(3000);

      // Try clicking "Load More" / pagination buttons to get more events.
      // Cap at 5 attempts AND exit when the rendered list stops growing —
      // the old loop burned 30 s of fixed waits even when the button had
      // no effect (infinite but inert "Load More").
      const MAX_LOAD_MORE = 5;
      let lastCount = 0;
      for (let attempt = 0; attempt < MAX_LOAD_MORE; attempt++) {
        const clicked = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('a, button'));
          const loadMore = btns.find(
            (b) =>
              /load\s*more|next|show\s*more|view\s*more/i.test(b.textContent?.trim() || '') ||
              b.classList.contains('next') ||
              b.getAttribute('aria-label')?.includes('next'),
          );
          if (loadMore) {
            (loadMore as HTMLElement).click();
            return true;
          }
          return false;
        });
        if (!clicked) break;
        await sleep(2000);
        const currentCount = await page.evaluate(
          () => document.querySelectorAll('.item[data-type="events"], .item[data-recid]').length,
        );
        if (currentCount <= lastCount) break;
        lastCount = currentCount;
      }

      // Also scroll to trigger any lazy loading
      for (let i = 0; i < 10; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await sleep(500);
      }

      // Extract event data from the rendered DOM
      // IGLTA uses: div.content.list > div.item[data-type="events"][data-recid]
      const currentYear = new Date().getFullYear();
      const events = await page.evaluate(
        (year) => {
          const items: Array<Record<string, string | null>> = [];

          document.querySelectorAll('.item[data-type="events"], .item[data-recid]').forEach((el) => {
            const recid = el.getAttribute('data-recid');
            const title = el.querySelector('h4, h3, .title')?.textContent?.trim() || null;
            const link = el.querySelector('a')?.getAttribute('href') || null;

            // Date: displayed as "Feb 22" — short month + day, no year
            const dateEl = el.querySelector('.date-range, .dates, .date, time, [class*="date"]');
            const shortDate = dateEl?.textContent?.trim() || null;

            // Full text may contain "Recurring daily until March 28, 2026"
            const allText = el.textContent || '';
            const untilMatch = allText.match(/until\s+(\w+\s+\d{1,2},?\s+\d{4})/i);
            const endDateStr = untilMatch ? untilMatch[1] : null;

            // Location
            const locationEl = el.querySelector('.location, .city, [class*="location"]');
            const location = locationEl?.textContent?.trim() || null;

            // Image
            const img = el.querySelector('img')?.getAttribute('src') || null;

            // Build full date string: "Feb 22" → "Feb 22, 2026"
            const fullDate = shortDate ? `${shortDate}, ${year}` : null;

            if (title) {
              items.push({
                recid,
                title,
                link,
                date: fullDate,
                endDate: endDateStr,
                location,
                img,
              });
            }
          });

          return items;
        },
        currentYear,
      );

      this.log.info({ count: events.length }, 'Extracted events from browser');

      return events
        .map((e) => {
          if (!e.title) return null;

          const startDate = parseDate(e.date);
          const endDate = parseDate(e.endDate);
          const eventUrl = e.link
            ? new URL(e.link, this.config.baseUrl).toString()
            : `${this.config.baseUrl}/events/pride-calendar/`;

          // Parse city/country from location string, stripping postal codes
          let city: string | null = null;
          let country: string | null = null;
          if (e.location) {
            const parts = e.location.split(',').map((p) => p.trim());
            // Remove parts that look like postal codes (all digits or digit+letter combos)
            const cleaned = parts.filter((p) => !/^\d{4,6}$/.test(p));
            city = cleaned[0] || null;
            country = cleaned.length > 1 ? cleaned[cleaned.length - 1] : null;
          }

          return this.buildRawEntity(e.recid || slugify(e.title), 'event', eventUrl, {
            name: e.title,
            category: 'Pride',
            tags: ['pride', 'lgbtq'],
            city,
            country,
            address: e.location,
            start_datetime: startDate?.toISOString() || null,
            end_datetime: endDate?.toISOString() || null,
            timezone: city && country ? inferTimezone(city, country) : 'UTC',
            website: eventUrl,
            images: e.img ? [e.img] : [],
            source_url: `${this.config.baseUrl}/events/pride-calendar/`,
          });
        })
        .filter(Boolean) as SourceRawEntity[];
    } catch (err) {
      this.log.error({ err }, 'Browser approach failed');
      return [];
    }
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      await this.session.close();
      this.session = null;
    }
  }
}
