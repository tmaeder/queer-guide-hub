import { describe, it, expect } from 'vitest';
import { buildPrideIcs } from '../prideIcs';
import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

const sample = (overrides: Partial<PrideCalendarEvent> = {}): PrideCalendarEvent => ({
  id: 'evt-1',
  slug: 'berlin-pride-csd-2026',
  title: 'Berlin Pride CSD 2026',
  start_date: '2026-07-25T00:00:00.000Z',
  end_date: '2026-07-25T23:59:00.000Z',
  city: 'Berlin',
  city_id: null,
  country: 'DE',
  country_id: null,
  latitude: 52.52,
  longitude: 13.405,
  images: null,
  is_featured: true,
  verification_status: 'unverified',
  description: 'Annual LGBTQ+ pride march in Berlin.',
  ...overrides,
});

describe('buildPrideIcs', () => {
  it('emits valid VCALENDAR wrapper', () => {
    const ics = buildPrideIcs([sample()], 2026);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('PRODID:-//Queer Guide//Pride Calendar//EN');
    expect(ics).toContain('X-WR-CALNAME:Pride Calendar 2026');
  });

  it('includes one VEVENT block per pride', () => {
    const ics = buildPrideIcs([sample(), sample({ id: 'evt-2', slug: 'nyc-2026' })], 2026);
    const starts = ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT');
    const ends = ics.split('\r\n').filter((l) => l === 'END:VEVENT');
    expect(starts).toHaveLength(2);
    expect(ends).toHaveLength(2);
  });

  it('emits SUMMARY, LOCATION, URL, DTSTART, DTEND', () => {
    const ics = buildPrideIcs([sample()], 2026);
    expect(ics).toContain('SUMMARY:Berlin Pride CSD 2026');
    expect(ics).toContain('LOCATION:Berlin\\, DE');
    expect(ics).toContain('URL:https://queer.guide/events/berlin-pride-csd-2026');
    expect(ics).toContain('DTSTART:20260725T000000Z');
    expect(ics).toContain('DTEND:20260725T235900Z');
  });

  it('falls back to start_date for end_date when null', () => {
    const ics = buildPrideIcs([sample({ end_date: null })], 2026);
    expect(ics).toContain('DTSTART:20260725T000000Z');
    expect(ics).toContain('DTEND:20260725T000000Z');
  });

  it('escapes commas and semicolons in text', () => {
    const ics = buildPrideIcs(
      [sample({ title: 'Pride, Joy; Love', description: 'Line\nbreak' })],
      2026,
    );
    expect(ics).toContain('SUMMARY:Pride\\, Joy\\; Love');
    expect(ics).toContain('DESCRIPTION:Line\\nbreak');
  });

  it('omits DESCRIPTION line when description is null', () => {
    const ics = buildPrideIcs([sample({ description: null })], 2026);
    expect(ics).not.toContain('DESCRIPTION:');
  });
});
