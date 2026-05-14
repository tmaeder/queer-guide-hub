import { describe, it, expect } from 'vitest';
import { validateSynonym, buildMeilisearchSynonymMap } from '../searchSynonyms';

describe('validateSynonym', () => {
  it('rejects empty terms', () => {
    const r = validateSynonym({ terms: [], replacements: ['x'] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/terms must contain/);
  });

  it('rejects empty replacements', () => {
    const r = validateSynonym({ terms: ['a'], replacements: [] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/replacements must contain/);
  });

  it('lowercases and trims', () => {
    const r = validateSynonym({
      terms: ['  Queer Bar  ', 'queer pub'],
      replacements: [' Gay Bar '],
    });
    expect(r.ok).toBe(true);
    expect(r.cleaned?.terms).toEqual(['queer bar', 'queer pub']);
    expect(r.cleaned?.replacements).toEqual(['gay bar']);
  });

  it('drops empty entries after trim', () => {
    const r = validateSynonym({ terms: ['a', '', '   '], replacements: ['b'] });
    expect(r.ok).toBe(true);
    expect(r.cleaned?.terms).toEqual(['a']);
  });

  it('rejects invalid locale', () => {
    const r = validateSynonym({ terms: ['a'], replacements: ['b'], locale: 'english' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/invalid locale/);
  });

  it('accepts BCP-47 locales and *', () => {
    expect(validateSynonym({ terms: ['a'], replacements: ['b'], locale: 'en' }).ok).toBe(true);
    expect(validateSynonym({ terms: ['a'], replacements: ['b'], locale: 'en-US' }).ok).toBe(true);
    expect(validateSynonym({ terms: ['a'], replacements: ['b'], locale: '*' }).ok).toBe(true);
    expect(validateSynonym({ terms: ['a'], replacements: ['b'], locale: 'EN' }).ok).toBe(false);
  });

  it('rejects too-long terms', () => {
    const long = 'a'.repeat(81);
    const r = validateSynonym({ terms: [long], replacements: ['b'] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/term too long/);
  });

  it('rejects out-of-range confidence', () => {
    const r = validateSynonym({
      terms: ['a'],
      replacements: ['b'],
      confidence_score: 1.5,
    });
    expect(r.ok).toBe(false);
  });

  it('defaults source/locale and preserves is_one_way', () => {
    const r = validateSynonym({ terms: ['a'], replacements: ['b'], is_one_way: true });
    expect(r.cleaned?.locale).toBe('*');
    expect(r.cleaned?.source).toBe('manual');
    expect(r.cleaned?.is_one_way).toBe(true);
  });
});

describe('buildMeilisearchSynonymMap', () => {
  const baseRow = {
    indexes: [],
    locale: '*',
    status: 'active',
    is_one_way: false,
  };

  it('skips non-active rows', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['a'], replacements: ['b'], status: 'pending' }],
      'venues',
    );
    expect(map).toEqual({});
  });

  it('builds two-way edges for non-one-way rows', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['queer bar'], replacements: ['gay bar', 'lgbt bar'] }],
      'venues',
    );
    expect(map['queer bar']).toEqual(['gay bar', 'lgbt bar']);
    expect(map['gay bar']).toEqual(['lgbt bar', 'queer bar']);
    expect(map['lgbt bar']).toEqual(['gay bar', 'queer bar']);
  });

  it('builds directed edges for one-way rows', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['queer bar'], replacements: ['gay bar'], is_one_way: true }],
      'venues',
    );
    expect(map['queer bar']).toEqual(['gay bar']);
    expect(map['gay bar']).toBeUndefined();
  });

  it('respects index allowlist', () => {
    const map = buildMeilisearchSynonymMap(
      [
        {
          ...baseRow,
          terms: ['a'],
          replacements: ['b'],
          indexes: ['events'],
          is_one_way: true,
        },
      ],
      'venues',
    );
    expect(map).toEqual({});
  });

  it('treats locale=* as universal', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['a'], replacements: ['b'], is_one_way: true, locale: '*' }],
      'venues',
      'de',
    );
    expect(map['a']).toEqual(['b']);
  });

  it('filters by locale when target locale is provided', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['a'], replacements: ['b'], is_one_way: true, locale: 'en' }],
      'venues',
      'de',
    );
    expect(map).toEqual({});
  });

  it('lowercases all entries', () => {
    const map = buildMeilisearchSynonymMap(
      [{ ...baseRow, terms: ['QUEER'], replacements: ['LGBT'], is_one_way: true }],
      'venues',
    );
    expect(map['queer']).toEqual(['lgbt']);
  });

  it('merges duplicates in same target', () => {
    const map = buildMeilisearchSynonymMap(
      [
        { ...baseRow, terms: ['a'], replacements: ['b'], is_one_way: true },
        { ...baseRow, terms: ['a'], replacements: ['c'], is_one_way: true },
      ],
      'venues',
    );
    expect(map['a']).toEqual(['b', 'c']);
  });
});
