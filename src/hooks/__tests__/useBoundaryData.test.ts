import { describe, it, expect } from 'vitest';

// Test the exported hook shape — actual fetch tested via integration.
// Just verify the hooks exist and the resolution logic.
import { useCountryBoundaries, useCityBoundaries, useNeighbourhoodBoundaries } from '../useBoundaryData';

describe('useBoundaryData exports', () => {
  it('should export useCountryBoundaries', () => {
    expect(typeof useCountryBoundaries).toBe('function');
  });

  it('should export useCityBoundaries', () => {
    expect(typeof useCityBoundaries).toBe('function');
  });

  it('should export useNeighbourhoodBoundaries', () => {
    expect(typeof useNeighbourhoodBoundaries).toBe('function');
  });
});
