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
