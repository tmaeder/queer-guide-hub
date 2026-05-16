import { describe, it, expect } from 'vitest';
import { buildVenueMeta } from '../VenueDetail.meta';

describe('buildVenueMeta', () => {
  it('builds meta for minimal venue', () => {
    const meta = buildVenueMeta({ id: 'v1', name: 'X', category: 'bar', slug: 'x' } as never);
    expect(meta.title).toBeTruthy();
    expect(typeof meta.canonicalPath).toBe('string');
  });
});
