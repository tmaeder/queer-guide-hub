import { describe, it, expect } from 'vitest';
import { buildSubmissionRow, type FlyerScanItem } from '@/hooks/useFlyerScan';

const f = (value: unknown, confidence = 0.9) => ({ value, confidence, source: 'test' });

const baseMatches: FlyerScanItem['matches'] = {
  venue_candidates: [],
  city: null,
  country: null,
  duplicates: [],
  duplicate_events: [],
  duplicate_venues: [],
};

function item(partial: Partial<FlyerScanItem>): FlyerScanItem {
  return {
    detected_type: 'event',
    fields: {},
    matches: { ...baseMatches },
    ...partial,
  };
}

describe('buildSubmissionRow', () => {
  it('maps an event with smart presale/door pricing', () => {
    const row = buildSubmissionRow(
      item({
        detected_type: 'event',
        fields: {
          title: f('Pride Party'),
          start_date: f('2026-07-01T20:00:00Z'),
          venue_name: f('Club X'),
          city: f('Berlin'),
          price_presale: f('10'),
          price_box_office: f('15'),
          website: f('https://example.com'),
        },
      }),
    );
    expect(row.content_type).toBe('event');
    expect(row.data.title).toBe('Pride Party');
    expect(row.data.venue_name).toBe('Club X');
    expect(row.data.price_min).toBe(10);
    expect(row.data.price_max).toBe(15);
    expect(row.data.website).toMatch(/example\.com/);
    expect(row.submission_intent).toBe('create');
  });

  it('maps a venue and a hotel (hotel forces category)', () => {
    const venue = buildSubmissionRow(
      item({ detected_type: 'venue', fields: { name: f('Bar Y'), category: f('bar'), city: f('Paris') } }),
    );
    expect(venue.content_type).toBe('venue');
    expect(venue.data.name).toBe('Bar Y');
    expect(venue.data.category).toBe('bar');

    const hotel = buildSubmissionRow(
      item({ detected_type: 'hotel', fields: { name: f('Hotel Z'), city: f('Lisbon'), star_rating: f(4) } }),
    );
    expect(hotel.content_type).toBe('hotel');
    expect(hotel.data.category).toBe('hotel');
    expect(hotel.data.star_rating).toBe(4);
  });

  it('maps news and marketplace to the right content_type + data', () => {
    const news = buildSubmissionRow(
      item({ detected_type: 'news', fields: { title: f('Headline'), author: f('Jo'), url: f('https://news.example.com/article') } }),
    );
    expect(news.content_type).toBe('news');
    expect(news.data.title).toBe('Headline');
    expect(news.data.author).toBe('Jo');
    expect(news.data.url).toMatch(/news\.example\.com/);

    const product = buildSubmissionRow(
      item({
        detected_type: 'marketplace',
        fields: { title: f('Pride Tee'), price: f('29.99'), brand: f('QG'), url: f('https://shop.example.com/tee') },
      }),
    );
    expect(product.content_type).toBe('product');
    expect(product.data.title).toBe('Pride Tee');
    expect(product.data.price).toBeCloseTo(29.99);
    expect(product.data.business_name).toBe('QG');
    expect(product.data.website).toMatch(/shop\.example\.com/);
  });

  it('defaults tags to the preselected suggestions, and honors an explicit selection', () => {
    const it1 = item({
      fields: { title: f('X') },
      tag_suggestions: [
        { slug: 'drag', label: 'Drag', confidence: 0.9, source: 'marker', preselected: true },
        { slug: 'techno', label: 'Techno', confidence: 0.4, source: 'extracted', preselected: false },
      ],
    });
    expect(buildSubmissionRow(it1).data.tags).toEqual(['drag']);
    expect(buildSubmissionRow(it1, { selectedTagSlugs: ['techno'] }).data.tags).toEqual(['techno']);
    expect(buildSubmissionRow(it1, { selectedTagSlugs: [] }).data.tags).toBeUndefined();
  });

  it('sets enrich fields when linked to an existing entity', () => {
    const row = buildSubmissionRow(item({ fields: { title: f('Dup') } }), {
      enrich: { id: 'abc-123', table: 'events' },
    });
    expect(row.submission_intent).toBe('enrich');
    expect(row.proposed_link_id).toBe('abc-123');
    expect(row.proposed_link_table).toBe('events');
  });

  it('applies inline edits and a type override last', () => {
    const row = buildSubmissionRow(item({ detected_type: 'event', fields: { title: f('Old') } }), {
      edits: { title: 'New' },
    });
    expect(row.data.title).toBe('New');

    const reclassified = buildSubmissionRow(
      item({ detected_type: 'event', fields: { title: f('A Bar') } }),
      { typeOverride: 'venue' },
    );
    expect(reclassified.content_type).toBe('venue');
  });

  it('uses a selected existing venue for an event', () => {
    const row = buildSubmissionRow(
      item({
        detected_type: 'event',
        fields: { title: f('Night'), venue_name: f('Wrong'), city: f('Wrong City') },
        matches: {
          ...baseMatches,
          venue_candidates: [
            {
              id: 'v1',
              name: 'Real Venue',
              score: 0.9,
              address: '1 St',
              city: 'Madrid',
              city_id: 'c1',
              country_id: 'co1',
              latitude: 1,
              longitude: 2,
            },
          ],
        },
      }),
      { selectedVenueId: 'v1' },
    );
    expect(row.data.venue_name).toBe('Real Venue');
    expect(row.data.city).toBe('Madrid');
    expect(row.data.city_id).toBe('c1');
  });
});
