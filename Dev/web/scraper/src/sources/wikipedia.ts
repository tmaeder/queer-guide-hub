import * as cheerio from 'cheerio';
import { BaseConnector } from './base.js';
import { sourceConfigs } from '../config.js';
import type { EntityType, SourceRawEntity } from '../types/schemas.js';
import type { SourceConfig, DiscoveredUrl } from '../types/connector.js';
import { slugify, cleanText, stripHtml } from '../utils/text.js';

/**
 * Wikipedia connector: parses List_of_gay_villages article.
 *
 * Fetches the rendered article page at /wiki/ which is allowed by robots.txt.
 * Both /w/ (MediaWiki API) and /api/ (REST API) are Disallowed for all bots.
 */
export class WikipediaConnector extends BaseConnector {
  readonly config: SourceConfig = sourceConfigs.wikipedia;

  private static readonly ARTICLE = 'List_of_gay_villages';

  constructor() {
    super('wikipedia');
  }

  async *discover(_entityType: EntityType): AsyncGenerator<DiscoveredUrl[]> {
    // Fetch the rendered article page — /wiki/ is allowed by robots.txt
    yield [
      {
        url: `https://en.wikipedia.org/wiki/${WikipediaConnector.ARTICLE}`,
        entityType: 'place' as EntityType,
      },
    ];
  }

  async fetchDetail(url: string): Promise<SourceRawEntity[]> {
    const result = await this.fetch(url);
    if (result.blockedByRobots) {
      this.log.warn({ url }, 'Blocked by robots.txt');
      return [];
    }
    if (result.status !== 200) {
      this.log.error({ url, status: result.status }, 'Failed to fetch Wikipedia article');
      return [];
    }

    try {
      const html = result.body;
      if (!html || html.length < 100) {
        this.log.error('Empty or tiny response from Wikipedia');
        return [];
      }

      return this.parseArticle(html, url);
    } catch (err) {
      this.log.error({ err }, 'Failed to parse Wikipedia response');
      return [];
    }
  }

  private parseArticle(html: string, sourceUrl: string): SourceRawEntity[] {
    const $ = cheerio.load(html);
    const entities: SourceRawEntity[] = [];

    // The rendered Wikipedia article wraps headings in <div class="mw-heading">.
    // Each country is an h2, with content (tables/lists) as siblings of the div wrapper.
    // Structure: <div class="mw-heading mw-heading2"><h2>Country</h2>...</div> <table>...</table>
    let currentCountry = '';

    // Skip sections that aren't content
    const skipSections = new Set([
      'See also', 'References', 'External links', 'Notes', 'Contents', 'Sources',
    ]);

    // Walk the heading wrapper divs and their following siblings
    $('div.mw-heading').each((_i, headingDiv) => {
      const $div = $(headingDiv);
      const $h = $div.find('h2, h3, h4').first();
      if (!$h.length) return;

      const level = $h.prop('tagName')?.toLowerCase() || '';
      // Extract text without the [edit] link text
      const title = cleanText($h.clone().find('.mw-editsection').remove().end().text()) || '';

      if (skipSections.has(title)) return;

      if (level === 'h2') {
        currentCountry = title;
      }

      // Walk siblings of the wrapper div to find tables/lists
      let $next = $div.next();
      while ($next.length && !$next.is('div.mw-heading')) {
        // Parse tables (primary format for this article)
        if ($next.is('table')) {
          $next.find('tbody tr, tr').each((_j, tr) => {
            const entity = this.parseTableRow($(tr), currentCountry, '', sourceUrl);
            if (entity) entities.push(entity);
          });
        }

        // Parse list items (fallback for some sections)
        if ($next.is('ul')) {
          $next.find('> li').each((_j, li) => {
            const entity = this.parseListItem($(li), currentCountry, '', sourceUrl);
            if (entity) entities.push(entity);
          });
        }

        $next = $next.next();
      }
    });

    this.log.info({ count: entities.length }, 'Parsed gay villages from Wikipedia');
    return entities;
  }

  private parseListItem(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $li: cheerio.Cheerio<any>,
    country: string,
    region: string,
    sourceUrl: string,
  ): SourceRawEntity | null {
    const text = $li.text().trim();
    if (!text || text.length < 3) return null;

    // Common pattern: "Neighborhood, City" or "Neighborhood – description"
    const link = $li.find('a').first();
    const name = cleanText(link.text()) || text.split(/[,–—-]/)[0].trim();
    if (!name) return null;

    // Try to extract city from the rest of the text
    const remainder = text.replace(name, '').replace(/^[\s,–—-]+/, '').trim();
    const city = this.extractCity(remainder) || this.extractCity(text);

    const wikiHref = link.attr('href');
    const wikipediaUrl = wikiHref?.startsWith('/wiki/')
      ? `https://en.wikipedia.org${wikiHref}`
      : undefined;

    const sourceId = slugify(`${country}-${city || 'unknown'}-${name}`);

    return this.buildRawEntity(sourceId, 'place', sourceUrl, {
      name,
      description: cleanText(stripHtml(remainder)) || null,
      // Leave city NULL when we can't extract one. The previous `city || name`
      // fallback polluted dedupe keys (neighborhood name used as city).
      city: city || null,
      region: region || null,
      country: country || null,
      wikipedia_url: wikipediaUrl || null,
      source_url: `https://en.wikipedia.org/wiki/${WikipediaConnector.ARTICLE}`,
    });
  }

  private parseTableRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $tr: cheerio.Cheerio<any>,
    country: string,
    region: string,
    sourceUrl: string,
  ): SourceRawEntity | null {
    const cells = $tr.find('td');
    if (cells.length < 2) return null;

    const name = cleanText(cells.eq(0).text());
    const city = cleanText(cells.eq(1).text());
    if (!name) return null;

    const link = cells.eq(0).find('a').first();
    const wikiHref = link.attr('href');
    const wikipediaUrl = wikiHref?.startsWith('/wiki/')
      ? `https://en.wikipedia.org${wikiHref}`
      : undefined;

    // 3rd column is typically "Reference" (citations), not a description — skip it
    const description: string | null = null;
    const sourceId = slugify(`${country}-${city || 'unknown'}-${name}`);

    return this.buildRawEntity(sourceId, 'place', sourceUrl, {
      name,
      description,
      city: city || null,
      region: region || null,
      country: country || null,
      wikipedia_url: wikipediaUrl || null,
      source_url: `https://en.wikipedia.org/wiki/${WikipediaConnector.ARTICLE}`,
    });
  }

  private extractCity(text: string): string | null {
    // Simple heuristic: take the first significant word after comma
    const parts = text.split(',').map((p) => p.trim());
    if (parts.length > 1) return parts[0] || null;
    return null;
  }
}
