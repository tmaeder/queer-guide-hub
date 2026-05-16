import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUseMyPlaceMarks = vi.fn();

vi.mock('@/hooks/usePlaceMarks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePlaceMarks')>();
  return {
    ...actual,
    useMyPlaceMarks: () => mockUseMyPlaceMarks(),
  };
});

import { useVisitedPlaceLookup } from '../useVisitedPlaceLookup';

describe('useVisitedPlaceLookup', () => {
  it('returns empty lookup when no marks', () => {
    mockUseMyPlaceMarks.mockReturnValue({ data: [] });
    const { result } = renderHook(() => useVisitedPlaceLookup());
    expect(result.current.has('venue', 'x')).toBe(false);
    expect(result.current.getKind('venue', 'x')).toBeNull();
    expect(result.current.isEmpty).toBe(true);
  });

  it('hits on visited entries', () => {
    mockUseMyPlaceMarks.mockReturnValue({
      data: [
        { entity_type: 'venue', entity_id: 'v1', mark_type: 'visited' },
        { entity_type: 'event', entity_id: 'e1', mark_type: 'saved' },
      ],
    });
    const { result } = renderHook(() => useVisitedPlaceLookup());
    expect(result.current.has('venue', 'v1')).toBe(true);
    expect(result.current.has('event', 'e1')).toBe(true);
    expect(result.current.has('venue', 'unknown')).toBe(false);
    expect(result.current.getKind('venue', 'v1')).toBe('visited');
    expect(result.current.getKind('event', 'e1')).toBe('saved');
    expect(result.current.isEmpty).toBe(false);
  });

  it('prefers visited over saved when both exist for same entity', () => {
    mockUseMyPlaceMarks.mockReturnValue({
      data: [
        { entity_type: 'venue', entity_id: 'v1', mark_type: 'saved' },
        { entity_type: 'venue', entity_id: 'v1', mark_type: 'visited' },
      ],
    });
    const { result } = renderHook(() => useVisitedPlaceLookup());
    expect(result.current.getKind('venue', 'v1')).toBe('visited');
  });
});
