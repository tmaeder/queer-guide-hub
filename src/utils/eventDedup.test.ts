import { describe, it, expect } from 'vitest';
import { canonicalEventKey, dedupeEvents } from './eventDedup';

describe('canonicalEventKey', () => {
  it('builds key from title + day + city', () => {
    expect(
      canonicalEventKey({
        title: 'International Mr Leather',
        start_date: '2026-05-29T18:00:00Z',
        city: 'Chicago',
      }),
    ).toBe('international mr leather|2026-05-29|chicago');
  });

  it('lowercases and trims', () => {
    expect(
      canonicalEventKey({
        title: '  Horse Meat Disco  ',
        start_date: '2026-06-01T20:00:00Z',
        city: ' Berlin ',
      }),
    ).toBe('horse meat disco|2026-06-01|berlin');
  });

  it('accepts null city', () => {
    expect(
      canonicalEventKey({
        title: 'Pride Parade',
        start_date: '2026-06-28T00:00:00Z',
        city: null,
      }),
    ).toBe('pride parade|2026-06-28|');
  });

  it('returns null without title or date', () => {
    expect(canonicalEventKey({ title: null, start_date: '2026-06-01' })).toBeNull();
    expect(canonicalEventKey({ title: 'X', start_date: null })).toBeNull();
  });
});

describe('dedupeEvents', () => {
  it('collapses duplicate rows by canonical key', () => {
    const rows = [
      { id: 'a', title: 'IML', start_date: '2026-05-29T18:00:00Z', city: 'Chicago' },
      { id: 'b', title: 'iml', start_date: '2026-05-29T20:00:00Z', city: 'chicago' },
      { id: 'c', title: 'IML', start_date: '2026-05-29T22:00:00Z', city: 'Chicago, Illinois' },
    ];
    const out = dedupeEvents(rows);
    expect(out).toHaveLength(2); // "chicago" and "chicago, illinois" differ
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'c'].sort());
  });

  it('prefers featured over non-featured', () => {
    const rows = [
      { id: 'a', title: 'Party', start_date: '2026-06-01', city: 'NYC', is_featured: false },
      { id: 'b', title: 'Party', start_date: '2026-06-01', city: 'NYC', is_featured: true },
    ];
    expect(dedupeEvents(rows)).toEqual([
      { id: 'b', title: 'Party', start_date: '2026-06-01', city: 'NYC', is_featured: true },
    ]);
  });

  it('tiebreaks on earliest created_at', () => {
    const rows = [
      {
        id: 'newer',
        title: 'Party',
        start_date: '2026-06-01',
        city: 'NYC',
        created_at: '2026-05-20',
      },
      {
        id: 'older',
        title: 'Party',
        start_date: '2026-06-01',
        city: 'NYC',
        created_at: '2026-04-01',
      },
    ];
    expect(dedupeEvents(rows).map((r) => r.id)).toEqual(['older']);
  });

  it('keeps records with missing title or date', () => {
    const rows = [
      { id: 'a', title: null, start_date: '2026-06-01' },
      { id: 'b', title: 'Real', start_date: '2026-06-01', city: 'Berlin' },
    ];
    expect(dedupeEvents(rows)).toHaveLength(2);
  });

  it('preserves input order of first occurrence', () => {
    const rows = [
      { id: 'a', title: 'A', start_date: '2026-06-01', city: 'X' },
      { id: 'b', title: 'B', start_date: '2026-06-02', city: 'X' },
      { id: 'c', title: 'A', start_date: '2026-06-01', city: 'X' },
    ];
    const out = dedupeEvents(rows);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
