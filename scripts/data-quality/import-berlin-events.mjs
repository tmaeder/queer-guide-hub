#!/usr/bin/env node
/**
 * Import five Berlin queer-event sources into `events`.
 *
 *   bka-theater   www.bka-theater.de/spielplan/  — 231 dates / 86 productions,
 *                 Aug '26 → Nov '27. The whole programme is ONE page (the
 *                 month tabs are `#month202610` anchors), so the crawl is a
 *                 single request. robots.txt sets `Crawl-delay: 7` and
 *                 disallows /cal.php; neither constrains a one-page read.
 *
 *   siegessaeule  www.siegessaeule.de/termine/   — one page per DAY, five
 *                 category rails. Detail pages carry the description, the
 *                 hashtags and the venue's full address, so the crawl is
 *                 list-then-detail. robots.txt blocks only PetalBot/AhrefsBot.
 *
 *   ticketcorner  Travestie im Kiez, 82 dates at Theater im Keller.
 *                 *** THIS HOST CANNOT BE CRAWLED FROM A SCRIPT. *** It sits
 *                 behind Akamai Bot Manager and resets the TLS connection for
 *                 curl and for Node's fetch (curl exit 92) while serving a
 *                 real browser normally. Its data is therefore a COMMITTED
 *                 SNAPSHOT at fixtures/ticketcorner-travestie-im-kiez.json,
 *                 refreshed by hand from a browser session:
 *
 *                   for (let p = 1; p <= 4; p++) {
 *                     const d = new DOMParser().parseFromString(
 *                       await (await fetch(p === 1 ? location.pathname
 *                         : location.pathname + '?pnum=' + p)).text(), 'text/html')
 *                     …collect the EventSeries JSON-LD's subEvent[]…
 *                   }
 *
 *                 For the same reason ticketcorner gets NO recurring
 *                 `source-*` edge function — a cron'd fetch would fail closed
 *                 forever, which is the `source-spartacus` trap (a source that
 *                 reported success and wrote zero rows for its entire life).
 *
 *   lab-oratory   www.lab-oratory.de — 75 parties, Aug → Dec '26, marked up as
 *                 schema.org MICRODATA (not JSON-LD). Whole programme on one
 *                 page. `startDate` carries NO offset and is Berlin wall time.
 *
 *   boese-buben   www.boese-buben-berlin.de — a rolling window, NOT an
 *                 archive: the event list ignores `?day=` / `?month=` /
 *                 `?year=` outright (measured — different day values return
 *                 byte-identical sets), so coverage is the union of the base
 *                 page and the 19 kink category pages, ~15 occurrences. The
 *                 recurrence text ("4.Samstag im Monat") is NOT expanded into
 *                 synthetic dates; the club publishes a bounded horizon and
 *                 reserves the right to change later dates.
 *
 * Lab.oratory and Böse Buben are sex-on-premises venues, so `event_type` is
 * 'fetish' and `age_restriction` '18+' for the whole source rather than
 * inferred per row. Neither is a content gate — see ADULT_TAGS.
 *
 * GEO IS A CONSTANT, NEVER A LOOKUP. All five sources are Berlin, and
 * `cities` holds two rows named "Berlin" — Germany (3.7M) and Berlin, New
 * Hampshire. Resolving by name is precisely the collision that mislinked 116
 * events in the 2026-08 backfill, so `location.city` is always sent WITH
 * `location.country = 'DE'` (which is what scopes the RPC's resolution), and
 * `--phase verify` asserts afterwards that not one row landed on the US city.
 *
 * IDENTITY (`source_entity_id`) — stable native keys only, per the spartacus
 * lesson that name-derived keys duplicated 47% of a cohort:
 *   bka-theater    "<data-pid>:<YYYY-MM-DDTHH:MM>"  production id + its date
 *   siegessaeule   "<category>/<slug>/<date>/<time>" straight off the href
 *   ticketcorner   "<numeric id>"                    1:1 with the date (82/82)
 *   lab-oratory    "<block uuid>"                    falling back to the start
 *   boese-buben    "<slug>:<YYYYMMDD>"               straight off the href
 *
 * Usage:
 *   node scripts/data-quality/import-berlin-events.mjs --phase crawl-bka
 *   node scripts/data-quality/import-berlin-events.mjs --phase crawl-sieg [--days N]
 *   node scripts/data-quality/import-berlin-events.mjs --phase crawl-lab
 *   node scripts/data-quality/import-berlin-events.mjs --phase crawl-bb
 *   node scripts/data-quality/import-berlin-events.mjs --phase stage [--dry-run] [--refresh]
 *   node scripts/data-quality/import-berlin-events.mjs --phase drain --entity venue
 *   node scripts/data-quality/import-berlin-events.mjs --phase drain --entity event
 *   node scripts/data-quality/import-berlin-events.mjs --phase tag
 *   node scripts/data-quality/import-berlin-events.mjs --phase verify
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node >= 22.18 strips erasable TS syntax natively, so the Deno-first parser
// module loads with no build step — the same trick import-patroc.mjs uses.
const P = await import('../../supabase/functions/_shared/berlin-events-parse.ts');

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = 'xqeacpakadqfxjxjcewc';
const OUT = join(process.cwd(), 'out-berlin-events');
const CACHE = join(OUT, 'cache');
const UA = 'queer.guide-dataquality/1.0 (tmaeder@me.com)';

/** Berlin, Germany — NOT Berlin, New Hampshire. Pinned, never resolved. */
const BERLIN_CITY_ID = '5761c6c4-3ed6-4429-832b-025e508db544';
/**
 * Pre-existing venue rows these imports link straight to.
 *
 * All three already existed — none is minted here. Lab.Oratory and Böse Buben
 * each exist TWICE: a spartacus-sourced row with a description and a matching
 * website, and a bare OSM stub created 2026-08-10. The spartacus row is used
 * (Böse Buben's OSM stub even points at a different domain, boese-buben.de).
 * The duplicate pairs are deliberately NOT merged here — a venue merge is a
 * reversible decision that belongs to the dedup engine and its review queue,
 * not to an importer.
 */
const TIK_VENUE_ID = '554a3ad7-7120-474a-951c-57bc7fe5d48a';
const LAB_VENUE_ID = '9e1c6092-e86d-4f91-b5ec-bf557d27240c';
const BB_VENUE_ID = '3a612e45-3f17-47b0-8fa5-7c973aa4b6f4';
const BKA_VENUE_KEY = 'bka-theater-berliner-kabarett-anstalt';

const SOURCES = "('bka-theater','siegessaeule','ticketcorner','lab-oratory','boese-buben')";

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : d;
};
const has = (n) => args.includes(`--${n}`);
const PHASE = flag('phase', 'crawl-bka');
const DRY = has('dry-run');
const REFRESH = has('refresh');
const ENTITY = flag('entity', 'event');
const DAYS = Number(flag('days', 225));

mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fetching

/**
 * Disk-cached GET. A re-run of any phase costs zero requests, which is what
 * makes it safe to iterate on the parser against ~2.5k detail pages.
 *
 * An EMPTY body is cached for a 404 but never for a transport error: caching a
 * truncated body would bake the failure in permanently, which is how the
 * "Madrid has no metro" empties got committed in the transit-line run.
 */
async function getCached(url, { minBytes = 2000 } = {}) {
  const path = join(CACHE, createHash('sha1').update(url).digest('hex') + '.html');
  if (existsSync(path)) return readFileSync(path, 'utf8');

  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'de-DE,de;q=0.9' },
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 404 || res.status === 410) {
        writeFileSync(path, '');
        return '';
      }
      // Siegessäule rate-limits a sustained crawl (measured: ~10 pages at
      // 700 ms then 429). A 429 is a "come back later", NOT a failure — back
      // off hard and keep the slot, because giving up here would cache nothing
      // and the retry loop would hammer the same wall on the next run.
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 5000 * attempt);
        console.warn(`[fetch] ${res.status} — backing off ${Math.round(wait / 1000)}s`);
        await sleep(wait);
        THROTTLE.ms = Math.min(6000, THROTTLE.ms * 1.5);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (body.length < minBytes) throw new Error(`short body ${body.length}`);
      writeFileSync(path, body);
      return body;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * attempt);
    }
  }
  throw new Error(`fetch failed ${url}: ${lastErr?.message ?? 'rate limited'}`);
}

/** Adaptive politeness: raised by every 429, decayed slowly on success. */
const THROTTLE = { ms: 1500 };
const politeSleep = async () => {
  await sleep(THROTTLE.ms);
  THROTTLE.ms = Math.max(1200, THROTTLE.ms * 0.98);
};

const readJson = (f, d = null) =>
  existsSync(join(OUT, f)) ? JSON.parse(readFileSync(join(OUT, f), 'utf8')) : d;
const writeJson = (f, v) => writeFileSync(join(OUT, f), JSON.stringify(v, null, 1));

// ---------------------------------------------------------------- crawling

async function phaseCrawlBka() {
  const html = await getCached('https://www.bka-theater.de/spielplan/', { minBytes: 100_000 });
  const rows = P.parseBkaSpielplan(html);
  if (!rows.length) throw new Error('BKA: parsed 0 rows — markup changed, refusing to write');
  writeJson('bka.json', rows);
  console.log(
    `[crawl-bka] ${rows.length} dates / ${new Set(rows.map((r) => r.productionId)).size} productions ` +
      `(${rows[0].date} → ${rows.at(-1).date})`,
  );
}

/** YYYY-MM-DD, N days from today, in Berlin's calendar. */
function berlinDays(n) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: P.BERLIN.timezone }).format(new Date());
  const out = [];
  const d = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function phaseCrawlSieg() {
  const days = berlinDays(DAYS);
  const refs = new Map();

  for (const [i, day] of days.entries()) {
    const html = await getCached(`https://www.siegessaeule.de/termine/?date=${day}`, {
      minBytes: 20_000,
    });
    for (const r of P.parseSiegessaeuleDay(html)) {
      // A teaser for day X can appear on day Y's page (the rails show a
      // window); key on the href so each occurrence is stored once.
      if (r.date === day) refs.set(`${r.category}/${r.slug}/${r.date}/${r.time}`, r);
    }
    if (i % 20 === 0)
      console.log(`[crawl-sieg] list ${i + 1}/${days.length} — ${refs.size} refs (${Math.round(THROTTLE.ms)}ms)`);
    await politeSleep();
  }
  console.log(`[crawl-sieg] ${refs.size} occurrences over ${days.length} days`);

  // Detail pages: one fetch per SERIES, not per occurrence. A weekly event has
  // one description and one venue; fetching it 30 times would be 30x the load
  // for identical bytes.
  const bySeries = new Map();
  for (const r of refs.values()) {
    const k = `${r.category}/${r.slug}`;
    if (!bySeries.has(k)) bySeries.set(k, r);
  }
  console.log(`[crawl-sieg] ${bySeries.size} distinct series to detail-fetch`);

  const details = {};
  let i = 0;
  for (const [k, r] of bySeries) {
    try {
      const html = await getCached(r.url, { minBytes: 10_000 });
      if (html) details[k] = P.parseSiegessaeuleDetail(html);
    } catch (e) {
      console.warn(`[crawl-sieg] detail failed ${k}: ${e.message}`);
    }
    if (++i % 50 === 0) console.log(`[crawl-sieg] detail ${i}/${bySeries.size}`);
    await politeSleep();
  }

  writeJson('sieg-refs.json', [...refs.values()]);
  writeJson('sieg-details.json', details);
  console.log(`[crawl-sieg] done — ${refs.size} occurrences, ${Object.keys(details).length} details`);
}

async function phaseCrawlLab() {
  const html = await getCached('https://www.lab-oratory.de/', { minBytes: 30_000 });
  const rows = P.parseLabOratory(html);
  if (!rows.length) throw new Error('lab.oratory: parsed 0 events — markup changed, refusing to write');
  writeJson('lab.json', rows);
  console.log(`[crawl-lab] ${rows.length} parties (${rows[0].startLocal} → ${rows.at(-1).startLocal})`);
}

/**
 * Böse Buben publishes a rolling window, not an archive.
 *
 * The event list ignores `?day=` / `?month=` / `?year=` entirely (measured:
 * three different day values return byte-identical sets), so the only way to
 * widen the window is the union across the 19 kink category pages, which each
 * surface a different slice. The category list is read off the base page
 * rather than hardcoded.
 *
 * This yields only the near-term dates the club actually commits to. That is
 * the correct ceiling: the site states its calendar is binding to a fixed
 * horizon and reserves the right to change later dates, so expanding the
 * recurrence text ("4.Samstag im Monat") into synthetic future dates would be
 * inventing a schedule the venue has not published.
 */
async function phaseCrawlBb() {
  const base = 'https://www.boese-buben-berlin.de';
  const home = await getCached(`${base}/events-eng.html`, { minBytes: 20_000 });

  const cats = [...new Set([...home.matchAll(/href="(\/events-eng\/category\/[a-z0-9-]+\.html)"/g)].map((m) => m[1]))];
  console.log(`[crawl-bb] ${cats.length} category pages discovered`);

  const byKey = new Map();
  for (const e of P.parseBoeseBubenList(home)) byKey.set(`${e.slug}:${e.day}`, e);

  for (const [i, c] of cats.entries()) {
    try {
      const html = await getCached(base + c, { minBytes: 10_000 });
      for (const e of P.parseBoeseBubenList(html)) byKey.set(`${e.slug}:${e.day}`, e);
    } catch (err) {
      console.warn(`[crawl-bb] ${c}: ${err.message}`);
    }
    if ((i + 1) % 5 === 0) console.log(`[crawl-bb] ${i + 1}/${cats.length} — ${byKey.size} occurrences`);
    await politeSleep();
  }

  const details = {};
  for (const e of byKey.values()) {
    try {
      const html = await getCached(e.detailUrl, { minBytes: 10_000 });
      if (html) details[`${e.slug}:${e.day}`] = P.parseBoeseBubenDetail(html);
    } catch (err) {
      console.warn(`[crawl-bb] detail ${e.slug}: ${err.message}`);
    }
    await politeSleep();
  }

  writeJson('bb.json', [...byKey.values()]);
  writeJson('bb-details.json', details);
  console.log(`[crawl-bb] ${byKey.size} occurrences, ${Object.keys(details).length} details`);
}

// ------------------------------------------------------------- normalising

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() || null : null);

/** Every payload shares this geo block. See the header: geo is a constant. */
const berlinLocation = (extra = {}) => ({
  city: P.BERLIN.city,
  country: P.BERLIN.country, // ISO-2; events.country is CHECK-constrained
  timezone: P.BERLIN.timezone,
  ...extra,
});

/**
 * Readings that outrank a source's own format label, because they say what an
 * act IS rather than what shape it takes. See the note in bkaPayloads().
 */
const QUEER_SIGNAL = new Set(['drag', 'fetish']);

function bkaPayloads(venueId = null) {
  const rows = readJson('bka.json', []);
  return rows
    .filter((e) => e.startIso)
    .map((e) => {
      const title = e.subtitle ? `${e.title}: ${e.subtitle}` : e.title;
      const badges = e.badges.join(' ');
      // SOURCE BEATS NAME, with one exception.
      //
      // The badge is the theatre's own genre label and is authoritative about
      // FORMAT; the title is prose. Reading them together typed "MKSM:
      // Acoustic Pride" — badged `Konzert` — as `pride`, which tripped the
      // pride validator (not a Saturday, wrong time window) and parked an
      // ordinary concert in human review.
      //
      // The exception is the queer-identity rungs. "Drag" in a title reliably
      // means the act IS drag ("The Three Drag Tenors", badged `Konzert`, is
      // a drag concert and belongs in the drag facet), whereas "Pride" is an
      // ordinary English word that happens to appear in show titles. So drag
      // and fetish outrank the badge; every other reading defers to it.
      const byBadge = badges ? P.inferEventType(badges) : 'other';
      const byText = P.inferEventType(e.title, e.subtitle, e.description);
      const eventType = QUEER_SIGNAL.has(byText)
        ? byText
        : byBadge !== 'other'
          ? byBadge
          : byText !== 'other'
            ? byText
            : 'theater'; // BKA is a theatre; every row is a staged performance.
      return {
        sourceId: `${e.productionId}:${e.date}T${e.time}`,
        name: title,
        title,
        description: e.description,
        event_type: eventType,
        start_date: e.startIso,
        dates: { start: e.startIso },
        // Resolved from venue_sources after the venue drain, not hardcoded —
        // a uuid minted by this same import is not a constant. Null on the
        // first pass (the venue does not exist yet); `--refresh` fills it.
        ...(venueId ? { venue_id: venueId } : {}),
        venue_name: 'BKA Theater - Berliner Kabarett Anstalt',
        website: e.detailUrl,
        ticket_url: e.ticketUrl,
        urls: [e.detailUrl].filter(Boolean),
        images: e.image ? [e.image] : [],
        location: berlinLocation({
          address: 'Mehringdamm 34, 10961 Berlin',
          postal_code: '10961',
          state: 'Berlin',
          lat: 52.49364,
          lng: 13.3877,
        }),
        tags: ['lgbtq', 'berlin', ...e.badges.map((b) => b.toLowerCase())].slice(0, 20),
        metadata: {
          url: e.detailUrl,
          source: 'bka-theater',
          production_id: e.productionId,
          badges: e.badges,
        },
      };
    });
}

/**
 * The `sex` rail is cruising / fetish / sex-party listings.
 *
 * IMPORTANT, and contrary to what one might assume: there is NO adult filter
 * for events in this codebase. `is_adult` lives on `unified_tags` (the
 * glossary), and the search-proxy has no adult concept for events at all —
 * `fetish` is an ordinary `event_type` with 2,572 rows already public. So
 * "tag it adult" cannot mean "the existing filter will hide it", because no
 * such filter exists on this entity.
 *
 * What this import does instead is give those rows the two signals that are
 * real and queryable today:
 *   - `event_type = 'fetish'` (vocabulary term, lands via commit)
 *   - `age_restriction = '18+'` (exact-match filter in useEvents.tsx, and a
 *     normalized vocabulary — `<n>+` / `all-ages`)
 * Both are applied; neither is a content gate. Building an actual event-level
 * adult gate is a separate decision, not something an importer should invent.
 */
const ADULT_TAGS = ['adult', 'nsfw', 'kink'];

function siegPayloads() {
  const refs = readJson('sieg-refs.json', []);
  const details = readJson('sieg-details.json', {});
  const out = [];

  for (const r of refs) {
    const d = details[`${r.category}/${r.slug}`] ?? {};
    const title = clean(r.title) ?? clean(d.title);
    const start = P.berlinIso(r.date, r.time);
    // commit RAISES on a missing title or start; drop them here so the batch
    // reports them as skipped rather than as rejected rows to triage later.
    if (!title || !start) continue;

    const adult = r.category === 'sex';
    const inferred = P.inferEventType(title, d.subtitle, d.description, d.hashtags?.join(' '));

    out.push({
      sourceId: `${r.category}/${r.slug}/${r.date}/${r.time}`,
      name: title,
      title,
      description: clean(d.description) ?? clean(d.subtitle),
      event_type: adult ? 'fetish' : inferred,
      start_date: start,
      dates: { start },
      venue_name: clean(r.venueName) ?? clean(d.venueName),
      website: d.venueUrl ?? d.infoUrl,
      ticket_url: d.infoUrl,
      urls: [r.url],
      images: d.image ? [d.image] : [],
      location: berlinLocation({ address: clean(d.venueAddress) }),
      tags: [
        'lgbtq',
        'berlin',
        `siegessaeule-${r.category}`,
        ...(adult ? ADULT_TAGS : []),
        ...(d.hashtags ?? []).map((h) => h.toLowerCase()),
      ].slice(0, 20),
      metadata: {
        url: r.url,
        source: 'siegessaeule',
        category: r.category,
        series: `${r.category}/${r.slug}`,
        adult,
      },
    });
  }
  return out;
}

/**
 * Lab.oratory and Böse Buben are both explicitly sex-on-premises venues —
 * every listing is a fetish/sex party. Unlike the Siegessäule `sex` rail,
 * where the category is a per-event fact, here it is a property of the VENUE,
 * so the type and the age restriction are set for the whole source rather
 * than inferred per row. See the note on ADULT_TAGS: neither is a content
 * gate, because no event-level adult gate exists in this codebase.
 */
function labPayloads() {
  return readJson('lab.json', [])
    .filter((e) => e.startIso)
    .map((e) => ({
      sourceId: e.blockId ?? `start:${e.startLocal}`,
      name: e.title,
      title: e.title,
      description: [e.description, e.doors].filter(Boolean).join(' — ') || null,
      event_type: 'fetish',
      age_restriction: '18+',
      start_date: e.startIso,
      dates: { start: e.startIso },
      venue_id: LAB_VENUE_ID,
      venue_name: 'Lab.Oratory',
      website: e.slug ? `https://www.lab-oratory.de/${e.slug}` : 'https://www.lab-oratory.de/',
      urls: [e.slug ? `https://www.lab-oratory.de/${e.slug}` : 'https://www.lab-oratory.de/'],
      images: [],
      location: berlinLocation({
        address: e.venueAddress ?? 'Am Wriezener Bahnhof, 10243 Berlin',
        postal_code: '10243',
        state: 'Berlin',
        lat: 52.5114484,
        lng: 13.4407738,
      }),
      tags: ['lgbtq', 'berlin', 'fetish', 'cruising', ...ADULT_TAGS].slice(0, 20),
      metadata: {
        url: e.slug ? `https://www.lab-oratory.de/${e.slug}` : 'https://www.lab-oratory.de/',
        source: 'lab-oratory',
        adult: true,
        doors: e.doors,
        block_id: e.blockId,
      },
    }));
}

function boeseBubenPayloads() {
  const details = readJson('bb-details.json', {});
  return readJson('bb.json', [])
    .filter((e) => e.startIso)
    .map((e) => {
      const d = details[`${e.slug}:${e.day}`] ?? {};
      return {
        sourceId: `${e.slug}:${e.day}`,
        name: e.title,
        title: e.title,
        description: clean(d.description) ?? clean(e.teaser),
        event_type: 'fetish',
        age_restriction: '18+',
        start_date: e.startIso,
        ...(e.endIso ? { end_date: e.endIso, dates: { start: e.startIso, end: e.endIso } } : { dates: { start: e.startIso } }),
        venue_id: BB_VENUE_ID,
        venue_name: 'Böse Buben e.V.',
        website: e.detailUrl,
        urls: [e.detailUrl],
        images: d.image ? [d.image] : [],
        location: berlinLocation({
          address: 'Sachsendamm 76-77, 10829 Berlin',
          postal_code: '10829',
          state: 'Berlin',
          lat: 52.47734045,
          lng: 13.3577536,
        }),
        tags: ['lgbtq', 'berlin', 'fetish', 'bdsm', ...ADULT_TAGS].slice(0, 20),
        metadata: {
          url: e.detailUrl,
          source: 'boese-buben',
          adult: true,
          schedule_label: e.scheduleLabel,
          // Source text, never parsed to a number — "26,00 €" is a German
          // decimal comma and the field has no currency of its own.
          admission: d.admission ?? null,
        },
      };
    });
}

function ticketcornerPayloads() {
  const f = JSON.parse(
    readFileSync(join(HERE, 'fixtures/ticketcorner-travestie-im-kiez.json'), 'utf8'),
  );
  return P.parseTicketcornerSubEvents(f.subEvent).map((e) => ({
    sourceId: e.eventId,
    name: e.title,
    title: e.title,
    description: f.description,
    event_type: 'drag',
    // The event page states "Einlass ab dem 16. Lebensjahr". Recorded because
    // it is a real fact about the show, not an inferred content rating.
    age_restriction: '16+',
    start_date: e.startIso,
    dates: { start: e.startIso },
    // The venue already exists; a uuid is a stronger link than a name and
    // makes the RPC inherit its city_id/country_id instead of re-resolving.
    venue_id: TIK_VENUE_ID,
    venue_name: 'Theater im Keller - Travestieshow Berlin',
    website: 'https://www.tikberlin.de/',
    ticket_url: e.url,
    urls: [e.url].filter(Boolean),
    images: e.image ? [e.image] : [],
    location: berlinLocation({
      // addressLocality is "BERLIN / NEUKÖLLN" — a shouted district label, not
      // a city name. Deliberately not used.
      address: `${e.street ?? 'Weserstr. 211'}, ${e.postalCode ?? '12047'} Berlin`,
      postal_code: e.postalCode ?? '12047',
      state: 'Berlin',
      // Copied from the linked venue row. Reachable through venue_id, but
      // events.latitude drives the map and the distance facets directly, and
      // a join is not a substitute for the column those read.
      lat: 52.48842,
      lng: 13.4277627,
    }),
    tags: ['lgbtq', 'berlin', 'drag', 'travestie', 'neukoelln'],
    metadata: {
      url: e.url,
      source: 'ticketcorner',
      // Price is recorded here because commit_event_staging_item reads no
      // price/currency key at all — this is the only place it survives.
      cost: e.price != null ? `${e.currency} ${e.price}` : null,
      price: e.price,
      currency: e.currency,
      availability: e.availability,
      snapshot: f._captured,
    },
  }));
}

/** BKA has no venue row yet; stage one so events link to a real record. */
function bkaVenuePayload() {
  return [
    {
      sourceId: BKA_VENUE_KEY,
      name: 'BKA Theater - Berliner Kabarett Anstalt',
      description:
        'Berliner Kabarett Anstalt am Mehringdamm in Kreuzberg — Bühne für Kabarett, ' +
        'Travestie, Drag, Musik und queere Comedy.',
      // `venues_category_check` vocabulary. NOT 'entertainment', which is not
      // in the list and fails at commit rather than at write time.
      category: 'theater',
      website: 'https://www.bka-theater.de',
      contacts: { website: 'https://www.bka-theater.de' },
      location: berlinLocation({
        address: 'Mehringdamm 34, 10961 Berlin',
        postal_code: '10961',
        state: 'Berlin',
        // Photon's top hit for the address is the theatre itself. Coordinates
        // are supplied because pipeline-validate raises W_NO_GEO, and a thin
        // row that also trips W_DESCRIPTION_THIN reaches the 3-warning
        // threshold that parks it in human review.
        lat: 52.49364,
        lng: 13.3877,
      }),
      tags: ['lgbtq', 'theater', 'kabarett', 'drag', 'berlin'],
      metadata: { url: 'https://www.bka-theater.de/spielplan/', source: 'bka-theater' },
    },
  ];
}

// ---------------------------------------------------------------- staging

function token() {
  if (process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT;
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim();
  return Buffer.from(raw.replace(/^go-keyring-base64:/, ''), 'base64').toString('utf8');
}

async function sql(query, attempt = 1) {
  const MAX = 5;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX) {
        await sleep(2000 * attempt);
        return sql(query, attempt + 1);
      }
      throw new Error(`mgmt API ${res.status}: ${body}`);
    }
    return res.json();
  } catch (e) {
    if (e instanceof Error && !/^mgmt API \d/.test(e.message) && attempt < MAX) {
      await sleep(2000 * attempt);
      return sql(query, attempt + 1);
    }
    throw e;
  }
}

const rows = (r) => r.result ?? r ?? [];

async function insertBatch(payloads, { sourceName, targetTable, entityType }) {
  const CHUNK = 100;
  let done = 0;
  let refreshed = 0;
  for (let i = 0; i < payloads.length; i += CHUNK) {
    const payload = JSON.stringify(payloads.slice(i, i + CHUNK));
    if (payload.includes('$J$')) throw new Error(`chunk ${i} contains the dollar-quote tag $J$`);

    await sql(`
insert into public.ingestion_staging
  (raw_data, normalized_data, target_table, entity_type, source_type, source_name,
   source_entity_id, payload_hash,
   ai_validation_status, dedup_status, enrichment_status, review_status, disposition)
select
  jsonb_build_object('source','${sourceName}','url', n->'metadata'->>'url'),
  n, '${targetTable}', '${entityType}', '${sourceName}', '${sourceName}',
  n->>'sourceId',
  encode(extensions.digest(n::text,'sha256'),'hex'),
  'pending','pending','pending','auto','pending'
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
on conflict do nothing;`);

    if (REFRESH) {
      // Re-opening a row means restoring EVERY column the stages select on —
      // pipeline-validate filters .eq('entity_type', …), so a row left with a
      // stale entity_type is invisible to it forever. Rejected rows are
      // excluded: they are invisible to ux_ingestion_staging_source_idem
      // (partial on disposition <> 'rejected'), so the INSERT above already
      // re-added them, and updating the old row too would collide on
      // uk_ingestion_staging_idem and abort the whole run.
      const r = await sql(`
update public.ingestion_staging s
set normalized_data = n,
    raw_data = jsonb_build_object('source','${sourceName}','url', n->'metadata'->>'url'),
    payload_hash = encode(extensions.digest(n::text,'sha256'),'hex'),
    entity_type = '${entityType}',
    target_table = '${targetTable}',
    disposition = 'pending',
    ai_validation_status = 'pending',
    dedup_status = 'pending',
    enrichment_status = 'pending',
    review_status = 'auto',
    error_message = null,
    processed_at = null,
    updated_at = now()
from jsonb_array_elements($J$${payload}$J$::jsonb) as n
where s.source_name = '${sourceName}'
  and s.source_entity_id = n->>'sourceId'
  and s.disposition <> 'rejected'
  and s.payload_hash is distinct from encode(extensions.digest(n::text,'sha256'),'hex')
returning 1;`);
      refreshed += rows(r).length;
    }

    done += Math.min(CHUNK, payloads.length - i);
    console.log(
      `[stage] ${sourceName}/${entityType} ${done}/${payloads.length}` +
        (REFRESH ? ` (refreshed ${refreshed})` : ''),
    );
  }
}

const tally = (list, f) =>
  list.reduce((a, r) => {
    const k = f(r) ?? '∅';
    a[k] = (a[k] || 0) + 1;
    return a;
  }, {});

async function phaseStage() {
  // The BKA venue is minted by this same import, so its uuid is looked up
  // rather than hardcoded. Null until the venue drain has run.
  let bkaVenueId = null;
  if (!DRY) {
    const r = await sql(`
      select v.id::text from venues v
      join venue_sources vs on vs.venue_id = v.id
      where vs.source_entity_id = '${BKA_VENUE_KEY}' and v.duplicate_of_id is null limit 1;`);
    bkaVenueId = rows(r)[0]?.id ?? null;
    console.log(`[stage] BKA venue: ${bkaVenueId ?? 'not committed yet — run --phase drain --entity venue first'}`);
  }

  const groups = [
    { rows: bkaVenuePayload(), sourceName: 'bka-theater', targetTable: 'venues', entityType: 'venue' },
    { rows: bkaPayloads(bkaVenueId), sourceName: 'bka-theater', targetTable: 'events', entityType: 'event' },
    { rows: siegPayloads(), sourceName: 'siegessaeule', targetTable: 'events', entityType: 'event' },
    { rows: ticketcornerPayloads(), sourceName: 'ticketcorner', targetTable: 'events', entityType: 'event' },
    { rows: labPayloads(), sourceName: 'lab-oratory', targetTable: 'events', entityType: 'event' },
    { rows: boeseBubenPayloads(), sourceName: 'boese-buben', targetTable: 'events', entityType: 'event' },
  ].filter((g) => g.rows.length);

  for (const g of groups) {
    console.log(
      `[stage] ${g.sourceName}/${g.entityType}: ${g.rows.length} rows; ` +
        `types ${JSON.stringify(tally(g.rows, (r) => r.event_type))}`,
    );
    const dupes = g.rows.length - new Set(g.rows.map((r) => r.sourceId)).size;
    if (dupes) throw new Error(`${g.sourceName}: ${dupes} duplicate sourceIds — identity is not stable`);
    const bad = g.rows.filter((r) => g.entityType === 'event' && !r.start_date);
    if (bad.length) throw new Error(`${g.sourceName}: ${bad.length} rows with no start_date`);
  }

  if (DRY) {
    writeJson('staged-preview.json', groups.map((g) => ({ ...g, rows: g.rows.slice(0, 3) })));
    console.log(`[stage] DRY RUN — sample at ${join(OUT, 'staged-preview.json')}`);
    return;
  }
  for (const g of groups) await insertBatch(g.rows, g);
  console.log('[stage] done');
}

// ---------------------------------------------------------------- drain

const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8';

/**
 * Fire one pipeline stage via pg_net so the internal-invoke secret is read from
 * the vault inside the database and never leaves it. These MUST be serialised:
 * the stage functions select work with a plain `.eq(status,'pending')` + limit
 * and no FOR UPDATE SKIP LOCKED, so concurrent calls fight over the same rows.
 */
async function firePipelineStage(fn, entityType, batchSize) {
  await sql(`
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/${fn}',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'Authorization','Bearer ${ANON_KEY}',
    'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')
  ),
  body := '{"entityType":"${entityType}","batch_size":${batchSize}}'::jsonb,
  timeout_milliseconds := 150000
);`);
}

async function countActionable(targetTable, predicate) {
  const r = await sql(`
select count(*)::int as n from public.ingestion_staging
where source_name in ${SOURCES} and target_table='${targetTable}'
  and disposition = 'pending' and ${predicate};`);
  return Number(rows(r)[0].n);
}

async function drainStage(label, fn, entityType, targetTable, predicate, batchSize) {
  let stall = 0;
  let prev = await countActionable(targetTable, predicate);
  console.log(`[drain] ${label}: ${prev} pending`);
  while (prev > 0) {
    await firePipelineStage(fn, entityType, batchSize);
    await sleep(35_000);
    const now = await countActionable(targetTable, predicate);
    // A flat reading means the stage is parking rows in a status this loop
    // does not count — spinning would be an infinite loop, not a wait. But
    // `pipeline-deduplicate` on this corpus takes LONGER than the 35 s poll
    // (measured: two flat reads, then 62 rows landed at once), so a tolerance
    // of 2 reports a false stall on a run that is simply slow. 4 is the
    // smallest value that did not misfire here.
    if (now >= prev) {
      if (++stall >= 4) {
        console.warn(`[drain] ${label}: STALLED at ${now} — inspect manually`);
        return false;
      }
    } else stall = 0;
    prev = now;
    console.log(`[drain] ${label}: ${now} pending`);
  }
  return true;
}

async function phaseDrain() {
  const targetTable = ENTITY === 'event' ? 'events' : 'venues';
  const commitFn = ENTITY === 'event' ? 'commit_event_staging_batch' : 'commit_venue_staging_batch';

  if (!(await drainStage('validate', 'pipeline-validate', ENTITY, targetTable,
    "ai_validation_status = 'pending'", 500))) return;
  if (!(await drainStage('dedup', 'pipeline-deduplicate', ENTITY, targetTable,
    "ai_validation_status = 'approved' and dedup_status = 'pending'", 500))) return;

  let total = 0;
  for (;;) {
    const r = await sql(`select count(*)::int as n from public.${commitFn}(200);`);
    const n = Number(rows(r)[0].n);
    if (!n) break;
    total += n;
    console.log(`[drain] committed ${total}`);
  }
  console.log(`[drain] done — ${total} committed`);
}

// ------------------------------------------------------------------ tag

/**
 * Apply the fields `commit_event_staging_item` structurally cannot.
 *
 * Three gaps, all verified against the LIVE function body rather than assumed:
 *
 *  - `tags` and `age_restriction` are read by neither branch. The RPC extracts
 *    title, dates, geo, urls and images and nothing else. Without this pass
 *    every imported event lands with an EMPTY tags array, while 4,322 of the
 *    4,340 existing drag events carry tags.
 *
 *  - `venue_id` is in the INSERT column list but NOT in the UPDATE SET list,
 *    so an event that already exists can never acquire a venue link by being
 *    re-committed. The BKA venue is minted by this same import, so its events
 *    are inserted before it exists and stay unlinked forever. (`latitude` /
 *    `longitude` ARE in that SET list, which is why the ticketcorner geo
 *    backfill worked on a plain --refresh and this does not.)
 *
 * Batched at 200: an events UPDATE fans out through the geo/search triggers,
 * and the measured cost of a 300-row batch was 14.6 s.
 */
async function phaseTag() {
  let total = 0;
  for (;;) {
    const r = await sql(`
with batch as (
  select e.id,
         s.payload->'normalized' as n
  from events e
  join event_sources s on s.event_id = e.id
  where s.source_slug in ${SOURCES}
    and (
      (jsonb_typeof(s.payload->'normalized'->'tags') = 'array'
       and (e.tags is null
            or not (e.tags @> array(select jsonb_array_elements_text(s.payload->'normalized'->'tags')))))
      or ((s.payload->'normalized'->'metadata'->>'adult')::boolean is true
          and e.age_restriction is distinct from '18+')
      or (e.age_restriction is null
          and nullif(s.payload->'normalized'->>'age_restriction','') is not null)
      or (e.venue_id is null
          and nullif(s.payload->'normalized'->>'venue_id','') is not null)
    )
  limit 200
)
update events e
set tags = (
      select array_agg(distinct t order by t)
      from unnest(
        coalesce(e.tags, '{}'::text[])
        || case when jsonb_typeof(b.n->'tags') = 'array'
                then array(select jsonb_array_elements_text(b.n->'tags'))
                else '{}'::text[] end
      ) t
      where nullif(btrim(t), '') is not null
    ),
    age_restriction = case
      when (b.n->'metadata'->>'adult')::boolean is true then '18+'
      else coalesce(e.age_restriction, nullif(b.n->>'age_restriction', ''))
    end,
    -- Fill only. Never repoint an event that already has a venue: a link the
    -- dedup/consensus layers may have corrected is not ours to overwrite.
    venue_id = coalesce(e.venue_id, nullif(b.n->>'venue_id','')::uuid),
    updated_at = now()
from batch b
where e.id = b.id
returning 1;`);
    const n = rows(r).length;
    if (!n) break;
    total += n;
    console.log(`[tag] ${total}`);
  }
  console.log(`[tag] done — ${total} events updated`);
}

// ---------------------------------------------------------------- verify

/**
 * Counts alone cannot catch one wrong row, so this asserts the specific
 * failures this import can actually produce, and fails loudly on each.
 */
async function phaseVerify() {
  const q = async (label, query, expectZero = true) => {
    const r = rows(await sql(query));
    const n = Number(r[0]?.n ?? 0);
    const ok = expectZero ? n === 0 : n > 0;
    console.log(`${ok ? '  ok ' : 'FAIL '} ${label}: ${n}`);
    return ok;
  };

  let ok = true;
  ok &= await q('committed events', `
    select count(*)::int n from event_sources
    where source_slug in ${SOURCES};`, false);

  ok &= await q('events on Berlin, NEW HAMPSHIRE', `
    select count(*)::int n from events e
    join event_sources s on s.event_id = e.id
    where s.source_slug in ${SOURCES} and e.city_id <> '${BERLIN_CITY_ID}'::uuid;`);

  ok &= await q('events with no city_id', `
    select count(*)::int n from events e
    join event_sources s on s.event_id = e.id
    where s.source_slug in ${SOURCES} and e.city_id is null;`);

  ok &= await q('events with a non-DE country', `
    select count(*)::int n from events e
    join event_sources s on s.event_id = e.id
    where s.source_slug in ${SOURCES} and coalesce(e.country,'DE') <> 'DE';`);

  ok &= await q('events with no start_date', `
    select count(*)::int n from events e
    join event_sources s on s.event_id = e.id
    where s.source_slug in ${SOURCES} and e.start_date is null;`);

  ok &= await q('sex-rail events not typed fetish', `
    select count(*)::int n from events e
    join event_sources s on s.event_id = e.id
    where s.source_slug = 'siegessaeule'
      and s.payload->'normalized'->'metadata'->>'category' = 'sex'
      and e.event_type <> 'fetish';`);

  ok &= await q('staging rows rejected', `
    select count(*)::int n from ingestion_staging
    where source_name in ${SOURCES} and disposition = 'rejected';`);

  ok &= await q('staging rows still pending', `
    select count(*)::int n from ingestion_staging
    where source_name in ${SOURCES} and disposition = 'pending';`);

  const per = rows(await sql(`
    select s.source_slug, count(*)::int n, min(e.start_date)::date lo, max(e.start_date)::date hi
    from events e join event_sources s on s.event_id = e.id
    where s.source_slug in ${SOURCES} group by 1 order by 1;`));
  console.table(per);

  // Digest over the canonical form — counts would also match if one row
  // carried the wrong date or the wrong venue.
  const dg = rows(await sql(`
    select encode(sha256(convert_to(string_agg(line, chr(30) order by line collate "C"), 'UTF8')),'hex') d
    from (
      select s.source_slug||chr(31)||s.source_entity_id||chr(31)||e.title||chr(31)||
             to_char(e.start_date at time zone 'Europe/Berlin','YYYY-MM-DD HH24:MI')||chr(31)||
             coalesce(e.venue_name,'')||chr(31)||e.event_type as line
      from events e join event_sources s on s.event_id = e.id
      where s.source_slug in ${SOURCES}) t;`));
  console.log(`digest: ${dg[0]?.d ?? '(none)'}`);

  if (!ok) {
    console.error('\nVERIFY FAILED — see the FAIL lines above.');
    process.exit(1);
  }
  console.log('\nverify: all assertions passed');
}

// ---------------------------------------------------------------- main

const PHASES = {
  'crawl-bka': phaseCrawlBka,
  'crawl-sieg': phaseCrawlSieg,
  'crawl-lab': phaseCrawlLab,
  'crawl-bb': phaseCrawlBb,
  stage: phaseStage,
  drain: phaseDrain,
  tag: phaseTag,
  verify: phaseVerify,
};
if (!PHASES[PHASE]) {
  console.error(`unknown --phase ${PHASE}; expected ${Object.keys(PHASES).join(', ')}`);
  process.exit(1);
}
await PHASES[PHASE]();
