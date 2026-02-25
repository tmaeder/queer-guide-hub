/**
 * geo-link-content — Deterministic geo-linking edge function.
 *
 * Links content items (venues, events, personalities, news_articles) to
 * cities and countries using alias normalization and exact matching.
 * No AI / external APIs — pure DB matching against 351 cities + 199 countries.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { requireAdmin, corsHeaders } from '../_shared/supabase-client.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Country alias map ────────────────────────────────────────────────
// Maps common abbreviations, ISO codes, demonyms → canonical country name

const COUNTRY_ALIASES: Record<string, string> = {
  // ISO 2-letter codes
  'us': 'United States', 'gb': 'United Kingdom', 'de': 'Germany',
  'fr': 'France', 'es': 'Spain', 'it': 'Italy', 'nl': 'Netherlands',
  'ch': 'Switzerland', 'at': 'Austria', 'au': 'Australia',
  'ca': 'Canada', 'br': 'Brazil', 'mx': 'Mexico', 'jp': 'Japan',
  'za': 'South Africa', 'nz': 'New Zealand', 'il': 'Israel',
  'th': 'Thailand', 'pt': 'Portugal', 'be': 'Belgium',
  'se': 'Sweden', 'dk': 'Denmark', 'no': 'Norway', 'fi': 'Finland',
  'ie': 'Ireland', 'cz': 'Czech Republic', 'tw': 'Taiwan',
  'ar': 'Argentina', 'co': 'Colombia', 'cl': 'Chile', 'pe': 'Peru',
  'in': 'India', 'cn': 'China', 'kr': 'South Korea', 'ru': 'Russia',
  'tr': 'Turkey', 'gr': 'Greece', 'pl': 'Poland', 'ro': 'Romania',
  'hu': 'Hungary', 'ph': 'Philippines', 'id': 'Indonesia',
  'ng': 'Nigeria', 'ke': 'Kenya', 'eg': 'Egypt', 'ma': 'Morocco',
  'lb': 'Lebanon', 'jm': 'Jamaica', 'cu': 'Cuba', 'sr': 'Suriname',
  // Common abbreviations
  'usa': 'United States', 'uk': 'United Kingdom',
  'united states of america': 'United States',
  'great britain': 'United Kingdom', 'england': 'United Kingdom',
  'scotland': 'United Kingdom', 'wales': 'United Kingdom',
  'holland': 'Netherlands', 'the netherlands': 'Netherlands',
  'kingdom of the netherlands': 'Netherlands',
  'czechia': 'Czech Republic',
  'republic of korea': 'South Korea', 'korea': 'South Korea',
  // Demonyms (nationality → country)
  'american': 'United States', 'british': 'United Kingdom',
  'english': 'United Kingdom', 'scottish': 'United Kingdom',
  'welsh': 'United Kingdom',
  'german': 'Germany', 'french': 'France', 'spanish': 'Spain',
  'italian': 'Italy', 'dutch': 'Netherlands', 'swiss': 'Switzerland',
  'austrian': 'Austria', 'australian': 'Australia',
  'canadian': 'Canada', 'brazilian': 'Brazil', 'mexican': 'Mexico',
  'japanese': 'Japan', 'south african': 'South Africa',
  'new zealander': 'New Zealand', 'kiwi': 'New Zealand',
  'israeli': 'Israel', 'thai': 'Thailand',
  'portuguese': 'Portugal', 'belgian': 'Belgium',
  'swedish': 'Sweden', 'danish': 'Denmark', 'norwegian': 'Norway',
  'finnish': 'Finland', 'irish': 'Ireland', 'czech': 'Czech Republic',
  'taiwanese': 'Taiwan', 'argentinian': 'Argentina', 'argentine': 'Argentina',
  'cameroonian': 'Cameroon', 'colombian': 'Colombia',
  'cuban': 'Cuba', 'indian': 'India', 'chinese': 'China',
  'korean': 'South Korea', 'russian': 'Russia', 'turkish': 'Turkey',
  'greek': 'Greece', 'polish': 'Poland', 'romanian': 'Romania',
  'hungarian': 'Hungary', 'peruvian': 'Peru', 'chilean': 'Chile',
  'filipino': 'Philippines', 'indonesian': 'Indonesia',
  'nigerian': 'Nigeria', 'kenyan': 'Kenya', 'egyptian': 'Egypt',
  'moroccan': 'Morocco', 'lebanese': 'Lebanon',
  'jamaican': 'Jamaica', 'trinidadian': 'Trinidad and Tobago',
  'puerto rican': 'Puerto Rico', 'surinamese': 'Suriname',
  'salvadoran': 'El Salvador', 'honduran': 'Honduras',
  'guatemalan': 'Guatemala', 'nicaraguan': 'Nicaragua',
  'costa rican': 'Costa Rica', 'panamanian': 'Panama',
  'venezuelan': 'Venezuela', 'ecuadorian': 'Ecuador',
  'bolivian': 'Bolivia', 'paraguayan': 'Paraguay',
  'uruguayan': 'Uruguay',
};

// ── Types ────────────────────────────────────────────────────────────

interface CountryRef { id: string; name: string; code: string }
interface CityRef { id: string; name: string; country_id: string; population: number | null }

interface GeoLinkResult {
  entity_id: string;
  entity_name: string;
  city_resolved: string | null;
  country_resolved: string | null;
  city_id: string | null;
  country_id: string | null;
  status: 'linked' | 'partial' | 'skipped' | 'already_linked' | 'no_data';
}

interface BatchResult {
  success: boolean;
  content_type: string;
  dry_run: boolean;
  total_processed: number;
  total_linked: number;
  total_partial: number;
  total_skipped: number;
  total_already_linked: number;
  results: GeoLinkResult[];
  error?: string;
}

// ── Reference data (loaded once per request) ─────────────────────────

let countriesCache: CountryRef[] = [];
let citiesCache: CityRef[] = [];
let countryByName: Map<string, CountryRef> = new Map();
let countryByCode: Map<string, CountryRef> = new Map();
let countryById: Map<string, CountryRef> = new Map();
let citiesByName: Map<string, CityRef[]> = new Map();

async function loadReferenceData() {
  // Load all countries
  const { data: countries } = await supabase
    .from('countries')
    .select('id, name, code')
    .order('name');

  countriesCache = countries || [];
  countryByName = new Map();
  countryByCode = new Map();
  countryById = new Map();

  for (const c of countriesCache) {
    countryByName.set(c.name.toLowerCase(), c);
    if (c.code) countryByCode.set(c.code.toLowerCase(), c);
    countryById.set(c.id, c);
  }

  // Load all cities
  const { data: cities } = await supabase
    .from('cities')
    .select('id, name, country_id, population')
    .order('population', { ascending: false, nullsFirst: false });

  citiesCache = cities || [];
  citiesByName = new Map();

  for (const city of citiesCache) {
    const key = city.name.toLowerCase();
    if (!citiesByName.has(key)) {
      citiesByName.set(key, []);
    }
    citiesByName.get(key)!.push(city);
  }

  console.log(`Loaded ${countriesCache.length} countries, ${citiesCache.length} cities`);
}

// ── Matching functions ───────────────────────────────────────────────

function resolveCountry(text: string | null | undefined): CountryRef | null {
  if (!text || text.trim().length === 0) return null;

  const normalized = text.trim().toLowerCase();

  // 1. Check alias map
  const aliasName = COUNTRY_ALIASES[normalized];
  if (aliasName) {
    const match = countryByName.get(aliasName.toLowerCase());
    if (match) return match;
  }

  // 2. Exact name match
  const nameMatch = countryByName.get(normalized);
  if (nameMatch) return nameMatch;

  // 3. Code match (e.g., "US", "GB")
  const codeMatch = countryByCode.get(normalized);
  if (codeMatch) return codeMatch;

  return null;
}

function resolveCity(text: string | null | undefined, countryId?: string | null): CityRef | null {
  if (!text || text.trim().length === 0) return null;

  const normalized = text.trim().toLowerCase();
  const candidates = citiesByName.get(normalized);
  if (!candidates || candidates.length === 0) return null;

  // If country_id provided, prefer matching city in that country
  if (countryId) {
    const inCountry = candidates.find(c => c.country_id === countryId);
    if (inCountry) return inCountry;
  }

  // Return first match (highest population since cities are sorted by population desc)
  return candidates[0];
}

// Names that are too ambiguous for regex matching (common English words, short names)
const AMBIGUOUS_GEO_NAMES = new Set([
  'nice', 'bath', 'reading', 'male', 'split', 'mobile', 'victoria',
  'orange', 'buffalo', 'long', 'deal', 'bury', 'hope', 'sale',
  'march', 'spring', 'douglas', 'ross', 'hamilton', 'jackson',
  'lincoln', 'madison', 'monroe', 'tyler', 'pierce', 'grant',
  'hayes', 'arthur', 'harrison', 'cleveland', 'wilson', 'ford',
  'clinton', 'warren', 'trinity', 'florence', 'georgia', 'jordan',
  'chad', 'mali', 'niger', 'togo', 'oman', 'iran', 'iraq', 'cuba',
  'guinea', 'benin', 'congo', 'gabon', 'samoa', 'nauru', 'palau',
  'dominica', 'grenada', 'monaco', 'malta', 'laos',
]);

function extractGeoFromText(
  text: string
): { cityIds: string[]; countryIds: string[] } {
  if (!text || text.length < 5) return { cityIds: [], countryIds: [] };

  const foundCountryIds = new Set<string>();
  const foundCityIds = new Set<string>();

  // Match country names — require min 5 char names and skip ambiguous
  for (const country of countriesCache) {
    if (country.name.length < 5) continue;
    if (AMBIGUOUS_GEO_NAMES.has(country.name.toLowerCase())) continue;
    const regex = new RegExp(`\\b${escapeRegex(country.name)}\\b`, 'i');
    if (regex.test(text)) {
      foundCountryIds.add(country.id);
    }
  }

  // Match city names — require min 5 char, population > 100k, skip ambiguous
  for (const city of citiesCache) {
    if (!city.population || city.population < 100000) continue;
    if (city.name.length < 5) continue;
    if (AMBIGUOUS_GEO_NAMES.has(city.name.toLowerCase())) continue;
    const regex = new RegExp(`\\b${escapeRegex(city.name)}\\b`, 'i');
    if (regex.test(text)) {
      foundCityIds.add(city.id);
      // Also add the city's country
      if (city.country_id) foundCountryIds.add(city.country_id);
    }
  }

  return {
    cityIds: [...foundCityIds],
    countryIds: [...foundCountryIds],
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Content type processors ──────────────────────────────────────────

async function processVenuesOrEvents(
  table: 'venues' | 'events',
  items: Record<string, unknown>[],
  dryRun: boolean,
): Promise<GeoLinkResult[]> {
  const results: GeoLinkResult[] = [];

  for (const item of items) {
    const id = item.id as string;
    const name = (item.name || item.title || 'Unknown') as string;
    const cityText = item.city as string | null;
    const countryText = item.country as string | null;
    const existingCityId = item.city_id as string | null;
    const existingCountryId = item.country_id as string | null;

    // Skip if already fully linked
    if (existingCityId && existingCountryId) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: existingCityId, country_id: existingCountryId,
        status: 'already_linked',
      });
      continue;
    }

    if (!cityText && !countryText) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: 'no_data',
      });
      continue;
    }

    const country = existingCountryId
      ? countryById.get(existingCountryId) || null
      : resolveCountry(countryText);
    const city = existingCityId
      ? citiesCache.find(c => c.id === existingCityId) || null
      : resolveCity(cityText, country?.id);

    const newCityId = city?.id || null;
    const newCountryId = country?.id || null;

    if (!newCityId && !newCountryId) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: 'skipped',
      });
      continue;
    }

    if (!dryRun) {
      const update: Record<string, unknown> = {};
      if (newCityId && !existingCityId) update.city_id = newCityId;
      if (newCountryId && !existingCountryId) update.country_id = newCountryId;

      if (Object.keys(update).length > 0) {
        const { error } = await supabase
          .from(table)
          .update(update)
          .eq('id', id);
        if (error) {
          console.error(`Error updating ${table} ${id}:`, error.message);
        }
      }
    }

    results.push({
      entity_id: id, entity_name: name,
      city_resolved: city?.name || null,
      country_resolved: country?.name || null,
      city_id: newCityId, country_id: newCountryId,
      status: newCityId && newCountryId ? 'linked' : 'partial',
    });
  }

  return results;
}

async function processPersonalities(
  items: Record<string, unknown>[],
  dryRun: boolean,
): Promise<GeoLinkResult[]> {
  const results: GeoLinkResult[] = [];

  for (const item of items) {
    const id = item.id as string;
    const name = (item.name || 'Unknown') as string;
    const nationality = item.nationality as string | null;
    const birthPlace = item.birth_place as string | null;
    const existingCityId = item.city_id as string | null;
    const existingCountryId = item.country_id as string | null;

    if (existingCityId && existingCountryId) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: existingCityId, country_id: existingCountryId,
        status: 'already_linked',
      });
      continue;
    }

    if (!nationality && !birthPlace) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: 'no_data',
      });
      continue;
    }

    // Resolve country from nationality
    const country = existingCountryId
      ? countryById.get(existingCountryId) || null
      : resolveCountry(nationality);

    // Resolve city from birth_place
    const city = existingCityId
      ? citiesCache.find(c => c.id === existingCityId) || null
      : resolveCity(birthPlace, country?.id);

    const newCityId = city?.id || null;
    const newCountryId = country?.id || null;

    if (!newCityId && !newCountryId) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: 'skipped',
      });
      continue;
    }

    if (!dryRun) {
      const update: Record<string, unknown> = {};
      if (newCityId && !existingCityId) update.city_id = newCityId;
      if (newCountryId && !existingCountryId) update.country_id = newCountryId;

      if (Object.keys(update).length > 0) {
        const { error } = await supabase
          .from('personalities')
          .update(update)
          .eq('id', id);
        if (error) {
          console.error(`Error updating personality ${id}:`, error.message);
        }
      }
    }

    results.push({
      entity_id: id, entity_name: name,
      city_resolved: city?.name || null,
      country_resolved: country?.name || null,
      city_id: newCityId, country_id: newCountryId,
      status: newCityId || newCountryId ? (newCityId && newCountryId ? 'linked' : 'partial') : 'skipped',
    });
  }

  return results;
}

async function processNewsArticles(
  items: Record<string, unknown>[],
  dryRun: boolean,
): Promise<GeoLinkResult[]> {
  const results: GeoLinkResult[] = [];

  for (const item of items) {
    const id = item.id as string;
    const title = (item.title || '') as string;
    const excerpt = (item.excerpt || '') as string;
    const text = `${title}. ${excerpt}`;

    const { cityIds, countryIds } = extractGeoFromText(text);

    if (cityIds.length === 0 && countryIds.length === 0) {
      results.push({
        entity_id: id, entity_name: title,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: 'skipped',
      });
      continue;
    }

    if (!dryRun) {
      // Insert city links
      if (cityIds.length > 0) {
        const rows = cityIds.map(cid => ({ article_id: id, city_id: cid }));
        const { error } = await supabase
          .from('news_article_cities')
          .upsert(rows, { onConflict: 'article_id,city_id' });
        if (error) console.error(`Error linking news ${id} to cities:`, error.message);
      }

      // Insert country links
      if (countryIds.length > 0) {
        const rows = countryIds.map(cid => ({ article_id: id, country_id: cid }));
        const { error } = await supabase
          .from('news_article_countries')
          .upsert(rows, { onConflict: 'article_id,country_id' });
        if (error) console.error(`Error linking news ${id} to countries:`, error.message);
      }
    }

    const cityNames = cityIds
      .map(cid => citiesCache.find(c => c.id === cid)?.name)
      .filter(Boolean)
      .join(', ');
    const countryNames = countryIds
      .map(cid => countriesCache.find(c => c.id === cid)?.name)
      .filter(Boolean)
      .join(', ');

    results.push({
      entity_id: id, entity_name: title,
      city_resolved: cityNames || null,
      country_resolved: countryNames || null,
      city_id: cityIds[0] || null,
      country_id: countryIds[0] || null,
      status: 'linked',
    });
  }

  return results;
}

// ── Fetch unlinked items ─────────────────────────────────────────────

async function fetchUnlinkedItems(
  contentType: string,
  contentId?: string,
  batchLimit: number = 200,
): Promise<Record<string, unknown>[]> {
  switch (contentType) {
    case 'venues': {
      let query = supabase
        .from('venues')
        .select('id, name, city, country, city_id, country_id');
      if (contentId) {
        query = query.eq('id', contentId);
      } else {
        query = query.or('city_id.is.null,country_id.is.null');
      }
      const { data } = await query.limit(batchLimit);
      return data || [];
    }
    case 'events': {
      let query = supabase
        .from('events')
        .select('id, title, city, country, city_id, country_id');
      if (contentId) {
        query = query.eq('id', contentId);
      } else {
        query = query.or('city_id.is.null,country_id.is.null');
      }
      const { data } = await query.limit(batchLimit);
      return data || [];
    }
    case 'personalities': {
      let query = supabase
        .from('personalities')
        .select('id, name, nationality, birth_place, city_id, country_id');
      if (contentId) {
        query = query.eq('id', contentId);
      } else {
        query = query
          .or('city_id.is.null,country_id.is.null')
          .or('nationality.neq.,birth_place.neq.');
      }
      const { data } = await query.limit(batchLimit);
      return (data || []).filter((p: any) =>
        p.nationality || p.birth_place || contentId
      );
    }
    case 'news_articles': {
      if (contentId) {
        const { data } = await supabase
          .from('news_articles')
          .select('id, title, excerpt')
          .eq('id', contentId);
        return data || [];
      }
      // Fetch articles that have no country links yet
      const { data: linkedIds } = await supabase
        .from('news_article_countries')
        .select('article_id');
      const linked = new Set((linkedIds || []).map((r: any) => r.article_id));

      const { data: articles } = await supabase
        .from('news_articles')
        .select('id, title, excerpt')
        .limit(batchLimit * 2);

      return (articles || []).filter((a: any) => !linked.has(a.id)).slice(0, batchLimit);
    }
    default:
      return [];
  }
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require admin for all operations (writes to DB via service_role)
    const authResult = await requireAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;

    const body = await req.json();
    const {
      content_type,
      content_id,
      batch = false,
      batch_all = false,
      batch_limit: rawBatchLimit = 200,
      dry_run = false,
    } = body;

    // Cap batch_limit to prevent unbounded processing
    const batch_limit = Math.min(Math.max(1, rawBatchLimit), 500);

    // Load reference data
    await loadReferenceData();

    const VALID_TYPES = ['venues', 'events', 'personalities', 'news_articles'];

    // Batch all mode
    if (batch_all) {
      const allResults: Record<string, BatchResult> = {};

      for (const type of VALID_TYPES) {
        const items = await fetchUnlinkedItems(type, undefined, batch_limit);
        console.log(`[${type}] Found ${items.length} items to process`);

        let results: GeoLinkResult[];
        if (type === 'venues' || type === 'events') {
          results = await processVenuesOrEvents(type, items, dry_run);
        } else if (type === 'personalities') {
          results = await processPersonalities(items, dry_run);
        } else {
          results = await processNewsArticles(items, dry_run);
        }

        const linked = results.filter(r => r.status === 'linked').length;
        const partial = results.filter(r => r.status === 'partial').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const alreadyLinked = results.filter(r => r.status === 'already_linked').length;

        allResults[type] = {
          success: true, content_type: type, dry_run,
          total_processed: results.length,
          total_linked: linked, total_partial: partial,
          total_skipped: skipped, total_already_linked: alreadyLinked,
          results,
        };

        // Log to geo_link_log
        if (!dry_run && results.length > 0) {
          await supabase.from('geo_link_log').insert({
            entity_type: type,
            total_processed: results.length,
            total_linked: linked + partial,
            total_skipped: skipped + alreadyLinked,
            details: { dry_run, batch_limit, linked, partial, skipped, already_linked: alreadyLinked },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        batch_all: true,
        dry_run,
        results: allResults,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single content type mode
    if (!content_type || !VALID_TYPES.includes(content_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid content_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!batch && !content_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Must provide content_id for single mode or batch: true for batch mode',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = await fetchUnlinkedItems(content_type, content_id, batch_limit);
    console.log(`[${content_type}] Found ${items.length} items to process`);

    let results: GeoLinkResult[];
    if (content_type === 'venues' || content_type === 'events') {
      results = await processVenuesOrEvents(content_type, items, dry_run);
    } else if (content_type === 'personalities') {
      results = await processPersonalities(items, dry_run);
    } else {
      results = await processNewsArticles(items, dry_run);
    }

    const linked = results.filter(r => r.status === 'linked').length;
    const partial = results.filter(r => r.status === 'partial').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const alreadyLinked = results.filter(r => r.status === 'already_linked').length;

    // Log to geo_link_log
    if (!dry_run && results.length > 0) {
      await supabase.from('geo_link_log').insert({
        entity_type: content_type,
        total_processed: results.length,
        total_linked: linked + partial,
        total_skipped: skipped + alreadyLinked,
        details: { dry_run, batch_limit, content_id, linked, partial, skipped, already_linked: alreadyLinked },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      content_type,
      dry_run,
      total_processed: results.length,
      total_linked: linked,
      total_partial: partial,
      total_skipped: skipped,
      total_already_linked: alreadyLinked,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in geo-link-content:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
