import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSDGData } from '../useSDGData';

describe('useSDGData', () => {
  it('should return empty data for null country', () => {
    const { result } = renderHook(() => useSDGData(null));
    expect(result.current.hasData).toBe(false);
    expect(result.current.goals).toEqual({});
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('should return hasData false when no sdg_last_synced_at', () => {
    const { result } = renderHook(() => useSDGData({ sdg_data: { '1': { value: 5 } } }));
    expect(result.current.hasData).toBe(false);
  });

  it('should return hasData false when all values are null', () => {
    const country = {
      sdg_last_synced_at: '2024-01-01',
      sdg_data: { '1': { value: null } },
    };
    const { result } = renderHook(() => useSDGData(country));
    expect(result.current.hasData).toBe(false);
  });

  it('should return hasData true with valid data', () => {
    const country = {
      sdg_last_synced_at: '2024-01-01',
      sdg_data: { '1': { value: 42, series: 'X', unit: '%', description: 'Test', year: 2023 } },
    };
    const { result } = renderHook(() => useSDGData(country));
    expect(result.current.hasData).toBe(true);
    expect(result.current.goals['1'].value).toBe(42);
    expect(result.current.lastSyncedAt).toBe('2024-01-01');
  });

  it('should handle missing sdg_data field', () => {
    const { result } = renderHook(() => useSDGData({}));
    expect(result.current.goals).toEqual({});
  });
});
