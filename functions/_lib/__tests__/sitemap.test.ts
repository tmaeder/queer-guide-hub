import { describe, it, expect } from 'vitest';
import { isPlaceholderString, isRowIndexable, landingMinVenues } from '../sitemap';

describe('isPlaceholderString', () => {
  it('flags the canonical placeholder forms', () => {
    expect(isPlaceholderString('untitled')).toBe(true);
    expect(isPlaceholderString('Untitled')).toBe(true);
    expect(isPlaceholderString('UNTITLED-1')).toBe(true);
    expect(isPlaceholderString('untitled-42')).toBe(true);
    expect(isPlaceholderString('')).toBe(true);
    expect(isPlaceholderString('   ')).toBe(true);
  });

  it('does not flag real names that happen to contain "untitled"', () => {
    expect(isPlaceholderString('untitled-bar-and-grill')).toBe(false);
    expect(isPlaceholderString('The Untitled Project')).toBe(false);
    expect(isPlaceholderString('Berlin')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isPlaceholderString(null)).toBe(false);
    expect(isPlaceholderString(undefined)).toBe(false);
    expect(isPlaceholderString(42)).toBe(false);
  });
});

describe('isRowIndexable', () => {
  it('honors seo_indexable=false regardless of name', () => {
    expect(isRowIndexable({ name: 'Stonewall Inn', slug: 'stonewall-inn', seo_indexable: false }))
      .toBe(false);
  });

  it('blocks placeholder names even when seo_indexable=true', () => {
    expect(isRowIndexable({ name: 'untitled-3', slug: 'untitled-3', seo_indexable: true }))
      .toBe(false);
  });

  it('blocks placeholder slugs even when name looks fine', () => {
    expect(isRowIndexable({ name: 'Real Venue', slug: 'untitled-7', seo_indexable: true }))
      .toBe(false);
  });

  it('defaults to true when seo_indexable is missing (backfill safety)', () => {
    expect(isRowIndexable({ name: 'Real Venue', slug: 'real-venue' })).toBe(true);
  });

  it('supports a custom name field (e.g. events.title)', () => {
    expect(isRowIndexable({ title: 'untitled', slug: 'untitled', seo_indexable: true }, 'title'))
      .toBe(false);
    expect(isRowIndexable({ title: 'Pride Berlin 2026', slug: 'pride-berlin-2026' }, 'title'))
      .toBe(true);
  });
});

describe('landingMinVenues', () => {
  it('falls back to default when env var is missing', () => {
    expect(landingMinVenues({})).toBe(5);
  });

  it('honors a valid numeric env override', () => {
    expect(landingMinVenues({ LANDING_MIN_VENUES: '10' })).toBe(10);
  });

  it('rejects garbage values', () => {
    expect(landingMinVenues({ LANDING_MIN_VENUES: 'oops' })).toBe(5);
    expect(landingMinVenues({ LANDING_MIN_VENUES: '0' })).toBe(5);
    expect(landingMinVenues({ LANDING_MIN_VENUES: '-3' })).toBe(5);
  });
});
