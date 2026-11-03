import { describe, it, expect } from 'vitest';
import { venueClosureLabel } from '@/lib/venueClosureLabel';

const past = '2026-01-01T00:00:00Z';

describe('venueClosureLabel', () => {
  it('a temporary closure is not labelled permanent, although closed_at is stamped', () => {
    expect(venueClosureLabel({ closure_status: 'temporarily_closed', closed_at: past })).toBe(
      'temporarily_closed',
    );
  });

  it('a presumed closure keeps its weaker label', () => {
    expect(venueClosureLabel({ closure_status: 'presumed_closed', closed_at: past })).toBe(
      'presumed_closed',
    );
  });

  it('terminal statuses read as permanently closed', () => {
    for (const s of ['permanently_closed', 'relocated', 'renamed', 'demolished']) {
      expect(venueClosureLabel({ closure_status: s, closed_at: past })).toBe('permanently_closed');
    }
  });

  it('an open venue shows no chip', () => {
    expect(venueClosureLabel({ closure_status: 'open', closed_at: null })).toBeNull();
  });

  it('without a status, falls back to closed_at as before', () => {
    expect(venueClosureLabel({ closed_at: past })).toBe('permanently_closed');
    expect(venueClosureLabel({ closed_at: '2999-01-01T00:00:00Z' })).toBeNull();
    expect(venueClosureLabel({})).toBeNull();
  });
});
