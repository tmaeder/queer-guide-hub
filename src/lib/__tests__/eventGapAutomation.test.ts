import { describe, expect, it } from 'vitest';
import {
  boundedInt,
  cleanDescription,
  contentPatch,
  imageCandidates,
  mapConcurrent,
  sourceUrls,
  sourceCancellation,
  storedDescription,
  structuredEvent,
  supportedContentPatch,
  hasUnverifiedLongRange,
  sourceArtwork,
} from '../../../supabase/functions/_shared/event-gap-core';

const ev = { id: 'fixture', title: 'Queer Arts Night', start_date: '2026-11-03T19:00:00Z' };
const description =
  'A queer arts evening featuring a discussion with named local artists, followed by a live performance and an audience conversation.';

describe('event gap evidence', () => {
  it('reuses raw attributable evidence and rejects generated copies and boilerplate', () => {
    expect(
      storedDescription([{ source_url: 'https://arts.example.org/night', raw: { description } }])
        ?.description,
    ).toBe(description);
    expect(
      storedDescription([
        { source_url: 'https://arts.example.org/night', raw: { enriched: { description } } },
      ]),
    ).toBeNull();
    expect(cleanDescription(`Accept cookies to read our cookie policy. ${description}`)).toBeNull();
  });
  it('rejects markup and decodes source entities exactly once', () => {
    expect(cleanDescription(`<script>alert(1)</script >${description}`)).toBeNull();
    expect(cleanDescription(`<p>${description}</p>`)).toBeNull();
    expect(cleanDescription(`${description} &amp;quot;quoted&amp;quot;`)).toBe(
      `${description} &quot;quoted&quot;`,
    );
  });
  it('falls back to a ticket page when the website is a homepage or unsafe', () => {
    expect(
      sourceUrls(
        {
          ...ev,
          website: 'https://arts.example.org/',
          ticket_url: 'https://tickets.example.org/show',
        },
        [],
      ),
    ).toEqual(['https://tickets.example.org/show']);
    expect(
      sourceUrls(
        {
          ...ev,
          website: 'https://user:secret@arts.example.org/show',
          ticket_url: 'http://127.0.0.1/show',
        },
        [],
      ),
    ).toEqual([]);
  });
  it('uses only the matching JSON-LD event and rejects another occurrence', () => {
    const html = (name: string, startDate = '2026-11-03') =>
      `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'MusicEvent', name, startDate, description }] })}</script>`;
    expect(structuredEvent(html(ev.title), ev)?.description).toBe(description);
    expect(structuredEvent(html('Another Show'), ev)).toBeNull();
    expect(structuredEvent(html(ev.title, '2025-11-03'), ev)).toBeNull();
  });
  it('ignores social-preview images that do not identify the event', () => {
    const html =
      '<meta content="/poster.jpg" property="og:image"><meta name="twitter:image" content="/cover.jpg">';
    expect(imageCandidates(html, ev, 'https://arts.example.org/show')).toEqual([]);
  });
  it('finds relative artwork on the matching structured event and filters private URLs', () => {
    const ld = (startDate: string) =>
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'Event',
        name: ev.title,
        startDate,
        image: ['/poster.jpg', 'http://localhost/private'],
      })}</script>`;
    expect(
      imageCandidates(ld('2026-11-03T19:00:00Z'), ev, 'https://arts.example.org/show'),
    ).toEqual(['https://arts.example.org/poster.jpg']);
    expect(
      imageCandidates(ld('2026-12-03T19:00:00Z'), ev, 'https://arts.example.org/show'),
    ).toEqual([]);
  });
  it('reads published gay.ch originals through the shared event core', () => {
    const page = 'https://gay.ch/parties/queer-arts-night';
    const original = `${page}/@@download/image/poster.jpg`;
    const html = `<html><head><meta property="og:image" content="${original}">
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: ev.title,
        startDate: ev.start_date,
      })}</script></head><body></body></html>`;
    expect(imageCandidates(html, ev, page)).toEqual([original]);
  });
  it('uses event-owned landscape or portrait artwork with the same minimum edges', () => {
    const source = {
      source_slug: 'agendaq',
      source_url: 'https://www.agendaq.fr/fr/agenda/arts',
      raw: {
        assets: [
          ['bonus', '/assets/events/arts/bonus.jpg', 'image/jpeg', 1200, 800],
          ['small', '/assets/events/arts/small.jpg', 'image/jpeg', 300, 200],
          ['poster', '/assets/events/arts/poster.jpg', 'image/jpeg', 679, 960],
          ['narrow', '/assets/events/arts/narrow.jpg', 'image/jpeg', 449, 1200],
          ['short', '/assets/events/arts/short.jpg', 'image/jpeg', 600, 799],
          ['other', '/assets/events/another/bonus.jpg', 'image/jpeg', 1200, 800],
        ],
      },
    };
    expect(sourceArtwork([source])).toEqual([
      {
        url: 'https://data.agendaq.fr/assets/events/arts/bonus.jpg',
        source_url: source.source_url,
      },
      {
        url: 'https://data.agendaq.fr/assets/events/arts/poster.jpg',
        source_url: source.source_url,
      },
    ]);
    expect(sourceArtwork([{ ...source, source_slug: 'unknown' }])).toEqual([]);
  });
  it('fills gaps only and requires stronger evidence for venue/address', () => {
    const ai = {
      confidence: 0.85,
      description,
      extracted_venue_name: 'Arts Hall',
      target_groups: ['trans'],
      age_restriction: '18+',
    };
    expect(contentPatch(ev, ai)).toEqual({
      description,
      target_groups: ['trans'],
      age_restriction: '18+',
    });
    expect(
      contentPatch({ ...ev, description, target_groups: ['lgbtq'], age_restriction: '21+' }, ai),
    ).toEqual({});
    expect(contentPatch(ev, { ...ai, confidence: 0.4 })).toEqual({});
    expect(contentPatch(ev, { ...ai, confidence: 0.95 }).venue_name).toBe('Arts Hall');
  });
  it('routes multi-year ranges without recurrence evidence to review', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    const ranged = { ...ev, start_date: '2023-01-01', end_date: '2027-01-01', is_recurring: false };
    expect(hasUnverifiedLongRange(ranged, now)).toBe(true);
    expect(hasUnverifiedLongRange({ ...ranged, is_recurring: true }, now)).toBe(false);
    expect(
      hasUnverifiedLongRange(
        { ...ranged, schedule: { kind: 'recurrence', confidence: 'feed' } },
        now,
      ),
    ).toBe(false);
    expect(hasUnverifiedLongRange(ev, now)).toBe(false);
  });
  it('rejects unquoted model claims despite high confidence', () => {
    const ai = { confidence: 0.99, description, extracted_venue_name: 'Invented Hall' };
    expect(supportedContentPatch(ev, ai, description)).toEqual({});
    expect(
      supportedContentPatch(ev, { ...ai, field_evidence: { description } }, description),
    ).toEqual({ description });
    expect(
      supportedContentPatch(
        ev,
        {
          ...ai,
          field_evidence: {
            description: 'A supporting quote that does not actually appear anywhere in the source.',
          },
        },
        description,
      ),
    ).toEqual({});
  });
  it('bounds batch sizes and runs a bounded worker pool while retaining order', async () => {
    expect(boundedInt(-8, 8, 20)).toBe(1);
    expect(boundedInt(Infinity, 8, 20)).toBe(8);
    expect(boundedInt(10000, 8, 20)).toBe(20);
    let running = 0,
      peak = 0;
    const output = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      return n * 2;
    });
    expect(output).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
  it('routes only matching dated cancellations to review', () => {
    const ev = { id: 'cancel', title: 'Pride March', start_date: '2027-06-01T12:00:00Z' };
    const page = (
      name: string,
      startDate: string,
      eventStatus = 'https://schema.org/EventCancelled',
    ) =>
      `<script type="application/ld+json">${JSON.stringify({ '@type': 'Event', name, startDate, eventStatus })}</script>`;
    expect(sourceCancellation(page(ev.title, ev.start_date), ev)).toBe(
      'https://schema.org/EventCancelled',
    );
    expect(sourceCancellation(page('Another Pride', ev.start_date), ev)).toBeNull();
    expect(sourceCancellation(page(ev.title, '2026-06-01'), ev)).toBeNull();
    expect(sourceCancellation(page(ev.title, 'invalid'), ev)).toBeNull();
    expect(
      sourceCancellation(page(ev.title, ev.start_date, 'https://schema.org/EventScheduled'), ev),
    ).toBeNull();
    expect(sourceCancellation('<p>A different event was cancelled.</p>', ev)).toBeNull();
  });
});
