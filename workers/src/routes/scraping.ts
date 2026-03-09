/**
 * Scraping & link validation routes.
 * Consolidates web scraping, content parsing, and link/image health checks.
 * All routes require admin access.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';

const scraping = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// Apply auth + admin to all routes
scraping.use('*', requireAuth as any, requireAdmin as any);

// ─── Constants ──────────────────────────────────────────────

const BOT_USER_AGENT = 'QueerGuideBot/1.0';
const FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_SIZE = 50;

// Tables that contain URL fields we scan
const URL_FIELD_MAP: Record<string, string[]> = {
  venues: ['website', 'image_url', 'google_maps_url'],
  events: ['website', 'image_url', 'ticket_url'],
  news_articles: ['source_url', 'image_url'],
  personalities: ['wikipedia_url', 'image_url'],
  hotels: ['booking_url', 'website', 'image_url'],
  festivals: ['website', 'image_url', 'ticket_url'],
  community_groups: ['website', 'image_url'],
  marketplace_listings: ['image_url', 'external_url'],
};

// Tables with image URL fields
const IMAGE_FIELD_MAP: Record<string, string[]> = {
  venues: ['image_url'],
  events: ['image_url'],
  news_articles: ['image_url'],
  personalities: ['image_url'],
  hotels: ['image_url'],
  festivals: ['image_url'],
  community_groups: ['image_url'],
  marketplace_listings: ['image_url'],
  profiles: ['avatar_url'],
  cities: ['image_url', 'hero_image_url'],
  countries: ['flag_url', 'image_url'],
};

// ─── HTML Parsing Helpers (regex-based, no DOM in Workers) ──

function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function extractLinks(html: string): string[] {
  const links: string[] = [];
  const regex = /href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    links.push(m[1]);
  }
  return links;
}

function extractMeta(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const match = html.match(regex);
  if (match) return match[1];
  // Try reversed attribute order
  const regex2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : null;
}

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];
  const regex = /<script type="application\/ld\+json">([^<]+)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    try {
      results.push(JSON.parse(m[1]));
    } catch {
      // skip malformed JSON-LD
    }
  }
  return results;
}

function extractBySelector(html: string, config: SelectorConfig): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  if (config.item_pattern) {
    const itemRegex = new RegExp(config.item_pattern, 'gs');
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(html)) !== null) {
      const block = itemMatch[0];
      const item: ExtractedItem = {};

      if (config.title_pattern) {
        const m = block.match(new RegExp(config.title_pattern, 'i'));
        if (m) item.title = m[1]?.trim();
      }
      if (config.url_pattern) {
        const m = block.match(new RegExp(config.url_pattern, 'i'));
        if (m) item.url = m[1]?.trim();
      }
      if (config.date_pattern) {
        const m = block.match(new RegExp(config.date_pattern, 'i'));
        if (m) item.date = m[1]?.trim();
      }
      if (config.description_pattern) {
        const m = block.match(new RegExp(config.description_pattern, 'i'));
        if (m) item.description = m[1]?.trim();
      }
      if (config.venue_pattern) {
        const m = block.match(new RegExp(config.venue_pattern, 'i'));
        if (m) item.venue = m[1]?.trim();
      }
      if (config.address_pattern) {
        const m = block.match(new RegExp(config.address_pattern, 'i'));
        if (m) item.address = m[1]?.trim();
      }
      if (config.image_pattern) {
        const m = block.match(new RegExp(config.image_pattern, 'i'));
        if (m) item.image_url = m[1]?.trim();
      }

      if (item.title || item.url) {
        items.push(item);
      }
    }
  }

  return items;
}

interface SelectorConfig {
  item_pattern?: string;
  title_pattern?: string;
  url_pattern?: string;
  date_pattern?: string;
  description_pattern?: string;
  venue_pattern?: string;
  address_pattern?: string;
  image_pattern?: string;
}

interface ExtractedItem {
  title?: string;
  url?: string;
  date?: string;
  description?: string;
  venue?: string;
  address?: string;
  image_url?: string;
}

// ─── Fetch Helper ───────────────────────────────────────────

async function safeFetch(
  url: string,
  opts: RequestInit = {},
): Promise<{ ok: boolean; status: number; text: string; headers: Headers; error?: string; redirected?: boolean; finalUrl?: string }> {
  try {
    const response = await fetch(url, {
      ...opts,
      headers: {
        'User-Agent': BOT_USER_AGENT,
        ...(opts.headers || {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    const text = opts.method === 'HEAD' ? '' : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      headers: response.headers,
      redirected: response.redirected,
      finalUrl: response.url,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, text: '', headers: new Headers(), error: msg };
  }
}

/**
 * Check a URL with HEAD first, falling back to GET on failure.
 */
async function checkUrl(url: string): Promise<{
  status: number;
  is_alive: boolean;
  error?: string;
  redirected?: boolean;
  final_url?: string;
  content_type?: string;
}> {
  // Try HEAD first
  let result = await safeFetch(url, { method: 'HEAD' });

  // Some servers reject HEAD — fall back to GET
  if (!result.ok && (result.status === 405 || result.status === 0)) {
    result = await safeFetch(url, { method: 'GET' });
  }

  return {
    status: result.status,
    is_alive: result.ok,
    error: result.error,
    redirected: result.redirected,
    final_url: result.finalUrl,
    content_type: result.headers.get('content-type') || undefined,
  };
}

// ─── Soft 404 / Paywall Detection ───────────────────────────

const SOFT_404_PATTERNS = [
  /page\s*not\s*found/i,
  /404\s*error/i,
  /this\s*page\s*(doesn't|does not)\s*exist/i,
  /no\s*longer\s*available/i,
  /has\s*been\s*(removed|deleted)/i,
  /content\s*(is\s*)?unavailable/i,
];

const PAYWALL_PATTERNS = [
  /subscribe\s*to\s*(continue|read|access)/i,
  /sign\s*in\s*to\s*(continue|read)/i,
  /premium\s*content/i,
  /paywall/i,
  /members?\s*only/i,
  /create\s*(a\s*)?free\s*account/i,
];

function detectSoft404(html: string): boolean {
  const title = extractTitle(html) || '';
  const textToCheck = title + ' ' + html.slice(0, 5000);
  return SOFT_404_PATTERNS.some((p) => p.test(textToCheck));
}

function detectPaywall(html: string): boolean {
  return PAYWALL_PATTERNS.some((p) => p.test(html.slice(0, 10000)));
}

// ─── 1. POST /scraping/web-sources ──────────────────────────

scraping.post('/web-sources', async (c) => {
  const db = c.env.DB;
  const { source_id, url, source_type, city_id } = await c.req.json();

  // Build source query
  const conditions: string[] = ['is_active = 1'];
  const bindings: unknown[] = [];

  if (source_id) {
    conditions.push('id = ?');
    bindings.push(source_id);
  }
  if (url) {
    conditions.push('url = ?');
    bindings.push(url);
  }
  if (source_type) {
    conditions.push('source_type = ?');
    bindings.push(source_type);
  }
  if (city_id) {
    conditions.push('city_id = ?');
    bindings.push(city_id);
  }

  const sources = await db
    .prepare(
      `SELECT id, name, url, source_type, selector_config, city_id
       FROM scrape_sources
       WHERE ${conditions.join(' AND ')}`,
    )
    .bind(...bindings)
    .all<{
      id: string;
      name: string;
      url: string;
      source_type: string;
      selector_config: string;
      city_id: string | null;
    }>();

  if (!sources.results?.length) {
    return c.json({ data: null, error: 'No matching active scrape sources found' }, 404);
  }

  let totalScraped = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  const errors: string[] = [];

  for (const source of sources.results) {
    const result = await safeFetch(source.url);
    if (!result.ok) {
      errors.push(`Failed to fetch ${source.name}: ${result.error || `HTTP ${result.status}`}`);
      continue;
    }

    let config: SelectorConfig;
    try {
      config = JSON.parse(source.selector_config || '{}');
    } catch {
      errors.push(`Invalid selector_config for source ${source.name}`);
      continue;
    }

    const items = extractBySelector(result.text, config);
    totalScraped += items.length;

    const now = new Date().toISOString();

    for (const item of items) {
      if (!item.title) continue;

      if (source.source_type === 'events') {
        const existing = await db
          .prepare('SELECT id FROM events WHERE title = ? AND city_id = ? LIMIT 1')
          .bind(item.title, source.city_id)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare(
              `UPDATE events SET description = COALESCE(?, description),
               website = COALESCE(?, website), image_url = COALESCE(?, image_url),
               updated_at = ? WHERE id = ?`,
            )
            .bind(item.description || null, item.url || null, item.image_url || null, now, existing.id)
            .run();
          totalUpdated++;
        } else {
          await db
            .prepare(
              `INSERT INTO events (id, title, description, start_date, website, image_url,
               venue_name, city_id, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(), item.title, item.description || null,
              item.date || now, item.url || null, item.image_url || null,
              item.venue || null, source.city_id, source.name, now, now,
            )
            .run();
          totalNew++;
        }
      } else if (source.source_type === 'venues') {
        const existing = await db
          .prepare('SELECT id FROM venues WHERE name = ? AND city_id = ? LIMIT 1')
          .bind(item.title, source.city_id)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare(
              `UPDATE venues SET description = COALESCE(?, description),
               website = COALESCE(?, website), image_url = COALESCE(?, image_url),
               address = COALESCE(?, address), updated_at = ? WHERE id = ?`,
            )
            .bind(
              item.description || null, item.url || null, item.image_url || null,
              item.address || null, now, existing.id,
            )
            .run();
          totalUpdated++;
        } else {
          await db
            .prepare(
              `INSERT INTO venues (id, name, description, website, image_url, address,
               city_id, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(), item.title, item.description || null,
              item.url || null, item.image_url || null, item.address || null,
              source.city_id, source.name, now, now,
            )
            .run();
          totalNew++;
        }
      } else if (source.source_type === 'news') {
        const existing = await db
          .prepare('SELECT id FROM news_articles WHERE title = ? LIMIT 1')
          .bind(item.title)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare(
              `UPDATE news_articles SET summary = COALESCE(?, summary),
               source_url = COALESCE(?, source_url), image_url = COALESCE(?, image_url),
               updated_at = ? WHERE id = ?`,
            )
            .bind(item.description || null, item.url || null, item.image_url || null, now, existing.id)
            .run();
          totalUpdated++;
        } else {
          await db
            .prepare(
              `INSERT INTO news_articles (id, title, summary, source_url, image_url,
               published_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(), item.title, item.description || null,
              item.url || null, item.image_url || null, item.date || now, now, now,
            )
            .run();
          totalNew++;
        }
      }
    }

    // Update last_scraped_at on the source
    await db
      .prepare('UPDATE scrape_sources SET last_scraped_at = ? WHERE id = ?')
      .bind(now, source.id)
      .run();
  }

  return c.json({
    data: { scraped: totalScraped, new: totalNew, updated: totalUpdated, errors },
    error: null,
  });
});

// ─── 2. POST /scraping/gaycities-events ─────────────────────

scraping.post('/gaycities-events', async (c) => {
  const db = c.env.DB;
  const { city_slug } = await c.req.json();

  const slugs: string[] = [];
  if (city_slug) {
    slugs.push(city_slug);
  } else {
    // Fetch all cities with slugs
    const cities = await db
      .prepare('SELECT slug FROM cities WHERE slug IS NOT NULL AND slug != \'\'')
      .all<{ slug: string }>();
    slugs.push(...(cities.results?.map((r) => r.slug) || []));
  }

  if (!slugs.length) {
    return c.json({ data: null, error: 'No city slugs available' }, 400);
  }

  let totalScraped = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  const errors: string[] = [];
  const now = new Date().toISOString();

  for (const slug of slugs) {
    const url = `https://www.gaycities.com/${slug}/events`;
    const result = await safeFetch(url);
    if (!result.ok) {
      errors.push(`Failed to fetch GayCities events for ${slug}: ${result.error || `HTTP ${result.status}`}`);
      continue;
    }

    const html = result.text;

    // Extract event blocks using regex patterns for GayCities structured data
    // Look for JSON-LD event data first
    const jsonLdItems = extractJsonLd(html);
    for (const ld of jsonLdItems) {
      const ldObj = ld as Record<string, unknown>;
      if (ldObj['@type'] === 'Event') {
        totalScraped++;
        const title = String(ldObj.name || '');
        if (!title) continue;

        const eventData = {
          title,
          description: String(ldObj.description || ''),
          date: String(ldObj.startDate || ''),
          url: String(ldObj.url || ''),
          venue: (ldObj.location as Record<string, unknown>)?.name
            ? String((ldObj.location as Record<string, unknown>).name)
            : undefined,
        };

        // Look up city_id for this slug
        const city = await db
          .prepare('SELECT id FROM cities WHERE slug = ? LIMIT 1')
          .bind(slug)
          .first<{ id: string }>();

        const cityId = city?.id || null;

        const existing = await db
          .prepare('SELECT id FROM events WHERE title = ? AND city_id = ? LIMIT 1')
          .bind(eventData.title, cityId)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare(
              `UPDATE events SET description = COALESCE(?, description),
               start_date = COALESCE(?, start_date), website = COALESCE(?, website),
               venue_name = COALESCE(?, venue_name), updated_at = ? WHERE id = ?`,
            )
            .bind(
              eventData.description || null, eventData.date || null,
              eventData.url || null, eventData.venue || null, now, existing.id,
            )
            .run();
          totalUpdated++;
        } else {
          await db
            .prepare(
              `INSERT INTO events (id, title, description, start_date, website,
               venue_name, city_id, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(), eventData.title, eventData.description || null,
              eventData.date || now, eventData.url || null, eventData.venue || null,
              cityId, 'gaycities', now, now,
            )
            .run();
          totalNew++;
        }
      }
    }

    // Fallback: parse HTML with regex if no JSON-LD events were found
    if (totalScraped === 0) {
      // Common patterns for event listing pages
      const eventBlockRegex = /<(?:article|div)[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div)>/gi;
      let blockMatch: RegExpExecArray | null;
      while ((blockMatch = eventBlockRegex.exec(html)) !== null) {
        const block = blockMatch[1];
        totalScraped++;

        const titleMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/i);
        const dateMatch = block.match(/(?:datetime=["']([^"']+)["']|<time[^>]*>([^<]+))/i);
        const linkMatch = block.match(/href="([^"]*event[^"]*)"/i);
        const venueMatch = block.match(/(?:venue|location)[^>]*>([^<]+)/i);
        const descMatch = block.match(/<p[^>]*>([^<]{10,})/i);

        const title = titleMatch?.[1]?.trim();
        if (!title) continue;

        const city = await db
          .prepare('SELECT id FROM cities WHERE slug = ? LIMIT 1')
          .bind(slug)
          .first<{ id: string }>();
        const cityId = city?.id || null;

        const existing = await db
          .prepare('SELECT id FROM events WHERE title = ? AND city_id = ? LIMIT 1')
          .bind(title, cityId)
          .first<{ id: string }>();

        if (existing) {
          await db
            .prepare(
              `UPDATE events SET description = COALESCE(?, description),
               website = COALESCE(?, website), venue_name = COALESCE(?, venue_name),
               updated_at = ? WHERE id = ?`,
            )
            .bind(descMatch?.[1] || null, linkMatch?.[1] || null, venueMatch?.[1]?.trim() || null, now, existing.id)
            .run();
          totalUpdated++;
        } else {
          await db
            .prepare(
              `INSERT INTO events (id, title, description, start_date, website,
               venue_name, city_id, source, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(), title, descMatch?.[1] || null,
              dateMatch?.[1] || dateMatch?.[2] || now, linkMatch?.[1] || null,
              venueMatch?.[1]?.trim() || null, cityId, 'gaycities', now, now,
            )
            .run();
          totalNew++;
        }
      }
    }
  }

  return c.json({
    data: { scraped: totalScraped, new: totalNew, updated: totalUpdated, errors },
    error: null,
  });
});

// ─── 3. POST /scraping/spartacus ────────────────────────────

scraping.post('/spartacus', async (c) => {
  const db = c.env.DB;
  const { country_code, city_name } = await c.req.json();

  if (!country_code) {
    return c.json({ data: null, error: 'country_code is required' }, 400);
  }

  // Build Spartacus-style URL
  const cityParam = city_name ? `/${encodeURIComponent(city_name.toLowerCase())}` : '';
  const url = `https://www.spartacus.world/en/${country_code.toLowerCase()}${cityParam}`;

  const result = await safeFetch(url);
  if (!result.ok) {
    return c.json(
      { data: null, error: `Failed to fetch Spartacus data: ${result.error || `HTTP ${result.status}`}` },
      502,
    );
  }

  const html = result.text;
  const now = new Date().toISOString();
  let totalScraped = 0;
  let totalNew = 0;
  let totalUpdated = 0;

  // Try JSON-LD structured data first
  const jsonLdItems = extractJsonLd(html);
  for (const ld of jsonLdItems) {
    const ldObj = ld as Record<string, unknown>;
    if (
      ldObj['@type'] === 'LocalBusiness' ||
      ldObj['@type'] === 'BarOrPub' ||
      ldObj['@type'] === 'NightClub' ||
      ldObj['@type'] === 'Restaurant'
    ) {
      totalScraped++;
      const name = String(ldObj.name || '');
      if (!name) continue;

      const address = ldObj.address as Record<string, unknown> | undefined;

      // Resolve city_id
      const resolvedCity = city_name || (address?.addressLocality ? String(address.addressLocality) : null);
      let cityId: string | null = null;
      if (resolvedCity) {
        const cityRow = await db
          .prepare('SELECT id FROM cities WHERE name = ? COLLATE NOCASE LIMIT 1')
          .bind(resolvedCity)
          .first<{ id: string }>();
        cityId = cityRow?.id || null;
      }

      const existing = await db
        .prepare('SELECT id FROM venues WHERE name = ? AND source = ? LIMIT 1')
        .bind(name, 'spartacus')
        .first<{ id: string }>();

      if (existing) {
        await db
          .prepare(
            `UPDATE venues SET description = COALESCE(?, description),
             website = COALESCE(?, website), address = COALESCE(?, address),
             phone = COALESCE(?, phone), city_id = COALESCE(?, city_id),
             updated_at = ? WHERE id = ?`,
          )
          .bind(
            ldObj.description ? String(ldObj.description) : null,
            ldObj.url ? String(ldObj.url) : null,
            address?.streetAddress ? String(address.streetAddress) : null,
            ldObj.telephone ? String(ldObj.telephone) : null,
            cityId, now, existing.id,
          )
          .run();
        totalUpdated++;
      } else {
        await db
          .prepare(
            `INSERT INTO venues (id, name, description, website, address, phone,
             city_id, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(), name,
            ldObj.description ? String(ldObj.description) : null,
            ldObj.url ? String(ldObj.url) : null,
            address?.streetAddress ? String(address.streetAddress) : null,
            ldObj.telephone ? String(ldObj.telephone) : null,
            cityId, 'spartacus', now, now,
          )
          .run();
        totalNew++;
      }
    }
  }

  // Fallback: regex-based extraction for venue/bar/club listing blocks
  if (totalScraped === 0) {
    const venueBlockRegex =
      /<(?:article|div|li)[^>]*class="[^"]*(?:venue|listing|entry|place)[^"]*"[^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = venueBlockRegex.exec(html)) !== null) {
      const block = blockMatch[1];
      totalScraped++;

      const nameMatch = block.match(/<h[2-4][^>]*>(?:<a[^>]*>)?([^<]+)/i);
      const addressMatch = block.match(/(?:address|street)[^>]*>([^<]+)/i);
      const phoneMatch = block.match(/(?:tel|phone)[^>]*>([^<]+)/i);
      const linkMatch = block.match(/href="(https?:\/\/[^"]+)"/i);
      const descMatch = block.match(/<p[^>]*>([^<]{10,})/i);

      const name = nameMatch?.[1]?.trim();
      if (!name) continue;

      let cityId: string | null = null;
      if (city_name) {
        const cityRow = await db
          .prepare('SELECT id FROM cities WHERE name = ? COLLATE NOCASE LIMIT 1')
          .bind(city_name)
          .first<{ id: string }>();
        cityId = cityRow?.id || null;
      }

      const existing = await db
        .prepare('SELECT id FROM venues WHERE name = ? AND source = ? LIMIT 1')
        .bind(name, 'spartacus')
        .first<{ id: string }>();

      if (existing) {
        await db
          .prepare(
            `UPDATE venues SET description = COALESCE(?, description),
             website = COALESCE(?, website), address = COALESCE(?, address),
             phone = COALESCE(?, phone), city_id = COALESCE(?, city_id),
             updated_at = ? WHERE id = ?`,
          )
          .bind(
            descMatch?.[1] || null, linkMatch?.[1] || null,
            addressMatch?.[1]?.trim() || null, phoneMatch?.[1]?.trim() || null,
            cityId, now, existing.id,
          )
          .run();
        totalUpdated++;
      } else {
        await db
          .prepare(
            `INSERT INTO venues (id, name, description, website, address, phone,
             city_id, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(), name, descMatch?.[1] || null,
            linkMatch?.[1] || null, addressMatch?.[1]?.trim() || null,
            phoneMatch?.[1]?.trim() || null, cityId, 'spartacus', now, now,
          )
          .run();
        totalNew++;
      }
    }
  }

  return c.json({
    data: { scraped: totalScraped, new: totalNew, updated: totalUpdated },
    error: null,
  });
});

// ─── 4. POST /scraping/scan-links ───────────────────────────

scraping.post('/scan-links', async (c) => {
  const db = c.env.DB;
  const { table, id, batch_size } = await c.req.json();

  const tables = table ? [table] : Object.keys(URL_FIELD_MAP);
  const batchSize = Math.min(batch_size || DEFAULT_BATCH_SIZE, 200);
  const now = new Date().toISOString();

  let scanned = 0;
  let alive = 0;
  let dead = 0;
  let errorCount = 0;

  for (const tbl of tables) {
    const fields = URL_FIELD_MAP[tbl];
    if (!fields) continue;

    // Build select for URL fields
    const selectCols = ['id', ...fields].join(', ');
    let query = `SELECT ${selectCols} FROM ${tbl}`;
    const bindings: unknown[] = [];

    if (id) {
      query += ' WHERE id = ?';
      bindings.push(id);
    }
    query += ` LIMIT ?`;
    bindings.push(batchSize);

    const rows = await db.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    if (!rows.results?.length) continue;

    for (const row of rows.results) {
      const recordId = String(row.id);

      for (const field of fields) {
        const urlValue = row[field];
        if (!urlValue || typeof urlValue !== 'string') continue;
        if (!urlValue.startsWith('http://') && !urlValue.startsWith('https://')) continue;

        scanned++;
        const check = await checkUrl(urlValue);

        // Upsert into link_scan_results
        await db
          .prepare(
            `INSERT INTO link_scan_results (id, source_table, source_id, field_name, url,
             status_code, is_alive, error, scanned_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_table, source_id, field_name) DO UPDATE SET
             url = excluded.url, status_code = excluded.status_code,
             is_alive = excluded.is_alive, error = excluded.error,
             scanned_at = excluded.scanned_at`,
          )
          .bind(
            crypto.randomUUID(), tbl, recordId, field, urlValue,
            check.status, check.is_alive ? 1 : 0, check.error || null, now,
          )
          .run();

        if (check.is_alive) {
          alive++;
        } else if (check.error) {
          errorCount++;
        } else {
          dead++;
        }
      }
    }
  }

  return c.json({
    data: { scanned, alive, dead, errors: errorCount },
    error: null,
  });
});

// ─── 5. POST /scraping/validate-links ───────────────────────

scraping.post('/validate-links', async (c) => {
  const db = c.env.DB;
  const { table, id, batch_size, recheck_after_hours } = await c.req.json();

  const batchSize = Math.min(batch_size || DEFAULT_BATCH_SIZE, 200);
  const recheckHours = recheck_after_hours || 24;
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - recheckHours * 60 * 60 * 1000).toISOString();

  // Fetch link_scan_results that need re-validation
  let query = `SELECT id, source_table, source_id, field_name, url
               FROM link_scan_results WHERE scanned_at < ?`;
  const bindings: unknown[] = [cutoff];

  if (table) {
    query += ' AND source_table = ?';
    bindings.push(table);
  }
  if (id) {
    query += ' AND source_id = ?';
    bindings.push(id);
  }
  query += ' LIMIT ?';
  bindings.push(batchSize);

  const rows = await db.prepare(query).bind(...bindings).all<{
    id: string;
    source_table: string;
    source_id: string;
    field_name: string;
    url: string;
  }>();

  if (!rows.results?.length) {
    return c.json({
      data: {
        validated: 0,
        alive: 0,
        dead: 0,
        soft_404: 0,
        paywall: 0,
        ssl_error: 0,
        redirect: 0,
        errors: 0,
      },
      error: null,
    });
  }

  let validated = 0;
  let aliveCount = 0;
  let deadCount = 0;
  let soft404Count = 0;
  let paywallCount = 0;
  let sslErrorCount = 0;
  let redirectCount = 0;
  let errorCount = 0;

  for (const row of rows.results) {
    validated++;

    // Full GET request for thorough validation
    const result = await safeFetch(row.url, { method: 'GET' });

    let isSoft404 = false;
    let isPaywall = false;
    let isSslError = false;
    const isRedirect = result.redirected || false;
    const finalUrl = result.finalUrl || row.url;

    if (result.ok) {
      isSoft404 = detectSoft404(result.text);
      isPaywall = detectPaywall(result.text);

      if (isSoft404) soft404Count++;
      if (isPaywall) paywallCount++;
      if (isRedirect) redirectCount++;

      if (!isSoft404) {
        aliveCount++;
      } else {
        deadCount++;
      }
    } else {
      if (result.error?.includes('SSL') || result.error?.includes('certificate') || result.error?.includes('TLS')) {
        isSslError = true;
        sslErrorCount++;
      }
      if (result.error) {
        errorCount++;
      } else {
        deadCount++;
      }
    }

    // Update the link_scan_results row with validation details
    await db
      .prepare(
        `UPDATE link_scan_results SET
         status_code = ?, is_alive = ?, error = ?,
         is_soft_404 = ?, is_paywall = ?, is_ssl_error = ?,
         is_redirect = ?, final_url = ?, scanned_at = ?
         WHERE id = ?`,
      )
      .bind(
        result.status, result.ok && !isSoft404 ? 1 : 0, result.error || null,
        isSoft404 ? 1 : 0, isPaywall ? 1 : 0, isSslError ? 1 : 0,
        isRedirect ? 1 : 0, finalUrl !== row.url ? finalUrl : null, now,
        row.id,
      )
      .run();
  }

  return c.json({
    data: {
      validated,
      alive: aliveCount,
      dead: deadCount,
      soft_404: soft404Count,
      paywall: paywallCount,
      ssl_error: sslErrorCount,
      redirect: redirectCount,
      errors: errorCount,
    },
    error: null,
  });
});

// ─── 6. POST /scraping/scan-project-images ──────────────────

scraping.post('/scan-project-images', async (c) => {
  const db = c.env.DB;
  const { table, batch_size } = await c.req.json();

  const tables = table ? [table] : Object.keys(IMAGE_FIELD_MAP);
  const batchSize = Math.min(batch_size || DEFAULT_BATCH_SIZE, 200);
  const now = new Date().toISOString();

  let scanned = 0;
  let valid = 0;
  let broken = 0;
  let missing = 0;

  for (const tbl of tables) {
    const fields = IMAGE_FIELD_MAP[tbl];
    if (!fields) continue;

    const selectCols = ['id', ...fields].join(', ');
    const rows = await db
      .prepare(`SELECT ${selectCols} FROM ${tbl} LIMIT ?`)
      .bind(batchSize)
      .all<Record<string, unknown>>();

    if (!rows.results?.length) continue;

    for (const row of rows.results) {
      const recordId = String(row.id);

      for (const field of fields) {
        const imageUrl = row[field];

        // Track missing (null/empty) image URLs
        if (!imageUrl || typeof imageUrl !== 'string' || imageUrl.trim() === '') {
          missing++;

          await db
            .prepare(
              `INSERT INTO image_scan_results (id, source_table, source_id, field_name,
               url, is_valid, error, scanned_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(source_table, source_id, field_name) DO UPDATE SET
               url = excluded.url, is_valid = excluded.is_valid,
               error = excluded.error, scanned_at = excluded.scanned_at`,
            )
            .bind(crypto.randomUUID(), tbl, recordId, field, null, 0, 'missing', now)
            .run();
          continue;
        }

        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          missing++;
          await db
            .prepare(
              `INSERT INTO image_scan_results (id, source_table, source_id, field_name,
               url, is_valid, error, scanned_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(source_table, source_id, field_name) DO UPDATE SET
               url = excluded.url, is_valid = excluded.is_valid,
               error = excluded.error, scanned_at = excluded.scanned_at`,
            )
            .bind(crypto.randomUUID(), tbl, recordId, field, imageUrl, 0, 'invalid_url', now)
            .run();
          continue;
        }

        scanned++;

        // HEAD request to check the image
        const check = await checkUrl(imageUrl);
        const contentType = check.content_type || '';
        const isImage = contentType.startsWith('image/');
        const isValid = check.is_alive && isImage;

        let error: string | null = null;
        if (!check.is_alive) {
          error = check.error || `HTTP ${check.status}`;
          broken++;
        } else if (!isImage) {
          error = `not_image: ${contentType}`;
          broken++;
        } else {
          valid++;
        }

        await db
          .prepare(
            `INSERT INTO image_scan_results (id, source_table, source_id, field_name,
             url, is_valid, content_type, status_code, error, scanned_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(source_table, source_id, field_name) DO UPDATE SET
             url = excluded.url, is_valid = excluded.is_valid,
             content_type = excluded.content_type, status_code = excluded.status_code,
             error = excluded.error, scanned_at = excluded.scanned_at`,
          )
          .bind(
            crypto.randomUUID(), tbl, recordId, field, imageUrl,
            isValid ? 1 : 0, contentType || null, check.status, error, now,
          )
          .run();
      }
    }
  }

  return c.json({
    data: { scanned, valid, broken, missing },
    error: null,
  });
});

export { scraping };
