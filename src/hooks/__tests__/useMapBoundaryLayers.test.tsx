/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapBoundaryLayers } from '../useMapBoundaryLayers';

describe('useMapBoundaryLayers', () => {
  it('returns shape', () => {
    const { result } = renderHook(() =>
      useMapBoundaryLayers({
        map: null,
        mapReady: false,
        config: { key: 'countries', entityType: 'country', matchKey: 'ISO_A2', matchMode: 'code' },
        boundaries: undefined,
        markers: [],
        enabled: false,
        tooltipEl: null,
        onPopup: vi.fn(),
      }),
    );
    expect(result.current).toBeDefined();
  });
});
