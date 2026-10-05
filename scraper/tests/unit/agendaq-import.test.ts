import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/agendaq-page.json';
import {
  agendaqEventEntity,
  agendaqSchedule,
  agendaqVenueEntity,
  collectUniqueAgendaqEvents,
  fetchAllAgendaq,
  normalizeAgendaqEvent,
  normalizeAgendaqVenue,
  type AgendaqPage,
  type AgendaqVenue,
} from '../../src/sources/agendaq/lib.js';

const page = fixture as AgendaqPage;
const club = page.items[0] as AgendaqVenue;
const association = page.items[1] as AgendaqVenue;

describe('AgendaQ normalization', () => {
  it('normalizes a venue into the staging contract', () => {
    const normalized = normalizeAgendaqVenue(club);
    expect(normalized.name).toBe('101 Club');
    expect(normalized.category).toBe('club');
    expect(normalized.location).toMatchObject({ city: 'Rome', country: 'IT', lat: 41.8971765 });
    expect(normalized.contacts.website).toBe('https://101roma.club/');
    expect(normalized.hours?.weekly).toEqual([{ day: 'MO', start: '23:00', end: '04:00' }]);
    expect(normalized.images[0]).toContain('data.agendaq.fr/assets/businesses/101-club/main.jpg');
    expect(normalized.metadata.audiences).toEqual(
      expect.arrayContaining(['gay', 'queer', 'trans']),
    );
  });

  it('keeps an incomplete venue and labels its quality warning', () => {
    const normalized = normalizeAgendaqVenue(association);
    expect(normalized.description).toBe('Community support and mutual aid.');
    expect(normalized.category).toBe('organization');
    expect(normalized.metadata.quality_warnings).toContain('missing_location');
  });

  it('normalizes recurring events without materializing every occurrence', () => {
    const event = club.events?.[0];
    if (!event) throw new Error('fixture event missing');
    const normalized = normalizeAgendaqEvent(event);
    expect(normalized.event_type).toBe('party');
    expect(normalized.start_date).toBe('2025-07-01T23:00:00+02:00');
    expect(normalized.venue_name).toBe('101 Club');
    expect(normalized.location).toMatchObject({ city: 'Rome', country: 'IT' });
    expect(normalized.schedule).toMatchObject({
      kind: 'recurrence',
      tz: 'Europe/Rome',
      until: '2027-06-30',
      confidence: 'feed',
    });
    expect(normalized.schedule?.weekly as unknown[]).toHaveLength(5);
  });

  it('derives a bare start date from authored date rules when top-level bounds are absent', () => {
    const event = association.events?.[0];
    if (!event) throw new Error('fixture event missing');
    const normalized = normalizeAgendaqEvent(event);
    expect(normalized.start_date).toBe('2026-11-10');
    expect(normalized.metadata.quality_warnings).toContain('missing_location');
    expect(normalized.metadata.quality_warnings).not.toContain('missing_start');
  });

  it('rolls an after-midnight end time into the following day', () => {
    const event = structuredClone(club.events![0]);
    event.start = '2025-04-12T22:00:00+02:00';
    event.end = '2025-04-12T02:00:00+02:00';
    const normalized = normalizeAgendaqEvent(event);
    expect(normalized.end_date).toBe('2025-04-13T00:00:00.000Z');
    expect(Date.parse(normalized.end_date!)).toBeGreaterThan(Date.parse(normalized.start_date!));
  });

  it('creates stable source entities', () => {
    const fetchedAt = new Date('2026-10-05T20:00:00Z');
    const venue = agendaqVenueEntity(club, fetchedAt);
    const event = agendaqEventEntity(club.events![0], fetchedAt);
    expect(venue).toMatchObject({
      source_name: 'agendaq',
      source_id: '101-club',
      entity_type: 'venue',
    });
    expect(event).toMatchObject({
      source_name: 'agendaq',
      source_id: 'clubbing-66',
      entity_type: 'event',
    });
  });
});

describe('AgendaQ event collection', () => {
  it('deduplicates identical event references by slug', () => {
    const duplicate = structuredClone(club);
    const events = collectUniqueAgendaqEvents([club, duplicate]);
    expect(events.size).toBe(1);
    expect(events.has('clubbing-66')).toBe(true);
  });

  it('rejects conflicting payloads for one event slug', () => {
    const duplicate = structuredClone(club);
    duplicate.events![0].name = 'Conflicting title';
    expect(() => collectUniqueAgendaqEvents([club, duplicate])).toThrow(/conflicting payloads/);
  });

  it('returns null schedule for a single one-off date', () => {
    expect(agendaqSchedule(association.events![0])).toBeNull();
  });
});

describe('AgendaQ pagination', () => {
  it('uses offsets, bounded concurrency, and an exact limit', async () => {
    const offsets: number[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset') ?? 0);
      offsets.push(offset);
      const items = Array.from({ length: Math.min(36, 80 - offset) }, (_, index) => ({
        name: `Venue ${offset + index}`,
        slug: `venue-${offset + index}`,
        events: [],
      }));
      return new Response(JSON.stringify({ count: 80, items }), { status: 200 });
    };
    const result = await fetchAllAgendaq({
      fetchFn,
      limit: 50,
      concurrency: 2,
      retries: 0,
      crawlDelayMs: 0,
    });
    expect(result.venues).toHaveLength(50);
    expect(result.venues[49].slug).toBe('venue-49');
    expect(offsets.sort((a, b) => a - b)).toEqual([0, 36]);
  });
});
