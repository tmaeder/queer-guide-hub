import { describe, it, expect } from 'vitest';
import {
  classifyEntity,
  expectedKindForTargetTable,
  isEntityTypeMismatch,
} from '../entityClassifier';

// Issue #113 regression cases — these are real names from the bad CSV.
describe('classifyEntity', () => {
  describe('person', () => {
    it('classifies a real person with birth_date as person', () => {
      const r = classifyEntity({
        name: 'Lytton Strachey',
        birth_date: '1880-03-01',
        death_date: '1932-01-21',
        profession: 'biographer',
      });
      expect(r.classified_as).toBe('person');
      expect(r.confidence).toBeGreaterThan(0.5);
    });

    it('classifies a person with only wikidata_qid as person', () => {
      const r = classifyEntity({
        name: 'Davis Mac-Iyalla',
        wikidata_qid: 'Q5239021',
      });
      expect(r.classified_as).toBe('person');
    });

    it('uses person-language phrases as a signal', () => {
      const r = classifyEntity({
        name: 'Jane Doe',
        bio: 'Jane was born in London and is a singer-songwriter.',
      });
      expect(r.classified_as).toBe('person');
    });
  });

  describe('venue', () => {
    it('flags "Sauna Tres Chic" as venue, not person', () => {
      const r = classifyEntity({ name: 'Sauna Tres Chic' });
      expect(r.classified_as).toBe('venue');
    });

    it('flags "InTeam Club" as venue', () => {
      const r = classifyEntity({ name: 'InTeam Club' });
      expect(r.classified_as).toBe('venue');
    });

    it('flags "Eurovisex Sex Shop" as venue', () => {
      const r = classifyEntity({
        name: 'Eurovisex Sex Shop',
        description: 'Located in central Madrid. Opening hours 10am–10pm.',
      });
      expect(r.classified_as).toBe('venue');
    });

    it('uses accommodation_type as a strong venue signal', () => {
      const r = classifyEntity({
        name: 'Some Generic Name',
        accommodation_type: 'hotel',
      });
      expect(r.classified_as).toBe('venue');
    });
  });

  describe('glossary_term', () => {
    it('classifies "DILF" as glossary_term', () => {
      const r = classifyEntity({
        name: 'DILF',
        description: 'A slang term for an attractive father.',
      });
      expect(r.classified_as).toBe('glossary_term');
    });

    it('classifies "fag hag" as glossary_term', () => {
      const r = classifyEntity({
        name: 'fag hag',
        description: 'Informal term for a woman who associates with gay men.',
      });
      expect(r.classified_as).toBe('glossary_term');
    });

    it('classifies "cottaging" as glossary_term', () => {
      const r = classifyEntity({
        name: 'cottaging',
        description: 'A British slang term referring to anonymous sexual encounters.',
      });
      expect(r.classified_as).toBe('glossary_term');
    });
  });

  describe('event', () => {
    it('classifies a row with start/end dates and "festival" as event', () => {
      const r = classifyEntity({
        name: 'Berlin Pride Festival',
        start_date: '2026-07-25',
        end_date: '2026-07-26',
        description: 'Annual celebration. Join us for the parade.',
      });
      expect(r.classified_as).toBe('event');
    });
  });

  describe('unknown', () => {
    it('classifies a UK postcode as unknown', () => {
      const r = classifyEntity({ name: 'BN2 1TH' });
      expect(r.classified_as).toBe('unknown');
    });

    it('classifies "344" (numeric noise) as unknown', () => {
      const r = classifyEntity({ name: '344' });
      expect(r.classified_as).toBe('unknown');
    });

    it('returns unknown with zero confidence for an empty input', () => {
      const r = classifyEntity({ name: '' });
      expect(r.classified_as).toBe('unknown');
      expect(r.confidence).toBe(0);
    });
  });
});

describe('expectedKindForTargetTable', () => {
  it('maps known target_tables', () => {
    expect(expectedKindForTargetTable('personalities')).toBe('person');
    expect(expectedKindForTargetTable('venues')).toBe('venue');
    expect(expectedKindForTargetTable('events')).toBe('event');
    expect(expectedKindForTargetTable('glossary_terms')).toBe('glossary_term');
  });

  it('returns null for unmapped tables', () => {
    expect(expectedKindForTargetTable('countries')).toBeNull();
    expect(expectedKindForTargetTable(null)).toBeNull();
    expect(expectedKindForTargetTable(undefined)).toBeNull();
  });
});

describe('isEntityTypeMismatch', () => {
  it('flags a venue routed to personalities', () => {
    const cls = classifyEntity({ name: 'Sauna Tres Chic' });
    expect(isEntityTypeMismatch(cls, 'personalities')).toBe(true);
  });

  it('passes a real person routed to personalities', () => {
    const cls = classifyEntity({
      name: 'Lytton Strachey',
      birth_date: '1880-03-01',
      profession: 'biographer',
    });
    expect(isEntityTypeMismatch(cls, 'personalities')).toBe(false);
  });

  it('does not flag low-confidence rows (defaults to needs_review elsewhere)', () => {
    const cls = classifyEntity({ name: 'BN2 1TH' });
    expect(isEntityTypeMismatch(cls, 'personalities')).toBe(false);
  });

  it('does not flag rows with no target_table mapping', () => {
    const cls = classifyEntity({ name: 'Sauna Tres Chic' });
    expect(isEntityTypeMismatch(cls, 'countries')).toBe(false);
  });

  it('flags a glossary term routed to personalities', () => {
    const cls = classifyEntity({
      name: 'DILF',
      description: 'A slang term for an attractive father.',
    });
    expect(isEntityTypeMismatch(cls, 'personalities')).toBe(true);
  });
});

// --- nested NormalizedItem shape (regression, 2026-08-21) --------------------
// Mirrors supabase/functions/_tests/entity-classifier.test.ts. Every `source-*`
// adapter emits `location.{address,lat,lng}` rather than flat fields, and
// pipeline-validate passes normalized_data straight in. Measured on production
// ingestion_staging: 38,126 of 39,002 venue rows nested it, 790 were flat — so
// the classifier scored ~98% of venue rows with no address and no geo.
describe('nested location shape', () => {
  it('reads location.{address,lat,lng}', () => {
    const cls = classifyEntity({
      name: 'Tom Bar',
      location: {
        address: '1 Crucifix Hill, Floriana',
        city: 'Valletta',
        lat: 35.89335,
        lng: 14.50576,
      },
    });
    expect(cls.classified_as).toBe('venue');
    expect(cls.signals).toContain('venue:has_address (+3)');
    expect(cls.signals).toContain('venue:has_geo (+2)');
  });

  it('prefers flat keys when both are present', () => {
    const cls = classifyEntity({
      name: 'Somewhere',
      address: 'Flat Street 1',
      location: { address: 'Nested Street 2' },
    });
    expect(cls.signals).toContain('venue:has_address (+3)');
  });

  it('no longer returns unknown/0 for a geo-bearing row', () => {
    const cls = classifyEntity({ name: 'Fusion', location: { lat: 41.38, lng: 2.17 } });
    expect(cls.classified_as === 'unknown' && cls.confidence === 0).toBe(false);
  });
});

// All 35 E_ENTITY_TYPE_MISMATCH rejections in the Spartacus import were real
// venues whose names are acronyms. A glossary term has no map pin.
describe('acronym venue names', () => {
  it.each([
    ['XXL', 41.2358, 1.8055],
    ['GMF', 52.52, 13.405],
    ['DYMK', 1.3521, 103.8198],
    ['AXM', 53.4808, -2.2426],
    ['SPQR', -36.8485, 174.7633],
  ])('%s with coordinates is not a glossary-term mismatch', (name, lat, lng) => {
    const cls = classifyEntity({ name: name as string, location: { lat, lng } });
    expect(isEntityTypeMismatch(cls, 'venues')).toBe(false);
  });

  it('geo alone beats the name-shape rule', () => {
    const cls = classifyEntity({ name: 'IDM', location: { lat: 48.8717, lng: 2.3522 } });
    expect(cls.classified_as).not.toBe('glossary_term');
  });

  it('still classifies a real glossary term', () => {
    expect(classifyEntity({ name: 'AFAB' }).classified_as).toBe('glossary_term');
    expect(
      classifyEntity({ name: 'twink', description: 'A slang term for a young gay man.' })
        .classified_as,
    ).toBe('glossary_term');
  });

  it('null island does not count as a location', () => {
    expect(classifyEntity({ name: 'AFAB', location: { lat: 0, lng: 0 } }).classified_as).toBe(
      'glossary_term',
    );
  });
});

// Mirrors supabase/functions/_tests/entity-classifier.test.ts. NormalizedItem
// puts event dates at `dates.{start,end}`, not flat start_date/end_date — 2,110
// real events scored `venue` and were hard-rejected because no has_event_dates
// fired while the event's own address counted as VENUE evidence.
describe('nested event dates', () => {
  it('reads dates.{start,end}', () => {
    const cls = classifyEntity({
      name: "Dine 'N' Drag Dinner Show",
      dates: { start: '2026-06-06T03:00:00Z', end: '2026-06-06T04:20:00Z' },
      location: {
        lat: 36.11504,
        lng: -115.13013,
        city: 'Las Vegas',
        address: '1700 E Flamingo Rd',
      },
    });
    expect(cls.classified_as).toBe('event');
    expect(isEntityTypeMismatch(cls, 'events')).toBe(false);
  });

  it('an event at a venue address is not a venue', () => {
    const cls = classifyEntity({
      name: 'Drag Brunch at The Eagle Bar',
      dates: { start: '2026-07-01T12:00:00Z' },
      location: { address: '100 Main St', lat: 40.7, lng: -74.0 },
    });
    expect(cls.classified_as).toBe('event');
    expect(cls.signals.some((s: string) => s.startsWith('venue:has_address'))).toBe(false);
  });

  it('a venue with an address and no dates is still a venue', () => {
    const cls = classifyEntity({
      name: 'The Eagle Bar',
      location: { address: '100 Main St', lat: 40.7, lng: -74.0 },
    });
    expect(cls.classified_as).toBe('venue');
  });

  it('flat start_date still wins over nested dates', () => {
    const cls = classifyEntity({
      name: 'Thing',
      start_date: '2026-01-01',
      dates: { start: '2030-12-31' },
    });
    expect(cls.classified_as).toBe('event');
  });
});
