import { describe, it, expect } from 'vitest';
import {
  parseGcDate,
  parseGcTextDateRange,
  mapEventType,
  parseListingCards,
  extractEventJsonLd,
  extractLegacyEvent,
  parseLegacySubinfo,
  extractBodyDescription,
  normalizeGcEvent,
  parseDetailHtml,
  quarterWindows,
  fmtUs,
  listingUrl,
  EVENT_TYPE_VOCAB,
  type EventDetail,
  type MetroInfo,
} from '../../src/sources/gaycities/lib.js';

describe('parseGcDate', () => {
  it('parses the malformed double-time format, preferring the appended real time', () => {
    expect(parseGcDate('2026-01-17 00:00:00T15:00:00')).toBe('2026-01-17T15:00:00');
  });

  it('parses clean ISO', () => {
    expect(parseGcDate('2026-01-17T15:30:00')).toBe('2026-01-17T15:30:00');
  });

  it('parses bare dates as local midnight', () => {
    expect(parseGcDate('2026-01-17')).toBe('2026-01-17T00:00:00');
  });

  it('keeps a genuine midnight time', () => {
    expect(parseGcDate('2026-01-17T00:00:00')).toBe('2026-01-17T00:00:00');
  });

  it('rejects garbage', () => {
    expect(parseGcDate('')).toBeNull();
    expect(parseGcDate(null)).toBeNull();
    expect(parseGcDate(undefined)).toBeNull();
    expect(parseGcDate('not a date')).toBeNull();
    expect(parseGcDate('2026-13-45')).toBeNull();
  });

  it('ignores invalid time components', () => {
    expect(parseGcDate('2026-01-17T99:99:00')).toBe('2026-01-17T00:00:00');
  });
});

describe('mapEventType', () => {
  it('maps into the events_event_type_check vocabulary', () => {
    expect(mapEventType('Chicago Pride Parade')).toBe('pride');
    expect(mapEventType('Drag Brunch Extravaganza')).toBe('drag');
    expect(mapEventType('International Mr. Leather')).toBe('fetish');
    expect(mapEventType('Winter Film Festival')).toBe('film');
    expect(mapEventType('White Party', 'the biggest circuit party')).toBe('party');
    expect(mapEventType('Some Unknown Thing')).toBe('other');
  });

  it('only ever returns vocab values', () => {
    const samples = ['pride', 'random words', 'tea dance', 'ski week', 'gala benefit', ''];
    for (const s of samples) {
      expect(EVENT_TYPE_VOCAB).toContain(mapEventType(s));
    }
  });
});

const CARD_HTML = `
<div class="events-list">
  <article class="event-card">
    <a href="https://chicago.gaycities.com/events/1031136-international-mr-leather">
      <h3>International Mr. Leather</h3>
    </a>
    <time>May 22 - 26, 2026</time>
  </article>
  <li class="event-card">
    <a href="https://sitges.gaycities.com/events/998877-sitges-pride?utm=x" title="Sitges Pride"></a>
    <span class="event-date">Jun 10, 2026</span>
  </li>
  <div><a href="https://www.gaycities.com/events/pride">Pride events</a></div>
</div>`;

describe('parseListingCards', () => {
  it('extracts numeric-id stubs and skips category links', () => {
    const stubs = parseListingCards(CARD_HTML);
    expect(stubs).toHaveLength(2);
    const iml = stubs.find((s) => s.numericId === '1031136');
    expect(iml?.title).toBe('International Mr. Leather');
    expect(iml?.detailUrl).toBe('https://chicago.gaycities.com/events/1031136-international-mr-leather');
    expect(iml?.dateText).toContain('May 22');
    const sitges = stubs.find((s) => s.numericId === '998877');
    expect(sitges?.title).toBe('Sitges Pride');
    expect(sitges?.detailUrl).toBe('https://sitges.gaycities.com/events/998877-sitges-pride');
  });

  it('handles empty input', () => {
    expect(parseListingCards('')).toEqual([]);
    expect(parseListingCards('<div>No events found</div>')).toEqual([]);
  });
});

const JSONLD_PAGE = `
<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Event",
 "name":"International Mr. Leather",
 "startDate":"2026-05-22 00:00:00T18:00:00",
 "endDate":"2026-05-26",
 "eventStatus":"https://schema.org/EventScheduled",
 "location":{"@type":"Place","name":"Congress Plaza Hotel",
   "address":{"@type":"PostalAddress","streetAddress":null,"addressLocality":"Chicago","addressCountry":"US"}},
 "description":"The legendary leather gathering…",
 "offers":{"@type":"Offer","url":"http://www.imrl.com"},
 "image":["https://s3.amazonaws.com/gc/iml.jpg"],
 "keywords":["Chicago Event"]}
</script></head>
<body><div class="event-description">The legendary leather gathering returns to Chicago for its annual celebration of community, contests, and connection. Expect a full weekend of programming across the city with visitors from around the world.</div>
<a href="/events/pride">pride</a></body></html>`;

describe('extractEventJsonLd / extractBodyDescription', () => {
  it('finds the Event object', () => {
    const ld = extractEventJsonLd(JSONLD_PAGE);
    expect(ld?.name).toBe('International Mr. Leather');
  });

  it('finds Event inside @graph and arrays', () => {
    const page = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"Event","name":"X","startDate":"2024-01-01"}]}</script>`;
    expect(extractEventJsonLd(page)?.name).toBe('X');
  });

  it('returns null when no Event JSON-LD', () => {
    expect(extractEventJsonLd('<html><body>nope</body></html>')).toBeNull();
  });

  it('prefers the longer body description', () => {
    const body = extractBodyDescription(JSONLD_PAGE);
    expect(body).toContain('full weekend of programming');
  });
});

const METRO: MetroInfo = {
  metroId: '7',
  label: 'Chicago',
  subdomain: 'chicago',
  city: 'Chicago',
  country: 'United States',
  countryCode: 'US',
  timezone: 'America/Chicago',
};

function detailFixture(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    numericId: '1031136',
    url: 'https://chicago.gaycities.com/events/1031136-international-mr-leather',
    subdomain: 'chicago',
    jsonLd: extractEventJsonLd(JSONLD_PAGE),
    bodyDescription: extractBodyDescription(JSONLD_PAGE),
    tagSlugs: ['pride'],
    fetchedAt: '2026-07-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('normalizeGcEvent', () => {
  it('builds a commit-ready payload', () => {
    const norm = normalizeGcEvent(detailFixture(), METRO);
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.title).toBe('International Mr. Leather');
    expect(norm.start_date).toBe('2026-05-22T18:00:00');
    expect(norm.end_date).toBe('2026-05-26T00:00:00');
    expect(norm.timezone).toBe('America/Chicago');
    expect(norm.location.city).toBe('Chicago');
    expect(norm.location.country).toBe('United States');
    expect(norm.venue_name).toBe('Congress Plaza Hotel');
    expect(norm.ticket_url).toBe('https://www.imrl.com');
    expect(norm.images).toEqual(['https://s3.amazonaws.com/gc/iml.jpg']);
    expect(norm.metadata.source_url).toContain('/events/1031136-');
    expect(norm.description).toContain('full weekend of programming');
    expect(EVENT_TYPE_VOCAB).toContain(norm.event_type);
  });

  it('rejects when title or start date is missing', () => {
    const noLd = normalizeGcEvent(detailFixture({ jsonLd: null }), METRO);
    expect(noLd).toEqual({ reject: 'no_title' });
    const noStart = normalizeGcEvent(
      detailFixture({ jsonLd: { '@type': 'Event', name: 'X' } }),
      METRO,
    );
    expect(noStart).toEqual({ reject: 'no_start_date' });
  });

  it('falls back to JSON-LD locality without a metro, rejects without either', () => {
    const norm = normalizeGcEvent(detailFixture(), null);
    if ('reject' in norm) throw new Error('unexpected reject');
    expect(norm.location.city).toBe('Chicago');
    expect(norm.location.country).toBe('US');

    const bare = normalizeGcEvent(
      detailFixture({ jsonLd: { '@type': 'Event', name: 'X', startDate: '2024-01-01' } }),
      null,
    );
    expect(bare).toEqual({ reject: 'no_city' });
  });
});

describe('parseGcTextDateRange (legacy templates)', () => {
  it('parses same-month ranges', () => {
    expect(parseGcTextDateRange('Sep 1-4, 2021')).toEqual({ start: '2021-09-01T00:00:00', end: '2021-09-04T00:00:00' });
  });
  it('parses cross-month ranges', () => {
    expect(parseGcTextDateRange('Sep 30 - Oct 2, 2021')).toEqual({ start: '2021-09-30T00:00:00', end: '2021-10-02T00:00:00' });
  });
  it('parses cross-year ranges', () => {
    expect(parseGcTextDateRange('Dec 31, 2021 - Jan 1, 2022')).toEqual({ start: '2021-12-31T00:00:00', end: '2022-01-01T00:00:00' });
  });
  it('parses single dates', () => {
    expect(parseGcTextDateRange('Sep 1, 2021')).toEqual({ start: '2021-09-01T00:00:00', end: null });
  });
  it('rejects garbage', () => {
    expect(parseGcTextDateRange('every friday')).toBeNull();
    expect(parseGcTextDateRange('')).toBeNull();
    expect(parseGcTextDateRange(null)).toBeNull();
  });
});

const LEGACY_PAGE = `
<html><head>
<meta property="og:title" content="Key West WomenFest (Event in Key West) on GayCities" />
<meta property="og:description" content="Key West WomenFest in Key West - Join us to celebrate WomenFest 2021!" />
<meta property="og:image" content="https://s3.amazonaws.com/gc/womenfest.jpg" />
<script type="application/ld+json">{"@context":"http://schema.org","@type":"WebPage","headline":"Key West WomenFest 2021"}</script>
</head><body>
<h1 class="listing-heading"><span itemprop="name">Key West WomenFest </span>
<small class="formerly"><time><span>Sep 1-4, 2021</span></time></small></h1>
</body></html>`;

describe('extractLegacyEvent', () => {
  it('rebuilds an Event object from the pre-2022 template', () => {
    const ev = extractLegacyEvent(LEGACY_PAGE);
    expect(ev?.name).toBe('Key West WomenFest');
    expect(ev?.startDate).toBe('2021-09-01T00:00:00');
    expect(ev?.endDate).toBe('2021-09-04T00:00:00');
    expect(ev?.image).toEqual(['https://s3.amazonaws.com/gc/womenfest.jpg']);
  });

  it('feeds normalizeGcEvent via parseDetailHtml fallback', () => {
    const detail = parseDetailHtml(LEGACY_PAGE, 'https://keywest.gaycities.com/events/1030603-key-west-womenfest', { fromWayback: true });
    expect(detail.jsonLd?._legacyTemplate).toBe(true);
    const metro: MetroInfo = { metroId: '20', label: 'Key West', subdomain: 'keywest', city: 'Key West', country: 'United States', countryCode: 'US', timezone: 'America/New_York' };
    const norm = normalizeGcEvent(detail, metro);
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.title).toBe('Key West WomenFest');
    expect(norm.start_date).toBe('2021-09-01T00:00:00');
    expect(norm.location.city).toBe('Key West');
    expect(norm.metadata.from_wayback).toBe(true);
  });

  it('returns null when no dates are recoverable', () => {
    expect(extractLegacyEvent('<html><body><h1><span itemprop="name">X</span></h1></body></html>')).toBeNull();
  });
});

const GEN2012_PAGE = `
<html><head>
<title>Event: Boulder Pridefest - Details and who's attending - GayCities</title>
<meta property="og:title" content="Boulder Pridefest (Event in ) on GayCities" />
<meta property="og:image" content="http://graph.facebook.com/127907260588811/picture?type=large" />
</head><body>
<div class="profile-top" id="event-header">
  <div class="profile-top-L" style="width:490px;">Boulder Pridefest
    <br><div class=subinfo><b> Saturday Sep 11, 2010 10:00am-6:00pm in Boulder, Colorado</b><br></div>
  </div>
</div>
<div class="pp-mid"><div class="pp-mid-LEFT">
Join us on the Pearl Street Mall for a celebration of the Lesbian, Gay, Bisexual, Transgender, Queer and Allied community of Boulder County.
</div></div>
</body></html>`;

describe('gen-2012 template', () => {
  it('parses the subinfo line', () => {
    expect(parseLegacySubinfo('Saturday Sep 11, 2010 10:00am-6:00pm in Boulder, Colorado')).toEqual({
      start: '2010-09-11T10:00:00',
      end: '2010-09-11T18:00:00',
      city: 'Boulder',
      region: 'Colorado',
      country: 'United States',
    });
    expect(parseLegacySubinfo('Friday Jun 1, 2012 in Berlin, Germany')).toEqual({
      start: '2012-06-01T00:00:00',
      end: null,
      city: 'Berlin',
      region: 'Germany',
      country: 'Germany',
    });
    expect(parseLegacySubinfo('every friday')).toBeNull();
  });

  it('extracts a full event from the 2012 profile block', () => {
    const ev = extractLegacyEvent(GEN2012_PAGE);
    expect(ev?.name).toBe('Boulder Pridefest');
    expect(ev?.startDate).toBe('2010-09-11T10:00:00');
    expect(ev?.endDate).toBe('2010-09-11T18:00:00');
    expect((ev?.description as string)).toContain('Pearl Street Mall');
    const addr = (ev?.location as { address: Record<string, unknown> })?.address;
    expect(addr?.addressLocality).toBe('Boulder');
    expect(addr?.addressCountry).toBe('United States');
  });

  it('normalizes without a metro (locality + inferred country)', () => {
    const detail = parseDetailHtml(GEN2012_PAGE, 'https://www.gaycities.com/events/15491-boulder-pridefest', { fromWayback: true });
    const norm = normalizeGcEvent(detail, null);
    if ('reject' in norm) throw new Error('unexpected reject: ' + norm.reject);
    expect(norm.location.city).toBe('Boulder');
    expect(norm.location.country).toBe('United States');
    expect(norm.metadata.legacy_template).toBe(true);
  });
});

describe('window + url helpers', () => {
  it('builds quarterly windows covering the span', () => {
    const w = quarterWindows(new Date(Date.UTC(2022, 0, 1)), new Date(Date.UTC(2023, 0, 1)));
    expect(w.length).toBe(4);
    expect(w[0]).toEqual({ from: '01/01/2022', to: '03/31/2022' });
    expect(w[3].from).toBe('10/01/2022');
  });

  it('formats US dates and listing urls', () => {
    expect(fmtUs(new Date(Date.UTC(2026, 6, 4)))).toBe('07/04/2026');
    const url = listingUrl({ metroId: '7', from: '01/01/2024', to: '03/01/2024', page: 2 });
    expect(url).toContain('selectMetro=7');
    expect(url).toContain('upcomingEvents=2');
    expect(decodeURIComponent(url).replace(/\+/g, ' ')).toContain('01/01/2024 - 03/01/2024');
  });
});
