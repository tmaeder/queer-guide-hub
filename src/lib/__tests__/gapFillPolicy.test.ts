import { describe, it, expect } from 'vitest';
import { fillDataGaps, isDataGap } from '../../../supabase/functions/_shared/gap-fill';
import { mergeExtractedItems } from '../../../supabase/functions/_shared/scan-merge';
import { mergeSocialLinks } from '../../../supabase/functions/pipeline-commit/social-merge';
import {
  combineDataSources,
  providerKey,
} from '../../../supabase/functions/_shared/source-combination';

describe('shared gap policy', () => {
  it('preserves false, zero and populated arrays while recursively filling gaps', () => {
    expect(
      fillDataGaps(
        { a: false, b: 0, c: '  ', d: [], e: { en: 'Hi' } },
        { a: true, b: 2, c: 'filled', d: ['x'], e: { en: 'Other', de: 'Hallo' }, empty: null },
      ),
    ).toEqual({ a: false, b: 0, c: 'filled', d: ['x'], e: { en: 'Hi', de: 'Hallo' } });
    expect(fillDataGaps({ list: [1] }, { list: [2] })).toEqual({ list: [1] });
    expect(isDataGap(0)).toBe(false);
    expect(isDataGap(false)).toBe(false);
    expect(fillDataGaps(null, { empty: null })).toBe(null);
  });
  it('does not mutate inputs or accept prototype keys', () => {
    const input = { nested: { en: 'Hello' } };
    expect(fillDataGaps(input, { nested: { de: 'Hallo' } })).toEqual({
      nested: { en: 'Hello', de: 'Hallo' },
    });
    expect(input).toEqual({ nested: { en: 'Hello' } });
    expect(fillDataGaps({}, JSON.parse('{"__proto__":{"polluted":true}}'))).toEqual({});
  });
  it('replaces empty extraction envelopes with the donor envelope and confidence', () => {
    const item = (description: unknown) => ({
      detected_type: 'venue' as const,
      fields: { name: { value: 'Club' }, description },
      raw_tags: [],
    });
    const donor = { value: 'Recovered', confidence: 0.85, source: 'provider' };
    expect(
      mergeExtractedItems([item({ value: ' ', confidence: 0.2 }), item(donor)])[0].fields
        .description,
    ).toEqual(donor);
  });
  it('retains donor evidence and conservative confidence for nested extraction fills', () => {
    const item = (value: unknown, confidence: number) => ({
      detected_type: 'venue' as const,
      fields: { name: { value: 'Club' }, contacts: { value, confidence } },
      raw_tags: [],
    });
    const merged = mergeExtractedItems([
      item({ phone: '123' }, 0.9),
      item({ email: 'a@example.org' }, 0.4),
    ])[0];
    expect(merged.fields.contacts).toMatchObject({
      value: { phone: '123', email: 'a@example.org' },
      confidence: 0.4,
    });
    expect((merged.fields.contacts as { merge_evidence?: unknown[] }).merge_evidence).toHaveLength(
      2,
    );
  });
  it('fills social keys without overwriting curated links', () => {
    expect(
      mergeSocialLinks(
        { facebook: ' ', instagram: 'https://instagram.com/current' },
        { facebook: 'https://facebook.com/new', instagram: 'https://instagram.com/other' },
      ),
    ).toEqual({ facebook: 'https://facebook.com/new', instagram: 'https://instagram.com/current' });
  });
});

describe('automated multi-source combination', () => {
  const source = (name: string, description: string, extra = {}) => ({
    source: name,
    data: { description, ...extra },
  });
  it('fills from two independent corroborating sources and records evidence', () => {
    const result = combineDataSources({}, [
      { ...source('osm', 'Recovered'), stagingId: 'a' },
      { ...source('wikidata', 'Recovered'), stagingId: 'b' },
    ]);
    expect(result.patch).toEqual({ description: 'Recovered' });
    expect(result.needsReview).toBe(false);
    expect(result.decisions[0].confidence).toBeCloseTo(0.925);
    expect(result.decisions[0].evidence).toEqual(['a', 'b']);
  });
  it('never counts duplicate provider records or aliases as independent sources', () => {
    const result = combineDataSources({}, [
      source('osm', 'Recovered'),
      source('OpenStreetMap', 'Recovered'),
    ]);
    expect(result.patch).toEqual({});
    expect(result.needsReview).toBe(true);
    expect(result.decisions[0].confidence).toBe(0.7);
    expect(providerKey('Google Places')).toBe('google');
    expect(providerKey('gpt_5')).toBe('llm');
  });
  it('keeps conflicting candidates out of automatic writes', () => {
    const result = combineDataSources({}, [
      source('google', 'A'),
      source('wikidata', 'B'),
      source('osm', 'A'),
    ]);
    expect(result.patch).toEqual({});
    expect(result.needsReview).toBe(true);
    expect(result.decisions[0].conflicts).toEqual(['wikidata']);
  });
  it('preserves populated values and ignores protected metadata and invalid URLs', () => {
    const result = combineDataSources({ description: 'Curated' }, [
      source('google', 'Other', {
        website: 'javascript:alert(1)',
        status: 'published',
        metadata: { is_admin: true },
      }),
    ]);
    expect(result.patch).toEqual({});
    expect(result.needsReview).toBe(false);
    expect(result.decisions[0].action).toBe('preserve');
  });
  it('accepts a trusted source and requires coordinate pairs', () => {
    expect(
      combineDataSources({}, [source('google', 'A', { location: { lat: 0, lng: 0 } })]).patch,
    ).toEqual({ description: 'A', location: { lat: 0, lng: 0 } });
    expect(
      combineDataSources({ location: { lat: 10 } }, [
        source('google', 'A', { location: { lat: 20, lng: 30 } }),
      ]).patch,
    ).toEqual({ description: 'A' });
  });
  it('fills nested opening-hour gaps without replacing existing days', () => {
    const result = combineDataSources({ hours: { mon: '9-17' } }, [
      source('google', 'A', { hours: { mon: '10-18', tue: '9-17' } }),
    ]);
    expect(result.patch).toMatchObject({ hours: { tue: '9-17' } });
    expect(result.patch).not.toHaveProperty('hours.mon');
  });
  it('uses latest observation per provider without confidence inflation', () => {
    const result = combineDataSources({}, [
      { ...source('osm', 'Old'), observedAt: '2026-10-01' },
      { ...source('osm', 'New'), observedAt: '2026-10-14' },
      source('wikidata', 'New'),
    ]);
    expect(result.patch).toEqual({ description: 'New' });
    expect(result.decisions[0].confidence).toBeCloseTo(0.925);
  });
});
