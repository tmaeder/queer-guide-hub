import * as cheerio from 'cheerio';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * gaycities.com extraction library.
 *
 * Cloudflare gates the site hard (verified 2026-07-04):
 *  - Every plain HTTP client 403s (curl, undici, Deno fetch) — even with
 *    browser headers. TLS/JA3 fingerprinting.
 *  - HEADLESS Chromium 403s on the first navigation ("Attention Required").
 *  - HEADED Chromium passes clean — so all fetching runs through a headed
 *    browser (xvfb on CI) doing full DOCUMENT NAVIGATIONS.
 *  - In-page fetch()/XHR is 403-blocked even from a passing session — the
 *    documented AJAX filter endpoint is unusable for us; the same URLs
 *    return full HTML pages via document navigation, which is what we parse.
 *  - `selectTime=A+-+B` ('+' as space) trips the WAF; `%20` passes.
 *  - One WAF hit poisons the whole session (every later request 403s fast)
 *    → callers must recycle the browser on 403.
 *
 * Surfaces:
 *  - Listing filter page: /events?selectMetro=<id>&selectTime=<MM/DD/YYYY -
 *    MM/DD/YYYY>&upcomingEvents=<page>. Past ranges work back to ~2022.
 *  - Detail pages <metro>.gaycities.com/events/<numericId>-<slug> carry
 *    schema.org Event JSON-LD; full description lives in the page body.
 *  - The numeric id is a stable global sequence → source_entity_id.
 */

const BASE = 'https://www.gaycities.com';

export interface MetroOption {
  metroId: string;
  label: string;
}

export interface MetroInfo extends MetroOption {
  subdomain: string | null;
  city: string;
  country: string;
  countryCode: string;
  /** null for retired metros (Wayback-only) — hour precision is moot there. */
  timezone: string | null;
}

/** Live metros only (retired `r-<sub>` entries exist purely for geography). */
export function liveMetros(metros: MetroInfo[]): MetroInfo[] {
  return metros.filter((m) => !String(m.metroId).startsWith('r-'));
}

export interface EventStub {
  numericId: string;
  detailUrl: string;
  title: string | null;
  dateText: string | null;
  metroId?: string;
}

export interface EventDetail {
  numericId: string;
  url: string;
  subdomain: string | null;
  dead?: boolean;
  jsonLd: Record<string, unknown> | null;
  bodyDescription: string | null;
  tagSlugs: string[];
  fetchedAt: string;
  fromWayback?: boolean;
  /** City scraped from page chrome (title/og:title) — last-resort geography. */
  metaCity?: string | null;
}

/** "X (Event in Los Angeles) on GayCities" / "… - GayCities Key West" → city. */
export function extractMetaCity(html: string): string | null {
  const $ = cheerio.load(html);
  const og = $('meta[property="og:title"]').attr('content') ?? '';
  const title = $('title').first().text() ?? '';
  return (
    (og.match(/\(Event in ([^)]+)\)/i)?.[1] ?? title.match(/GayCities ([A-Za-zÀ-ſ .'-]+?)\s*$/)?.[1])?.trim() || null
  );
}

// ─── Session ────────────────────────────────────────────────────

export interface GcSession {
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

/**
 * Headed Chromium session (Cloudflare blocks headless — see header note).
 * Default UA kept as-is: overriding it creates a UA/client-hint mismatch
 * that CF scores against. Images/fonts/media and third-party ad/analytics
 * scripts are aborted to keep document navigations fast.
 */
export async function openGaycitiesSession(): Promise<GcSession> {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
  await context.route('**/*', (route) => {
    const t = route.request().resourceType();
    if (t === 'image' || t === 'font' || t === 'media') return route.abort();
    const u = route.request().url();
    if (!/gaycities\.com|web\.archive\.org/.test(u) && /doubleclick|googlesyndication|adsystem|google-analytics|googletagmanager|facebook|hotjar|amazon-adsystem|adsafeprotected|criteo/.test(u)) {
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  const resp = await page.goto(`${BASE}/events`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if ((resp?.status() ?? 0) >= 400) {
    await browser.close();
    throw new Error(`gaycities_session_${resp?.status()}`);
  }
  await page.waitForTimeout(1_500);
  return {
    browser,
    page,
    close: async () => {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    },
  };
}

/** openGaycitiesSession with retries — recycling must never kill a phase. */
export async function openSessionWithRetry(maxAttempts = 5): Promise<GcSession> {
  let lastErr: Error | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await openGaycitiesSession();
    } catch (err) {
      lastErr = err as Error;
      await jitterDelay(15_000 * (i + 1), 15_000);
    }
  }
  throw lastErr ?? new Error('gaycities_session_failed');
}

// ─── Metro discovery ────────────────────────────────────────────

export async function listMetros(page: Page): Promise<MetroOption[]> {
  return await page.evaluate(() => {
    const opts = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#metro_id_pulldown option'),
    );
    return opts
      .map((o) => ({ metroId: o.value.trim(), label: (o.textContent ?? '').trim() }))
      .filter((o) => o.metroId !== '' && /^\d+$/.test(o.metroId));
  });
}

// ─── AJAX listing ───────────────────────────────────────────────

export interface ListingParams {
  metroId?: string;
  /** MM/DD/YYYY */
  from?: string;
  /** MM/DD/YYYY */
  to?: string;
  page?: number;
  tag?: string;
}

export function listingUrl(params: ListingParams): string {
  // Hand-built: the WAF 403s '+'-encoded spaces in selectTime; %20 passes.
  const selectTime = params.from && params.to
    ? encodeURIComponent(`${params.from} - ${params.to}`)
    : '';
  return (
    `${BASE}/events?selectTag=${encodeURIComponent(params.tag ?? '')}` +
    `&selectMetro=${encodeURIComponent(params.metroId ?? '')}` +
    `&selectTime=${selectTime}` +
    `&latitude=&longitude=&upcomingEvents=${params.page ?? 1}`
  );
}

/**
 * Document navigation to the listing filter page (in-page fetch is
 * WAF-blocked). Returns the full page HTML; parse with parseListingCards.
 * Throws gaycities_listing_403 on a WAF hit — caller should recycle the session.
 */
export async function fetchListing(page: Page, params: ListingParams): Promise<string> {
  const url = listingUrl(params);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const status = resp?.status() ?? 0;
  if (status >= 400) throw new Error(`gaycities_listing_${status}`);
  return await page.content();
}

const DETAIL_HREF = /https?:\/\/([a-z0-9-]+)\.gaycities\.com\/events\/(\d+)-([a-z0-9-]*)/i;

/**
 * Parse listing HTML into event stubs (deduped by numeric id).
 *
 * Full listing pages contain a GLOBAL featured carousel (#featured-bar) plus
 * the filter-scoped results list (.upcomingEventsList). Only the results list
 * is parsed when present — otherwise featured events would be attributed to
 * whatever metro happened to be queried. Falls back to the whole document
 * for bare card fragments.
 */
export function parseListingCards(html: string): EventStub[] {
  if (!html || !html.trim()) return [];
  const $ = cheerio.load(html);
  // cheerio.load wraps fragments in html/body, so $('body') works for both.
  const scope = $('.upcomingEventsList').length ? $('.upcomingEventsList') : $('body');
  const byId = new Map<string, EventStub>();
  scope.find('a[href*="/events/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(DETAIL_HREF);
    if (!m) return;
    const numericId = m[2];
    const card = $(el).closest('article, li, div');
    const title =
      $(el).find('h1,h2,h3,h4').first().text().trim() ||
      card.find('h1,h2,h3,h4').first().text().trim() ||
      $(el).attr('title')?.trim() ||
      $(el).text().trim() ||
      null;
    const dateText =
      card.find('time').first().text().trim() ||
      card.find('[class*="date"]').first().text().trim() ||
      null;
    const existing = byId.get(numericId);
    if (!existing || (!existing.title && title)) {
      byId.set(numericId, {
        numericId,
        detailUrl: href.split('?')[0],
        title: title || existing?.title || null,
        dateText: dateText || existing?.dateText || null,
      });
    }
  });
  return Array.from(byId.values());
}

// ─── Detail pages ───────────────────────────────────────────────

/** Extract the schema.org Event object from a detail page's HTML. */
export function extractEventJsonLd(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const raw = $(el).text();
    if (!raw?.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Site JSON-LD occasionally has literal newlines inside strings.
      try {
        parsed = JSON.parse(raw.replace(/[\r\n\t]+/g, ' '));
      } catch {
        continue;
      }
    }
    const candidates: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
        ? ((parsed as { '@graph': unknown[] })['@graph'])
        : [parsed];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const type = (c as Record<string, unknown>)['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some((t) => typeof t === 'string' && /event/i.test(t))) {
        return c as Record<string, unknown>;
      }
    }
  }
  return null;
}

/** Longest plausible description text from the page body (JSON-LD truncates ~300 chars). */
export function extractBodyDescription(html: string): string | null {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer').remove();
  const candidates: string[] = [];
  $(
    '[class*="description"], [id*="description"], [class*="event-detail"], [class*="event_detail"], [itemprop="description"], article p',
  ).each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length >= 40) candidates.push(text);
  });
  if (candidates.length === 0) {
    const og = $('meta[property="og:description"]').attr('content')?.trim();
    return og && og.length > 0 ? og : null;
  }
  // Longest candidate wins; container matches include their children, so this
  // naturally picks the outermost description block.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0].slice(0, 8_000);
}

/** Category slugs linked from the page (e.g. /events/pride → "pride"). */
export function extractTagSlugs(html: string): string[] {
  const $ = cheerio.load(html);
  const tags = new Set<string>();
  $('a[href*="/events/"]').each((_i, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/\/events\/([a-z-]+)\/?$/i);
    if (m && !/^\d/.test(m[1])) tags.add(m[1].toLowerCase());
  });
  return Array.from(tags);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse the human date text used by pre-2022 event templates:
 * "Sep 1-4, 2021" · "Sep 30 - Oct 2, 2021" · "Dec 31, 2021 - Jan 1, 2022"
 * · "Sep 1, 2021". Returns naive local timestamps or null.
 */
export function parseGcTextDateRange(input: unknown): { start: string; end: string | null } | null {
  if (typeof input !== 'string') return null;
  const s = input.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
  const re = /([A-Za-z]{3,9})\.? (\d{1,2})(?:, (\d{4}))?(?: ?- ?(?:([A-Za-z]{3,9})\.? )?(\d{1,2})(?:, (\d{4}))?)?(?:,? (\d{4}))?/;
  const m = s.match(re);
  if (!m) return null;
  const [, mon1, d1, y1a, mon2, d2, y2a, yTail] = m;
  const m1 = MONTHS[mon1.slice(0, 3).toLowerCase()];
  if (!m1) return null;
  const yearEnd = y2a ?? yTail ?? y1a;
  if (!yearEnd) return null;
  const yearStart = y1a ?? (mon2 && MONTHS[mon2.slice(0, 3).toLowerCase()] && MONTHS[mon2.slice(0, 3).toLowerCase()]! < m1 ? String(Number(yearEnd) - 1) : yearEnd);
  const pad = (n: number | string) => String(n).padStart(2, '0');
  const start = `${yearStart}-${pad(m1)}-${pad(d1)}T00:00:00`;
  let end: string | null = null;
  if (d2) {
    const m2 = mon2 ? MONTHS[mon2.slice(0, 3).toLowerCase()] : m1;
    if (m2) end = `${yearEnd}-${pad(m2)}-${pad(d2)}T00:00:00`;
  }
  return { start, end };
}

const US_STATES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'florida','georgia','hawaii','idaho','illinois','indiana','iowa','kansas','kentucky',
  'louisiana','maine','maryland','massachusetts','michigan','minnesota','mississippi',
  'missouri','montana','nebraska','nevada','new hampshire','new jersey','new mexico',
  'new york','north carolina','north dakota','ohio','oklahoma','oregon','pennsylvania',
  'rhode island','south carolina','south dakota','tennessee','texas','utah','vermont',
  'virginia','washington','west virginia','wisconsin','wyoming','district of columbia','dc',
]);
const CA_PROVINCES = new Set([
  'alberta','british columbia','manitoba','new brunswick','newfoundland and labrador',
  'nova scotia','ontario','prince edward island','quebec','saskatchewan',
]);

interface LegacySubinfo {
  start: string;
  end: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
}

/**
 * Parse the 2012–2015 template's subinfo line:
 * "Saturday Sep 11, 2010 10:00am-6:00pm in Boulder, Colorado"
 */
export function parseLegacySubinfo(input: unknown): LegacySubinfo | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  // Trailing location: " in City[, Region]"
  let city: string | null = null;
  let region: string | null = null;
  let country: string | null = null;
  const locMatch = s.match(/\bin ([^,]+?)(?:, ([^,]+?))?\s*$/);
  if (locMatch) {
    city = locMatch[1].trim() || null;
    region = locMatch[2]?.trim() || null;
    s = s.slice(0, locMatch.index).trim();
  }
  if (region) {
    const r = region.toLowerCase();
    if (US_STATES.has(r)) country = 'United States';
    else if (CA_PROVINCES.has(r)) country = 'Canada';
    else country = region; // international pages put the country here
  }
  // Times: "10:00am-6:00pm" (or single). Capture, then strip.
  const times = [...s.matchAll(/(\d{1,2}):(\d{2})\s*(am|pm)/gi)].map((m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    return `${String(h).padStart(2, '0')}:${m[2]}:00`;
  });
  s = s.replace(/\d{1,2}:\d{2}\s*(am|pm)/gi, '').replace(/\s*-\s*$/, '').trim();
  // Weekdays are noise for the date parser.
  s = s.replace(/\b(Mon|Tues?|Wed(nes)?|Thur?s?|Fri|Satur|Sun)(day)?s?\b,?\s*/gi, '').trim();
  const range = parseGcTextDateRange(s);
  if (!range) return null;
  let start = range.start;
  let end = range.end;
  if (times[0]) start = `${start.slice(0, 10)}T${times[0]}`;
  if (times[1]) end = `${(end ?? start).slice(0, 10)}T${times[1]}`;
  return { start, end, city, region, country };
}

/**
 * Fallback extractor for pre-2022 templates (no Event JSON-LD). Two
 * generations:
 *  - 2012–2015: #event-header profile block with a subinfo line
 *    ("Saturday Sep 11, 2010 10:00am-6:00pm in Boulder, Colorado") and the
 *    description in .pp-mid-LEFT.
 *  - 2016–2021: WebPage JSON-LD + microdata itemprop=name + <time> text in
 *    the listing heading.
 * Rebuilds an Event-shaped object so normalizeGcEvent works unchanged.
 */
export function extractLegacyEvent(html: string): Record<string, unknown> | null {
  const $ = cheerio.load(html);
  const ogTitleRaw = $('meta[property="og:title"]').attr('content') ?? '';
  const ogTitle = ogTitleRaw.replace(/\s*\(Event in [^)]*\) on GayCities\s*$/i, '').trim();
  const titleTag = ($('title').first().text() ?? '')
    .replace(/^Event:\s*/i, '')
    .replace(/\s*-\s*Details and who's attending.*$/i, '')
    .replace(/\s*-\s*dates, times, map.*$/i, '')
    .trim();
  // City hides in the chrome when the body omits it.
  const metaCity = extractMetaCity(html);
  const ogDescription =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    null;
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;

  // Gen 2012–2015
  const header = $('#event-header .profile-top-L').first();
  if (header.length) {
    const headerName = header
      .contents()
      .filter((_i, n) => n.type === 'text')
      .first()
      .text()
      .trim();
    const name = headerName || ogTitle || titleTag;
    const sub = parseLegacySubinfo(header.find('.subinfo').text());
    if (name && sub) {
      const bodyDesc = $('.pp-mid-LEFT').first().text().replace(/\s+/g, ' ').trim();
      const city = sub.city ?? metaCity;
      return {
        '@type': 'Event',
        name,
        startDate: sub.start,
        endDate: sub.end,
        description: bodyDesc || ogDescription,
        image: ogImage ? [ogImage] : undefined,
        location: city
          ? {
              '@type': 'Place',
              name: null,
              address: {
                addressLocality: city,
                addressRegion: sub.region,
                addressCountry: sub.country,
              },
            }
          : null,
        _legacyTemplate: true,
      };
    }
  }

  // Gen 2016–2021
  const name = $('[itemprop="name"]').first().text().trim() || ogTitle || titleTag;
  if (!name) return null;
  const timeText =
    $('h1 time').first().text().trim() ||
    $('time').first().text().trim() ||
    $('[class*="time"], [class*="date"]').first().text().trim();
  const range = parseGcTextDateRange(timeText);
  if (!range) return null;
  return {
    '@type': 'Event',
    name,
    startDate: range.start,
    endDate: range.end,
    description: ogDescription,
    image: ogImage ? [ogImage] : undefined,
    location: metaCity
      ? { '@type': 'Place', name: null, address: { addressLocality: metaCity, addressCountry: null } }
      : null,
    _legacyTemplate: true,
  };
}

export function parseDetailHtml(
  html: string,
  url: string,
  opts?: { fromWayback?: boolean },
): EventDetail {
  const idMatch = url.match(/\/events\/(\d+)/);
  const subMatch = url.match(/^https?:\/\/([a-z0-9-]+)\.gaycities\.com/i);
  return {
    numericId: idMatch ? idMatch[1] : '',
    url: url.split('?')[0],
    subdomain: subMatch && subMatch[1] !== 'www' ? subMatch[1].toLowerCase() : null,
    jsonLd: extractEventJsonLd(html) ?? extractLegacyEvent(html),
    bodyDescription: extractBodyDescription(html),
    tagSlugs: extractTagSlugs(html),
    fetchedAt: new Date().toISOString(),
    fromWayback: opts?.fromWayback ?? false,
    metaCity: extractMetaCity(html),
  };
}

export async function fetchDetail(page: Page, url: string): Promise<EventDetail> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const status = response?.status() ?? 0;
  if (status === 404 || status === 410) {
    return {
      numericId: url.match(/\/events\/(\d+)/)?.[1] ?? '',
      url,
      subdomain: null,
      dead: true,
      jsonLd: null,
      bodyDescription: null,
      tagSlugs: [],
      fetchedAt: new Date().toISOString(),
    };
  }
  if (status >= 400) throw new Error(`gaycities_detail_${status}`);
  const html = await page.content();
  return parseDetailHtml(html, page.url());
}

// ─── Date parsing ───────────────────────────────────────────────

/**
 * gaycities JSON-LD dates come malformed: "2026-01-17 00:00:00T15:00:00"
 * (a midnight timestamp with the real local time appended after a T).
 * Also seen: clean ISO ("2026-01-17T15:00:00"), and bare dates.
 *
 * Returns a NAIVE local timestamp string ("YYYY-MM-DDTHH:MM:SS") — the repo
 * convention is local wall time in events.start_date plus the IANA zone in
 * events.timezone. Returns null when no date can be recovered.
 */
export function parseGcDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;
  const dateMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;
  const [, y, mo, d] = dateMatch;
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Prefer the LAST time component — in the malformed double format the
  // first ("00:00:00") is a placeholder and the appended one is real.
  const times = [...s.matchAll(/[T\s](\d{2}):(\d{2})(?::(\d{2}))?/g)];
  let time = '00:00:00';
  for (let i = times.length - 1; i >= 0; i--) {
    const [, hh, mm, ss] = times[i];
    if (Number(hh) > 23 || Number(mm) > 59) continue;
    const candidate = `${hh}:${mm}:${ss ?? '00'}`;
    if (candidate !== '00:00:00' || i === 0) {
      time = candidate;
      break;
    }
  }
  return `${y}-${mo}-${d}T${time}`;
}

// ─── Event type mapping ─────────────────────────────────────────

/** Allowed values of events.event_type (events_event_type_check). */
export const EVENT_TYPE_VOCAB = [
  'party', 'festival', 'pride', 'fetish', 'community', 'meetup', 'conference',
  'workshop', 'concert', 'film', 'drag', 'sports', 'art', 'theater',
  'fundraiser', 'protest', 'social', 'fair', 'other',
] as const;

const EVENT_TYPE_RULES: Array<[RegExp, string]> = [
  [/\bpride\b/i, 'pride'],
  [/\bdrag\b/i, 'drag'],
  [/film|movie|cinema/i, 'film'],
  [/theatre|theater/i, 'theater'],
  [/concert|music|dj\b|live band/i, 'concert'],
  [/conference|summit|convention/i, 'conference'],
  [/workshop|class\b/i, 'workshop'],
  [/sports|run\b|race\b|rodeo|tournament|ski\b/i, 'sports'],
  [/\bart\b|gallery|exhibit/i, 'art'],
  [/fundrais|charity|benefit/i, 'fundraiser'],
  [/protest|march for|rally/i, 'protest'],
  [/street.?fair|fair\b|market\b/i, 'fair'],
  [/bear|leather|fetish|kink|cruise\b/i, 'fetish'],
  [/party|club night|tea.?dance|pool.?party|t-?dance|circuit/i, 'party'],
  [/festival|fest\b/i, 'festival'],
  [/meetup|meet-up/i, 'meetup'],
  [/community|social\b/i, 'social'],
];

export function mapEventType(...signals: Array<string | null | undefined>): string {
  const haystack = signals.filter(Boolean).join(' ');
  for (const [re, type] of EVENT_TYPE_RULES) {
    if (re.test(haystack)) return type;
  }
  return 'other';
}

// ─── Normalization ──────────────────────────────────────────────

export interface NormalizedGcEvent {
  title: string;
  name: string;
  description: string | null;
  event_type: string;
  start_date: string;
  end_date: string | null;
  timezone: string | null;
  location: {
    address: string | null;
    city: string;
    country: string | null;
    country_code: string | null;
    lat: null;
    lng: null;
  };
  venue_name: string | null;
  ticket_url: string | null;
  website: string | null;
  images: string[];
  tags: string[];
  metadata: Record<string, unknown>;
}

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

/**
 * Map a JSON-LD country string to ISO2 (events.country check: ^[A-Z]{2}$).
 * Already-ISO2 strings pass through; a small name map covers the common
 * gaycities cases; anything unknown returns null (commit defaults to US only
 * for a truly absent country — a wrong non-US guess would be worse).
 */
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  'united states': 'US', usa: 'US', 'united states of america': 'US', us: 'US',
  canada: 'CA', 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB',
  australia: 'AU', 'new zealand': 'NZ', germany: 'DE', france: 'FR', spain: 'ES',
  italy: 'IT', netherlands: 'NL', belgium: 'BE', portugal: 'PT', ireland: 'IE',
  mexico: 'MX', brazil: 'BR', argentina: 'AR', chile: 'CL', colombia: 'CO', peru: 'PE',
  japan: 'JP', 'south korea': 'KR', china: 'CN', thailand: 'TH', singapore: 'SG',
  israel: 'IL', 'south africa': 'ZA', sweden: 'SE', norway: 'NO', denmark: 'DK',
  finland: 'FI', iceland: 'IS', switzerland: 'CH', austria: 'AT', greece: 'GR',
  'czech republic': 'CZ', poland: 'PL', hungary: 'HU', romania: 'RO', turkey: 'TR',
};

export function isoFromCountryName(name: string | null): string | null {
  if (!name) return null;
  const s = name.trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_NAME_TO_ISO2[s.toLowerCase()] ?? null;
}

function firstString(v: unknown): string | null {
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asString(item);
      if (s) return s;
    }
    return null;
  }
  return asString(v);
}

function httpsOnly(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('https://')) return url;
  if (url.startsWith('http://')) return 'https://' + url.slice(7);
  return null;
}

/**
 * Build a commit-ready normalized payload. Staging rows carry this pre-set in
 * normalized_data so pipeline-normalize (whose generic branch drops
 * venue_name/ticket_url/event_type) skips them and commit_event_staging_item
 * reads every field it supports.
 */
export function normalizeGcEvent(
  detail: EventDetail,
  metro: MetroInfo | null,
): NormalizedGcEvent | { reject: string } {
  const ld = detail.jsonLd ?? {};
  const title = asString(ld['name']);
  if (!title) return { reject: 'no_title' };
  const start = parseGcDate(ld['startDate']);
  if (!start) return { reject: 'no_start_date' };
  let end = parseGcDate(ld['endDate']);
  // gaycities frequently gives a timed start but a date-only (midnight) end,
  // so a same-day evening event computes end < start. Drop such an end rather
  // than emit an end-before-start row (validate hard-rejects those).
  if (end && end <= start) end = null;

  const locationLd = (ld['location'] ?? {}) as Record<string, unknown>;
  const addressLd = (locationLd['address'] ?? {}) as Record<string, unknown>;
  const venueName = asString(locationLd['name']);
  const streetAddress = asString(addressLd['streetAddress']);
  const localityLd = asString(addressLd['addressLocality']);

  // Metro (curated) is the primary geography truth; JSON-LD locality fills
  // in when no metro is known (Wayback-era orphans), then the page-chrome
  // city as last resort. A missing country is tolerated — commit defaults to
  // US, which matches the legacy www.gaycities.com pages that omit it
  // (US-only era); flagged in metadata for auditability.
  const city = metro?.city ?? localityLd ?? detail.metaCity ?? null;
  const country = metro?.country ?? asString(addressLd['addressCountry']);
  if (!city) return { reject: 'no_city' };

  const offers = (ld['offers'] ?? {}) as Record<string, unknown>;
  const ticketUrl = httpsOnly(asString(offers['url']));
  const image = httpsOnly(firstString(ld['image']) ?? asString(ld['thumbnailUrl']));

  const ldKeywords: string[] = Array.isArray(ld['keywords'])
    ? (ld['keywords'] as unknown[]).map((k) => String(k)).filter(Boolean)
    : typeof ld['keywords'] === 'string'
      ? [ld['keywords']]
      : [];
  const rawTags = [...new Set([...detail.tagSlugs, ...ldKeywords.map((k) => k.toLowerCase())])];

  const description =
    detail.bodyDescription && detail.bodyDescription.length > (asString(ld['description'])?.length ?? 0)
      ? detail.bodyDescription
      : asString(ld['description']);

  return {
    title,
    name: title,
    description,
    event_type: mapEventType(title, description, rawTags.join(' ')),
    start_date: start,
    end_date: end,
    timezone: metro?.timezone ?? null,
    location: {
      address: streetAddress,
      city,
      // events.country has an ISO2 check constraint (^[A-Z]{2}$), so the
      // column the commit reads (location.country) must be the code, not the
      // display name. Full name is preserved in metadata.country_name.
      country: metro?.countryCode ?? isoFromCountryName(country),
      country_code: metro?.countryCode ?? isoFromCountryName(country),
      lat: null,
      lng: null,
    },
    venue_name: venueName,
    ticket_url: ticketUrl,
    website: httpsOnly(asString(ld['url'])) ?? detail.url,
    images: image ? [image] : [],
    tags: rawTags,
    metadata: {
      url: detail.url,
      source_url: detail.url,
      country_name: country,
      gaycities_metro_id: metro?.metroId ?? null,
      gaycities_subdomain: detail.subdomain,
      gaycities_tags: rawTags,
      event_status: asString(ld['eventStatus']),
      from_wayback: detail.fromWayback === true,
      country_missing: !country,
      legacy_template: ld['_legacyTemplate'] === true,
    },
  };
}

// ─── Misc helpers ───────────────────────────────────────────────

export function jitterDelay(baseMs = 1_500, spreadMs = 1_000): Promise<void> {
  const ms = baseMs + Math.random() * spreadMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** MM/DD/YYYY for the selectTime filter. */
export function fmtUs(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

/** Quarterly [from, to] windows (inclusive) covering start→end. */
export function quarterWindows(start: Date, end: Date): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
  while (cursor < end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 3, 1));
    const to = new Date(Math.min(next.getTime() - 86_400_000, end.getTime()));
    windows.push({ from: fmtUs(cursor), to: fmtUs(to) });
    cursor.setTime(next.getTime());
  }
  return windows;
}
