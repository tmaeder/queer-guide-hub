/**
 * geo-link-content — Deterministic geo-linking edge function.
 *
 * Links content items (venues, events, personalities, news_articles) to
 * cities and countries using alias normalization and exact matching.
 * No AI / external APIs — pure DB matching against the cities/countries tables.
 *
 * Matching refuses to guess: an ambiguous city name resolves to NULL rather
 * than to the most-populous candidate, and a candidate contradicted by the
 * row's state or its source metro slug is blocked outright. Guard logic lives
 * in `_shared/city-collision-guard.ts` — same rules as the SQL runner
 * `run_event_city_link`.
 */

import { requireAdmin, getCorsHeaders, getServiceClient } from '../_shared/supabase-client.ts';
import { COUNTRY_ALIASES } from '../_shared/automation-utils.ts';
import { cityCollisionReason, proseStateContradiction } from '../_shared/city-collision-guard.ts';
import { cityLinkContradiction, linkWriteStatus, mergeRoundRobin } from '../_shared/geo-link-guards.ts';

const supabase = getServiceClient();

// ── Types ────────────────────────────────────────────────────────────

interface CountryRef { id: string; name: string; code: string }
interface CityRef {
  id: string;
  name: string;
  country_id: string;
  population: number | null;
  region_name: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface GeoLinkResult {
  entity_id: string;
  entity_name: string;
  city_resolved: string | null;
  country_resolved: string | null;
  city_id: string | null;
  country_id: string | null;
  status: 'linked' | 'partial' | 'skipped' | 'already_linked' | 'no_data' | 'blocked';
  blocked_reason?: string;
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
  total_blocked: number;
  results: GeoLinkResult[];
  error?: string;
}

// ── Reference data (loaded once per request) ─────────────────────────

let countriesCache: CountryRef[] = [];
let citiesCache: CityRef[] = [];
let proseCities: CityRef[] = [];
const PROSE_CITY_LIMIT = 1000;
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

  // Load all cities, minus two classes that must never receive new content:
  //
  //   * placeholder ("tmp-") stubs — linking to a hidden, low-quality bucket
  //     city is the mis-bucketing this function would otherwise never re-fix,
  //     since it only reprocesses rows with a NULL city_id/country_id.
  //   * MERGED rows (`duplicate_of_id is not null`). A merge is the admin
  //     saying "this row is not a place any more"; leaving it in the cache
  //     means this job re-populates it every hour and silently undoes the
  //     merge. The tmp- filter does not cover them — `new-york-city` was a
  //     merged row with an ordinary slug, and it kept absorbing content.
  //     The SQL runner `run_event_city_link` has always filtered on this.
  //
  // PAGED, and that is the fix, not a tidy-up. This read used to have no
  // range, so PostgREST capped it at max-rows (1000) against 3,751 eligible
  // cities: every city below rank 1000 by population (168k people at the cut)
  // was invisible, and a venue in one of them could never link however often
  // the job ran. Measured 2026-09-29, all 485 gayout venues whose exact city
  // exists in their own country pointed at a city outside the first 1000.
  //
  // What made the cap feel safe was that it hid same-name collisions
  // (Charleston, Springfield are small enough to be absent). Lifting it is
  // paired with the coordinate arm in processVenuesOrEvents, which checks the
  // row's own coordinates against the matched city — so reaching the tail does
  // not mean trusting a bare name there. The id tiebreak keeps pages stable
  // when populations tie (or are NULL, which sorts last).
  const pageSize = 1000;
  const maxPages = 50;
  const cities: CityRef[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from('cities')
      .select('id, name, country_id, population, region_name, latitude, longitude')
      .is('duplicate_of_id', null)
      .not('slug', 'like', 'tmp-%')
      .order('population', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    // Fail loudly. A silent empty or partial reference set links nothing (or
    // links against a subset) while the run reports success.
    if (error) throw new Error(`loading cities page ${page} failed: ${error.message}`);
    cities.push(...(data || []));
    if (!data || data.length < pageSize) break;
    if (page === maxPages - 1) {
      throw new Error(`cities exceeded ${maxPages * pageSize} rows — raise maxPages deliberately`);
    }
  }

  citiesCache = cities;
  citiesByName = new Map();

  for (const city of citiesCache) {
    const key = city.name.toLowerCase();
    if (!citiesByName.has(key)) {
      citiesByName.set(key, []);
    }
    citiesByName.get(key)!.push(city);
  }

  // News prose matching keeps EXACTLY the reference set it had before the
  // page loop: the 1000 most populous cities. That is deliberate, not an
  // oversight. The full set would add 424 more cities of 100k+ people to the
  // title/excerpt regex, and prose has no coordinates to corroborate a match —
  // proseStateContradiction covers only a curated list of ambiguous names.
  // Widening news tagging is its own decision with its own collision surface.
  proseCities = citiesCache.slice(0, PROSE_CITY_LIMIT);

  console.log(
    `Loaded ${countriesCache.length} countries, ${citiesCache.length} cities ` +
    `(${proseCities.length} used for news prose)`,
  );
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

  // `cities` holds at most one row per (name, country), so the country anchor
  // makes the match unique when we have one. (It does NOT make it correct —
  // the same-name twin may simply be absent from `cities`; that is what the
  // collision guards downstream are for.)
  if (countryId) {
    const inCountry = candidates.find(c => c.country_id === countryId);
    if (inCountry) return inCountry;
    // D10 fall-through: feeds do ship wrong country codes (an Outsavvy event in
    // Salford, UK arrives with addressCountry="US"), so a cross-country match
    // is still worth taking — but only below.
  }

  // Only link when the name is globally unambiguous. The former fallback
  // returned candidates[0], i.e. the most-populous same-name city, which is
  // how a wrong-country "Paris" got linked. Guessing is not recoverable; a
  // NULL city_id is.
  return candidates.length === 1 ? candidates[0] : null;
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
  for (const city of proseCities) {
    if (!city.population || city.population < 100000) continue;
    if (city.name.length < 5) continue;
    if (AMBIGUOUS_GEO_NAMES.has(city.name.toLowerCase())) continue;
    const regex = new RegExp(`\\b${escapeRegex(city.name)}\\b`, 'i');
    if (regex.test(text)) {
      // Same-name collision, prose edition. A bare "Portland" cannot tell
      // Portland, Maine from Portland, Oregon, and `cities` holds only the
      // latter. AMBIGUOUS_GEO_NAMES above does not cover this — it lists common
      // English words, not names whose twin the reference table cannot hold.
      const collision = proseStateContradiction(city, text);
      if (collision) {
        console.log(`[news] city link refused — ${collision}`);
        continue;
      }
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
  metroSlugs: Map<string, string> = new Map(),
): Promise<GeoLinkResult[]> {
  const results: GeoLinkResult[] = [];

  for (const item of items) {
    const id = item.id as string;
    const name = (item.name || item.title || 'Unknown') as string;
    const cityText = item.city as string | null;
    const countryText = item.country as string | null;
    const existingCityId = item.city_id as string | null;
    const existingCountryId = item.country_id as string | null;
    const stateText = item.state as string | null;
    const rowCoords = {
      latitude: item.latitude as number | string | null,
      longitude: item.longitude as number | string | null,
    };

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

    let country = existingCountryId
      ? countryById.get(existingCountryId) || null
      : resolveCountry(countryText);
    let city = existingCityId
      ? citiesCache.find(c => c.id === existingCityId) || null
      : resolveCity(cityText, country?.id);

    // Same-name city collision: refuse rather than guess. Two sources of a
    // refusal — a live contradiction found here, or a standing quarantine that
    // `run_event_city_link` already recorded (otherwise this hourly job would
    // undo that runner's decision one row at a time). Country linking is
    // unaffected: the collision is within a single country.
    let blockedReason: string | null = null;
    if (!existingCityId && city) {
      const enrichment = (item.enrichment_status || {}) as Record<string, unknown>;
      const priorLink = enrichment.event_city_link as Record<string, unknown> | undefined;
      // Live contradiction first so the log names the actual evidence; the
      // standing quarantine is the fallback (it covers rows whose evidence
      // lives somewhere this function cannot see).
      blockedReason = cityCollisionReason(city, stateText, metroSlugs.get(id), cityText || '')
        || cityLinkContradiction(rowCoords, city, country?.id)
        || (priorLink?.blocked ? `quarantined by run_event_city_link: ${priorLink.blocked}` : null);

      if (blockedReason) {
        console.log(`[${table}] ${id} city link refused — ${blockedReason}`);
        city = null;
      }
    }

    // D10: trust city > country text. Source feeds sometimes ship a
    // wrong country code (e.g. an Outsavvy event in Salford, UK arrives
    // with addressCountry="US"), and the city lookup is anchored to
    // population/coords. When the resolved city is in a different country
    // than the text-resolved country, snap to the city's country. This
    // prevents "Salford, United States" headers.
    if (city && city.country_id && country && city.country_id !== country.id) {
      country = countryById.get(city.country_id) || country;
    }

    const newCityId = city?.id || null;
    const newCountryId = country?.id || null;

    if (!newCityId && !newCountryId) {
      results.push({
        entity_id: id, entity_name: name,
        city_resolved: null, country_resolved: null,
        city_id: null, country_id: null,
        status: blockedReason ? 'blocked' : 'skipped',
        ...(blockedReason ? { blocked_reason: blockedReason } : {}),
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
      status: blockedReason
        ? 'blocked'
        : linkWriteStatus({ existingCityId, existingCountryId, newCityId, newCountryId }),
      ...(blockedReason ? { blocked_reason: blockedReason } : {}),
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
      status: linkWriteStatus({ existingCityId, existingCountryId, newCityId, newCountryId }),
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
      // Persist the no-signal verdict so the article doesn't recycle at the
      // head of every subsequent sweep (head-stall).
      if (!dryRun) {
        const { error } = await supabase
          .from('news_geo_checked')
          .upsert({ article_id: id }, { onConflict: 'article_id' });
        if (error) console.error(`Error marking news ${id} geo-checked:`, error.message);
      }
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

interface WorkList {
  items: Record<string, unknown>[];
  /** Round-robin position to persist in geo_link_log.details.cursor. */
  cursor: string | null;
}

/**
 * Where the previous batch run for this type stopped. The run log carries it,
 * so the round robin needs no table of its own. Rows logged without a cursor
 * (single content_id calls, and every run before this change) are skipped
 * rather than read as "start over". A failed read starts from the beginning,
 * which is the old behaviour, not a new failure.
 */
async function readCursor(entityType: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('geo_link_log')
    .select('details')
    .eq('entity_type', entityType)
    .not('details->>cursor', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error(`reading ${entityType} cursor failed:`, error.message);
    return null;
  }
  const details = (data?.[0]?.details || null) as Record<string, unknown> | null;
  return typeof details?.cursor === 'string' ? details.cursor : null;
}

/**
 * A work-list filter. Generic over the builder so each filter keeps the
 * PostgREST builder type it was given — `or()` returns the same builder.
 */
interface OrFilterable<Q> {
  or(filters: string): Q;
}
type Filter = <Q extends OrFilterable<Q>>(q: Q) => Q;

/**
 * Round-robin read of the rows still missing a city or country: rows after the
 * cursor in id order, wrapping to the start when that half runs short.
 *
 * This replaces an unordered `LIMIT n`, which returned roughly the same
 * physical rows every run — so the rows that cannot be resolved (no city of
 * that name exists) occupied the whole batch forever and everything behind
 * them was never read. A full cycle over ~6,800 unlinked venues at 200 a run
 * now takes ~34 hourly runs instead of never.
 */
async function fetchRoundRobin(
  table: string,
  columns: string,
  filter: Filter,
  batchLimit: number,
  cursor: string | null,
): Promise<WorkList> {
  const base = () => filter(supabase.from(table).select(columns)).order('id', { ascending: true });

  let afterCursor: { id: string }[] = [];
  if (cursor) {
    const { data, error } = await base().gt('id', cursor).limit(batchLimit);
    if (error) throw new Error(`${table} work list (after cursor) failed: ${error.message}`);
    afterCursor = (data || []) as unknown as { id: string }[];
  }

  let fromStart: { id: string }[] = [];
  if (afterCursor.length < batchLimit) {
    const { data, error } = await base().limit(batchLimit);
    if (error) throw new Error(`${table} work list (from start) failed: ${error.message}`);
    fromStart = (data || []) as unknown as { id: string }[];
  }

  const { rows, cursor: next } = mergeRoundRobin(afterCursor, fromStart, batchLimit);
  return { items: rows as Record<string, unknown>[], cursor: next };
}

async function fetchUnlinkedItems(
  contentType: string,
  contentId?: string,
  batchLimit: number = 200,
): Promise<WorkList> {
  const missing: Filter = (q) => q.or('city_id.is.null,country_id.is.null');

  switch (contentType) {
    case 'venues': {
      const columns = 'id, name, city, state, country, city_id, country_id, latitude, longitude, enrichment_status';
      if (contentId) {
        const { data } = await supabase.from('venues').select(columns).eq('id', contentId);
        return { items: data || [], cursor: null };
      }
      return fetchRoundRobin('venues', columns, missing, batchLimit, await readCursor('venues'));
    }
    case 'events': {
      const columns = 'id, title, city, state, country, city_id, country_id, latitude, longitude, enrichment_status';
      if (contentId) {
        const { data } = await supabase.from('events').select(columns).eq('id', contentId);
        return { items: data || [], cursor: null };
      }
      return fetchRoundRobin('events', columns, missing, batchLimit, await readCursor('events'));
    }
    case 'personalities': {
      const columns = 'id, name, nationality, birth_place, city_id, country_id';
      if (contentId) {
        const { data } = await supabase.from('personalities').select(columns).eq('id', contentId);
        return { items: data || [], cursor: null };
      }
      const list = await fetchRoundRobin(
        'personalities',
        columns,
        (q) => missing(q).or('nationality.neq.,birth_place.neq.'),
        batchLimit,
        await readCursor('personalities'),
      );
      // The cursor stays on the unfiltered list's last row so the round robin
      // still advances past rows this filter drops.
      return {
        items: list.items.filter((p) => p.nationality || p.birth_place),
        cursor: list.cursor,
      };
    }
    case 'news_articles': {
      if (contentId) {
        const { data } = await supabase
          .from('news_articles')
          .select('id, title, excerpt')
          .eq('id', contentId);
        return { items: data || [], cursor: null };
      }
      // Work-list RPC: newest-first articles with no country links and no
      // persisted "no geo signal" marker (NOT EXISTS in SQL — avoids fetching
      // the whole news_article_countries table and head-stalling on
      // unlinkable articles). It already makes progress, so no cursor.
      const { data: articles, error } = await supabase
        .rpc('news_articles_unlinked_geo', { p_limit: batchLimit });
      if (error) console.error('news_articles_unlinked_geo failed:', error.message);
      return { items: articles || [], cursor: null };
    }
    default:
      return { items: [], cursor: null };
  }
}

/**
 * Fetch the gaycities metro slug per event (guard B). Chunked: a PostgREST
 * `in.()` filter travels in the URL, and a few hundred UUIDs overflow it —
 * silently returning fewer rows rather than erroring.
 */
async function fetchMetroSlugs(eventIds: string[]): Promise<Map<string, string>> {
  const slugs = new Map<string, string>();
  for (let i = 0; i < eventIds.length; i += 100) {
    const chunk = eventIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from('event_sources')
      .select(
        'event_id, ' +
        'sub_norm:payload->normalized->metadata->>gaycities_subdomain, ' +
        'sub_raw:payload->metadata->>gaycities_subdomain',
      )
      .in('event_id', chunk);
    if (error) {
      // Fail loudly: a silent empty map would disarm guard B without a trace.
      console.error('fetchMetroSlugs failed:', error.message);
      continue;
    }
    for (const row of data || []) {
      // The JSON-path aliases above are opaque to the generated PostgREST types.
      const r = row as unknown as Record<string, string | null>;
      const slug = r.sub_norm || r.sub_raw;
      if (slug && r.event_id && !slugs.has(r.event_id)) slugs.set(r.event_id, slug);
    }
  }
  return slugs;
}

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // SECURITY: Require admin for all operations (writes to DB via service_role)
    // Exception: workflow-dispatcher calls with service role key directly
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '___none___';
    const isServiceRole = authHeader?.includes(serviceRoleKey);
    if (!isServiceRole) {
      const authResult = await requireAdmin(req, supabase);
      if (authResult instanceof Response) return authResult;
    }

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
        const { items, cursor } = await fetchUnlinkedItems(type, undefined, batch_limit);
        console.log(`[${type}] Found ${items.length} items to process`);

        let results: GeoLinkResult[];
        if (type === 'venues' || type === 'events') {
          const slugs = type === 'events'
            ? await fetchMetroSlugs(items.map(i => i.id as string))
            : new Map<string, string>();
          results = await processVenuesOrEvents(type, items, dry_run, slugs);
        } else if (type === 'personalities') {
          results = await processPersonalities(items, dry_run);
        } else {
          results = await processNewsArticles(items, dry_run);
        }

        const linked = results.filter(r => r.status === 'linked').length;
        const partial = results.filter(r => r.status === 'partial').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const alreadyLinked = results.filter(r => r.status === 'already_linked').length;
        const blocked = results.filter(r => r.status === 'blocked').length;

        allResults[type] = {
          success: true, content_type: type, dry_run,
          total_processed: results.length,
          total_linked: linked, total_partial: partial,
          total_skipped: skipped, total_already_linked: alreadyLinked,
          total_blocked: blocked,
          results,
        };

        // Log to geo_link_log
        if (!dry_run && (results.length > 0 || cursor)) {
          await supabase.from('geo_link_log').insert({
            entity_type: type,
            total_processed: results.length,
            total_linked: linked + partial,
            total_skipped: skipped + alreadyLinked + blocked,
            details: { dry_run, batch_limit, linked, partial, skipped, already_linked: alreadyLinked, blocked, cursor },
          });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        batch_all: true,
        dry_run,
        results: allResults,
      }), {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Single content type mode
    if (!content_type || !VALID_TYPES.includes(content_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid content_type. Must be one of: ${VALID_TYPES.join(', ')}`,
      }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    if (!batch && !content_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Must provide content_id for single mode or batch: true for batch mode',
      }), {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    const { items, cursor } = await fetchUnlinkedItems(content_type, content_id, batch_limit);
    console.log(`[${content_type}] Found ${items.length} items to process`);

    let results: GeoLinkResult[];
    if (content_type === 'venues' || content_type === 'events') {
      const slugs = content_type === 'events'
        ? await fetchMetroSlugs(items.map(i => i.id as string))
        : new Map<string, string>();
      results = await processVenuesOrEvents(content_type, items, dry_run, slugs);
    } else if (content_type === 'personalities') {
      results = await processPersonalities(items, dry_run);
    } else {
      results = await processNewsArticles(items, dry_run);
    }

    const linked = results.filter(r => r.status === 'linked').length;
    const partial = results.filter(r => r.status === 'partial').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const alreadyLinked = results.filter(r => r.status === 'already_linked').length;
    const blocked = results.filter(r => r.status === 'blocked').length;

    // Log to geo_link_log
    if (!dry_run && (results.length > 0 || cursor)) {
      await supabase.from('geo_link_log').insert({
        entity_type: content_type,
        total_processed: results.length,
        total_linked: linked + partial,
        total_skipped: skipped + alreadyLinked + blocked,
        details: { dry_run, batch_limit, content_id, linked, partial, skipped, already_linked: alreadyLinked, blocked, cursor },
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
      total_blocked: blocked,
      results,
    }), {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in geo-link-content:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});
