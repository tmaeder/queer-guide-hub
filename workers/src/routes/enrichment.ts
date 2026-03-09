/**
 * Enrichment routes — consolidates all data enrichment functions.
 * Migrated from individual Supabase Edge Functions.
 *
 * All routes require admin authentication and use POST method.
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { chatCompletion } from '../lib/openai';

type AppEnv = { Bindings: Env; Variables: { user: AuthUser } };

const enrichment = new Hono<AppEnv>();

// Apply auth + admin to every route in this group
enrichment.use('*', requireAuth as any, requireAdmin as any);

// ─── Helpers ──────────────────────────────────────────────────────────

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Clean HTML entities from content text */
function cleanContentText(raw: string): string {
  if (!raw) return '';
  let text = raw;
  text = text
    .replace(/&#8217;|&#x2019;/g, '\u2019')
    .replace(/&#8216;|&#x2018;/g, '\u2018')
    .replace(/&#8220;|&#x201C;/g, '\u201C')
    .replace(/&#8221;|&#x201D;/g, '\u201D')
    .replace(/&#8230;|&#x2026;/g, '\u2026')
    .replace(/&#8211;|&#x2013;/g, '\u2013')
    .replace(/&#8212;|&#x2014;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) => String.fromCharCode(parseInt(code, 16)));
  text = text.replace(/\n*The post\s.+appeared first on\s.+\.?\s*$/i, '');
  text = text.replace(/\s*…?\s*Continue reading\s.+[→\u2192]?\s*$/i, '');
  text = text.split('\n').map((l) => l.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** Country alias map for resolving demonyms and abbreviations */
const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States', usa: 'United States', 'united states of america': 'United States',
  gb: 'United Kingdom', uk: 'United Kingdom', 'great britain': 'United Kingdom',
  england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  de: 'Germany', fr: 'France', es: 'Spain', it: 'Italy',
  nl: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands',
  ch: 'Switzerland', at: 'Austria', au: 'Australia', ca: 'Canada',
  br: 'Brazil', mx: 'Mexico', jp: 'Japan', za: 'South Africa',
  nz: 'New Zealand', il: 'Israel', th: 'Thailand', pt: 'Portugal',
  be: 'Belgium', se: 'Sweden', dk: 'Denmark', no: 'Norway', fi: 'Finland',
  ie: 'Ireland', cz: 'Czech Republic', czechia: 'Czech Republic',
  tw: 'Taiwan', ar: 'Argentina', co: 'Colombia', cl: 'Chile', pe: 'Peru',
  in: 'India', cn: 'China', kr: 'South Korea', ru: 'Russia',
  tr: 'Turkey', gr: 'Greece', pl: 'Poland', ro: 'Romania', hu: 'Hungary',
  ph: 'Philippines', id: 'Indonesia', ng: 'Nigeria', ke: 'Kenya',
  eg: 'Egypt', ma: 'Morocco',
  // Demonyms
  american: 'United States', british: 'United Kingdom', german: 'Germany',
  french: 'France', spanish: 'Spain', italian: 'Italy', dutch: 'Netherlands',
  swiss: 'Switzerland', austrian: 'Austria', australian: 'Australia',
  canadian: 'Canada', brazilian: 'Brazil', mexican: 'Mexico', japanese: 'Japan',
  irish: 'Ireland', swedish: 'Sweden', danish: 'Denmark', norwegian: 'Norway',
  finnish: 'Finland', polish: 'Poland', greek: 'Greece', turkish: 'Turkey',
  russian: 'Russia', indian: 'India', chinese: 'China', korean: 'South Korea',
};

function resolveCountryAlias(raw: string): string {
  if (!raw) return raw;
  return COUNTRY_ALIASES[raw.trim().toLowerCase()] || raw.trim();
}

// ─── 1. POST /enrichment/venue ────────────────────────────────────────

enrichment.post('/venue', async (c) => {
  try {
    const body = await c.req.json();
    const { venue_id, batch_size } = body;
    const db = c.env.DB;

    // Batch mode: pick venues missing enrichment data
    const venueIds: string[] = [];
    if (venue_id) {
      venueIds.push(venue_id);
    } else {
      const limit = Math.min(batch_size || 10, 50);
      const rows = await db
        .prepare(
          `SELECT id FROM venues WHERE description IS NULL OR description = '' LIMIT ?`,
        )
        .bind(limit)
        .all<{ id: string }>();
      venueIds.push(...(rows.results?.map((r) => r.id) || []));
    }

    if (venueIds.length === 0) {
      return c.json({ data: null, error: null, message: 'No venues to enrich' });
    }

    const results: Array<{ venue_id: string; status: string; sources: string[] }> = [];

    for (const id of venueIds) {
      const venue = await db
        .prepare('SELECT * FROM venues WHERE id = ?')
        .bind(id)
        .first<Record<string, unknown>>();

      if (!venue) {
        results.push({ venue_id: id, status: 'not_found', sources: [] });
        continue;
      }

      const venueName = (venue.name as string) || '';
      const venueCity = (venue.city as string) || '';
      const venueCountry = (venue.country as string) || '';
      const searchQuery = [venueName, venueCity, venueCountry].filter(Boolean).join(', ');
      const updates: Record<string, unknown> = {};
      const sources: string[] = [];

      // Google Places enrichment
      const googleKey = (c.env as any).GOOGLE_PLACES_API_KEY;
      if (googleKey) {
        try {
          const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(searchQuery)}&inputtype=textquery&fields=place_id,name,formatted_address,geometry,rating,price_level&key=${googleKey}`;
          const searchRes = await fetch(searchUrl);
          if (searchRes.ok) {
            const searchData = (await searchRes.json()) as any;
            const place = searchData.candidates?.[0];
            if (place?.place_id) {
              const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,address_components,geometry,international_phone_number,website,rating,price_level,opening_hours&key=${googleKey}`;
              const detailsRes = await fetch(detailsUrl);
              if (detailsRes.ok) {
                const details = ((await detailsRes.json()) as any).result;
                if (details) {
                  if (!venue.phone && details.international_phone_number) updates.phone = details.international_phone_number;
                  if (!venue.website && details.website) updates.website = details.website;
                  if (!venue.rating && details.rating) updates.rating = details.rating;
                  if (!venue.price_range && details.price_level) updates.price_range = details.price_level;
                  if (details.opening_hours?.weekday_text) updates.hours = details.opening_hours.weekday_text.join('; ');
                  if (details.geometry?.location) {
                    if (!venue.latitude) updates.latitude = details.geometry.location.lat;
                    if (!venue.longitude) updates.longitude = details.geometry.location.lng;
                  }
                  sources.push('google_places');
                }
              }
            }
          }
        } catch (e) {
          console.error('Google Places error:', e);
        }
      }

      // Foursquare enrichment
      const foursquareKey = (c.env as any).FOURSQUARE_API_KEY;
      if (foursquareKey) {
        try {
          const fsUrl = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(searchQuery)}&limit=1`;
          const fsRes = await fetch(fsUrl, {
            headers: { Authorization: foursquareKey, Accept: 'application/json' },
          });
          if (fsRes.ok) {
            const fsData = (await fsRes.json()) as any;
            const fsVenue = fsData.results?.[0];
            if (fsVenue) {
              if (!venue.category && fsVenue.categories?.[0]?.name) updates.category = fsVenue.categories[0].name;
              if (!venue.latitude && fsVenue.geocodes?.main?.latitude) {
                updates.latitude = fsVenue.geocodes.main.latitude;
                updates.longitude = fsVenue.geocodes.main.longitude;
              }
              sources.push('foursquare');
            }
          }
        } catch (e) {
          console.error('Foursquare error:', e);
        }
      }

      // Geocoding fallback via Mapbox if still missing coordinates
      const mapboxToken = (c.env as any).MAPBOX_ACCESS_TOKEN;
      if (mapboxToken && !venue.latitude && !updates.latitude && searchQuery) {
        try {
          const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${mapboxToken}&limit=1`;
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geoData = (await geoRes.json()) as any;
            const feature = geoData.features?.[0];
            if (feature?.center) {
              updates.longitude = feature.center[0];
              updates.latitude = feature.center[1];
              sources.push('mapbox_geocoding');
            }
          }
        } catch (e) {
          console.error('Mapbox geocoding error:', e);
        }
      }

      // OpenAI description generation
      if (!venue.description || (venue.description as string).length < 20) {
        try {
          const aiDesc = await chatCompletion(
            {
              messages: [
                {
                  role: 'system',
                  content:
                    'You are an expert LGBTQ+ travel writer. Write concise, informative venue descriptions (2-3 sentences).',
                },
                {
                  role: 'user',
                  content: `Write a brief description for this venue: ${venueName}, located in ${venueCity}, ${venueCountry}. Category: ${venue.category || 'unknown'}.`,
                },
              ],
              max_tokens: 200,
              temperature: 0.5,
            },
            c.env as any,
          );
          if (aiDesc && aiDesc.length > 10) {
            updates.description = aiDesc;
            sources.push('openai');
          }
        } catch (e) {
          console.error('OpenAI description error:', e);
        }
      }

      // Apply updates
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const setClauses = Object.keys(updates)
          .map((k) => `${sanitizeIdentifier(k)} = ?`)
          .join(', ');
        await db
          .prepare(`UPDATE venues SET ${setClauses} WHERE id = ?`)
          .bind(...Object.values(updates), id)
          .run();
      }

      results.push({ venue_id: id, status: 'enriched', sources });
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('Venue enrichment error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 2. POST /enrichment/fetch-news ───────────────────────────────────

enrichment.post('/fetch-news', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { query, category, city_id, source } = body as {
      query?: string;
      category?: string;
      city_id?: string;
      source?: string;
    };
    const db = c.env.DB;

    // Fetch active news sources
    const sourcesResult = await db
      .prepare('SELECT * FROM news_sources WHERE is_active = 1 LIMIT 20')
      .all<Record<string, unknown>>();

    const newsSources = sourcesResult.results || [];
    if (newsSources.length === 0 && !query) {
      return c.json({
        data: null,
        error: null,
        message: 'No active news sources found',
        processed_articles: 0,
      });
    }

    let totalArticles = 0;
    let processedSources = 0;

    // Process RSS feeds from configured sources
    for (const ns of newsSources) {
      if (source && ns.id !== source) continue;

      try {
        let articles: Array<Record<string, unknown>> = [];

        if (ns.type === 'rss' && ns.url) {
          const rssRes = await fetch(ns.url as string, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
          });
          if (rssRes.ok) {
            const xmlText = await rssRes.text();
            const itemMatches =
              xmlText.match(/<item[^>]*>[\s\S]*?<\/item>/gi) ||
              xmlText.match(/<entry[^>]*>[\s\S]*?<\/entry>/gi) ||
              [];

            for (const itemXml of itemMatches.slice(0, 10)) {
              const titleMatch = itemXml.match(
                /<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is,
              );
              const title = titleMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
              const linkMatch =
                itemXml.match(/<link[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/is) ||
                itemXml.match(/<link[^>]*href=["'](.*?)["'][^>]*>/is);
              const url = linkMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
              const descMatch =
                itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/is) ||
                itemXml.match(/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/is);
              const description = descMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>|<[^>]*>/g, '').trim() || '';
              const contentMatch =
                itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content:encoded>/is) ||
                itemXml.match(/<content[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/content>/is);
              const content = contentMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>|<[^>]*>/g, '').trim() || description;
              const pubDateMatch =
                itemXml.match(/<pubDate[^>]*>(.*?)<\/pubDate>/is) ||
                itemXml.match(/<published[^>]*>(.*?)<\/published>/is);
              const pubDateStr = pubDateMatch?.[1]?.trim() || '';
              const imageMatch = itemXml.match(/<enclosure[^>]*url=["'](.*?)["'][^>]*>/i) ||
                itemXml.match(/<media:content[^>]*url=["'](.*?)["'][^>]*>/i);
              const imageUrl = imageMatch?.[1] || null;

              if (!title || !url) continue;

              let publishedAt = new Date().toISOString();
              if (pubDateStr) {
                try {
                  const parsedDate = new Date(pubDateStr);
                  if (!isNaN(parsedDate.getTime())) publishedAt = parsedDate.toISOString();
                } catch {
                  /* keep default */
                }
              }

              articles.push({
                id: crypto.randomUUID(),
                title: cleanContentText(title),
                description: cleanContentText(description).substring(0, 500),
                content: cleanContentText(content),
                url,
                image_url: imageUrl,
                source: ns.name || ns.id,
                published_at: publishedAt,
                city_id: city_id || null,
                category: category || (ns.category as string) || null,
                created_at: new Date().toISOString(),
              });
            }
          }
        }

        // API-based news sources (NewsAPI-style)
        if (ns.type === 'api' && ns.api_endpoint) {
          const newsApiKey = (c.env as any).NEWS_API_KEY;
          if (newsApiKey) {
            const searchQuery = query || 'LGBT OR LGBTQ OR queer';
            const apiUrl = `${ns.api_endpoint}?q=${encodeURIComponent(searchQuery)}&language=en&pageSize=10`;
            const apiRes = await fetch(apiUrl, {
              headers: { 'X-API-Key': newsApiKey },
            });
            if (apiRes.ok) {
              const apiData = (await apiRes.json()) as any;
              const apiArticles = apiData.articles || apiData.results || apiData.data || [];
              for (const a of apiArticles.slice(0, 10)) {
                articles.push({
                  id: crypto.randomUUID(),
                  title: cleanContentText(a.title || ''),
                  description: cleanContentText(a.description || '').substring(0, 500),
                  content: cleanContentText(a.content || a.description || ''),
                  url: a.url || a.link || '',
                  image_url: a.urlToImage || a.image_url || a.image || null,
                  source: a.source?.name || (ns.name as string) || 'api',
                  published_at: a.publishedAt || a.published_at || a.pubDate || new Date().toISOString(),
                  city_id: city_id || null,
                  category: category || null,
                  created_at: new Date().toISOString(),
                });
              }
            }
          }
        }

        // Insert articles into D1
        for (const article of articles) {
          if (!article.title || !article.url) continue;
          try {
            await db
              .prepare(
                `INSERT INTO news_articles (id, title, description, content, url, image_url, source, published_at, city_id, category, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(url) DO UPDATE SET
                   title = excluded.title,
                   content = excluded.content,
                   updated_at = ?`,
              )
              .bind(
                article.id, article.title, article.description, article.content,
                article.url, article.image_url, article.source, article.published_at,
                article.city_id, article.category, article.created_at,
                new Date().toISOString(),
              )
              .run();
            totalArticles++;
          } catch (e) {
            console.error('Insert article error:', e);
          }
        }

        // Update source status
        if (ns.id) {
          await db
            .prepare(
              `UPDATE news_sources SET last_fetch_at = ?, status = 'active' WHERE id = ?`,
            )
            .bind(new Date().toISOString(), ns.id)
            .run();
        }

        processedSources++;
      } catch (sourceErr: any) {
        console.error(`Error processing source ${ns.name}:`, sourceErr);
        if (ns.id) {
          await db
            .prepare(`UPDATE news_sources SET status = 'error', error_message = ? WHERE id = ?`)
            .bind(sourceErr.message, ns.id)
            .run();
        }
      }
    }

    return c.json({
      data: null,
      error: null,
      message: `Processed ${totalArticles} articles from ${processedSources} sources`,
      processed_articles: totalArticles,
      processed_sources: processedSources,
    });
  } catch (err: any) {
    console.error('Fetch news error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 3. POST /enrichment/fetch-personality ────────────────────────────

enrichment.post('/fetch-personality', async (c) => {
  try {
    const body = await c.req.json();
    const { personality_id, name, category } = body as {
      personality_id?: string;
      name?: string;
      category?: string;
    };
    const db = c.env.DB;

    let searchTerm = name;
    let targetId = personality_id;

    // If personality_id provided, load the name from DB
    if (personality_id && !name) {
      const existing = await db
        .prepare('SELECT name, category FROM personalities WHERE id = ?')
        .bind(personality_id)
        .first<{ name: string; category: string }>();
      if (!existing) return c.json({ data: null, error: 'Personality not found' }, 404);
      searchTerm = existing.name;
    }

    if (!searchTerm || searchTerm.trim().length < 2) {
      return c.json({ data: null, error: 'Name or personality_id is required' }, 400);
    }

    // Step 1: Search Wikidata
    const wikidataSearchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchTerm)}&language=en&type=item&format=json&limit=5`;
    const wdSearchRes = await fetch(wikidataSearchUrl);
    const wdSearchData = (await wdSearchRes.json()) as any;

    if (!wdSearchData.search?.length) {
      return c.json({ data: null, error: 'No results found in Wikidata' }, 404);
    }

    // If multiple results and no personality_id, return candidates
    if (wdSearchData.search.length > 1 && !targetId) {
      return c.json({
        data: {
          multiple_results: true,
          candidates: wdSearchData.search.slice(0, 5).map((r: any) => ({
            id: r.id,
            title: r.title,
            description: r.description || 'No description available',
          })),
        },
        error: null,
      });
    }

    const entityId = wdSearchData.search[0].id;

    // Step 2: Get detailed entity data from Wikidata
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&format=json&props=claims|labels|descriptions|sitelinks`;
    const entityRes = await fetch(entityUrl);
    const entityData = (await entityRes.json()) as any;
    const entity = entityData.entities?.[entityId];

    if (!entity) {
      return c.json({ data: null, error: 'Entity not found in Wikidata' }, 404);
    }

    const claims = entity.claims || {};
    const entityName = entity.labels?.en?.value || searchTerm;
    const description = entity.descriptions?.en?.value || '';

    // Parse birth date (P569)
    let birthDate: string | null = null;
    if (claims.P569?.[0]?.mainsnak?.datavalue?.value?.time) {
      birthDate = claims.P569[0].mainsnak.datavalue.value.time.substring(1, 11);
    }

    // Parse death date (P570)
    let deathDate: string | null = null;
    if (claims.P570?.[0]?.mainsnak?.datavalue?.value?.time) {
      deathDate = claims.P570[0].mainsnak.datavalue.value.time.substring(1, 11);
    }

    // Parse nationality (P27) — resolve label
    let nationality: string | null = null;
    if (claims.P27?.[0]?.mainsnak?.datavalue?.value?.id) {
      const countryId = claims.P27[0].mainsnak.datavalue.value.id;
      try {
        const labelRes = await fetch(
          `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${countryId}&format=json&props=labels&languages=en`,
        );
        const labelData = (await labelRes.json()) as any;
        nationality = labelData.entities?.[countryId]?.labels?.en?.value || null;
      } catch {
        /* skip */
      }
    }

    // Parse image (P18) — resolve Wikimedia Commons URL
    let imageUrl: string | null = null;
    if (claims.P18?.[0]?.mainsnak?.datavalue?.value) {
      const imageFilename = claims.P18[0].mainsnak.datavalue.value;
      try {
        const imgInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(imageFilename)}&prop=imageinfo&iiprop=url&iiurlwidth=400&format=json`;
        const imgRes = await fetch(imgInfoUrl);
        const imgData = (await imgRes.json()) as any;
        const pages = imgData.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          imageUrl = pages[pageId]?.imageinfo?.[0]?.thumburl || pages[pageId]?.imageinfo?.[0]?.url || null;
        }
      } catch {
        /* skip */
      }
    }

    // Get Wikipedia bio
    let bio = '';
    let wikipediaUrl: string | null = null;
    const wikipediaTitle = entity.sitelinks?.enwiki?.title;
    if (wikipediaTitle) {
      wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaTitle)}`;
      try {
        const wpUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(wikipediaTitle)}&prop=extracts&exintro=true&explaintext=true`;
        const wpRes = await fetch(wpUrl);
        const wpData = (await wpRes.json()) as any;
        const pages = wpData.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const extract = pages[pageId]?.extract;
          if (extract) {
            bio = extract.substring(0, 500);
            if (bio.length === 500) bio = bio.substring(0, bio.lastIndexOf('.') + 1);
          }
        }
      } catch {
        /* skip */
      }
    }

    const personalityData = {
      name: entityName,
      description,
      bio,
      birth_date: birthDate,
      death_date: deathDate,
      nationality,
      image_url: imageUrl,
      wikipedia_url: wikipediaUrl,
    };

    // Update record in DB if personality_id provided
    if (targetId) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(personalityData)) {
        if (v !== null && v !== undefined && v !== '') {
          sets.push(`${sanitizeIdentifier(k)} = ?`);
          vals.push(v);
        }
      }
      if (sets.length > 0) {
        sets.push('updated_at = ?');
        vals.push(new Date().toISOString());
        await db
          .prepare(`UPDATE personalities SET ${sets.join(', ')} WHERE id = ?`)
          .bind(...vals, targetId)
          .run();
      }
    }

    return c.json({ data: personalityData, error: null });
  } catch (err: any) {
    console.error('Fetch personality error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 4. POST /enrichment/fetch-wikipedia ──────────────────────────────

enrichment.post('/fetch-wikipedia', async (c) => {
  try {
    const body = await c.req.json();
    const { title, language } = body as { title?: string; language?: string };

    if (!title) {
      return c.json({ data: null, error: 'title is required' }, 400);
    }

    const lang = language && /^[a-z]{2}$/.test(language) ? language : 'en';
    const encodedTitle = encodeURIComponent(title);
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;

    const res = await fetch(summaryUrl, {
      headers: {
        'User-Agent': 'Queer-Guide-App/1.0',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return c.json(
        { data: null, error: `Wikipedia API error: ${res.status}` },
        res.status === 404 ? 404 : 502,
      );
    }

    const data = (await res.json()) as any;

    return c.json({
      data: {
        extract: data.extract || '',
        thumbnail: data.thumbnail?.source || null,
        description: data.description || '',
        coordinates: data.coordinates
          ? { lat: data.coordinates.lat, lon: data.coordinates.lon }
          : null,
        page_url: data.content_urls?.desktop?.page || null,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Fetch Wikipedia error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 5. POST /enrichment/fetch-ilga ───────────────────────────────────

enrichment.post('/fetch-ilga', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { country_code } = body as { country_code?: string };
    const db = c.env.DB;

    // Load countries to process
    let countries: Array<{ id: string; name: string; code: string }>;
    if (country_code) {
      const row = await db
        .prepare('SELECT id, name, code FROM countries WHERE code = ? COLLATE NOCASE')
        .bind(country_code.toUpperCase())
        .first<{ id: string; name: string; code: string }>();
      countries = row ? [row] : [];
    } else {
      const result = await db
        .prepare(
          `SELECT id, name, code FROM countries WHERE lgbtq_legal_status IS NULL OR lgbtq_legal_status = '' LIMIT 20`,
        )
        .all<{ id: string; name: string; code: string }>();
      countries = result.results || [];
    }

    if (countries.length === 0) {
      return c.json({ data: null, error: null, message: 'No countries to process' });
    }

    const results: Array<{ country: string; status: string }> = [];

    for (const country of countries) {
      try {
        const countrySlug = country.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        // Attempt to scrape ILGA database page
        const ilgaUrl = `https://database.ilga.org/${countrySlug}-lgbti`;
        const ilgaRes = await fetch(ilgaUrl);

        if (!ilgaRes.ok) {
          results.push({ country: country.name, status: 'not_found' });
          continue;
        }

        const html = await ilgaRes.text();

        // Extract legal status data from HTML
        const legalData: Record<string, unknown> = {};

        // Criminalisation status
        if (html.includes('Legal') || html.includes('Not criminalised')) {
          legalData.criminalisation_status = 'Legal';
        } else if (html.includes('Criminalised') || html.includes('Illegal')) {
          legalData.criminalisation_status = 'Criminalised';
        } else {
          legalData.criminalisation_status = 'Unknown';
        }

        // Same-sex marriage
        if (html.includes('same-sex marriage') && (html.includes('legal') || html.includes('Legal'))) {
          legalData.same_sex_marriage = 'Legal';
        } else if (html.includes('civil union') || html.includes('civil partnership')) {
          legalData.same_sex_marriage = 'Civil unions';
        } else if (html.includes('prohibited') || html.includes('banned')) {
          legalData.same_sex_marriage = 'Prohibited';
        } else {
          legalData.same_sex_marriage = 'Not recognized';
        }

        // Anti-discrimination
        if (html.includes('comprehensive') && html.includes('protection')) {
          legalData.antidiscrimination = 'Protected';
        } else if (html.includes('partial') && html.includes('protection')) {
          legalData.antidiscrimination = 'Partial';
        } else {
          legalData.antidiscrimination = 'Unknown';
        }

        legalData.constitutional_protection = html.includes('constitutional protection');
        legalData.hate_crime_laws = html.includes('hate crime') || html.includes('hate-crime');

        // Update country record
        const lgbtqLegalStatus = JSON.stringify(legalData);
        await db
          .prepare(`UPDATE countries SET lgbtq_legal_status = ?, updated_at = ? WHERE id = ?`)
          .bind(lgbtqLegalStatus, new Date().toISOString(), country.id)
          .run();

        results.push({ country: country.name, status: 'updated' });
      } catch (e) {
        console.error(`ILGA error for ${country.name}:`, e);
        results.push({ country: country.name, status: 'error' });
      }
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('Fetch ILGA error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 6. POST /enrichment/fetch-city-images ────────────────────────────

enrichment.post('/fetch-city-images', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { city_id, batch_size } = body as { city_id?: string; batch_size?: number };
    const db = c.env.DB;

    const pexelsKey = c.env.PEXELS_API_KEY;
    const unsplashKey = c.env.UNSPLASH_ACCESS_KEY;

    if (!pexelsKey && !unsplashKey) {
      return c.json({ data: null, error: 'No image API keys configured (PEXELS_API_KEY or UNSPLASH_ACCESS_KEY)' }, 500);
    }

    // Determine which cities to process
    let cities: Array<{ id: string; name: string; country_name: string | null }>;
    if (city_id) {
      const row = await db
        .prepare(
          `SELECT c.id, c.name, co.name as country_name
           FROM cities c LEFT JOIN countries co ON c.country_id = co.id
           WHERE c.id = ?`,
        )
        .bind(city_id)
        .first<{ id: string; name: string; country_name: string | null }>();
      cities = row ? [row] : [];
    } else {
      const limit = Math.min(batch_size || 10, 50);
      const result = await db
        .prepare(
          `SELECT c.id, c.name, co.name as country_name
           FROM cities c LEFT JOIN countries co ON c.country_id = co.id
           WHERE c.image_url IS NULL OR c.image_url = ''
           LIMIT ?`,
        )
        .bind(limit)
        .all<{ id: string; name: string; country_name: string | null }>();
      cities = result.results || [];
    }

    if (cities.length === 0) {
      return c.json({ data: null, error: null, message: 'No cities to process' });
    }

    const results: Array<{ city_id: string; city_name: string; status: string; image_url?: string }> = [];

    for (const city of cities) {
      const searchQuery = `${city.name} city skyline architecture`;
      let imageUrl: string | null = null;
      let imageMetadata: Record<string, unknown> | null = null;

      // Try Pexels
      if (pexelsKey && !imageUrl) {
        try {
          const pRes = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
            { headers: { Authorization: pexelsKey } },
          );
          if (pRes.ok) {
            const pData = (await pRes.json()) as any;
            const photo = pData.photos?.[0];
            if (photo) {
              imageUrl = photo.src.large;
              imageMetadata = {
                thumbnail: photo.src.medium,
                alt: photo.alt || searchQuery,
                photographer: photo.photographer,
                photographer_url: photo.photographer_url,
                source: 'pexels',
                source_id: String(photo.id),
              };
            }
          }
        } catch (e) {
          console.error('Pexels error:', e);
        }
      }

      // Try Unsplash
      if (unsplashKey && !imageUrl) {
        try {
          const uRes = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchQuery)}&per_page=5&orientation=landscape`,
            { headers: { Authorization: `Client-ID ${unsplashKey}` } },
          );
          if (uRes.ok) {
            const uData = (await uRes.json()) as any;
            const photo = uData.results?.[0];
            if (photo) {
              imageUrl = photo.urls.regular;
              imageMetadata = {
                thumbnail: photo.urls.small,
                alt: photo.alt_description || photo.description || searchQuery,
                photographer: photo.user.name,
                photographer_url: photo.user.links.html,
                source: 'unsplash',
                source_id: photo.id,
              };
            }
          }
        } catch (e) {
          console.error('Unsplash error:', e);
        }
      }

      if (imageUrl) {
        await db
          .prepare(
            `UPDATE cities SET image_url = ?, image_metadata = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(imageUrl, JSON.stringify(imageMetadata), new Date().toISOString(), city.id)
          .run();
        results.push({ city_id: city.id, city_name: city.name, status: 'updated', image_url: imageUrl });
      } else {
        results.push({ city_id: city.id, city_name: city.name, status: 'no_images_found' });
      }
    }

    return c.json({ data: results, error: null });
  } catch (err: any) {
    console.error('Fetch city images error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 7. POST /enrichment/geo-link ─────────────────────────────────────

enrichment.post('/geo-link', async (c) => {
  try {
    const body = await c.req.json();
    const { table, id, batch_size } = body as {
      table?: string;
      id?: string;
      batch_size?: number;
    };
    const db = c.env.DB;

    if (!table) {
      return c.json({ data: null, error: 'table is required' }, 400);
    }

    const safeTable = sanitizeIdentifier(table);
    const VALID_TABLES = ['venues', 'events', 'personalities', 'news_articles'];
    if (!VALID_TABLES.includes(safeTable)) {
      return c.json({ data: null, error: `Invalid table. Must be one of: ${VALID_TABLES.join(', ')}` }, 400);
    }

    // Load all cities with coordinates
    const citiesResult = await db
      .prepare('SELECT id, name, latitude, longitude, country_id FROM cities WHERE latitude IS NOT NULL AND longitude IS NOT NULL')
      .all<{ id: string; name: string; latitude: number; longitude: number; country_id: string | null }>();
    const allCities = citiesResult.results || [];

    if (allCities.length === 0) {
      return c.json({ data: null, error: null, message: 'No cities with coordinates available' });
    }

    // Get records with coordinates but no city_id
    const limit = Math.min(batch_size || 100, 500);
    let query: string;
    const bindings: unknown[] = [];

    if (id) {
      query = `SELECT id, latitude, longitude, city_id FROM ${safeTable} WHERE id = ?`;
      bindings.push(id);
    } else {
      query = `SELECT id, latitude, longitude, city_id FROM ${safeTable}
               WHERE latitude IS NOT NULL AND longitude IS NOT NULL
               AND (city_id IS NULL OR city_id = '')
               LIMIT ?`;
      bindings.push(limit);
    }

    const records = await db.prepare(query).bind(...bindings).all<{
      id: string;
      latitude: number;
      longitude: number;
      city_id: string | null;
    }>();

    const items = records.results || [];
    if (items.length === 0) {
      return c.json({ data: null, error: null, message: 'No records to geo-link' });
    }

    let linked = 0;
    let skipped = 0;
    const results: Array<{ id: string; city_id: string | null; city_name: string | null; distance_km: number | null }> = [];

    for (const item of items) {
      if (item.city_id) {
        skipped++;
        continue;
      }

      // Find nearest city using haversine distance
      let nearestCity: typeof allCities[0] | null = null;
      let minDist = Infinity;

      for (const city of allCities) {
        const dist = haversineKm(item.latitude, item.longitude, city.latitude, city.longitude);
        if (dist < minDist) {
          minDist = dist;
          nearestCity = city;
        }
      }

      // Only link if within 100km
      if (nearestCity && minDist <= 100) {
        await db
          .prepare(`UPDATE ${safeTable} SET city_id = ?, updated_at = ? WHERE id = ?`)
          .bind(nearestCity.id, new Date().toISOString(), item.id)
          .run();

        // Also set country_id if the table has it and city has one
        if (nearestCity.country_id) {
          try {
            await db
              .prepare(`UPDATE ${safeTable} SET country_id = ? WHERE id = ? AND (country_id IS NULL OR country_id = '')`)
              .bind(nearestCity.country_id, item.id)
              .run();
          } catch {
            /* table may not have country_id column */
          }
        }

        linked++;
        results.push({
          id: item.id,
          city_id: nearestCity.id,
          city_name: nearestCity.name,
          distance_km: Math.round(minDist * 10) / 10,
        });
      } else {
        skipped++;
        results.push({ id: item.id, city_id: null, city_name: null, distance_km: minDist === Infinity ? null : Math.round(minDist * 10) / 10 });
      }
    }

    return c.json({
      data: {
        total_processed: items.length,
        total_linked: linked,
        total_skipped: skipped,
        results,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Geo-link error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 8. POST /enrichment/link-locations ───────────────────────────────

enrichment.post('/link-locations', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, batch_size } = body as { table?: string; batch_size?: number };
    const db = c.env.DB;

    const safeTable = sanitizeIdentifier(table || 'venues');
    const VALID_TABLES = ['venues', 'events'];
    if (!VALID_TABLES.includes(safeTable)) {
      return c.json({ data: null, error: `Invalid table. Must be one of: ${VALID_TABLES.join(', ')}` }, 400);
    }

    const limit = Math.min(batch_size || 100, 500);

    // Fetch records missing city_id, that have a city name column
    const nameCol = safeTable === 'events' ? 'title' : 'name';
    const records = await db
      .prepare(
        `SELECT id, ${nameCol} as name, city, country, city_id, country_id
         FROM ${safeTable}
         WHERE (city_id IS NULL OR city_id = '')
         AND city IS NOT NULL AND city != ''
         LIMIT ?`,
      )
      .bind(limit)
      .all<{
        id: string;
        name: string;
        city: string | null;
        country: string | null;
        city_id: string | null;
        country_id: string | null;
      }>();

    const items = records.results || [];
    if (items.length === 0) {
      return c.json({ data: null, error: null, message: 'No records to link' });
    }

    // Load cities and countries for text matching
    const countriesResult = await db
      .prepare('SELECT id, name, code FROM countries')
      .all<{ id: string; name: string; code: string }>();
    const allCountries = countriesResult.results || [];

    const citiesResult = await db
      .prepare('SELECT id, name, country_id FROM cities ORDER BY name')
      .all<{ id: string; name: string; country_id: string | null }>();
    const allCities = citiesResult.results || [];

    // Build lookup maps
    const countryByName = new Map<string, { id: string; name: string }>();
    const countryByCode = new Map<string, { id: string; name: string }>();
    for (const co of allCountries) {
      countryByName.set(co.name.toLowerCase(), co);
      if (co.code) countryByCode.set(co.code.toLowerCase(), co);
    }

    const citiesByName = new Map<string, typeof allCities>();
    for (const ci of allCities) {
      const key = ci.name.toLowerCase();
      if (!citiesByName.has(key)) citiesByName.set(key, []);
      citiesByName.get(key)!.push(ci);
    }

    let linked = 0;
    let skipped = 0;

    for (const item of items) {
      // Resolve country
      let resolvedCountryId = item.country_id;
      if (!resolvedCountryId && item.country) {
        const normalizedCountry = resolveCountryAlias(item.country).toLowerCase();
        const co = countryByName.get(normalizedCountry) || countryByCode.get(item.country.trim().toLowerCase());
        if (co) resolvedCountryId = co.id;
      }

      // Resolve city by name match
      let resolvedCityId = item.city_id;
      if (!resolvedCityId && item.city) {
        const candidates = citiesByName.get(item.city.trim().toLowerCase());
        if (candidates) {
          // Prefer match in same country
          if (resolvedCountryId) {
            const inCountry = candidates.find((ci) => ci.country_id === resolvedCountryId);
            if (inCountry) resolvedCityId = inCountry.id;
          }
          if (!resolvedCityId) resolvedCityId = candidates[0].id;
        }
      }

      if (!resolvedCityId && !resolvedCountryId) {
        skipped++;
        continue;
      }

      const updates: Record<string, unknown> = {};
      if (resolvedCityId && !item.city_id) updates.city_id = resolvedCityId;
      if (resolvedCountryId && !item.country_id) updates.country_id = resolvedCountryId;

      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
        await db
          .prepare(`UPDATE ${safeTable} SET ${setClauses} WHERE id = ?`)
          .bind(...Object.values(updates), item.id)
          .run();
        linked++;
      } else {
        skipped++;
      }
    }

    return c.json({
      data: {
        total_processed: items.length,
        total_linked: linked,
        total_skipped: skipped,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Link locations error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 9. POST /enrichment/populate-embeddings ──────────────────────────

enrichment.post('/populate-embeddings', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, id, batch_size } = body as {
      table?: string;
      id?: string;
      batch_size?: number;
    };
    const db = c.env.DB;

    const VALID_TABLES = ['venues', 'events', 'personalities', 'news_articles', 'cities', 'community_groups'];
    const targetTable = table ? sanitizeIdentifier(table) : 'venues';
    if (!VALID_TABLES.includes(targetTable)) {
      return c.json({ data: null, error: `Invalid table. Must be one of: ${VALID_TABLES.join(', ')}` }, 400);
    }

    const limit = Math.min(batch_size || 50, 200);
    const openaiKey = (c.env as any).OPENAI_API_KEY;
    if (!openaiKey) {
      return c.json({ data: null, error: 'OPENAI_API_KEY not configured' }, 500);
    }

    // Build content text based on table type
    const textColumnMap: Record<string, { cols: string; builder: (row: any) => string }> = {
      venues: {
        cols: 'id, name, description, address, city, country, category',
        builder: (r) =>
          [r.name, r.description, r.address, r.city, r.country, r.category ? `Category: ${r.category}` : '']
            .filter(Boolean)
            .join('. '),
      },
      events: {
        cols: 'id, title, description, city, country, event_type',
        builder: (r) =>
          [r.title, r.description, r.city, r.event_type ? `Type: ${r.event_type}` : '']
            .filter(Boolean)
            .join('. '),
      },
      personalities: {
        cols: 'id, name, bio, nationality, profession',
        builder: (r) =>
          [r.name, r.bio, r.nationality ? `Nationality: ${r.nationality}` : '', r.profession ? `Profession: ${r.profession}` : '']
            .filter(Boolean)
            .join('. '),
      },
      news_articles: {
        cols: 'id, title, content, description',
        builder: (r) => [r.title, r.description || (r.content || '').substring(0, 500)].filter(Boolean).join('. '),
      },
      cities: {
        cols: 'id, name, description, country_id',
        builder: (r) => [r.name, r.description].filter(Boolean).join('. '),
      },
      community_groups: {
        cols: 'id, name, description',
        builder: (r) => [r.name, r.description].filter(Boolean).join('. '),
      },
    };

    const config = textColumnMap[targetTable];
    let query: string;
    const bindings: unknown[] = [];

    if (id) {
      query = `SELECT ${config.cols} FROM ${targetTable} WHERE id = ?`;
      bindings.push(id);
    } else {
      query = `SELECT ${config.cols} FROM ${targetTable} LIMIT ?`;
      bindings.push(limit);
    }

    const records = await db.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    const items = records.results || [];

    if (items.length === 0) {
      return c.json({ data: null, error: null, message: 'No records to process' });
    }

    // Build text for each item
    const textsToEmbed: Array<{ id: string; text: string }> = [];
    for (const item of items) {
      const text = config.builder(item).trim().substring(0, 8000);
      if (text.length > 10) {
        textsToEmbed.push({ id: item.id as string, text });
      }
    }

    if (textsToEmbed.length === 0) {
      return c.json({ data: null, error: null, message: 'No content to embed' });
    }

    // Generate embeddings via OpenAI API in batches
    let totalProcessed = 0;
    let totalErrors = 0;
    const BATCH = 20;

    for (let i = 0; i < textsToEmbed.length; i += BATCH) {
      const batch = textsToEmbed.slice(i, i + BATCH);

      try {
        const embRes = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: batch.map((b) => b.text),
          }),
        });

        if (!embRes.ok) {
          const errText = await embRes.text();
          console.error(`OpenAI embeddings error: ${embRes.status} ${errText}`);
          totalErrors += batch.length;
          continue;
        }

        const embData = (await embRes.json()) as any;
        const embeddings = embData.data as Array<{ embedding: number[]; index: number }>;

        // Store embeddings
        for (const emb of embeddings) {
          const item = batch[emb.index];
          try {
            await db
              .prepare(
                `INSERT INTO content_embeddings (content_type, content_id, content_text, embedding, created_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(content_type, content_id) DO UPDATE SET
                   content_text = excluded.content_text,
                   embedding = excluded.embedding,
                   updated_at = ?`,
              )
              .bind(
                targetTable,
                item.id,
                item.text.substring(0, 2000),
                JSON.stringify(emb.embedding),
                new Date().toISOString(),
                new Date().toISOString(),
              )
              .run();
            totalProcessed++;
          } catch (e) {
            console.error('Embedding insert error:', e);
            totalErrors++;
          }
        }
      } catch (e) {
        console.error('Embeddings batch error:', e);
        totalErrors += batch.length;
      }
    }

    return c.json({
      data: {
        total_processed: totalProcessed,
        total_errors: totalErrors,
        model: 'text-embedding-3-small',
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Populate embeddings error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 10. POST /enrichment/populate-optimization-status ────────────────

enrichment.post('/populate-optimization-status', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { table, batch_size } = body as { table?: string; batch_size?: number };
    const db = c.env.DB;

    const VALID_TABLES = ['venues', 'events', 'personalities', 'cities', 'news_articles'];
    const targetTable = table ? sanitizeIdentifier(table) : null;
    const tablesToProcess = targetTable && VALID_TABLES.includes(targetTable) ? [targetTable] : VALID_TABLES;
    const limit = Math.min(batch_size || 100, 500);

    let totalProcessed = 0;

    // Define required fields per table for scoring
    const fieldConfig: Record<string, string[]> = {
      venues: ['name', 'description', 'address', 'city', 'country', 'latitude', 'longitude', 'image_url', 'category', 'phone', 'website'],
      events: ['title', 'description', 'city', 'country', 'start_date', 'image_url', 'event_type', 'latitude', 'longitude'],
      personalities: ['name', 'bio', 'birth_date', 'nationality', 'image_url', 'profession', 'wikipedia_url'],
      cities: ['name', 'description', 'latitude', 'longitude', 'image_url', 'country_id'],
      news_articles: ['title', 'content', 'description', 'url', 'image_url', 'source', 'published_at'],
    };

    for (const tbl of tablesToProcess) {
      const fields = fieldConfig[tbl];
      if (!fields) continue;

      const selectCols = ['id', ...fields].join(', ');
      const records = await db
        .prepare(`SELECT ${selectCols} FROM ${tbl} LIMIT ?`)
        .bind(limit)
        .all<Record<string, unknown>>();

      const items = records.results || [];

      for (const item of items) {
        // Calculate completeness score
        let filledCount = 0;
        for (const field of fields) {
          const val = item[field];
          if (val !== null && val !== undefined && val !== '') {
            // Bonus for longer descriptions
            if (field === 'description' || field === 'bio' || field === 'content') {
              filledCount += String(val).length > 100 ? 1 : 0.5;
            } else {
              filledCount++;
            }
          }
        }

        const score = Math.round((filledCount / fields.length) * 100);

        // Update optimization_score on the record
        try {
          await db
            .prepare(`UPDATE ${tbl} SET optimization_score = ?, updated_at = ? WHERE id = ?`)
            .bind(score, new Date().toISOString(), item.id)
            .run();
          totalProcessed++;
        } catch {
          // Column may not exist on all tables; skip silently
        }
      }
    }

    return c.json({
      data: {
        tables_processed: tablesToProcess,
        total_processed: totalProcessed,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Populate optimization status error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 11. POST /enrichment/resolve-city ────────────────────────────────

enrichment.post('/resolve-city', async (c) => {
  try {
    const body = await c.req.json();
    const { city_name, country_code, latitude, longitude } = body as {
      city_name?: string;
      country_code?: string;
      latitude?: number;
      longitude?: number;
    };
    const db = c.env.DB;

    if (!city_name) {
      return c.json({ data: null, error: 'city_name is required' }, 400);
    }

    const resolvedCountryName = country_code ? resolveCountryAlias(country_code) : null;

    // Step 1: Try to find existing city by name
    let countryId: string | null = null;
    if (resolvedCountryName) {
      const co = await db
        .prepare('SELECT id FROM countries WHERE name = ? COLLATE NOCASE OR code = ? COLLATE NOCASE LIMIT 1')
        .bind(resolvedCountryName, country_code || '')
        .first<{ id: string }>();
      if (co) countryId = co.id;
    }

    // Search for city
    let existingCity: { id: string; name: string } | null = null;
    if (countryId) {
      existingCity = await db
        .prepare('SELECT id, name FROM cities WHERE name = ? COLLATE NOCASE AND country_id = ? LIMIT 1')
        .bind(city_name.trim(), countryId)
        .first<{ id: string; name: string }>();
    }
    if (!existingCity) {
      existingCity = await db
        .prepare('SELECT id, name FROM cities WHERE name = ? COLLATE NOCASE LIMIT 1')
        .bind(city_name.trim())
        .first<{ id: string; name: string }>();
    }

    if (existingCity) {
      return c.json({
        data: { city_id: existingCity.id, city_name: existingCity.name, created: false },
        error: null,
      });
    }

    // Step 2: Geocode with Mapbox if no coordinates provided
    let lat = latitude;
    let lng = longitude;
    const mapboxToken = (c.env as any).MAPBOX_ACCESS_TOKEN;

    if ((!lat || !lng) && mapboxToken) {
      try {
        const geoQuery = resolvedCountryName ? `${city_name}, ${resolvedCountryName}` : city_name;
        const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geoQuery)}.json?access_token=${mapboxToken}&limit=1&types=place`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
          const geoData = (await geoRes.json()) as any;
          const feature = geoData.features?.[0];
          if (feature?.center) {
            lng = feature.center[0];
            lat = feature.center[1];
          }
          // Try to resolve country from geocoding context if not already set
          if (!countryId && feature?.context) {
            const countryCtx = feature.context.find((ctx: any) => ctx.id?.startsWith('country'));
            if (countryCtx?.text) {
              const co = await db
                .prepare('SELECT id FROM countries WHERE name = ? COLLATE NOCASE LIMIT 1')
                .bind(countryCtx.text)
                .first<{ id: string }>();
              if (co) countryId = co.id;
            }
          }
        }
      } catch (e) {
        console.error('Geocoding error for resolve-city:', e);
      }
    }

    // Fallback: try Photon geocoder (free, no API key)
    if (!lat || !lng) {
      try {
        const photonQuery = resolvedCountryName ? `${city_name}, ${resolvedCountryName}` : city_name;
        const photonUrl = `https://photon.komoot.io/api?q=${encodeURIComponent(photonQuery)}&limit=1&lang=en`;
        const photonRes = await fetch(photonUrl);
        if (photonRes.ok) {
          const photonData = (await photonRes.json()) as any;
          const feature = photonData.features?.[0];
          if (feature?.geometry?.coordinates) {
            lng = feature.geometry.coordinates[0];
            lat = feature.geometry.coordinates[1];
          }
        }
      } catch {
        /* skip */
      }
    }

    // Step 3: Create city
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO cities (id, name, country_id, latitude, longitude, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId, city_name.trim(), countryId, lat || null, lng || null, now, now)
      .run();

    return c.json({
      data: { city_id: newId, city_name: city_name.trim(), created: true },
      error: null,
    });
  } catch (err: any) {
    console.error('Resolve city error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

// ─── 12. POST /enrichment/update-concerts ─────────────────────────────

enrichment.post('/update-concerts', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { personality_id, batch_size } = body as {
      personality_id?: string;
      batch_size?: number;
    };
    const db = c.env.DB;

    // Fetch music personalities
    let query: string;
    const bindings: unknown[] = [];

    if (personality_id) {
      query = 'SELECT id, name, profession FROM personalities WHERE id = ?';
      bindings.push(personality_id);
    } else {
      const limit = Math.min(batch_size || 20, 100);
      query = `SELECT id, name, profession FROM personalities
               WHERE is_living = 1
               AND (profession LIKE '%musician%' OR profession LIKE '%singer%'
                    OR profession LIKE '%composer%' OR profession LIKE '%rapper%'
                    OR profession LIKE '%band%')
               LIMIT ?`;
      bindings.push(limit);
    }

    const records = await db.prepare(query).bind(...bindings).all<{
      id: string;
      name: string;
      profession: string | null;
    }>();

    const musicians = records.results || [];
    if (musicians.length === 0) {
      return c.json({ data: null, error: null, message: 'No musicians found to update' });
    }

    let updated = 0;
    const errors: string[] = [];
    const results: Array<{ id: string; name: string; concerts_found: number }> = [];

    for (const musician of musicians) {
      try {
        const cleanedName = musician.name.replace(/\s*\(.*?\).*$/, '').trim();

        // Search Bandsintown for upcoming events
        const artistUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}?app_id=queer-guide`;
        const artistRes = await fetch(artistUrl);

        if (!artistRes.ok) {
          results.push({ id: musician.id, name: musician.name, concerts_found: 0 });
          continue;
        }

        const artistData = (await artistRes.json()) as any;
        if (!artistData || artistData.error) {
          results.push({ id: musician.id, name: musician.name, concerts_found: 0 });
          continue;
        }

        // Fetch upcoming events
        const eventsUrl = `https://rest.bandsintown.com/artists/${encodeURIComponent(cleanedName)}/events?app_id=queer-guide&date=upcoming`;
        const eventsRes = await fetch(eventsUrl);

        let concerts: unknown[] = [];
        if (eventsRes.ok) {
          const eventsData = (await eventsRes.json()) as any[];
          if (Array.isArray(eventsData)) {
            concerts = eventsData.slice(0, 10).map((event) => ({
              id: event.id,
              datetime: event.datetime,
              venue: {
                name: event.venue?.name || 'TBA',
                city: event.venue?.city || 'TBA',
                country: event.venue?.country || 'TBA',
                region: event.venue?.region || '',
              },
              lineup: event.lineup || [cleanedName],
              url: event.url || '',
            }));
          }
        }

        // Update personality record
        await db
          .prepare('UPDATE personalities SET next_concerts = ?, updated_at = ? WHERE id = ?')
          .bind(JSON.stringify(concerts), new Date().toISOString(), musician.id)
          .run();

        updated++;
        results.push({ id: musician.id, name: musician.name, concerts_found: concerts.length });
      } catch (e: any) {
        console.error(`Error updating concerts for ${musician.name}:`, e);
        errors.push(`${musician.name}: ${e.message}`);
      }
    }

    return c.json({
      data: {
        updated,
        errors: errors.length,
        results,
        error_details: errors.length > 0 ? errors : undefined,
      },
      error: null,
    });
  } catch (err: any) {
    console.error('Update concerts error:', err);
    return c.json({ data: null, error: err.message }, 500);
  }
});

export { enrichment };
