/**
 * Imports API — consolidates all data import functions into a single Hono router.
 * All routes require admin authentication.
 *
 * Migrated from multiple Supabase Edge Functions:
 *   import-csv, import-city-data, import-country-data, import-airports,
 *   import-foursquare, import-google-places, import-tripadvisor, import-tomtom,
 *   import-eventbrite, import-ticketmaster, import-refuge-restrooms,
 *   import-ilga-data, import-awin-products, background-import,
 *   bulk-create-personalities, bulk-ai-tags, bulk-scrape-events
 */
import { Hono } from 'hono';
import type { Env, AuthUser } from '../types';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { chatCompletion } from '../lib/openai';

const imports = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

// All import routes require admin auth
imports.use('*', requireAuth as any, requireAdmin as any);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple CSV parser that handles quoted fields and newlines within quotes. */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
        i++;
      } else if (ch === '\n' || (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n')) {
        row.push(field.trim());
        field = '';
        if (row.some((f) => f !== '')) rows.push(row);
        row = [];
        i += ch === '\r' ? 2 : 1;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push last field/row
  if (field || row.length) {
    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);
  }

  return rows;
}

/** Convert CSV rows (with header row) to array of objects. */
function csvToObjects(csv: string): Record<string, string>[] {
  const rows = parseCSV(csv);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
}

/** Sanitize a SQL identifier to prevent injection. */
function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Check if a venue/event with the same name exists within ~100m radius. */
async function findNearbyDuplicate(
  db: D1Database,
  table: string,
  name: string,
  lat: number,
  lng: number,
): Promise<Record<string, unknown> | null> {
  const result = await db
    .prepare(
      `SELECT id FROM ${sanitizeId(table)}
       WHERE name = ? AND ABS(latitude - ?) < 0.001 AND ABS(longitude - ?) < 0.001
       LIMIT 1`,
    )
    .bind(name, lat, lng)
    .first();
  return result as Record<string, unknown> | null;
}

/** Generate a UUID. */
function uuid(): string {
  return crypto.randomUUID();
}

/** Current ISO timestamp. */
function now(): string {
  return new Date().toISOString();
}

/** Sleep for rate-limiting between batch API calls. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safely run an upsert, returning success/error info. */
async function safeUpsert(
  db: D1Database,
  table: string,
  row: Record<string, unknown>,
  conflictColumns: string[],
): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = Object.keys(row);
    const placeholders = keys.map(() => '?').join(', ');
    const updateCols = keys
      .filter((k) => !conflictColumns.includes(k))
      .map((k) => `${k} = excluded.${k}`)
      .join(', ');
    const sql = `INSERT INTO ${sanitizeId(table)} (${keys.join(', ')}) VALUES (${placeholders})
      ON CONFLICT(${conflictColumns.join(', ')}) DO UPDATE SET ${updateCols || 'id = id'}`;
    const values = keys.map((k) => {
      const v = row[k];
      return typeof v === 'object' && v !== null ? JSON.stringify(v) : (v ?? null);
    });
    await db.prepare(sql).bind(...values).run();
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Map of CSV import type to table name and column mappings. */
const CSV_TYPE_CONFIG: Record<
  string,
  { table: string; conflictColumns: string[]; mapRow: (row: Record<string, string>) => Record<string, unknown> }
> = {
  venues: {
    table: 'venues',
    conflictColumns: ['id'],
    mapRow: (r) => ({
      id: r.id || uuid(),
      name: r.name || r.venue_name || '',
      slug: r.slug || (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: r.description || '',
      address: r.address || '',
      city_id: r.city_id || null,
      latitude: r.latitude ? parseFloat(r.latitude) : null,
      longitude: r.longitude ? parseFloat(r.longitude) : null,
      phone: r.phone || null,
      website: r.website || null,
      category: r.category || r.type || null,
      rating: r.rating ? parseFloat(r.rating) : null,
      price_level: r.price_level ? parseInt(r.price_level) : null,
      is_active: r.is_active === 'false' ? 0 : 1,
      created_at: r.created_at || now(),
      updated_at: now(),
    }),
  },
  events: {
    table: 'events',
    conflictColumns: ['id'],
    mapRow: (r) => ({
      id: r.id || uuid(),
      name: r.name || r.event_name || r.title || '',
      slug: r.slug || (r.name || r.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: r.description || '',
      venue_id: r.venue_id || null,
      city_id: r.city_id || null,
      start_date: r.start_date || r.date || null,
      end_date: r.end_date || null,
      start_time: r.start_time || null,
      end_time: r.end_time || null,
      category: r.category || r.type || null,
      website: r.website || r.url || null,
      ticket_url: r.ticket_url || null,
      price: r.price || null,
      is_free: r.is_free === 'true' ? 1 : 0,
      is_recurring: r.is_recurring === 'true' ? 1 : 0,
      latitude: r.latitude ? parseFloat(r.latitude) : null,
      longitude: r.longitude ? parseFloat(r.longitude) : null,
      created_at: r.created_at || now(),
      updated_at: now(),
    }),
  },
  personalities: {
    table: 'personalities',
    conflictColumns: ['id'],
    mapRow: (r) => ({
      id: r.id || uuid(),
      name: r.name || '',
      slug: r.slug || (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: r.description || r.bio || '',
      category: r.category || null,
      birth_date: r.birth_date || null,
      death_date: r.death_date || null,
      nationality: r.nationality || null,
      image_url: r.image_url || null,
      wikipedia_url: r.wikipedia_url || null,
      created_at: r.created_at || now(),
      updated_at: now(),
    }),
  },
  tags: {
    table: 'unified_tags',
    conflictColumns: ['id'],
    mapRow: (r) => ({
      id: r.id || uuid(),
      name: r.name || r.tag || '',
      slug: r.slug || (r.name || r.tag || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category_id: r.category_id || null,
      description: r.description || null,
      created_at: r.created_at || now(),
      updated_at: now(),
    }),
  },
  'adult-models': {
    table: 'adult_models',
    conflictColumns: ['id'],
    mapRow: (r) => ({
      id: r.id || uuid(),
      name: r.name || r.model_name || '',
      slug: r.slug || (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      bio: r.bio || r.description || '',
      platform: r.platform || null,
      profile_url: r.profile_url || r.url || null,
      image_url: r.image_url || null,
      is_active: r.is_active === 'false' ? 0 : 1,
      created_at: r.created_at || now(),
      updated_at: now(),
    }),
  },
};

// ---------------------------------------------------------------------------
// 1. POST /imports/csv/:type — Generic CSV import
// ---------------------------------------------------------------------------
imports.post('/csv/:type', async (c) => {
  const type = c.req.param('type');
  const config = CSV_TYPE_CONFIG[type];
  if (!config) {
    return c.json({ error: `Unknown import type: ${type}. Supported: ${Object.keys(CSV_TYPE_CONFIG).join(', ')}` }, 400);
  }

  const body = await c.req.json<{ csv_data?: string; csv_url?: string }>();
  let csvText: string;

  if (body.csv_data) {
    csvText = body.csv_data;
  } else if (body.csv_url) {
    const res = await fetch(body.csv_url);
    if (!res.ok) return c.json({ error: `Failed to fetch CSV from URL: ${res.status}` }, 400);
    csvText = await res.text();
  } else {
    return c.json({ error: 'Provide csv_data or csv_url' }, 400);
  }

  const records = csvToObjects(csvText);
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      const mapped = config.mapRow(record);
      const result = await safeUpsert(c.env.DB, config.table, mapped, config.conflictColumns);
      if (result.success) {
        imported++;
      } else {
        errors.push(`Row "${record.name || record.id || '?'}": ${result.error}`);
        skipped++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Row "${record.name || '?'}": ${msg}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 2. POST /imports/city-data — Import city data
// ---------------------------------------------------------------------------
imports.post('/city-data', async (c) => {
  const body = await c.req.json<{
    cities?: Array<{
      name: string;
      country_code: string;
      latitude: number;
      longitude: number;
      population?: number;
      timezone?: string;
    }>;
    source?: string;
    country_code?: string;
  }>();

  let cities = body.cities;

  if (body.source === 'geonames' && body.country_code) {
    try {
      const res = await fetch(
        `http://api.geonames.org/searchJSON?country=${encodeURIComponent(body.country_code)}&featureClass=P&maxRows=1000&orderby=population&username=demo`,
      );
      if (!res.ok) return c.json({ error: `GeoNames API error: ${res.status}` }, 502);
      const data = (await res.json()) as { geonames: Array<Record<string, unknown>> };
      cities = (data.geonames || []).map((g: any) => ({
        name: g.name,
        country_code: g.countryCode,
        latitude: parseFloat(g.lat),
        longitude: parseFloat(g.lng),
        population: g.population ? parseInt(g.population) : undefined,
        timezone: g.timezone?.timeZoneId,
      }));
    } catch (e: unknown) {
      return c.json({ error: `GeoNames fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (!cities || !cities.length) {
    return c.json({ error: 'Provide cities array or source=geonames with country_code' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const city of cities) {
    const row: Record<string, unknown> = {
      id: uuid(),
      name: city.name,
      country_code: city.country_code,
      latitude: city.latitude,
      longitude: city.longitude,
      population: city.population ?? null,
      timezone: city.timezone ?? null,
      slug: city.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'cities', row, ['name', 'country_code']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`City "${city.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 3. POST /imports/country-data — Import country data
// ---------------------------------------------------------------------------
imports.post('/country-data', async (c) => {
  const body = await c.req.json<{
    countries?: Array<Record<string, unknown>>;
    source?: string;
  }>();

  let countries = body.countries;

  if (body.source === 'restcountries') {
    try {
      const res = await fetch('https://restcountries.com/v3.1/all');
      if (!res.ok) return c.json({ error: `REST Countries API error: ${res.status}` }, 502);
      const data = (await res.json()) as Array<Record<string, any>>;
      countries = data.map((c: any) => ({
        code: c.cca2,
        name: c.name?.common || '',
        official_name: c.name?.official || '',
        continent: c.continents?.[0] || '',
        region: c.region || '',
        subregion: c.subregion || '',
        capital: Array.isArray(c.capital) ? c.capital[0] : c.capital || '',
        population: c.population || 0,
        area: c.area || 0,
        languages: c.languages ? Object.values(c.languages).join(', ') : '',
        currencies: c.currencies
          ? Object.entries(c.currencies)
              .map(([code, info]: [string, any]) => `${code} (${info.name})`)
              .join(', ')
          : '',
        flag_emoji: c.flag || '',
        flag_svg: c.flags?.svg || '',
        latitude: c.latlng?.[0] || null,
        longitude: c.latlng?.[1] || null,
      }));
    } catch (e: unknown) {
      return c.json({ error: `REST Countries fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (!countries || !countries.length) {
    return c.json({ error: 'Provide countries array or source=restcountries' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const country of countries) {
    const row: Record<string, unknown> = {
      id: uuid(),
      code: country.code,
      name: country.name,
      official_name: country.official_name || null,
      continent: country.continent || null,
      region: country.region || null,
      subregion: country.subregion || null,
      capital: country.capital || null,
      population: country.population || null,
      area: country.area || null,
      languages: country.languages || null,
      currencies: country.currencies || null,
      flag_emoji: country.flag_emoji || null,
      flag_svg: country.flag_svg || null,
      latitude: country.latitude || null,
      longitude: country.longitude || null,
      slug: String(country.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'countries', row, ['code']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Country "${country.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 4. POST /imports/airports — Import airports
// ---------------------------------------------------------------------------
imports.post('/airports', async (c) => {
  const body = await c.req.json<{
    airports?: Array<{ iata: string; name: string; city: string; country: string; lat: number; lng: number }>;
    source?: string;
  }>();

  let airports = body.airports;

  if (body.source === 'ourairports') {
    try {
      const res = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv');
      if (!res.ok) return c.json({ error: `OurAirports fetch error: ${res.status}` }, 502);
      const csvText = await res.text();
      const records = csvToObjects(csvText);
      airports = records
        .filter((r) => r.iata_code && r.iata_code !== '' && r.type === 'large_airport')
        .map((r) => ({
          iata: r.iata_code,
          name: r.name,
          city: r.municipality || '',
          country: r.iso_country || '',
          lat: parseFloat(r.latitude_deg) || 0,
          lng: parseFloat(r.longitude_deg) || 0,
        }));
    } catch (e: unknown) {
      return c.json({ error: `OurAirports fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
  }

  if (!airports || !airports.length) {
    return c.json({ error: 'Provide airports array or source=ourairports' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const airport of airports) {
    const row: Record<string, unknown> = {
      id: uuid(),
      iata_code: airport.iata,
      name: airport.name,
      city: airport.city,
      country_code: airport.country,
      latitude: airport.lat,
      longitude: airport.lng,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'airports', row, ['iata_code']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Airport "${airport.iata}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 5. POST /imports/foursquare — Import venues from Foursquare
// ---------------------------------------------------------------------------
imports.post('/foursquare', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    category?: string;
    limit?: number;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).FOURSQUARE_API_KEY;
  if (!apiKey) return c.json({ error: 'FOURSQUARE_API_KEY not configured' }, 500);

  // Fetch city coordinates
  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const limit = Math.min(body.limit || 50, 50);
  const params = new URLSearchParams({
    ll: `${city.latitude},${city.longitude}`,
    limit: String(limit),
    sort: 'RELEVANCE',
  });
  if (body.query) params.set('query', body.query);
  if (body.category) params.set('categories', body.category);

  let venues: any[];
  try {
    const res = await fetch(`https://api.foursquare.com/v3/places/search?${params}`, {
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `Foursquare API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as { results: any[] };
    venues = data.results || [];
  } catch (e: unknown) {
    return c.json({ error: `Foursquare fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const v of venues) {
    const lat = v.geocodes?.main?.latitude;
    const lng = v.geocodes?.main?.longitude;

    // Deduplicate by name + proximity
    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'venues', v.name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const row: Record<string, unknown> = {
      id: uuid(),
      name: v.name,
      slug: v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: v.description || '',
      address: [v.location?.address, v.location?.locality, v.location?.region].filter(Boolean).join(', '),
      city_id: body.city_id,
      latitude: lat || null,
      longitude: lng || null,
      phone: v.tel || null,
      website: v.website || null,
      category: v.categories?.[0]?.name || null,
      source: 'foursquare',
      source_id: v.fsq_id || null,
      rating: v.rating ? v.rating / 2 : null, // Foursquare uses 0-10 scale
      price_level: v.price || null,
      is_active: 1,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'venues', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Venue "${v.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'foursquare' }, error: null });
});

// ---------------------------------------------------------------------------
// 6. POST /imports/google-places — Import venues from Google Places
// ---------------------------------------------------------------------------
imports.post('/google-places', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    type?: string;
    limit?: number;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).GOOGLE_PLACES_API_KEY;
  if (!apiKey) return c.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, 500);

  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const limit = Math.min(body.limit || 20, 60);
  const params = new URLSearchParams({
    location: `${city.latitude},${city.longitude}`,
    radius: '10000',
    key: apiKey,
  });
  if (body.query) params.set('keyword', body.query);
  if (body.type) params.set('type', body.type);

  let allPlaces: any[] = [];
  let nextPageToken: string | undefined;

  try {
    // Google Places returns max 20 per page; fetch up to 3 pages
    for (let page = 0; page < 3 && allPlaces.length < limit; page++) {
      if (page > 0 && nextPageToken) {
        await sleep(2000); // Google requires delay between page token requests
        params.set('pagetoken', nextPageToken);
      }

      const res = await fetch(`https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params}`);
      if (!res.ok) {
        const errText = await res.text();
        return c.json({ error: `Google Places API error ${res.status}: ${errText}` }, 502);
      }

      const data = (await res.json()) as { results: any[]; next_page_token?: string };
      allPlaces.push(...(data.results || []));
      nextPageToken = data.next_page_token;
      if (!nextPageToken) break;
    }
  } catch (e: unknown) {
    return c.json({ error: `Google Places fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  // Trim to limit
  allPlaces = allPlaces.slice(0, limit);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of allPlaces) {
    const lat = p.geometry?.location?.lat;
    const lng = p.geometry?.location?.lng;

    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'venues', p.name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const row: Record<string, unknown> = {
      id: uuid(),
      name: p.name,
      slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: '',
      address: p.vicinity || p.formatted_address || '',
      city_id: body.city_id,
      latitude: lat || null,
      longitude: lng || null,
      phone: null,
      website: null,
      category: p.types?.[0] || null,
      source: 'google_places',
      source_id: p.place_id || null,
      rating: p.rating || null,
      price_level: p.price_level || null,
      is_active: p.business_status === 'OPERATIONAL' ? 1 : 0,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'venues', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Place "${p.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'google_places' }, error: null });
});

// ---------------------------------------------------------------------------
// 7. POST /imports/tripadvisor — Import venues from TripAdvisor
// ---------------------------------------------------------------------------
imports.post('/tripadvisor', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    category?: string;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).TRIPADVISOR_API_KEY;
  if (!apiKey) return c.json({ error: 'TRIPADVISOR_API_KEY not configured' }, 500);

  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const params = new URLSearchParams({
    latLong: `${city.latitude},${city.longitude}`,
    key: apiKey,
    language: 'en',
    radius: '10',
    radiusUnit: 'km',
  });
  if (body.query) params.set('searchQuery', body.query);
  if (body.category) params.set('category', body.category);

  let places: any[];
  try {
    const res = await fetch(`https://api.content.tripadvisor.com/api/v1/location/nearby_search?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `TripAdvisor API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as { data: any[] };
    places = data.data || [];
  } catch (e: unknown) {
    return c.json({ error: `TripAdvisor fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of places) {
    const lat = p.latitude ? parseFloat(p.latitude) : null;
    const lng = p.longitude ? parseFloat(p.longitude) : null;

    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'venues', p.name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const row: Record<string, unknown> = {
      id: uuid(),
      name: p.name,
      slug: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: p.description || '',
      address: p.address_obj
        ? [p.address_obj.street1, p.address_obj.city, p.address_obj.state].filter(Boolean).join(', ')
        : '',
      city_id: body.city_id,
      latitude: lat,
      longitude: lng,
      phone: p.phone || null,
      website: p.website || null,
      category: p.category?.name || body.category || null,
      source: 'tripadvisor',
      source_id: p.location_id || null,
      rating: p.rating ? parseFloat(p.rating) : null,
      price_level: p.price_level ? p.price_level.length : null, // "$" -> 1, "$$" -> 2, etc.
      is_active: 1,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'venues', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Venue "${p.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'tripadvisor' }, error: null });
});

// ---------------------------------------------------------------------------
// 8. POST /imports/tomtom — Import venues from TomTom
// ---------------------------------------------------------------------------
imports.post('/tomtom', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    category?: string;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).TOMTOM_API_KEY;
  if (!apiKey) return c.json({ error: 'TOMTOM_API_KEY not configured' }, 500);

  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const query = body.query || body.category || 'lgbtq';
  const params = new URLSearchParams({
    key: apiKey,
    lat: String(city.latitude),
    lon: String(city.longitude),
    radius: '10000',
    limit: '100',
    language: 'en-US',
  });
  if (body.category) params.set('categorySet', body.category);

  let pois: any[];
  try {
    const res = await fetch(
      `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?${params}`,
    );
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `TomTom API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as { results: any[] };
    pois = data.results || [];
  } catch (e: unknown) {
    return c.json({ error: `TomTom fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of pois) {
    const lat = p.position?.lat;
    const lng = p.position?.lon;
    const name = p.poi?.name || p.address?.freeformAddress || 'Unknown';

    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'venues', name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const row: Record<string, unknown> = {
      id: uuid(),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: '',
      address: p.address?.freeformAddress || '',
      city_id: body.city_id,
      latitude: lat || null,
      longitude: lng || null,
      phone: p.poi?.phone || null,
      website: p.poi?.url || null,
      category: p.poi?.categories?.[0] || null,
      source: 'tomtom',
      source_id: p.id || null,
      rating: null,
      price_level: null,
      is_active: 1,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'venues', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Venue "${name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'tomtom' }, error: null });
});

// ---------------------------------------------------------------------------
// 9. POST /imports/eventbrite — Import events from Eventbrite
// ---------------------------------------------------------------------------
imports.post('/eventbrite', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    category?: string;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).EVENTBRITE_API_KEY;
  if (!apiKey) return c.json({ error: 'EVENTBRITE_API_KEY not configured' }, 500);

  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const params = new URLSearchParams({
    'location.latitude': String(city.latitude),
    'location.longitude': String(city.longitude),
    'location.within': '25km',
    expand: 'venue',
  });
  if (body.query) params.set('q', body.query);
  if (body.category) params.set('categories', body.category);

  let events: any[];
  try {
    const res = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `Eventbrite API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as { events: any[] };
    events = data.events || [];
  } catch (e: unknown) {
    return c.json({ error: `Eventbrite fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const lat = ev.venue?.latitude ? parseFloat(ev.venue.latitude) : null;
    const lng = ev.venue?.longitude ? parseFloat(ev.venue.longitude) : null;
    const name = ev.name?.text || ev.name?.html || 'Untitled Event';

    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'events', name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const row: Record<string, unknown> = {
      id: uuid(),
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: ev.description?.text || ev.summary || '',
      city_id: body.city_id,
      venue_id: null,
      start_date: ev.start?.utc || null,
      end_date: ev.end?.utc || null,
      start_time: ev.start?.local ? ev.start.local.split('T')[1] : null,
      end_time: ev.end?.local ? ev.end.local.split('T')[1] : null,
      category: ev.category?.name || body.category || null,
      website: ev.url || null,
      ticket_url: ev.url || null,
      price: ev.is_free ? '0' : null,
      is_free: ev.is_free ? 1 : 0,
      is_recurring: ev.is_series ? 1 : 0,
      latitude: lat,
      longitude: lng,
      source: 'eventbrite',
      source_id: ev.id || null,
      image_url: ev.logo?.url || null,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'events', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Event "${name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'eventbrite' }, error: null });
});

// ---------------------------------------------------------------------------
// 10. POST /imports/ticketmaster — Import events from Ticketmaster
// ---------------------------------------------------------------------------
imports.post('/ticketmaster', async (c) => {
  const body = await c.req.json<{
    city_id: string;
    query?: string;
    classification?: string;
  }>();

  if (!body.city_id) return c.json({ error: 'city_id is required' }, 400);

  const apiKey = (c.env as any).TICKETMASTER_API_KEY;
  if (!apiKey) return c.json({ error: 'TICKETMASTER_API_KEY not configured' }, 500);

  const city = await c.env.DB.prepare('SELECT * FROM cities WHERE id = ?').bind(body.city_id).first<any>();
  if (!city) return c.json({ error: 'City not found' }, 404);

  const params = new URLSearchParams({
    apikey: apiKey,
    latlong: `${city.latitude},${city.longitude}`,
    radius: '25',
    unit: 'km',
    size: '100',
    sort: 'date,asc',
  });
  if (body.query) params.set('keyword', body.query);
  if (body.classification) params.set('classificationName', body.classification);

  let events: any[];
  try {
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `Ticketmaster API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as { _embedded?: { events: any[] } };
    events = data._embedded?.events || [];
  } catch (e: unknown) {
    return c.json({ error: `Ticketmaster fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const ev of events) {
    const venue = ev._embedded?.venues?.[0];
    const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
    const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;

    if (lat && lng) {
      const existing = await findNearbyDuplicate(c.env.DB, 'events', ev.name, lat, lng);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const startDate = ev.dates?.start?.dateTime || ev.dates?.start?.localDate || null;
    const endDate = ev.dates?.end?.dateTime || ev.dates?.end?.localDate || null;
    const priceRange = ev.priceRanges?.[0];

    const row: Record<string, unknown> = {
      id: uuid(),
      name: ev.name,
      slug: ev.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: ev.info || ev.pleaseNote || '',
      city_id: body.city_id,
      venue_id: null,
      start_date: startDate,
      end_date: endDate,
      start_time: ev.dates?.start?.localTime || null,
      end_time: null,
      category: ev.classifications?.[0]?.segment?.name || body.classification || null,
      website: ev.url || null,
      ticket_url: ev.url || null,
      price: priceRange ? `${priceRange.min}-${priceRange.max} ${priceRange.currency}` : null,
      is_free: 0,
      is_recurring: 0,
      latitude: lat,
      longitude: lng,
      source: 'ticketmaster',
      source_id: ev.id || null,
      image_url: ev.images?.[0]?.url || null,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'events', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Event "${ev.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'ticketmaster' }, error: null });
});

// ---------------------------------------------------------------------------
// 11. POST /imports/refuge-restrooms — Import from Refuge Restrooms API
// ---------------------------------------------------------------------------
imports.post('/refuge-restrooms', async (c) => {
  const body = await c.req.json<{
    latitude: number;
    longitude: number;
    radius?: number;
  }>();

  if (!body.latitude || !body.longitude) {
    return c.json({ error: 'latitude and longitude are required' }, 400);
  }

  let allRestrooms: any[] = [];
  const perPage = 100;
  const maxPages = 10;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const params = new URLSearchParams({
        lat: String(body.latitude),
        lng: String(body.longitude),
        page: String(page),
        per_page: String(perPage),
      });

      const res = await fetch(
        `https://www.refugerestrooms.org/api/v1/restrooms/by_location?${params}`,
        { headers: { 'User-Agent': 'Queer Guide App' } },
      );

      if (!res.ok) {
        if (page === 1) {
          return c.json({ error: `Refuge Restrooms API error: ${res.status}` }, 502);
        }
        break;
      }

      const data = (await res.json()) as any[];
      if (!data.length) break;
      allRestrooms.push(...data);

      // If radius specified, filter by approximate distance
      if (body.radius) {
        const maxDeg = body.radius / 111000; // rough meters to degrees
        allRestrooms = allRestrooms.filter(
          (r: any) =>
            Math.abs(r.latitude - body.latitude) <= maxDeg &&
            Math.abs(r.longitude - body.longitude) <= maxDeg,
        );
      }

      if (data.length < perPage) break;
      await sleep(500); // Rate limiting
    }
  } catch (e: unknown) {
    return c.json({ error: `Refuge Restrooms fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const r of allRestrooms) {
    const row: Record<string, unknown> = {
      id: r.id ? String(r.id) : uuid(),
      name: r.name || 'Unknown Restroom',
      street: r.street || null,
      city: r.city || null,
      state: r.state || null,
      country: r.country || null,
      latitude: r.latitude,
      longitude: r.longitude,
      accessible: r.accessible ? 1 : 0,
      unisex: r.unisex ? 1 : 0,
      changing_table: r.changing_table ? 1 : 0,
      comment: r.comment || null,
      directions: r.directions || null,
      upvote: r.upvote || 0,
      downvote: r.downvote || 0,
      source_created_at: r.created_at || null,
      source_updated_at: r.updated_at || null,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'refuge_restrooms', row, ['id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Restroom "${r.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'refuge_restrooms' }, error: null });
});

// ---------------------------------------------------------------------------
// 12. POST /imports/ilga-data — Import ILGA world data
// ---------------------------------------------------------------------------
imports.post('/ilga-data', async (c) => {
  const body = await c.req.json<{
    data: Array<Record<string, unknown>>;
  }>();

  if (!body.data || !Array.isArray(body.data) || !body.data.length) {
    return c.json({ error: 'Provide data array of country legal status records' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const record of body.data) {
    const row: Record<string, unknown> = {
      id: uuid(),
      country_code: record.country_code || null,
      country_name: record.country_name || record.country || null,
      criminalization: record.criminalization || null,
      penalty: record.penalty || null,
      max_penalty: record.max_penalty || null,
      death_penalty: record.death_penalty ? 1 : 0,
      constitutional_protection: record.constitutional_protection ? 1 : 0,
      employment_protection: record.employment_protection ? 1 : 0,
      hate_crime_protection: record.hate_crime_protection ? 1 : 0,
      incitement_to_hatred: record.incitement_to_hatred ? 1 : 0,
      marriage_equality: record.marriage_equality ? 1 : 0,
      civil_unions: record.civil_unions ? 1 : 0,
      joint_adoption: record.joint_adoption ? 1 : 0,
      second_parent_adoption: record.second_parent_adoption ? 1 : 0,
      conversion_therapy_ban: record.conversion_therapy_ban ? 1 : 0,
      gender_marker_change: record.gender_marker_change || null,
      gender_recognition: record.gender_recognition || null,
      overall_rating: record.overall_rating || record.rating || null,
      year: record.year || new Date().getFullYear(),
      source_url: record.source_url || null,
      notes: record.notes || null,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'ilga_data', row, ['country_code', 'year']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Country "${record.country_name || record.country_code}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 13. POST /imports/awin-products — Import affiliate products from AWIN
// ---------------------------------------------------------------------------
imports.post('/awin-products', async (c) => {
  const body = await c.req.json<{
    merchant_id?: string;
    category?: string;
  }>();

  const apiKey = (c.env as any).AWIN_API_KEY;
  if (!apiKey) return c.json({ error: 'AWIN_API_KEY not configured' }, 500);

  const params = new URLSearchParams({
    'aw-apikey': apiKey,
    'aw-image-output': 'url',
  });
  if (body.merchant_id) params.set('aw-merchant-id', body.merchant_id);
  if (body.category) params.set('aw-category', body.category);

  let products: any[];
  try {
    const res = await fetch(
      `https://productdata.awin.com/datafeed/list/apikey/${apiKey}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      const errText = await res.text();
      return c.json({ error: `AWIN API error ${res.status}: ${errText}` }, 502);
    }
    const data = (await res.json()) as any;
    products = Array.isArray(data) ? data : data.products || data.productList || [];
  } catch (e: unknown) {
    return c.json({ error: `AWIN fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const p of products) {
    const row: Record<string, unknown> = {
      id: uuid(),
      name: p.product_name || p.name || '',
      description: p.description || '',
      merchant_id: p.merchant_id || body.merchant_id || null,
      merchant_name: p.merchant_name || null,
      category: p.category || body.category || null,
      price: p.search_price || p.price || null,
      currency: p.currency || 'USD',
      image_url: p.aw_image_url || p.merchant_image_url || null,
      product_url: p.aw_deep_link || p.merchant_deep_link || null,
      affiliate_url: p.aw_deep_link || null,
      brand: p.brand_name || null,
      in_stock: p.in_stock === '1' || p.in_stock === true ? 1 : 0,
      is_active: 1,
      source: 'awin',
      source_id: p.aw_product_id || p.product_id || null,
      created_at: now(),
      updated_at: now(),
    };

    const result = await safeUpsert(c.env.DB, 'affiliate_products', row, ['source', 'source_id']);
    if (result.success) {
      imported++;
    } else {
      errors.push(`Product "${p.product_name || p.name}": ${result.error}`);
      skipped++;
    }
  }

  return c.json({ data: { imported, skipped, errors, source: 'awin' }, error: null });
});

// ---------------------------------------------------------------------------
// 14. POST /imports/background — Background import manager
// ---------------------------------------------------------------------------
imports.post('/background', async (c) => {
  const body = await c.req.json<{
    action: 'start' | 'status' | 'cancel';
    import_id?: string;
    import_type?: string;
    params?: Record<string, unknown>;
  }>();

  const user = c.get('user');

  switch (body.action) {
    case 'start': {
      if (!body.import_type) {
        return c.json({ error: 'import_type is required to start a job' }, 400);
      }

      const importId = uuid();
      const jobRow: Record<string, unknown> = {
        id: importId,
        import_type: body.import_type,
        status: 'pending',
        params: JSON.stringify(body.params || {}),
        started_by: user.id,
        progress: 0,
        total: 0,
        imported: 0,
        skipped: 0,
        errors: JSON.stringify([]),
        started_at: now(),
        completed_at: null,
        created_at: now(),
        updated_at: now(),
      };

      await safeUpsert(c.env.DB, 'import_jobs', jobRow, ['id']);

      // Update status to running — the actual import would be dispatched
      // via a Durable Object or Queue in production. For now, mark as running
      // and return the job ID for polling.
      await c.env.DB
        .prepare('UPDATE import_jobs SET status = ?, updated_at = ? WHERE id = ?')
        .bind('running', now(), importId)
        .run();

      return c.json({
        data: { import_id: importId, status: 'running', message: 'Import job started' },
        error: null,
      });
    }

    case 'status': {
      if (!body.import_id) {
        // Return all recent jobs
        const jobs = await c.env.DB
          .prepare(
            'SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT 50',
          )
          .all();
        return c.json({ data: jobs.results, error: null });
      }

      const job = await c.env.DB
        .prepare('SELECT * FROM import_jobs WHERE id = ?')
        .bind(body.import_id)
        .first();
      if (!job) return c.json({ error: 'Import job not found' }, 404);
      return c.json({ data: job, error: null });
    }

    case 'cancel': {
      if (!body.import_id) return c.json({ error: 'import_id is required to cancel' }, 400);

      const job = await c.env.DB
        .prepare('SELECT * FROM import_jobs WHERE id = ?')
        .bind(body.import_id)
        .first<any>();
      if (!job) return c.json({ error: 'Import job not found' }, 404);

      if (job.status === 'completed' || job.status === 'cancelled') {
        return c.json({ error: `Cannot cancel job with status: ${job.status}` }, 400);
      }

      await c.env.DB
        .prepare('UPDATE import_jobs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
        .bind('cancelled', now(), now(), body.import_id)
        .run();

      return c.json({
        data: { import_id: body.import_id, status: 'cancelled' },
        error: null,
      });
    }

    default:
      return c.json({ error: 'action must be start, status, or cancel' }, 400);
  }
});

// ---------------------------------------------------------------------------
// 15. POST /imports/bulk-personalities — Bulk create personalities
// ---------------------------------------------------------------------------
imports.post('/bulk-personalities', async (c) => {
  const body = await c.req.json<{
    personalities: Array<{
      name: string;
      category?: string;
      description?: string;
      [key: string]: unknown;
    }>;
  }>();

  if (!body.personalities || !body.personalities.length) {
    return c.json({ error: 'Provide personalities array' }, 400);
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process in batches of 5 to manage OpenAI rate limits
  const batchSize = 5;
  for (let i = 0; i < body.personalities.length; i += batchSize) {
    const batch = body.personalities.slice(i, i + batchSize);

    for (const person of batch) {
      try {
        // Use OpenAI to enrich personality data with Wikipedia info
        let enrichedData: Record<string, string> = {};
        try {
          const enrichResult = await chatCompletion(
            {
              messages: [
                {
                  role: 'system',
                  content:
                    'You are a research assistant. Given a person\'s name and category, provide a JSON object with: bio (2-3 sentences), birth_date (YYYY-MM-DD or null), death_date (YYYY-MM-DD or null), nationality, notable_works (comma-separated), wikipedia_url. Only include factual, well-known information. Respond with valid JSON only.',
                },
                {
                  role: 'user',
                  content: `Person: ${person.name}${person.category ? `, Category: ${person.category}` : ''}`,
                },
              ],
              temperature: 0.1,
              max_tokens: 500,
              response_format: { type: 'json_object' },
            },
            c.env as any,
          );
          enrichedData = JSON.parse(enrichResult);
        } catch {
          // If OpenAI enrichment fails, continue with provided data
        }

        const row: Record<string, unknown> = {
          id: uuid(),
          name: person.name,
          slug: person.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          description: person.description || enrichedData.bio || '',
          category: person.category || null,
          birth_date: person.birth_date || enrichedData.birth_date || null,
          death_date: person.death_date || enrichedData.death_date || null,
          nationality: person.nationality || enrichedData.nationality || null,
          notable_works: person.notable_works || enrichedData.notable_works || null,
          image_url: person.image_url || null,
          wikipedia_url: person.wikipedia_url || enrichedData.wikipedia_url || null,
          is_active: 1,
          created_at: now(),
          updated_at: now(),
        };

        const result = await safeUpsert(c.env.DB, 'personalities', row, ['name']);
        if (result.success) {
          imported++;
        } else {
          errors.push(`Personality "${person.name}": ${result.error}`);
          skipped++;
        }
      } catch (e: unknown) {
        errors.push(`Personality "${person.name}": ${e instanceof Error ? e.message : String(e)}`);
        skipped++;
      }
    }

    // Rate limit between batches
    if (i + batchSize < body.personalities.length) {
      await sleep(1000);
    }
  }

  return c.json({ data: { imported, skipped, errors }, error: null });
});

// ---------------------------------------------------------------------------
// 16. POST /imports/bulk-ai-tags — Bulk create AI-generated tags
// ---------------------------------------------------------------------------
imports.post('/bulk-ai-tags', async (c) => {
  const body = await c.req.json<{
    content_type: string;
    batch_size?: number;
  }>();

  if (!body.content_type) {
    return c.json({ error: 'content_type is required (e.g., venues, events, personalities)' }, 400);
  }

  const table = sanitizeId(body.content_type);
  const batchSize = Math.min(body.batch_size || 20, 50);

  // Fetch untagged content
  let items: any[];
  try {
    const result = await c.env.DB
      .prepare(
        `SELECT id, name, description, category FROM ${table}
         WHERE id NOT IN (SELECT content_id FROM content_tags WHERE content_type = ?)
         LIMIT ?`,
      )
      .bind(body.content_type, batchSize)
      .all();
    items = result.results || [];
  } catch (e: unknown) {
    return c.json({ error: `Failed to fetch ${body.content_type}: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  if (!items.length) {
    return c.json({ data: { imported: 0, skipped: 0, errors: [], message: 'No untagged content found' }, error: null });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process in batches of 5 for OpenAI
  for (let i = 0; i < items.length; i += 5) {
    const batch = items.slice(i, i + 5);
    const itemDescriptions = batch
      .map((item: any) => `- ID: ${item.id}, Name: ${item.name}, Category: ${item.category || 'N/A'}, Description: ${(item.description || '').slice(0, 200)}`)
      .join('\n');

    try {
      const tagResult = await chatCompletion(
        {
          messages: [
            {
              role: 'system',
              content: `You are a content tagger for a queer travel guide. Given a list of ${body.content_type}, generate relevant tags for each item. Return a JSON object with this structure: { "items": [{ "id": "item_id", "tags": ["tag1", "tag2", ...] }] }. Use lowercase, hyphenated tags. Include tags for: lgbtq-relevance (e.g., gay-bar, queer-friendly, drag-show), type/category, vibe/atmosphere, accessibility. Max 8 tags per item. Respond with valid JSON only.`,
            },
            {
              role: 'user',
              content: `Generate tags for these ${body.content_type}:\n${itemDescriptions}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        },
        c.env as any,
      );

      const parsed = JSON.parse(tagResult) as { items: Array<{ id: string; tags: string[] }> };

      for (const taggedItem of parsed.items || []) {
        for (const tagName of taggedItem.tags || []) {
          const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          // Upsert tag
          const tagId = uuid();
          await safeUpsert(
            c.env.DB,
            'unified_tags',
            {
              id: tagId,
              name: tagName,
              slug: tagSlug,
              is_ai_generated: 1,
              created_at: now(),
              updated_at: now(),
            },
            ['slug'],
          );

          // Get actual tag ID (may already exist)
          const existingTag = await c.env.DB
            .prepare('SELECT id FROM unified_tags WHERE slug = ?')
            .bind(tagSlug)
            .first<{ id: string }>();

          const actualTagId = existingTag?.id || tagId;

          // Insert into junction table
          await safeUpsert(
            c.env.DB,
            'content_tags',
            {
              id: uuid(),
              content_id: taggedItem.id,
              content_type: body.content_type,
              tag_id: actualTagId,
              created_at: now(),
            },
            ['content_id', 'tag_id'],
          );
        }

        imported++;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Batch starting at index ${i}: ${msg}`);
      skipped += batch.length;
    }

    // Rate limit
    if (i + 5 < items.length) {
      await sleep(1000);
    }
  }

  return c.json({
    data: { imported, skipped, errors, content_type: body.content_type },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// 17. POST /imports/bulk-scrape-events — Bulk scrape events from sources
// ---------------------------------------------------------------------------
imports.post('/bulk-scrape-events', async (c) => {
  const body = await c.req.json<{
    sources: string[];
    city_id?: string;
  }>();

  if (!body.sources || !body.sources.length) {
    return c.json({ error: 'Provide sources array (e.g., ["eventbrite", "ticketmaster"])' }, 400);
  }

  const validSources = ['eventbrite', 'ticketmaster', 'foursquare', 'google-places', 'tripadvisor', 'tomtom'];
  const invalidSources = body.sources.filter((s) => !validSources.includes(s));
  if (invalidSources.length) {
    return c.json({ error: `Invalid sources: ${invalidSources.join(', ')}. Valid: ${validSources.join(', ')}` }, 400);
  }

  const results: Record<string, { imported: number; skipped: number; errors: string[] }> = {};
  const overallErrors: string[] = [];

  for (const source of body.sources) {
    try {
      // Build the internal request to the appropriate import endpoint
      const importBody: Record<string, unknown> = {};
      if (body.city_id) importBody.city_id = body.city_id;

      const internalUrl = new URL(`${new URL(c.req.url).origin}/imports/${source}`);
      const authHeader = c.req.header('Authorization') || '';

      const res = await fetch(internalUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(importBody),
      });

      if (res.ok) {
        const data = (await res.json()) as { data: { imported: number; skipped: number; errors: string[] } };
        results[source] = data.data;
      } else {
        const errText = await res.text();
        results[source] = { imported: 0, skipped: 0, errors: [`HTTP ${res.status}: ${errText}`] };
        overallErrors.push(`${source}: HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results[source] = { imported: 0, skipped: 0, errors: [msg] };
      overallErrors.push(`${source}: ${msg}`);
    }

    // Delay between sources
    await sleep(2000);
  }

  const totalImported = Object.values(results).reduce((sum, r) => sum + r.imported, 0);
  const totalSkipped = Object.values(results).reduce((sum, r) => sum + r.skipped, 0);

  return c.json({
    data: {
      total_imported: totalImported,
      total_skipped: totalSkipped,
      by_source: results,
      errors: overallErrors,
    },
    error: null,
  });
});

export { imports };
