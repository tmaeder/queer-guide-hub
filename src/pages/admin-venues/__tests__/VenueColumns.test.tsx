/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useVenueColumns } from '../VenueColumns';

describe('useVenueColumns', () => {
  it('returns an array of column defs', () => {
    const { result } = renderHook(() => useVenueColumns());
    expect(Array.isArray(result.current)).toBe(true);
    expect(result.current.length).toBeGreaterThan(0);
  });
});
