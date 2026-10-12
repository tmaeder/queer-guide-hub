import { describe, it, expect } from 'vitest';
import { buildVenueMeta, buildVenueJsonLd } from '../VenueDetail.meta';

describe('buildVenueMeta', () => {
  it('builds meta for minimal venue', () => {
    const meta = buildVenueMeta({ id: 'v1', name: 'X', category: 'bar', slug: 'x' } as never);
    expect(meta.title).toBeTruthy();
    expect(typeof meta.canonicalPath).toBe('string');
  });
});

describe('venue community rating metadata', () => {
  it('describes a zero rating with the actual 0–5 range', () => {
    const ld = buildVenueJsonLd({ id: 'v1', name: 'X', category: 'bar', slug: 'x' } as never, {
      ratingValue: 0,
      ratingCount: 1,
    });
    expect(ld.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      worstRating: 0,
      bestRating: 5,
      ratingValue: 0,
      ratingCount: 1,
    });
  });
  it('omits an aggregate when nobody has rated the venue', () => {
    const ld = buildVenueJsonLd({ id: 'v1', name: 'X', category: 'bar', slug: 'x' } as never, {
      ratingValue: 0,
      ratingCount: 0,
    });
    expect(ld).not.toHaveProperty('aggregateRating');
  });
});
