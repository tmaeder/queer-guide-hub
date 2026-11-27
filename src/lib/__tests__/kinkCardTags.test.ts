import { describe, it, expect } from 'vitest';
import { orderCardTags } from '../kinkCardTags';
import type { KinkFilterTerm } from '@/hooks/useKinkFilterTerms';

const term = (slug: string, label: string, group: 'feature' | 'kink', sort: number, pub = false) =>
  ({
    slug,
    name: label,
    label,
    short_description: null,
    term_group: group,
    sort,
    applies_to: ['events', 'venues'],
    public_without_18: pub,
    event_count: 0,
    venue_count: 0,
  }) as KinkFilterTerm;

const TERMS = [
  term('darkroom', 'Darkroom', 'feature', 10, true),
  term('sex-swing', 'Sling', 'feature', 20),
  term('fisting', 'Fisting', 'kink', 10),
];

describe('orderCardTags', () => {
  it('puts filter terms first, features before kinks, with their labels', () => {
    expect(orderCardTags(['party', 'fisting', 'sex-swing', 'darkroom'], TERMS, true)).toEqual([
      { tag: 'darkroom', name: 'Darkroom' },
      { tag: 'sex-swing', name: 'Sling' },
      { tag: 'fisting', name: 'Fisting' },
      { tag: 'party' },
    ]);
  });

  it('drops 18+ terms without the confirmation, keeps public ones and other tags', () => {
    expect(orderCardTags(['party', 'fisting', 'darkroom', 'sex-swing'], TERMS, false)).toEqual([
      { tag: 'darkroom', name: 'Darkroom' },
      { tag: 'party' },
    ]);
  });

  it('returns tags unchanged while terms are loading', () => {
    expect(orderCardTags(['fisting', 'party'], undefined, false)).toEqual([
      { tag: 'fisting' },
      { tag: 'party' },
    ]);
  });

  it('handles missing tags', () => {
    expect(orderCardTags(null, TERMS, true)).toEqual([]);
  });
});
