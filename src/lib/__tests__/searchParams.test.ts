import { describe, expect, it } from 'vitest';
import { readSearchFilters, writeSearchFilters } from '../searchParams';

describe('search URL state', () => {
  it('restores saved filters, dates, sort and zero coordinates', () => {
    const filters = {
      types: ['event'],
      location: 'Berlin',
      categories: ['Pride'],
      cluster_ids: ['cluster-1'],
      tags: ['music'],
      target_groups: ['trans'],
      lat: 0,
      lng: 0,
      radius: 5,
      priceRange: [0, 40] as [number, number],
      dateRange: [new Date('2026-10-12'), new Date('2026-10-20')] as [Date, Date],
      free: true,
      featured: true,
    };
    const params = writeSearchFilters(' Berlin ', filters, 'date');
    expect(params.get('q')).toBe('Berlin');
    expect(params.get('sort')).toBe('date');
    expect(readSearchFilters(params)).toEqual(filters);
  });

  it('ignores invalid numeric and date ranges', () => {
    const filters = readSearchFilters(
      new URLSearchParams('lat=NaN&lng=&price_min=20&price_max=5&date_from=bad&date_to=bad'),
    );
    expect(filters.lat).toBeUndefined();
    expect(filters.lng).toBeUndefined();
    expect(filters.priceRange).toBeUndefined();
    expect(filters.dateRange).toBeUndefined();
  });
});
